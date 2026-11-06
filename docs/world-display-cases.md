# World display cases

Three glass cases stand behind the living-room sofa in `/world`. Each one has a plinth, a brass band, five glass panes and a small fixture under the lid. The case lights only turn on at night (see [Night lighting](#night-lighting)). From the interior home view, clicking a case enters its inspection camera without changing the light. The camera looks at the model from its own level, over the sofa's backrest. The model rises 5 cm off its riser and turns slowly on the case axis, one full turn every 20 seconds, like a product turntable; when inspection ends it settles down and eases back to the front. Under reduced motion it lifts without easing and does not turn. The portfolio link and the menu hide during inspection. A case with a story (today the football helmet: Carneros DC, #32, in `src/lib/world/case-stories.ts`) shows a side card with the number, the positions on a secondary diagram, the seasons, a timeline, a muted game clip and the team link; while it is open the camera slides so the model sits left of it. "Hide story" folds the card and recentres the model. For every case, the collection rail is one compact row: the object count, the three numbered cases and "Back to room". Story media ship under `public/world/stories/`; a case without a story shows none. Clicking that focused case again switches its night lights and plays the lamp click. The inspection rail changes cases or returns to the room.

| Case | What it shows | Source | License |
| --- | --- | --- | --- |
| Left | Riddell SpeedFlex football helmet, repainted in the owner's gold and black Rams-style horn livery | [Exodusks on Sketchfab](https://sketchfab.com/3d-models/buffalo-bills-helmet-fd471344bf9c4900b8cc0f59fedb8093) ("Buffalo Bills Helmet") | CC BY 4.0 |
| Middle | Fox V1-style motocross helmet, textured with a projection bake of Fox V1 Sayak (2018, red) product photos | [Muhammad Seno Aji (senoaji) on Sketchfab](https://sketchfab.com/3d-models/fox-x-supreme-helmet-ac680d32d02b4a9cb769d29f4f545609) ("Fox X Supreme Helmet") | CC BY 4.0 (mesh); the photos' pixels are not covered |
| Right | A pair of Air Jordan 1 High in black and sail | [makoto on Sketchfab](https://sketchfab.com/3d-models/air-jordan-1-a4b434181fbb48008ad460722fd53725), redistributed by [SceneView](https://github.com/sceneview/sceneview) | CC BY 4.0 |

## Fidelity

These meshes are stand-ins that look like the real objects. They are not the owner's exact objects.

- **Football helmet:** Exodusks' recreation of a Riddell SpeedFlex, so the shell, flex panel, vents, bumpers, cage and chin strap have the real helmet's shape. It is repainted for this site in the owner's colors; it is not the owner's exact helmet (theirs is a Schutt).
  - **Livery:** a metallic gold shell with one wide, satin black Rams-style horn a side. It starts as a point on the forehead beside the flex panel, widens over the crown, sweeps down the back, passes under the ear hole and curls around it, leaving a gold channel inside the spiral. The path is redrawn after a photo of a Rams helmet ([Wikimedia Commons, "LA RAMS Helmet"](https://commons.wikimedia.org/wiki/File:LA_RAMS_Helmet.jpg)) and is a visual reference only; the photo is not shipped. The back carries a small block #32 low above the rear bumper, where NFL helmets carry the player number.
  - **Black parts:** the facemask (glossy powder coat), the bumpers, clips and chin strap, and a separate smoked black eye shield in the window between the cage's top and second bars. The shield is one curved sheet, so the blended material has no back face to sort against.
  - **Limits:** the Bills decals are removed and no NFL, team, Riddell or Schutt marks are shown. The owner's eagle decal and 18 disc are not reproduced. The interior padding is decimated to keep the file small.
- **Jordan 1:** the textures are kept as they are. The colorway is black and sail, not Black Toe.
- **Off-road helmet:** senoaji's "Fox X Supreme Helmet", a Fox V1-style shell with its peak, vents and chin bar. It stands for the owner's own Fox V1 Sayak, but the mesh is not Fox's V1 shell, so proportions differ and it is not the owner's exact helmet.
  - **Texture:** a projection bake of five studio product photos of the Fox V1 Sayak (2018, matte red) from [Motocard](https://www.motocard.com/en/helmets/fox-v1_sayak_2018_matte_red_003.aspx): left three-quarter, front, right side, back and top. The Fox marks in the photos (FOX, the Fox head, FOX V1, MX MFG CORPORATION, the DOT sticker, the Asian characters) are kept by the owner's choice. Fox and V1 belong to Fox Racing; no affiliation.
  - **Limits:** the shell is not a V1, so the graphic lands a little off where the shapes differ, most on the peak and the chin bar's sides. The photos' studio shading is baked in, softened only where highlights were clamped. Surfaces no photo sees (undersides, inside the eye port) are plain red or black. The source model's goggles are removed, and its Supreme texture is not shipped. A street helmet is not used in its place.
- **Jersey:** deferred. It will go in a frame on the wall.

## How a mesh is placed

The rules are in `src/lib/world/display-cases.ts`. `src/components/world/DisplayCases.tsx` renders them.

1. `frontYaw` turns the mesh so its front faces the room. For the football helmet, that's the facemask on the derived +x. For the off-road helmet, it's the chin bar on the derived +x. For the Jordans, it's the toes on source +z.
2. `displayModelFit` reads the mesh's bounding box and picks one uniform scale. The diagonal of its footprint must fit within `itemFit.radius`, so it stays clear of the glass at any case yaw. Its height must fit within `itemFit.height`, so it stays under the light. The footprint is then centered on the case, and the lowest point rests on the riser.
3. The case's `itemYaw` turns the item toward the center of the room.
4. Every part casts a shadow except a see-through one: `displayMeshCastsShadow` skips blended materials under 90% opacity, which today is only the football helmet's tinted eye shield.

## Night lighting

Each case is lit like a museum case, only while its switch is on at night. By day every case light is at zero, and the item looks exactly as it did before. All the numbers live in `DISPLAY_CASE` in `src/lib/world/display-cases.ts`.

- **Key spot.** A warm `SpotLight` hangs under the lid, just behind the front glass (toward the room and the inspection camera). It aims down at the item's centre, about 35 degrees off vertical, halfway between the item's rest height and its inspection lift. Its soft cone (penumbra 0.8) covers the whole item, so the rim still gets about a third of the centre's light. It casts no shadow.
- **Fill uplight.** A small, weak warm point light sits in front of the riser, below the item. At the item's centre it gives about a tenth of the key's light, so it lifts the underside without burning it.
- **LED strip.** A thin emissive line runs along the riser's front edge, and its glow follows the case level.
- **Case-local reflections.** The scene's environment is nearly off at night, which leaves metals (the gold helmet) black. Each case clones its item's standard materials and points them at the scene environment with `displayCaseEnvIntensity(level, hours)`. That is the scene's own strength by day, and `level × envBoost` at night while the case is lit. The clones belong to that case and are disposed with it; the loader's shared materials stay untouched.

The lid fixture's puck still glows with the case. Each case's switch is stored under its own `localStorage` key, and the case and its model share one level.

## Loading

The meshes load with `GLTFLoader` and the Meshopt decoder, inside their own `Suspense` boundary. The cases and their spot, fill and LED lights mount right away and stay mounted, at zero intensity while off, because a changing light count recompiles shaders. The meshes count as the `display` preparation milestone, so the `/world` loader doesn't report ready until all three meshes have committed.

## Assets and credits

The shipped files are `public/world/models/display-football-helmet.glb`, `display-offroad-helmet.glb` and `display-jordan-1.glb`. The Jordans were optimized with the cached `@gltf-transform/cli` 4.5.1, using the same flags as `scripts/prepare-world.py` with 512 px textures:

```text
optimize <source> <target> --compress meshopt --texture-compress webp --texture-size 512 --simplify false --join false --instance false --palette false
```

### Football helmet

The football helmet is derived from the signed-in Sketchfab GLB download of Exodusks' "Buffalo Bills Helmet" (25,996,688 bytes, sha256 `06429718…bccc`), kept at `node_modules/.cache/world/speedflex-bills-original.glb`. `scripts/prepare-display-football.mjs` resolves glTF Transform 4.5.1 and sharp from the cached CLI package and runs Blender 5.2 headless (`blender` on `PATH`, or `BLENDER`), so nothing is downloaded or installed:

```text
GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> node scripts/prepare-display-football.mjs
```

1. Check the source hash.
2. Paint the livery atlas (2,048 × 1,024, 2 × 2 supersampling) in azimuth and elevation around the helmet centre: u wraps the azimuth with the front at the centre and the seam at the back, v runs from the crown down to 72° below the equator. The horn is a tapering stroke along a smoothed centre line, mirrored on both sides; the #32 is rasterized from Nimbus Sans Narrow Bold. A half-size metallic-roughness map makes the gold metallic and the black satin. Both PNGs are written to `node_modules/.cache/world/speedflex/` for inspection.
3. `scripts/prepare-display-football.py` runs in Blender. It sorts the source parts by their material names, drops the Bills decals, and gives the shell one UV layer computed from each vertex's direction, so the atlas lands where it was painted. It paints the facemask, trim and padding black, adds the eye shield, decimates the padding to 15%, merges everything into six parts (`shell`, `facemask`, `padding`, `trim`, `hardware`, `eye-shield`), turns the facemask to +x with the crown up, scales the helmet to 0.30 m tall and exports a GLB.
4. Optimize with the CLI (meshopt, 2,048 px WebP, `--join false`). Only the eye shield is alpha blended; the runtime applies no tint. The shell's UVs stay unquantized, because faces across the back seam wrap past 1.

`public/world/credits.json` credits the helmet to Exodusks under CC BY 4.0, like the other downloaded meshes below, with the Rams photo as its `graphicReference`. It replaces the earlier helmet built in code, which no longer ships.

### Off-road helmet

The off-road helmet is derived from the Sketchfab OBJ archive of senoaji's "Fox X Supreme Helmet" (681,923 bytes, sha256 `fa74e45f…2935`), kept at `node_modules/.cache/world/fox-x-supreme-original.zip`, and five Sayak product photos copied to `node_modules/.cache/world/fox-x-supreme/photos/sayak-1..5.jpg` (or `FOX_PHOTOS`). `scripts/prepare-display-offroad-fox.mjs` resolves glTF Transform 4.5.1 and sharp from the cached CLI package and runs Blender 5.2 headless (`blender` on `PATH`, or `BLENDER`), so nothing is downloaded or installed:

```text
GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> node scripts/prepare-display-offroad-fox.mjs
```

1. Check the archive's hash and the five photos' hashes, and unpack the archive and the OBJ archive inside it into the cache. The archive is data; nothing in it runs.
2. `scripts/prepare-display-offroad-fox.py dump` imports the OBJ and writes every textured shell triangle with its UVs and its corners in the final frame (metres, +x the chin, +y up, +z the wearer's right).
3. Bake a 2,048 px atlas. Each photo has an orthographic camera fitted to the helmet's silhouette on the white background (silhouette overlap 0.93 to 0.97; the values are pinned in `CAMERAS`, and `--fit` refits them). Each texel's surface point is projected into every photo whose depth buffer shows it visible. The views are weighted by how squarely they face the surface and by distance from the photo's silhouette, and the best-facing view dominates so misregistered views don't ghost. Bright studio highlights are pulled toward the local colour, and texels no photo sees fall back to red, or black when they face down. The liner's UV island overlaps the back of the shell, so the liner is not baked.
4. `scripts/prepare-display-offroad-fox.py build` swaps the shell texture for the bake (satin, non-metallic, roughness 0.42), removes the goggles, gives the liner and the vent meshes plain dark materials, centres the helmet with its chin on +x and its crown up, scales it to 0.30 m tall and exports one `shell` node with three materials (`sayak-paint`, `liner`, `vent-mesh`).
5. Optimize with the CLI (meshopt, 2,048 px WebP, `--join false`) and ship the same bytes. The script also renders the staged GLB through each fitted camera and writes photo/render pairs (`compare-*.png`) to the cache for review.

`public/world/credits.json` has an entry for each downloaded mesh. Each entry includes the author, the license, an official source URL, the hash of the shipped file and the hash of the source file. The license evidence for the Jordans comes from the SceneView manifest pinned at commit `0b96f50`. For the football helmet it is the attribution Sketchfab embeds in the download; for the off-road helmet it is the CC Attribution license on the model page, recorded at download, because the OBJ archive carries no license file. The football helmet's `graphicReference` names the Rams photo, which is neither shipped nor licensed. The off-road helmet's names the Motocard product photos: their pixels are baked into the shipped texture, but they are third-party photos and not covered by the mesh's CC BY license. `scripts/prepare-world.py` preserves the independently sourced display-mesh entries (both helmets and the shoes) when it regenerates base-world credits; it does not download or re-optimize them.

## Katana wall shelf

The katanas sit on a wall shelf, not in a case (katana-wall-shelf T3-T5). The shelf hangs on the room side of the window wall (`main-right`, x 3.91), centred on the free stretch between the back corner and the window (z -1.605, between -2.61 and -0.6). It is a lacquered black board, 1.3 m long and 0.28 m deep, with a brass inlay along its front edge and two black steel brackets. Its top is 1.33 m above the house floor, so the katanas' middle sits at eye height (about 1.58 m). The shelf stays clear of the TV, the sofa and the sofa lamps. Like the setup and the TV, it lives outside the cutaway groups, so it never fades with its wall.

- **Model:** Mitchell Bekke's "Blossom Katana" ([Sketchfab](https://sketchfab.com/3d-models/blossom-katana-6cff8d381e2948ef9527d3d99e80520c), CC BY 4.0). It is a two-tier tabletop stand holding a drawn katana, a sheathed katana and an empty scabbard. It ships as authored.
- **Placement:** at runtime the stand is turned so its front faces the room, with the hilts toward the back corner, and scaled uniformly to 1.2 m long, about 0.50 m tall and 0.23 m deep. It rests on the board, 2 cm off the wall (`src/lib/world/katana-shelf.ts`).
- **Night light:** a slim picture light above the stand holds a warm spot of 2 cd aimed at the katanas' middle. The spot has an angle of 1.1 rad, a penumbra of 0.8 and no shadow map. It lights only at night, like the cases. It is always mounted and runs at zero intensity when off. The katanas' materials get the same night reflections as the cases' items (`displayCaseEnvIntensity`). By day nothing changes.
- **Inspection:** clicking the shelf enters inspection like a case. It uses the same `galleryCase` state, the hidden header, the compact rail (now four objects) and a story card. The camera looks from the room at the katanas' level, from 2.3 m away and a little toward the sofa, so the whole stand fits left of the card. The katanas stay still: a wall rack does not turn. Clicking the inspected shelf toggles its light.
- **Story card:** styled like the lo-fi music console: translucent zinc, an emerald kicker and monospace type. It has the same footprint as the case card. It shows only the owner's line about Japanese culture and the credit "3D model by Mitchell Bekke", which links to his Sketchfab profile.

The GLB is derived from the Sketchfab download (13,358,436 bytes, sha256 `9197c171…9a60`), kept at `node_modules/.cache/world/blossom-katana-original.glb`. There is no Blender step:

```text
GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> node scripts/prepare-wall-katana.mjs
```

1. Check the source hash.
2. Optimize with the CLI: meshopt geometry, the nine 1,024 px textures re-encoded as WebP at their own size, meshes joined by material (three draws), no simplification and no GPU instancing. The shipped file is 1,957,216 bytes with 122,438 triangles, and two runs give the same bytes.

`public/world/credits.json` credits the stand to Mitchell Bekke under CC BY 4.0, with his profile (`https://sketchfab.com/MitchellBekke`) as the pack's `authorUrl`, so the menu's Credits links his name. `scripts/prepare-world.py` keeps the entry in `gallery_files`.
