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
- Near-mountain composition (S8–S11): a small flat clearing surrounded by forested, rocky foothills, with higher crests behind. 112 deterministic trees within radius 56.6, plus 44 understory saplings (1.3–3.7 units tall, 36 fir/8 pine, far-detail models) — 156 instances in one ≤160 budget. Five large framing trees (15–20 units) stand 6–21 units from the home camera. The rest stand in small mixed groves: four seeded around the walk zone, the others denser near the safe footprint and thinning toward the crests, at least 3.2 units apart, never on ground steeper than 1.1 rise per unit. 78 trees stand within 40 units of the home camera and 42 within 25. 10 near-detail instances go to the trees closest to the home camera, the rest are far-detail. LOD is fixed per tree. Saplings form patches around the walk zone and along the foothill toe, below the room sight line, off the yard and clear of trunks; `treeBatches` puts them in the same instanced far-model batches as the trees.
- Only the actual sight corridor to the room is kept clear: a trunk (5% of the height, up to 30%) or canopy (25%, above that) may stand in the corridor only above the sight line to the room's nearest roof edge or below the one to its nearest floor edge. Trunks stand outside the plot by their radius plus 0.4 and outside the walking zone plus the camera body by their radius plus 0.55; canopies may overhang the yard edge. Trees stand on `treeBase`: the lowest rendered terrain under the trunk.
- 21 debris pieces: 3 logs, 3 stumps and 15 individual rocks (each of the six rock meshes placed on its own, never the whole set). Four foreground pieces (three boulders and a stump at real scanned scale 0.55–1) sit along the lower edges of the home view; each takes the nearest legal spot around its anchor. The rest form six clumps beside the view, around the zone and on the foothill toe, 3.7–24.4 units from the camera. Each whole footprint (half the scaled XZ diagonal) stays 0.5 units outside the walking zone, 0.3 outside the plot and clear of tree trunks and other pieces; a piece in the sight corridor must stay below the floor sight line. Each piece rests on the lowest rendered terrain under its whole footprint (`footprintGround`: center, 8 half-radius and 16 rim samples), so it never floats on a slope; it is only placed where that ground varies by at most 35% of its scaled height (actual worst 0.14 units), then partly buried (logs 18–30%, stumps 8–15%, rocks 20–45% of their height).
- Before frustum culling: 8,187,422 tree triangles including saplings (previously 8,483,950 for 154 trees and 32,594,603 for 608 trees) and 301,056 ground triangles (100,352-triangle terrain drawn as three layers; previously 55,298); debris triangles depend on the per-kind mix and were not recounted. This is a geometry count, not an FPS measurement; browser/mobile FPS has not been measured.
- About 16 tree draw calls, 8 debris draw calls (log, stump, six rocks) and four terrain draws. Forest and debris instances do not add shadow passes.
- Ground and lawn now use local grass, forest-soil and rock PBR maps with world-scaled UVs and smooth transitions. See [ground-materials.md](ground-materials.md) for texture licensing, download cost, resource ownership and verification.
- The clear sight corridor preserves the house/PC/TV view. Trees are scenery, not camera collision obstacles.
- Terrain (`mountainHeight`) is driven by `safeDistance`, the ground distance outside the actual safe footprint: the house plot, the walk disc plus the 0.45 camera body, and a 2-unit-wide path from the disc to the nearest plot corner. It is exactly flat there and on a further 7-unit apron (breathing room around the house). Foothills then rise with a gentle toe — the first slopes begin 12.5–27 units from the origin depending on bearing — to an irregular near ridge (bearing-dependent run of about 28 units, height capped at 0.6 × run, short rocky relief), dip into a saddle, and climb to higher crests (up to about 72) from radius 48 on. Steepest radial slope is about 1.4 rise per unit; the ridge is never a vertical wall. From the home eye the terrain horizon sits 12.5–29° above level (median 23°). Heights fade back to flat between 290 and 360, so the far ground stays continuous. The first tuning (2-unit apron, 25-unit run) read as a wall in the browser and was moved out by request.
- The rendered terrain is a 224×224 `PlaneGeometry` whose grid lines are warped (`TERRAIN_AXIS`): cells are about 0.7 units around the house, under 1.8 out to radius 60, about 7 at 150 and 15 at 300. `terrainHeight` interpolates the same vertices with the same triangle diagonal, so trees and debris stand on the drawn triangles, not on the analytic surface between vertices (tested at triangle centroids and arbitrary points).
- Lowland fog (`src/lib/room/forest-fog.ts`) is an analytic height × distance mask on tree, debris and terrain materials only: up to 90% mix, full below 3 units above the ground, gone at 24, rising from 18 to 85 units of camera distance, and faded out within 20–34 units of the house so the clearing and the framing trees keep their contrast. The upper mountains, sky, house and lawn are never fogged by it. No volumetrics, transparent planes or extra passes.
- On those same materials both the lowland and the distant fog mix toward `lowFogTint`: the clock's `fogColor` pulled 70% toward a cool gray of the same luminance. A purple night horizon reads as blue-gray mist; daylight changes by less than 0.1 per channel. The sky colors and the house are untouched.
- The patch is applied through `onBeforeCompile` after three.js's `fog_vertex`/`fog_fragment` chunks and computes the world position with `instanceMatrix`, so each instance is fogged where it stands. A missing chunk throws instead of shipping an unfogged shader. Patched materials share one program cache key.
- Continuous terrain is 2,400 units wide; the camera far plane is at least 700. Scenery does not expand the home framing or target boundary.
- The yard's old geometric cone/ball trees are hidden in `/room`; garden shrubs and house parts remain. No neighbor houses are rendered.
- Source geometry stays cached across forest mounts. Instance materials are cloned (one clone per source material for debris), fogged and disposed on unmount; shared loader geometry/textures are not automatically disposed by R3F.
- Debris load failures are isolated: a local error boundary renders nothing instead of taking down the room, and Suspense shows nothing while loading, like the trees.

## Verification status

Current checks (near-mountain composition, 2026-10-27):

- RED before the terrain change: the foothill test failed (`bearing 0: 0.00` — flat until radius 135), the horizon test failed (lowest horizon −0.013 rad), and the mesh test failed on the missing `TERRAIN_AXIS`/`terrainGeometry` exports.
- `node --test tests/room/`: **133 pass**, 0 fail.
- Scoped Biome over the changed forest/debris/ground sources, renderer and tests: pass.
- Strict TypeScript of the renderers and their imported dependencies (ignored scoped config): pass.
- `pnpm build`: pass. `git diff --check`: pass.
- All three HTTP checks (`scripts/check-{room,forest,ground}-dev.mjs http://localhost:4321`): **pass** (14, 35 and 29 PASS lines), against the existing server, which listens on localhost rather than 127.0.0.1 and was not restarted.
- **No GPU proof.** One live screenshot of the first, closer tuning (a 2-unit apron) showed a wall-like slope filling most of the frame; the apron and ridge were moved out in response. The current tuning has not been seen in a browser. CPU tests prove heights, placement and mesh agreement, not how the slopes, rock blend, fog or FPS look. Visual acceptance remains with the user (Day/Sunset/Night, PC/TV return, touch controls and FPS). Planar world UVs stretch the textures on the steepest slopes by up to about 1.75× (steepest slope 1.44).

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
