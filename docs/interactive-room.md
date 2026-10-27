# Interactive room (`/room`)

A browser-only 3D view of the original Blender room, linked from the static homepage
("Enter my 3D room"). The homepage itself ships no three.js code and loads no models.

## How it is built

| Piece | Path | Role |
|-------|------|------|
| Page | `src/pages/room.astro` | Full-screen shell, `client:only="react"` island, `<noscript>` link back to `/`. |
| Shell | `src/components/room/RoomApp.tsx` | WebGL check, lazy-loads the scene, view controls, Escape, loading/error fallbacks, mobile terminal. |
| Scene | `src/components/room/RoomScene.tsx` | R3F canvas, glTF models, camera transitions, TV/PC screens, wall panels. |
| Atmosphere | `src/components/room/RoomAtmosphere.tsx` | Sky dome, stars, moon, sun/moon key light, fill, accents, reflections and exposure. |
| Time controller | `src/components/room/TimeController.tsx` | Renders the chosen style: Compact console, Timeline dock, or the Orbital clock from `TimeDial.tsx`. |
| Controller settings | `src/components/room/ControllerSettings.tsx` | Style switcher (radio group in a non-modal panel). |
| Room clock | `src/components/room/useRoomClock.ts`, `src/lib/room/clock.ts` | The one shared 60× clock: auto/paused/manual, timestamp anchors. |
| Controller style | `src/lib/room/controller-style.ts` | Validated style name and its `localStorage` persistence. |
| Day cycle | `src/lib/room/day-cycle.ts` | Pure 24-hour model: phases, sky colors, light positions/colors/intensities. |
| Terminal UI | `src/components/room/Terminal.tsx` | Accessible input + log; used on the PC screen and as a mobile overlay. |
| Terminal rules | `src/lib/room/terminal.ts` | Allowlisted commands, URL validation, session history. Never evaluates input. |
| Camera math | `src/lib/room/camera.ts` | Overview framing from loaded bounds; focus framing for the PC and TV screens. |
| Content | `src/lib/room/content.ts` | Reads `src/utils/projects.json` and `experience.json`, the same data as the homepage. |

Models live in `public/models/room/{office,desk,chair,lounge}.glb` (meshopt + WebP). Each
glTF scene is rendered whole with its baked transforms — do not re-position nodes. The
meshopt decoder comes from the `meshoptimizer` package; no remote decoders, fonts or
environment maps are fetched.

## Terminal commands

`help`, `projects`, `stack`, `about`, `clear`, `open <number|name>`. `open` only follows
`http:`/`https:` links from `projects.json` and opens them with `noopener,noreferrer`;
a clickable link is also printed in case the popup is blocked.

## Behaviour and performance

- `frameloop="demand"` and DPR capped at 1.5: the canvas renders only while the camera moves.
- Camera transitions use drei `CameraControls`; with `prefers-reduced-motion` they jump instantly.
- DOM buttons ("Room overview", "PC terminal", "TV") mirror the clickable 3D screens; Esc returns to the overview.
- Under 768px wide the terminal opens as a bottom sheet instead of the small on-screen one.
- No WebGL, a load error or no JavaScript all show a link back to the static portfolio.

## Sky and time of day

- Drag the room to orbit (overview only). The mouse wheel over the room still zooms;
  the wheel **over the clock** changes the time instead and never reaches the room or page.
- The time controller has a native range input (arrows, Home/End, PageUp/PageDown) and
  Day/Sunset/Night presets in every style; the Orbital clock adds a draggable dial (noon at
  the top). It is hidden on small screens while the PC or TV is focused, so it never covers
  the terminal; the clock keeps running while hidden.

## Time controller and clock

- **Clock.** Starts at the PC's local time and runs at 60×: one simulated minute per real
  second, a full day in 24 minutes. `clock.ts` derives the hour from an anchor and
  `performance.now()` timestamps, never from tick counts, so a throttled or hidden tab
  catches up on its next callback. `useRoomClock` re-renders once per second and on
  `visibilitychange`, and clears its interval and listener on unmount.
- **Modes.** Auto runs. Pause holds the current time; Resume (Auto in Compact) continues from
  it. Any manual input (range, presets, wheel, dial drag) switches to Manual and holds auto
  until Resume. Sync to PC jumps to the current PC time and runs.
- **Reduced motion.** With `prefers-reduced-motion` the clock starts paused at the PC time
  and only runs after an explicit Resume/Auto. Turning the preference on pauses a running
  clock; turning it off never starts one.
- **Styles.** Compact console (default; corner instrument that collapses to a one-line pill,
  collapsed by default under 768px), Orbital clock (24-hour dial with phase arcs) and Timeline
  dock (bottom strip with phase bands, playhead, PC marker and next-phase countdown). The
  sliders button in each style opens the style settings; Escape closes only that panel.
  With the Timeline dock on wide screens the "Press Esc" hint moves to the top right.
- **One clock.** `RoomApp` owns the clock; styles are purely presentational, so switching
  never resets the hour, mode, pause state or anchors.
- **Persistence.** Only the style name is stored, under `localStorage["room:controller-style"]`,
  and only `compact`, `orbital` or `timeline` are accepted. Missing, invalid or blocked storage
  falls back to Compact. Time is never persisted.
- Designs: `design/day-cycle-controller/` (Compact chosen as default; Orbital and Timeline kept
  as switchable styles). Not yet verified in a browser: layout at each breakpoint, overlap with
  the PC/TV focus views, and pointer/keyboard behaviour.
- `dayCycle(hours)` in `day-cycle.ts` is the single source of truth: keyframes for sky,
  fill, accents, reflections and exposure (cosine-eased, wrapping at midnight), and
  opposite sun/moon arcs for the one shadow-casting key light. The key switches body only
  at 06:00/18:00, where its intensity is zero. Non-finite hours throw a `RangeError`;
  the scene falls back to the Day preset.
- The sky is a procedural gradient dome (ground, horizon, zenith, glow around a low sun)
  plus fixed stars and a small moon. The sky group follows the camera; nothing animates
  while idle. Time changes ease toward the new hour and request frames only until they
  settle; with `prefers-reduced-motion` they jump.
- The `RoomEnvironment` PMREM is generated once; the cycle only changes
  `scene.environmentIntensity`. Exposure and environment intensity are restored on unmount.
- No textures, HDRs, postprocessing or new dependencies. The GLB models are unchanged.
- Not yet verified in a browser: colors/brightness per phase, low-sun shadow coverage
  (shadow camera is ±5 units), and frame cost on mobile. Tune keyframes in `day-cycle.ts`
  and lights in `RoomAtmosphere.tsx`.

## Tuning

Screen centers come from the original scene (`SCREENS` in `camera.ts`); their sizes and the
wall panel positions in `RoomScene.tsx` are estimates from model bounds and should be
checked in a browser after model changes.

## Tests

```bash
pnpm test:room   # node --test tests/room/ (camera, terminal, day cycle, clock, controller style, static entry)
# With pnpm dev running (development module/dependency and asset HTTP checks):
node scripts/check-room-dev.mjs http://127.0.0.1:4321
```

The HTTP check only scans `RoomScene.tsx` imports. `RoomEnvironment` is now imported by
`RoomAtmosphere.tsx`; it remains listed in `optimizeDeps.include`.

## Development loading failures

The lazy scene dependencies are explicitly listed in `astro.config.mjs` under
`vite.optimizeDeps.include`. This prevents a first-visit dependency discovery race
that returned HTTP 504 `Outdated Optimize Dep` and rejected the scene import.
After changing dependencies or this config, reload the page to discard an already
rejected lazy import. The HTTP check above detects this failure; it does not prove
that WebGL rendering, camera framing or performance are correct.
