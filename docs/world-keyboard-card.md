# Keyboard product card (/world)

Click the keyboard on the desk. The camera moves to a still shot of it and a side card shows the owner's real keyboard, with a link to buy it on Amazon. Spec: `odd/tasks/keyboard-card.md` (T1, S1).

## What it reuses

| Piece | Where | How the keyboard uses it |
| --- | --- | --- |
| Inspection camera | `src/lib/world/gallery-camera.ts` | `KEYBOARD_VIEW` joins `galleryView`, so `galleryCaseFocus` and `galleryStoryShift` frame it like a gallery item |
| Inspection state | `WorldApp.tsx` `galleryCase` | Now an `InspectItemId` (`GalleryItemId \| DeskItemId`); Esc, the hidden HUD and the camera lock work as they already did |
| Lo-fi card look | `katana-story.css` | `ProductCard.tsx` uses the katana card's panel and footprint, plus a small `product-card.css` |
| Click gate | the monitor's `canEnterMonitor` and an occluder raycast | `DeskHit` in `Setup.tsx` |

## Data

`src/lib/world/desk-products.ts` holds the typed `DESK_PRODUCTS.keyboard` entry. It has the kicker, title, the owner's one line, specs, and `link: { label, url, affiliate }`.

- While `url` is `null`, the card shows a disabled "Link coming soon" button.
- When `affiliate` is `true`, `rel` also gets `sponsored`. The current link is a plain product link (`affiliate: false`).
- The card has no product photo and makes no third-party requests. The 3D keyboard is the visual.

## Camera

`KEYBOARD_VIEW` is a fixed shot. Every target-relative offset below comes from `src/lib/world/gallery-camera.ts`.

| Value | Number |
| --- | --- |
| Target | `KEYBOARD.center` (-0.58, 0.9665, -1.30) |
| Eye offset | [0.40, 0.46, 0] |
| Distance | 0.61 m |
| Pitch | about 49° down |
| Field of view | `GUIDE.fov` 35° |

- **Eye position:** about (-0.18, 1.43, -1.30). That is over the seat and about 0.19 m in front of the chair pivot. It sits inside no desk part (checked against rotated bounds).
- **What's in frame:** the whole 0.316 m board fits left of the 500 px card at 1440x900. The ultrawide's bottom edge stays above the frame.
- **Shift with the card open:** screen right at the desk is world -z, so the board slides left of the card.

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

- the data
- the desk-item guards
- the framing and chair clearance
- the shift
- hitbox clearances
- the wiring (`Setup`, both `Setup` branches in `WorldScene`, `WorldApp`, `ProductCard`)
