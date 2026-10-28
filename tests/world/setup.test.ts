import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { poseToPosition } from "../../src/lib/world/camera.ts";
import { cutaway } from "../../src/lib/world/cutaway.ts";
import { HOUSE, WALLS } from "../../src/lib/world/house.ts";
import {
  DOOR_SWING,
  MAIN_ROOM,
  partBounds,
  SETUP,
  SETUP_ZONE,
  setupGlow,
  setupMeshes,
} from "../../src/lib/world/setup.ts";

const EPS = 1e-6;
const meshes = setupMeshes();
const parts = [...meshes.solid, ...meshes.glow, ...meshes.glass];
const apart = (
  a: { x0: number; x1: number; z0: number; z1: number },
  b: { x0: number; x1: number; z0: number; z1: number },
) => a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1;

describe("gaming setup in the main room (T4d, S8)", () => {
  it("builds the desk, monitors, PC, speakers and chair from a few meshes", () => {
    assert.ok(meshes.solid.length > 40, "chunky detail");
    assert.ok(meshes.glow.length >= 3, "two screens and the RGB strip");
    assert.ok(meshes.glass.length >= 1, "PC glass side");
    assert.ok(parts.length < 300, `${parts.length} parts`);
    assert.equal(SETUP.draws, 3);
  });

  it("stays inside the main room, on the floor and under the walls' top", () => {
    for (const part of parts) {
      const b = partBounds(part);
      assert.ok(b.x0 >= MAIN_ROOM.x0 - EPS && b.x1 <= MAIN_ROOM.x1 + EPS, "x");
      assert.ok(b.z0 >= MAIN_ROOM.z0 - EPS && b.z1 <= MAIN_ROOM.z1 + EPS, "z");
      assert.ok(b.y0 >= HOUSE.floorY - EPS, "above the floor");
      assert.ok(b.y1 < HOUSE.floorY + HOUSE.main.height, "below the eaves");
    }
  });

  it("keeps clear of every window and door opening and the door swing", () => {
    const main = WALLS.filter((wall) => wall.id.startsWith("main-"));
    const reach = 0.35;
    for (const wall of main)
      for (const opening of wall.openings) {
        const [n0, n1] =
          wall.side > 0
            ? [wall.at - reach, wall.at]
            : [wall.at, wall.at + reach];
        const [u0, u1] = [opening.u0 - 0.1, opening.u1 + 0.1];
        const near =
          wall.axis === "x"
            ? { x0: u0, x1: u1, z0: n0, z1: n1 }
            : { x0: n0, x1: n1, z0: u0, z1: u1 };
        for (const part of parts)
          assert.ok(
            apart(partBounds(part), near),
            `${wall.id} ${opening.kind}`,
          );
      }
    assert.ok(apart(SETUP_ZONE, DOOR_SWING), "door swings free");
    for (const part of parts) assert.ok(apart(partBounds(part), DOOR_SWING));
  });

  it("leaves at least 0.6 m to pull the chair out, plus a walkway", () => {
    assert.ok(SETUP.pullOut >= 0.6);
    assert.ok(SETUP_ZONE.x1 - SETUP.chairBack >= 0.6 - EPS);
    assert.ok(SETUP_ZONE.x1 <= MAIN_ROOM.x1, "zone inside the room");
    assert.ok(MAIN_ROOM.x1 - SETUP_ZONE.x1 >= 0.6, "walkway to the windows");
    for (const part of parts) {
      const b = partBounds(part);
      assert.ok(b.x1 <= SETUP.chairBack + EPS, "nothing past the chair");
      assert.ok(b.z0 >= SETUP_ZONE.z0 - EPS && b.z1 <= SETUP_ZONE.z1 + EPS);
    }
  });

  it("faces the room: screens look into it, past the chair", () => {
    const roomCenter = (MAIN_ROOM.x0 + MAIN_ROOM.x1) / 2;
    const screens = Math.max(...meshes.glow.map((part) => part.center[0]));
    assert.ok(screens < SETUP.chair[0], "chair in front of the screens");
    assert.ok(SETUP.chair[0] < roomCenter, "setup on the room's back side");
    assert.equal(SETUP.wall, "main-left");
    assert.equal(SETUP.facing[0], 1, "facing +x, into the room");
  });

  it("backs onto a wall the home camera never dissolves", () => {
    const fades = cutaway(
      poseToPosition({ azimuth: Math.PI / 4, polar: 1.1, distance: 5 }),
    );
    assert.equal(fades[SETUP.wall], 0);
  });

  it("glows brighter at night than by day", () => {
    assert.ok(setupGlow(0) > setupGlow(12));
    for (const hours of [0, 6, 12, 18, 23])
      assert.ok(setupGlow(hours) >= 0.5 && setupGlow(hours) <= 1.3);
  });
});
