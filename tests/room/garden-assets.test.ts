import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { it } from "node:test";
import { GARDEN_SIZE, gardenUrls } from "../../src/lib/room/garden-layout.ts";

const folder = new URL("../../public/textures/garden/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, folder));
const manifest = () => JSON.parse(read("manifest.json").toString("utf8"));

// Reads dimensions from the simple (non-extended) WebP bitstream headers.
function webpInfo(data: Buffer) {
  assert.equal(data.toString("ascii", 0, 4), "RIFF");
  assert.equal(data.readUInt32LE(4) + 8, data.length);
  assert.equal(data.toString("ascii", 8, 12), "WEBP");
  const chunk = data.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    assert.deepEqual([...data.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
    return {
      chunk,
      width: data.readUInt16LE(26) & 0x3fff,
      height: data.readUInt16LE(28) & 0x3fff,
    };
  }
  assert.equal(chunk, "VP8L", "no extended/metadata WebP containers");
  assert.equal(data[20], 0x2f);
  const bits = data.readUInt32LE(21);
  return {
    chunk,
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
  };
}

const sets = {
  stone: {
    asset: "stone_pathway_02",
    name: "Stone Pathway 02",
    authors: ["Amal Kumar"],
  },
  gravel: {
    asset: "gravel_floor_02",
    name: "Gravel Floor 02",
    authors: ["Jenelle van Heerden", "Dimitrios Savva"],
  },
} as const;

for (const [layer, { asset, name, authors }] of Object.entries(sets)) {
  it(`ships local 1K ${layer} color, OpenGL normal and roughness maps with verified CC0 provenance`, () => {
    const material = manifest().materials.find(
      (entry: { layer: string }) => entry.layer === layer,
    );
    assert.ok(material, `${layer} missing from the manifest`);
    assert.equal(material.asset, asset);
    assert.equal(material.name, name);
    assert.equal(material.source, `https://polyhaven.com/a/${asset}`);
    assert.equal(material.license, "CC0-1.0");
    assert.deepEqual(Object.keys(material.authors).sort(), [...authors].sort());
    // The runtime repeat is the captured size recorded from the official API.
    assert.equal(
      GARDEN_SIZE[layer as keyof typeof GARDEN_SIZE],
      Math.round(material.realWorldSizeMeters * 100) / 100,
    );
    assert.deepEqual(Object.keys(material.maps).sort(), [
      "color",
      "normal",
      "roughness",
    ]);
    const expected = {
      color: ["srgb", "VP8 ", "diff"],
      normal: ["linear", "VP8L", "nor_gl"],
      roughness: ["linear", "VP8 ", "rough"],
    };
    const urls = gardenUrls(layer as keyof typeof GARDEN_SIZE);
    for (const [kind, [colorSpace, chunk, suffix]] of Object.entries(
      expected,
    )) {
      const map = material.maps[kind];
      assert.equal(map.path, `${layer}-${kind}.webp`);
      assert.ok(urls.includes(`/textures/garden/${map.path}`));
      assert.equal(map.colorSpace, colorSpace);
      assert.equal(
        map.sourceUrl,
        `https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/${asset}/${asset}_${suffix}_1k.png`,
      );
      assert.match(map.sourceMd5, /^[0-9a-f]{32}$/);
      assert.match(map.sourceSha256, /^[0-9a-f]{64}$/);
      assert.ok(map.sourceBytes > 0);
      assert.match(map.encoding, /^cwebp /);
      const data = read(map.path);
      const info = webpInfo(data);
      // Normals are lossless: lossy YUV 4:2:0 would distort X/Y vectors.
      assert.equal(info.chunk, chunk);
      assert.deepEqual([info.width, info.height], [1024, 1024]);
      assert.deepEqual([map.width, map.height], [1024, 1024]);
      assert.equal(map.bytes, data.length);
      assert.equal(map.sha256, createHash("sha256").update(data).digest("hex"));
    }
  });
}

it("keeps the garden maps within budget, discloses raw source bytes and makes no runtime requests", () => {
  const data = manifest();
  assert.equal(data.provider, "Poly Haven");
  assert.equal(data.license, "CC0-1.0");
  assert.equal(data.runtimeExternalRequests, false);
  const maps = data.materials.flatMap((material: { maps: object }) =>
    Object.values(material.maps),
  );
  assert.equal(maps.length, 6);
  const total = maps.reduce(
    (sum: number, map: { path: string }) => sum + read(map.path).length,
    0,
  );
  assert.equal(data.totalBytes, total);
  assert.ok(total <= 6_000_000, `six garden maps: ${total} bytes > 6 MB`);
  // Build-time sources exceed the 20 MB raw guidance; recorded, not hidden.
  const raw = maps.reduce(
    (sum: number, map: { sourceBytes: number }) => sum + map.sourceBytes,
    0,
  );
  assert.equal(data.sourceBytes, raw);
  assert.equal(raw, 27_787_039);
  assert.match(data.sourceBudgetNote, /20 MB/);
  // Only the six maps and the manifest ship; sources stay in the build cache.
  for (const map of maps as { path: string }[])
    assert.ok(existsSync(new URL(map.path, folder)));
});
