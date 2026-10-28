# /world — stylized floating island

A new route for the stylized world (odd/tasks/stylized-house.md, T3). `/room`
is untouched; the house and room arrive in T4 on the empty pad in the middle.

## How it loads

`src/pages/world.astro` renders `WorldApp` with `client:only="react"`, like
`/room`. The homepage stays static. `WorldApp` checks WebGL, then lazy-loads
`WorldScene` (three.js, React Three Fiber), so no 3D code ships elsewhere.

| Piece | File |
| --- | --- |
| Route | `src/pages/world.astro` |
| App shell, clock, controls | `src/components/world/WorldApp.tsx` |
| Scene: sky, lights, island, models, camera | `src/components/world/WorldScene.tsx` |
| Credits dialog | `src/components/world/CreditsDialog.tsx` |
| Island shape, pad, rocky underside | `src/lib/world/island.ts` |
| Seeded layout | `src/lib/world/layout.ts` |
| Guided camera limits | `src/lib/world/camera.ts` |
| Pastel palette and light | `src/lib/world/palette.ts` |
| Model list and budgets | `src/lib/world/models.ts` |
| Personal collection shelf | `src/lib/world/shelf.ts`, `src/components/world/Shelf.tsx` |

## Day cycle

The world reuses the room's clock and day cycle read-only: `useRoomClock`,
`TimeController`, `controller-style.ts` and `dayCycle`. `worldLight(hours)`
lifts the daytime sky toward cream (pink at dawn and dusk) and keeps the night
dark, so the sun, moon and phases match `/room` exactly.

### World light balance (S18)

`/room` and `dayCycle` are untouched; the world rescales the cycle in
`worldLight` (`BALANCE` in `palette.ts`):

| Hour | Key | Hemisphere fill | Environment | Key : fill |
| --- | --- | --- | --- | --- |
| 13:00 before / after | 1.98 / 2.86 sun | 0.81 / 0.47 | 0.22 / 0.16 | 1.9 / 4.5 |
| 18:00 before / after | 0 | 0.60 / 0.24 | 0.22 / 0.08 | — |
| 19:19 before / after | 0.47 / 0.44 moon | 0.44 / 0.13 | 0.15 / 0.03 | 0.8 / 2.8 |
| 00:00 before / after | 0.50 / 0.47 moon | 0.34 / 0.09 | 0.10 / 0.03 | 1.1 / 3.9 |

S21 softened the sun and raised the moon a little, fill and environment
unchanged: the sun keys 1.12x (was 1.3x; noon 2.86 → 2.46, key : fill
4.5 → 3.9), the moon 0.97x (was 0.85x; 19:19 0.44 → 0.51, 00:00
0.47 → 0.53, key : fill 4.4 at midnight). This is brightness only: the
shadow edge (penumbra) comes from the map's `radius` and resolution, which
did not change.

- Day: the sun keys 1.12x the cycle (1.3x in S18) and the fill drops, so shadows read while
  lit faces keep about the same total (no washed-out pastels). Sun color is
  the cycle's warm-neutral `#ffe6c4` at height.
- Night: fill and the neutral RoomEnvironment (which read as white light)
  fall to near zero; the moon is pulled 60 % toward a deeper blue, so the
  night lights carry the interior.
- Transitions follow a `night` factor, `1 - smoothstep(-0.2, 0.3, sunY)`,
  never the 18:00 fixture gate; tests bound every per-minute step.
- Bruno's chair bake is unlit, so `chairShade` dims it from 0.8 by day to
  0.55 at night instead of the old 1.0.

### Shadows (S18)

One directional map, 2048 (`WORLD_SHADOW`). The ortho box (±8.25 m) covers
the island rim up to a 3.6 m caster top (house ridge, scaled trees) from any
sun direction; near/far 2/32 m around the key's 14.4-15 m distance.
`normalBias` 0.02 keeps contact shadows attached; `radius` 2. three r186
removed `PCFSoftShadowMap`, so R3F's `shadows` renders PCF with a Vogel-disk
`radius` blur; 4 smeared contact shadows. Caster and receiver flags were
already right. S21 replaced the cutaway shadow fade with the shadow shell
(below).

## Camera

Guided, not free: a three-quarter home view from the front right, always
targeting the house (`HOUSE_FOCUS`). The user can orbit a full 360°, tilt
between 0.35 and 1.35 rad from vertical and zoom between 4 and 40 m. Panning
is off. "Recenter view" returns home. With reduced motion, moves are instant
and clouds stop drifting.

## House cutaway

Zoom drives it, no button (`src/lib/world/cutaway.ts`). Far away the house is
whole. Below 14 m both roofs start dissolving and are gone at 8 m. Below 11 m
every wall whose outward normal faces the camera dissolves, fully at 6 m, so
the interior shows from any side. Each wall (with its trim and glass) and each
roof is its own group; the floor, plinths, porch, driveway and posts never
fade. `House.tsx` uses an 8x8 ordered-dither discard per group and hides fully
faded groups. With reduced motion fades snap.

Shadow shell (S21, `shadowShell`): before S21 a fading group stopped casting
(`castsShadow`, still exported), so with the roof dissolved the sun or moon lit
every room through the missing roof and walls. Now the fading groups' solids
never cast; one `house-shadow` sibling of the groups (never hidden with them)
holds a blocker per opaque solid. Each blocker shares its solid's merged
geometry (planks split around the real window and door holes, frames,
mullions, doors, roof slabs and backing; no glass, no bounding boxes), draws
for the camera with `colorWrite` and `depthWrite` off, and casts through one
explicit undithered `MeshDepthMaterial` with the wood's `BackSide` shadow side.
So direct sun and moon still enter only through the window and door openings
while you look in. The base group casts as before. Limits: only the direct
key is occluded; the hemisphere fill and RoomEnvironment still reach the
interior (no ambient occlusion or GI), and thin seams can leak with the
current bias. The camera still draws each blocker once, writing neither color nor depth.
Geometry is disposed once (a `Set`, shared by solid and blocker); the shell's
two materials are disposed with the rest.

## Assets and credits

Run `python3 scripts/prepare-world.py` (set `GLTF_TRANSFORM` to a cached
glTF Transform 4.5.1 binary to skip `pnpm dlx`). It downloads from the packs'
official GitHub repositories at pinned commits, checks each pack's license
file says CC0, optimizes into `public/world/models/` (meshopt, WebP 256 px
textures, no simplification) and writes `public/world/credits.json`.

Every shipped model must have a credits entry: `tests/world/credits.test.ts`
fails otherwise (S4). The credits are shown in the "Credits" dialog.
Original procedural work (flowers, clouds, house, setup, living area, front
garden) is listed under `original`, written from `ORIGINAL` in
`scripts/prepare-world.py`; `tests/world/garden.test.ts` checks that list
still matches the shipped garden entry.

| Pack | Author | License | Used for |
| --- | --- | --- | --- |
| KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | CC0 1.0 | pines, rocks, path stones |
| KayKit City Builder Bits 1.0 | Kay Lousberg | CC0 1.0 | bushes |
| Kenney Mini Arena 1.0 | Kenney, Tony Schär | CC0 1.0 | tree |
| Kenney Starter Kit 3D Platformer | Kenney | CC0 1.0 | grass tufts |
| KayKit Furniture Bits 1.0 | Kay Lousberg | CC0 1.0 | sofa, coffee table, TV bench, rug, books, cactus |
| StylizedTextures | CreativeTrio | CC0 1.0 | wall planks, floor, roof shingles, chair leather (shipped, unused since T4k), speaker grilles, PC panels |

### Textures (T4e)

`python3 scripts/prepare-world.py --textures` refreshes only the textures and
their credits. It reads the Drive ids in
`node_modules/.cache/world/explore/picks.tsv` (rows of the StylizedTextures
catalog CSV), checks the FAQ still states CC0, caches the 4K PNGs in
`node_modules/.cache/world/textures/`, and writes 1024 WebP color (lossy),
normal (lossless) and roughness (lossy) maps to `public/world/textures/`
with cwebp. Each map is credited under `textures` in `credits.json` with its
bytes, hash, size and source file; color maps also record their mean linear
color, which `src/lib/world/textures.ts` must match
(`tests/world/textures.test.ts`). Only Wood_Planks_001, Wood_Floor_001,
Wood_Shingles_001 and Leather_Patch_001 ship for the house (about 5.9 MB).

The gaming setup (T4g) adds Metal_Mesh_009 (speaker grilles: color, lossy
normal, roughness and a lossless opacity mask cut with alpha test) and
Stylized_Sci_fi_Metal_Panel_001 (PC case at a 0.3 m repeat; chosen over
Metal_Plates_001 because its small panel lines read as a case): about 0.4 MB,
budget 2.5 MB. The catalog has no plastic or fabric, so the desk top
(laminate, light clearcoat), powder-coated frame, satin and matte plastics,
keycaps, speaker cones and mousepad use PBR tuning plus original tileable
normal maps generated in code (`src/lib/world/normals.ts`, credited under
`original` as `setup-normals`). `SETUP_MATERIALS` in `src/lib/world/setup.ts`
maps each part to one merged draw per material.

UVs are box-projected world metres (`boxUv`), so boards stay horizontal on
every wall and shingles point down both slopes. The shader divides the color
map by its mean luminance and blends it in partly, so vertex colors keep the
pastel palette and the map only adds grain. The house shows flat materials
until the maps load (Suspense fallback). Gables are one sloped plank-textured
panel each; wall planks stop at the eave.

Polish (T4h): a generated `RoomEnvironment` map, as in /room, lights the
metals and plastics (`environmentIntensity`: 0.5 by day, 0.15 at night). Setup
bezels, cabinets, PC case, desk top, keycaps and chair cushions are bevelled
boxes (`src/lib/world/rounded.ts`, `shape: "rounded"`), cylinders use 16
sides, and `setupOcclusion` bakes a cheap vertex AO near the floor, on
undersides and under the desk (no postprocessing). Wall plank maps repeat
every 2.4 m at 0.45 strength; the floor reuses the plank maps at its 0.28 m
board width, so Wood_Floor_001 is no longer loaded (its files still ship until
`prepare-world.py` drops them).

The flowers, clouds, the wooden house with its garage and the gaming setup
in its main room are original procedural geometry
(`src/lib/world/flowers.ts`, `src/lib/world/clouds.ts`,
`src/lib/world/house.ts`, `src/lib/world/setup.ts`),
credited under `original` in `credits.json` with the repository's license.

Quaternius packs were not used: their pack pages say CC0, but
quaternius.com/license.html now shows the Quaternius Asset License v1.0, which
is not CC0. Decide before adding them.

## Living area (T4j)

The main room was widened by 1.8 m (main volume x1 2.25 to 4.05; the pad
grew to center x 0.5, half width 3.8; three east anchors and the small tufts'
clearance moved so nature stays off the footprint). The setup keeps the
shared garage wall; a 0.6 m corridor from the door separates it from the
living area (`src/lib/world/living.ts`, rendered by `Living.tsx`).

- KayKit Furniture Bits (`python3 scripts/prepare-world.py --living`): sofa
  (`couch_pillows`) with its back to the front wall, coffee table
  (`table_low`) on a rug (`rug_rectangle_A`), TV bench (`cabinet_medium`)
  against the back wall, books on the bench and a cactus on the table. Each
  model is baked at its placement with box-projected world UVs on `uv1`:
  wood pieces get the plank normal, roughness and grain maps, the sofa and
  rug the procedural weave normal, all through the pastel tint
  (`pastelMaterial`) with vertex AO (`livingOcclusion`).
- Original rounded parts (credited as `living`): a thin-bezel TV on two feet
  facing the sofa, its screen glowing with `livingGlow(hours)`; a DualSense-
  style controller (white shell, black core, curved grips, touchpad, light
  bar, D-pad and face buttons); four PS5-style game cases with coloured
  covers and spine strips; three terracotta-potted plants with 8-13 leaves.
  No Nintendo Switch (tested).
- `tests/world/living.test.ts` checks the room, setup zone, door swing,
  window sills, walkways, TV/sofa facing, budget and credits.

## Budgets

`tests/world/budget.test.ts` reports and enforces triangles per frame (all
instances), main-pass draw calls (one per model primitive, plus sky, stars,
grass, rock and pad) and model bytes, against `BUDGET` in `models.ts`.

## Desk effects (T4i)

Ported from Bruno Simon's [my-room-in-3d](https://github.com/brunosimon/my-room-in-3d)
at `5d00b3f8`, used with the author's permission (private message to the site
owner; the repository has no license file). Rewritten for three 0.186 and
React Three Fiber, keeping his math:

| Effect | Ours | His |
| --- | --- | --- |
| Coffee steam on an original mug | `SetupEffects.tsx`, `models/coffee-steam.glb` | `CoffeeSteam.js`, coffeeSteam shaders, perlin2d partial (inlined, no glslify) |
| Chair sway, ±0.25 rad around the column | `motion.ts`, `Setup.tsx` | `TopChair.js` (±0.5 rad) |
| Breathing PC and keyboard LEDs, never below 40% of `setupGlow(hours)` | `motion.ts` | `GoogleLeds.js` |
| "KV" initials bouncing on the side screen | `motion.ts`, `SetupEffects.tsx` | `BouncingLogo.js` |
| Normalized wheel zoom | `wheel.ts`, `WorldScene.tsx` | `Navigation.js` (normalize-wheel) |

### Bruno's chair and desk gadgets (T4k)

| Piece | Ours | His |
| --- | --- | --- |
| Top chair (seat, back, armrests, headrest) on our five-star base and column | `BrunoProps.tsx` `BrunoChair`, `models/bruno-chair.glb` | `topChairModel.glb`, `TopChair.js` |
| Chair material: day/night/neutral bake mix plus light map | `BrunoProps.tsx` (night mix from `worldLight(hours).stars`, neutral 0.12, PC channel tinted with our RGB) | `Baked.js`, baked shaders, glsl-blend lighten (inlined) |
| Elgato key light glow on an original panel, arm and pole | `models/bruno-elgato-light.glb`, `setup.ts` body | `elgatoLightModel.glb`, `ElgatoLight.js` |
| Google Home Mini LEDs on an original fabric puck, breathing | `models/bruno-google-home-leds.glb`, `bruno/google-home-led-mask.png`, `motion.ts` | `googleHomeLedsModel.glb`, `googleHomeLedMask.png`, `GoogleLeds.js` |
| Loupedeck button screens on an original sloped console | `models/bruno-loupedeck-buttons.glb`, `motion.ts` (seeded, no gsap) | `loupedeckButtonsModel.glb`, `LoupedeckButtons.js` |

His baked maps are 4096 atlases shared with his whole room. The `--bruno`
step decodes the chair, groups its triangles into UV islands, packs each
island's texels (plus 8 texels of padding) into a 2048x736 atlas, rewrites
the chair's UVs onto it and encodes the four maps as WebP under
`public/world/bruno/` (about 227 KB in total). His overlays are placed as his
classes add them: each model keeps his node transforms, moved from his room
onto our body by `BRUNO_OVERLAYS` (`from` in his coordinates, `to`, `yaw`,
`BRUNO_SCALE` = 0.3 m per unit). His `pcScreenModel` and `macScreenModel` are
not used: our monitors already have screens, and his are video planes sized
for his monitors. The chair's sway clearance is tested on a hull of eight
slabs measured from the shipped model (`hull` in its credit).

`/world` renders on demand. The setup requests frames continuously only while
the camera is within 16 m of it, and never with reduced motion. Otherwise it rests: chair
centred, LEDs at the hour's glow, logo still, steam frozen (hidden with
reduced motion). `python3 scripts/prepare-world.py --bruno` re-encodes the
Draco steam, chair and overlay models with meshopt, builds the chair atlas and
writes the Bruno Simon credits (pack, asset, `maps` and `ported` entries with
each source file's sha256). Only Bruno Simon's
repository may use the permission license (`licenseAllowed` in
`src/lib/world/credits.ts`).

## Night lights and scene settings (T6b)

Four night lights, editable in a bottom-right "Scene" console with the zone
cards of the chosen Gentle Design artboard
(`design/world-lighting/03-grouped-cards.html`):
TV backlight, setup backlight and left/right desk lamps (left and right as
seen from the chair, facing the wall).

| Piece | File |
| --- | --- |
| Gate, settings, clamping, fixtures, lamp parts | `src/lib/world/lights.ts` |
| Spot and point lights, lamp models, LED strips, bulbs | `src/components/world/NightLights.tsx` |
| Scene console and its scoped styles | `src/components/world/ScenePanel.tsx`, `scene-panel.css` |
| Settings state (session only, no persistence) | `src/components/world/WorldApp.tsx` |

- Night gate: `nightLightsOn(hours)` floors the simulated clock to the
  minute and is on from 18:00 through 05:59, off from 06:00 through 17:59.
  It never reads the stars level or the PC clock. The shared day controller
  is the only time display and editor; the Scene panel shows no hours.
- Scene console: the lower-left day controller mirrored to the bottom right.
  One dark box, at most 320 px wide, header row ("Scene", lights on/off,
  Show/Hide) at the bottom and the TV wall and Desk setup cards opening
  upward above it, then the "Reset lights" action with the master power
  button beside it. It starts folded, scrolls
  inside below the top buttons, and lifts above the day controller when that
  spans under it (narrow screens, timeline dock).
- Styling lives in `scene-panel.css` with literal colors. The shadcn theme
  tokens in `globals.css` are bare HSL triplets (`--background: 240 10%
  3.9%`) that `@theme inline` maps without `hsl()`, so `bg-background`,
  `text-foreground` and `border-border` compute to invalid colors
  (transparent background, black text). Do not use them in /world UI.
- Each light has a switch, a native color input and a 0-100 % slider, with
  its color and location as the hint. Controls stay editable by day; their
  status reads "Off · day".
  `updateLight` clamps intensity, rounds it, and ignores non-hex colors.
- Master power (S20): one "Power off" / "Power on" button next to "Reset
  lights". It is a separate `power` state in `WorldApp` (default on, kept
  for the page session across day and night), so the per-light switches,
  colors and intensities survive off and on; "Reset lights" resets only
  those settings, never the master. It works only at night: by day the
  button is disabled and `togglePower` returns the state unchanged. At night
  with the master off, `lightLevel(setting, hours, power)` and
  `lanternLevel(hours, power)` are 0 for the four night lights and all four
  lanterns, and `glowPower` is 0 for every artificial glow: the setup
  screens, RGB, PC and keyboard LEDs, side-screen logo, Bruno's Elgato
  panel, Google Home LEDs and Loupedeck buttons, the TV screen and light
  bar, and the TV, desk and PC channels of Bruno's chair bake. Rows read
  "Off · power" and the header "lights off". The sun, moon, sky and fill
  never change. By day `glowPower` stays 1, so the daytime scene is
  unaffected whatever the master; the per-light sliders are never locked.
- Scene: four lights, never shadow-casting, `decay` 2 and a finite
  `distance` (1.2-1.6 m), intensities under 1 cd at 100 %. Since S18 the TV
  and setup backlights are spots placed behind the middle of their panel and
  aimed square at the wall (72° half-angle, penumbra 0.7): the hotspot hides
  behind the panel, the wall washes around it, and nothing in front of the
  panel is lit through it. This approximates the LED strip; a RectAreaLight
  would need `RectAreaLightUniformsLib` (an extra examples import with large
  LTC tables). The desk lamps stay point bulbs inside their shades. They stay
  mounted and drop to intensity 0 by day or when disabled, so the shader
  light count never changes. Emitters: an LED strip behind the TV panel and
  one behind the main monitor (dark when off), and two original desk lamps
  (weighted foot, brass stem, lathe bell shade that glows faintly, sphere
  bulb) at the desk's front corners, clear of the speakers, mug and steam.
- Bruno's chair bake: his TV and desk-lamp channels take our TV and lamp
  colors and follow the same gate and levels; his PC channel keeps our RGB.
- Repaints are on demand (settings or hour change); nothing animates.

## Front garden entrance (T7, S20)

Original procedural work (credited as `garden` in `public/world/credits.json`,
no downloads): four wall lanterns (two beside the front door, one at the
garage door, one on the back wall), a stepping-stone
path from the porch step into the front lawn, a decorative mailbox and a
garden sign. Nothing is interactive.

| Piece | File |
| --- | --- |
| Gate reuse, fixtures, parts, path, clearing, sign text fitting | `src/lib/world/garden.ts` |
| Meshes, lantern lights, sign canvas texture | `src/components/world/Garden.tsx` |
| Tests | `tests/world/garden.test.ts` |

### Change the sign text

Edit one string, `GARDEN_SIGN.text` in `src/lib/world/garden.ts` (default
`"OPEN TO WORK"`). The sign measures it with the canvas, wraps by word and
shrinks it (160 to 48 px on a 1024x464 texture, at most three lines);
spaces collapse, words too wide break by character, and text over
`GARDEN_SIGN.maxChars` (60) ends with an ellipsis. Ink `#2b211c` on cream
`#fff4e3` (contrast over 7:1), system fonts only.

### Layout, materials and light

- Lanterns: bronze carriage lanterns, one body (`lanternParts`) built
  against a front wall and turned onto its wall by `LANTERN_MOUNTS`: on the
  main front wall at x -0.04 and 1.04 (0.54 m each side of the door middle),
  between the door and window trim; on the front face of the garage's outer
  front corner post (x -3.03, the post's axis; 0.05 m proud of the planks),
  at 0.8 scale and 0.05 m lower so it fits beside the unchanged garage door
  trim (12 mm clear in x) and under the low eave, aimed in across the
  driveway at (-2.55, 1.35); on the main back wall at x 0.55, between the
  two windows, facing -z. The inner garage corner post is not used: the
  main house's left wall boxes it in. The house geometry is unchanged.
  Tests check every lantern part's bounds against every real house part
  (posts, trim, planks, glass, rotated roof slabs and eave boards). Rounded backplate, arm and brace, square cage on a pan with corner
  posts and bands, frosted glass, a stepped round hood and brass finial and
  socket; a sphere bulb. Each has one non-shadow spot (warm `#ffc27a`,
  1.7 cd since S20, twice the first 0.85, 3.2 m, decay 2, 57° half-angle,
  penumbra 0.7) aimed square out of its wall and down (the glass glow also
  doubled, emissive 0.55 to 1.1, bulb x2): unlike a point light, it never reaches the floor inside
  through the unshadowed wall. On from 18:00 through 05:59 by
  `nightLightsOn`, the night lights gate, with no per-lantern settings; the
  scene panel's master power turns them all off at night. By day the
  intensity is 0, the bulb is grey and the glass stops glowing. Each lantern
  body hides while its own wall (`main-front`, `garage-front`, `main-back`)
  is cut away; the lights stay on.
- Light count: the scene has 10 lights, none added or removed at runtime:
  the sun/moon key (the only shadow caster), the hemisphere fill, the four
  night lights (two spots, two points) and the four lantern spots. No point
  shadows.
- Path: six irregular beveled stones (14-point seeded outlines, smooth rings
  from a tucked foot to a rounded shoulder and domed top, 5.3 cm tall, sunk
  8 mm) on a gentle S from the porch step (x 0.5, z 2.37) to (2.46, 4.2),
  where the island's older KayKit trail continues (T10 moved them out with
  the porch; x kept). All six lie wholly on the grass: the first sits at
  z 2.37, not the planned 2.35, because at 2.35 its outline (z 2.2025)
  straddled the pad's front edge (2.2 plus the 1.8 cm bevel). Stone material: rough,
  pitted `noise` normal map, darker toward the ground.
- Mailbox at (-0.05, 2.55), sign at (1.72, 2.7) (2.48 before T10: its
  0.45 m footprint reached onto the grown pad), both square to the
  front facade (`rotationY` 0, facing +z like the front door; S20 removed
  the 0.3 and 0.45 turns toward the home camera that looked crooked). Mailbox: planted post with collar, support plate on two
  braces, sage body (the door's color) with a round hood, arched door with
  letter slot and brass pull, raised coral flag. Sign: two planted posts, a
  framed board with brass screws and a coral cap; the text is a canvas
  texture. Wood uses the house's plank texture once the maps load.
- Clearing: `clearOfGarden` drops only nature items and flowers whose
  footprint meets a stone or prop (since T10: three old KayKit path stones
  and one small tuft at (2.67, 4.2)). The remaining trail stones are
  (2.86, 3.66), (2.96, 4.49) and (3.84, 4.51); the nearest is 0.58 m past
  the last garden stone.

## House extension and collection shelf (T10, S22)

The main volume came 0.65 m forward toward the entrance (`HOUSE.main.z1`
0.85 → 1.50); its walls, gables, roof and floor regenerate from the volume,
and the front wall keeps the same door and windows. The garage (volume,
door -2.88..-1.5, roof) and the driveway (still ending at z 2, now a
literal `DRIVEWAY_END` instead of the pad front) are unchanged, as are every
setup and living placement: `tests/world/expansion.test.ts` hashes their
part geometry against the pre-extension house. The porch moved with the
wall (z 1.50..2.06), the pad grew 0.2 m forward only (centre z -0.4, half
depth 2.6; back edge still -3), the camera focus follows half the extension
(z -0.95 → -0.625) and the front lanterns follow the wall. The island's
seeded layout is identical: `layout.ts` pins the old trail start at z 2.45
instead of deriving it from the pad.

The shelf stands against the main room's left wall, left of the setup, at
base (-0.89, floor + 0.04, 0.45), turned a quarter (yaw π/2) so its open
front faces the room: 1.20 m wide, 0.32 deep, 1.45 tall, footprint
x -1.05..-0.73, z -0.15..1.05; 6 cm from the wall, 15 cm past the setup
zone, 31 cm from the front wall and 87 cm beside the door swing. No window
lies behind it or within 30 cm. It does not fade with the cutaway.

- Carcass: white satin rounded boards (two sides, top, bottom, a centre
  divider, three shelves per column, back panel) on an oak kick board.
- Top: the brown Nike football on an oak stand. Lathe body with a pointed
  prolate profile, r = R (1 - u²), 28 × 17 cm; raised white laces (eight
  cross laces over a running lace) facing up toward the room; a canvas
  leather skin (1024 × 512) with four panels and seams, white stripes across
  the two panels beside the laces, and an original vector swoosh; procedural
  `pebble` normal (36 × 18 repeats). No model text: none is readable in the
  photos.
- Eye level: black instant camera (lens bezel, chrome ring, glass,
  viewfinder, flash, orange shutter, film slot) with its rainbow film
  carton; Zenit SLR (pentaprism hump with nameplate, chrome mount, knurled
  focus ring, aperture and front rings, glass, dials); silver Samsung
  compact (lens rings, flash, shutter).
- Below: Corsair VS600 box, Ryzen 7 box, two memory kits and two NVMe packs;
  then the keyboard (orange accent keys) and six standing books; at the
  bottom a lying book stack, two more books and a Gigabyte box.
- Labels: one original canvas atlas (1024 × 512, 21 regions) drawn in code
  from measured layouts; no photo pixels, no reference photos in `public/`.
- Budget (`shelfBudget()`): 13,950 triangles (solids 10,836, ball 3,072,
  labels 42) and 8 draws (paint, wood, card, plastic, metal, glass, ball,
  labels); all solids cast and receive shadows; no lights, no animation.
- Credit: original `shelf` entry in `credits.json` and in `ORIGINAL` of
  `scripts/prepare-world.py`: reference photos supplied by Kevnnard; brand
  names and marks belong to their owners, no affiliation.

## Third-party notices

- `src/lib/world/wheel.ts` ports the wheel normalization logic of the `normalize-wheel` package (originally from Facebook's fixed-data-table), licensed BSD-3-Clause. Its copyright notice and license terms apply to that logic.


### Personal awards and analog photography (S23)

The shelf collection is additive: all 78 original parts and the football stay
unchanged. The top now displays two stylized athlete trophies based on the owner's
IMG_1634 reference: gold ornamentation with a green column, and a smaller wooden
base. Three supported medal displays carry yellow/blue/red ribbons. The photo
tier gains two 35 mm film canisters and two original miniature landscape prints;
the lower photo/book space has two detached lenses and six additional books.
The prints are original landscapes, not copies of personal photographs. No badge,
name, QR code or surrounding reference-photo content is published.

The additions use the existing merged materials and procedural textures: **20,486
triangles, 206 parts, 8 draw calls**, no new lights, textures or animation. The
geometry budget guard increases from 16k to 22k to accommodate the collection.
Shelf dimensions, original object placements and house geometry are unchanged.
Checks: 346 world/room tests, scoped TypeScript, Biome, production build and HTTP
200 passed. Build retains the existing large-chunk warning. Actual GPU appearance
and readability of the new miniature awards still need a close browser view.
