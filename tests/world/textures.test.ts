import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { type Credits, creditProblems } from "../../src/lib/world/credits.ts";
import {
  boxUv,
  SETUP_SURFACES,
  SURFACES,
  TEXTURE_URLS,
  TEXTURES,
} from "../../src/lib/world/textures.ts";
import { PUBLIC } from "./glb.ts";

const credits = (): Credits =>
  JSON.parse(readFileSync(new URL("credits.json", PUBLIC), "utf8"));

const shipped = () =>
  readdirSync(new URL("textures/", PUBLIC))
    .filter((name) => name.endsWith(".webp"))
    .sort()
    .map((name) => `textures/${name}`);

/** Width and height from a WebP header (lossy, lossless or extended). */
function webpSize(data: Buffer): [number, number] {
  assert.equal(data.toString("latin1", 0, 4), "RIFF");
  assert.equal(data.toString("latin1", 8, 12), "WEBP");
  const chunk = data.toString("latin1", 12, 16);
  if (chunk === "VP8 ")
    return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = data.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  assert.equal(chunk, "VP8X");
  return [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1];
}

describe("stylized textures (T4e, S9)", () => {
  it("credits every shipped map, and the runtime loads exactly those maps", () => {
    const files = (credits().textures ?? []).map((entry) => entry.file);
    assert.deepEqual([...files].sort(), shipped());
    assert.deepEqual(
      TEXTURE_URLS.map((url) => url.replace("/world/", "")).sort(),
      shipped(),
    );
    assert.equal(
      shipped().length,
      SURFACES.reduce((sum, surface) => sum + TEXTURES[surface].maps.length, 0),
    );
  });

  it("ships 1024 maps whose bytes and hash match their credit, house maps within 6 MB", () => {
    let total = 0;
    const setup = SETUP_SURFACES.map((surface) => TEXTURES[surface].name);
    for (const entry of credits().textures ?? []) {
      const data = readFileSync(new URL(entry.file, PUBLIC));
      if (!setup.includes(entry.asset)) total += data.length;
      assert.deepEqual(webpSize(data), [1024, 1024], entry.file);
      assert.deepEqual([entry.width, entry.height], [1024, 1024], entry.file);
      assert.equal(entry.bytes, data.length, entry.file);
      assert.equal(
        entry.sha256,
        createHash("sha256").update(data).digest("hex"),
        entry.file,
      );
    }
    assert.ok(total <= 6_000_000, `${total} bytes`);
  });

  it("credits CreativeTrio's CC0 StylizedTextures pack with its source pages", () => {
    const data = credits();
    assert.deepEqual(creditProblems(data), []);
    const pack = data.packs.find((item) => item.id === "stylizedtextures");
    assert.ok(pack, "pack credited");
    assert.equal(pack.author, "CreativeTrio");
    assert.equal(pack.authorUrl, "https://creativetrio.art");
    assert.equal(pack.license, "CC0-1.0");
    for (const entry of data.textures ?? []) {
      assert.equal(entry.pack, "stylizedtextures", entry.file);
      assert.equal(
        entry.source,
        `https://stylizedtextures.com/texture/${entry.asset.toLowerCase()}`,
      );
      assert.ok(entry.sourceFiles.length > 0, entry.file);
    }
  });

  it("normalizes each color map by the mean recorded at build time", () => {
    const textures = credits().textures ?? [];
    for (const surface of SURFACES) {
      const { name, mean } = TEXTURES[surface];
      const color = textures.find(
        (entry) => entry.file === `textures/${name}-color.webp`,
      );
      assert.deepEqual(color?.meanLinear, mean, surface);
    }
  });

  it("rejects a texture credit from an unofficial host", () => {
    const data = credits();
    const [first, ...rest] = data.textures ?? [];
    const problems = creditProblems({
      ...data,
      textures: [{ ...first, source: "https://example.com/x" }, ...rest],
    });
    assert.equal(problems.length, 1, problems.join("\n"));
  });

  it("projects UVs in metres with horizontal boards on every wall", () => {
    assert.deepEqual(boxUv([1, 2, 3], [0, 0, 1]), [1, 2]);
    assert.deepEqual(boxUv([1, 2, 3], [-1, 0, 0]), [3, 2]);
    // Both roof slopes: v falls as the slope goes down.
    assert.ok(
      boxUv([0, 0, 1], [0, 0.8, 0.6])[1] < boxUv([0, 0, 0], [0, 0.8, 0.6])[1],
    );
    assert.ok(
      boxUv([0, 0, -1], [0, 0.8, -0.6])[1] <
        boxUv([0, 0, 0], [0, 0.8, -0.6])[1],
    );
  });
});
