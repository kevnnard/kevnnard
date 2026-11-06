# World coffee card (coffee-card S1-S3)

Click the coffee mug on the desk in `/world`. The camera dollies slowly onto
the steaming mug and ends on a low, close 3/4 shot. A side card then tells
you about the owner's favourite coffee, Chiroso, and where to drink it:
Café Mi Tierra in Bogotá, a friend's coffee shop.

| Part | Where |
| --- | --- |
| Card copy (pure) | `src/lib/world/desk-stories.ts` |
| Cup fit, coffee and rest yaw (pure) | `src/lib/world/setup.ts` (`MUG_SOURCE`, `SETUP_PROPS.mug`) |
| Cup and coffee in the scene | `src/components/world/Setup.tsx` (`DeskMug`) |
| Cup asset | `scripts/prepare-desk-mug.mjs` → `public/world/models/desk-mug.glb` |
| Camera path and click box (pure) | `src/lib/world/coffee-shot.ts` |
| Mug turntable timing (pure) | `src/lib/world/coffee-mug.ts` |
| Mug turntable (moves Setup's mug) | `src/components/world/CoffeeMug.tsx` |
| Side card | `src/components/world/CoffeeCard.tsx`, `coffee-card.css` |
| Click target | `src/components/world/CoffeeHitbox.tsx` |
| Tests | `tests/world/coffee-card.test.ts` |

## The cup (S3)

The mug is AoBlue_Moon's "Jack Skellington cup" (Sketchfab, CC BY 4.0,
credited in `public/world/credits.json` and so in the world menu, never on
the card).

- **Asset:** `scripts/prepare-desk-mug.mjs` checks the download's sha256
  (`da2bed61…598e9`, cached as
  `node_modules/.cache/world/jack-skellington-cup.glb`) and runs glTF
  Transform 4.5.1 `optimize`: meshopt geometry, the three 1024 px textures
  as WebP at no more than 1024 px, no simplification. The same source gives
  the same bytes: 47,352 bytes, 1,752 triangles. Run it with
  `GLTF_TRANSFORM_CLI=<cli package dir> node scripts/prepare-desk-mug.mjs`.
  `prepare-world.py` keeps its credit (`gallery_files`) on a full rebuild.
- **Fit:** `MUG_SOURCE` holds the cup's measured axis, base, rim, widest
  radius, handle reach, wall radii and the direction of Jack's face. The cup
  is scaled to 9.5 cm tall (radius 5.7 cm, under the 6 cm coaster) with its
  base on the `setup-mug` node's origin.
- **Rest angle:** the node turns 50° (`SETUP_PROPS.mug.yaw`), so Jack looks
  into the coffee shot's lens and the handle points to screen right.
- **Coffee:** an original disc 85% up the cup, its edge tucked into the
  wall, dark in the middle and warming to a subtle crema tint at the edge.
  It loads with the cup, so it never floats over an empty coaster.
- **Steam:** unchanged (`CoffeeSteam`). It starts at 90% of the cup's
  height, over the opening, and stays still while the cup turns.

## The shot

- **End pose:** the camera aims three quarters up the cup (base + 0.071 m),
  so the steam rises in the upper frame. It sits 0.42 m out and 9° down,
  approaching from the chair's side and turned 30° toward the desk's middle.
  From there Jack faces the lens and the handle shows on the right. A test
  checks that the base, the rim, the handle and 8 cm of steam are in frame.
- **Move:** a cubic ease in and out over 2.5 s. The eye travels the straight
  line toward the end pose and bows sideways away from the mug. The bow is
  10% of the horizontal travel, capped at 0.3 m, largest at mid-move and zero
  at both ends. The aim settles on the mug at 85% of the move. The lens closes
  from 35° to 30°.
- **Leaving:** the same path backwards (`coffeeLeaveAt`), over 1.8 s, back
  to the pose saved on entry.
- **Reduced motion:** `coffeeShotProgress` returns 1 at once, so the camera
  cuts straight to the shot, or straight back to the room on leaving.
- **Card open:** `coffeeShotShift(width, aspect)` slides the eye and the aim
  toward screen right, so the mug sits left of the card. The card uses the
  katana card's footprint (`STORY_CARD`), and the shift is zero once the card
  stacks above the mug.

## The click box

The click box covers the cup, its handle at the rest angle (10.2 cm from the
axis) and the wooden coaster, plus 1 cm on each side. It runs from the desk top to 1 cm over the
rim. The tests check its clearances: the mouse, the mat, the keyboard and its
hitbox, and the ultrawide all stay clear. Like the keyboard's box, it only
answers when the camera is inside the room and nothing sits in front of the
mug, and a drag past 6 px is not a click.

## The mug turntable

While the close-up is open, the mug turns on its own vertical axis, like a
display case (`DISPLAY_TURN` in `display-cases.ts`). The coaster and the
steam stay where they are; the coffee turns with the cup.

- **Turn:** one turn every 20 s once up to speed. On arrival the speed
  eases in over 2 s (a smoothstep).
- **Lift:** the mug rises 1 cm off the coaster over 1.2 s, eased.
- **Leaving:** a critically damped spring takes the mug back to the nearer
  rest angle, starting from its current speed, so it never jumps. At the
  same time the mug sinks back down over 1.2 s. Once settled it rests
  exactly at its original pose and stops requesting frames.
- **Reduced motion:** the mug never turns or lifts.

`CoffeeMug` renders nothing. It finds the `setup-mug` node in Setup's group
and applies `mugPose` on top of that node's own pose. When the component
unmounts, the mug returns to its rest pose.

## The card

The card copies the football helmet's story card (`CaseStory.tsx`,
`case-story.css`, `design/collection-case-story/01-side-story-card.html`).
It takes the same footprint and breakpoints (`STORY_CARD`: 500 px, 420 px
from 1100 px, stacked from 700 px), so `coffeeShotShift` still frames the
mug to the left of the card. With no collection rail below it, the card can
run 64 px from the bottom.

- **Head:** the kicker `DESK · COFFEE`, the title **Chiroso** and a
  one-line subtitle. On the right sits an original outlined coffee bean,
  emerald like the helmet's number.
- **Stats strip:** Origin (Urrao, Antioquia), Altitude (1,800–2,200 m) and
  Variety (Caturra Chiroso). The strip stacks under 700 px.
- **Media:** `media` is `CaseStoryMedia[] | null`. It is `null` for now.
  When the owner sends their own photos (files under `/world/stories/`),
  they show in the helmet card's media row. Clips never autoplay.
- **Grown at:** an original inline SVG of a ridge, not any real profile,
  with the 1,800–2,200 m band filled emerald.
- **Processes:** Washed, Honey and Natural as tabs. Each tab shows the
  process's tasting note. The tabs follow the ARIA tabs pattern: one tab
  in the Tab order, the arrow keys (wrapping), Home and End, and
  `aria-selected` and `aria-controls` on each tab.
- **Cup profile:** Chiroso's typical notes from the research (L2) as
  chips: Jasmine & white flowers, Citrus acidity, Panela & peach, Silky
  body, Long sweet finish. Under them, **The mug**: "Jack Skellington cup,
  a nod to my favourite stop-motion film."
- **Where to drink it:** Café Mi Tierra · Bogotá, the owner's friend's shop.
- **Actions:** **Open in Google Maps** opens in a new tab with
  `rel="noopener noreferrer"`. **Back to room** takes focus when the card
  opens.

Under reduced motion, the tab transitions and the note's fade are off.

The halves of the grid use `minmax(0, 1fr)`, so a long word or the diagram
never pushes the card wider; the stats wrap inside their cells at 420 px and
become label/value rows under 700 px.

The card shows no third-party images and makes no requests. The facts come
from `odd/tasks/coffee-card.md` L2-L3. No street address was verified, so
the card links only the Maps place.
