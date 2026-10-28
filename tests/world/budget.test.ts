import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOWER_TRIANGLES, flowerLayout } from "../../src/lib/world/flowers.ts";
import { ISLAND, undersideMesh } from "../../src/lib/world/island.ts";
import { islandLayout, KIND_SPECS } from "../../src/lib/world/layout.ts";
import {
  BUDGET,
  MODEL_FILES,
  SCENE_DRAWS,
} from "../../src/lib/world/models.ts";
import { glbInfo, shippedModels } from "./glb.ts";

describe("world budgets", () => {
  it("ships meshopt-compressed, self-contained GLBs with webp textures", () => {
    for (const file of shippedModels()) {
      const info = glbInfo(file);
      assert.ok(info.extensions.includes("EXT_meshopt_compression"), file);
      for (const extension of info.extensions)
        assert.ok(
          [
            "EXT_meshopt_compression",
            "KHR_mesh_quantization",
            "EXT_texture_webp",
            "KHR_texture_transform",
          ].includes(extension),
          `${file} uses ${extension}`,
        );
    }
  });

  it("stays inside the triangle, draw-call and byte budgets", (t) => {
    const layout = islandLayout(ISLAND.seed);
    const used = new Set(layout.map((item) => item.kind));
    const flowers = flowerLayout(layout, ISLAND.seed).length;
    let triangles =
      undersideMesh(ISLAND.seed).indices.length / 3 +
      flowers * FLOWER_TRIANGLES;
    let draws = SCENE_DRAWS;
    let bytes = 0;
    for (const [kind, url] of Object.entries(MODEL_FILES)) {
      const info = glbInfo(url.replace("/world/", ""));
      bytes += info.bytes;
      const instances = layout.filter((item) => item.kind === kind).length;
      assert.ok(used.has(kind as keyof typeof KIND_SPECS), `${kind} unused`);
      triangles += info.triangles * instances;
      // One instanced draw per primitive, whatever the instance count.
      draws += info.primitives;
    }
    t.diagnostic(
      `triangles ${triangles}/${BUDGET.triangles}, draws ${draws}/${BUDGET.draws}, model bytes ${bytes}/${BUDGET.bytes}, instances ${layout.length}, flowers ${flowers}`,
    );
    assert.ok(triangles <= BUDGET.triangles, `triangles ${triangles}`);
    assert.ok(draws <= BUDGET.draws, `draws ${draws}`);
    assert.ok(bytes <= BUDGET.bytes, `bytes ${bytes}`);
  });
});
