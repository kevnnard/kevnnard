import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { coverKey, TV_COVERS } from "../../src/lib/world/tv-covers.ts";
import { TV_APPS, tvApp } from "../../src/lib/world/tv-library.ts";
import {
  TV_TRAILERS,
  TV_TRAILERS_MISSING,
  TV_TWITCH,
  TV_YOUTUBE,
  tvEmbedSrc,
} from "../../src/lib/world/tv-media.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), "utf8");
const SCRIPT = "scripts/prepare-tv-media.mjs";

/** Every film and game that can play a trailer, by cover key. */
const trailerKeys = () =>
  ["movies", "games"].flatMap((id) =>
    tvApp(id as "movies" | "games").titles.flatMap((title) =>
      title.films
        ? title.films.map((entry) => coverKey(title.id, entry))
        : [title.id],
    ),
  );

describe("TV media manifest (tv-home-screen T8, S8-S10)", () => {
  it("resolves every YouTube channel of the Channels app to its id", () => {
    const channels = tvApp("channels").titles;
    assert.deepEqual(
      Object.keys(TV_YOUTUBE),
      channels.map((title) => title.id),
    );
    assert.deepEqual(
      Object.values(TV_YOUTUBE).map((channel) => channel.handle),
      ["midudev", "GentlemanProgramming", "FaztTech", "soydalto", "theo"],
    );
    for (const channel of Object.values(TV_YOUTUBE)) {
      assert.match(channel.channelId, /^UC[\w-]{22}$/, channel.handle);
      assert.ok(channel.name.length > 0, channel.handle);
    }
    const ids = Object.values(TV_YOUTUBE).map((channel) => channel.channelId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("lists the owner's Twitch channels for the Live app", () => {
    const live = tvApp("live").titles;
    assert.deepEqual(
      Object.keys(TV_TWITCH),
      live.map((title) => title.id),
    );
    assert.deepEqual(
      Object.values(TV_TWITCH).map((channel) => channel.login),
      ["gentleman_programming", "midudev", "melenitasdev"],
    );
    for (const channel of Object.values(TV_TWITCH)) {
      assert.match(channel.twitchId, /^\d+$/, channel.login);
      assert.ok(channel.name.length > 0, channel.login);
    }
  });

  it("pins a YouTube trailer for every film and game, or says why not", () => {
    const keys = trailerKeys();
    assert.ok(keys.length >= 45, "every film and game");
    for (const key of keys) {
      const trailer = Object.hasOwn(TV_TRAILERS, key) ? TV_TRAILERS[key] : null;
      if (!trailer) {
        assert.ok(TV_TRAILERS_MISSING.includes(key), `${key}: no trailer`);
        continue;
      }
      assert.match(trailer.youtube, /^[\w-]{11}$/, key);
      const cover = TV_COVERS[key];
      if ("tmdbId" in cover) {
        assert.equal(trailer.source, "tmdb", key);
        assert.equal(trailer.sourceId, cover.tmdbId, key);
      } else {
        assert.equal(trailer.source, "igdb", key);
        assert.equal(trailer.sourceId, cover.igdbId, key);
      }
    }
    assert.deepEqual(
      Object.keys(TV_TRAILERS).filter((key) => !keys.includes(key)),
      [],
      "no trailer for anything the TV does not list",
    );
    for (const key of TV_TRAILERS_MISSING)
      assert.ok(keys.includes(key) && !Object.hasOwn(TV_TRAILERS, key), key);
    // Most of the library has one.
    assert.ok(Object.keys(TV_TRAILERS).length >= keys.length - 6);
  });
});

describe("TV embed URLs (T8)", () => {
  const midudev = TV_YOUTUBE["channel-midudev"];

  it("plays a channel's latest uploads through the privacy-enhanced player", () => {
    const src = new URL(
      tvEmbedSrc(
        { kind: "uploads", channelId: midudev.channelId },
        "kevnnard.dev",
      ),
    );
    assert.equal(src.origin, "https://www.youtube-nocookie.com");
    assert.equal(src.pathname, "/embed/videoseries");
    assert.equal(
      src.searchParams.get("list"),
      `UU${midudev.channelId.slice(2)}`,
    );
    assert.equal(src.searchParams.get("mute"), "1", "starts muted");
  });

  it("plays a channel's live stream and a trailer, muted, from nocookie", () => {
    const live = new URL(
      tvEmbedSrc({ kind: "live", channelId: midudev.channelId }, "localhost"),
    );
    assert.equal(live.origin, "https://www.youtube-nocookie.com");
    assert.equal(live.pathname, "/embed/live_stream");
    assert.equal(live.searchParams.get("channel"), midudev.channelId);
    assert.equal(live.searchParams.get("mute"), "1");
    const trailer = new URL(
      tvEmbedSrc({ kind: "trailer", youtube: "dQw4w9WgXcQ" }, "localhost"),
    );
    assert.equal(trailer.origin, "https://www.youtube-nocookie.com");
    assert.equal(trailer.pathname, "/embed/dQw4w9WgXcQ");
    assert.equal(trailer.searchParams.get("mute"), "1");
  });

  it("plays Twitch muted, not autoplaying, with the page's own host as parent", () => {
    for (const host of ["localhost", "127.0.0.1", "kevnnard.dev"]) {
      const src = new URL(
        tvEmbedSrc({ kind: "twitch", login: "midudev" }, host),
      );
      assert.equal(src.origin, "https://player.twitch.tv");
      assert.equal(src.searchParams.get("channel"), "midudev");
      assert.equal(src.searchParams.get("parent"), host);
      assert.equal(src.searchParams.get("muted"), "true");
      assert.equal(src.searchParams.get("autoplay"), "false");
    }
  });

  it("rejects anything that is not a plain id or host", () => {
    assert.throws(
      () => tvEmbedSrc({ kind: "uploads", channelId: "UCnope" }, "localhost"),
      RangeError,
    );
    assert.throws(
      () => tvEmbedSrc({ kind: "trailer", youtube: "x&list=1" }, "localhost"),
      RangeError,
    );
    assert.throws(
      () => tvEmbedSrc({ kind: "twitch", login: "midudev" }, "evil.com/x?"),
      RangeError,
    );
    assert.throws(
      () => tvEmbedSrc({ kind: "twitch", login: "Bad Login" }, "localhost"),
      RangeError,
    );
  });
});

describe("TV media script and secrets (T8)", () => {
  const source = read(SCRIPT);
  const manifest = read("src/lib/world/tv-media.ts");

  it("reads the channel ids from the public channel pages at prepare time", () => {
    assert.match(source, /https:\/\/www\.youtube\.com\/@/);
    assert.match(source, /externalId/);
    assert.match(source, /\/oembed\?format=json&url=/);
    assert.match(manifest, /Generated by scripts\/prepare-tv-media\.mjs/);
  });

  it("reads the TMDB and IGDB keys only from the environment and never logs them", () => {
    assert.match(source, /process\.env\.TMDB_READ_ACCESS_TOKEN/);
    assert.match(source, /process\.env\.IGDB_CLIENT_SECRET/);
    assert.match(source, /process\.loadEnvFile\(/);
    assert.doesNotMatch(source, /process\.argv[^\n]*(TOKEN|KEY|SECRET)/i);
    assert.doesNotMatch(source, /eyJ[\w-]{10,}/);
    assert.doesNotMatch(source, /\b[0-9a-f]{32}\b/);
    assert.doesNotMatch(source, /\b[a-z0-9]{30}\b/);
    for (const line of source
      .split("\n")
      .filter((l) => /console\.|process\.std(out|err)\.write|\bsay\(/.test(l)))
      assert.doesNotMatch(
        line,
        /token|apiKey|api_key|headers|Authorization|process\.env|secret/i,
        line,
      );
    const uses = source
      .split("\n")
      .filter((line) =>
        /\b(bearer|v3key|igdbClientId|igdbSecret|igdbToken)\b/.test(line),
      )
      .map((line) => line.trim());
    assert.deepEqual(uses, [
      'const bearer = process.env.TMDB_READ_ACCESS_TOKEN ?? "";',
      'const v3key = process.env.TMDB_API_KEY ?? "";',
      'const igdbClientId = process.env.IGDB_CLIENT_ID ?? "";',
      'const igdbSecret = process.env.IGDB_CLIENT_SECRET ?? "";',
      'let igdbToken = "";',
      "[bearer, v3key, igdbClientId, igdbSecret, igdbToken].filter(",
      "if (bearer) init.headers.Authorization = `Bearer ${bearer}`;",
      'else url.searchParams.set("api_key", v3key);',
      "client_id: igdbClientId,",
      "client_secret: igdbSecret,",
      'igdbToken = String((await response.json()).access_token ?? "");',
      'if (!igdbToken) throw new Error("Twitch token: no access_token");',
      "if (!igdbToken) await twitchToken();",
      '"Client-ID": igdbClientId,',
      "Authorization: `Bearer ${igdbToken}`,",
      "if (!bearer && !v3key)",
      "if (!igdbClientId || !igdbSecret)",
    ]);
    assert.match(source, /function redact\(/);
    assert.match(source, /body: new URLSearchParams\(/);
  });

  it("ships no key and makes no API call from the site", () => {
    assert.doesNotMatch(
      manifest,
      /fetch\(|api\.twitch\.tv|themoviedb\.org|igdb\.com|oembed/,
    );
    assert.doesNotMatch(manifest, /TMDB_|IGDB_|client_secret|Bearer/);
    for (const file of [
      "src/lib/world/tv-screen.ts",
      "src/components/world/TvPlayer.tsx",
      "src/components/world/TvScreen.tsx",
    ])
      assert.doesNotMatch(read(file), /fetch\(|api\.twitch\.tv|helix/, file);
  });
});

describe("Player credits (T8, S8-S10)", () => {
  const services = JSON.parse(read("public/world/credits.json")).services as {
    id: string;
    name: string;
    url: string;
    notice: string;
    rights: string;
    files: string;
    count: number;
  }[];

  it("names YouTube and Twitch as third-party players, content by its creators", () => {
    for (const [id, name, url] of [
      ["youtube", "YouTube", "https://www.youtube.com"],
      ["twitch", "Twitch", "https://www.twitch.tv"],
    ]) {
      const entry = services.find((service) => service.id === id);
      assert.ok(entry, id);
      assert.equal(entry.name, name);
      assert.equal(entry.url, url);
      assert.match(entry.notice, /official/i);
      assert.match(entry.rights, /creators/);
      // The channel art on the TV's covers is theirs too.
      assert.match(entry.rights, /avatars and banners belong to/);
      assert.equal(entry.files, "tv/covers/");
      assert.equal(
        entry.count,
        Object.values(TV_COVERS).filter(
          (cover) => "platform" in cover && cover.platform === id,
        ).length,
      );
    }
  });

  it("keeps the dock's apps in sync with the manifest", () => {
    assert.ok(TV_APPS.some((app) => app.id === "live"));
  });
});
