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
| StylizedTextures | CreativeTrio | CC0 1.0 | wall planks, floor, roof shingles, chair leather, speaker grilles, PC panels |

### Textures (T4e)

`python3 scripts/prepare-world.py --textures` refreshes only the textures and
their credits. It reads the Drive ids in
`node_modules/.cache/world/explore/picks.tsv` (rows of the StylizedTextures
catalog CSV), checks the FAQ still states CC0, caches the 4K PNGs in
`node_modules/.cache/world/textures/`, and writes 1024 WebP color (lossy),
normal (lossless) and roughness (lossy) maps to `public/world/textures/`
with cwebp. Each map is credited under `textures` in `credits.json` with its
bytes, hash, size and source file; color maps also record their mean linear
color, which `src/lib/world/textures.ts` must match
(`tests/world/textures.test.ts`). Only Wood_Planks_001, Wood_Floor_001,
Wood_Shingles_001 and Leather_Patch_001 ship for the house (about 5.9 MB).

The gaming setup (T4g) adds Metal_Mesh_009 (speaker grilles: color, lossy
normal, roughness and a lossless opacity mask cut with alpha test) and
Stylized_Sci_fi_Metal_Panel_001 (PC case at a 0.3 m repeat; chosen over
Metal_Plates_001 because its small panel lines read as a case): about 0.4 MB,
budget 2.5 MB. The catalog has no plastic or fabric, so the desk top
(laminate, light clearcoat), powder-coated frame, satin and matte plastics,
keycaps, speaker cones and mousepad use PBR tuning plus original tileable
normal maps generated in code (`src/lib/world/normals.ts`, credited under
`original` as `setup-normals`). `SETUP_MATERIALS` in `src/lib/world/setup.ts`
maps each part to one merged draw per material.

UVs are box-projected world metres (`boxUv`), so boards stay horizontal on
every wall and shingles point down both slopes. The shader divides the color
map by its mean luminance and blends it in partly, so vertex colors keep the
pastel palette and the map only adds grain. The house shows flat materials
until the maps load (Suspense fallback). Gables are one sloped plank-textured
panel each; wall planks stop at the eave.

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
