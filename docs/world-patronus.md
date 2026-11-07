# The Elder Wand and its patronus in /world

The Elder Wand lies on the collection shelf. Click it to get a cinematic close-up and a short card. When the camera arrives, the spell plays: the wand tip lights up, silver-blue sparks trail off it, "Expecto Patronum" appears for a moment, and a ghostly silver-blue lion runs out across the living room and fades away (odd/tasks/patronus.md, T1).

Harry Potter, the Elder Wand and Expecto Patronum belong to Warner Bros. and J.K. Rowling. This is a fan tribute with no affiliation.

## Where things live

| What | File |
| --- | --- |
| Wand placement, stand, click box, accent light, spell timing, card copy (why this corner exists, the eight films, two facts) | `src/lib/world/wand.ts` |
| Close-up camera and the chase | `src/lib/world/wand-shot.ts` (uses `cinematic.ts`) |
| Spell sounds | `src/lib/world/spell-sound.ts` |
| Patronus path and timing | `src/lib/world/patronus.ts` |
| Wand, stand, lights, tip glow, sparks, click target | `src/components/world/Wand.tsx` |
| Ghost material, lion loader, particles | `src/components/world/Patronus.tsx` |
| Card and the "Expecto Patronum" words | `src/components/world/WandCard.tsx`, `wand-card.css` |
| Wand mesh | `scripts/prepare-wand.mjs` → `public/world/models/elder-wand.glb` |
| Lion mesh | `scripts/prepare-patronus.mjs` → `public/world/models/patronus-lion.glb` |

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
| 0.9 to 7.9 | The patronus runs |
| 3.6 to 5 | The glow settles to a faint ember |

With reduced motion, the tip glows without changing, there are no particles and no patronus, and the words show without animation.

## The chase (T2)

On every cast, the camera leaves the close-up so the run can be seen. The times below are seconds of the spell.

| Time (s) | Camera |
| --- | --- |
| 0.8 to 2.0 | Eases out (the shared quintic move) to the wide view |
| 2.0 to 7.9 | Follows the patronus. The aim takes 45% of its offset, averaged over the last 0.6 s. The eye drifts 12% of it, level |
| 7.9 to 9.4 | Eases back to the close-up |

The wide view is built from the run's bounding box (`chaseWideView`). The eye is high in the room's front east corner, 35° down and 50° off +z, as close as fits the box with a 4% margin. It never goes past 15 cm inside the walls. At 16:9 it sits at (3.79, 2.88, 1.35) and looks at (1.47, 0.76, -0.59), fov 48. Narrow screens stop at the same wall, and the tracking keeps the patronus in view.

The view turns at most 1.33 rad/s on the way out, 0.16 rad/s while tracking and 1.31 rad/s on the way back.

With reduced motion, the camera cuts to the wide view and holds still, then cuts back at 7.9 s.

While the camera chases, the card fades to 8% opacity. Hovering or keyboard focus brings it back, and it fully returns at 7.9 s. Back to room or Esc cancels the chase, and the camera eases to the room from wherever it was.

## The sounds (T3)

Three local CC0 samples replace the procedural tones. Nothing is requested until the visitor clicks the wand or Cast again. OGG is preferred, MP3 is the fallback. A recast fades and stops the previous sounds.

| Time (s) | Sample and source |
| --- | --- |
| 0 | Swish from [Air whoosh by pyranostudios](https://opengameart.org/content/air-whoosh), trimmed to 0.65 s |
| 0.9 | Burst from [Magic Spell SFX by JaggedStone](https://opengameart.org/content/magic-spell-sfx), `magical_4.ogg` |
| 0.9 to 7.9 | Quiet, slowed and low-pass-filtered `magical_7_0.ogg` from the same pack, looping with a pan and dissolve fade |

Run `node scripts/prepare-spell-sounds.mjs` to fetch the pinned source bytes into a fresh repository cache directory and convert with ffmpeg. The script checks each source SHA-256 before processing. Outputs, hashes, license evidence and authors are in `public/world/audio/spell/manifest.json`; the authors and source links also appear in the menu's sound credits. Each codec file is under 30 KB.

The spoken "Expecto Patronum" is a 3.5 s clip from the Harry Potter films (Warner Bros.), trimmed past its lead-in whoosh by `scripts/prepare-spell-voice.mjs` (pinned source hash) into `public/world/audio/spell/voice.mp3`, 42 KB. It starts as the tip lights. The owner chose to ship it as a fan tribute and accepts the copyright risk; it is credited in the menu. To remove it, set `SPELL_VOICE` to `null` in `spell-sound.ts` and delete the file.

## Flowing light and mist (T3, T4)

`patronus-fx.ts` provides smooth formation, stream and dissolve envelopes. `PatronusFx.tsx` draws four thin light filaments from the actual wand tip to the lion's chest, so a beam links the wand and the patronus while it forms and runs off (until about 2.8 s). The earlier blotchy blue aura is gone: the glow is the silver rim, fine trailing wisps and a faint mist. The lion's material uses metre-scale moving light bands and a soft Fresnel rim; the previous rapid flicker and scale-dependent glitter are removed. Larger, dimmer soft particles supply mist around the body, while fine sparks drift upward at the end. Surface particles sample the animated skin, not the undeformed mesh. Particle pools are bounded and disposed on unmount. Reduced motion keeps its existing static tip glow without particles or the lion.

## The patronus

The ghost material is additive and translucent. Its Fresnel rim and slowly moving internal light dissolve smoothly by noise, without a strobe. Wisps trail off the body and burst out as it dissolves. A faint light follows it across the floor.

The body is Walter Araujo's "Lion run". It is 0.7 m tall to the top of its head, about the size of a big dog, drawn in the ghost material with smooth recomputed normals, facing +z as authored. Its one clip ("rig|run") is a single 0.4 s in-place gallop stride with no root motion; it loops at `PATRONUS.gait` (0.45, about 0.9 s per stride), sampled from the spell clock so every cast starts on the same stride.

It runs about 7 m in 7 s, along a Catmull-Rom curve through these points. All points after the second are at floor level, y = 0.19:

`tip → (-0.35, 0.75, 0.62) → (0.35, 0.72) → (1.2, 0.42) → (1.55, -0.45) → (1.7, -1.3) → (2.1, -1.87) → (2.9, -1.88) → (3.5, -1.86) → (3.7, -1.5)`

That route leaps off the shelf, passes in front of the display cases, goes around the sofa's west end, runs between the coffee table and the TV stand, and dissolves near the right sofa lamp. A test keeps it 15 cm clear of the furniture and the cases.

## The lion

"Lion run" by Walter Araujo (https://sketchfab.com/walteraraujo), https://sketchfab.com/3d-models/lion-run-1e846f8989b44d26874e2482e0f90876, CC BY 4.0. It replaced keh's "Lion" (patronus T7), whose only clip was a pounce rather than a run.

| | Value |
| --- | --- |
| Source | `lion_run.glb` from Sketchfab: 5,350,248 bytes, sha256 `0f0d8702…7c2d`, 19,154 triangles, 37 joints, clip "rig\|run" (0.4 s) |
| Shipped | 78,136 bytes, about 9,570 triangles. Texture, UVs and flat normals dropped so the vertices weld, then simplified to about half and meshopt-compressed |

To rebuild it, copy the download to a fresh cache directory, then run:

`GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1> node scripts/prepare-patronus.mjs <copy>/lion.glb`

The script checks the pinned sha256. It writes an intermediate `lion-ghost.glb` next to the copy, then the shipped file. The lion is credited in `public/world/credits.json`, in `gallery_files` in `scripts/prepare-world.py` and in the runtime model list in `tests/world/credits.test.ts`.
