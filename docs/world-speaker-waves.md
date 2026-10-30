# World speaker waves (S5, S6)

When the music is actually playing, thin emerald arcs ripple out from each
shelf speaker on both sides: inward toward the other speaker and outward. They follow the ripples on the split
console artboard (`design/speaker-focus-console/02-split-console.html`).
You can see them from every camera view, not only the speaker close-up.
Music keeps playing after you leave the close-up, so the waves stay too.

| Part | Where |
| --- | --- |
| Rules, phase and geometry (pure) | `src/lib/world/speaker-waves.ts` |
| Drawing and clock | `src/components/world/SpeakerWaves.tsx` |
| Mount (once, top level of the canvas) | `src/components/world/WorldScene.tsx` |
| Tests | `tests/world/speaker-waves.test.ts` |

## When they show

The waves appear only when all of these are true:

- The player status is `playing` and `playing` is true (`SpeakerMusic.getState()`).
- The tab is visible.
- Reduced motion is off.

They stay hidden while the music is idle, loading, paused, failed, or the
tab is hidden. The waves never react to a play request that has not
started sounding yet. They only read the existing player state. They don't
read volume, range or analyser data, and they never fake audio levels.

## Shape

- Each speaker gets 3 arcs on each side. One `LineSegments` draws all 12 arcs: 1 draw
  call and 288 vertices, with no shader, particles or post-processing.
- Each arc sits 1.5 cm in front of its speaker's face (`SPEAKER_BOXES`, the
  original setup geometry). It starts at each of the speaker's two sides and
  sweeps ±50°.
- Each ring grows from 3 cm to 12 cm over 3 s, fading in and out. Its
  opacity peaks at 0.5, the artboard's ripple peak. The rings are spaced
  one third of a cycle apart. Color: the project's emerald `#10b981`.
- The arcs stay within the speaker's height, beside its inner and outer sides, and
  clear of every other setup part (tested).

## Lifecycle

- The geometry and material are created once and disposed on unmount. The
  waves never take clicks (no-op `raycast`), so the speakers' hit boxes and
  click and focus rules stay the same.
- While the waves are showing, a 24 fps interval advances the phase and
  calls the demand renderer's `invalidate`. Each step is capped at 0.25 s,
  so the phase is always finite and in `[0, 1)`. When the waves hide or
  unmount, the interval is cleared. The waves use no
  `requestAnimationFrame` or `useFrame` loop. The camera, lights, scene
  and clouds are unchanged.

Not verified here: how the waves look and perform in a real browser on a
real GPU. The tests check the rules, the geometry and the wiring only.
