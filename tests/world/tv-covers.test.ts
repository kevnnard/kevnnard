// Real covers for the living-room TV (tv-home-screen T4, T5, S7): every film
// in the Movies app has a TMDB poster and every game in the Games app an IGDB
// cover, as do their collections; scripts/prepare-tv-covers.mjs downloads
// them once, ships them as small WebP files and lists them in the generated
// manifest. The keys live only in the gitignored .env; the site never calls
// TMDB or IGDB at runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  COVER_MAX_BYTES,
  coverKey,
  TV_COVERS,
  type TvChannelCover,
  type TvCover,
  type TvFilmCover,
  type TvGameCover,
} from "../../src/lib/world/tv-covers.ts";
import { tvApp } from "../../src/lib/world/tv-library.ts";
import {
  TV_TWITCH,
  TV_VIDEOS,
  TV_YOUTUBE,
} from "../../src/lib/world/tv-media.ts";

const ROOT = new URL("../../", import.meta.url);
const COVERS = new URL("public/world/tv/covers/", ROOT);
const SCRIPT = new URL("scripts/prepare-tv-covers.mjs", ROOT);

/** Width and height from a WebP's RIFF header (VP8, VP8L or VP8X). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, "truncated");
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
  assert.equal(chunk, "VP8X");
  return {
    width: bytes.readUIntLE(24, 3) + 1,
    height: bytes.readUIntLE(27, 3) + 1,
  };
}

/** Case, accents and punctuation folded: "Part 1" matches "– Part 1". */
const norm = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const film = (key: string): TvFilmCover => {
  const cover = TV_COVERS[key];
  assert.ok(cover && "tmdbId" in cover, `${key} is a TMDB poster`);
  return cover;
};
const game = (key: string): TvGameCover => {
  const cover = TV_COVERS[key];
  assert.ok(cover && "igdbId" in cover, `${key} is an IGDB cover`);
  return cover;
};

/** The God of War series entry shows the 2018 game (recorded in T5). */
const SERIES_YEAR: Record<string, number> = { "god-of-war": 2018 };

/** Every key an app needs: each entry, and each collection's cover. */
function expected(app: "movies" | "games" = "movies") {
  const keys: { key: string; title: string; year: number }[] = [];
  for (const title of tvApp(app).titles) {
    if (title.films) {
      const years = title.films.map((film) => film.year);
      keys.push({
        key: title.id,
        title: title.title,
        year: Math.min(...years),
      });
      for (const film of title.films)
        keys.push({ key: coverKey(title.id, film), ...film });
    } else {
      const year = title.year ?? SERIES_YEAR[title.id];
      assert.ok(year, `${title.id} has a year`);
      keys.push({ key: title.id, title: title.title, year });
    }
  }
  return keys;
}

describe("TV covers (tv-home-screen T4, S7)", () => {
  it("has a poster for every film and every collection in the Movies app", () => {
    const keys = expected();
    // 8 Harry Potter, 5 Pirates, 10 Tarantino, 9 Jim Carrey, 4 football,
    // Perfume, F1 and The Nightmare Before Christmas; plus 5 collections.
    assert.equal(keys.filter((k) => k.key.includes("/")).length, 36);
    assert.equal(keys.length, 44);
    for (const { key, title, year } of keys) {
      const cover = film(key);
      assert.equal(cover.year, year, `${key} year`);
      assert.ok(cover.title.length > 0, `${key} title`);
      assert.ok(Number.isInteger(cover.tmdbId) && cover.tmdbId > 0, key);
      // Verified by title as well as year; Pirates films carry the saga's
      // prefix on TMDB, a representative cover carries its film's title.
      if (cover.tmdbType === "collection")
        assert.ok(norm(cover.title).includes(norm(title)), key);
      else if (!cover.representative)
        assert.ok(norm(cover.title).endsWith(norm(title)), key);
    }
  });

  it("has a cover for every game and the Hitman collection in the Games app", () => {
    const keys = expected("games");
    // Ghost of Tsushima, San Andreas, God of War; the 8 Hitman games and
    // the collection's cover.
    assert.equal(keys.filter((k) => k.key.includes("/")).length, 8);
    assert.equal(keys.length, 12);
    for (const { key, title, year } of keys) {
      const cover = game(key);
      assert.equal(cover.year, year, `${key} year`);
      assert.ok(Number.isInteger(cover.igdbId) && cover.igdbId > 0, key);
      assert.match(cover.imageId, /^[a-z0-9]+$/, `${key} IGDB image id`);
      if (!cover.representative)
        assert.equal(norm(cover.title), norm(title), key);
    }
    // God of War (series): the 2018 game, recorded as its representative.
    const gow = game("god-of-war");
    assert.equal(gow.representative, "god-of-war-2018");
    assert.equal(norm(gow.title), "god of war");
    assert.equal(gow.src, "/world/tv/covers/god-of-war-2018.webp");
    // Hitman: a fixed representative game's cover.
    const hitman = game("hitman");
    assert.ok(hitman.representative, "hitman records its representative");
    const pick = game(`hitman/${hitman.representative}`);
    assert.equal(hitman.src, pick.src);
    assert.equal(hitman.igdbId, pick.igdbId);
    assert.equal(hitman.year, 2000, "a collection takes its first game's");
  });

  it("lists a cover for every library title, channels included, and nothing else", () => {
    assert.deepEqual(
      Object.keys(TV_COVERS).sort(),
      [
        ...expected("movies").map((k) => k.key),
        ...expected("games").map((k) => k.key),
        ...tvApp("channels").titles.map((title) => title.id),
        ...tvApp("live").titles.map((title) => title.id),
        ...tvApp("anime").titles.map((title) => title.id),
        ...tvApp("highlights").titles.map((title) => title.id),
      ].sort(),
    );
  });

  it("uses TMDB's own collection posters, and a pinned film for the rest", () => {
    assert.equal(film("harry-potter").tmdbType, "collection");
    assert.equal(film("pirates-of-the-caribbean").tmdbType, "collection");
    for (const id of [
      "quentin-tarantino",
      "jim-carrey",
      "american-football-films",
    ]) {
      const cover = film(id);
      assert.equal(cover.tmdbType, "movie", id);
      assert.ok(cover.representative, `${id} records its representative film`);
      const pick = film(`${id}/${cover.representative}`);
      assert.equal(cover.src, pick.src);
      assert.equal(cover.tmdbId, pick.tmdbId);
    }
  });

  it("ships each poster as a small WebP whose size and hash match the manifest", () => {
    for (const [key, cover] of Object.entries<TvCover>(TV_COVERS)) {
      assert.match(cover.src, /^\/world\/tv\/covers\/[a-z0-9-]+\.webp$/, key);
      const bytes = readFileSync(new URL(`public${cover.src}`, ROOT));
      assert.ok(bytes.length <= COVER_MAX_BYTES, `${key}: ${bytes.length} B`);
      assert.ok(COVER_MAX_BYTES <= 40 * 1024);
      const size = webpSize(bytes);
      assert.deepEqual(size, { width: cover.width, height: cover.height }, key);
      assert.ok(cover.width >= 300 && cover.width <= 400, `${key} width`);
      assert.ok(cover.height > cover.width, `${key} is a portrait poster`);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        cover.sha256,
        key,
      );
    }
  });

  it("composes each YouTube and Twitch channel's own art into a cover (T8)", () => {
    const channel = (key: string): TvChannelCover => {
      const cover = TV_COVERS[key];
      assert.ok(cover && "avatar" in cover, `${key} is channel art`);
      return cover;
    };
    for (const [id, youtube] of Object.entries(TV_YOUTUBE)) {
      const cover = channel(id);
      assert.equal(cover.platform, "youtube", id);
      assert.equal(cover.channelId, youtube.channelId, id);
      assert.equal(cover.title, youtube.name, id);
      assert.match(
        cover.src,
        /^\/world\/tv\/covers\/channel-[a-z0-9-]+\.webp$/,
      );
      // The avatar is pinned by its image id on yt3; never a full URL.
      const yt3 = /^(ytc\/)?[\w-]{20,}$/;
      assert.match(cover.avatar, yt3, id);
      assert.ok(cover.banner === null || yt3.test(cover.banner), id);
    }
    for (const [id, twitch] of Object.entries(TV_TWITCH)) {
      const cover = channel(id);
      assert.equal(cover.platform, "twitch", id);
      assert.equal(cover.channelId, twitch.twitchId, id);
      assert.match(cover.src, /^\/world\/tv\/covers\/live-[a-z0-9-]+\.webp$/);
      assert.match(cover.avatar, /^[\w/.-]+\.(png|jpe?g)$/, id);
      assert.doesNotMatch(cover.avatar, /^https?:/, id);
    }
    // At least one channel shows its banner behind the avatar.
    assert.ok(
      Object.values(TV_COVERS).some(
        (cover) => "platform" in cover && cover.banner,
      ),
    );
  });

  it("downloads channel art from the public page and Helix, at prepare time only", () => {
    const source = readFileSync(SCRIPT, "utf8");
    assert.match(source, /YOUTUBE = "https:\/\/www\.youtube\.com"/);
    assert.match(source, /`\$\{YOUTUBE\}\/@\$\{handle\}`/);
    assert.match(source, /imageBannerViewModel/);
    assert.match(source, /og:image/);
    assert.match(source, /profile_image_url/);
    assert.match(source, /offline_image_url/);
    assert.match(source, /HELIX = "https:\/\/api\.twitch\.tv\/helix"/);
    assert.match(source, /`\$\{HELIX\}\/users\?/);
  });

  it("has a TMDB series poster for every anime (T10, S11)", () => {
    for (const title of tvApp("anime").titles) {
      const cover = film(title.id);
      assert.equal(cover.tmdbType, "tv", title.id);
      assert.equal(cover.year, title.year, title.id);
      assert.equal(norm(cover.title), norm(title.title), title.id);
    }
  });

  it("covers Highlights with NFL's channel art and the Jordan video's thumbnail", () => {
    const nfl = TV_COVERS["highlights-nfl"];
    assert.ok("avatar" in nfl, "NFL is channel art");
    assert.equal(nfl.channelId, TV_YOUTUBE["highlights-nfl"].channelId);
    const jordan = TV_COVERS["highlights-jordan"];
    assert.ok("videoId" in jordan, "Jordan is a video thumbnail");
    assert.equal(jordan.videoId, TV_VIDEOS["highlights-jordan"].youtube);
    assert.equal(jordan.platform, "youtube");
  });

  it("ships no poster the manifest does not list", () => {
    const listed = new Set(
      Object.values(TV_COVERS).map((cover) => cover.src.split("/").pop()),
    );
    const files = readdirSync(COVERS).filter((name) =>
      statSync(new URL(name, COVERS)).isFile(),
    );
    assert.deepEqual(files.sort(), [...listed].sort());
  });

  it("reads the TMDB keys only from the environment and never logs them", () => {
    const source = readFileSync(SCRIPT, "utf8");
    assert.match(source, /process\.env\.TMDB_READ_ACCESS_TOKEN/);
    assert.match(source, /process\.env\.TMDB_API_KEY/);
    assert.match(source, /process\.loadEnvFile\(/);
    assert.doesNotMatch(source, /process\.argv[^\n]*(TOKEN|KEY)/i);
    // No secret-looking literal: no JWT, no 32-hex API key.
    assert.doesNotMatch(source, /eyJ[\w-]{10,}/);
    assert.doesNotMatch(source, /\b[0-9a-f]{32}\b/);
    // Nothing that holds a secret reaches a log line.
    for (const line of source
      .split("\n")
      .filter((l) => /console\.|process\.std(out|err)\.write|\bsay\(/.test(l)))
      assert.doesNotMatch(
        line,
        /token|apiKey|api_key|headers|Authorization|process\.env/i,
        line,
      );
    // The keys are touched only to read them, send them and redact them.
    const uses = source
      .split("\n")
      .filter((line) => /\b(bearer|v3key)\b/.test(line))
      .map((line) => line.trim());
    assert.deepEqual(uses, [
      'const bearer = process.env.TMDB_READ_ACCESS_TOKEN ?? "";',
      'const v3key = process.env.TMDB_API_KEY ?? "";',
      "[bearer, v3key, igdbClientId, igdbSecret, igdbToken].filter(",
      "if (bearer) init.headers.Authorization = `Bearer ${bearer}`;",
      'else url.searchParams.set("api_key", v3key);',
      "if (!bearer && !v3key)",
    ]);
    // Errors go through the redactor before they are thrown or printed.
    assert.match(source, /function redact\(/);
  });

  it("reads the IGDB keys only from the environment and never logs them", () => {
    const source = readFileSync(SCRIPT, "utf8");
    assert.match(source, /process\.env\.IGDB_CLIENT_ID/);
    assert.match(source, /process\.env\.IGDB_CLIENT_SECRET/);
    // No Twitch-looking literal (client ids, secrets and tokens are 30
    // lowercase letters and digits).
    assert.doesNotMatch(source, /\b[a-z0-9]{30}\b/);
    // The client id, the secret and the token are touched only to read them,
    // send them and redact them.
    const uses = source
      .split("\n")
      .filter((line) => /\b(igdbClientId|igdbSecret|igdbToken)\b/.test(line))
      .map((line) => line.trim());
    assert.deepEqual(uses, [
      'const igdbClientId = process.env.IGDB_CLIENT_ID ?? "";',
      'const igdbSecret = process.env.IGDB_CLIENT_SECRET ?? "";',
      'let igdbToken = "";',
      "[bearer, v3key, igdbClientId, igdbSecret, igdbToken].filter(",
      "client_id: igdbClientId,",
      "client_secret: igdbSecret,",
      'igdbToken = String((await response.json()).access_token ?? "");',
      'if (!igdbToken) throw new Error("Twitch token: no access_token");',
      "if (!igdbToken) await twitchToken();",
      '"Client-ID": igdbClientId,',
      "Authorization: `Bearer ${igdbToken}`,",
      "if (!igdbClientId || !igdbSecret)",
    ]);
    // The token is posted as a form body, never put in a URL.
    assert.match(source, /https:\/\/id\.twitch\.tv\/oauth2\/token"/);
    assert.match(source, /body: new URLSearchParams\(/);
    // IGDB allows 4 requests per second.
    assert.match(source, /IGDB_INTERVAL_MS = (2[5-9]\d|[3-9]\d\d)\b/);
  });

  it("never calls TMDB or IGDB from the site at runtime", () => {
    const manifest = readFileSync(
      new URL("src/lib/world/tv-covers.ts", ROOT),
      "utf8",
    );
    assert.doesNotMatch(manifest, /themoviedb\.org|tmdb\.org|fetch\(/);
    assert.doesNotMatch(manifest, /igdb\.com|twitch\.tv/);
    assert.doesNotMatch(manifest, /TMDB_(API_KEY|READ_ACCESS_TOKEN)/);
    assert.doesNotMatch(manifest, /IGDB_CLIENT_(ID|SECRET)/);
  });
});
