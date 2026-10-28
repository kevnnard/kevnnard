import assert from "node:assert/strict";
import { it } from "node:test";
import { fitView, orbitLimits } from "../../src/lib/room/camera.ts";
import {
  forestTrees,
  mountainHeight,
  treeHidesRoom,
  WALK_DISC as WALK,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import { PLOT, SCENE_BOUNDS } from "../../src/lib/room/house-layout.ts";

it("packs a compact grouped forest with both real tree species and near/far detail without changing placement", () => {
  const trees = forestTrees();
  assert.deepEqual(trees, forestTrees());
  assert.ok(
    trees.length >= 120 && trees.length <= 160,
    `compact forest instead of distant rings: ${trees.length} trees`,
  );
  const radii = trees.map((tree) => Math.hypot(tree.x, tree.z));
  const outer = Math.max(...radii);
  assert.ok(outer >= 90 && outer <= 110, `forest edge at ${outer}`);
  assert.ok(
    trees.filter((tree) => tree.lod === "near").length <= 12,
    "keep the expensive close-tree population bounded",
  );
  for (const [i, a] of trees.entries())
    for (const b of trees.slice(i + 1))
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 3, "trees never overlap");
  for (const tree of trees)
    assert.ok(
      Math.hypot(tree.x - WALK.x, tree.z - WALK.z) > WALK.radius + 1,
      "trunks stay outside the walk area",
    );
});

it("groups trees in irregular stands and glades rather than visible rings", () => {
  const trees = forestTrees();
  // No 5-unit radial band may dominate, as a ring would.
  const bands = new Map<number, number>();
  for (const tree of trees) {
    const band = Math.floor(Math.hypot(tree.x, tree.z) / 5);
    bands.set(band, (bands.get(band) ?? 0) + 1);
  }
  assert.ok(Math.max(...bands.values()) <= trees.length * 0.16);
  // Most trees stand in a clump with close neighbours.
  const clumped = trees.filter(
    (a) =>
      trees.filter((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 9)
        .length >= 2,
  );
  assert.ok(clumped.length >= trees.length * 0.7);
  // Open glades: some 12° sectors between 40 and 90 units hold no tree,
  // outside the -x/+z approach quadrant that is kept clear anyway.
  const step = (Math.PI * 2) / 30;
  const empty = Array.from(
    { length: 30 },
    (_, sector) =>
      Math.abs((sector + 0.5) * step - (Math.PI * 3) / 4) > Math.PI / 4 &&
      trees.every((tree) => {
        const r = Math.hypot(tree.x, tree.z);
        const angle =
          (Math.atan2(tree.z, tree.x) + Math.PI * 2) % (Math.PI * 2);
        return r < 40 || r > 90 || Math.floor(angle / step) !== sector;
      }),
  ).filter(Boolean).length;
  assert.ok(empty >= 3, `${empty} open sectors`);
});

it("keeps both species and LODs, the plot and the room view clear", () => {
  const trees = forestTrees();
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
    assert.ok(Math.hypot(tree.x, tree.z) <= 110);
    // Trunks stand off the yard; only canopies may overhang its edge.
    const trunk = tree.height * 0.05 + 0.3;
    assert.ok(
      tree.x < PLOT.min[0] - trunk ||
        tree.x > PLOT.max[0] + trunk ||
        tree.z < PLOT.min[2] - trunk ||
        tree.z > PLOT.max[2] + trunk,
    );
    // Only the actual sight corridor to the room is kept clear.
    assert.ok(!treeHidesRoom(tree));
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
