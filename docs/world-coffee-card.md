# World coffee card (coffee-card S1)

Click the coffee mug on the desk in `/world`. The camera dollies slowly onto
the steaming mug and ends on a low, close 3/4 shot. A side card then tells
you about the owner's favourite coffee, Chiroso, and where to drink it:
Café Mi Tierra in Bogotá, a friend's coffee shop.

| Part | Where |
| --- | --- |
| Card copy (pure) | `src/lib/world/desk-stories.ts` |
| Camera path and click box (pure) | `src/lib/world/coffee-shot.ts` |
| Side card | `src/components/world/CoffeeCard.tsx`, `coffee-card.css` |
| Click target | `src/components/world/CoffeeHitbox.tsx` |
| Tests | `tests/world/coffee-card.test.ts` |

## The shot

- **End pose:** the camera aims just under the rim (mug base + 0.075 m), so
  the steam rises in the upper frame. It sits 0.42 m out and 9° down,
  approaching from the chair's side and turned 30° toward the desk's middle.
  From there the handle shows.
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

The click box covers the mug, its handle (0.0705 m toward +x) and the wooden
coaster, plus 1 cm on each side. It runs from the desk top to 1 cm over the
rim. The tests check its clearances: the mouse, the mat, the keyboard and its
hitbox, and the ultrawide all stay clear. Like the keyboard's box, it only
answers when the camera is inside the room and nothing sits in front of the
mug, and a drag past 6 px is not a click.

## The card

The card uses the katana card's lo-fi console look and has these parts:

- kicker, title and one line
- **Processes:** Washed, Honey and Natural, each with a tasting note
- **Where to drink it**
- **Back to room** and **Open in Google Maps** buttons. The Maps link opens
  in a new tab with `rel="noopener noreferrer"`.

The card has no images and makes no third-party requests. The facts come from
`odd/tasks/coffee-card.md` L2-L3. No street address was verified, so the card
links only the Maps place.
