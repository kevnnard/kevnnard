import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GARAGE_DOOR } from "../../src/lib/world/garage.ts";
import * as garageLights from "../../src/lib/world/garage-lights.ts";
import { garageDoorCurtain, HOUSE, WALLS } from "../../src/lib/world/house.ts";

const { easeToward, GARAGE_DOOR_MOTION, garageDoorClosed } = garageLights;
const EPS = 1e-6;
const FLOOR = HOUSE.floorY;
const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("garage door, closed for good (dream-truck T4)", () => {
  it("stays down at any hour: nothing is parked inside to show", () => {
    for (let hours = 0; hours < 24; hours += 0.5)
      assert.equal(garageDoorClosed(), 1, `${hours} h`);
  });

  it("still eases in about 1.5 s, reduced motion at once", () => {
    assert.ok(Math.abs(GARAGE_DOOR_MOTION.duration - 1.5) < 0.1);
    let closed = 0;
    for (let t = 0; t < 0.75; t += 1 / 60)
      closed = easeToward(
        closed,
        1,
        1 / 60,
        GARAGE_DOOR_MOTION.duration,
        false,
      );
    assert.ok(closed > 0.3 && closed < 0.8, `${closed}`);
    assert.equal(
      easeToward(0, 1, 1 / 60, GARAGE_DOOR_MOTION.duration, true),
      1,
    );
  });

  it("fills the opening when closed, hanging from the head", () => {
    const parts = garageDoorCurtain();
    assert.ok(parts.length > 4);
    const front = WALLS.find((w) => w.id === "garage-front");
    assert.ok(front);
    const top = FLOOR + GARAGE_DOOR.v1;
    for (const part of parts) {
      const [x, y, z] = part.center;
      const [w, h] = part.size;
      assert.ok(x - w / 2 >= GARAGE_DOOR.u0 - EPS);
      assert.ok(x + w / 2 <= GARAGE_DOOR.u1 + EPS);
      assert.ok(y - h / 2 >= FLOOR - EPS && y + h / 2 <= top + EPS);
      assert.ok(Math.abs(z - front.at) < 0.1, "in the wall's plane");
    }
    const bottom = Math.min(...parts.map((p) => p.center[1] - p.size[1] / 2));
    assert.ok(Math.abs(bottom - FLOOR) < 0.01, "down to the floor");
  });
});

describe("no showroom inside the closed garage (dream-truck T4)", () => {
  it("drops the LED grid, bars, strip and showroom spots", () => {
    for (const name of [
      "GARAGE_LIGHT_FIXTURES",
      "GARAGE_GRID",
      "GARAGE_BARS",
      "gridParts",
      "floorStripParts",
      "garageShowroomLevel",
      "garageTruckEnvIntensity",
    ])
      assert.equal(name in garageLights, false, name);
  });

  it("mounts no garage lights; the scene keeps the door down", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    assert.doesNotMatch(scene, /GarageLights/);
    assert.match(scene, /garageDoorClosed\(\)/);
    assert.doesNotMatch(scene, /TRUCK_REVEAL/);
  });

  it("rolls the curtain with the garage front, so the cutaway takes it too", () => {
    const house = source("src/components/world/House.tsx");
    assert.match(house, /garageDoorCurtain\(/);
    assert.match(house, /fading\.get\("garage-front"\)/);
    assert.match(house, /GARAGE_DOOR_MOTION\.duration/);
  });
});
