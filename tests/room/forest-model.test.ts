import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  Box3,
  type BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { treeFrame } from "../../src/lib/room/forest-model.ts";

// Occupied 128² vertex-projection cells in the original selected twig meshes.
// Recorded from verified source geometry, not from an older reduced model.
const SOURCE_CANOPY = {
  pine: [0.495, 0.541, 0.442],
  fir: [0.345, 0.433, 0.379],
};
function canopyCoverage(position: BufferAttribute, vertices: number[]) {
  const points = vertices.map((i) => [
    position.getX(i),
    position.getY(i),
    position.getZ(i),
  ]);
  const low = [0, 1, 2].map((axis) =>
    points.reduce((value, p) => Math.min(value, p[axis]), Infinity),
  );
  const high = [0, 1, 2].map((axis) =>
    points.reduce((value, p) => Math.max(value, p[axis]), -Infinity),
  );
  return [
    [0, 1],
    [0, 2],
    [1, 2],
  ].map(([a, b]) => {
    const cells = new Set(
      points.map((p) => {
        const cell = (axis: number) =>
          Math.min(
            127,
            Math.floor(
              ((p[axis] - low[axis]) / (high[axis] - low[axis])) * 128,
            ),
          );
        return cell(a) + cell(b) * 128;
      }),
    );
    return cells.size / 16384;
  });
}

it("preserves a populated canopy in both species and both LODs instead of bare trunks", async () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({
    name: "EXT_texture_webp",
    loadTexture: async () => new Texture(),
  }));
  const failures: string[] = [];
  for (const species of ["pine", "fir"] as const)
    for (const lod of ["near", "far"]) {
      const name = `${species}-${lod}`;
      const bytes = readFileSync(
        new URL(`../../public/models/forest/${name}.glb`, import.meta.url),
      );
      const gltf = await loader.parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        "",
      );
      let found = false;
      gltf.scene.traverse((object) => {
        if (
          !(object instanceof Mesh) ||
          Array.isArray(object.material) ||
          !object.material.name.includes("twig")
        )
          return;
        found = true;
        const index = object.geometry.getIndex();
        assert.ok(index);
        const coverage = canopyCoverage(
          object.geometry.getAttribute("position") as BufferAttribute,
          [...new Set(index.array)],
        );
        coverage.forEach((value, axis) => {
          if (value < SOURCE_CANOPY[species][axis] * 0.7)
            failures.push(
              `${name} projection ${axis}: ${(value * 100).toFixed(1)}% canopy occupancy, expected at least ${(SOURCE_CANOPY[species][axis] * 70).toFixed(1)}%`,
            );
        });
      });
      assert.ok(found, `${name}: foliage primitive must exist`);
    }
  assert.deepEqual(failures, []);
});

it("decodes all four real tree geometries and frames their quantized meshes upright without changing vertices", async () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Public loader plugin: geometry-only check, not browser image/GPU proof.
  loader.register(() => ({
    name: "EXT_texture_webp",
    loadTexture: async () => new Texture(),
  }));
  for (const name of ["pine-near", "pine-far", "fir-near", "fir-far"]) {
    const bytes = readFileSync(
      new URL(`../../public/models/forest/${name}.glb`, import.meta.url),
    );
    const gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    const frame = treeFrame(gltf.scene);
    const group = new Group();
    const saved: { mesh: Mesh; values: number[] }[] = [];
    gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      saved.push({
        mesh: object,
        values: Array.from(object.geometry.getAttribute("position").array),
      });
      const part = new Mesh(object.geometry);
      part.matrixAutoUpdate = false;
      part.matrix.copy(
        new Matrix4().multiplyMatrices(frame, object.matrixWorld),
      );
      part.matrixWorldNeedsUpdate = true;
      group.add(part);
    });
    const box = new Box3().setFromObject(group);
    assert.ok(
      Math.abs(box.min.y) < 0.0001,
      `${name}: grounded (minY=${box.min.y}, maxY=${box.max.y})`,
    );
    assert.ok(Math.abs(box.max.y - 1) < 0.0001, `${name}: unit height`);
    assert.ok(Math.abs(box.max.x + box.min.x) < 0.0001);
    assert.ok(Math.abs(box.max.z + box.min.z) < 0.0001);
    for (const { mesh, values } of saved)
      assert.deepEqual(
        Array.from(mesh.geometry.getAttribute("position").array),
        values,
      );
  }
});
