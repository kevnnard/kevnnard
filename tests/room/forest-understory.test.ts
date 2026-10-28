import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import {
  debrisFootprint,
  forestDebris,
} from "../../src/lib/room/forest-debris.ts";
import { lowFogFactor } from "../../src/lib/room/forest-fog.ts";
import {
  forestTrees,
  forestUnderstory,
  safeDistance,
  TREE_SHAPE,
  terrainHeight,
  WALK_DISC,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import {
  FERN_MODELS,
  type Fern,
  fernFootprint,
  fernHeight,
  forestFerns,
} from "../../src/lib/room/forest-understory.ts";
import { hidesRoom, VIEW_ZONE } from "../../src/lib/room/forest-view.ts";
import { PLOT } from "../../src/lib/room/house-layout.ts";

const manifest = JSON.parse(
  readFileSync(
    new URL(
      "../../public/models/forest-understory/manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  assets: {
    meshes: { node: string; triangles: number; sourceSizeMeters: number[] }[];
  }[];
};
const MESHES = manifest.assets[0].meshes;
/** Camera body radius around the walk disc (`WALK.bodyRadius`). */
const BODY = 0.45;
const TREES = forestTrees();
const SAPLINGS = forestUnderstory(TREES);
const DEBRIS = forestDebris(TREES);
const FERNS = forestFerns();
const HOME = VIEW_ZONE.home;
const ground = (x: number, z: number) => WORLD.groundY + terrainHeight(x, z);

it("matches the fern models to the shipped clumps", () => {
  assert.deepEqual(
    FERN_MODELS.map((model) => model.node),
    MESHES.map((mesh) => mesh.node),
  );
  FERN_MODELS.forEach((model, i) => {
    assert.deepEqual(model.size, MESHES[i].sourceSizeMeters);
    assert.equal(model.triangles, MESHES[i].triangles);
  });
});

it("scatters a seeded, bounded set of varied fern clumps", () => {
  assert.deepEqual(FERNS, forestFerns());
  assert.ok(
    FERNS.length >= 80 && FERNS.length <= 180,
    `${FERNS.length} clumps`,
  );
  const variants = new Set(FERNS.map((fern) => fern.variant));
  assert.equal(variants.size, FERN_MODELS.length);
  const heights = FERNS.map(fernHeight);
  for (const fern of FERNS) {
    assert.ok(Number.isFinite(fern.x + fern.y + fern.z + fern.yaw));
    assert.ok(fern.scale >= 0.9 && fern.scale <= 3, `scale ${fern.scale}`);
    assert.ok(fern.burial >= 0.03 && fern.burial <= 0.15);
  }
  // Natural low plants: knee to waist height, with real variety.
  assert.ok(Math.min(...heights) >= 0.2 && Math.max(...heights) <= 1.25);
  assert.ok(heights.filter((h) => h < 0.5).length >= FERNS.length * 0.15);
  assert.ok(heights.filter((h) => h > 0.8).length >= FERNS.length * 0.15);
});

it("roots every clump on the rendered terrain, slightly buried, on safe grades", () => {
  for (const fern of FERNS) {
    const reach = fernFootprint(fern);
    const height = fernHeight(fern);
    // The root sits at the lowest rendered ground around the crown base.
    const root = Math.min(
      ground(fern.x, fern.z),
      ...Array.from({ length: 8 }, (_, i) =>
        ground(
          fern.x + Math.cos((i / 8) * Math.PI * 2) * reach * 0.2,
          fern.z + Math.sin((i / 8) * Math.PI * 2) * reach * 0.2,
        ),
      ),
    );
    assert.ok(Math.abs(fern.y - root) < 1e-9, "rooted on the terrain mesh");
    // Safe grades only: no cliffs, and the base plane leans with the bank
    // (downhill side lower) but by less than the slope, fronds near upright.
    const grade = [
      (ground(fern.x + reach, fern.z) - ground(fern.x - reach, fern.z)) /
        (2 * reach),
      (ground(fern.x, fern.z + reach) - ground(fern.x, fern.z - reach)) /
        (2 * reach),
    ];
    assert.ok(Math.hypot(...grade) <= 0.6, "local grade too steep");
    assert.ok(Math.hypot(...fern.tilt) <= Math.hypot(...grade) + 1e-9);
    assert.ok(fern.tilt[0] * grade[0] + fern.tilt[1] * grade[1] >= 0);
    assert.ok(Math.atan(Math.hypot(...fern.tilt)) <= (23 * Math.PI) / 180);
    // The terrain never swallows or drops away from much of the clump.
    for (let i = 0; i < 24; i++)
      for (const r of [reach / 2, reach]) {
        const dx = Math.cos((i / 24) * Math.PI * 2) * r;
        const dz = Math.sin((i / 24) * Math.PI * 2) * r;
        const plane = fern.y + fern.tilt[0] * dx + fern.tilt[1] * dz;
        assert.ok(
          Math.abs(ground(fern.x + dx, fern.z + dz) - plane) <= height * 0.45,
          "terrain gap under the clump",
        );
      }
  }
});

it("keeps every whole clump off the walk area, house, path, room view and trunks", () => {
  for (const fern of FERNS) {
    const reach = fernFootprint(fern);
    const top = fern.y + fernHeight(fern) * (1 - fern.burial);
    assert.ok(
      Math.hypot(fern.x - WALK_DISC.x, fern.z - WALK_DISC.z) - reach >
        WALK_DISC.radius + BODY,
      "the whole footprint stays outside the walk disc and camera body",
    );
    assert.ok(
      fern.x + reach < PLOT.min[0] ||
        fern.x - reach > PLOT.max[0] ||
        fern.z + reach < PLOT.min[2] ||
        fern.z - reach > PLOT.max[2],
      "off the physical yard",
    );
    // Safe footprint: plot, walk disc with body, and the path between them.
    assert.ok(safeDistance(fern.x, fern.z) > reach);
    assert.ok(!hidesRoom(fern.x, fern.z, reach, top));
    for (const tree of [...TREES, ...SAPLINGS])
      assert.ok(
        Math.hypot(tree.x - fern.x, tree.z - fern.z) >
          tree.height * TREE_SHAPE.trunk + reach,
        "never inside a trunk",
      );
    for (const piece of DEBRIS)
      assert.ok(
        Math.hypot(piece.x - fern.x, piece.z - fern.z) >
          debrisFootprint(piece) + reach * 0.5,
        "never through a rock, stump or log",
      );
  }
});

const near = (fern: Fern) =>
  TREES.some(
    (tree) =>
      Math.hypot(tree.x - fern.x, tree.z - fern.z) -
        tree.height * TREE_SHAPE.trunk <
      4.5,
  ) ||
  DEBRIS.some(
    (piece) =>
      Math.hypot(piece.x - fern.x, piece.z - fern.z) - debrisFootprint(piece) <
      3,
  );

it("gathers ferns in patches around trunk bases and rocks in the visible foreground", () => {
  assert.ok(
    FERNS.filter(near).length >= FERNS.length * 0.85,
    `${FERNS.filter(near).length}/${FERNS.length} at trees or rocks`,
  );
  // Many trees get a patch, not one carpet; patches cluster, not a grid.
  const anchored = TREES.filter((tree) =>
    FERNS.some(
      (fern) =>
        Math.hypot(tree.x - fern.x, tree.z - fern.z) -
          tree.height * TREE_SHAPE.trunk <
        4.5,
    ),
  );
  assert.ok(anchored.length >= 20, `${anchored.length} trees with ferns`);
  const clumped = FERNS.filter((a) =>
    FERNS.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 2.5),
  );
  assert.ok(clumped.length >= FERNS.length * 0.85);
  // Not every nearby trunk is ringed: gaps keep the floor irregular.
  const visibleTrees = TREES.filter(
    (tree) => Math.hypot(tree.x - HOME[0], tree.z - HOME[1]) <= 40,
  );
  assert.ok(anchored.length < visibleTrees.length);
  // Near and midground all round the view, never out at the world edge.
  const bearings = new Set(
    FERNS.map((fern) =>
      Math.floor(
        ((Math.atan2(fern.z - HOME[1], fern.x - HOME[0]) + Math.PI) /
          (Math.PI * 2)) *
          16,
      ),
    ),
  );
  assert.ok(bearings.size >= 8, `${bearings.size} bearings`);
  const camera = { x: HOME[0], y: VIEW_ZONE.eyeY, z: HOME[1] };
  for (const fern of FERNS) {
    assert.ok(Math.hypot(fern.x - HOME[0], fern.z - HOME[1]) <= 45);
    assert.ok(lowFogFactor({ x: fern.x, y: fern.y, z: fern.z }, camera) < 0.35);
  }
  assert.ok(
    FERNS.filter((fern) => Math.hypot(fern.x - HOME[0], fern.z - HOME[1]) < 20)
      .length >= 20,
    "a lush foreground, not only distant patches",
  );
});

it("stays within the triangle and draw budgets", () => {
  const triangles = FERNS.reduce(
    (sum, fern) => sum + MESHES[fern.variant].triangles,
    0,
  );
  assert.ok(triangles <= 250_000, `${triangles} fern triangles`);
  // One instanced batch per clump model.
  assert.ok(new Set(FERNS.map((fern) => fern.variant)).size <= 4);
});
