import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  Box3,
  DoubleSide,
  Mesh,
  type MeshStandardMaterial,
  Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const folder = new URL(
  "../../public/models/forest-understory/",
  import.meta.url,
);
const read = (path: string) => readFileSync(new URL(path, folder));

interface FernMesh {
  node: string;
  sourceTriangles: number;
  triangles: number;
  sourceSizeMeters: number[];
}
interface FernAsset {
  name: string;
  asset: string;
  source: string;
  license: string;
  authors: Record<string, string>;
  sourceFiles: {
    path: string;
    url: string;
    bytes: number;
    md5: string;
    sha256: string;
  }[];
  baseColorAlpha: { from: string[]; sha256: string; coverage: number };
  file: { path: string; bytes: number; sha256: string; triangles: number };
  meshes: FernMesh[];
}
const manifest = () =>
  JSON.parse(read("manifest.json").toString("utf8")) as {
    license: string;
    rawBytes: number;
    optimizedBytes: number;
    runtimeExternalRequests: boolean;
    assets: FernAsset[];
  };

const glbJson = (bytes: Buffer) =>
  JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));

/** Bytes of embedded image `index` in a GLB's binary chunk. */
function glbImage(bytes: Buffer, index: number) {
  const json = glbJson(bytes);
  const binary = 20 + bytes.readUInt32LE(12) + 8;
  const view = json.bufferViews[json.images[index].bufferView];
  const start = binary + (view.byteOffset ?? 0);
  return bytes.subarray(start, start + view.byteLength);
}

/** Whether a WebP file declares an alpha channel (VP8X flag or VP8L bit). */
function webpHasAlpha(image: Buffer) {
  assert.equal(image.toString("ascii", 0, 4), "RIFF");
  assert.equal(image.toString("ascii", 8, 12), "WEBP");
  const chunk = image.toString("ascii", 12, 16);
  if (chunk === "VP8X") return (image[20] & 0x10) !== 0;
  // VP8L header: signature byte, then 14+14 bits of size and the alpha bit.
  if (chunk === "VP8L") return ((image.readUInt32LE(21) >> 28) & 1) === 1;
  return false;
}

it("ships one self-contained CC0 fern set with verified official provenance", () => {
  const { license, rawBytes, optimizedBytes, runtimeExternalRequests, assets } =
    manifest();
  assert.equal(license, "CC0-1.0");
  assert.equal(runtimeExternalRequests, false);
  assert.deepEqual(
    assets.map((asset) => asset.asset),
    ["fern_02"],
  );
  for (const asset of assets) {
    assert.equal(asset.license, "CC0-1.0");
    assert.equal(asset.source, "https://polyhaven.com/a/fern_02");
    assert.ok(Object.keys(asset.authors).length > 0);
    const paths = asset.sourceFiles.map((source) => source.path);
    // The official glTF, its buffer and the official cutout map.
    assert.ok(paths.includes("fern_02_1k.gltf"));
    assert.ok(paths.includes("fern_02.bin"));
    assert.ok(paths.some((path) => /alpha_1k\.png$/.test(path)));
    for (const source of asset.sourceFiles) {
      assert.match(source.url, /^https:\/\/dl\.polyhaven\.org\/file\//);
      assert.match(source.md5, /^[0-9a-f]{32}$/);
      assert.match(source.sha256, /^[0-9a-f]{64}$/);
      assert.ok(source.bytes > 0);
      // Asset files only: never website preview renders.
      assert.doesNotMatch(source.url, /preview|thumb|render|asset_img/i);
    }
    assert.ok(
      asset.baseColorAlpha.from.every((path) => paths.includes(path)),
      "the merged base color comes only from recorded official files",
    );
    // A real cutout: neither solid cards nor an empty texture.
    assert.ok(
      asset.baseColorAlpha.coverage > 0.05 &&
        asset.baseColorAlpha.coverage < 0.9,
      `${asset.baseColorAlpha.coverage} opaque texels`,
    );
  }
  assert.ok(rawBytes <= 40_000_000, `${rawBytes} raw source bytes`);
  const bytes = read(assets[0].file.path);
  assert.equal(bytes.length, assets[0].file.bytes);
  assert.equal(bytes.length, optimizedBytes);
  assert.ok(optimizedBytes <= 2_000_000, `${optimizedBytes} optimized bytes`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    assets[0].file.sha256,
  );
  assert.equal(bytes.toString("utf8", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const json = glbJson(bytes);
  assert.ok(json.buffers.every((data: { uri?: string }) => !data.uri));
  assert.ok(json.extensionsUsed.includes("EXT_meshopt_compression"));
  assert.ok(
    json.images.every(
      (image: { uri?: string; mimeType?: string }) =>
        !image.uri && image.mimeType === "image/webp",
    ),
  );
  // Leaf cutout kept from the source material: alpha-tested, double-sided.
  assert.equal(json.materials.length, 1);
  const [material] = json.materials;
  assert.equal(material.alphaMode, "MASK");
  assert.equal(material.alphaCutoff ?? 0.5, 0.5);
  assert.equal(material.doubleSided, true);
  const baseColor =
    json.textures[material.pbrMetallicRoughness.baseColorTexture.index]
      .source ??
    json.textures[material.pbrMetallicRoughness.baseColorTexture.index]
      .extensions.EXT_texture_webp.source;
  assert.ok(
    webpHasAlpha(glbImage(bytes, baseColor)),
    "base color WebP must carry the alpha cutout",
  );
});

it("decodes every fern clump at its full source detail and physical size", async () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Public loader plugin: geometry/material check, not browser image/GPU proof.
  loader.register(() => ({
    name: "EXT_texture_webp",
    loadTexture: async () => new Texture(),
  }));
  const [asset] = manifest().assets;
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
  assert.deepEqual(
    [...meshes.keys()].sort(),
    asset.meshes.map((mesh) => mesh.node).sort(),
  );
  let triangles = 0;
  for (const expected of asset.meshes) {
    const mesh = meshes.get(expected.node);
    assert.ok(mesh, `${expected.node} must stay a separate mesh`);
    const index = mesh.geometry.getIndex();
    assert.ok(index);
    assert.equal(index.count / 3, expected.triangles);
    // No decimation: the fronds keep their scanned silhouette.
    assert.equal(expected.triangles, expected.sourceTriangles);
    triangles += expected.triangles;
    const size = new Box3().setFromObject(mesh).getSize(new Vector3());
    size.toArray().forEach((value, axis) => {
      const source = expected.sourceSizeMeters[axis];
      assert.ok(
        Math.abs(value - source) <= source * 0.01,
        `${expected.node} axis ${axis}: ${value} m, source ${source} m`,
      );
    });
    // Physical scale: low ferns, not trees or grass blades.
    assert.ok(size.y > 0.15 && size.y < 0.6, `${expected.node} ${size.y} m`);
    const material = mesh.material as MeshStandardMaterial;
    assert.equal(material.alphaTest, 0.5);
    assert.equal(material.transparent, false);
    assert.equal(material.side, DoubleSide);
    assert.ok(material.map, `${expected.node} base color texture`);
  }
  assert.equal(triangles, asset.file.triangles);
});
