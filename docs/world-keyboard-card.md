# Keyboard product card (/world)

Click the keyboard on the desk. The camera glides in to a product shot of it, like the coffee mug's, and a side card tells the owner's real keyboard: its switch, sound, keycaps and why he chose it, with a link to buy it on Amazon. Spec: `odd/tasks/keyboard-card.md` (T1/S1, T2/S2).

## What it reuses

| Piece | Where | How the keyboard uses it |
| --- | --- | --- |
| Inspection camera | `src/lib/world/gallery-camera.ts` | `KEYBOARD_VIEW` (the shot's end pose, from `keyboard-shot.ts`) joins `galleryView`, so `galleryCaseFocus` and `galleryStoryShift` frame it like a gallery item |
| Cinematic move | `src/lib/world/coffee-shot.ts` | `keyboard-shot.ts` mirrors it; `WorldScene`'s `CINEMATIC_SHOTS` map plays either |
| Inspection state | `WorldApp.tsx` `galleryCase` | Now an `InspectItemId` (`GalleryItemId \| DeskItemId`); Esc, the hidden HUD and the camera lock work as they already did |
| Story card look | `case-story.css` | `ProductCard.tsx` uses the football helmet's / coffee's card panel, head, blocks, actions and footprint, plus `product-card.css` |
| Click gate | the monitor's `canEnterMonitor` and an occluder raycast | `DeskHit` in `Setup.tsx` |

## The keyboard itself

The desk board is the owner's NuPhy Air75 V2 (black), rebuilt from the official listing. Spec: `odd/tasks/keyboard-faithful.md` (T1).

| Piece | Where |
| --- | --- |
| 84 caps: rows, widths, colour roles, legends, sources | `src/lib/world/keyboard-layout.ts` |
| Case, plate, caps and the two side light bars | `keyboard()` in `src/lib/world/setup.ts` |
| Legend atlas, 2048x768, 128 px a unit, about 20 KB | `public/world/keyboard/keyboard-legends.webp` |
| Atlas generator (needs `rsvg-convert` and `magick`) | `node scripts/prepare-keyboard-legends.mjs` |
| Legend decal: one quad per printed cap, one draw | `src/components/world/KeyboardLegends.ts` |

- The atlas is the board seen from above: each cap's legend sits in its own cell at the cap's place, so the UVs are the cap's cell.
- The atlas is prebaked, not drawn on a runtime canvas, so every machine gets the same font and the tests can check its size.
- It lives in `public/world/keyboard/`, because `public/world/textures/` is only for credited third-party maps.
- The F-row's media icons are left out, because they are unreadable at scene scale.
- Budget: about 9.5k triangles (84 caps, case, plate and legends).

## Data

`src/lib/world/desk-products.ts` holds the typed `DESK_PRODUCTS.keyboard` entry: kicker, title, subtitle, a three-cell stats strip, the switch (name, type, feel, sound, figures), the keycap chips (with swatches), the owner's "why" and `link: { label, url, affiliate }`.

- **Sources:** the Amazon listing for the owner's SKU [B0CMX8SLF6](https://www.amazon.com/dp/B0CMX8SLF6) (read 2026-11-05): "Gateron Moss Switch", the switch table "Moss (Tactile, 60gf) Pre-travel 1.7±0.4 mm, Total travel 3.0±0.2 mm, Operating force 60±15 gf, POM stem, long-pole, factory lubed", 84 keys, Bluetooth 5.1 / 2.4G / USB-C, PBT keycaps. nuphy.com sits behind a bot check.
- **Ours, not sourced:** the plain-words feel and sound lines (the listing's review summary only calls the sound "gentle") and the "Why I chose it" paragraph, which the owner allowed us to invent (keyboard-card L2).
- While `url` is `null`, the card shows a disabled "Link coming soon" button.
- When `affiliate` is `true`, `rel` also gets `sponsored`. The current link is a plain product link (`affiliate: false`).
- The card has no product photo and makes no third-party requests. The 3D keyboard is the visual; the keycap emblem and the keystroke trace are drawn SVG.

## Card

Top to bottom: kicker "DESK · KEYBOARD", title and subtitle with a keycap emblem, the stats strip (Layout, Profile, Connection), "Switches & sound" (Gateron Moss, four figures, feel, sound), "Keycaps" chips, "Why I chose it", then "View on Amazon" (new tab) and "Back to room" (focused on open). Breakpoints follow `case-story.css`: 500 px, 420 px under 1100 px, stacked above the board under 700 px. The card has no animation of its own.

## Camera

`keyboard-shot.ts` mirrors the coffee shot: `keyboardShotAt(t, from?, shift?)`, `keyboardLeaveAt` (the same path backwards), `keyboardShotProgress` (reduced motion jumps to the end, in and out) and `keyboardShotShift` (the card's slide).

| Value | Number |
| --- | --- |
| Target | the board's cap tops (-0.58, 0.975, -1.30) |
| Distance | 0.70 m |
| Pitch | 27° down |
| Azimuth | 45° from the chair side (+x) toward +z, a seated typist's front-left |
| Lens | 35° to 30° during the move |
| Move | 2.5 s in, 1.8 s out, cubic ease, a sideways bow of 10% of the travel (at most 0.3 m), the aim landing at 85% |
| Eye offset | [0.441, 0.318, 0.441] |

- **Eye position:** about (-0.14, 1.29, -0.86). With the card open at 1440x900 it slides 0.11 m to (-0.06, 1.29, -0.94).
- **Clearances (end pose, card open):** 0.14 m past the chair's whole box along z (the chair top is 1.38 m, above the eye), 0.76 m in front of the monitor, 0.34 m over the desk, inside no setup part. The default approach from behind the chair never enters a desk or chair part.
- **What's in frame:** the whole board, turned to 3/4, fits left of the 500 px card at 1440x900.
- **Going straight from the mug to the keyboard:** the move starts from the camera where it is, and leaving still returns to the room pose saved on arrival.

## Hitbox

`DESK_HITBOXES.keyboard` in `setup.ts` is the keyboard plus 1 cm on every side.

| Neighbour | Clearance |
| --- | --- |
| Mouse | 0.33 m along z |
| Mug | more than 0.5 m |
| Ultrawide's bottom edge | 0.13 m below it |
| Monitor's curved ends | in front of them along x |

A click counts only when all of these hold:

- The camera is inside the room.
- Nothing is in the way.
- The press was a click, not a drag.
- No other close-up holds the camera.

The ultrawide, the portrait screen, the mouse, the speakers, the lamp and the TV keep their own clicks. The terminal, portrait and speakers still open from the keyboard view and clear it.

## No collection rail

The keyboard is not on the `CollectionRail`:

- The rail lists the collection in room order, and its numbers ("WALL 01", "CASE 02"…) and "05 OBJECTS" count those things only.
- `GALLERY_ORDER` also feeds the Neovim picker.

The header is hidden while you inspect, so the card has its own "Back to room" button. That button takes focus when the card opens. Esc works too.

## Tests

`tests/world/keyboard-card.test.ts` covers:

- the data, the switch facts, keycaps and the "why"
- the desk-item guards
- the framing and chair clearance
- the cinematic shot: end pose, clearances, shift, eased arc and lens, reverse path, reduced motion
- the shift
- hitbox clearances
- the wiring (`Setup`, both `Setup` branches and `CINEMATIC_SHOTS` in `WorldScene`, `WorldApp`, `ProductCard`)
