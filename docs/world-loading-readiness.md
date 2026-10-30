# World loading readiness

How `/world` reports honest preparation progress (world-entry-loader T2, S4). Source: `src/lib/world/world-loading.ts`. Tests: `tests/world/world-loading.test.ts`.

## Contract

```ts
interface WorldLoadState {
  progress: number; // 1-99 while preparing, 100 only when ready
  phase: "scene" | "assets" | "frame" | "ready";
  error: string | null;
}
```

`WorldScene` props:

- `onProgress?(state)` is called on every change. Subscribing also replays the current state.
- `onReady()` is called once, at `progress: 100`, `phase: "ready"`.

Before the lazy `WorldScene` mounts, the parent shows `INITIAL_WORLD_LOAD_STATE` (`1`, `"scene"`, no error).

## What counts

Progress counts milestones, not bytes. Each one is weighted by the files it loads and counts only once its content has committed in the scene:

| Milestone  | Phase  | Weight                             | Reported by                                   |
| ---------- | ------ | ---------------------------------- | --------------------------------------------- |
| `scene`    | scene  | 1                                  | `Preparation` mount (canvas, lights, island)  |
| `nature`   | assets | `MODEL_FILES` (10 GLB)             | `Nature` (own Suspense)                       |
| `surfaces` | assets | `TEXTURE_URLS`                     | `TexturedHouse`: the textured house replaced the flat one |
| `living`   | assets | unique `LIVING_FILES`              | textured-branch `Living`                      |
| `steam`    | assets | coffee-steam GLB                   | textured-branch `Setup` → `CoffeeSteam`       |
| `chair`    | assets | chair GLB + 4 baked maps           | textured-branch `Setup` → `BrunoChair`        |
| `compile`  | frame  | 1                                  | `gl.compileAsync(scene, camera)` resolved     |
| `frame`    | frame  | 1                                  | first main render of this scene after compile |

- Only the textured branch reports. The flat Suspense fallback (its `Setup`, `Living`, chair and steam) is replaced, so it never counts.
- Frame milestones are refused until every earlier milestone is done.
- The frame milestone listens to `scene.onAfterRender`. The listener is chained onto this canvas's scene and restored afterwards. It accepts only the default camera rendering to the screen (no render target). Shadow passes and other scenes, such as the PMREM environment, never trigger it.
- DOM embeds (terminal, portrait player), credits and music are outside the gate.

## Guarantees

- Progress is monotonic and capped at 99 until the frame milestone. It never goes back, because completed milestones are permanent.
- Cached assets commit at once, so progress jumps straight forward.
- No timers and no minimum wait. A stalled load stays below 100 for as long as it stalls.
- Errors from a loader, WebGL setup or compile set `error` to readable text and keep the last progress. Nothing promotes after that. The error is then rethrown to the parent's error boundary.
- Unmount and StrictMode's second effect run cancel the barrier. A late compile or render result is dropped, and the render hook is removed.

## Known limits

- `frame` means `renderer.render` returned for a frame drawn after the compile. It does not prove GPU completion (there is no fence) or that the browser has painted.
- No real browser or GPU frame was exercised while building this. The Node tests drive the lifecycle through mock ports (`FramePorts`).
- Within one group, progress waits for the whole group: one `useLoader` array, one commit. Per-file progress would need per-loader managers on Fiber's shared loader, which this avoids.
- Nature now has its own Suspense, so during loading the island and flat house can show before the trees. The parent's overlay covers this.

## Context loss and presentation

A mount-time `webglcontextlost` listener reports a readable failure even while assets are pending. It immediately freezes the tracker before the boundary replaces the canvas with the retry fallback; cleanup removes the listener and cancels late compile/frame work.

The scene tracker still has no timer. WorldApp separately delays visual reveal to a minimum 2.5 seconds at the user’s request. Displayed preparation never leads scene progress; it is assembly presentation rather than byte download telemetry. Errors bypass that reveal delay.
