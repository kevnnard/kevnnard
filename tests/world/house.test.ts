import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flowerLayout } from "../../src/lib/world/flowers.ts";
import {
  HOUSE_FOOTPRINT,
  HOUSE_GROUPS,
  houseMeshes,
  WALLS,
  type Wall,
  wallPlanks,
} from "../../src/lib/world/house.ts";
import { ISLAND, onPad } from "../../src/lib/world/island.ts";
import { islandLayout } from "../../src/lib/world/layout.ts";
import { seededRandom } from "../../src/lib/world/random.ts";

const EPS = 1e-6;
const planks = (wall: Wall) => wallPlanks(wall, seededRandom(1));

describe("stylized wooden house (T4a, S6)", () => {
  it("cuts real window and door openings: no plank covers a hole", () => {
    const windows = WALLS.flatMap((wall) =>
      wall.openings.filter((opening) => opening.kind === "window"),
    );
    assert.ok(windows.length >= 6, "windows on several sides");
    for (const wall of WALLS)
      for (const opening of wall.openings)
        for (const plank of planks(wall))
          assert.ok(
            plank.u1 <= opening.u0 + EPS ||
              plank.u0 >= opening.u1 - EPS ||
              plank.v1 <= opening.v0 + EPS ||
              plank.v0 >= opening.v1 - EPS,
            `${wall.id}: plank over ${opening.kind}`,
          );
  });

  it("builds walls around the holes: planks fill everything else", () => {
    for (const wall of WALLS.filter((item) => !item.gable)) {
      const area = planks(wall).reduce(
        (sum, p) => sum + (p.u1 - p.u0) * (p.v1 - p.v0),
        0,
      );
      const holes = wall.openings.reduce(
        (sum, o) => sum + (o.u1 - o.u0) * (o.v1 - o.v0),
        0,
      );
      const expected = (wall.to - wall.from) * wall.height - holes;
      assert.ok(Math.abs(area - expected) < 1e-6, `${wall.id} closed`);
    }
  });

  it("glazes every window with a pane kept apart from the opaque wood", () => {
    const meshes = houseMeshes();
    for (const group of HOUSE_GROUPS) {
      const walls = WALLS.filter((wall) => wall.group === group);
      const windows = walls.flatMap((wall) =>
        wall.openings.filter((opening) => opening.kind === "window"),
      );
      assert.equal(meshes[group].glass.length, windows.length, group);
    }
  });

  it("keeps the two camera-facing walls separate for a later cutaway", () => {
    const meshes = houseMeshes();
    for (const group of ["wallFront", "wallRight"] as const) {
      assert.ok(meshes[group].wood.length > 0, group);
      assert.ok(
        WALLS.some((wall) => wall.group === group && wall.openings.length > 0),
      );
    }
  });

  it("fits the house, garage, roof overhang and driveway on the pad", () => {
    for (const rect of HOUSE_FOOTPRINT)
      for (const [x, z] of [
        [rect.x0, rect.z0],
        [rect.x0, rect.z1],
        [rect.x1, rect.z0],
        [rect.x1, rect.z1],
      ])
        assert.ok(onPad(x, z), `${rect.id} corner ${x},${z}`);
    const area = HOUSE_FOOTPRINT.filter((rect) => rect.id !== "driveway")
      .map((rect) => (rect.x1 - rect.x0) * (rect.z1 - rect.z0))
      .reduce((a, b) => a + b, 0);
    assert.ok(area > 0.6 * 5.8 * 5, "spacious: most of the pad");
  });

  it("keeps trees, rocks, tufts and flowers clear of the footprint", () => {
    const layout = islandLayout(ISLAND.seed);
    const items = [
      ...layout.map((item) => item.position),
      ...flowerLayout(layout, ISLAND.seed).map((item) => item.position),
    ];
    for (const [x, , z] of items)
      for (const rect of HOUSE_FOOTPRINT)
        assert.ok(
          x < rect.x0 - 0.2 ||
            x > rect.x1 + 0.2 ||
            z < rect.z0 - 0.2 ||
            z > rect.z1 + 0.2,
          `${x},${z} inside ${rect.id}`,
        );
  });

  it("stays within a small geometry budget", () => {
    const meshes = houseMeshes();
    const parts = HOUSE_GROUPS.flatMap((group) => [
      ...meshes[group].wood,
      ...meshes[group].glass,
    ]);
    assert.ok(parts.length < 1500, `${parts.length} parts`);
  });
});
