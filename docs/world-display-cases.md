# World display cases

Three glass cases stand behind the living-room sofa in `/world`. Each one has a plinth, a brass band, five glass panes and a small fixture under the lid. The case lights only turn on at night (see [Night lighting](#night-lighting)). From the interior home view, clicking a case enters its inspection camera without changing the light. The camera looks at the model from its own level, over the sofa's backrest. The model rises 5 cm off its riser and turns slowly on the case axis, one full turn every 20 seconds, like a product turntable; when inspection ends it settles down and eases back to the front. Under reduced motion it lifts without easing and does not turn. The portfolio link and the menu hide during inspection. A case with a story (today the football helmet: Carneros DC, #32, in `src/lib/world/case-stories.ts`) shows a side card with the number, the positions on a secondary diagram, the seasons, a timeline, a muted game clip and the team link; while it is open the camera slides so the model sits left of it, and the collection rail folds into one compact row. "Hide story" folds the card and recentres the model. Story media ship under `public/world/stories/`; a case without a story shows none. Clicking that focused case again switches its night lights and plays the lamp click. The inspection rail changes cases or returns to the room.

| Case | What it shows | Source | License |
| --- | --- | --- | --- |
| Left | Riddell SpeedFlex football helmet, repainted in the owner's gold and black Rams-style horn livery | [Exodusks on Sketchfab](https://sketchfab.com/3d-models/buffalo-bills-helmet-fd471344bf9c4900b8cc0f59fedb8093) ("Buffalo Bills Helmet") | CC BY 4.0 |
| Middle | Off-road helmet mesh, painted with a recreated Fox V1 F-A18 graphic | [Pieter Ferreira on Sketchfab](https://sketchfab.com/3d-models/off-road-helmet-c9d968e024b749a7a9d0e257277a2d5c) | CC BY 4.0 |
| Right | A pair of Air Jordan 1 High in black and sail | [makoto on Sketchfab](https://sketchfab.com/3d-models/air-jordan-1-a4b434181fbb48008ad460722fd53725), redistributed by [SceneView](https://github.com/sceneview/sceneview) | CC BY 4.0 |

## Fidelity

These meshes are stand-ins that look like the real objects. They are not the owner's exact objects.

- **Football helmet:** Exodusks' recreation of a Riddell SpeedFlex, so the shell, flex panel, vents, bumpers, cage and chin strap have the real helmet's shape. It is repainted for this site in the owner's colors; it is not the owner's exact helmet (theirs is a Schutt).
  - **Livery:** a metallic gold shell with one wide, satin black Rams-style horn a side. It starts as a point on the forehead beside the flex panel, widens over the crown, sweeps down the back, passes under the ear hole and curls around it, leaving a gold channel inside the spiral. The path is redrawn after a photo of a Rams helmet ([Wikimedia Commons, "LA RAMS Helmet"](https://commons.wikimedia.org/wiki/File:LA_RAMS_Helmet.jpg)) and is a visual reference only; the photo is not shipped. The back carries a small block #32 low above the rear bumper, where NFL helmets carry the player number.
  - **Black parts:** the facemask (glossy powder coat), the bumpers, clips and chin strap, and a separate smoked black eye shield in the window between the cage's top and second bars. The shield is one curved sheet, so the blended material has no back face to sort against.
  - **Limits:** the Bills decals are removed and no NFL, team, Riddell or Schutt marks are shown. The owner's eagle decal and 18 disc are not reproduced. The interior padding is decimated to keep the file small.
- **Jordan 1:** the textures are kept as they are. The colorway is black and sail, not Black Toe.
- **Off-road helmet:** a credited off-road helmet with a recreated Fox V1 F-A18 graphic. It is not the owner's exact Fox V1: the shell and peak are Pieter Ferreira's geometry, not Fox's. The graphic follows one marketplace photo of the front of a red, black and gray F-A18 ([eBay listing 157680317522](https://www.ebay.com/itm/157680317522)). The photo is a visual reference only; it is not shipped. From that photo, the paint keeps:
  - a red peak with charcoal and black angular shapes, and "F-A18" on the peak's left, with "F-A" in red and "18" in light gray over a dashed bar, on a charcoal panel;
  - a red forehead with two black angular vent surrounds;
  - a black eye-port rim;
  - a black chin centre between red frames around dark side vents;
  - white blocks down both sides of the jaw.

  The photo shows only the front, so the sides, back and crown are an approximation in the same palette: a black sweep with a gray panel below it, a black spine on the crown, and a black lower trim. The chin's Fox head logo is not reproduced; a plain red outlined badge marks its place. Lettering and shapes are redrawn, not traced, so proportions differ from the real helmet. The liner, goggles, strap and mouth vent keep their source texels. A street helmet is not used in its place.
- **Jersey:** deferred. It will go in a frame on the wall.

## How a mesh is placed

The rules are in `src/lib/world/display-cases.ts`. `src/components/world/DisplayCases.tsx` renders them.

1. `frontYaw` turns the mesh so its front faces the room. For the football helmet, that's the facemask on the derived +x. For the off-road helmet, it's the chin guard on source +x. For the Jordans, it's the toes on source +z.
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

The off-road helmet is derived from the signed-in Sketchfab 2k GLB download (6,546,284 bytes, sha256 `72662d52…c1f6`) by `scripts/prepare-display-offroad.mjs`. It resolves glTF Transform 4.5.1 and sharp from the cached CLI package, so nothing is downloaded or installed:

```text
GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> node scripts/prepare-display-offroad.mjs
```

1. Check the source hash, then weld the vertices by position and split the mesh into its nine connected parts. In descending triangle count they are the shell (1,006), liner (908), goggle frame (800), peak visor (212), two visor screws (144 each, merged into `visor-screws`), goggle lens (124), goggle strap (44) and mouth vent (4). Every part keeps its positions, normals, tangents and UVs.
2. Paint the shell, peak and screws into the source's own 2048 px base color atlas. The source UVs don't overlap, so each texel maps to one surface point. Every covered texel gets the graphic's color at that point. Shapes are planes and distances in the helmet frame (+x the chin, +y up). The eye-port rim and lower trim are measured from the shell's boundary loops. The lettering and badge are SVG decals projected onto the peak and chin. Paint bleeds 6 px past each island, so texture filtering never picks up the old gray.
3. Extend the peak. In the source, the peak's tip stops 0.13 units short of the chin, so in the case it reads as pushed back. Only the overhang is stretched forward, uniformly along +x from x = 9, where the peak leaves the shell. That moves the tip from x 19.2 to 22.5, about 3.2 units past the chin. The rear of the peak, its contact with the shell and the screws don't move. Normals and tangents are transformed with the stretch. The UVs don't change, so the paint stretches with the overhang. Because the helmet is now longer, `displayModelFit` scales it about 6.5% smaller in its case.
4. Keep the source normal map, so the vents, panel lines and chin mesh still show. Drop the metallic-roughness, transmission and specular maps. The paint is satin and non-metallic (roughness 0.42). The liner, goggles, strap and mouth vent keep their source texels and tone (roughness 0.75). The lens blends with its source alpha instead of a transmission pass.
5. Optimize with the CLI using the Jordans' flags above, but with 1,024 px textures, because the lettering needs the extra resolution. Two runs produce the same bytes.

`public/world/credits.json` has an entry for each downloaded mesh. Each entry includes the author, the license, an official source URL, the hash of the shipped file and the hash of the source file. The license evidence comes from the SceneView manifest pinned at commit `0b96f50`, and from the attribution that Sketchfab embeds in the off-road helmet download. The license evidence for both helmets is the attribution Sketchfab embeds in their downloads. The off-road helmet entry also has a `graphicReference` that names the F-A18 photo, and the football helmet's names the Rams photo. Each is kept apart from the mesh license, because the photo is neither shipped nor licensed. `scripts/prepare-world.py` preserves the independently sourced display-mesh entries (both helmets and the shoes) when it regenerates base-world credits; it does not download or re-optimize them.
