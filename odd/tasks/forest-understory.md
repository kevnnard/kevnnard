# Forest-floor vegetation
Add natural low vegetation around existing trees and rocks, preserving the accepted mountain/house composition.
Branch: feat/interactive-room. Local reviewable commits only; no push/PR/merge. Use one bounded implementation worker, then proportionate checks.

## Specs
S1. "Si ya lo vi perfecto me va gustando pero quiero ahora que agreges vegetacion sobre todo cerca los arboles para dar ese dinamisimo de un bosque me gusta como va"
S2. "pero peude estar mucho mucho mejor"

## Tasks
T1 [S1-S2] gentle-ai-worker — in_progress: genuine low plant/fern vegetation in natural patches near trunk bases and rocks, grounded on existing rendered terrain, preserving safe walk/room-view clearances. Include local verified CC0 asset preparation, renderer, tests and provenance/docs as one behavior. Commit: pending.
T2 [S1-S2] parent integration — pending: read delivered diff, verify checks and resource/placement/budget seams, save local units and show preview; report actual visual/input/FPS limits. Commit: pending.

## Log
L1. Original request: "Si ya lo vi perfecto me va gustando pero quiero ahora que agreges vegetacion sobre todo cerca los arboles para dar ese dinamisimo de un bosque me gusta como va /var/folders/2g/jq6gkdpj6kx_k4qvt9c4x1580000gn/T/TemporaryItems/NSIRD_screencaptureui_rXL9rx/Screenshot\\ 2026-10-27\\ at\\ 9.33.06 PM.png pero peude estar mucho mucho mejor"
L2. Parent read supplied screenshot. User accepts current near-mountain composition; preserve HILLS.flat7/run28, actual terrain/camera/house/PC/TV and time controllers. Current floor has sparse small tree-shaped saplings, not lush undergrowth; add genuine fern/mat-like low plants concentrated at trees/rocks, not another distant-tree increase or geometry-cone shrubs.
L3. Existing scene:112trees+44saplings,10near,8.19Mtree triangles;21debris,301056terrain-layertriangles. Source assets and manifests local under public/models. No new app dependencies/runtime asset API. One or two genuine local CC0 plant models are in scope if verified provenance and bounded offline acquisition are needed; no broad research worker or unbounded downloads. Max40MB raw source acquisition per chosen plant, prefer <=2MB combined final assets, <=250k added triangles initially, instanced/static/demand rendering. These are engineering budgets, not user-requested exact counts. Keep no-plant full walk-disc/body clearance, physical house/yard clearance, consistent mesh-exact terrain grounding and readable room sight line.
L4. New technical/visual risk: item6 GPU appearance and alpha foliage not proved by CPU tests. Native assessment has repeatedly been unavailable on intended-untracked declaration; report outcome honestly. No retry of unavailable Orca/browser. Existing preview http://localhost:4321 (not127.0.0.1), leave existing server untouched. Scratch only ignored project cache. Preserve unrelated.atl/.gitignore/.pi and existing assets.
L5. Parent must receive observed RED/GREEN where meaningful, focused/public asset/placement tests, full room suite, scoped TypeScript/Biome, build/HTTP integrity, resource ownership and draw/triangle budgets. Functional tests cannot replace current rendered screenshot/visual judgment. No wind animation/new continuous render loop required by the user's use of dinamismo; visual richness/composition is the authorized goal.
