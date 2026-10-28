import assert from "node:assert/strict";
import { it } from "node:test";
import { fitView, orbitLimits } from "../../src/lib/room/camera.ts";
import {
  forestTrees,
  mountainHeight,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import { PLOT, SCENE_BOUNDS } from "../../src/lib/room/house-layout.ts";

it("fills a bounded forest with both real tree species and near/far detail without changing placement", () => {
  const trees = forestTrees();
  assert.deepEqual(trees, forestTrees());
  assert.ok(
    trees.length >= 600 && trees.length <= 660,
    "fill the middle and distant forest without unbounded growth",
  );
  assert.ok(
    trees.filter((tree) => tree.lod === "near").length <= 12,
    "keep the expensive close-tree population bounded",
  );
  for (const species of ["pine", "fir"]) {
    assert.ok(
      trees.some((tree) => tree.species === species && tree.lod === "near"),
    );
    assert.ok(
      trees.some((tree) => tree.species === species && tree.lod === "far"),
    );
  }
  for (const tree of trees) {
    assert.ok(Number.isFinite(tree.x + tree.z + tree.height + tree.yaw));
    assert.ok(tree.height >= 11 && tree.height <= 20);
    assert.ok(
      Math.hypot(tree.x, tree.z) > 25 && Math.hypot(tree.x, tree.z) < 230,
    );
    assert.ok(
      tree.x < PLOT.min[0] - 8 ||
        tree.x > PLOT.max[0] + 8 ||
        tree.z < PLOT.min[2] - 8 ||
        tree.z > PLOT.max[2] + 8,
    );
    // Leave the initial camera's open -x/+z approach clear near the house.
    assert.ok(!(tree.x < -5 && tree.z > 5 && Math.hypot(tree.x, tree.z) < 75));
  }
});

it("keeps the home clearing flat and surrounds it with actual mountain geometry", () => {
  assert.equal(mountainHeight(0, 0), 0);
  assert.equal(mountainHeight(10, 10), 0);
  const heights = Array.from({ length: 64 }, (_, i) => {
    const angle = (i / 64) * Math.PI * 2;
    return mountainHeight(Math.cos(angle) * 240, Math.sin(angle) * 240);
  });
  assert.ok(Math.max(...heights) > 45);
  assert.ok(Math.min(...heights) > 5);
  assert.equal(mountainHeight(450, 0), 0);
  assert.ok(heights.every((height) => Number.isFinite(height) && height < 100));
});

it("places distant fog before the lens cutoff and extends ground beyond reachable views", () => {
  assert.ok(WORLD.fogStart >= 80);
  assert.ok(WORLD.fogEnd > WORLD.fogStart + 100);
  assert.ok(WORLD.far > WORLD.fogEnd + 100);
  const overview = fitView(SCENE_BOUNDS, 45, 9 / 19);
  const limits = orbitLimits({
    overview,
    scene: SCENE_BOUNDS,
    boundary: { min: [-6, 0.5, -2.8], max: [3.3, 3, 5.5] },
    groundY: WORLD.groundY,
  });
  const reach = limits.maxDistance + 10;
  assert.ok(WORLD.size / 2 > WORLD.far + reach);
  // Distant scenery must not shrink the house overview or enlarge target bounds.
  assert.ok(limits.maxDistance < 150);
  assert.ok(limits.boundary.max[0] < 4);
});
