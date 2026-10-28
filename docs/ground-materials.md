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

## Verification limits

- The asset test checks WebP container headers, 1024×1024 dimensions, lossless normal bitstreams, SHA-256 against the manifest, provenance fields and the 12 MB budget. It does not decode pixels.
- A one-off check decoded each normal map and found zero differing values against the 8-bit source pixels. Most sources are 16-bit PNG; reducing them to 8 bits is the only precision loss.
- Color and roughness quality were not compared numerically. No browser appearance, tiling or FPS has been observed.
