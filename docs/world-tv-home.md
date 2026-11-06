# Kevnnard TV — the living-room TV home screen

Task: `odd/tasks/tv-home-screen.md` T2. Design: `design/tv-home-screen/01-tv-os-overlay.html`.

## What it is

Click the TV in the living room of `/world`. The camera moves straight in to the panel, and a full-screen "Kevnnard TV" home screen opens over the scene. The world header, clock and lights panel hide while it is open, like in the other close-ups. Esc or **Back to room** closes it and returns the camera.

The screen has these parts:

- A top bar with the speakers' lo-fi status, the world clock and Back to room.
- A dock of seven apps: Movies & Series, Games, My videos, Channels, Anime, Highlights and Lo-fi radio.
- A hero for the picked title.
- A cover row for the selected app.
- A "Continue · from other apps" row.

Keys: the arrows move focus within and between the dock and the two rows. Enter selects a title. Enter on a selected collection opens its films or games, and its first cover (←) goes back. Esc leaves. Mouse and touch work the same way.

| File | Role |
| --- | --- |
| `src/lib/world/tv-library.ts` | The content: apps, titles, collections, the Continue row |
| `src/lib/world/tv-focus.ts` | Camera framing of the panel and the remote's arrow-key movement |
| `src/components/world/TvHome.tsx`, `tv-home.css` | The home screen |
| `Living.tsx` (hitbox), `WorldScene.tsx` (`"tv"` close-up), `WorldApp.tsx` (state) | Wiring |

## Editing the library

All content lives in `TV_APPS` in `src/lib/world/tv-library.ts`. `tests/world/tv-home.test.ts` pins it.

- **Add a title:** add an entry to the app's `titles`. Give it a unique `id`, the `title`, a `year` or a `meta` line, and one of the `COVER_MOTIFS` for the drawn cover.
- **Add a saga:** a single title with `films: [{ title, year }, …]` is one collection cover. It opens to its entries. `collectionNote` adds the owner's word, for example "all of them, favourites".
- **Add the owner's "Why I love it" words:** set `note: { text, draft }`. Never invent a note. The hero shows nothing when the note is empty.
- **Replace a sample row:** Anime and Highlights are still `sample: true`, labelled "Sample picks · replace with yours". Replace their titles and set `sample: false`.
- **Feature a title:** `TV_FEATURED` picks the hero shown when the TV opens. `TV_CONTINUE` lists the ids in the bottom row.
- **Add a video:** set `video: { src, poster, label }` on a title. Local files only, under `public/world/stories/`. The clip plays muted, with controls, and never autoplays.

## Third parties and cover licensing

Nothing on this screen loads from a third party. The trailer and channel buttons are disabled and say "coming soon" until the owner supplies the video ids. When they are added, use a privacy-enhanced embed and load it only after a click.

Covers are drawn CSS placeholders (a gradient, a motif and the title), never poster art. Real covers may only come from a licensed source that allows display with attribution, such as TMDB (films and series) or IGDB (games). Show the credit their terms require, and add it to the world credits. Never scrape or hotlink poster images.
