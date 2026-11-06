import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GARAGE_DOOR, GARAGE_INTERIOR } from "../../src/lib/world/garage.ts";
import {
  easeToward,
  GARAGE_BARS,
  GARAGE_DOOR_MOTION,
  GARAGE_GRID,
  GARAGE_LIGHT_FIXTURES,
  GARAGE_LIGHTS,
  garageDoorClosed,
  garageLightLevel,
  gridParts,
  hexGrid,
} from "../../src/lib/world/garage-lights.ts";
import { garageDoorCurtain, HOUSE, WALLS } from "../../src/lib/world/house.ts";
import { truckBox } from "../../src/lib/world/truck.ts";

const EPS = 1e-6;
const FLOOR = HOUSE.floorY;
const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const NOON = 12;
const NIGHT = 22;

describe("garage detailing-bay LEDs (dream-truck T2)", () => {
  it("hangs a honeycomb grid under the garage roof, over the truck", () => {
    const { x0, x1, z0, z1, y } = GARAGE_GRID;
    assert.ok(x0 >= GARAGE_INTERIOR.x0 + 0.1 && x1 <= GARAGE_INTERIOR.x1 - 0.1);
    assert.ok(z0 >= GARAGE_INTERIOR.z0 + 0.1);
    // Clear of the rolled-up door's drum behind the header.
    assert.ok(z1 <= GARAGE_INTERIOR.z1 - 0.4);
    const truck = truckBox();
    assert.ok(y - truck.y1 >= 0.2, "over the truck's roof");
    assert.ok(y < FLOOR + HOUSE.garage.height, "under the eave");
    assert.ok(x1 - x0 > 1.6 && z1 - z0 > 4, "most of the ceiling");
  });

  it("draws whole hexagons, each shared edge once, inside its frame", () => {
    const edges = hexGrid();
    assert.ok(edges.length > 60, `${edges.length} edges`);
    const keys = new Set<string>();
    for (const [[ax, az], [bx, bz]] of edges) {
      for (const [x, z] of [
        [ax, az],
        [bx, bz],
      ])
        assert.ok(
          x >= GARAGE_GRID.x0 - EPS &&
            x <= GARAGE_GRID.x1 + EPS &&
            z >= GARAGE_GRID.z0 - EPS &&
            z <= GARAGE_GRID.z1 + EPS,
        );
      const length = Math.hypot(bx - ax, bz - az);
      assert.ok(Math.abs(length - GARAGE_GRID.side) < 1e-6, `${length}`);
      const key = [(ax + bx) / 2, (az + bz) / 2]
        .map((v) => v.toFixed(4))
        .join();
      assert.ok(!keys.has(key), "an edge twice");
      keys.add(key);
    }
  });

  it("is one small merged mesh of tubes and a frame", () => {
    const parts = gridParts();
    assert.equal(parts.length, hexGrid().length + 4);
    assert.ok(parts.length * 12 < 3000, "triangles");
    for (const part of parts) {
      assert.ok(Math.abs(part.center[1] - GARAGE_GRID.y) < EPS);
      assert.equal(part.shape, "box");
    }
  });

  it("runs two low LED bars along the side walls, under the windows", () => {
    assert.equal(GARAGE_BARS.length, 2);
    const truck = truckBox();
    const windows = WALLS.find((w) => w.id === "garage-left")?.openings ?? [];
    for (const bar of GARAGE_BARS) {
      const [x, y] = bar.center;
      const [w, h, d] = bar.size;
      assert.ok(d >= 3, "long");
      assert.ok(y - FLOOR > 0.5 && y - FLOOR < 1, "waist height");
      assert.ok(x - w / 2 > truck.x1 + 0.05 || x + w / 2 < truck.x0 - 0.05);
      for (const window of windows)
        assert.ok(y + h / 2 < FLOOR + window.v0 - 0.05, "under the sills");
    }
    const xs = GARAGE_BARS.map((bar) => bar.center[0]).sort((a, b) => a - b);
    assert.ok(xs[0] < truck.x0 && xs[1] > truck.x1, "one each side");
  });

  it("glows cool daylight white, about 6000 K", () => {
    const hex = GARAGE_LIGHTS.color;
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(hex.slice(i, i + 2), 16),
    );
    assert.ok(r >= 245 && g >= 235 && b >= 225, hex);
    assert.ok(r - b < 30, "not warm");
  });
});

describe("garage lights", () => {
  it("are soft, finite spots: two from the ceiling, two low side fills", () => {
    const ceiling = GARAGE_LIGHT_FIXTURES.filter((f) => f.role === "ceiling");
    const side = GARAGE_LIGHT_FIXTURES.filter((f) => f.role === "side");
    assert.equal(ceiling.length, 2);
    assert.equal(side.length, 2);
    for (const fixture of GARAGE_LIGHT_FIXTURES) {
      // Even light within the cutoff, no falloff hot spot near the lamp.
      assert.equal(fixture.decay, 0);
      assert.ok(fixture.penumbra >= 0.3);
      assert.equal(fixture.castShadow, false);
      assert.ok(fixture.intensity > 0);
      // The cutoff keeps the light inside the garage: never past the
      // main house's wall, nor out of the left wall.
      const [x] = fixture.position;
      const [tx] = fixture.target;
      const reach = x + Math.sign(tx - x || 0) * fixture.distance;
      if (fixture.role === "side") {
        assert.ok(reach > HOUSE.garage.x0 && reach < HOUSE.garage.x1);
      }
    }
    for (const fixture of ceiling) {
      assert.ok(Math.abs(fixture.position[1] - GARAGE_GRID.y) < 0.1);
      assert.ok(fixture.target[1] < fixture.position[1] - 1, "aimed down");
      assert.ok(
        fixture.distance < fixture.position[1] + 0.4,
        "stops at the floor",
      );
    }
    for (const fixture of side)
      assert.ok(
        Math.abs(fixture.target[1] - fixture.position[1]) < 0.3,
        "across",
      );
  });

  it("go to showroom level in the close-up, at any hour", () => {
    for (const hours of [0, 6, NOON, 18, NIGHT])
      assert.equal(garageLightLevel(hours, true, true), 1);
  });

  it("come on softer by themselves at night, off by day", () => {
    const night = garageLightLevel(NIGHT, true, false);
    assert.ok(night > 0.25 && night < 0.7, `${night}`);
    assert.equal(garageLightLevel(NOON, true, false), 0);
  });

  it("obey the master power switch, like the cases", () => {
    assert.equal(garageLightLevel(NIGHT, false, false), 0);
    assert.equal(garageLightLevel(NIGHT, false, true), 0);
  });

  it("ramp in about 0.8 s; reduced motion jumps", () => {
    assert.ok(Math.abs(GARAGE_LIGHTS.ramp - 0.8) < 0.1);
    let level = 0;
    for (let t = 0; t < GARAGE_LIGHTS.ramp - 0.1; t += 1 / 60)
      level = easeToward(level, 1, 1 / 60, GARAGE_LIGHTS.ramp, false);
    assert.ok(level > 0.5 && level < 1, `${level}`);
    for (let t = 0; t < 0.2; t += 1 / 60)
      level = easeToward(level, 1, 1 / 60, GARAGE_LIGHTS.ramp, false);
    assert.equal(level, 1);
    assert.equal(easeToward(0, 1, 1 / 60, GARAGE_LIGHTS.ramp, true), 1);
    assert.equal(easeToward(1, 0, 1 / 60, GARAGE_LIGHTS.ramp, true), 0);
  });
});

describe("garage door at night", () => {
  it("rolls down at night and stays up by day or for the close-up", () => {
    assert.equal(garageDoorClosed(NIGHT, false), 1);
    assert.equal(garageDoorClosed(NOON, false), 0);
    assert.equal(garageDoorClosed(NIGHT, true), 0);
  });

  it("takes about 1.5 s, reduced motion at once", () => {
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

describe("garage lights wiring", () => {
  it("mounts the lights at zero and drives them from the clock and the close-up", () => {
    const lights = source("src/components/world/GarageLights.tsx");
    assert.match(lights, /garageLightLevel\(/);
    assert.match(lights, /easeToward\(/);
    assert.match(lights, /intensity=\{0\}/);
    assert.match(lights, /gridParts\(/);
    assert.match(lights, /GARAGE_BARS/);
    assert.doesNotMatch(lights, /RectAreaLight/);
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /<GarageLights\b/);
    assert.match(scene, /garageDoorClosed\(/);
  });

  it("rolls the curtain with the garage front, so the reveal takes it too", () => {
    const house = source("src/components/world/House.tsx");
    assert.match(house, /garageDoorCurtain\(/);
    assert.match(house, /fading\.get\("garage-front"\)/);
    assert.match(house, /GARAGE_DOOR_MOTION\.duration/);
  });
});
