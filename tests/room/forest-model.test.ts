import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { Box3, Group, Matrix4, Mesh, Texture } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { treeFrame } from "../../src/lib/room/forest-model.ts";

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
