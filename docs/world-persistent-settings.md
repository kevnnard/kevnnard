# World persistent settings (S1-S3)

`/world` remembers the visitor's scene lights and music between reloads.
A value only goes back to its default on a first visit, when the stored
value is missing or invalid, or when the visitor presses **Reset lights**
(lights only).

## What is stored

Two separate `localStorage` records, each a versioned JSON object
(`version: 1`). Saving one never rewrites the other.

| Key | Fields | Default |
| --- | --- | --- |
| `world:lights` | `lights.<id>.enabled`, `.color`, `.intensity` for `tv`, `setup`, `lampLeft`, `lampRight`; `power` (master) | See below; `power: true` |
| `world:music` | `volume` (0-1), `range` (0-1), `enabled` (play intent) | `0.5`, `1`, `true` |

Default lights (S3):

| Light | Color | Intensity |
| --- | --- | --- |
| TV backlight | `#a68d64` | 50 % |
| Setup (desk) backlight | `#ee2020` | 100 % |
| Left and right shelf lamps | `#ffffff` | 100 % |

A listening range of `1` is the slider's 100 % end: the initial view (see
`speaker-range.ts`).

Never stored: the clock, the day and night gate's effect, the current
track and position, loading or playing state, errors, and whether the tab
is hidden.

## Validation

`src/lib/world/world-preferences.ts` reads each known field on its own:

- A missing, wrongly typed or out-of-range field falls back to its own
  default. The other valid fields are kept.
- Colors must be `#rrggbb` (stored lowercase). Intensities must be finite
  numbers from 0 to 100 (rounded to whole percent). Volume and range must
  be finite numbers from 0 to 1. Flags must be booleans.
- Unknown fields are ignored and never written back.
- Invalid JSON, a non-object, or another `version` reads as all defaults.
- Blocked or full storage never throws: reads return defaults (or what a
  full storage still holds) and writes report `false`. The UI keeps
  working for the session.

Each load returns fresh objects, so changing them never touches the
defaults or another load.

## How WorldApp uses it

- Each record is read once, before the first render, and seeds the state.
- Each record is written only when its current value differs from what
  storage last held. Mounting never writes, so defaults never overwrite a
  stored choice. Each write carries the whole current record.
- **Reset lights** restores `DEFAULT_LIGHTS` for every light and saves
  that. It leaves the master switch and all music settings alone.
- The master switch only flips at night (as before) and is stored as the
  visitor left it.
- Volume and range are saved as the sliders or `+` / `-` keys change them.

## Music intent and gentle entry (S2)

`enabled` is the visitor's last explicit choice: Play/Pause, previous or
next (buttons, speaker click, keyboard). Right after each of those actions
WorldApp saves `music.getWanted()`. Playback state, autoplay blocks,
errors, a hidden tab and unmount never change it, so paused music stays
paused after a reload and a blocked start keeps the intent on.

When the world is ready, the listening range is measured and `enabled` is
true, WorldApp calls `bindMusicResume(music, document)` from
`speaker-resume.ts`. That effect runs after the volume and reach effects,
so the music starts at the stored level. The helper tries to start the
music with a fade. If the browser's autoplay policy blocks it, the helper
waits for the first trusted click or key. Its cleanup only removes those
listeners. It never pauses, so focusing a close-up or resizing doesn't
stop the music. Unmounting still disposes the music.

The browser decides whether audio may start without a gesture: no setting
here can promise autoplay.

## Tests

- `tests/world/world-preferences.test.ts`: defaults, reload through a fake
  storage, Reset then reload, separate records, malformed, partial and
  out-of-range values, blocked and full storage, no mutation.
- `tests/world/lights.test.ts`: the exact default lights.
- `tests/world/scene-panel.test.ts` and `tests/world/speaker-focus.test.ts`:
  WorldApp source wiring (stored seeds, Reset lights unchanged, transport
  intent writes, resume effect order and guards).

Audible behavior and the real autoplay policy still need a check in a
browser.

Physical speaker single-clicks use the same persisted Play/Pause callback
as the menu and console. Double-click remains focus-only.
