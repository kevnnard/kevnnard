# Ground materials

The terrain is layered as lawn → forest soil → rock. Each layer uses a locally hosted 1K PBR set: color, OpenGL normal and roughness. There are no runtime Poly Haven requests.

## Assets and licensing

| Layer | Source | Authors | Real-world size | License |
|---|---|---|---|---|
| Grass | Grass Ground — https://polyhaven.com/a/grass_ground | Charlotte Baglioni | 2.51 m | CC0-1.0 |
| Forest soil | Forest Ground 03 — https://polyhaven.com/a/forrest_ground_03 | Rob Tuytel | 2 m | CC0-1.0 |
| Rock | Rocky Terrain — https://polyhaven.com/a/rocky_terrain | Amal Kumar | 90 m (aerial capture) | CC0-1.0 |

Provider terms: https://polyhaven.com/license. The texture files are CC0; website preview renders are not part of that grant and none are used. Authors and sizes come from the official `/info/{asset}` metadata. The forest slug really is `forrest_ground_03` (double r).

`public/textures/ground/manifest.json` records, per map, the source URL, declared MD5 and byte size, source SHA-256, PNG bit depth, the exact `cwebp` arguments, dimensions, output bytes and output SHA-256, for the deferred credits page.

## Maps and color spaces

| Map | File | THREE color space | Encoding |
|---|---|---|---|
| Color | `{layer}-color.webp` | `SRGBColorSpace` | lossy, `-q 86 -m 6 -sharp_yuv` |
| Normal (OpenGL, +Y up) | `{layer}-normal.webp` | `NoColorSpace` (linear data) | lossless, `-lossless -exact -z 9` |
| Roughness | `{layer}-roughness.webp` | `NoColorSpace` (linear data) | lossy grayscale, `-q 90 -m 6` |

Normals are lossless because lossy WebP subsamples chroma (4:2:0), which would distort the X/Y vectors stored in red and green. Roughness is grayscale, so its data sits in full-resolution luma. Use OpenGL normals with THREE's default `normalScale` sign; they are not the DirectX variant.

All nine maps are 1024×1024 and total **7,912,382 bytes**; the three lossless normals account for 6,684,882 of them. 1K is a pixel size, not a byte size.

## Rebuild

From the repository root:

```sh
python3 scripts/prepare-ground.py
node --test tests/room/ground-assets.test.ts
```

Requires Python 3, `cwebp` (libwebp, verified with 1.6.0) and network access. No app dependency is added. The script reads `/files/{asset}` and `/info/{asset}`, downloads the official 1K PNG maps with an identifiable User-Agent and a 20 MB per-request bound, and rejects any MD5, byte-count, PNG-signature or dimension mismatch. Verified sources stay in ignored `node_modules/.cache/ground-source/` and are reused while their MD5 matches. A second run produced byte-identical outputs.

## Material architecture

`src/lib/room/ground-materials.ts` holds the testable rules. `src/components/room/GroundSurface.tsx` renders them.

- **World-metre UVs.** `worldUv` clones a geometry and writes `uv = (x, -z)` in world metres. Each texture repeats at `1 / size`: grass every 2.51 m, soil every 2 m and rock every 90 m, so the three layers do not tile at one shared rate. The lawn's plot box and the terrain use the same mapping, so lawn and outside grass match in scale, orientation and phase.
- **Shared shade.** `groundShade(x, z)` is a neutral 0.84–1.0 brightness from world position, with periods of about 70–260 m. `worldUv` writes it as gray RGB on the lawn, and `terrainLayers` writes it on every terrain layer. The lawn uses `lawnMaterial`: opaque, depth-writing and vertex-colored. Along the plot edge, the lawn's 4-vertex top and even an 8 m terrain grid (the rendered one is finer) interpolate the shade to within one 8-bit step (tested). Higher frequencies left a 0.013 gap.
- **Layers.** The mountain terrain is drawn three times with plain `MeshStandardMaterial`s: opaque forest soil, then grass and rock overlays (`transparent`, no depth write, small polygon offset, `renderOrder` 1 and 2). Each layer has its own RGBA vertex color, whose alpha is the layer weight. Final weights are rock, (1 − rock)·grass and (1 − rock)(1 − grass). Lighting, fog and shadow receiving work as before; ground meshes still cast no shadows.
- **Blend.** Grass fades to soil between about 20 and 46 m from the house, and leaves the foothills as they climb (gone by 4 m of height). Rock fades in between 14 and 34 m of mountain height, and on steep slopes: `1 − normal.y` from 0.14 to 0.32 (about 31°–47°), using the rendered terrain normals. On the near slopes (radius 20–70) about 22% of the surface weight is rock. A deterministic low-frequency `macroVariation` (55–200 m periods) moves both edges, and `groundShade` breaks up repetition. Vertex RGB is gray, so the photo colors are never re-tinted green.
- **Color spaces.** Color maps use `SRGBColorSpace`; normal and roughness maps use `NoColorSpace`. OpenGL normals use the default `normalScale (1, 1)`. three derives the tangent frame from screen-space UV derivatives, and `(x, -z)` is the unmirrored orientation of a plane laid flat, so +Y normals stay upright. `roughness` is 1 (the map supplies values), `metalness` 0. Anisotropy is `min(8, renderer max)`.
- **Outer ground.** The 2,400 m plane beyond the 800 m terrain uses the soil material only.
- **Loading.** Both surfaces sit in their own `Suspense`. Until the nine textures arrive they show the previous flat colors and vertex-colored mountains, then call `invalidate()` for demand rendering. Geometry, layout, camera bounds, clocks and the forest models are unchanged.

### Resource ownership

- `useLoader(TextureLoader)` textures stay cached and are never disposed by this code. Each surface clones the textures it uses and disposes only those clones and its materials on unmount. In three r186 clones of the same image with the same parameters share one GPU upload (`repeat` is not part of the cache key), so there are nine GPU textures.
- The shared unit box is never modified: the lawn renders an owned clone with world UVs and shade (positions, normals and face groups unchanged) and disposes it.
- Each terrain layer owns copies of the index, position and normal (identical values) plus its own UVs and colors. Disposing a layer never frees the mountain geometry or a sibling layer. `ForestEnvironment` alone owns and disposes the mountain geometry.
- Textured ground meshes use `dispose={null}`; their geometries and materials are disposed explicitly. The loading fallback receives the mountain geometry as a prop, which R3F never disposes; R3F still disposes the fallback's inline JSX materials.

### Cost

- Download: the nine WebP files, **7,912,382 bytes**, fetched once.
- GPU: nine 1024² RGBA8 textures with mipmaps, estimated at about 5.6 MB each (≈50 MB in total). This is an estimate, not a measurement.
- Geometry: the three terrain layers hold 1,686,672 bytes of index and vertex data, 823,360 more than sharing the mountain buffers. That is the price of independent ownership.
- Draws: the 18,432-triangle terrain is drawn three times, in place of once, plus the outer plane and the lawn top. There is no 3D grass and no new vegetation.

## Verification limits

- `tests/room/ground-assets.test.ts` checks WebP container headers, 1024×1024 dimensions, lossless normal bitstreams, SHA-256 against the manifest, provenance fields and the 12 MB budget. It does not decode pixels.
- `tests/room/ground-materials.test.ts` checks, on the CPU, layer sizes against the manifest, world-UV lawn/terrain alignment, lawn/terrain shade at shared edge points, per-layer buffer ownership, unchanged shared positions, normals and groups, blend smoothness and variation, map color spaces and clone ownership. It is not GPU, shader or appearance proof.
- A one-off check decoded each normal map and found zero differing values against the 8-bit source pixels. For normals, the 16-bit-to-8-bit reduction is the only precision loss; color and roughness also use lossy encoding.
- Parent final check chain passed: **86 tests**, strict scoped TypeScript, seven-file Biome, production build, original room and forest HTTP checks, and all nine served ground-texture SHA-256 hashes. No app dependency was added.
- Full-project TypeScript remains blocked by the existing TS5102 `baseUrl` option; the scoped config omits it. The existing production large-chunk warning remains. Native assessment was unavailable because untracked files need an explicit declaration; no review approval is claimed.
- Not observed: browser rendering, overlay depth behavior on real GPUs, tiling or seams, lawn/terrain match, night appearance and FPS (desktop or mobile).

With the dev server already running, check public loading and integrity using:

```sh
node scripts/check-ground-dev.mjs http://127.0.0.1:4321
```

This checks the transformed ground/house/forest modules, their Vite dependencies, the public manifest and all nine served WebP hashes; it does not decode images on a GPU. For visual acceptance open `http://127.0.0.1:4321/room` and review Day, Sunset and Night plus PC/TV focus. Browser automation remains unavailable, so visual acceptance is the remaining human decision.
