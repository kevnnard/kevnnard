import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { Box3, type BufferAttribute, Mesh, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const folder = new URL("../../public/models/forest-debris/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, folder));

interface DebrisMesh {
  node: string;
  sourceTriangles: number;
  triangles: number;
  sourceSizeMeters: number[];
  sourceSilhouette: number[];
}
interface DebrisAsset {
  name: string;
  source: string;
  license: string;
  authors: Record<string, string>;
  sourceFiles: { url: string; bytes: number; md5: string; sha256: string }[];
  file: { path: string; bytes: number; sha256: string; triangles: number };
  meshes: DebrisMesh[];
}
const manifest = () =>
  JSON.parse(read("manifest.json").toString("utf8")) as {
    license: string;
    rawBytes: number;
    optimizedBytes: number;
    assets: DebrisAsset[];
  };

it("ships self-contained CC0 debris with verified official provenance", () => {
  const { license, rawBytes, optimizedBytes, assets } = manifest();
  assert.equal(license, "CC0-1.0");
  assert.deepEqual(
    assets.map((asset) => asset.name),
    ["log", "stump", "rocks"],
  );
  let total = 0;
  for (const asset of assets) {
    assert.equal(asset.license, "CC0-1.0");
    assert.match(asset.source, /^https:\/\/polyhaven\.com\/a\/[a-z0-9_]+$/);
    assert.ok(Object.keys(asset.authors).length > 0);
    assert.ok(asset.sourceFiles.length >= 3);
    for (const source of asset.sourceFiles) {
      assert.match(source.url, /^https:\/\/dl\.polyhaven\.org\/file\//);
      assert.match(source.md5, /^[0-9a-f]{32}$/);
      assert.match(source.sha256, /^[0-9a-f]{64}$/);
      // Asset files only: never website preview renders.
      assert.doesNotMatch(source.url, /preview|thumb|render/i);
    }
    const bytes = read(asset.file.path);
    total += bytes.length;
    assert.equal(bytes.length, asset.file.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.file.sha256,
    );
    assert.equal(bytes.toString("utf8", 0, 4), "glTF");
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const json = JSON.parse(
      bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
    );
    assert.ok(json.buffers.every((data: { uri?: string }) => !data.uri));
    assert.ok(
      json.images.every(
        (image: { uri?: string; mimeType?: string }) =>
          !image.uri && image.mimeType === "image/webp",
      ),
    );
    assert.ok(json.extensionsUsed.includes("EXT_meshopt_compression"));
  }
  assert.equal(total, optimizedBytes);
  assert.ok(optimizedBytes < 4_000_000, `${optimizedBytes} optimized bytes`);
  assert.ok(rawBytes > optimizedBytes);
});

const GRID = 64;
// Same rasterized coverage as scripts/prepare-forest-debris.py `silhouette`.
function silhouette(position: BufferAttribute, index: ArrayLike<number>) {
  const points = Array.from({ length: position.count }, (_, i) => [
    position.getX(i),
    position.getY(i),
    position.getZ(i),
  ]);
  const low = [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a])));
  const high = [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])));
  return [
    [0, 1],
    [0, 2],
    [1, 2],
  ].map(([a, b]) => {
    const project = points.map((p) => [
      ((p[a] - low[a]) / (high[a] - low[a])) * GRID,
      ((p[b] - low[b]) / (high[b] - low[b])) * GRID,
    ]);
    const cells = new Set<number>();
    for (let i = 0; i < index.length; i += 3) {
      const [[x0, y0], [x1, y1], [x2, y2]] = [0, 1, 2].map(
        (k) => project[index[i + k]],
      );
      if ((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0) === 0) continue;
      const cx0 = Math.max(0, Math.trunc(Math.min(x0, x1, x2)));
      const cx1 = Math.min(GRID - 1, Math.trunc(Math.max(x0, x1, x2)));
      const cy0 = Math.max(0, Math.trunc(Math.min(y0, y1, y2)));
      const cy1 = Math.min(GRID - 1, Math.trunc(Math.max(y0, y1, y2)));
      for (let cx = cx0; cx <= cx1; cx++)
        for (let cy = cy0; cy <= cy1; cy++) {
          const px = cx + 0.5;
          const py = cy + 0.5;
          const w0 = (x1 - px) * (y2 - py) - (x2 - px) * (y1 - py);
          const w1 = (x2 - px) * (y0 - py) - (x0 - px) * (y2 - py);
          const w2 = (x0 - px) * (y1 - py) - (x1 - px) * (y0 - py);
          if (
            (w0 >= 0 && w1 >= 0 && w2 >= 0) ||
            (w0 <= 0 && w1 <= 0 && w2 <= 0)
          )
            cells.add(cx + cy * GRID);
        }
    }
    return cells.size / GRID ** 2;
  });
}

it("decodes every shipped debris mesh with its source size and silhouette", async () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Public loader plugin: geometry-only check, not browser image/GPU proof.
  loader.register(() => ({
    name: "EXT_texture_webp",
    loadTexture: async () => new Texture(),
  }));
  const failures: string[] = [];
  let triangles = 0;
  for (const asset of manifest().assets) {
    const bytes = read(asset.file.path);
    const gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    gltf.scene.updateMatrixWorld(true);
    const meshes = new Map<string, Mesh>();
    gltf.scene.traverse((object) => {
      if (object instanceof Mesh) meshes.set(object.name, object);
    });
    assert.equal(meshes.size, asset.meshes.length, `${asset.name} meshes`);
    for (const expected of asset.meshes) {
      const mesh = meshes.get(expected.node);
      assert.ok(
        mesh,
        `${asset.name}: ${expected.node} must stay a separate mesh`,
      );
      const index = mesh.geometry.getIndex();
      assert.ok(index);
      assert.equal(index.count / 3, expected.triangles);
      assert.ok(expected.triangles < expected.sourceTriangles);
      triangles += expected.triangles;
      const size = new Box3().setFromObject(mesh).getSize(new Vector3());
      size.toArray().forEach((value, axis) => {
        const source = expected.sourceSizeMeters[axis];
        if (Math.abs(value - source) > source * 0.01)
          failures.push(
            `${expected.node} axis ${axis}: ${value} m, source ${source} m`,
          );
      });
      const coverage = silhouette(
        mesh.geometry.getAttribute("position") as BufferAttribute,
        index.array,
      );
      coverage.forEach((value, axis) => {
        const source = expected.sourceSilhouette[axis];
        if (Math.abs(value - source) > source * 0.03)
          failures.push(
            `${expected.node} projection ${axis}: ${(value * 100).toFixed(1)}% vs source ${(source * 100).toFixed(1)}%`,
          );
      });
    }
    assert.equal(triangles, asset.file.triangles, `${asset.name} triangles`);
    triangles = 0;
  }
  assert.deepEqual(failures, []);
});
