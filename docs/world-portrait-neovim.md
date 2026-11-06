# Portrait screen: Neovim

The vertical (portrait) monitor on the desk runs Neovim (`odd/tasks/portrait-neovim.md`, T1–T2).

## From the room: the idle preview

The screen types real code from this repository in a loop, so it is always alive from the room.

- **What it types:** verbatim excerpts of `src/lib/world/random.ts`, `gallery-camera.ts`, `speaker-range.ts` and `wheel.ts`, each named in the bufferline and the statusline. `tests/world/nvim.test.ts` fails if a file stops containing its excerpt.
- **How:** each file opens empty (`[New]`), INSERT types it at an uneven human pace with autoindent, then Esc, `:w` and the `written` message, then the next file.
- **Look:** design/system.md dark tokens (zinc and the emerald accent), line numbers, a lualine-like statusline (mode, branch `feat/interactive-room`, file, filetype, `line:col`) and a bufferline.
- **Cost:** a canvas texture (`NvimScreen.tsx`, `NvimPreview`). It ticks every 120 ms and uploads only when the frame changed. It rests on its last frame when the room view is not facing the screen up close, during the terminal close-up, or when the tab is hidden. Reduced motion shows one still frame. With the night master off, the screen goes dark.

Source: `src/lib/world/nvim-preview.ts` (excerpts, highlighter, timeline, layout).

## Entered: the playable Neovim

Click the screen (or **Watch video** in the menu) to enter the close-up. The page has three tabs: **NVIM** (the default), **Gentleman** and **NestJS**.

### Modes and keys

| Keys | What they do |
| --- | --- |
| `h` `j` `k` `l`, arrows | Move |
| `w` `b` | Next / previous word |
| `0` `$` | Start / end of the line |
| `gg` `G` | First / last line |
| `i` `a` `I` `A` `o` `O` | Insert (Esc returns to NORMAL) |
| `x` `dd` `yy` `p` `P` | Delete a character, delete / yank a line, paste below / above |
| `u` | Undo (one step per insert session) |
| `V` then `d` / `y` | Select whole lines, then delete or yank them |
| `:` | Command line |

### Commands

Listed in `:help`:

| Command | Result |
| --- | --- |
| `:help` | The command list |
| `:w` | Writes the buffer (kept until the page is left) |
| `:q` | You can't quit Vim. With unsaved changes: `E37` |
| `:wq`, `:x`, `:q!`, `:qa!` | Still can't quit Vim |
| `:{number}` | Go to that line |
| `:Kevnnard`, `:about` | The bio card: the site's existing about copy, current roles and CV links |
| `:Gentleman` | Opens the Gentleman Programming tab (the YouTube player) |
| `:Nest`, `:NestJS` | Opens the NestJS Controllers documentation tab |
| `:Lazy` | A lazy.nvim-style list of the site's real stack at `package.json` versions |
| `:Telescope` | Fuzzy finder over the collection (case stories) and the room's places (guide copy) |
| `:checkhealth` | A playful health report: the test count when this was written, the measured fps |

Secret (not in `:help`):

| Command | Result |
| --- | --- |
| `:smile` | An ASCII smiley |
| `:Hitman` | The Hitman titles in the TV library (`tv-covers.ts`) |
| `:Tsushima` | The owner's Ghost of Tsushima words from the katana story |

Anything else answers like Vim: `E492: Not an editor command`.

### Leaving and focus

- Keyboard focus moves into the editor when the close-up opens. The editor keeps its keys; the room never sees them.
- **Esc in NORMAL mode** (no pending operator, panel or picker) leaves the close-up, as before. Esc anywhere else returns to NORMAL or closes the floating window.
- On the Gentleman or NestJS tab, Esc returns to NVIM. Esc pressed inside an iframe stays in the iframe; **Back** and **Exit portrait** always leave.
- A polite live region announces the mode and every command's output.
- Leaving resets the page to the NVIM tab; the buffer stays until the page reloads.

Source: `src/lib/world/nvim-editor.ts` (the pure editor), `src/components/world/NvimScreen.tsx` (`NvimEditor`), `src/components/world/PortraitScreen.tsx` (tabs and views).

## Content rules

Every easter egg repeats what the site already says. Nothing is invented, executed or fetched:

- `:about` uses `portfolioBuffers().about` (the homepage JSON).
- `:Telescope` uses `CASE_STORIES` and `GUIDE_SECTIONS`.
- `:Hitman` uses `TV_COVERS`.
- `:Tsushima` uses the katana story.
- `:Lazy` uses versions that the tests compare with `package.json`.
