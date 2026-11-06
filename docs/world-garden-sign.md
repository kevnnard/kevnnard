# World garden sign (garden-sign S1-S3)

The wooden sign in the front garden of `/world` is a quick notice. The
board shows the owner's availability and role. A flip-tile line rotates
three short messages, and a status lantern hangs from the right post.
Click the sign to get a cinematic close-up with a compact card on the
right. The desk monitor keeps the full portfolio. The design is
`design/garden-sign/01-wooden-board.html` (direction 01, chosen in S3).

| Part | Where |
| --- | --- |
| Status constant, sign and lantern geometry (pure) | `src/lib/world/garden.ts` (`GARDEN_SIGN`, `SIGN_LANTERN`, `signParts`) |
| Copy, flip timing, face layout, lantern glow, click box, card content (pure) | `src/lib/world/garden-sign.ts` |
| Camera path (pure) | `src/lib/world/sign-shot.ts` |
| Face, flip tiles, lantern glass and light, click | `src/components/world/GardenSign.tsx` (mounted by `Garden.tsx`) |
| Card | `src/components/world/SignCard.tsx`, `sign-card.css` |
| Wiring | `WorldScene.tsx` (`CINEMATIC_SHOTS.sign`), `WorldApp.tsx` (`signCards`) |
| Tests | `tests/world/garden-sign.test.ts` |

## Change the status

Edit one typed field, `GARDEN_SIGN.status` in `src/lib/world/garden.ts`:

| `status` | Board | Lantern | Card kicker | Card pill |
| --- | --- | --- | --- | --- |
| `"open"` (default) | OPEN TO WORK | emerald `#10b981` | OPEN TO WORK | Available for projects (dot pings) |
| `"busy"` | BACK SOON | amber `#ffc27a` | BUSY | Busy · not taking new projects (hollow dot) |

The copy lives in `signCopy` (`garden-sign.ts`). Nothing else needs to change.

## The board

- **Face:** a 2048x928 canvas in the panel's shape, so the text stays sharp in
  the close-up. It has a coral rule, the headline on one line (bold, up to
  220 px, shrunk only if it overflows), "Kevin Londoño · Software Engineer"
  with a coral dot, and the dark tile strip with its split line. Ink
  `#2b211c` on cream `#fff4e3`, and cream on ink inside the strip, both over
  7:1. System fonts only. The face is redrawn only when the status changes.
- **Flip tiles:** the rotating line sits on its own small plane, 1260x150, in
  front of the strip. `SIGN_MESSAGES` are "TypeScript full-stack",
  "Building Three Labs" and "React · Next.js · NestJS". Each one holds for
  3 s. In the last 0.3 s the line folds shut and the next one opens, done by
  scaling the plane on y. Only the small canvas redraws, once per change.
  The demand frameloop wakes for the flips only: a timer at each flip, then
  frames through it (`signTileWake`).
- **Reduced motion:** there is no flip. The line changes every 9 s.
- **"Based in":** this message and the city are left out until the owner
  gives a city.

## The lantern

An iron bracket from the right post holds a small cage with a brass finial.
The glass is lit in the status colour. Everything stays inside the sign's
0.45 m footprint, so the nature clearing doesn't change. By day the glass
glows faintly (emissive 0.35) so the colour still reads. At night it is
brighter (1.6), and a point light adds a soft glow (0.6 cd, 1.6 m reach,
decay 2). It uses the wall lanterns' gate (18:00 through 05:59) and the
scene panel's master power. The light is always mounted, at intensity 0
when off, so the light count never changes.

## The close-up

`sign-shot.ts` has the same shape as `coffee-shot.ts` (a static target):

- **Path:** a 2.5 s eased dolly in, with a sideways bow, and a 1.8 s exit
  that runs the same path backwards. Reduced motion cuts straight to the
  shot.
- **Final shot:** the target is the sign's middle at world (1.74, 0.47, 2.70).
  The eye is 2.3 m out, 6° down and 24° off the face toward the lantern
  side, at (2.67, 0.71, 4.79). The lens narrows from 35° to 28°. The angle
  keeps the lens clear of the bush right in front of the board, at
  (1.71, 4.57).
- **With the card:** at 1440x900 the shot slides 0.34 m toward screen
  right, putting the eye at (2.98, 0.71, 4.65). The sign stands centred in
  the free space left of the card, more than half the frame's height.
  - Shifts at other sizes: 1100x800 0.31 m, 1920x1080 0.28 m, 2560x1080 0.28 m.
  - At 700 px and under, the card stacks on top and the shot doesn't slide.
- **Tests:** the lens stays inside the island, out of the house and the
  plants. Nothing taller than the line of sight stands between it and the
  face corners or the lantern.
- **Inspect id:** `"sign"` is an inspect id (`DeskItemId`), so it is never
  on the collection rail. `galleryCaseFocus("sign")` gives the shot's end
  pose.

The click box covers the posts, board, cap and lantern. Like Cherry, the
sign is clickable only when the house doesn't stand between the camera and
the face, only from the room views that allow inspecting, and not while its
close-up is open.

## The card

The card belongs to the case-story family and uses the shared card motion
(`useCardPresence`). It is always open while the sign is inspected, and the
camera frames the sign to its left. The content comes from the site; nothing
is invented:

- **Kicker:** GARDEN SIGN, with the status on the right.
- **Name and role:** "Kevin Londoño", then "KEVNNARD · Software Engineer",
  from `AboutMe.astro`.
- **Availability pill**, then the one-line summary. The summary comes from
  the monitor's about buffer (`portfolioBuffers().about.summary`).
- **Core stack chips:** TypeScript, React, Next.js, React Native, Node.js,
  NestJS, PostgreSQL, Supabase, AWS. All are `level: "core"` in
  `Skills.astro`, and a test checks this.
- **Links:** LinkedIn and GitHub from `CONTACT_LINKS`, then CV English and
  CV Español from the about buffer's CV links. Each opens in a new tab with
  `rel="noopener noreferrer"`.
- **See my portfolio** closes the card and opens the desk terminal, the same
  action as Enter terminal. **Back to garden** takes focus when the card
  opens. Esc also leaves.
- **Left out on purpose:** there is no "Now" roles block. `SIGN_PROFILE.email`
  and `SIGN_PROFILE.city` are `null`. Once the owner sets them, an Email
  link and a "Based in" line render.
