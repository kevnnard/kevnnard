# Patronus
The Elder Wand on the collection shelf in /world; clicking it casts "Expecto Patronum": the wand tip lights up and a ghostly silver-blue lion patronus runs out across the room and fades. A story card about the owner's love of Harry Potter.

## Specs
S1. "ya lsito , ahora descargue una barita de magia modelo apra que lo agreguesmos en laguna mparte de la habitacion soy apacionado po harry poter podemos crear algo como un hechizo specto patronus nose como se sdice jaja y que salga mi patronos que sera un leon en foramto fatansma pues lejos para no hacerlo con tanta calidad que te parece eos es posible??"
S2. "busca uno liubre me meustras y yo eligjo 1" -> owner chose option 3 ("si epa ya lo vi dale si ese"): "Lion" by keh, https://sketchfab.com/3d-models/c14548c4ac994b9981dbd31eb049e5a7, CC Attribution, 4,380 triangles, 1 animation.

## Tasks
T1 [S1, S2] DONE except the real lion (placeholder until downloaded) — Wand asset + placement on the collection shelf, click shot, spell effect (tip glow, "Expecto Patronum" text), patronus effect pipeline, card, credits. The lion asset joins when the owner downloads it (Sketchfab needs login).

## Log
L1. Wand: ~/Downloads/elder_wand.glb, 21,284,084 bytes, sha256 0c1fc4f8e5ea652fe60207cf4ba1f3c35a522727b9bdd0e3d355951902671c0f; asset extras: "Elder Wand" by Heniqueish (https://sketchfab.com/Heniqueish), CC-BY-4.0, https://sketchfab.com/3d-models/elder-wand-37cee9fb76494799b743aea2fe41fd26; 1 mesh, 1 material, 3 images, 8,040 triangles. Placement: the parent chose the collection shelf (owner left it open). Harry Potter, the Elder Wand and Expecto Patronum belong to Warner Bros. / J.K. Rowling; fan tribute, no affiliation.
L2. T1 (gentle-ai-worker, 2026-11-06): elder-wand.glb shipped (369,404 bytes, sha256 ed490f43…48d4, 8,040 triangles, WebP 1024 px, meshopt) and credited with the fan-tribute note. The wand is 38 cm long, on a dark stand at the front of the eye-level board's right column. Its middle is at world (-0.762, 1.335, 0.16) and its tip at (-0.762, 1.335, 0.35). It has a night accent spot, a click box (inspect id "wand") and a cinematic shot (wand-shot.ts). Spell: tip glow, sparks, "Expecto Patronum". The patronus runs about 7 m in 3.6 s through the living room. It uses a placeholder silhouette behind PatronusModel because the lion was not in ~/Downloads; scripts/prepare-patronus.mjs is ready. The live scene has not been checked visually. Details: docs/world-patronus.md.
