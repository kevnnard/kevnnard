# Stylized house and room
Pivot the /room scene from photorealism to a cohesive stylized world with a guided camera.
Branch: feat/interactive-room. Local commits only; no push, PR or merge. Native Gentle Review skipped per user.

## Specs
S1. "bueno me gusta el bruno simon ese es le perfeccto ejemplo el de jezze asi quirero mi cadas mhabitacion el de hennrry me gusta es cuando entra al pc eso es lo que euiro cuanndo entre a la pc esos serian nuestro grandes referectes"
S2. "vdale listo si  ya tienes referencia mi cassa pero quiero andir mas cosas en mi casa acceosrtios cosas etc la camara guiuadad mejjor"
S3. "para nbo seguir danano lo que tenemos creemos otro path para todo lo nuevo leguo ya lo migramos te aprece ?"
S4. "igual daremos creditos a todos los autores lo guardamos en engggram counado estemos usandolos popara no olvidarlo dale avisae ppara revisarlo"
S5. "sis vamos amejorar esa nubes a mejor textutra y y mas , bueno revis lode mas arbustos y flotrres ya sabesssss explore para tener toda la info y todo eso al worker para que ya lo appplpique anttes de la casa vamos cone so"

## Tasks
T1 [S1-S2] parent — done: three style directions in Gentle Design (design/stylized-house/) for the house and room with added accessories, guided camera framing. Commit: pending.
T2 [S1-S2] parent — done: direction chosen (L6), plan agreed (L8).
T3 [S1-S4] gentle-ai-worker — done (02ee707, accepted L10): new /world route with a floating island in the 01-warm-baked style using CC0 stylized packs, day cycle reused, guided camera framing, credits manifest + visible credits. Commit: pending.
T3b [S5] explore then worker — done (visual pending): confirm CC0 bush/flower sources (explore), then worker improves clouds and adds bushes/flowers with credits. Commit: pending.
T3c [S5] gentle-ai-worker — done (visual pending): round procedural clouds (L12). Commit: pending.
T4 [S1-S4] pending (after T3c): cozy house and room with accessories (02-cozy-diorama) on the island.
T5 [S1] pending: enter-the-PC experience (Henry Heffernan reference).

## Log
L1. References: Bruno Simon (world style), Jesse Zhou (house and room), Henry Heffernan (entering the PC). User accepted stylized over photoreal after the 10:10 PM screenshot.
L2. User chose guided camera (Jesse-style) over free roaming. Wants more accessories and objects in the house.
L3. Keep: lazy /room, safe terminal, PC/TV focus views, day cycle and clock, controller styles. Earlier rule "no cone trees" still applies: stylization must be intentional.
L4. User mid-turn: "igual lo del cambios de dia si debemos mantenerlo eso si me gusta sea cala seal mundo" — keep the day/night cycle in whatever world is chosen.
L5. design/stylized-house/ written with three artboards: 01-warm-baked.html, 02-cozy-diorama.html, 03-night-neon.html (generated concept images, not live scenes). Awaiting user choice.
L6. User choice: "me gusta el mundo del 1 y la casa del 2" — world from 01-warm-baked (rounded low-poly, pastel, baked light, floating island) and house/room from 02-cozy-diorama (warm lamps, dense accessories, hand-painted feel). T1 done; T2 planning next.
L7. User: separate route for everything new, migrate later; cannot model well themself, wants the agent to build it with free models. Blender not installed; not needed for stage 1 (baked light optional later).
L8. Plan agreed: /world route, own code under src/components/world/ and src/lib/world/; /room untouched. Packs: KayKit (Kay Lousberg), Quaternius, Kenney (CC0, glTF); Poly Pizza mixed CC0/CC-BY. Kenney earlier returned 403: never bypass, fall back to KayKit/Quaternius.
L9. S4: credit every author, even CC0. Keep public/world/credits.json (author, asset, pack, license, source URL) updated with each asset and show credits in the UI. Engram 4023.
L10. User accepted /world first render (Screenshot 2026-10-28 11.40.08 AM): "mira esa belleza me encanta la verdad". Observed: island, trees, stones, tufts, empty pad and day controller render; clouds read as gray rocks; no bushes/flowers yet (Quaternius license excluded). Next: T4 house.
L11. Explore agent had no network tools; cancelled. Parent confirmed via GitHub API: bush = KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0@63976910ca04d16f0fc531b9c614244be8128713 addons/kaykit_city_builder_bits/Assets/gltf/bush.gltf, LICENSE.txt "License: (Creative Commons Zero, CC0)". Cloud = KenneyNL/Starter-Kit-3D-Platformer@3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0 models/cloud.glb (README "Sprites and 3D Models (CC0 licensed)"). Extra: KenneyNL/Starter-Kit-City-Builder@4535092b740b378b700efd9df9e27a631815b84a models/grass-trees.glb, grass-trees-tall.glb. No CC0 flower model found in KayKit/Kenney GitHub; flowers will be original procedural geometry (credited as original work). Medieval waterplant_A/B/C exist but are water plants.
L12. User (Screenshot 2026-10-28 11.48.43 AM, sunset): "creo que la nubes se ven cuadradas". Confirmed: Kenney cloud.glb is a rounded-cube puff, so clusters read as boxes. Fix: original procedural clouds (several overlapping smooth spheres per puff, flattened base), drop cloud.glb and its credit. Also observed: flowers barely visible at this distance.
