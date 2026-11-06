// Real film posters for the living-room TV (tv-home-screen T4, S7): every
// film in the Movies app, and every collection, has a TMDB poster downloaded
// once by scripts/prepare-tv-covers.mjs, shipped as a small WebP and listed
// in the generated manifest. The keys live only in the gitignored .env; the
// site never calls TMDB at runtime.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  COVER_MAX_BYTES,
  coverKey,
  TV_COVERS,
} from "../../src/lib/world/tv-covers.ts";
import { tvApp } from "../../src/lib/world/tv-library.ts";

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

/** Every key the Movies app needs: each film, and each collection's cover. */
function expected() {
  const keys: { key: string; title: string; year: number }[] = [];
  for (const title of tvApp("movies").titles) {
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
      assert.ok(title.year, `${title.id} has a year`);
      keys.push({ key: title.id, title: title.title, year: title.year });
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
      const cover = TV_COVERS[key];
      assert.ok(cover, `cover for ${key}`);
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
    assert.deepEqual(
      Object.keys(TV_COVERS).sort(),
      keys.map((k) => k.key).sort(),
      "no covers for games, channels or titles outside the library",
    );
  });

  it("uses TMDB's own collection posters, and a pinned film for the rest", () => {
    assert.equal(TV_COVERS["harry-potter"].tmdbType, "collection");
    assert.equal(TV_COVERS["pirates-of-the-caribbean"].tmdbType, "collection");
    for (const id of [
      "quentin-tarantino",
      "jim-carrey",
      "american-football-films",
    ]) {
      const cover = TV_COVERS[id];
      assert.equal(cover.tmdbType, "movie", id);
      assert.ok(cover.representative, `${id} records its representative film`);
      const film = TV_COVERS[`${id}/${cover.representative}`];
      assert.ok(film, `${id} representative is one of its films`);
      assert.equal(cover.src, film.src);
      assert.equal(cover.tmdbId, film.tmdbId);
    }
  });

  it("ships each poster as a small WebP whose size and hash match the manifest", () => {
    for (const [key, cover] of Object.entries(TV_COVERS)) {
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
      "const secrets = [bearer, v3key].filter((value) => value.length >= 8);",
      "if (bearer) init.headers.Authorization = `Bearer ${bearer}`;",
      'else url.searchParams.set("api_key", v3key);',
      "if (!bearer && !v3key)",
    ]);
    // Errors go through the redactor before they are thrown or printed.
    assert.match(source, /function redact\(/);
  });

  it("never calls TMDB from the site at runtime", () => {
    const manifest = readFileSync(
      new URL("src/lib/world/tv-covers.ts", ROOT),
      "utf8",
    );
    assert.doesNotMatch(manifest, /themoviedb\.org|tmdb\.org|fetch\(/);
    assert.doesNotMatch(manifest, /TMDB_(API_KEY|READ_ACCESS_TOKEN)/);
  });
});
