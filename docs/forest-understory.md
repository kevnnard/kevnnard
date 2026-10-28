# Forest-floor ferns

Scanned fern clumps grow in patches at trunk bases and beside rocks, stumps and logs in the near and middle ground of the home view. They fill the bare floor between the existing trees without changing the mountains, camera, house or fog.

## Asset and license

`public/models/forest-understory/ferns.glb` (**233,376 bytes**) and `manifest.json` come from [Fern 02](https://polyhaven.com/a/fern_02) by Rob Tuytel (scanning) and Rico Cilliers (modeling), Poly Haven, **CC0-1.0** ([license](https://polyhaven.com/license)). The manifest records the API URLs, `files_hash`, Poly Haven API terms, user agent, every source file's URL/bytes/MD5/SHA-256, real dimensions, per-mesh source and shipped triangles and sizes, and the output SHA-256. There are no runtime external requests and no website preview renders.

| Clump | Triangles | Source size (m, x × y × z) |
|-------|-----------|----------------------------|
| `fern_02_b` | 2,384 | 0.99 × 0.43 × 0.89 |
| `fern_02_c` | 2,248 | 0.87 × 0.35 × 0.77 |
| `fern_02_a` | 784 | 0.55 × 0.29 × 0.61 |
| `fern_02_d` | 816 | 0.57 × 0.21 × 0.59 |

- Raw sources: **2,931,365 bytes** (official 1k glTF, buffer, normal and ARM JPEGs, and the official 1k PNG diffuse and alpha maps), under the 40 MB acquisition bound.
- Geometry is **not simplified**: the shipped meshes keep all 6,232 source triangles. Fronds lose their silhouette under decimation, and the clumps are already light.
- The official glTF pairs `alphaMode: MASK` with a JPEG base color. A JPEG has no alpha channel, so that file would draw the fronds as solid cards. The prepare script merges the official PNG diffuse (RGB) and PNG alpha into one 8-bit RGBA base color with the standard library only. 15.35% of its texels pass the 0.5 cutoff. The shipped WebP base color keeps that alpha channel; the asset test checks the WebP header.
- Material kept from the source: alpha test 0.5, double-sided, not blended.

Rebuild (network on first run; sources cached in ignored `node_modules/.cache/forest-understory/` and reused while their MD5 matches):

```sh
GLTF_TRANSFORM=<cached @gltf-transform/cli 4.5.1 binary> python3 scripts/prepare-forest-understory.py
node --test tests/room/forest-understory-assets.test.ts
```

## Placement

`forestFerns()` in `src/lib/room/forest-understory.ts` is a fixed-seed pure layout. It is the same on every mount, clock tick and camera move.

- Anchors are the grown trees and debris pieces within 40 units of home, nearest first. About 20% of the trees are skipped, so the floor stays irregular. Each anchor gets one patch on one side, with an arc of 1.4–3.8 rad. Its first two clumps are the broad models at 0.6–1.2 m in the shade of the base; the rest are any model at 0.3–0.85 m. The patch is not a ring or a carpet.
- Result: **113 clumps** (44 / 42 / 18 / 9 by model), 0.32–1.16 m tall, 3.2–40.1 units from home, 45 within 20 units. Ferns stand at 72 of the 78 trees within 40 units, and at the rocks.
- Clearances: each whole footprint (half the scaled XZ diagonal) stays outside the walk disc plus the 0.45 camera body, the plot and the path (`safeDistance`), and outside every trunk, including sapling trunks. Rocks, stumps and logs keep half the footprint clear, so fronds may arch over their edge but never pass through them. In the sight corridor, ferns stay below the floor sight line. They also stay inside the light part of the lowland fog.
- Grounding: the crown base roots at the lowest rendered terrain (`terrainHeight`) within a fifth of the footprint and sinks 4–10% of its height. Most trees stand on foothill slopes. A level clump there would bury its uphill fronds and float its downhill ones. So each clump's base plane follows 70% of the local grade. The grade is capped at 0.6 rise per unit, so the lean is at most 22.7°. The gap between the terrain and that tilted plane stays within 40% of the clump height over the whole footprint.
- Budget: **220,768 triangles** before culling, with a 240,000 cap enforced during placement. The tests allow at most 250,000. That means **4 instanced draws**, one per clump model sharing one cloned material, and no shadow passes.

## Rendering

`ForestUnderstory` loads the GLB through `GLTFLoader` and Meshopt at `?v=understory-1`. It composes instance matrices with position, slope lean, yaw and uniform scale, times the clump's model frame, and never mutates the quantized geometry. The renderer clones the single leaf material once, applies the existing lowland fog to the clone and disposes it on unmount. Loader geometry and textures stay cached. If the loaded material has no texture, alpha test or double sides, it throws instead of drawing opaque cards. An error boundary then leaves an empty `forest-floor-ferns-unavailable` group, so the room keeps working. The instances are static with demand rendering: no wind, no frame loop and no new passes.

## Verification status

- Strict TDD: both new test files failed first (missing module and missing manifest/GLB), then pass. Mutants removing trunk clearance or over-tilting fail the layout tests. A mutant that only widens the anchor reach is equivalent, because the nearest-first triangle budget runs out first.
- Asset tests decode the shipped GLB with `GLTFLoader` + Meshopt. They check meshes, triangles and physical bounds (within 1%), material alpha test, double sides, a present map, embedded WebP and SHA-256. Image decoding is stubbed in Node: this is **not** browser/GPU or appearance proof.
- `scripts/check-forest-dev.mjs` also fetches both new modules and the served fern GLB. It checks bytes, SHA-256, mesh names and the MASK/double-sided material.

**Needs visual review:** alpha cutout quality, frond lighting, mip shimmer at distance, the look of leaning clumps on banks, and FPS have not been observed on a GPU. Check `http://localhost:4321/room` in Day, Sunset and Night.
