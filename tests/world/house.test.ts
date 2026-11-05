import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flowerLayout } from "../../src/lib/world/flowers.ts";
import * as houseModule from "../../src/lib/world/house.ts";
import {
  HOUSE,
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
    assert.ok(windows.length >= 4, "windows on several sides");
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

  it("closes each gable with one sloped panel: no plank or corner above the roof slope", () => {
    const gables = WALLS.filter((wall) => wall.gable);
    assert.ok(gables.length >= 3, "gable walls");
    const meshes = houseMeshes();
    for (const wall of gables) {
      const { center, half, rise } = wall.gable ?? {
        center: 0,
        half: 1,
        rise: 0,
      };
      const slope = (u: number) =>
        wall.height + rise * (1 - Math.abs(u - center) / half);
      // Planks stop at the eave: no stair-stepped rows inside the gable.
      for (const p of planks(wall))
        assert.ok(p.v1 <= wall.height + EPS, `${wall.id}: plank above eave`);
      const panel = houseModule.gablePanel?.(wall);
      assert.ok(panel, `${wall.id}: gable panel`);
      for (const [u, v] of panel) {
        assert.ok(u >= wall.from - EPS && u <= wall.to + EPS, wall.id);
        assert.ok(
          v >= wall.height - EPS && v <= slope(u) + EPS,
          `${wall.id}: above slope`,
        );
      }
      // Its top edges run on the slope: the corners at both ends and the apex.
      const top = panel.filter(([, v]) => v > wall.height + EPS);
      assert.ok(
        top.some(
          ([u, v]) =>
            Math.abs(u - center) < EPS &&
            Math.abs(v - wall.height - rise) < EPS,
        ),
      );
      for (const [u, v] of top)
        assert.ok(Math.abs(v - slope(u)) < EPS, wall.id);
      assert.ok(
        meshes[wall.group].wood.some((part) => part.shape === "prism"),
        `${wall.id}: panel rendered`,
      );
    }
  });

  it("keeps every other main-room window, from right of the door leftward", () => {
    const windows = (id: string) =>
      WALLS.find((wall) => wall.id === id)
        ?.openings.filter((opening) => opening.kind === "window")
        .map((opening) => [opening.u0, opening.u1]);
    assert.deepEqual(windows("main-front"), [[1.25, 2]]);
    assert.deepEqual(windows("main-right"), [[-0.6, 0.2]]);
    assert.deepEqual(windows("main-back"), [[0.9, 1.7]]);
    assert.deepEqual(windows("main-left"), []);
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

  it("gives every wall, with its trim and glass, its own cutaway group", () => {
    const meshes = houseMeshes();
    const groups = new Set(WALLS.map((wall) => wall.group));
    assert.equal(groups.size, WALLS.length, "one group per wall");
    for (const wall of WALLS) {
      const parts = [...meshes[wall.group].wood, ...meshes[wall.group].glass];
      assert.ok(parts.length > 0, wall.id);
      const normal = wall.axis === "x" ? 2 : 0;
      for (const part of parts)
        assert.ok(
          Math.abs(part.center[normal] - wall.at) < 0.2,
          `${wall.id} part off its wall`,
        );
    }
  });

  it("keeps both roofs apart and the base free of walls and roofs", () => {
    const meshes = houseMeshes();
    for (const [group, volume] of [
      ["main-roof", HOUSE.main],
      ["garage-roof", HOUSE.garage],
    ] as const) {
      assert.ok(meshes[group].wood.length > 0, group);
      for (const part of meshes[group].wood)
        assert.ok(part.center[1] > HOUSE.floorY + volume.height - 0.3, group);
    }
    assert.equal(meshes.base.glass.length, 0);
    for (const part of meshes.base.wood)
      assert.ok(part.center[1] < HOUSE.floorY + HOUSE.main.height, "base low");
    assert.ok(!WALLS.some((wall) => wall.group === "base"));
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
