# TV covers (TMDB posters)

The living-room TV's Movies app shows real film posters (tv-home-screen T4,
S7). They come from [TMDB](https://www.themoviedb.org), are downloaded once at
prepare time and ship as small WebP files. The site never calls TMDB at
runtime.

| What | Where |
| --- | --- |
| Script | `scripts/prepare-tv-covers.mjs` |
| Posters | `public/world/tv/covers/<slug>.webp` (w342 source, ≤ 40 KB, 300–342 px wide) |
| Manifest (generated) | `src/lib/world/tv-covers.ts` |
| Attribution | `services` in `public/world/credits.json`, shown under Credits → Film posters |
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

Games and channels have no covers yet. IGDB keys are still missing.

## Rerun the script

Requirements: Node 24 or later, ImageMagick 7 (`magick`) with WebP, and one
TMDB key in the gitignored `.env` (mode 600):

```sh
TMDB_READ_ACCESS_TOKEN=...   # preferred, sent as a Bearer header
TMDB_API_KEY=...             # fallback, v3 key
```

```sh
node scripts/prepare-tv-covers.mjs
node --test tests/world/tv-covers.test.ts tests/world/credits.test.ts
```

The script reads the keys from the environment, or from `.env` when the
environment has neither. It never prints, logs or writes them, and errors are
redacted. A rerun re-verifies every pinned id against TMDB (title and year).
It downloads a poster again only when its WebP is missing or no longer
matches the manifest, so an unchanged library gives a byte-identical manifest.

Output: one `got`/`kept` line per cover, then
`<n> posters, <bytes> B, <n> covers`. Any `Unpinned matches` and
`Doubtful matches` follow.

## Add a film or fix a wrong match

`PINS` in the script maps each cover key to `[tmdbId, posterPath]`.

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

The first run on 2026-11-05 resolved all 41 posters; every one is pinned. Six
searches had two exact title-and-year hits: Pirates 1 and 2, Kill Bill Vol. 1
and 2, Eternal Sunshine and The Nightmare Before Christmas. In each case the
script kept the canonical entry, the one with the most votes (ids 22, 58, 24,
393, 38, 9479).

## Licensing

- TMDB's terms require this notice, shown verbatim in Credits with a link to
  https://www.themoviedb.org: "This product uses the TMDB API but is not
  endorsed or certified by TMDB."
- The posters belong to their studios and rights holders. They are shown for
  personal, non-commercial reference only, and are not relicensed by this
  repository.
- `scripts/prepare-world.py` keeps the `services` entry when it rebuilds
  `credits.json` (`kept_credits`).
