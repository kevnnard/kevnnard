# Stylized house and room
Pivot the /room scene from photorealism to a cohesive stylized world with a guided camera.
Branch: feat/interactive-room. Local commits only; no push, PR or merge. Native Gentle Review skipped per user.

## Specs
S1. "bueno me gusta el bruno simon ese es le perfeccto ejemplo el de jezze asi quirero mi cadas mhabitacion el de hennrry me gusta es cuando entra al pc eso es lo que euiro cuanndo entre a la pc esos serian nuestro grandes referectes"
S2. "vdale listo si  ya tienes referencia mi cassa pero quiero andir mas cosas en mi casa acceosrtios cosas etc la camara guiuadad mejjor"
S3. "para nbo seguir danano lo que tenemos creemos otro path para todo lo nuevo leguo ya lo migramos te aprece ?"
S4. "igual daremos creditos a todos los autores lo guardamos en engggram counado estemos usandolos popara no olvidarlo dale avisae ppara revisarlo"

## Tasks
T1 [S1-S2] parent — done: three style directions in Gentle Design (design/stylized-house/) for the house and room with added accessories, guided camera framing. Commit: pending.
T2 [S1-S2] parent — done: direction chosen (L6), plan agreed (L8).
T3 [S1-S4] gentle-ai-worker — in_progress: new /world route with a floating island in the 01-warm-baked style using CC0 stylized packs, day cycle reused, guided camera framing, credits manifest + visible credits. Commit: pending.
T4 [S1-S4] pending: cozy house and room with accessories (02-cozy-diorama) on the island.
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
