import assert from "node:assert/strict";
import { it } from "node:test";
import { fitView, orbitLimits } from "../../src/lib/room/camera.ts";
import {
  type ForestTree,
  forestTrees,
  forestUnderstory,
  mountainHeight,
  TREE_MODELS,
  TREE_SHAPE,
  treeBatches,
  treeHidesRoom,
  WALK_DISC as WALK,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import { VIEW_ZONE } from "../../src/lib/room/forest-view.ts";
import {
  PLOT,
  ROOM_BOUNDS,
  SCENE_BOUNDS,
} from "../../src/lib/room/house-layout.ts";

const [HX, HZ] = VIEW_ZONE.home;
const fromHome = ({ x, z }: { x: number; z: number }) =>
  Math.hypot(x - HX, z - HZ);
const TO_ROOM = Math.atan2(
  (ROOM_BOUNDS.min[0] + ROOM_BOUNDS.max[0]) / 2 - HX,
  (ROOM_BOUNDS.min[2] + ROOM_BOUNDS.max[2]) / 2 - HZ,
);
/** Ground bearing from home relative to the room, wrapped to -PI..PI. */
const viewBearing = ({ x, z }: { x: number; z: number }) => {
  const angle = Math.atan2(x - HX, z - HZ) - TO_ROOM;
  return angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
};
const outsidePlot = ({ x, z }: { x: number; z: number }, margin: number) =>
  x < PLOT.min[0] - margin ||
  x > PLOT.max[0] + margin ||
  z < PLOT.min[2] - margin ||
  z > PLOT.max[2] + margin;

it("packs a compact grouped forest with both real tree species and near/far detail without changing placement", () => {
  const trees = forestTrees();
  assert.deepEqual(trees, forestTrees());
  const saplings = forestUnderstory();
  assert.ok(trees.length >= 100, `${trees.length} trees`);
  assert.ok(
    trees.length + saplings.length <= 160,
    `${trees.length} trees and ${saplings.length} saplings share one budget`,
  );
  // On the near slopes and crests: no distant inventory behind the ridge.
  const outer = Math.max(...trees.map((tree) => Math.hypot(tree.x, tree.z)));
  assert.ok(outer <= 75, `forest edge at ${outer}`);
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
  assert.ok(Math.max(...bands.values()) <= trees.length * 0.25);
  // Most trees stand in a clump with close neighbours.
  const clumped = trees.filter(
    (a) =>
      trees.filter((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 9)
        .length >= 2,
  );
  assert.ok(clumped.length >= trees.length * 0.7);
  // Open glades: some 12° slope sectors between 25 and 65 units hold no
  // tree, outside the -x/+z approach quadrant.
  const step = (Math.PI * 2) / 30;
  const empty = Array.from(
    { length: 30 },
    (_, sector) =>
      Math.abs((sector + 0.5) * step - (Math.PI * 3) / 4) > Math.PI / 4 &&
      trees.every((tree) => {
        const r = Math.hypot(tree.x, tree.z);
        const angle =
          (Math.atan2(tree.z, tree.x) + Math.PI * 2) % (Math.PI * 2);
        return r < 25 || r > 65 || Math.floor(angle / step) !== sector;
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
    assert.ok(Math.hypot(tree.x, tree.z) <= 75);
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

it("plants overlapping near and midground groves all around the walk zone instead of distant inventory", () => {
  const trees = forestTrees();
  const close = trees.filter((tree) => fromHome(tree) < 40);
  assert.ok(
    close.length >= trees.length * 0.45,
    `${close.length} of ${trees.length} trees within 40 units of home`,
  );
  assert.ok(
    trees.filter((tree) => fromHome(tree) < 20).length >= 16,
    "a real near layer, not a few framing trunks",
  );
  // Overlapping depth layers instead of one row at the frame edge.
  for (const [low, high] of [
    [5, 15],
    [15, 25],
    [25, 40],
  ])
    assert.ok(
      close.filter((tree) => fromHome(tree) >= low && fromHome(tree) < high)
        .length >= 8,
      `depth layer ${low}-${high}`,
    );
  // Groves reach inside the old 26-unit ring and the old 8-unit yard margin
  // wherever the house, walk zone and room view allow.
  assert.ok(
    trees.filter((tree) => Math.hypot(tree.x, tree.z) < 26).length >= 12,
  );
  assert.ok(trees.filter((tree) => !outsidePlot(tree, 8)).length >= 10);
  // Every 45-degree sector around home outside the room corridor holds
  // trees within 25 units: the whole look-around is furnished.
  for (let sector = 1; sector < 8; sector++) {
    const center = sector * (Math.PI / 4);
    const inside = trees.filter((tree) => {
      const offset = Math.abs(
        ((viewBearing(tree) - center + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
      );
      return offset <= Math.PI / 8 && fromHome(tree) < 25;
    });
    assert.ok(inside.length >= 2, `sector ${sector}: ${inside.length} trees`);
  }
});

it("adds sparse sapling patches from the existing tree models inside the shared budget", () => {
  const trees = forestTrees();
  const saplings = forestUnderstory();
  assert.deepEqual(saplings, forestUnderstory());
  assert.ok(
    saplings.length >= 30 && saplings.length <= 60,
    `${saplings.length} saplings`,
  );
  assert.ok(trees.length + saplings.length <= 160, "one shared tree budget");
  for (const species of ["pine", "fir"])
    assert.ok(saplings.some((sapling) => sapling.species === species));
  for (const sapling of saplings) {
    assert.equal(sapling.lod, "far", "saplings reuse the far models");
    assert.ok(sapling.height >= 1 && sapling.height <= 4, `${sapling.height}`);
    assert.ok(Number.isFinite(sapling.x + sapling.z + sapling.yaw));
    const reach = sapling.height * TREE_SHAPE.canopy;
    assert.ok(outsidePlot(sapling, reach), "off the yard");
    assert.ok(
      Math.hypot(sapling.x - WALK.x, sapling.z - WALK.z) - reach >
        WALK.radius + 0.45,
      "outside the walk area with body clearance",
    );
    assert.ok(!treeHidesRoom(sapling), "below the room sight line");
    for (const tree of trees)
      assert.ok(
        Math.hypot(tree.x - sapling.x, tree.z - sapling.z) >
          tree.height * TREE_SHAPE.trunk + reach,
        "never inside a trunk",
      );
  }
  // Patches, not an even carpet.
  const grouped = saplings.filter((a) =>
    saplings.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 4),
  );
  assert.ok(grouped.length >= saplings.length * 0.8);
  assert.ok(
    saplings.filter((sapling) => fromHome(sapling) < 15).length >= 12,
    "low cover reaches the near view",
  );
  // The renderer's instancing batches draw every sapling with a far model.
  const all = [...trees, ...saplings];
  const batches = treeBatches(all);
  assert.deepEqual(
    batches.flat().sort((a, b) => a - b),
    all.map((_, i) => i),
  );
  for (const [model, indices] of batches.entries())
    for (const i of indices)
      if (i >= trees.length) assert.match(TREE_MODELS[model], /-far$/);
});

// Ground distance outside the actual safe footprint: the plot and the walk
// disc with the camera body.
const BODY = 0.45;
const outsideSafe = (x: number, z: number) =>
  Math.min(
    Math.hypot(
      Math.max(PLOT.min[0] - x, 0, x - PLOT.max[0]),
      Math.max(PLOT.min[2] - z, 0, z - PLOT.max[2]),
    ),
    Math.max(0, Math.hypot(x - WALK.x, z - WALK.z) - WALK.radius - BODY),
  );

it("raises irregular foothills just beyond the flat house and walk footprint", () => {
  // Flat under the whole plot, the walk disc and the path between them.
  for (let x = PLOT.min[0]; x <= PLOT.max[0]; x += 0.5)
    for (let z = PLOT.min[2]; z <= PLOT.max[2]; z += 0.5)
      assert.equal(mountainHeight(x, z), 0);
  for (let t = 0; t <= 1; t += 0.05) {
    const x = WALK.x + (PLOT.min[0] - WALK.x) * t;
    const z = WALK.z + (PLOT.max[2] - WALK.z) * t;
    for (let a = 0; a < 16; a++) {
      const r = (WALK.radius + BODY) * (t === 0 ? 1 : 0.5);
      const angle = (a / 16) * Math.PI * 2;
      assert.equal(
        mountainHeight(x + Math.cos(angle) * r, z + Math.sin(angle) * r),
        0,
      );
    }
  }
  const crests: { radius: number; height: number }[] = [];
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const [dx, dz] = [Math.cos(angle), Math.sin(angle)];
    // A flat apron of breathing room, then the foothills rise within
    // about a dozen units of the footprint.
    let edge = 0;
    while (outsideSafe(dx * edge, dz * edge) < 4) edge += 0.1;
    assert.equal(mountainHeight(dx * edge, dz * edge), 0, `apron ${i}`);
    while (outsideSafe(dx * edge, dz * edge) < 13) edge += 0.1;
    const foot = mountainHeight(dx * edge, dz * edge);
    assert.ok(foot > 0.8, `bearing ${i}: ${foot.toFixed(2)} at 13 units`);
    let crest = { radius: 0, height: 0 };
    let previous = foot;
    for (let r = edge; r <= 65; r += 0.25) {
      const height = mountainHeight(dx * r, dz * r);
      // Steep rocky slopes, never vertical walls.
      assert.ok(Math.abs(height - previous) / 0.25 < 1.8, `slope at ${r}`);
      previous = height;
      if (height > crest.height) crest = { radius: r, height };
    }
    crests.push(crest);
  }
  // Slopes rise well above the eye within 65 units of the house.
  for (const crest of crests) assert.ok(crest.height >= 10, `${crest.height}`);
  // An irregular ridgeline, not a uniform doughnut.
  const heights = crests.map((crest) => crest.height);
  assert.ok(Math.max(...heights) - Math.min(...heights) >= 10);
  let bumps = 0;
  for (let i = 0; i < 72; i++) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) => heights[j % 72]);
    if (b > a && b > c) bumps++;
  }
  assert.ok(bumps >= 6, `${bumps} ridge peaks`);
});

it("shows slopes rising above the eye in every direction from the walk zone", () => {
  const eye = VIEW_ZONE.eyeY;
  const elevations = Array.from({ length: 32 }, (_, i) => {
    const angle = (i / 32) * Math.PI * 2;
    let best = -Infinity;
    for (let d = 2; d <= 150; d += 0.5) {
      const x = HX + Math.cos(angle) * d;
      const z = HZ + Math.sin(angle) * d;
      best = Math.max(
        best,
        Math.atan2(WORLD.groundY + mountainHeight(x, z) - eye, d),
      );
    }
    return best;
  });
  const sorted = [...elevations].sort((a, b) => a - b);
  // Background slopes fill the lower sky, not a far thin band...
  assert.ok(sorted[0] > 0.15, `lowest horizon ${sorted[0]}`);
  assert.ok(sorted[16] > 0.3, `median horizon ${sorted[16]}`);
  // ...without walling the clearing in (about 35 degrees at most).
  assert.ok(sorted[31] < 0.6, `highest horizon ${sorted[31]}`);
});

it("keeps height-dependent trunk clearance from the walking body", () => {
  const all: ForestTree[] = [...forestTrees(), ...forestUnderstory()];
  for (const tree of all)
    assert.ok(
      Math.hypot(tree.x - WALK.x, tree.z - WALK.z) -
        tree.height * TREE_SHAPE.trunk >
        WALK.radius + 0.45 + 0.5,
      `trunk at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`,
    );
});
