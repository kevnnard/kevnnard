import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  clearOfGarden,
  GARDEN_PROPS,
  LANTERN_FIXTURES,
  PATH_STONES,
  STONE,
  stoneOutline,
} from "../../src/lib/world/garden.ts";
import {
  HOUSE,
  HOUSE_FOCUS,
  HOUSE_FOOTPRINT,
  houseMeshes,
  type Part,
  WALLS,
} from "../../src/lib/world/house.ts";
import { ISLAND, onPad, PAD } from "../../src/lib/world/island.ts";
import { islandLayout } from "../../src/lib/world/layout.ts";
import { LIVING_MODELS, livingMeshes } from "../../src/lib/world/living.ts";
import { setupMeshes } from "../../src/lib/world/setup.ts";

// S22: "extiendes las casa osea sacas mas la entrada". The main volume grows
// 0.65 m toward the front; the garage, setup and living area stay put.
// Hashes are of part geometry (shape, centre, size, rotation, radius,
// profile) recorded from the house before the extension.

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const geometry = (p: Part) =>
  [
    p.shape,
    p.center.map(round),
    p.size.map(round),
    (p.rotation ?? [0, 0, 0]).map(round),
    p.radius ?? 0,
    JSON.stringify(p.profile ?? []),
  ].join("|");
const hash = (parts: Part[]) =>
  createHash("sha256")
    .update(parts.map(geometry).join("\n"))
    .digest("hex")
    .slice(0, 16);
const EPS = 1e-9;

describe("house extension toward the entrance (T10, S22)", () => {
  it("moves the main front 0.65 m forward and keeps the back, sides and height", () => {
    assert.equal(HOUSE.main.z1, 1.5);
    assert.equal(HOUSE.main.z0, -2.75);
    assert.equal(HOUSE.main.x0, -1.25);
    assert.equal(HOUSE.main.x1, 4.05);
    assert.equal(HOUSE.main.height, 1.95);
    const front = WALLS.find((wall) => wall.id === "main-front");
    assert.ok(front);
    assert.ok(Math.abs(front.at - (1.5 - HOUSE.wall / 2)) < EPS);
    for (const id of ["main-left", "main-right"]) {
      const wall = WALLS.find((item) => item.id === id);
      assert.ok(wall);
      assert.ok(Math.abs(wall.to - (1.5 - HOUSE.wall)) < EPS, id);
      assert.ok(Math.abs((wall.gable?.center ?? 0) - (-2.75 + 1.5) / 2) < EPS);
    }
    // Same front openings: door, windows, nothing narrowed.
    assert.deepEqual(
      front.openings.map((o) => [o.kind, o.u0, o.u1]),
      [
        ["window", -0.95, -0.2],
        ["door", 0.14, 0.86],
        ["window", 1.25, 2],
        ["window", 2.75, 3.5],
      ],
    );
  });

  it("regenerates the main roof and floor from the longer volume", () => {
    const meshes = houseMeshes();
    const roofZ = meshes["main-roof"].wood.map((p) => p.center[2]);
    assert.ok(Math.max(...roofZ) > 1.5, "roof reaches past the new front");
    const floor = meshes.base.wood.filter(
      (p) => p.surface === "floor" && p.center[1] < HOUSE.floorY + 0.05,
    );
    const z1 = Math.max(...floor.map((p) => p.center[2] + p.size[2] / 2));
    assert.ok(Math.abs(z1 - (1.5 - HOUSE.wall)) < 0.01, `floor to ${z1}`);
    const main = HOUSE_FOOTPRINT.find((rect) => rect.id === "main");
    assert.equal(main?.z1, 1.5 + HOUSE.main.overhang.z1);
  });

  it("keeps the garage's geometry, door and roof exactly as before", () => {
    assert.deepEqual(
      {
        x0: HOUSE.garage.x0,
        x1: HOUSE.garage.x1,
        z0: HOUSE.garage.z0,
        z1: HOUSE.garage.z1,
        height: HOUSE.garage.height,
        rise: HOUSE.garage.rise,
      },
      { x0: -3.1, x1: -1.25, z0: -2.45, z1: 0.55, height: 1.45, rise: 0.6 },
    );
    const door = WALLS.find((w) => w.id === "garage-front")?.openings[0];
    assert.deepEqual(door, {
      kind: "garage",
      u0: -2.88,
      u1: -1.5,
      v0: 0,
      v1: 1.15,
    });
    const meshes = houseMeshes();
    const expected = {
      "garage-front": "d4e8d188eaa8057a",
      "garage-left": "e85744763a8b8b46",
      "garage-back": "bd7b141469fd4832",
      "garage-roof": "ca4a05c70e04a24f",
    } as const;
    for (const [group, digest] of Object.entries(expected)) {
      const { wood, glass } = meshes[group as keyof typeof expected];
      assert.equal(hash([...wood, ...glass]), digest, group);
    }
    assert.deepEqual(HOUSE.driveway, {
      x0: -2.95,
      x1: -1.42,
      z0: 0.55,
      z1: 2,
    });
  });

  it("leaves the gaming setup and the living area where they were", () => {
    const setup = setupMeshes();
    assert.equal(
      hash([...setup.solid, ...setup.glow, ...setup.glass, ...setup.hull]),
      "5ee8de46183ed522",
    );
    assert.equal(
      hash(Object.values(livingMeshes()).flat()),
      "db052265f27be4fb",
    );
    assert.equal(
      createHash("sha256")
        .update(JSON.stringify(LIVING_MODELS))
        .digest("hex")
        .slice(0, 16),
      "469dd3f5a1ed7aca",
    );
  });

  it("moves the porch with the front wall and grows the pad 0.2 m forward only", () => {
    assert.deepEqual(HOUSE.porch, { x0: 0.04, x1: 0.96, z0: 1.5, z1: 2.06 });
    assert.ok(Math.abs(PAD.center[1] - PAD.halfZ - -3) < EPS, "back fixed");
    assert.ok(Math.abs(PAD.center[1] + PAD.halfZ - 2.2) < EPS, "front 2.20");
    assert.equal(PAD.halfX, 3.8);
    assert.equal(PAD.center[0], 0.5);
    for (const rect of HOUSE_FOOTPRINT)
      assert.ok(onPad(rect.x1, rect.z1) && onPad(rect.x0, rect.z1), rect.id);
  });

  it("keeps the camera focus on the house: it follows half the extension", () => {
    assert.ok(Math.abs(HOUSE_FOCUS[2] - (-2.75 + 1.5) / 2) < EPS);
    assert.ok(Math.abs(HOUSE_FOCUS[2] - (-0.95 + 0.325)) < EPS);
  });

  it("keeps the island nature layout unchanged", () => {
    assert.equal(
      createHash("sha256")
        .update(JSON.stringify(islandLayout(ISLAND.seed)))
        .digest("hex")
        .slice(0, 16),
      "228a730534662583",
    );
  });

  it("steps the six garden stones out from the new porch, x kept", () => {
    // Planned z 2.35 for the first stone straddled the pad's new front edge
    // (outline at 2.2025 < 2.2 + bevel): it sits at 2.37.
    assert.deepEqual(
      PATH_STONES.map((s) => s.center),
      [
        [0.5, 2.37],
        [0.66, 2.85],
        [1.02, 3.25],
        [1.48, 3.6],
        [1.97, 3.9],
        [2.46, 4.2],
      ],
    );
    // The first stone sits on the grass just past the pad's front edge.
    const first = stoneOutline(PATH_STONES[0]);
    for (const [x, z] of first) assert.ok(!onPad(x, z, STONE.bevel));
    assert.equal(PATH_STONES[0].y, -STONE.sink);
  });

  it("joins the older island trail past the last garden stone", () => {
    const trail = clearOfGarden(
      islandLayout(ISLAND.seed).filter((item) => item.kind === "stone"),
    );
    assert.ok(trail.length >= 2, `${trail.length} trail stones kept`);
    const [lx, lz] = PATH_STONES[PATH_STONES.length - 1].center;
    const nearest = Math.min(
      ...trail.map((s) => Math.hypot(s.position[0] - lx, s.position[2] - lz)),
    );
    assert.ok(nearest < 0.75, `trail gap ${nearest}`);
    for (const stone of trail)
      assert.ok(stone.position[2] > 3.4, "trail continues outward");
  });

  it("keeps the mailbox where it was and the sign just off the grown pad", () => {
    assert.deepEqual(GARDEN_PROPS.mailbox.position, [-0.05, 2.55]);
    // At z 2.48 the sign's 0.45 m footprint reached onto the grown pad.
    assert.deepEqual(GARDEN_PROPS.sign.position, [1.72, 2.7]);
    for (const prop of Object.values(GARDEN_PROPS)) {
      const [x, z] = prop.position;
      assert.ok(!onPad(x, z, prop.radius), "off the pad");
    }
  });

  it("keeps the front lanterns on the moved wall, garage and back fixed", () => {
    const face = 1.5;
    for (const id of ["lanternLeft", "lanternRight"] as const)
      assert.ok(LANTERN_FIXTURES[id].position[2] > face, id);
    assert.ok(
      Math.abs(LANTERN_FIXTURES.lanternGarage.position[2] - 0.69) < 0.1,
    );
    assert.ok(LANTERN_FIXTURES.lanternBack.position[2] < HOUSE.main.z0);
  });
});
