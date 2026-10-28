# Forest garden entrance
Design-only proposal. The current house, mountains, walk controls and live scene are unchanged.

## Original request
> mientras el va ahciendo eso podemos investigar como hacer un jardin o usa gentle-design debe estar ahi abiertopara este proejcto apra que crees una screeen sde un jardin con texturas mas relaistas de polign nose de dodne es queu las estabs sacando pero primero averiguas alli y vdepues co esa info creas el jardinf etntra buzon etc la as aun sigue iguale s adeues

## Direction
One ground-level garden screen: irregular weathered stone approach, gravel joints, planted edges, ferns at trunk/rock bases, a modest post-mounted mailbox and restrained warm path lights. Leave an unobstructed walking corridor. Integrate the garden into the existing compact forest, rather than introducing a manicured suburban lawn. Do not redesign the house; the house is for a later brief.

## Research before design
Google grounded search, official Poly Haven pages, 2026-10-27:
- https://polyhaven.com/license — assets are CC0. This is Poly Haven, NOT Poliigon. Do not apply this license claim to Poliigon.
- https://polyhaven.com/a/stone_pathway_02 — Stone Pathway 02; candidate PBR source for weathered paving.
- https://polyhaven.com/a/gravel_floor_02 — Gravel Floor 02; candidate gravel for joints and transitions.
- https://polyhaven.com/a/red_laterite_soil_stones — candidate earthy bed material; its reddish color may be inappropriate for the current forest, so prefer the project's existing forest floor initially.
- https://polyhaven.com/a/nettle_plant and https://polyhaven.com/a/weed_plant_02 — candidate low vegetation; not substitutes for horticultural species selection or the fern worker's independently verified assets.
Existing project sources: grass_ground, forrest_ground_03, rocky_terrain, rock_moss_set_01 and scanned logs/stumps. Reuse these before adding downloads.
No verified mailbox source was selected. A simple original locally modeled mailbox is a possible later implementation, not a claim that no mailbox exists anywhere.
No PBR maps/models were downloaded or integrated for this design. Search results identify candidates; final file-level license/metadata, dimensions, hashes, availability and performance must be checked before any implementation.

## Visual provenance and limits
.sources/garden-concept.jpg was generated with generate_image for this design, then embedded as a data URI in the self-contained artboard. It is NOT a Poly Haven asset, photo of the current room, live Three.js screenshot, measured lighting result, nor proof that any PBR map has been applied.
The illustration intentionally crops the building to avoid proposing a replacement house. Any wall/threshold detail in the generated illustration is contextual, not a requested architecture change.
UI follows design/system.md; photographic content is not a new UI token palette. No remote fonts, images, scripts, requests or runtime asset dependencies in the HTML.

## Later implementation, not authorized here
If this direction is chosen: map the approach to actual safe-area bounds, verify mailbox and planting footprints, preserve room sight lines and flat walking, choose metric PBR UVs and color/normal/roughness maps, test ownership and instancing budgets, and judge a real GPU screenshot. Never promise this conceptual image as the runtime result.

## Artboard
01-forest-entrance.html — Forest threshold. Tradeoff: strongest material/planting intent at human eye level; conceptual still, not a navigable 3D mockup or final material validation.
