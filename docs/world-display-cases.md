# World display cases

Three glass cases stand behind the living-room sofa in `/world`. Each one has a plinth, a brass band, five glass panes and a small light under the lid. The light only turns on at night. From the interior home view, clicking a case enters its inspection camera without changing the light. Clicking that focused case again switches its night light and plays the lamp click. The inspection rail changes cases or returns to the room.

| Case | What it shows | Source | License |
| --- | --- | --- | --- |
| Left | Original SpeedFlex-inspired football helmet in the owner's gold and black horn livery | Built in this repository (`src/lib/world/football-helmet-asset.ts`), modelled from [Riddell's official SpeedFlex varsity product photos](https://www.riddell.com/riddell/en/Open-Catalogue/Helmets/Varsity/SPEEDFLEX/p/FB_HELMET_SPDFX) | Original work (repository license) |
| Middle | Off-road helmet mesh, painted with a recreated Fox V1 F-A18 graphic | [Pieter Ferreira on Sketchfab](https://sketchfab.com/3d-models/off-road-helmet-c9d968e024b749a7a9d0e257277a2d5c) | CC BY 4.0 |
| Right | A pair of Air Jordan 1 High in black and sail | [makoto on Sketchfab](https://sketchfab.com/3d-models/air-jordan-1-a4b434181fbb48008ad460722fd53725), redistributed by [SceneView](https://github.com/sceneview/sceneview) | CC BY 4.0 |

## Fidelity

These meshes are stand-ins that look like the real objects. They are not the owner's exact objects.

- **Football helmet:** an original model inspired by the Riddell SpeedFlex, built in code for this site. It is not Riddell's CAD and not an exact SpeedFlex replica. The owner's own helmet is a Schutt, so only its paint is carried over, not its shape.
  - **Shape**, after Riddell's official SpeedFlex varsity photos (front, side, back and inside views): a shell with real thickness at every opening, a raised flex panel on the forehead cut free on three sides by a sunken seam, through vents (one across the top of the panel, raked front-side slots, crown, upper-rear and rear diagonal slots, small rear slots and a horizontal ear slot), a forward jaw, black front and rear bumpers wrapped over the rim, and a pillowed liner with thicker jaw pads.
  - **Facemask:** black bars swept along curves, welded at the joints, held by four black clips with metal screws. The eye bar crosses the nose bridge, so the eyes look through an open window between it and the top bar, with only a short temple connector at each outer edge. Below the eye bar, evenly spaced nose, mouth and chin bars are tied by centre, inner, middle and outer verticals, a lower V and side bars to the jaw clips.
  - **Eye shield:** a separate, glossy, tinted black part filling the eye window behind the top and eye bars. It is one curved sheet, so the blended material has no back face to sort against.
  - **Livery:** painted into a flat UV atlas mapped onto the shell and the flex panel. The metallic gold shell and satin black horns follow the owner's photos of their helmet and the Rams' horn. Each side carries one continuous, tapering curled horn, laid out directly on the shell in azimuth and elevation, so it doesn't stretch over the forehead. It starts at the brow beside the flex panel, arches over the temple, sweeps back and down behind the ear hole, runs forward under it along the jaw, and curls up in front of the ear to a point. A gold channel stays inside the spiral, and the flex panel stays gold. The inner curl stays on the shell, so it sits a little further back than on a Rams helmet. The back carries the owner's #32 and the 18 disc, as block numerals.
  - **Limits:** proportions, vent placement and the cage pattern are approximations from photos, not measurements. There is no chin strap. The eagle decal on the back is not reproduced. No Riddell or Schutt marks are shown. The owner's photos are a visual reference only; they are not shipped.
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

1. `frontYaw` turns the mesh so its front faces the room. For the football helmet, that's the facemask on the built +x. For the off-road helmet, it's the chin guard on source +x. For the Jordans, it's the toes on source +z.
2. `displayModelFit` reads the mesh's bounding box and picks one uniform scale. The diagonal of its footprint must fit within `itemFit.radius`, so it stays clear of the glass at any case yaw. Its height must fit within `itemFit.height`, so it stays under the light. The footprint is then centered on the case, and the lowest point rests on the riser.
3. The case's `itemYaw` turns the item toward the center of the room.
4. Every part casts a shadow except a see-through one: `displayMeshCastsShadow` skips blended materials under 90% opacity, which today is only the football helmet's tinted eye shield.

## Loading

The meshes load with `GLTFLoader` and the Meshopt decoder, inside their own `Suspense` boundary. The cases and their point lights mount right away and stay mounted. The meshes count as the `display` preparation milestone, so the `/world` loader doesn't report ready until all three meshes have committed.

## Assets and credits

The shipped files are `public/world/models/display-football-helmet.glb`, `display-offroad-helmet.glb` and `display-jordan-1.glb`. The Jordans were optimized with the cached `@gltf-transform/cli` 4.5.1, using the same flags as `scripts/prepare-world.py` with 512 px textures:

```text
optimize <source> <target> --compress meshopt --texture-compress webp --texture-size 512 --simplify false --join false --instance false --palette false
```

### Football helmet

`src/lib/world/football-helmet-asset.ts` is the builder: it owns the geometry, the UVs, the materials and the livery atlas. Importing it computes nothing; `buildFootballHelmet()` returns the parts and the atlas, and the same detail level always gives the same bytes. `scripts/prepare-display-football.mjs` is a thin wrapper: it attaches the parts and the atlas to a glTF Transform document (the images go in as PNG bytes), writes a work file, and optimizes it with the cached CLI. Nothing is downloaded or installed, and two runs produce the same GLB:

```text
GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> node scripts/prepare-display-football.mjs
```

1. The shell is a regular azimuth-elevation grid over a superellipsoid with a forward jaw, a long forehead slope and a rear shelf. Its outline, the flex panel seam and the vents are curves in that grid's plane. Vertices near an edge snap onto it, so the face opening, the neck line and every vent are clean curves; triangles outside are dropped.
2. Every opening gets a rim and a short inner lip, so the shell shows its thickness. The liner follows the shell inside and tapers into the rim.
3. The shell and the flex panel are separate parts that share the livery material. Their UVs are the grid's own coordinates: u wraps the azimuth with the front at the centre and the wrap seam at the back, v runs from the crown down to below the jaw.
4. The atlas is 2,048 × 1,024, painted per texel from the shell point it maps to, with 2 × 2 supersampling. A half-size metallic-roughness map makes the gold metallic and the horns, seam and numbers satin matte.
5. The CLI writes meshopt geometry and WebP textures, keeping every part (`--join false`). The parts are `shell`, `shell-edge`, `flex-panel`, `front-bumper`, `rear-bumper`, `padding`, `facemask`, `facemask-clips`, `hardware` and `eye-shield`. Only the tinted eye shield is alpha blended; the runtime applies no tint.

The flat atlas ships inside the GLB only. To inspect it, run the script: it also writes `node_modules/.cache/world/speedflex/football-livery.webp`, the exact image the shell's UVs map.

`public/world/credits.json` credits the helmet as original work (`original`, id `football-helmet`), with the builder as its source, the Riddell page as its reference, and the shipped file's bytes and hash. It replaces the generic Poly by Google helmet and its CC BY 3.0 credit, which no longer ship.

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

`public/world/credits.json` has an entry for each downloaded mesh. Each entry includes the author, the license, an official source URL, the hash of the shipped file and the hash of the source file. The license evidence comes from the SceneView manifest pinned at commit `0b96f50`, and from the attribution that Sketchfab embeds in the off-road helmet download. The off-road helmet entry also has a `graphicReference` that names the F-A18 photo. It is kept apart from the mesh license, because the photo is neither shipped nor licensed. `scripts/prepare-world.py` preserves the independently sourced display-mesh entries when it regenerates base-world credits; it does not download or re-optimize them. It keeps the football helmet's original-work record, refreshes its bytes and hash from the shipped file, and drops any download credit for a file built here, so the retired Poly Pizza helmet cannot come back.
