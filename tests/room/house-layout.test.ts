import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Box,
  BUSHES,
  ENTRANCE,
  HEDGES,
  HOUSE_BOUNDS,
  LEVELS,
  PARKING,
  PARTS,
  PLOT,
  ROOF,
  ROOM_BOUNDS,
  SCENE_BOUNDS,
  shadowFrustum,
  TREES,
} from "../../src/lib/room/house-layout.ts";

type Rect = { min: readonly number[]; max: readonly number[] };

// Footprints are compared on the ground plane: x and z.
const flat = (box: Box): Rect => ({
  min: [box.min[0], box.min[2]],
  max: [box.max[0], box.max[2]],
});
const overlaps = (a: Rect, b: Rect) =>
  a.min.every((v, i) => v < b.max[i] && b.min[i] < a.max[i]);
const touches = (a: Rect, b: Rect) =>
  a.min.every((v, i) => v <= b.max[i] + 1e-9 && b.min[i] <= a.max[i] + 1e-9);
const inside = (inner: Rect, outer: Rect) =>
  inner.min.every((v, i) => v >= outer.min[i] - 1e-9) &&
  inner.max.every((v, i) => v <= outer.max[i] + 1e-9);
const circle = (x: number, z: number, r: number): Rect => ({
  min: [x - r, z - r],
  max: [x + r, z + r],
});
const corners = (box: Box) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((bits) =>
    [0, 1, 2].map((i) => ((bits >> i) & 1 ? box.max[i] : box.min[i])),
  );

const plotRect = flat(PLOT);
const roomRect = flat(ROOM_BOUNDS);
const roofRect: Rect = {
  min: [ROOF.x[0], ROOF.z[0]],
  max: [ROOF.x[1], ROOF.z[1]],
};
const paving = PARTS.filter((part) => part.role === "paving");
const partById = (id: string) => {
  const part = PARTS.find((candidate) => candidate.id === id);
  assert.ok(part, `missing part ${id}`);
  return part;
};

describe("plot", () => {
  it("is a finite, thick slab whose top sits below the original room floor", () => {
    for (const v of [...PLOT.min, ...PLOT.max]) assert.ok(Number.isFinite(v));
    assert.ok(PLOT.max[1] - PLOT.min[1] >= 0.5, "terrain should read as thick");
    assert.ok(PLOT.max[1] < ROOM_BOUNDS.min[1]);
    assert.equal(PLOT.max[1], LEVELS.terrainTop);
  });

  it("keeps every horizontal surface level distinct to avoid z-fighting", () => {
    const levels = [
      LEVELS.roomFloor,
      LEVELS.foundationTop,
      LEVELS.pavingTop,
      LEVELS.terrainTop,
    ];
    assert.equal(new Set(levels).size, levels.length);
    // Descending: room floor, then foundation, then paving, then grass.
    for (let i = 1; i < levels.length; i++)
      assert.ok(levels[i] < levels[i - 1]);
    // The foundation stays flush under the room: a few millimetres below y = 0.
    assert.ok(LEVELS.roomFloor - LEVELS.foundationTop <= 0.01);
  });

  it("contains every placement on its footprint", () => {
    for (const part of PARTS)
      assert.ok(inside(flat(part), plotRect), `${part.id} leaves the plot`);
    for (const space of PARKING)
      assert.ok(inside(flat(space), plotRect), `${space.id} leaves the plot`);
    for (const plant of [...TREES, ...BUSHES])
      assert.ok(
        inside(circle(plant.x, plant.z, plant.radius), plotRect),
        `plant at ${plant.x},${plant.z} leaves the plot`,
      );
    assert.ok(inside(roofRect, plotRect));
  });
});

describe("house shell", () => {
  it("adds no solid inside the original room or its open cutaway", () => {
    for (const part of PARTS) {
      if (part.max[1] <= ROOM_BOUNDS.min[1]) continue; // below the floor
      assert.ok(
        !overlaps(flat(part), roomRect),
        `${part.id} intrudes into the original room`,
      );
    }
    assert.ok(
      !overlaps(roofRect, roomRect),
      "the roof must not cover the room",
    );
  });

  it("matches the original room height with a roof above it", () => {
    const walls = PARTS.filter((part) => part.role === "wall");
    assert.ok(walls.length >= 3);
    for (const wall of walls) assert.equal(wall.max[1], ROOM_BOUNDS.max[1]);
    assert.ok(ROOF.eave >= ROOM_BOUNDS.max[1]);
    assert.ok(ROOF.ridge > ROOF.eave);
  });

  it("keeps paving between the grass and the room floor", () => {
    assert.ok(paving.length > 0);
    for (const part of paving) {
      assert.equal(part.max[1], LEVELS.pavingTop, part.id);
      // Embedded below the grass so no slab bottom is coplanar with it.
      assert.ok(part.min[1] < LEVELS.terrainTop, part.id);
    }
  });

  it("connects the front door to the plot edge with a continuous walk", () => {
    const door = partById(ENTRANCE.door);
    const walk = ENTRANCE.path.map(partById);
    assert.ok(walk.length > 0);
    // The door sits on the front facade and the first slab meets it.
    assert.ok(touches(flat(door), flat(walk[0])));
    for (let i = 1; i < walk.length; i++)
      assert.ok(touches(flat(walk[i - 1]), flat(walk[i])), walk[i].id);
    assert.equal(walk.at(-1)?.max[2], PLOT.max[2]);
  });

  it("leaves the hedge open where the walk and driveway reach the street", () => {
    const street = [ENTRANCE.path.at(-1), "driveway"].map((id) =>
      partById(id ?? ""),
    );
    for (const slab of street)
      for (const hedge of HEDGES)
        assert.ok(
          !overlaps(flat(slab), flat(hedge)),
          `${hedge.id} blocks ${slab.id}`,
        );
    // The hedge still bounds the plot on every side.
    for (const side of [0, 1] as const) {
      assert.ok(
        HEDGES.some((h) => h.min[side * 2] <= PLOT.min[side * 2] + 0.5),
      );
      assert.ok(
        HEDGES.some((h) => h.max[side * 2] >= PLOT.max[side * 2] - 0.5),
      );
    }
  });
});

describe("carport", () => {
  const slab = partById("carport-floor");
  const roof = partById("carport-roof");

  it("reserves non-overlapping car and motorcycle spaces under the roof", () => {
    const car = PARKING.find((space) => space.id === "car");
    const moto = PARKING.find((space) => space.id === "motorcycle");
    assert.ok(car && moto);
    const size = (r: Box) => [r.max[0] - r.min[0], r.max[2] - r.min[2]].sort();
    // Typical minimum bays: 2.4 m × 5 m for a car, 1 m × 2.2 m for a motorcycle.
    const [carW, carL] = size(car);
    const [motoW, motoL] = size(moto);
    assert.ok(carW >= 2.4 && carL >= 5);
    assert.ok(motoW >= 1 && motoL >= 2.2);
    assert.ok(!overlaps(flat(car), flat(moto)));
    for (const space of [car, moto]) {
      assert.ok(inside(flat(space), flat(slab)));
      assert.ok(inside(flat(space), flat(roof)));
      assert.ok(space.label.length > 0);
    }
  });

  it("is reachable from the street by the driveway", () => {
    const driveway = partById("driveway");
    assert.ok(touches(flat(slab), flat(driveway)));
    assert.equal(driveway.max[2], PLOT.max[2]);
  });
});

describe("plants", () => {
  it("stand on grass, clear of the house, paving and parking", () => {
    const blocked = [
      ...PARTS.filter((part) => part.role !== "hedge").map(flat),
      ...PARKING.map(flat),
      roomRect,
      roofRect,
    ];
    for (const plant of [...TREES, ...BUSHES]) {
      const foot = circle(plant.x, plant.z, plant.radius);
      for (const rect of blocked)
        assert.ok(!overlaps(foot, rect), `plant at ${plant.x},${plant.z}`);
    }
  });
});

describe("bounds", () => {
  it("encloses the room, the house and the plot", () => {
    for (const box of [ROOM_BOUNDS, PLOT, ...PARTS])
      assert.ok(inside(flat(box), flat(SCENE_BOUNDS)));
    assert.equal(SCENE_BOUNDS.min[1], PLOT.min[1]);
    assert.ok(SCENE_BOUNDS.max[1] >= ROOF.ridge);
    for (const box of [ROOM_BOUNDS, ...PARTS.filter((p) => p.role !== "hedge")])
      assert.ok(inside(flat(box), flat(HOUSE_BOUNDS)));
  });

  it("sizes the shadow frustum to every house corner, clear of the light", () => {
    const shadow = shadowFrustum(HOUSE_BOUNDS);
    for (const corner of corners(HOUSE_BOUNDS))
      assert.ok(
        Math.hypot(...corner.map((v, i) => v - shadow.center[i])) <=
          shadow.halfSize + 1e-9,
      );
    // Any caster in the sphere lies between the near and far planes.
    assert.ok(
      shadow.near > 0 && shadow.near < shadow.distance - shadow.halfSize,
    );
    assert.ok(shadow.far >= shadow.distance + shadow.halfSize);
  });
});
