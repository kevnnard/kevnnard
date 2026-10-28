import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

for (const species of ["pine", "fir"]) {
  it(`ships a self-contained, bounded ${species} tree with real source provenance`, () => {
    let total = 0;
    for (const lod of ["near", "far"]) {
      const buffer = readFileSync(
        new URL(
          `../../public/models/forest/${species}-${lod}.glb`,
          import.meta.url,
        ),
      );
      total += buffer.length;
      assert.equal(buffer.toString("utf8", 0, 4), "glTF");
      assert.equal(buffer.readUInt32LE(8), buffer.length);
      const json = JSON.parse(
        buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
      );
      assert.ok(json.meshes.length > 0);
      assert.ok(json.images.length > 0);
      assert.ok(
        json.images.every(
          (image: { uri?: string; bufferView?: number }) =>
            !image.uri && image.bufferView !== undefined,
        ),
      );
      assert.ok(json.buffers.every((data: { uri?: string }) => !data.uri));
    }
    assert.ok(total < 12_000_000, "two LODs must stay below 12 MB per species");
    const manifest = JSON.parse(
      readFileSync(
        new URL("../../public/models/forest/manifest.json", import.meta.url),
        "utf8",
      ),
    );
    const asset = manifest.assets.find(
      (entry: { species: string }) => entry.species === species,
    );
    assert.equal(asset.license, "CC0-1.0");
    assert.match(asset.source, /^https:\/\/polyhaven.com\/a\//);
    assert.ok(Object.keys(asset.authors).length > 0);
  });
}
