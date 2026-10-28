# Forest environment

The house remains the interactive focal point. The surrounding scenery uses locally hosted, textured pine and fir models, continuous ground, distant fog and generated mountains. No neighboring houses or fixed photographic sky are needed.

## Assets and licensing

| Asset | Source | Authors | License |
|---|---|---|---|
| Pine Tree 01, variant B | https://polyhaven.com/a/pine_tree_01 | Rob Tuytel (photography), Rico Cilliers (modeling) | CC0-1.0 |
| Fir Tree 01, variant C | https://polyhaven.com/a/fir_tree_01 | Rob Tuytel (photography), Rico Cilliers (modeling) | CC0-1.0 |

Provider terms: https://polyhaven.com/license. The asset files are CC0; website preview renders are not included in that grant. No website screenshots or preview renders are shipped.

Authors are recorded from the official `/info/{asset}` metadata. The four self-contained GLBs total **3,245,248 bytes**. `public/models/forest/manifest.json` records hashes, source variants, triangle counts, authors and license links for the future credits page. There is no runtime Poly Haven API, external decoder or asset request.

## Rebuild assets

From the repository root:

```sh
python3 scripts/prepare-forest.py
bash scripts/optimize-forest.sh
python3 scripts/forest-manifest.py
node --test tests/room/forest-assets.test.ts
```

Requires Python 3, pnpm and network access. The pinned glTF Transform CLI runs through `pnpm dlx`; it is not a new app dependency. Source files stay in ignored `node_modules/.cache/forest-source/`.

The original binaries contain three extremely dense variants (pine: 948,849,556 bytes; fir: 478,462,204 bytes). Even the "1K" download uses these binaries: 1K refers only to texture resolution. The preparation script extracts only the selected variant's byte ranges, verifies exact HTTP 206 ranges and lengths, and verifies source glTF/texture MD5 and byte counts. Selected ranges have recorded SHA-256 hashes; the full source binary's declared MD5 is **not** verified because the full file is not downloaded.

Near/far models use Meshopt and 1024/512px WebP textures. Near/far triangles: pine 16,795/2,802; fir 11,393/1,314. These are reduced real tree meshes, not the original yard's geometric cone trees.

## Scope

- Preserve original room models, terminal/TV focus, bounded camera and shared day/night clock.
- Keep the clearing readable; scenery must not expand overview framing or camera travel.
- Fog belongs in the distance, not around the PC or house.
- The world is finite and bounded internally; terrain extends beyond the visible cutoff.
- The public credits page is deferred by the user. Provenance is retained now.

## Scene budget and behavior

- 347 deterministic trees: 10 near-detail instances, 337 far-detail instances. LOD is fixed by distance from the house, not switched while moving the camera.
- 833,742 tree triangles before frustum culling, plus 18,434 ground/mountain triangles. This is an added geometry count, not an FPS measurement.
- Four model batches, each with four primitive meshes: about 16 tree draw calls plus two terrain draws. Forest instances do not add shadow passes.
- A clear open-side approach preserves the house/PC/TV view. Trees elsewhere are scenery, not camera collision obstacles.
- Mountains rise outside radius 135 and flatten beyond 360. Fog spans 85–360 units, follows the sky's eased day/night horizon color and leaves the house clear at ordinary overview distances.
- Continuous terrain is 2,400 units wide; the camera far plane is at least 700. Scenery does not expand the home framing or target boundary.
- The yard's old geometric cone/ball trees are hidden in `/room`; garden shrubs and house parts remain. No neighbor houses are rendered.
- Source geometry stays cached across forest mounts. Instance materials are cloned and disposed on unmount; shared loader geometry/textures are not automatically disposed by R3F.

## Verification status

`pnpm test:room`: **76 pass**. Production build, scoped Biome, room HTTP checks and strict TypeScript checks of the four touched TSX modules and their imported dependencies pass. The production build retains its existing large-chunk warning.

```sh
# Development server must already be running:
node scripts/check-room-dev.mjs http://127.0.0.1:4321
node scripts/check-forest-dev.mjs http://127.0.0.1:4321
```

The forest HTTP check verifies nested source modules, transformed dependencies and all four served model SHA-256 hashes. Geometry tests decode all four actual assets with GLTFLoader and Meshopt, then assert upright unit-height grounding and unchanged quantized position arrays. A public loader texture hook skips image decoding in that Node test: it is **not** browser/GPU or appearance proof.

TDD: both missing-asset cases failed before files were generated; three layout rules failed against empty/finite placeholders; geometry normalization failed against an identity frame. All pass with the implementation. The final check chain initially stopped on `console` lint in the new CLI; output was changed to `process.stdout.write`, then the complete chain passed.

Existing full-project typecheck remains blocked by TS5102 (`baseUrl` removed); the scoped strict check used a temporary config without that retired option. Native review assessment was unavailable because untracked files require an explicit declaration; no review approval is claimed.

**Needs visual review:** open `http://127.0.0.1:4321/room`. Browser automation remains unavailable; actual image decoding, appearance, haze density, lighting, camera transitions on phones and FPS have not been observed. The scene still includes the original dense room geometry. Review Day, Sunset and Night plus PC/TV focus before judging the visual result.
