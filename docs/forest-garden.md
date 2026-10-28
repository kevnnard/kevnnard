# Forest garden entrance

The front walk becomes a small forest garden: gravel and irregular stepping stones over the existing walk, two fern beds beside it, a post-mounted mailbox and three low path lights. The house, porch, terrain, forest, camera, clock and room interactions are unchanged.

The visual direction comes from `design/forest-garden/01-forest-entrance.html`. Its image is a generated concept, not a render target.

## Textures and license

`public/textures/garden/` holds six 1024 px WebP maps plus `manifest.json`. Both sets come from Poly Haven and are **CC0-1.0** ([license](https://polyhaven.com/license)).

| Layer | Asset | Authors | Captured size |
|-------|-------|---------|---------------|
| `stone` | [Stone Pathway 02](https://polyhaven.com/a/stone_pathway_02) | Amal Kumar | 1.95 m |
| `gravel` | [Gravel Floor 02](https://polyhaven.com/a/gravel_floor_02) | Jenelle van Heerden (processing), Dimitrios Savva (photography) | 2.0 m |

- `scripts/prepare-garden.py` follows the same steps as `scripts/prepare-ground.py`. It reads the official `/files` and `/info` API, then checks each 1K PNG (Diffuse, `nor_gl`, Rough) against the API MD5 and byte count. It then encodes once with cwebp 1.6.0: lossy sRGB color, **lossless** OpenGL normals, and lossy grayscale roughness. The manifest records the source URL, MD5, bytes, SHA-256, PNG depth and type, the encoder arguments, and the output bytes and SHA-256.
- Shipped: **5,478,554 bytes**, within the 6 MB aim.
- Raw sources: **27,787,039 bytes**. This is **above the 20 MB raw-source guidance**, and the manifest's `sourceBudgetNote` records that. The overage only affects the build step: sources stay in the ignored `node_modules/.cache/garden/` and never ship.
- There are no runtime external requests and no website preview renders.

Rebuild the textures (network access needed on the first run; cached PNGs are reused while their MD5 matches):

```sh
python3 scripts/prepare-garden.py
node --test tests/room/garden-assets.test.ts
```

The bed soil reuses the existing `forrest_ground_03` maps from `public/textures/ground/`.

## Layout

`src/lib/room/garden-layout.ts` is a pure, fixed-seed layout. It reads `house-layout.ts` and never changes it.

- **Walk surface.** Gravel sits over the walk slab (`x 5.32–6.28`, `z 4.4–8.6`) with its top at `-0.07`, 1 cm above the paving. It sits inside the slab's rim.
- **Stepping stones.** There are eight stones, each an irregular 7–9 sided outline, slightly turned and offset. Each is extruded with a 12 mm bevel; the top is at `-0.03`. They run from the porch to the street inside the walk. Stride gaps are 0.08–0.14 m, measured as the polygon distance minus both bevels; the tests allow at most 0.25 m. The porch is unchanged.
- **Beds.** The west bed is `x 4.0–5.2` and the east bed `x 6.4–8.8`, both over `z 4.6–7.75`. Forest soil sits at `-0.13`. Low stone kerbs run along the walk, porch and street sides, topping out at `-0.06`. Both beds stay clear of the walk, porch, hedges, bushes, driveway and every house part.
- **Ferns.** There are 29 clumps of the existing scanned `fern_02`: 12 in the west bed and 17 in the east. That is 13 / 3 / 7 / 6 by model, 0.16–0.64 m tall, with a 0.68 m cap. Each bed has two or three patch centres. The broad models sit at the heart of a patch, and smaller clumps at its edge. Every full footprint stays clear of the walk, porch, house parts, hedges, bushes, mailbox and lights. The forest's 113 placements are not reused; this is a separate garden layout inside the plot.
- **Mailbox.** The post stands at `x 6.62, z 7.5` in the east bed. It has an arched, rounded body and a raised red flag, and its door faces the walk (`-x`). The finish is a dark powder-coat `MeshStandardMaterial`. The geometry is modelled locally; no third-party model is used.
- **Path lights.** Three bollards, 0.42 m tall, alternate west, east and west at `z 5, 6, 7`. They stand in the 0.1 m strip between the walk and the bed kerbs.

## Lighting and rendering

`lampGlow(hours)` maps the sun elevation from `dayCycle` to a glow in [0, 1]. It is 0 while the sun is up (for example 13:00), rises through sunset (0.19 at 17:30, 0.74 at 18:00) and stays at 1 at night. It is monotonic across dusk. `RoomScene` passes its existing `hours` to `ForestGarden`, which sets the lamp heads' `emissiveIntensity` and requests one frame. There are no light objects, no shadow-casting lights, no new clock and no frame loop.

`ForestGarden` keeps these to itself:

- **Owned resources.** It owns the world-UV geometries and the cloned textures and materials, and disposes them on unmount.
- **Fern loading.** It loads the fern GLB at the same `?v=understory-1` URL as the forest, so the parsed data is shared. It clones the leaf material, keeping the alpha test and double sides. It never disposes loader geometry or textures.
- **Failure handling.** The textured path, the beds and the ferns each sit behind an error boundary with `Suspense`. If one fails, an empty `*-unavailable` group is left and the room keeps working.
- **Load order.** The mailbox and lights need no downloads, so they appear at once.

`mergeFlat` merges the few small non-indexed meshes locally. Importing `three/examples/jsm/utils/BufferGeometryUtils.js` would add a new prebundled dependency.

Budget, reported by `gardenBudget()` in the tests:

| Part | Triangles |
|------|-----------|
| Ferns (29 instances) | 48,120 |
| Stones (one geometry) | 712 |
| Mailbox (body, post, flag) | 308 |
| Bollards (3 × post + head) | 288 |
| Gravel, soil, kerbs | 98 |
| **Total** | **49,526** (cap 150,000) |

There are **12 draw calls** before shadows: gravel, stones, soil, kerbs, mailbox body, flag, bollard posts, lamp heads, and 4 fern models. Shadow casters are the stones, kerbs, mailbox and bollard posts.

## Verification status

- **Strict TDD.** Both test files failed first, on the missing module and the missing manifest, and then passed. Mutants that put a bollard on the walk, widen the stone joints, invert `lampGlow` or move the mailbox onto the walk all fail the layout tests. Raising the height cap alone does not, because the seeded targets stay below 0.66 m.
- **Asset tests.** They check CC0, the authors, the 1024 px WebP headers, the lossless normal chunk, the bytes and SHA-256 of every shipped map, the 6 MB shipped budget and the disclosed raw total.
- **HTTP check.** `scripts/check-forest-dev.mjs` also fetches both garden modules and checks the served bytes and SHA-256 of all six maps against the manifest.

**Needs visual review:** CPU tests cannot establish texture scale, stone and gravel appearance, fern density, lamp glow at night, or FPS on a GPU. Check `http://localhost:4321/room` in Day, Sunset and Night before calling the visual quality accepted.
