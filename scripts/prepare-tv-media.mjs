#!/usr/bin/env node
// Resolve what the living-room TV can play, once, at prepare time
// (tv-home-screen T8, S8-S10): the YouTube channel id behind each channel of
// the Channels app, the Twitch user behind each streamer of the Live app,
// and an official YouTube trailer for every film and game of the Movies and
// Games apps. Writes src/lib/world/tv-media.ts; the YouTube and Twitch
// entries in Credits come with their channel covers from
// scripts/prepare-tv-covers.mjs. The site never calls YouTube,
// Twitch, TMDB or IGDB APIs; it only loads their official players after a
// visitor presses play.
//
// Usage:
//   node scripts/prepare-tv-media.mjs
//
// Keys, read from the environment or the gitignored .env, as in
// scripts/prepare-tv-covers.mjs: TMDB_READ_ACCESS_TOKEN (or TMDB_API_KEY)
// for TMDB /movie/{id}/videos, and IGDB_CLIENT_ID / IGDB_CLIENT_SECRET (a
// Twitch app) for IGDB game videos and Twitch Helix /users. None of them, nor
// the app token, is ever printed, logged or written; errors are redacted.
//
// 1. Channels: read the public page https://www.youtube.com/@<handle>, take
//    its channel id (externalId, and the canonical link must agree) and name,
//    and check the name against CHANNELS and the uploads playlist against
//    YouTube's oEmbed (its author must be the same handle).
// 2. Twitch: Helix /users must return every login of the Live app.
// 3. Trailers: TMDB videos of type Trailer on YouTube (official first, then
//    English), IGDB game videos (trailers first). A candidate counts only
//    when YouTube's oEmbed says it is public and embeddable. A trailer pinned
//    in the previous manifest is kept while it still qualifies, so a rerun
//    does not drift.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "src/lib/world/tv-media.ts");
const API = "https://api.themoviedb.org/3";
const TWITCH_TOKEN = "https://id.twitch.tv/oauth2/token";
const HELIX = "https://api.twitch.tv/helix";
const IGDB_API = "https://api.igdb.com/v4";
const YOUTUBE = "https://www.youtube.com";
/** IGDB allows 4 requests per second; keep under it. */
const IGDB_INTERVAL_MS = 300;

/**
 * Each channel of the Channels app (by library id): its handle, and the
 * name its page must show, so a reused or wrong handle fails the run.
 */
const CHANNELS = {
  "channel-midudev": { handle: "midudev", name: /^midudev$/ },
  "channel-gentleman-programming": {
    handle: "GentlemanProgramming",
    name: /^Gentleman Programming$/,
  },
  // @fazt is someone else; Fazt's channel is @FaztTech.
  "channel-fazt": { handle: "FaztTech", name: /^Fazt$/ },
  "channel-dalto": { handle: "soydalto", name: /^Soy Dalto$/ },
  // @t3dotgg points to the same channel; @theo is its own handle.
  "channel-theo-t3-gg-": { handle: "theo", name: /^Theo\b/ },
};

/** Each streamer of the Live app (by library id) and their Twitch login. */
const TWITCH = {
  "live-gentleman-programming": "gentleman_programming",
  "live-midudev": "midudev",
  "live-melenitasdev": "melenitasdev",
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
/** Twitch app access token for IGDB and Helix, held in memory for this run. */
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

/** Waits so IGDB and Helix see at most one request per interval. */
async function pace() {
  const wait = lastIgdbRequest + IGDB_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  lastIgdbRequest = Date.now();
}

/** One request with the Twitch app token: an IGDB query or a Helix GET. */
async function twitchApp(label, url, init = {}) {
  if (!igdbToken) await twitchToken();
  await pace();
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      "Client-ID": igdbClientId,
      Authorization: `Bearer ${igdbToken}`,
    },
  }).catch((error) => {
    throw new Error(redact(`${label}: ${error.message}`));
  });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

const igdb = (path, query) =>
  twitchApp(`IGDB ${path}`, `${IGDB_API}${path}`, {
    method: "POST",
    body: query,
  });

// --- YouTube, keyless public pages -------------------------------------------

/** YouTube's oEmbed for a watch or playlist URL; null when not embeddable. */
async function oembed(url) {
  const response = await fetch(
    `${YOUTUBE}/oembed?format=json&url=${encodeURIComponent(url)}`,
  );
  if (response.status === 401 || response.status === 403) return null;
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new Error(`oEmbed: HTTP ${response.status}`);
  return response.json();
}

const decodeHtml = (text) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

/** A channel's id and name, read from its public /@handle page. */
async function channel(titleId, { handle, name }) {
  const response = await fetch(`${YOUTUBE}/@${handle}`, {
    headers: { "accept-language": "en", "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok) throw new Error(`@${handle}: HTTP ${response.status}`);
  const page = await response.text();
  const external = page.match(/"externalId":"(UC[\w-]{22})"/)?.[1];
  const canonical = page.match(
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
  )?.[1];
  if (!external || external !== canonical)
    throw new Error(`@${handle}: no channel id on the page`);
  const title = decodeHtml(
    page.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? "",
  );
  if (!name.test(title))
    throw new Error(`@${handle}: the page is "${title}", not ${name}`);
  const uploads = await oembed(
    `${YOUTUBE}/playlist?list=UU${external.slice(2)}`,
  );
  if (uploads?.author_url?.toLowerCase() !== `/@${handle}`.toLowerCase())
    throw new Error(`@${handle}: the uploads playlist is not theirs`);
  say(`  channel ${titleId} -> @${handle} ${external} "${title}"`);
  return { handle, channelId: external, name: title };
}

// --- trailers ----------------------------------------------------------------

const slug = (text) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Every film and game that can play a trailer: its cover key and cover. */
function trailerItems(library, covers) {
  const items = [];
  for (const app of ["movies", "games"])
    for (const title of library.tvApp(app).titles) {
      const keys = title.films
        ? title.films.map(
            (entry) => `${title.id}/${slug(entry.title)}-${entry.year}`,
          )
        : [title.id];
      for (const key of keys) {
        const cover = covers[key];
        if (!cover) throw new Error(`${key}: no cover in tv-covers.ts`);
        items.push({ key, cover });
      }
    }
  return items;
}

/** TMDB trailers on YouTube, best first: official, English, earliest. */
async function tmdbCandidates(tmdbId) {
  const { results = [] } = await tmdb(`/movie/${tmdbId}/videos`);
  const rank = (video) =>
    (video.official ? 0 : 2) + (video.iso_639_1 === "en" ? 0 : 1);
  return results
    .filter((video) => video.site === "YouTube" && video.type === "Trailer")
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        String(a.published_at).localeCompare(String(b.published_at)),
    )
    .map((video) => ({ youtube: video.key, name: video.name }));
}

/** IGDB game videos (YouTube ids), trailers first, in IGDB's order. */
async function igdbCandidates(videos) {
  const rank = (video) =>
    /\b(official|launch|reveal)?\s*trailer\b/i.test(video.name ?? "")
      ? /gameplay/i.test(video.name)
        ? 1
        : 0
      : 2;
  return [...videos]
    .sort((a, b) => rank(a) - rank(b))
    .map((video) => ({
      youtube: video.video_id,
      name: video.name ?? "Video",
    }));
}

async function previousTrailers() {
  if (!existsSync(MANIFEST)) return {};
  const module = await import(
    `${pathToFileURL(MANIFEST).href}?t=${Date.now()}`
  );
  return module.TV_TRAILERS ?? {};
}

/** The first candidate YouTube will embed, the previous pin first. */
async function pickTrailer(key, candidates, previous) {
  const valid = candidates.filter((video) => /^[\w-]{11}$/.test(video.youtube));
  const pinned = previous[key]?.youtube;
  const ordered = [
    ...valid.filter((video) => video.youtube === pinned),
    ...valid.filter((video) => video.youtube !== pinned),
  ];
  for (const video of ordered) {
    const embed = await oembed(`${YOUTUBE}/watch?v=${video.youtube}`);
    if (embed)
      return { ...video, channel: String(embed.author_name ?? "YouTube") };
  }
  return null;
}

// --- outputs -----------------------------------------------------------------

const quote = (value) => JSON.stringify(value);
const property = (name) =>
  /^[A-Za-z_$][\w$]*$/.test(name) ? name : quote(name);
const record = (entries) =>
  Object.entries(entries)
    .map(([key, value]) => {
      const fields = Object.entries(value)
        .map(([name, field]) => `    ${name}: ${quote(field)},`)
        .join("\n");
      return `  ${property(key)}: {\n${fields}\n  },`;
    })
    .join("\n");

function manifestSource({ youtube, twitch, trailers, missing }) {
  const list = missing.length
    ? `[\n${missing.map((key) => `  ${quote(key)},`).join("\n")}\n]`
    : "[]";
  return `// Generated by scripts/prepare-tv-media.mjs (tv-home-screen T8, S8-S10);
// do not edit by hand: rerun the script. What the living-room TV can play:
// YouTube channels by their channel id, Twitch streamers by login, and an
// official YouTube trailer per film and game (from TMDB and IGDB), resolved
// once at prepare time. The site calls no API: it loads YouTube's
// privacy-enhanced player or Twitch's official player, only after a press.
// The videos belong to their creators; both players are in the Credits.

/** A YouTube channel of the Channels app, by its library id. */
export interface TvYouTubeChannel {
  /** The channel's @handle, without the @. */
  handle: string;
  /** "UC…"; its uploads playlist is "UU…". */
  channelId: string;
  /** The name on the channel's page. */
  name: string;
}

/** A Twitch streamer of the Live app, by its library id. */
export interface TvTwitchChannel {
  login: string;
  twitchId: string;
  name: string;
}

/** An official trailer on YouTube, by cover key (see tv-covers.ts). */
export interface TvTrailer {
  /** The YouTube video id. */
  youtube: string;
  /** The video's name at its source. */
  name: string;
  /** The YouTube channel that published it. */
  channel: string;
  source: "tmdb" | "igdb";
  /** The film's TMDB id or the game's IGDB id. */
  sourceId: number;
}

/** What a press plays on the TV. */
export type TvMedia =
  | { kind: "uploads"; channelId: string }
  | { kind: "live"; channelId: string }
  | { kind: "trailer"; youtube: string }
  | { kind: "twitch"; login: string };

const NOCOOKIE = "https://www.youtube-nocookie.com/embed";
/** Muted at the start; the visitor unmutes in the player. */
const YOUTUBE_PARAMS = "autoplay=1&mute=1&playsinline=1&rel=0";

const check = (value: string, pattern: RegExp, what: string) => {
  if (!pattern.test(value)) throw new RangeError(\`Bad \${what}: \${value}\`);
  return value;
};

/**
 * The official player's URL for \`media\`. Twitch needs the embedding page's
 * own hostname as \`parent\` (window.location.hostname).
 */
export function tvEmbedSrc(media: TvMedia, host: string): string {
  if (media.kind === "twitch") {
    const login = check(media.login, /^[a-z0-9_]{3,25}$/, "Twitch login");
    const parent = check(host, /^[a-z0-9.-]+$/i, "host");
    return \`https://player.twitch.tv/?channel=\${login}&parent=\${parent}&muted=true&autoplay=false\`;
  }
  if (media.kind === "trailer")
    return \`\${NOCOOKIE}/\${check(media.youtube, /^[\\w-]{11}$/, "video id")}?\${YOUTUBE_PARAMS}\`;
  const id = check(media.channelId, /^UC[\\w-]{22}$/, "channel id");
  return media.kind === "uploads"
    ? \`\${NOCOOKIE}/videoseries?list=UU\${id.slice(2)}&\${YOUTUBE_PARAMS}\`
    : \`\${NOCOOKIE}/live_stream?channel=\${id}&\${YOUTUBE_PARAMS}\`;
}

export const TV_YOUTUBE: Readonly<Record<string, TvYouTubeChannel>> = {
${record(youtube)}
};

export const TV_TWITCH: Readonly<Record<string, TvTwitchChannel>> = {
${record(twitch)}
};

export const TV_TRAILERS: Readonly<Record<string, TvTrailer>> = {
${record(trailers)}
};

/** Films and games with no embeddable official trailer found. */
export const TV_TRAILERS_MISSING: readonly string[] = ${list};
`;
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
  const library = await import(
    pathToFileURL(join(ROOT, "src/lib/world/tv-library.ts")).href
  );
  const { TV_COVERS } = await import(
    pathToFileURL(join(ROOT, "src/lib/world/tv-covers.ts")).href
  );

  const youtube = {};
  for (const title of library.tvApp("channels").titles) {
    const wanted = CHANNELS[title.id];
    if (!wanted) throw new Error(`${title.id}: add its handle to CHANNELS`);
    youtube[title.id] = await channel(title.id, wanted);
  }

  const twitch = {};
  const live = library.tvApp("live").titles;
  const logins = live.map((title) => {
    const login = TWITCH[title.id];
    if (!login) throw new Error(`${title.id}: add its login to TWITCH`);
    return login;
  });
  const users = await twitchApp(
    "Helix /users",
    `${HELIX}/users?${logins.map((login) => `login=${login}`).join("&")}`,
  );
  for (const title of live) {
    const login = TWITCH[title.id];
    const user = (users.data ?? []).find((entry) => entry.login === login);
    if (!user) throw new Error(`Twitch: no user ${login}`);
    twitch[title.id] = {
      login,
      twitchId: String(user.id),
      name: String(user.display_name),
    };
    say(`  twitch ${title.id} -> ${login} ${user.id} "${user.display_name}"`);
  }

  const items = trailerItems(library, TV_COVERS);
  const previous = await previousTrailers();
  const games = items.filter((item) => "igdbId" in item.cover);
  const ids = [...new Set(games.map((item) => item.cover.igdbId))];
  const found = await igdb(
    "/games",
    `fields id,name,videos.video_id,videos.name; where id = (${ids.join(",")}); limit ${ids.length};`,
  );
  const videosOf = new Map(found.map((game) => [game.id, game.videos ?? []]));
  const trailers = {};
  const missing = [];
  for (const { key, cover } of items) {
    const game = "igdbId" in cover;
    const candidates = game
      ? await igdbCandidates(videosOf.get(cover.igdbId) ?? [])
      : await tmdbCandidates(cover.tmdbId);
    const pick = await pickTrailer(key, candidates, previous);
    if (!pick) {
      missing.push(key);
      say(`  none ${key} (${candidates.length} candidates)`);
      continue;
    }
    trailers[key] = {
      youtube: pick.youtube,
      name: pick.name,
      channel: pick.channel,
      source: game ? "igdb" : "tmdb",
      sourceId: game ? cover.igdbId : cover.tmdbId,
    };
    say(`  trailer ${key} -> ${pick.youtube} "${pick.name}" (${pick.channel})`);
  }

  writeFileSync(
    MANIFEST,
    manifestSource({ youtube, twitch, trailers, missing }),
  );
  say(
    `${Object.keys(youtube).length} YouTube channels; ${Object.keys(twitch).length} Twitch channels; ${Object.keys(trailers).length} of ${items.length} trailers`,
  );
}

main().catch((error) => {
  process.stderr.write(`${redact(error?.stack ?? error)}\n`);
  process.exitCode = 1;
});
