import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";

const folder = new URL("../../public/textures/ground/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, folder));

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

const manifest = () => JSON.parse(read("manifest.json").toString("utf8"));

const layers = {
  grass: "grass_ground",
  forest: "forrest_ground_03",
  rock: "rocky_terrain",
};

for (const [layer, asset] of Object.entries(layers)) {
  it(`ships local 1K ${layer} color, OpenGL normal and roughness maps with verified provenance`, () => {
    const material = manifest().materials.find(
      (entry: { layer: string }) => entry.layer === layer,
    );
    assert.equal(material.asset, asset);
    assert.equal(material.source, `https://polyhaven.com/a/${asset}`);
    assert.equal(material.license, "CC0-1.0");
    assert.ok(Object.keys(material.authors).length > 0);
    assert.ok(material.realWorldSizeMeters > 0);
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
    for (const [kind, [colorSpace, chunk, suffix]] of Object.entries(
      expected,
    )) {
      const map = material.maps[kind];
      assert.equal(map.path, `${layer}-${kind}.webp`);
      assert.equal(map.colorSpace, colorSpace);
      assert.equal(
        map.sourceUrl,
        `https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/${asset}/${asset}_${suffix}_1k.png`,
      );
      assert.match(map.sourceMd5, /^[0-9a-f]{32}$/);
      assert.match(map.encoding, /^cwebp /);
      const data = read(map.path);
      const info = webpInfo(data);
      // Normals are lossless: lossy YUV 4:2:0 would distort X/Y vectors.
      assert.equal(info.chunk, chunk);
      assert.deepEqual([info.width, info.height], [1024, 1024]);
      assert.equal(map.width, 1024);
      assert.equal(map.bytes, data.length);
      assert.equal(map.sha256, createHash("sha256").update(data).digest("hex"));
    }
  });
}

it("keeps the shipped ground textures within the byte budget and free of runtime requests", () => {
  const data = manifest();
  assert.equal(data.runtimeExternalRequests, false);
  assert.equal(data.provider, "Poly Haven");
  const total = data.materials
    .flatMap((material: { maps: object }) => Object.values(material.maps))
    .reduce(
      (sum: number, map: { path: string }) => sum + read(map.path).length,
      0,
    );
  assert.equal(data.totalBytes, total);
  assert.ok(total < 12_000_000, "nine ground maps must stay below 12 MB");
});
