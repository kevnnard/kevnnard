# TV covers (TMDB posters, IGDB game covers)

The living-room TV shows real cover art (tv-home-screen T4, T5, S7): film
posters from [TMDB](https://www.themoviedb.org) in the Movies app and game
covers from [IGDB](https://www.igdb.com) in the Games app. They are
downloaded once at prepare time and ship as small WebP files. The site never
calls TMDB or IGDB at runtime.

| What | Where |
| --- | --- |
| Script | `scripts/prepare-tv-covers.mjs` |
| Covers | `public/world/tv/covers/<slug>.webp` (TMDB w342 or IGDB t_cover_big_2x source, ≤ 40 KB, 300–342 px wide) |
| Manifest (generated) | `src/lib/world/tv-covers.ts` |
| Attribution | `services` in `public/world/credits.json`, shown under Credits → Film posters and Credits → Game covers |
| Tests | `tests/world/tv-covers.test.ts`, `tests/world/credits.test.ts` |

## What gets a cover

Every film in the Movies app of `src/lib/world/tv-library.ts`, and one cover
per collection:

- Every film: single films are keyed by their library id (`perfume`); films
  inside a collection by `coverKey(collectionId, film)`, for example
  `harry-potter/harry-potter-and-the-philosopher-s-stone-2001`.
- Harry Potter and Pirates of the Caribbean collections: TMDB's own
  collection poster.
- Quentin Tarantino, Jim Carrey and American football films collections: the
  poster of a fixed representative film, set in `REPRESENTATIVE` in the
  script and recorded as `representative` in the manifest. They are Pulp
  Fiction, The Truman Show and Remember the Titans.

Every game in the Games app gets an IGDB cover, under the same keys:

- Single games by their library id: `ghost-of-tsushima`, `gta-san-andreas`.
- God of War is a series entry with no year. It shows the cover of God of
  War (2018), set in `SERIES_YEAR` in the script and recorded as
  `representative: "god-of-war-2018"` in the manifest.
- The 8 Hitman games by `coverKey("hitman", game)`, for example
  `hitman/hitman-blood-money-2006`. The collection cover is the fixed
  representative Hitman: Blood Money (2006), the best-known PS2 game (the
  owner asked for "Hitman de la Play 2"). It is set in `REPRESENTATIVE`.

Film covers carry `tmdbId` and `poster`, game covers `igdbId` and `imageId`
(`TvFilmCover` and `TvGameCover` in the manifest). Channels have no covers.

## Rerun the script

Requirements: Node 24 or later, ImageMagick 7 (`magick`) with WebP, one
TMDB key and the IGDB pair in the gitignored `.env` (mode 600):

```sh
TMDB_READ_ACCESS_TOKEN=...   # preferred, sent as a Bearer header
TMDB_API_KEY=...             # fallback, v3 key
IGDB_CLIENT_ID=...           # a Twitch app (dev.twitch.tv/console),
IGDB_CLIENT_SECRET=...       # confidential client
```

IGDB needs a Twitch app access token. The script gets one at each run from
`https://id.twitch.tv/oauth2/token` (client credentials, posted as a form
body) and keeps it in memory only. It then queries IGDB v4 `/games` (with the
cover's image id) at most one request every 300 ms, under IGDB's limit of 4
per second, and downloads the covers from `images.igdb.com`. It uses
`t_cover_big_2x` (528 px) and scales it down, because `t_cover_big` is only
264 px wide.

```sh
node scripts/prepare-tv-covers.mjs
node --test tests/world/tv-covers.test.ts tests/world/credits.test.ts
```

The script reads the keys from the environment, or from `.env` when the
environment lacks a TMDB key or the IGDB pair. It never prints, logs or
writes the keys or the token, and errors are redacted. A rerun re-verifies
every pinned id against TMDB or IGDB (title and year). It downloads an image
again only when its WebP is missing or no longer matches the manifest, so an
unchanged library gives a byte-identical manifest and `credits.json`.

Output: one `got`/`kept` line per cover, then
`<n> posters, <bytes> B; <n> game covers, <bytes> B; <n> covers`. Any
`Unpinned matches` and `Doubtful matches` follow.

## Add a film or fix a wrong match

`PINS` in the script maps each film cover key to `[tmdbId, posterPath]`.

- **New film in the library:** run the script. It searches TMDB
  (`search/movie` with the release year) and prints the match under
  `Unpinned matches`. Check it on themoviedb.org, then paste the line into
  `PINS` and run the script again.
- **Wrong film:** find the right film on themoviedb.org. Its id is the number
  in `https://www.themoviedb.org/movie/<id>`. Put that id and the poster path
  you want in the pin, then rerun. If the pinned film's title or year does not
  match the library, the script lists it under `Doubtful matches`.
- **Another poster for the same film:** take a path from the film's Images →
  Posters page on TMDB (`/xxxx.jpg`), put it in the pin, then rerun.
- **Removed film:** drop its pin, delete its WebP and rerun. The tests reject
  any poster the manifest does not list.

## Add a game or fix a wrong match

`GAME_PINS` in the script maps each game cover key to `[igdbId, imageId]`.

- **New game in the library:** run the script. It searches IGDB (`search`
  on `/games`, then an exact `name ~` query when the search misses) and keeps
  the hits whose name and first release year match the library. It prints
  the match under `Unpinned matches`. Check it on igdb.com, then paste the
  line into `GAME_PINS` and run the script again.
- **Wrong game:** find the right game on igdb.com. Its id is on the game's
  page, or ask the API: `fields id,name,first_release_date,cover.image_id;
  search "<title>";` on `/v4/games`. Put the id and its cover's `image_id`
  in the pin, then rerun. If the pinned game's name or year does not match
  the library, the script lists it under `Doubtful matches`.
- **Another cover for the same game:** IGDB has one cover per game. For a
  different edition, pin that edition's game id and cover.
- **A series entry without a year:** add it to `SERIES_YEAR` with the year of
  the game whose cover it should show.
- **Removed game:** drop its pin, delete its WebP and rerun.

## First runs

The first TMDB run on 2026-11-05 resolved all 41 posters; every one is pinned. Six
searches had two exact title-and-year hits: Pirates 1 and 2, Kill Bill Vol. 1
and 2, Eternal Sunshine and The Nightmare Before Christmas. In each case the
script kept the canonical entry, the one with the most votes (ids 22, 58, 24,
393, 38, 9479).

The first IGDB run, also on 2026-11-05, resolved all 11 game covers
(181,462 B). Each had exactly one exact name-and-year match, so none was
doubtful; every one is pinned.

## Licensing

- TMDB's terms require this notice, shown verbatim in Credits with a link to
  https://www.themoviedb.org: "This product uses the TMDB API but is not
  endorsed or certified by TMDB."
- The posters belong to their studios and rights holders. They are shown for
  personal, non-commercial reference only, and are not relicensed by this
  repository.
- Game data and covers come from IGDB, credited under Credits → Game covers
  with a link to https://www.igdb.com. The covers belong to their publishers
  and rights holders. They are shown for personal, non-commercial reference
  only, and are not relicensed by this repository.
- `scripts/prepare-world.py` keeps the `services` entries when it rebuilds
  `credits.json` (`kept_credits`).
