# /world — stylized floating island

A new route for the stylized world (odd/tasks/stylized-house.md, T3). `/room`
is untouched; the house and room arrive in T4 on the empty pad in the middle.

## How it loads

`src/pages/world.astro` renders `WorldApp` with `client:only="react"`, like
`/room`. The homepage stays static. `WorldApp` checks WebGL, then lazy-loads
`WorldScene` (three.js, React Three Fiber), so no 3D code ships elsewhere.

| Piece | File |
| --- | --- |
| Route | `src/pages/world.astro` |
| App shell, clock, controls | `src/components/world/WorldApp.tsx` |
| Scene: sky, lights, island, models, camera | `src/components/world/WorldScene.tsx` |
| Credits dialog | `src/components/world/CreditsDialog.tsx` |
| Island shape, pad, rocky underside | `src/lib/world/island.ts` |
| Seeded layout | `src/lib/world/layout.ts` |
| Guided camera limits | `src/lib/world/camera.ts` |
| Pastel palette and light | `src/lib/world/palette.ts` |
| Model list and budgets | `src/lib/world/models.ts` |

## Day cycle

The world reuses the room's clock and day cycle read-only: `useRoomClock`,
`TimeController`, `controller-style.ts` and `dayCycle`. `worldLight(hours)`
lifts the daytime sky toward cream (pink at dawn and dusk) and keeps the night
dark, so the sun, moon and phases match `/room` exactly.

## Camera

Guided, not free: a three-quarter home view from the front right, always
targeting the house (`HOUSE_FOCUS`). The user can orbit a full 360°, tilt
between 0.35 and 1.35 rad from vertical and zoom between 4 and 40 m. Panning
is off. "Recenter view" returns home. With reduced motion, moves are instant
and clouds stop drifting.

## House cutaway

Zoom drives it, no button (`src/lib/world/cutaway.ts`). Far away the house is
whole. Below 14 m both roofs start dissolving and are gone at 8 m. Below 11 m
every wall whose outward normal faces the camera dissolves, fully at 6 m, so
the interior shows from any side. Each wall (with its trim and glass) and each
roof is its own group; the floor, plinths, porch, driveway and posts never
fade. `House.tsx` uses a 4x4 ordered-dither discard per group and hides fully
faded groups so sun and moon light enter. With reduced motion fades snap.

## Assets and credits

Run `python3 scripts/prepare-world.py` (set `GLTF_TRANSFORM` to a cached
glTF Transform 4.5.1 binary to skip `pnpm dlx`). It downloads from the packs'
official GitHub repositories at pinned commits, checks each pack's license
file says CC0, optimizes into `public/world/models/` (meshopt, WebP 256 px
textures, no simplification) and writes `public/world/credits.json`.

Every shipped model must have a credits entry: `tests/world/credits.test.ts`
fails otherwise (S4). The credits are shown in the "Credits" dialog.

| Pack | Author | License | Used for |
| --- | --- | --- | --- |
| KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | CC0 1.0 | pines, rocks, path stones |
| KayKit City Builder Bits 1.0 | Kay Lousberg | CC0 1.0 | bushes |
| Kenney Mini Arena 1.0 | Kenney, Tony Schär | CC0 1.0 | tree |
| Kenney Starter Kit 3D Platformer | Kenney | CC0 1.0 | grass tufts |

The flowers, clouds, the wooden house with its garage and the gaming setup
in its main room are original procedural geometry
(`src/lib/world/flowers.ts`, `src/lib/world/clouds.ts`,
`src/lib/world/house.ts`, `src/lib/world/setup.ts`),
credited under `original` in `credits.json` with the repository's license.

Quaternius packs were not used: their pack pages say CC0, but
quaternius.com/license.html now shows the Quaternius Asset License v1.0, which
is not CC0. Decide before adding them.

## Budgets

`tests/world/budget.test.ts` reports and enforces triangles per frame (all
instances), main-pass draw calls (one per model primitive, plus sky, stars,
grass, rock and pad) and model bytes, against `BUDGET` in `models.ts`.
