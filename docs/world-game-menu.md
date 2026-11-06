# World game guide

The `/world` Menu opens a game-style guide (`odd/tasks/world-game-menu.md` T1, S2–S5), implemented from `design/world-game-menu/01-game-guide.html`. The TV, Collection and Cherry tabs come from `odd/tasks/guide-menu-new.md` T1.

## Where things live

| Piece | File |
| --- | --- |
| Modal, tabs and action buttons | `src/components/world/WorldMenu.tsx` |
| Guide styles (dialog, sheet, tabs, keys, credits) | `src/components/world/world-menu.css` |
| Section text, documented keys, links, actions | `src/lib/world/world-guide.ts` |
| One original inline SVG per section | `src/components/world/WorldGuideIllustration.tsx` |
| Curated credits view of `public/world/credits.json` | `src/lib/world/world-credits.ts` |
| Credits tab body (`CreditsList`) | `src/components/world/CreditsDialog.tsx` |
| Action wiring | `menuActions` in `src/components/world/WorldApp.tsx` |

## Behavior

- **Modal.** A native `<dialog>` opened with `showModal()`. The camera, clock and lights panel stay mounted but are inert behind it. Esc (the dialog's own cancel), the Close button or a click on the backdrop closes it, and focus returns to the Menu button.
- **Tabs.** Kevnnard Home, Controls, Terminal, Video, TV, Kevnnard Lo-fi, Collection, Cherry and Credits follow the tablist pattern: one tab stop, Left/Right arrows wrap, Home/End jump. Selection follows focus. Only the selected panel is rendered.
- **Tab order.** The tabs are grouped by place: the desk (Terminal, Video), the living room (TV, Lo-fi), the collection, the front yard (Cherry), then Credits last.
- **Tab bar.** The guide's name and Close sit on the first row, and the tabs get their own row below. All nine tabs fit on one row of the 62rem guide (measured at 1440 and 1100 px: 954 of 992 px). On narrower windows (900 and 700 px, phones) the row scrolls sideways, as it always has. A focused tab scrolls into view.
- **Actions.** The buttons run the callbacks the old dropdown ran: Enter terminal, Watch video, Play/Pause music, Focus speakers and Recenter view. The guide closes first, so each close-up's own focus handling (Exit buttons, the console's Play, the terminal) works as before. The close-ups are offered only once the world is ready.
  - **Watch TV** runs `enterTv`, the same callback as a click on the TV.
  - **Open collection** inspects `GALLERY_ORDER[0]` (the katanas), as a click does. **See the desk** inspects the keyboard.
  - **Meet Cherry** (`cherryMeeting` in `cherry.ts`) inspects her right away during her hours (06:00–11:59). Outside them, the button reads **Meet Cherry · morning**. It moves the world clock to 08:00 with the time card's own `setHours`, then inspects her once her one-second fade-in has run (at once with reduced motion). A close-up started during that wait cancels it.
- **No new key bindings.** The guide adds no document listeners. It only documents the existing keys:
  - Terminal: `a`/`p`/`e`/`c`, `j`/`k`, Esc (from `terminal-content.ts`).
  - Speaker focus only: Space, `n`, `p`, `+`/`−`, Esc (from `speaker-console.ts`).
  - Camera: drag or one finger orbits; wheel, middle-button drag or a two-finger pinch zooms; no panning (from `WorldScene.tsx`).
  - TV: the arrows move, Enter selects (again opens or plays), Esc closes the player and then leaves (from `tvMove` and `tvHomeAction` in `tv-screen.ts`, driven by `TvHome.tsx`).
  - Collection: Left/Right on the rail (`CollectionRail.tsx`), Esc back to the room.

  `tests/world/world-guide.test.ts` checks each documented key against those helpers.
- **Links.** Home links to the static portfolio (`/`) and to `CONTACT_LINKS`, the same profiles the terminal shows.
- **Shared trigger.** The Menu button and the portfolio link carry `world-hud-trigger` from `world-hud.css`, which the compact-HUD work owns. `world-menu.css` does not restyle them. `pointer-events-auto` is a class on both because their header ignores the pointer.

## Credits

The Credits tab is a curated view. `public/world/credits.json` and `scripts/prepare-world.py` are unchanged and keep their full provenance.

| Credits group | What it lists |
| --- | --- |
| Music | gentle-stream by Alan Buscaglia (Gentleman Programming). Shows the MIT license, a link to the engine at its pinned commit, the shipped license file, the track manifest and the five track names. |
| Inspiration | Bruno Simon, credited as inspiration for parts of the world, not as its author. |
| Assets | Every external pack with its author, license and source, plus the files it supplies. Bruno Simon's room pack lists the chair and LED maps and the ported effects, with its license string exactly as recorded: a private permission, not a public license. |

The site's own procedural work (`original`) is not listed as a third-party acknowledgement.

## Verification limits

Every check is structural or pure-helper (`node --test`). No DOM runner or browser was used, so modal focus, backdrop clicks and layout still need a real browser.
