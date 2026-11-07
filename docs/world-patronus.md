# The Elder Wand and its patronus in /world

The Elder Wand lies on the collection shelf. Click it to get a cinematic close-up and a short card. When the camera arrives, the spell plays: the wand tip lights up, silver-blue sparks trail off it, "Expecto Patronum" appears for a moment, and a ghostly silver-blue lion runs out across the living room and fades away (odd/tasks/patronus.md, T1).

Harry Potter, the Elder Wand and Expecto Patronum belong to Warner Bros. and J.K. Rowling. This is a fan tribute with no affiliation.

## Where things live

| What | File |
| --- | --- |
| Wand placement, stand, click box, accent light, spell timing, card copy | `src/lib/world/wand.ts` |
| Close-up camera | `src/lib/world/wand-shot.ts` (uses `cinematic.ts`) |
| Patronus path and timing | `src/lib/world/patronus.ts` |
| Wand, stand, lights, tip glow, sparks, click target | `src/components/world/Wand.tsx` |
| Ghost material, placeholder body, lion loader, particles | `src/components/world/Patronus.tsx` |
| Card and the "Expecto Patronum" words | `src/components/world/WandCard.tsx`, `wand-card.css` |
| Wand mesh | `scripts/prepare-wand.mjs` → `public/world/models/elder-wand.glb` |
| Lion mesh (not shipped yet) | `scripts/prepare-patronus.mjs` → `public/world/models/patronus-lion.glb` |

The inspect id is `"wand"`. It is a desk-style id (`isDeskItemId`), so it has no collection rail and its card leads back to the room.

## The wand

| | Value |
| --- | --- |
| Source | "Elder Wand" by Heniqueish, Sketchfab, CC BY 4.0. 21,284,084 bytes, sha256 `0c1fc4f8…0c0f`, 8,040 triangles |
| Shipped | 369,404 bytes, 8,040 triangles. Geometry is meshopt-compressed and the three textures are 1024 px WebP |
| Size | 38 cm long, handle radius about 1 cm |
| Shelf spot | Eye-level board (local y 1.10), right column, centre at local x 0.29 and z 0.128, in front of the Zenit and the Samsung |
| World | Middle at (-0.762, 1.335, 0.16). Tip at (-0.762, 1.335, 0.35), toward the divider |
| Stand | Dark wood (`#3b2a20`): a 30 × 4.5 cm plate and two cradles |
| Accent light | One soft warm spot under the top board. On at night with the power. When off it stays mounted at intensity 0 |
| Click box | Covers only the wand and its stand. Its front sits 3 cm in front of the shelf's own box, so it gets the click first. It only takes clicks from inside the room (`canEnterMonitor`) |

## The close-up and the spell

The shot is 0.85 m from the wand's middle, 8° down and 15° toward the tip side, with a 30° lens. It uses the shared move: 3.8 s in, 3 s out. With the card open, the wand sits on the left and the card on the right.

The spell starts when the camera arrives, CINEMATIC.duration after the click. "Cast again" restarts it right away.

| Time (s) | What happens |
| --- | --- |
| 0 to 0.45 | The tip's emissive bead, its additive halo and a small point light ramp up |
| 0.15 to 1.5 | Silver-blue sparks trail off the tip |
| 0.35 to 2.8 | "Expecto Patronum" shows over the scene, left of the card, in italic serif |
| 0.9 to 4.5 | The patronus runs |
| 3.6 to 5 | The glow settles to a faint ember |

With reduced motion, the tip glows without changing, there are no particles and no patronus, and the words show without animation.

## The patronus

The ghost material is additive and translucent. It has a fresnel rim and flickers slightly, and it dissolves by noise. Wisps trail off the body and burst out as it dissolves. A faint light follows it across the floor.

The body is 0.9 m long and 0.55 m tall. For now it is a placeholder: a simple procedural quadruped with a gallop. Both the placeholder and the lion implement `PatronusModel` (`object`, `update`, `sample`, `dispose`), so the lion can replace it without other changes.

It runs about 7 m in 3.6 s, along a Catmull-Rom curve through these points. All points after the second are at floor level, y = 0.19:

`tip → (-0.35, 0.75, 0.62) → (0.35, 0.72) → (1.2, 0.42) → (1.55, -0.45) → (1.7, -1.3) → (2.1, -1.87) → (2.9, -1.88) → (3.5, -1.86) → (3.7, -1.5)`

That route leaps off the shelf, passes in front of the display cases, goes around the sofa's west end, runs between the coffee table and the TV stand, and dissolves near the right sofa lamp. A test keeps it 15 cm clear of the furniture and the cases.

## Adding the lion

"Lion" by keh is at https://sketchfab.com/3d-models/c14548c4ac994b9981dbd31eb049e5a7 (CC BY 4.0, 4,380 triangles, one animation). Sketchfab needs a login to download it.

1. Copy the download to a fresh cache directory. Extract it there if it is a zip.
2. Run `node scripts/prepare-patronus.mjs <file>`. It prints the file's sha256. Pin that value as `SOURCE_SHA256` in the script.
3. Run `GLTF_TRANSFORM_CLI=… node scripts/prepare-patronus.mjs <file>`. It writes `public/world/models/patronus-lion.glb`.
4. Set `PATRONUS.lion` in `src/lib/world/patronus.ts` to `"/world/models/patronus-lion.glb"`. A test checks that this matches the file.
5. Credit the lion in `public/world/credits.json`: a pack plus an asset with `sourceFiles`. Add the file to `gallery_files` in `scripts/prepare-world.py` and to the runtime model list in `tests/world/credits.test.ts`.

The lion is drawn in the ghost material. Its run clip plays through an AnimationMixer (a walk clip, or the first clip, if it has no run). It is scaled to 0.9 m and turned to face +z. Check the facing in the live scene.
