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

Guided, not free: a three-quarter view from the front right. The user can orbit
±0.6 rad, tilt between 0.8 and 1.3 rad from vertical and zoom between 22.5 and
40 m. Panning is off. "Recenter view" returns home. With reduced motion, moves
are instant and clouds stop drifting.

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
| Kenney Starter Kit 3D Platformer | Kenney | CC0 1.0 | grass tufts, clouds |

The flowers are original procedural geometry (`src/lib/world/flowers.ts`),
credited under `original` in `credits.json` with the repository's license.

Quaternius packs were not used: their pack pages say CC0, but
quaternius.com/license.html now shows the Quaternius Asset License v1.0, which
is not CC0. Decide before adding them.

## Budgets

`tests/world/budget.test.ts` reports and enforces triangles per frame (all
instances), main-pass draw calls (one per model primitive, plus sky, stars,
grass, rock and pad) and model bytes, against `BUDGET` in `models.ts`.
