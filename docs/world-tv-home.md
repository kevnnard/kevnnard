# Kevnnard TV — the living-room TV home screen

Tasks: `odd/tasks/tv-home-screen.md` T2, T3, T7 and T8. Design: `design/tv-home-screen/01-tv-os-overlay.html`, laid out for the TV's 16:9 panel.

## What it is

The "Kevnnard TV" home screen is drawn on the living-room TV's own screen in `/world`, like the terminal on the desk monitor. In the room, the TV always shows a calm preview: the app dock, Ghost of Tsushima in the hero and a cover row.

Click or tap the TV. The camera moves straight in to frame the panel. The world header, clock and lights panel hide, as in the other close-ups. Once the camera arrives, the screen on the TV takes clicks and taps, and the remote's keys work. Esc or **Back to room** returns the camera, and the screen goes back to its preview.

The screen has these parts:

- A top bar with the speakers' lo-fi status, the world clock and Back to room.
- A dock of eight apps: Movies & Series, Games, My videos, Channels, Live, Anime, Highlights and Lo-fi radio.
- A hero for the picked title, with its main button.
- A cover row for the selected app, with the real TMDB posters and IGDB game covers (`docs/world-tv-covers.md`).
- A "Continue · from other apps" row.

Keys:

- The arrows move the focus ring within and between the dock and the two rows.
- Enter selects a title. Enter again on the same title runs its main action: it opens a collection, plays the clip, plays the lo-fi radio, plays a channel's latest uploads or a Twitch stream.
- In an opened collection, the first cover (←) goes back.
- Esc closes the player if one is open, then leaves.

A click or tap works the same way.

Screen readers and keyboard focus use an off-screen companion. It has the same items as named buttons, and the hero is a live region.

| File | Role |
| --- | --- |
| `src/lib/world/tv-library.ts` | The content: apps, titles, collections, the Continue row |
| `src/lib/world/tv-screen.ts` | The remote's state, what each press does, and where each item sits on the 1600 x 896 screen |
| `src/lib/world/tv-focus.ts` | Camera framing of the panel and the remote's arrow-key movement |
| `src/components/world/TvScreen.tsx` | Draws the screen as a canvas texture on the TV's glass (`TV_SCREEN` in `living.ts`) and hit-tests clicks by UV |
| `src/components/world/TvHome.tsx`, `tv-home.css` | The off-screen companion: keys, named buttons, the clip's `<video>` |
| `src/lib/world/tv-media.ts` (generated) | YouTube channel ids, Twitch logins, trailers, and `tvEmbedSrc` for the official players |
| `src/components/world/TvPlayer.tsx`, `tv-player.css` | The player framed on the glass: YouTube or Twitch, Back, the credit line |
| `scripts/prepare-tv-media.mjs` | Resolves `tv-media.ts` once, at prepare time |
| `Living.tsx` (screen), `WorldScene.tsx` (`"tv"` close-up), `WorldApp.tsx` (state) | Wiring |

The screen redraws only when what it shows changes. While the clip plays, it redraws every frame. Nothing on the screen animates by itself. The camera's move follows the reduced-motion setting, like the other close-ups.

## Editing the library

All content lives in `TV_APPS` in `src/lib/world/tv-library.ts`. `tests/world/tv-home.test.ts` pins it.

- **Add a title:** add an entry to the app's `titles`. Give it a unique `id`, the `title`, a `year` or a `meta` line, and one of the `COVER_MOTIFS` for the drawn cover. For a film or game, rerun `scripts/prepare-tv-covers.mjs` to add its real cover (`docs/world-tv-covers.md`).
- **Add a saga:** a single title with `films: [{ title, year }, …]` is one collection cover. It opens to its entries. `collectionNote` adds the owner's word, for example "all of them, favourites".
- **Add the owner's "Why I love it" words:** set `note: { text, draft }`. Never invent a note. The hero shows nothing when the note is empty.
- **Replace a sample row:** Anime and Highlights are still `sample: true`, labelled "Sample picks · replace with yours". Replace their titles and set `sample: false`.
- **Feature a title:** `TV_FEATURED` picks the hero of the preview, shown again each time the TV opens. `TV_CONTINUE` lists the ids in the bottom row.
- **Add a video:** set `video: { src, poster, label }` on a title. Local files only, under `public/world/stories/`. The clip plays muted on the TV, only after a click or key press, and the companion keeps its native controls.

## Videos and live streams (T8)

The TV plays three kinds of third-party video, all in the official players:

| What | Where | Button | Player URL |
| --- | --- | --- | --- |
| A channel's latest uploads | Channels | Main: **Play latest uploads · YouTube** | `https://www.youtube-nocookie.com/embed/videoseries?list=UU<id without UC>` |
| A channel's live stream | Channels | Second: **Live now · YouTube** | `https://www.youtube-nocookie.com/embed/live_stream?channel=<id>` |
| A film's or game's trailer | Movies, Games (single titles and each entry of an opened collection) | Second: **Watch trailer · YouTube** | `https://www.youtube-nocookie.com/embed/<video id>` |
| A Twitch stream | Live | Main: **Watch on Twitch · muted** | `https://player.twitch.tv/?channel=<login>&parent=<host>&muted=true&autoplay=false` |

- **Nothing loads before a press.** The player and its iframe exist only after the visitor presses play (a click, a tap or Enter). The idle preview in the room never shows it.
- **Muted.** YouTube starts muted (`mute=1`); the visitor unmutes in the player. Twitch starts muted and waits for its own play button.
- **On the TV.** `TvPlayer` is a page framed on the TV's glass with drei's `<Html transform occlude="blending">`, like the portrait monitor's YouTube tab. Cross-origin video cannot be drawn into the canvas, so it is a DOM page over the panel. It has a top bar with **Back to Kevnnard TV**, the title, and Latest uploads / Live now for a channel, and a credit line under the video.
- **Esc order.** Esc closes the player first and leaves the home screen as it was. A second Esc returns the camera to the room. While the keyboard is inside the YouTube or Twitch frame, the page cannot hear Esc, so use Back. Any other press on the companion closes the player too.
- **Twitch `parent`.** It is `window.location.hostname` at runtime, so localhost, 127.0.0.1 and the production domain all work. Twitch shows its own offline screen when a channel is not live. The browser makes no Twitch API call. A "live now" badge would need a server-side check, so the Twitch secret never ships (T6).
- **Highlights** stays "Watch on YouTube · coming soon": it is still a sample row without video ids.

### Update the media

```sh
node scripts/prepare-tv-media.mjs
node --test tests/world/tv-media.test.ts tests/world/tv-home.test.ts
```

It uses the same keys as `scripts/prepare-tv-covers.mjs`, read from the environment or the gitignored `.env`: TMDB for film trailers, and the IGDB pair (a Twitch app) for game trailers and Twitch Helix `/users`. It never prints, logs or writes them, and errors are redacted (`tests/world/tv-media.test.ts` pins every line that touches a key).

- **Channels:** `CHANNELS` in the script maps each Channels title to its `@handle` and the name its page must show. The script reads `https://www.youtube.com/@<handle>`, takes the channel id (`externalId`, which must match the canonical link), and checks with YouTube's oEmbed that the uploads playlist belongs to the same handle. A new channel: add it to the library, then to `CHANNELS`.
- **Twitch:** `TWITCH` maps each Live title to its login; Helix `/users` must return it.
- **Trailers:** for each film, TMDB `/movie/{id}/videos` filtered to YouTube trailers, official first, then English, then the earliest. For each game, IGDB's game videos, trailers first. A candidate counts only when YouTube's oEmbed says it is public and embeddable. A trailer already in `tv-media.ts` is kept while it still qualifies, so a rerun does not drift. Titles without one are listed in `TV_TRAILERS_MISSING`, and the button does not show.

First run, 2026-11-06: 5 channels (midudev `UC8LeXCWOalN8SxlrPcG-PaQ`, Gentleman Programming `UCbx_d228PdYwgB4Jz202SIQ`, Fazt `@FaztTech` `UCX9NJ471o7Wie1DQe94RVIg`, Soy Dalto `UCtoo4_P6ilCj7jwa4FmA5lQ`, Theo `@theo` `UCbRP3c757lWg9M-U7TyEkXA`), 3 Twitch users, and 50 of 50 trailers. `@fazt` is a different person. `@t3dotgg` points to Theo's channel, but its uploads list `@theo` as the handle. Some trailers are uploads by archive channels: TMDB lists them, but not as official.

YouTube and Twitch are credited in the menu's Credits ("Videos on the TV", "Live streams on the TV") as third-party players. The content belongs to its creators.

## Covers on the screen

The screen draws the real covers of `TV_COVERS` in `src/lib/world/tv-covers.ts` (T7, S7): TMDB posters for films and IGDB covers for games. They come from the shipped `public/world/tv/covers/*.webp` only. The site never requests TMDB, IGDB or any other host for them.

- **Which cover:** `tvCoverSrc` in `tv-screen.ts` looks up a title by its library id. It looks up a film or game inside a collection by `coverKey(collectionId, entry)`. Each cover item and the hero carry the result as `cover`.
- **Hero:** the picked title's cover, at its own proportions, centred on a dimmed and blurred fill of the same image. The title and meta stay on the dark side.
- **Rows:** each cover fills its card (object-fit: cover). A gradient scrim keeps the title and year legible over the image.
- **Continue row:** the owner's clip shows its own local poster (`video.poster`). Channels, Highlights and the lo-fi radio have no covers, so they keep their motif.
- **Fallback:** the title's motif is drawn when it has no cover, while the image loads, or if it fails to load.

`TvScreen.tsx` loads each image of `tvImageSources(layout)` once, into a cache shared by every screen. It waits for `decode()` before it draws an image. Each decoded image triggers one redraw, so the idle preview in the room shows the covers too.

## Cover licensing

Real covers may only come from a licensed source that allows display with attribution: TMDB for films and series, IGDB for games. Show the credit their terms require, and add it to the world credits (see `docs/world-tv-covers.md`). Never scrape or hotlink poster images.
