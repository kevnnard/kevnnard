# Forest environment

The house remains the interactive focal point. The surrounding scenery uses locally hosted, textured pine and fir models in a compact grouped forest, scanned forest-floor debris (fallen logs, stumps, mossy rocks), continuous ground, a strong low-lying fog plus the original distant fog, and generated mountains. No neighboring houses or fixed photographic sky are needed.

## Assets and licensing

| Asset | Source | Authors | License |
|---|---|---|---|
| Pine Tree 01, variant B | https://polyhaven.com/a/pine_tree_01 | Rob Tuytel (photography), Rico Cilliers (modeling) | CC0-1.0 |
| Fir Tree 01, variant C | https://polyhaven.com/a/fir_tree_01 | Rob Tuytel (photography), Rico Cilliers (modeling) | CC0-1.0 |
| Dead Tree Trunk 02 (logs) | https://polyhaven.com/a/dead_tree_trunk_02 | Jenelle van Heerden (photography), Rico Cilliers (processing) | CC0-1.0 |
| Tree Stump 01 | https://polyhaven.com/a/tree_stump_01 | Rob Tuytel (all) | CC0-1.0 |
| Rock Moss Set 01 (six single rocks) | https://polyhaven.com/a/rock_moss_set_01 | Kless Gyzen (all) | CC0-1.0 |

Provider terms: https://polyhaven.com/license. The asset files are CC0; website preview renders are not included in that grant. No website screenshots or preview renders are shipped.

Authors are recorded from the official `/info/{asset}` metadata. The four self-contained GLBs total **10,733,936 bytes** after the canopy-preservation fix (the original 3.25 MB versions erased most distant foliage). `public/models/forest/manifest.json` records hashes, source variants, triangle counts, authors and license links for the future credits page. There is no runtime Poly Haven API, external decoder or asset request.

## Forest-floor debris assets

`public/models/forest-debris/` holds `log.glb`, `stump.glb` and `rocks.glb` (**2,223,860 bytes** total, from 10,783,664 raw source bytes) plus a self-contained `manifest.json`: source and API URLs, authors, license, Poly Haven API terms, user agent, every source file's URL/bytes/MD5/SHA-256, real dimensions, per-mesh source and shipped triangles, source sizes and source silhouettes, and the output SHA-256.

Triangle counts come from the official 1K glTF index accessors, not website labels. The trunk page advertises 155,864 polygons; its 1K glTF holds **83,128** triangles. No LOD variants are published for these assets, so each source mesh is simplified once from the verified source.

| Model | Source triangles | Shipped triangles | Size (m) |
|---|---|---|---|
| Log | 83,128 | 20,776 | 4.05 × 1.06 × 1.06 |
| Stump | 41,046 | 24,498 | 1.43 × 0.57 × 1.59 |
| Six rocks (separate meshes) | 63,127 | 52,245 | 1.82–2.66 × 1.10–1.77 × 1.96–3.37 each |

Simplification uses a 0.0008 error bound (a fraction of mesh extent), so it stops early where removing more would change the shape; the ratios are only upper bounds. Textures are 1024px WebP and geometry is Meshopt. The asset test decodes every shipped mesh and requires its size within 1% and each of three 64² rasterized silhouettes within 3% of the source. This is a CPU silhouette proxy, not a visual or GPU test.

Rebuild (network on first run; sources cached in ignored `node_modules/.cache/forest-debris/` and reused while their MD5 matches):

```sh
python3 scripts/prepare-forest-debris.py
node --test tests/room/forest-debris-assets.test.ts
```

Set `GLTF_TRANSFORM` to an already cached glTF Transform 4.5.1 binary to avoid `pnpm dlx`; the script refuses other versions. Two consecutive runs produced byte-identical GLBs and manifest. Only asset files are downloaded; website preview renders are never fetched or shipped.

## Rebuild tree assets

From the repository root:

```sh
python3 scripts/prepare-forest.py
bash scripts/optimize-forest.sh
python3 scripts/forest-manifest.py
node --test tests/room/forest-assets.test.ts
```

Requires Python 3, pnpm and network access. The pinned glTF Transform CLI runs through `pnpm dlx`; it is not a new app dependency. Source files stay in ignored `node_modules/.cache/forest-source/`.

The original binaries contain three extremely dense variants (pine: 948,849,556 bytes; fir: 478,462,204 bytes). Even the "1K" download uses these binaries: 1K refers only to texture resolution. The preparation script extracts only the selected variant's byte ranges, verifies exact HTTP 206 ranges and lengths, and verifies source glTF/texture MD5 and byte counts. Selected ranges have recorded SHA-256 hashes; the full source binary's declared MD5 is **not** verified because the full file is not downloaded.

Near/far models use Meshopt and 1024/512px WebP textures. Near/far triangles: pine 176,393/65,436; fir 80,451/39,281. These are reduced real tree meshes, not the original yard's geometric cone trees.

Each LOD now starts directly from the verified source: pine ratios 0.04/0.015, fir 0.16/0.08, geometric error 0.001/0.002. Previously the far model was simplified again from an already aggressively reduced near model. That erased needles and branches: distant canopy vertex-projection occupancy fell to about 4%, compared with 35–54% in the sources. The geometry regression checks all four decoded models retain at least 70% of the source's occupied cells in each of three 128² projections. This is a CPU coverage proxy, not a photorealism or GPU test. Runtime URLs use `?v=canopy-2` to discard cached bare-tree models.

## Scope

- Preserve original room models, terminal/TV focus, bounded camera and shared day/night clock.
- Keep the clearing readable; scenery must not expand overview framing or camera travel.
- Fog belongs in the distance and the lowland, not around the PC, house or clearing.
- The world is finite and bounded internally; terrain extends beyond the visible cutoff.
- The public credits page is deferred by the user. Provenance is retained now.

## Scene budget and behavior

- Placement is composed around the walking camera's home view. `src/lib/room/forest-view.ts` defines the shared viewing zone (`VIEW_ZONE`), view-frame coordinates (`viewPoint`: depth toward the room, side to its right) and the room sight corridor (`hidesRoom`). The first version reserved a 16.55-radius disc around the whole house plus the entire −x/+z quadrant, which left the view empty; both were removed.
- 154 deterministic trees within radius 103.4 (forest edge 90–110). Five large framing trees (15–20 units tall) stand 6–21 units from the home camera: four trunks frame the open left of the frame and one stands at its right edge past the room; their canopies overhang the top of the frame. The rest stand in 26 irregular mixed-species clumps separated by open glades, at least 3 units apart. 10 near-detail instances go to the trees closest to the home camera (6.0–28.9 units away), 144 are far-detail. LOD is fixed per tree, not switched while moving.
- Only the actual sight corridor to the room is kept clear: a trunk (5% of the height, up to 30%) or canopy (25%, above that) may stand in the corridor only above the sight line to the room's nearest roof edge or below the one to its nearest floor edge. Trunks stand outside the plot by their radius plus 0.3 and at least 1.2 units outside the walking zone; canopies may overhang the yard edge.
- 17 debris pieces: 3 logs, 2 stumps and 12 individual rocks (each of the six rock meshes placed on its own, never the whole set). Four foreground pieces (three boulders and a stump at real scanned scale 0.55–1) sit along the lower edges of the home view, 8–10.4 units from the camera; each takes the nearest legal spot around its anchor. The rest form four clumps beside the view and around the zone, within 28.1 units of the camera. Each whole footprint (half the scaled XZ diagonal) stays 0.5 units outside the walking zone, 0.3 outside the plot and clear of tree trunks and other pieces; a piece in the sight corridor must stay below the floor sight line. Pieces sit on the terrain top and are partly buried (logs 18–30%, stumps 8–15%, rocks 20–45% of their height).
- Before frustum culling: 8,483,950 tree triangles (previously 32,594,603 for 608 trees) and 55,298 ground/mountain triangles; debris triangles depend on the per-kind mix and were not recounted. This is a geometry count, not an FPS measurement; browser/mobile FPS has not been measured.
- About 16 tree draw calls, 8 debris draw calls (log, stump, six rocks) and four terrain draws. Forest and debris instances do not add shadow passes.
- Ground and lawn now use local grass, forest-soil and rock PBR maps with world-scaled UVs and smooth transitions. See [ground-materials.md](ground-materials.md) for texture licensing, download cost, resource ownership and verification.
- The clear sight corridor preserves the house/PC/TV view. Trees are scenery, not camera collision obstacles.
- Mountains rise outside radius 135 and flatten beyond 360. The distant fog (owned by `RoomScene`) now runs 85–480 units, so the mountain bowl keeps its relief, and still follows the sky's eased day/night horizon color on the house, lawn and sky.
- Lowland fog (`src/lib/room/forest-fog.ts`) is an analytic height × distance mask on tree, debris and terrain materials only: up to 90% mix, full below 3 units above the ground, gone at 24, rising from 18 to 85 units of camera distance, and faded out within 20–34 units of the house so the clearing and the framing trees keep their contrast. The upper mountains, sky, house and lawn are never fogged by it. No volumetrics, transparent planes or extra passes.
- On those same materials both the lowland and the distant fog mix toward `lowFogTint`: the clock's `fogColor` pulled 70% toward a cool gray of the same luminance. A purple night horizon reads as blue-gray mist; daylight changes by less than 0.1 per channel. The sky colors and the house are untouched.
- The patch is applied through `onBeforeCompile` after three.js's `fog_vertex`/`fog_fragment` chunks and computes the world position with `instanceMatrix`, so each instance is fogged where it stands. A missing chunk throws instead of shipping an unfogged shader. Patched materials share one program cache key.
- Continuous terrain is 2,400 units wide; the camera far plane is at least 700. Scenery does not expand the home framing or target boundary.
- The yard's old geometric cone/ball trees are hidden in `/room`; garden shrubs and house parts remain. No neighbor houses are rendered.
- Source geometry stays cached across forest mounts. Instance materials are cloned (one clone per source material for debris), fogged and disposed on unmount; shared loader geometry/textures are not automatically disposed by R3F.
- Debris load failures are isolated: a local error boundary renders nothing instead of taking down the room, and Suspense shows nothing while loading, like the trees.

## Verification status

Current checks (close-composition correction, 2026-10-27):

- `node --test tests/room/`: **127 pass**, 0 fail.
- Scoped Biome over the forest, camera and debris sources, renderers and tests: pass.
- Strict TypeScript of the renderers and their imported dependencies (ignored scoped config): pass.
- `pnpm build`: pass.
- All three HTTP checks below: **pass** against the existing `http://localhost:4321` server, including served model/texture integrity. The initial `127.0.0.1:4321` attempts failed (`ECONNREFUSED`, exit 1): the existing server listens on localhost, not that IPv4 address. A separate dev launch refused to replace it; no existing process was stopped or forced.
- CPU projection of the home view: room spans screen x −0.03..0.68 at 16:9 and −0.13..0.80 at 4:3. At 9:16 it slightly overflows (−1.09..1.05). Rocks and a stump sit 8–10 units ahead in the foreground. 154 trees (10 near LOD), 17 debris pieces.
- Independent integration verification: **44 focused tests pass**, no severe shared-zone, footprint, shader-injection, instance-transform or resource-ownership blockers found. This was read-only and did not repeat build/HTTP checks.
- **No GPU proof.** Nobody has looked at the rendered frame, haze colour or FPS in a browser. Build, projection numbers and independent source review do not prove how it looks. Visual acceptance remains with the user (especially Day/Sunset/Night, PC/TV return, touch controls and FPS).

Earlier milestones, kept for history: 76 tests at the original forest, 86 at ground materials, 87 after the canopy fix. Each of those also passed its build, scoped Biome, room HTTP and strict TypeScript checks. The production build still shows its existing large-chunk warning.

```sh
# Development server must already be running:
node scripts/check-room-dev.mjs http://localhost:4321
node scripts/check-forest-dev.mjs http://localhost:4321
node scripts/check-ground-dev.mjs http://localhost:4321
```

The forest HTTP check verifies nested source modules (including debris and fog), transformed dependencies, all four served tree model SHA-256 hashes and the three debris GLBs at their runtime `?v=debris-1` URLs. Geometry tests decode all four actual assets with GLTFLoader and Meshopt, then assert upright unit-height grounding and unchanged quantized position arrays. A public loader texture hook skips image decoding in that Node test: it is **not** browser/GPU or appearance proof.

Historical TDD (forest and canopy milestones): both missing-asset cases failed before files were generated; three layout rules failed against empty/finite placeholders; geometry normalization failed against an identity frame. All pass with the implementation. The initial forest check chain stopped on `console` lint in the new CLI; output was changed to `process.stdout.write`, then it passed. For the later canopy fix, the new regression failed on distant pine and both fir LODs before regeneration. Job18 then passed the canopy and original geometry tests, asset integrity/budget tests, full 87-test suite, build, scoped Biome and served-model HTTP hashes. No ground, house, camera or clock changes were made.

Existing full-project typecheck remains blocked by TS5102 (`baseUrl` removed); the scoped strict check used a temporary config without that retired option. Native review assessment was unavailable because untracked files require an explicit declaration; no review approval is claimed.

Compact forest, debris and lowland fog: new layout, debris, fog and debris-asset tests failed first (608 trees; missing modules/assets; placeholder fog), then pass. The fog tests run the shipped fragment GLSL subset in JS against the tested math, run the injected vertex statements with a real `InstancedMesh`'s matrices, and patch the installed three.js standard shader. They do **not** compile the shader on a GPU.

**Needs visual review:** open `http://localhost:4321/room`. Browser automation remains unavailable; actual image decoding, appearance, haze and lowland fog density, debris appearance and burial, lighting, camera transitions on phones and FPS have not been observed. The scene still includes the original dense room geometry. Review Day, Sunset and Night plus PC/TV focus before judging the visual result.
