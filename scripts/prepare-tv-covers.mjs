#!/usr/bin/env node
// Download the living-room TV's covers once, at prepare time (tv-home-screen
// T4, T5, S7): a TMDB poster for every film in the Movies app of
// src/lib/world/tv-library.ts, an IGDB cover for every game in its Games app,
// and a cover for each collection.
//
// Usage:
//   node scripts/prepare-tv-covers.mjs
//
// Keys, read from the environment or the gitignored .env:
// - TMDB_READ_ACCESS_TOKEN (sent as a Bearer header, preferred) or
//   TMDB_API_KEY.
// - IGDB_CLIENT_ID and IGDB_CLIENT_SECRET, a Twitch app's credentials,
//   traded for an app access token (client credentials) at id.twitch.tv.
// None of them, nor the token, is ever printed, logged or written; every
// error is redacted before it shows. Needs ImageMagick 7 (`magick`) with WebP
// support.
//
// 1. Resolve each title to a TMDB or IGDB id. Pinned ids (PINS, GAME_PINS
//    below) are fetched and re-verified by title and year; unpinned ones are
//    searched (TMDB search/movie with the year, search/collection; IGDB
//    /games search) and printed as pins to paste here, so a rerun cannot
//    drift and a wrong match is fixed by editing its pin.
// 2. Download each pinned image (TMDB w342, IGDB t_cover_big_2x), only when
//    the shipped WebP is missing or no longer matches the manifest, and
//    convert it to WebP under COVER_MAX_BYTES into public/world/tv/covers/.
// 3. Write src/lib/world/tv-covers.ts and the TMDB and IGDB entries in
//    public/world/credits.json. The site never calls TMDB or IGDB at
//    runtime.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COVERS = join(ROOT, "public/world/tv/covers");
const MANIFEST = join(ROOT, "src/lib/world/tv-covers.ts");
const CREDITS = join(ROOT, "public/world/credits.json");
const API = "https://api.themoviedb.org/3";
const IMAGES = "https://image.tmdb.org/t/p/w342";
const TWITCH_TOKEN = "https://id.twitch.tv/oauth2/token";
const IGDB_API = "https://api.igdb.com/v4";
// t_cover_big is 264 px wide, under the 300 px floor; its 2x variant is the
// same cover at 528 px, scaled down here.
const IGDB_IMAGES = "https://images.igdb.com/igdb/image/upload/t_cover_big_2x";
/** IGDB allows 4 requests per second; keep under it. */
const IGDB_INTERVAL_MS = 300;
const COVER_MAX_BYTES = 40 * 1024;

/** Collections TMDB has its own poster for; the rest use a film's poster. */
const TMDB_COLLECTIONS = ["harry-potter", "pirates-of-the-caribbean"];

/** A deterministic, recorded choice: the collection's best-known entry. */
const REPRESENTATIVE = {
  "quentin-tarantino": "Pulp Fiction",
  "jim-carrey": "The Truman Show",
  "american-football-films": "Remember the Titans",
  // The owner's "Hitman de la Play 2" (S4): the best-known PS2 game.
  hitman: "Hitman: Blood Money",
};

/** A series entry shows one game's cover, by its year: the 2018 reboot. */
const SERIES_YEAR = { "god-of-war": 2018 };

/** Library titles shortened inside their saga, searched with its name. */
const SEARCH_PREFIX = {
  "pirates-of-the-caribbean": "Pirates of the Caribbean: ",
};

/**
 * Resolved TMDB ids and the poster file chosen for each, by cover key:
 * [id, poster path]. Edit a pin to fix a wrong match or swap a poster.
 */
const PINS = {
  "harry-potter": [1241, "/eVPs2Y0LyvTLZn6AP5Z6O2rtiGB.jpg"],
  "harry-potter/harry-potter-and-the-philosopher-s-stone-2001": [
    671,
    "/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg",
  ],
  "harry-potter/harry-potter-and-the-chamber-of-secrets-2002": [
    672,
    "/sdEOH0992YZ0QSxgXNIGLq1ToUi.jpg",
  ],
  "harry-potter/harry-potter-and-the-prisoner-of-azkaban-2004": [
    673,
    "/aWxwnYoe8p2d2fcxOqtvAtJ72Rw.jpg",
  ],
  "harry-potter/harry-potter-and-the-goblet-of-fire-2005": [
    674,
    "/fECBtHlr0RB3foNHDiCBXeg9Bv9.jpg",
  ],
  "harry-potter/harry-potter-and-the-order-of-the-phoenix-2007": [
    675,
    "/5aOyriWkPec0zUDxmHFP9qMmBaj.jpg",
  ],
  "harry-potter/harry-potter-and-the-half-blood-prince-2009": [
    767,
    "/z7uo9zmQdQwU5ZJHFpv2Upl30i1.jpg",
  ],
  "harry-potter/harry-potter-and-the-deathly-hallows-part-1-2010": [
    12444,
    "/iGoXIpQb7Pot00EEdwpwPajheZ5.jpg",
  ],
  "harry-potter/harry-potter-and-the-deathly-hallows-part-2-2011": [
    12445,
    "/c54HpQmuwXjHq2C9wmoACjxoom3.jpg",
  ],
  "pirates-of-the-caribbean": [295, "/zRBaZxS5YauLvRYjAdL4AUCwlht.jpg"],
  "pirates-of-the-caribbean/the-curse-of-the-black-pearl-2003": [
    22,
    "/poHwCZeWzJCShH7tOjg8RIoyjcw.jpg",
  ],
  "pirates-of-the-caribbean/dead-man-s-chest-2006": [
    58,
    "/uXEqmloGyP7UXAiphJUu2v2pcuE.jpg",
  ],
  "pirates-of-the-caribbean/at-world-s-end-2007": [
    285,
    "/jGWpG4YhpQwVmjyHEGkxEkeRf0S.jpg",
  ],
  "pirates-of-the-caribbean/on-stranger-tides-2011": [
    1865,
    "/keGfSvCmYj7CvdRx36OdVrAEibE.jpg",
  ],
  "pirates-of-the-caribbean/dead-men-tell-no-tales-2017": [
    166426,
    "/6lAPOAFYFWIO3SQRemEY2wInQMC.jpg",
  ],
  "quentin-tarantino/reservoir-dogs-1992": [
    500,
    "/xi8Iu6qyTfyZVDVy60raIOYJJmk.jpg",
  ],
  "quentin-tarantino/pulp-fiction-1994": [
    680,
    "/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg",
  ],
  "quentin-tarantino/jackie-brown-1997": [
    184,
    "/rOUx7qg4KmEh1juEDwqzbDSL1Nr.jpg",
  ],
  "quentin-tarantino/kill-bill-vol-1-2003": [
    24,
    "/v7TaX8kXMXs5yFFGR41guUDNcnB.jpg",
  ],
  "quentin-tarantino/kill-bill-vol-2-2004": [
    393,
    "/2yhg0mZQMhDyvUQ4rG1IZ4oIA8L.jpg",
  ],
  "quentin-tarantino/death-proof-2007": [
    1991,
    "/vtu6H4NWnQVqEp3aanUq3hNeeot.jpg",
  ],
  "quentin-tarantino/inglourious-basterds-2009": [
    16869,
    "/aupnPtagH9JVBuMrGEanf4iqXEQ.jpg",
  ],
  "quentin-tarantino/django-unchained-2012": [
    68718,
    "/7oWY8VDWW7thTzWh3OKYRkWUlD5.jpg",
  ],
  "quentin-tarantino/the-hateful-eight-2015": [
    273248,
    "/jIywvdPjia2t3eKYbjVTcwBQlG8.jpg",
  ],
  "quentin-tarantino/once-upon-a-time-in-hollywood-2019": [
    466272,
    "/8j58iEBw9pOXFD2L0nt0ZXeHviB.jpg",
  ],
  "jim-carrey/ace-ventura-pet-detective-1994": [
    3049,
    "/pqiRuETmuSybfnVZ7qyeoXhQyN1.jpg",
  ],
  "jim-carrey/the-mask-1994": [854, "/jPC2eYub74zwf2tPGVtzSlBW6Oy.jpg"],
  "jim-carrey/dumb-and-dumber-1994": [8467, "/4LdpBXiCyGKkR8FGHgjKlphrfUc.jpg"],
  "jim-carrey/liar-liar-1997": [1624, "/p1habYSdC7oD3WygQ5lynU5G5rV.jpg"],
  "jim-carrey/the-truman-show-1998": [
    37165,
    "/vuza0WqY239yBXOadKlGwJsZJFE.jpg",
  ],
  "jim-carrey/how-the-grinch-stole-christmas-2000": [
    8871,
    "/1WZbbPApEivA421gCOluuzMMKCk.jpg",
  ],
  "jim-carrey/bruce-almighty-2003": [310, "/wqkWrOFtYnZSvIMu8Lsmz7WIvKC.jpg"],
  "jim-carrey/eternal-sunshine-of-the-spotless-mind-2004": [
    38,
    "/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg",
  ],
  "jim-carrey/yes-man-2008": [10201, "/8Vk2nQF1kY34x53YnWd5zDaTht.jpg"],
  "american-football-films/remember-the-titans-2000": [
    10637,
    "/825ohvC4wZ3gCuncCaqkWeQnK8h.jpg",
  ],
  "american-football-films/the-blind-side-2009": [
    22881,
    "/PhpAdRopu0sOWf0BY7vVtxrRD3.jpg",
  ],
  "american-football-films/any-given-sunday-1999": [
    9563,
    "/bysZeUvSPZPJnku4qkHF34CdgMG.jpg",
  ],
  "american-football-films/the-longest-yard-2005": [
    9291,
    "/nbKcVBcxF96ARW2oKHqDYAcLdu.jpg",
  ],
  perfume: [1427, "/2wrFrUej8ri5EpjgIkjKTAnr686.jpg"],
  f1: [911430, "/9PXZIUsSDh4alB80jheWX4fhZmy.jpg"],
  "nightmare-before-christmas": [9479, "/oQffRNjK8e19rF7xVYEN8ew0j7b.jpg"],
};

/**
 * Resolved IGDB game ids and their cover image ids, by cover key:
 * [id, image id]. Edit a pin to fix a wrong match or swap a cover.
 */
const GAME_PINS = {
  "ghost-of-tsushima": [75235, "co2crj"],
  "gta-san-andreas": [732, "co2lb9"],
  "god-of-war": [19560, "cobkt6"],
  "hitman/hitman-codename-47-2000": [1050, "co4bkw"],
  "hitman/hitman-2-silent-assassin-2002": [748, "cod9y3"],
  "hitman/hitman-contracts-2004": [1049, "co1ovw"],
  "hitman/hitman-blood-money-2006": [1048, "co2dm6"],
  "hitman/hitman-absolution-2012": [530, "co1qrc"],
  "hitman/hitman-2016": [11157, "co2fgr"],
  "hitman/hitman-2-2018": [103210, "co2qcq"],
  "hitman/hitman-3-2021": [134595, "co29lt"],
};

/** One line of progress on stdout; never given a key or a header. */
const say = (line) => process.stdout.write(`${line}\n`);

// --- keys: environment or .env, never echoed -------------------------------

const envFile = join(ROOT, ".env");
const tmdbKeyed =
  process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY;
const igdbKeyed = process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET;
if (!(tmdbKeyed && igdbKeyed) && existsSync(envFile))
  process.loadEnvFile(envFile);
const bearer = process.env.TMDB_READ_ACCESS_TOKEN ?? "";
const v3key = process.env.TMDB_API_KEY ?? "";
const igdbClientId = process.env.IGDB_CLIENT_ID ?? "";
const igdbSecret = process.env.IGDB_CLIENT_SECRET ?? "";
/** Twitch app access token for IGDB, held in memory for this run only. */
let igdbToken = "";
const secrets = () =>
  [bearer, v3key, igdbClientId, igdbSecret, igdbToken].filter(
    (value) => value.length >= 8,
  );

/** Any text that may carry a key, with every key replaced. */
function redact(text) {
  let clean = String(text);
  for (const value of secrets()) clean = clean.split(value).join("[redacted]");
  return clean
    .replace(/(api_key=)[^&\s]+/g, "$1[redacted]")
    .replace(/(client_(id|secret)=)[^&\s]+/g, "$1[redacted]");
}

async function tmdb(path, params = {}) {
  const url = new URL(`${API}${path}`);
  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, String(value));
  const init = { headers: { accept: "application/json" } };
  if (bearer) init.headers.Authorization = `Bearer ${bearer}`;
  else url.searchParams.set("api_key", v3key);
  // Only the path reaches an error message, never the query or headers.
  const response = await fetch(url, init).catch((error) => {
    throw new Error(redact(`TMDB ${path}: ${error.message}`));
  });
  if (!response.ok) throw new Error(`TMDB ${path}: HTTP ${response.status}`);
  return response.json();
}

/** Trades the Twitch app's credentials for an app access token. */
async function twitchToken() {
  // A form body, so the secret never sits in a URL an error could echo.
  const response = await fetch(TWITCH_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: igdbClientId,
      client_secret: igdbSecret,
      grant_type: "client_credentials",
    }),
  }).catch((error) => {
    throw new Error(redact(`Twitch token: ${error.message}`));
  });
  if (!response.ok) throw new Error(`Twitch token: HTTP ${response.status}`);
  igdbToken = String((await response.json()).access_token ?? "");
  if (!igdbToken) throw new Error("Twitch token: no access_token");
}

let lastIgdbRequest = 0;

/** Waits so IGDB's API and images see at most one request per interval. */
async function pace() {
  const wait = lastIgdbRequest + IGDB_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastIgdbRequest = Date.now();
}

/** One IGDB v4 query (Apicalypse body); returns the result array. */
async function igdb(path, query) {
  if (!igdbToken) await twitchToken();
  await pace();
  const response = await fetch(`${IGDB_API}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Client-ID": igdbClientId,
      Authorization: `Bearer ${igdbToken}`,
    },
    body: query,
  }).catch((error) => {
    throw new Error(redact(`IGDB ${path}: ${error.message}`));
  });
  if (!response.ok) throw new Error(`IGDB ${path}: HTTP ${response.status}`);
  return response.json();
}

// --- titles ------------------------------------------------------------------

/** Same slug as coverKey() in the generated manifest. */
const slug = (text) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const norm = (text) => slug(text).replace(/-/g, " ");
const yearOf = (date) => Number(String(date ?? "").slice(0, 4));

/** Every cover the Movies and Games apps need, in library order. */
async function wanted() {
  const library = await import(
    pathToFileURL(join(ROOT, "src/lib/world/tv-library.ts")).href
  );
  const items = [];
  const representative = (title, entries, year) => {
    const pick = entries.find(
      (entry) => entry.title === REPRESENTATIVE[title.id],
    );
    if (!pick) throw new Error(`${title.id}: no representative entry`);
    return {
      key: title.id,
      kind: "representative",
      title: title.title,
      year,
      film: pick.key,
    };
  };
  for (const title of library.tvApp("movies").titles) {
    if (!title.films) {
      items.push({
        key: title.id,
        kind: "movie",
        title: title.title,
        year: title.year,
        file: `${slug(title.title)}-${title.year}`,
        query: title.title,
      });
      continue;
    }
    const films = title.films.map((film) => ({
      key: `${title.id}/${slug(film.title)}-${film.year}`,
      kind: "movie",
      title: film.title,
      year: film.year,
      file: `${slug(film.title)}-${film.year}`,
      query: `${SEARCH_PREFIX[title.id] ?? ""}${film.title}`,
    }));
    const year = Math.min(...title.films.map((film) => film.year));
    if (TMDB_COLLECTIONS.includes(title.id)) {
      items.push({
        key: title.id,
        kind: "collection",
        title: title.title,
        year,
        file: `${title.id}-collection`,
        query: title.title,
      });
    } else {
      items.push(representative(title, films, year));
    }
    items.push(...films);
  }
  for (const title of library.tvApp("games").titles) {
    if (!title.films) {
      const year = title.year ?? SERIES_YEAR[title.id];
      if (!year) throw new Error(`${title.id}: no year to search IGDB with`);
      const file = `${slug(title.title)}-${year}`;
      items.push({
        key: title.id,
        kind: "game",
        title: title.title,
        year,
        file,
        // A series entry records which of its games the cover shows.
        series: title.year ? undefined : file,
      });
      continue;
    }
    const games = title.films.map((game) => ({
      key: `${title.id}/${slug(game.title)}-${game.year}`,
      kind: "game",
      title: game.title,
      year: game.year,
      file: `${slug(game.title)}-${game.year}`,
    }));
    const year = Math.min(...title.films.map((game) => game.year));
    items.push(representative(title, games, year), ...games);
  }
  return items;
}

// --- resolve -----------------------------------------------------------------

/** Title folded both ways: TMDB may add the saga's prefix. */
const titleMatches = (tmdbTitle, item) =>
  norm(tmdbTitle) === norm(item.query) ||
  norm(tmdbTitle).endsWith(norm(item.title));

async function resolveMovie(item, doubts) {
  const pin = PINS[item.key];
  if (pin) {
    const movie = await tmdb(`/movie/${pin[0]}`, { language: "en-US" });
    const ok =
      (titleMatches(movie.title, item) ||
        titleMatches(movie.original_title, item)) &&
      yearOf(movie.release_date) === item.year;
    if (!ok)
      doubts.push(
        `${item.key}: pinned ${pin[0]} is "${movie.title}" (${movie.release_date})`,
      );
    if (movie.poster_path !== pin[1])
      say(
        `  note ${item.key}: TMDB's primary poster is now ${movie.poster_path}; keeping pinned ${pin[1]}`,
      );
    return { id: pin[0], poster: pin[1], title: movie.title, pinned: true };
  }
  const search = async (params) =>
    (
      await tmdb("/search/movie", {
        query: item.query,
        include_adult: false,
        language: "en-US",
        ...params,
      })
    ).results;
  let results = await search({ primary_release_year: item.year });
  if (results.length === 0) results = await search({ year: item.year });
  const exact = results.filter(
    (movie) =>
      (titleMatches(movie.title, item) ||
        titleMatches(movie.original_title, item)) &&
      yearOf(movie.release_date) === item.year &&
      movie.poster_path,
  );
  const ranked = (exact.length ? exact : results).toSorted(
    (a, b) => b.vote_count - a.vote_count || a.id - b.id,
  );
  const best = ranked[0];
  if (!best) throw new Error(`${item.key}: no TMDB match for "${item.query}"`);
  if (exact.length !== 1)
    doubts.push(
      `${item.key}: ${exact.length} exact matches; took ${best.id} "${best.title}" (${best.release_date})`,
    );
  return { id: best.id, poster: best.poster_path, title: best.title };
}

async function resolveCollection(item, doubts) {
  const pin = PINS[item.key];
  if (pin) {
    const collection = await tmdb(`/collection/${pin[0]}`, {
      language: "en-US",
    });
    if (!norm(collection.name).includes(norm(item.title)))
      doubts.push(`${item.key}: pinned ${pin[0]} is "${collection.name}"`);
    return { id: pin[0], poster: pin[1], title: collection.name, pinned: true };
  }
  const { results } = await tmdb("/search/collection", {
    query: item.title,
    language: "en-US",
  });
  const exact = results.filter(
    (entry) => norm(entry.name) === `${norm(item.title)} collection`,
  );
  const best = exact[0] ?? results[0];
  if (!best) throw new Error(`${item.key}: no TMDB collection`);
  if (exact.length !== 1)
    doubts.push(`${item.key}: took collection ${best.id} "${best.name}"`);
  return { id: best.id, poster: best.poster_path, title: best.name };
}

const GAME_FIELDS =
  "fields name,first_release_date,cover.image_id,total_rating_count;";
const gameYear = (game) =>
  game.first_release_date
    ? new Date(game.first_release_date * 1000).getUTCFullYear()
    : 0;

async function resolveGame(item, doubts) {
  const pin = GAME_PINS[item.key];
  if (pin) {
    const [game] = await igdb("/games", `${GAME_FIELDS} where id = ${pin[0]};`);
    if (!game) throw new Error(`${item.key}: pinned IGDB game ${pin[0]} gone`);
    if (norm(game.name) !== norm(item.title) || gameYear(game) !== item.year)
      doubts.push(
        `${item.key}: pinned ${pin[0]} is "${game.name}" (${gameYear(game)})`,
      );
    if (game.cover?.image_id !== pin[1])
      say(
        `  note ${item.key}: IGDB's cover is now ${game.cover?.image_id}; keeping pinned ${pin[1]}`,
      );
    return { id: pin[0], imageId: pin[1], title: game.name, pinned: true };
  }
  const exactOf = (games) =>
    games.filter(
      (game) =>
        norm(game.name) === norm(item.title) &&
        gameYear(game) === item.year &&
        game.cover?.image_id,
    );
  let results = await igdb(
    "/games",
    `search ${quote(item.title)}; ${GAME_FIELDS} limit 50;`,
  );
  let exact = exactOf(results);
  if (exact.length === 0) {
    // Search ranks by relevance; a short title can fall out of its 50 hits.
    results = await igdb(
      "/games",
      `${GAME_FIELDS} where name ~ ${quote(item.title)}; limit 50;`,
    );
    exact = exactOf(results);
  }
  const ranked = (exact.length ? exact : results)
    .filter((game) => game.cover?.image_id)
    .toSorted(
      (a, b) =>
        (b.total_rating_count ?? 0) - (a.total_rating_count ?? 0) ||
        a.id - b.id,
    );
  const best = ranked[0];
  if (!best) throw new Error(`${item.key}: no IGDB match for "${item.title}"`);
  if (exact.length !== 1)
    doubts.push(
      `${item.key}: ${exact.length} exact matches; took ${best.id} "${best.name}" (${gameYear(best)})`,
    );
  return { id: best.id, imageId: best.cover.image_id, title: best.name };
}

// --- files -------------------------------------------------------------------

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Width and height from a WebP's RIFF header (VP8, VP8L or VP8X). */
function webpSize(bytes) {
  if (
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("not a WebP");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ")
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return {
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1,
  };
}

/**
 * The JPEG as a lossy WebP: quality steps down until it fits, then the width
 * (342, 320, 300 px) for the busiest posters.
 */
function toWebp(jpeg) {
  for (const width of [342, 320, 300])
    for (let quality = 82; quality >= 58; quality -= 4) {
      const run = spawnSync(
        "magick",
        [
          ...["jpg:-", "-strip", "-resize", `${width}x`],
          ...["-quality", String(quality), "-define", "webp:method=6"],
          "webp:-",
        ],
        { input: jpeg, maxBuffer: 16 * 1024 * 1024 },
      );
      if (run.status !== 0)
        throw new Error(`magick failed: ${run.stderr.toString().trim()}`);
      if (run.stdout.length <= COVER_MAX_BYTES) return run.stdout;
    }
  throw new Error(`poster does not fit ${COVER_MAX_BYTES} B at 300 px`);
}

async function previousManifest() {
  if (!existsSync(MANIFEST)) return {};
  const module = await import(
    `${pathToFileURL(MANIFEST).href}?t=${Date.now()}`
  );
  return module.TV_COVERS ?? {};
}

/** Where an item's image comes from, as recorded in the manifest. */
const sourceOf = (item, match) =>
  item.kind === "game"
    ? {
        url: `${IGDB_IMAGES}/${match.imageId}.jpg`,
        fields: { igdbId: match.id, imageId: match.imageId },
      }
    : {
        url: `${IMAGES}${match.poster}`,
        fields: { tmdbId: match.id, poster: match.poster },
      };

/** Ships the image as WebP; downloads only when the file is stale. */
async function ship(item, match, previous) {
  const src = `/world/tv/covers/${item.file}.webp`;
  const target = join(COVERS, `${item.file}.webp`);
  const old = previous[item.key];
  const source = sourceOf(item, match);
  let bytes = existsSync(target) ? readFileSync(target) : null;
  const fresh =
    bytes &&
    old?.src === src &&
    Object.entries(source.fields).every(
      ([name, value]) => old[name] === value,
    ) &&
    old.sha256 === sha256(bytes);
  if (!fresh) {
    if (item.kind === "game") await pace();
    const response = await fetch(source.url);
    if (!response.ok)
      throw new Error(`image ${source.url}: HTTP ${response.status}`);
    bytes = toWebp(Buffer.from(await response.arrayBuffer()));
    writeFileSync(target, bytes);
  }
  return {
    src,
    ...webpSize(bytes),
    bytes: bytes.length,
    sha256: sha256(bytes),
    downloaded: !fresh,
  };
}

// --- outputs -----------------------------------------------------------------

const quote = (value) => JSON.stringify(value);
const property = (name) =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : quote(name);

function manifestSource(covers) {
  const entries = Object.entries(covers).map(([key, cover]) => {
    const fields = Object.entries(cover)
      .map(([name, value]) => `    ${name}: ${quote(value)},`)
      .join("\n");
    return `  ${property(key)}: {\n${fields}\n  },`;
  });
  return `// Generated by scripts/prepare-tv-covers.mjs (tv-home-screen T4, T5, S7);
// do not edit by hand: fix a match in the script's PINS or GAME_PINS and
// rerun it. Film and collection posters from TMDB, game covers from IGDB,
// downloaded once at prepare time and shipped as WebP under
// public/world/tv/covers/. Nothing here calls TMDB or IGDB at runtime. The
// images belong to their studios, publishers and rights holders, shown for
// personal, non-commercial reference; both sources are in the menu's Credits.

import type { TvEntry } from "./tv-library.ts";

interface TvCoverFile {
  /** Site path of the shipped WebP. */
  src: string;
  /** The source's title for the resolved match. */
  title: string;
  /** Release year; a collection takes its first entry's. */
  year: number;
  width: number;
  height: number;
  sha256: string;
  /**
   * The film or game whose cover stands for a collection or series, by its
   * slug ("pulp-fiction-1994", "god-of-war-2018").
   */
  representative?: string;
}

/** A film or collection poster from TMDB. */
export interface TvFilmCover extends TvCoverFile {
  /** A collection cover uses TMDB's collection poster, or a film's. */
  tmdbType: "movie" | "collection";
  tmdbId: number;
  /** TMDB's poster file the WebP was made from. */
  poster: string;
}

/** A game cover from IGDB. */
export interface TvGameCover extends TvCoverFile {
  igdbId: number;
  /** IGDB's cover image id the WebP was made from. */
  imageId: string;
}

export type TvCover = TvFilmCover | TvGameCover;

/** Each shipped poster stays at or under this many bytes. */
export const COVER_MAX_BYTES = ${COVER_MAX_BYTES};

const slug = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** An entry in a collection: "harry-potter/harry-potter-and-…-2001". */
export function coverKey(collectionId: string, film: TvEntry): string {
  return \`\${collectionId}/\${slug(film.title)}-\${film.year}\`;
}

/**
 * By library id (single films and games, collections) or coverKey() (their
 * films and games).
 */
export const TV_COVERS: Readonly<Record<string, TvCover>> = {
${entries.join("\n")}
};
`;
}

function writeCredits(films, games) {
  const credits = JSON.parse(readFileSync(CREDITS, "utf8"));
  const tmdbCredit = {
    id: "tmdb",
    label: "Film posters",
    name: "TMDB",
    url: "https://www.themoviedb.org",
    notice:
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    usage:
      "Film and collection posters on the living-room TV, fetched once at build time; the site makes no requests to TMDB.",
    rights:
      "The posters belong to their studios and rights holders and are shown for personal, non-commercial reference.",
    files: "tv/covers/",
    count: films,
    script: "scripts/prepare-tv-covers.mjs",
  };
  const igdbCredit = {
    id: "igdb",
    label: "Game covers",
    name: "IGDB",
    url: "https://www.igdb.com",
    notice: "Game data and cover images from IGDB.com.",
    usage:
      "Game and collection covers on the living-room TV, fetched once at build time; the site makes no requests to IGDB.",
    rights:
      "The covers belong to their publishers and rights holders and are shown for personal, non-commercial reference.",
    files: "tv/covers/",
    count: games,
    script: "scripts/prepare-tv-covers.mjs",
  };
  const services = (credits.services ?? []).filter(
    (entry) => entry.id !== "tmdb" && entry.id !== "igdb",
  );
  credits.services = [...services, tmdbCredit, igdbCredit];
  writeFileSync(CREDITS, `${JSON.stringify(credits, null, 2)}\n`);
}

// --- main --------------------------------------------------------------------

async function main() {
  if (!bearer && !v3key)
    throw new Error(
      "set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY (environment or .env)",
    );
  if (!igdbClientId || !igdbSecret)
    throw new Error(
      "set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET (environment or .env)",
    );
  mkdirSync(COVERS, { recursive: true });
  const items = await wanted();
  const previous = await previousManifest();
  const doubts = [];
  const unpinned = {};
  const covers = {};
  const shipped = new Map();
  for (const item of items.filter((entry) => entry.kind !== "representative")) {
    const match =
      item.kind === "game"
        ? await resolveGame(item, doubts)
        : item.kind === "collection"
          ? await resolveCollection(item, doubts)
          : await resolveMovie(item, doubts);
    if (!match.pinned)
      unpinned[item.key] = [match.id, match.poster ?? match.imageId];
    const file = await ship(item, match, previous);
    shipped.set(item.key, { ...file, game: item.kind === "game" });
    const size = {
      width: file.width,
      height: file.height,
      sha256: file.sha256,
    };
    covers[item.key] =
      item.kind === "game"
        ? {
            src: file.src,
            igdbId: match.id,
            title: match.title,
            year: item.year,
            ...size,
            imageId: match.imageId,
            ...(item.series ? { representative: item.series } : {}),
          }
        : {
            src: file.src,
            tmdbType: item.kind,
            tmdbId: match.id,
            title: match.title,
            year: item.year,
            ...size,
            poster: match.poster,
          };
    say(
      `  ${file.downloaded ? "got " : "kept"} ${item.key} -> ${match.id} "${match.title}" ${file.bytes} B`,
    );
  }
  for (const item of items.filter((entry) => entry.kind === "representative")) {
    const film = covers[item.film];
    covers[item.key] = {
      ...film,
      year: item.year,
      representative: item.film.split("/")[1],
    };
  }
  // Library order: each collection cover before its films.
  const ordered = Object.fromEntries(
    items.map((item) => [item.key, covers[item.key]]),
  );
  writeFileSync(MANIFEST, manifestSource(ordered));
  const files = [...shipped.values()];
  const games = files.filter((file) => file.game);
  writeCredits(files.length - games.length, games.length);
  const bytes = (list) => list.reduce((sum, file) => sum + file.bytes, 0);
  say(
    `${files.length - games.length} posters, ${bytes(files) - bytes(games)} B; ${games.length} game covers, ${bytes(games)} B; ${Object.keys(ordered).length} covers`,
  );
  if (Object.keys(unpinned).length) {
    say("Unpinned matches; paste into PINS or GAME_PINS:");
    for (const [key, pin] of Object.entries(unpinned))
      say(`  ${quote(key)}: [${pin[0]}, ${quote(pin[1])}],`);
  }
  if (doubts.length) {
    say("Doubtful matches:");
    for (const doubt of doubts) say(`  ${doubt}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${redact(error?.stack ?? error)}\n`);
  process.exitCode = 1;
});
