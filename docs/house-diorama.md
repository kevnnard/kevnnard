# House diorama around the room

The original room now sits inside a small one-story cutaway house on a finite plot, so it
no longer floats in the sky. The room, its four GLBs, their baked transforms, the PC/TV
screens, the terminal and the day/night cycle are unchanged.

## What is built

All geometry is procedural (Three.js primitives in `HouseDiorama.tsx`); no models,
textures or kits are downloaded.

| Part | Where | Notes |
|------|-------|-------|
| Original room | x −3.46…3.47, z −3.06…3.0, height 4.74 | Open to −x and +z (the cutaway). Nothing new is placed inside it. |
| Wing | East of the room, x 3.48…9.0 | Closed walls at the room's 4.74 height, door and two windows on the front, gable roof over the wing only. |
| Entrance | Front (+z) of the wing | Door, canopy, porch and a walk to the street through a gap in the hedge. |
| Carport | East of the wing, x 9.0…13.8 | Flat roof on two posts, outlined **car** (2.5 × 5.2) and **motorcycle** (1.1 × 2.6) bays, driveway to the street. Bay names are metadata only, not visible text. |
| Patio | West, on the room's open side | Wood deck one step below the room floor, bench and table. |
| Plot | x −8.4…14.8, z −5.4…8.6 | 0.8-unit-thick grass/soil slab, low hedge on every side, six trees, eight bushes. |

The bays are reserved spaces only. The user's car and motorcycle are not specified, so no
vehicle models are shown.

Levels are kept distinct to avoid z-fighting: room floor 0, foundation top −0.005,
paving −0.08, grass −0.15, terrain bottom −0.95.

## Code

| Piece | Path | Role |
|-------|------|------|
| Layout | `src/lib/room/house-layout.ts` | Pure data: plot, parts (boxes with role and finish), roof, parking bays, plants, bounds, shadow box. |
| Scene | `src/components/room/HouseDiorama.tsx` | Renders the layout: one shared unit box, one roof prism, bay outlines, four instanced plant meshes. |
| Camera | `src/lib/room/camera.ts` | `fitView` frames the whole plot; `orbitLimits` derives user orbit limits from the layout. |

`HouseDiorama` creates its geometries and materials once and disposes them on unmount.
It adds about 35 draw calls (plus the shadow pass) and no dependencies.

## Camera limits

- The initial overview frames every plot and roof corner for the current aspect ratio.
- Orbit, zoom and pan are limited: distance 4 to 1.2 × the overview distance, polar angle
  0.2 to 1.35 rad, azimuth from +z round to just past −x (the open side), target panned
  inside `TARGET_BOUNDS` with `CameraControls.setBoundary`.
- With these limits the lowest camera stays at least 1 unit above the grass, so the
  underside of the plot is never visible. The target box stops short of the wing, and
  cameras stay on its −x side, so the camera never enters the house shell.
- The camera far plane grows with the maximum distance (at least 100).
- The PC and TV focus views use `setLookAt`, which these limits do not clamp, so they
  are unchanged. Both screen targets are inside the pan boundary.

## Lighting

The key light's shadow box (1024 map) is centered on the house and sized to its bounds,
about 25 units across instead of 10, so shadows are softer than before. The light keeps
the day-cycle direction; only its distance from the house changes. Sky, stars and moon
don't cast shadows and draw behind everything.

## Not verified

Checked by tests and HTTP loading only, not in a browser: appearance, colors against the
room, shadow quality and acne, framing on phones (the portrait overview is far away, so
the room looks small), and frame cost on mobile.

## References (not used as assets)

A first search found these low-poly kits. Inventory requests returned HTTP 403, so
nothing was downloaded and the shell was built procedurally instead.

- Kenney, Building Kit (CC0): https://kenney.nl/assets/building-kit
- Kenney, City Kit Suburban (CC0): https://kenney.nl/assets/city-kit-suburban
- Kenney, Nature Kit (CC0): https://kenney.nl/assets/nature-kit
- Quaternius, Ultimate Home Interior (license not inspected):
  https://quaternius.com/packs/ultimatehomeinterior.html

The three Kenney pack pages identify CC0. Individual archive contents, model formats and sizes were not inspected; the Quaternius archive license was not verified.

## Verification evidence

- `pnpm test:room`: 70 passing tests (49 previous, 21 added).
- `pnpm build`: successful; existing large-chunk warning remains.
- Scoped Biome: seven code/test paths pass; `git diff --check` passes.
- `node scripts/check-room-dev.mjs`: 14 HTTP checks pass on the existing dev server.
- TDD limitation: initial RED was a missing-module failure per test file, not per rule. Subsequent isolated mutation checks demonstrated layout/camera assertions fail for their matching broken rules; no browser behavior is established by these tests.
- Native review assessment unavailable: untracked files require an explicit declaration. No native approval claimed.
- Full project typecheck remains blocked by existing TS5102 (`baseUrl` removed). Layout/camera standalone strict checks pass per writer verification.
- Browser rendering, mobile usability, frame cost, shadow appearance and actual interactive camera transitions require human preview review. Camera-controls 3.1.2 `setLookAt` source readback confirms scripted focus bypasses the user distance/angle limits; this is not a browser interaction check.

Preview: `http://127.0.0.1:4321/room`. On portrait screens framing the whole plot makes the room small; use the existing PC/TV focus buttons. The camera can pass through foliage; no general mesh collision engine is implemented.
