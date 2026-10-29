import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LIGHTS,
  glowPower,
  LAMP,
  LIGHT_FIXTURES,
  LIGHT_IDS,
  lampParts,
  lightLevel,
  lightOutputs,
  nightLightsOn,
  togglePower,
  updateLight,
} from "../../src/lib/world/lights.ts";
import { TV_PANEL } from "../../src/lib/world/living.ts";
import {
  MAIN_MONITOR,
  MAIN_ROOM,
  partBounds,
  SETUP_PROPS,
  SHELF,
  setupMeshes,
} from "../../src/lib/world/setup.ts";

const EPS = 1e-6;
const at = (h: number, m: number) => h + m / 60;

describe("night lights gate (S17: on 18:00 through 05:59 simulated time)", () => {
  it("switches exactly at the 18:00 and 06:00 boundaries", () => {
    assert.equal(nightLightsOn(at(17, 59)), false, "17:59 off");
    assert.equal(nightLightsOn(at(18, 0)), true, "18:00 on");
    assert.equal(nightLightsOn(at(5, 59)), true, "05:59 on");
    assert.equal(nightLightsOn(at(6, 0)), false, "06:00 off");
  });

  it("covers the whole night and day, and wraps the hour", () => {
    assert.equal(nightLightsOn(0), true);
    assert.equal(nightLightsOn(23.99), true);
    assert.equal(nightLightsOn(12), false);
    assert.equal(nightLightsOn(at(17, 59) + 59 / 3600), false, "17:59:59");
    assert.equal(nightLightsOn(24), true, "24:00 is midnight");
    assert.equal(nightLightsOn(30), false, "30 wraps to 06:00");
    assert.equal(nightLightsOn(-1), true, "-1 wraps to 23:00");
  });
});

describe("night light settings", () => {
  it("defaults four enabled lights with valid colors and intensities", () => {
    assert.deepEqual(Object.keys(DEFAULT_LIGHTS).sort(), [...LIGHT_IDS].sort());
    assert.equal(LIGHT_IDS.length, 4);
    for (const id of LIGHT_IDS) {
      const light = DEFAULT_LIGHTS[id];
      assert.equal(light.enabled, true, id);
      assert.match(light.color, /^#[0-9a-f]{6}$/, id);
      assert.ok(light.intensity > 0 && light.intensity <= 100, id);
    }
  });

  it("clamps intensity, rejects bad colors and never mutates", () => {
    const before = structuredClone(DEFAULT_LIGHTS);
    const high = updateLight(DEFAULT_LIGHTS, "tv", { intensity: 180 });
    assert.equal(high.tv.intensity, 100);
    assert.equal(
      updateLight(DEFAULT_LIGHTS, "tv", { intensity: -5 }).tv.intensity,
      0,
    );
    assert.equal(
      updateLight(DEFAULT_LIGHTS, "tv", { intensity: 42.6 }).tv.intensity,
      43,
    );
    assert.equal(
      updateLight(DEFAULT_LIGHTS, "tv", { intensity: Number.NaN }).tv.intensity,
      DEFAULT_LIGHTS.tv.intensity,
    );
    assert.equal(
      updateLight(DEFAULT_LIGHTS, "setup", { color: "#AABBCC" }).setup.color,
      "#aabbcc",
    );
    assert.equal(
      updateLight(DEFAULT_LIGHTS, "setup", { color: "red" }).setup.color,
      DEFAULT_LIGHTS.setup.color,
    );
    const off = updateLight(DEFAULT_LIGHTS, "lampLeft", { enabled: false });
    assert.equal(off.lampLeft.enabled, false);
    assert.equal(off.lampRight, DEFAULT_LIGHTS.lampRight, "others untouched");
    assert.deepEqual(DEFAULT_LIGHTS, before);
  });

  it("lights only enabled lights at night, scaled by intensity", () => {
    const light = { enabled: true, color: "#ffffff", intensity: 60 };
    assert.equal(lightLevel(light, at(18, 0)), 0.6);
    assert.equal(lightLevel(light, at(17, 59)), 0);
    assert.equal(lightLevel({ ...light, enabled: false }, at(22, 0)), 0);
  });
});

describe("master power (Power off / Power on, night only)", () => {
  const night = at(22, 0);
  const day = at(12, 0);

  it("toggles only at night: by day the action is a no-op", () => {
    assert.equal(togglePower(true, night), false);
    assert.equal(togglePower(false, night), true);
    assert.equal(togglePower(true, day), true, "day keeps it on");
    assert.equal(togglePower(false, day), false, "day keeps it off");
    // The exact S17 gate: 17:59 is day, 18:00 and 05:59 night, 06:00 day.
    assert.equal(togglePower(true, at(17, 59)), true);
    assert.equal(togglePower(true, at(18, 0)), false);
    assert.equal(togglePower(true, at(5, 59)), false);
    assert.equal(togglePower(true, at(6, 0)), true);
  });

  it("zeroes every light output when off, and restores them unchanged", () => {
    const custom = updateLight(
      updateLight(DEFAULT_LIGHTS, "tv", { color: "#123456", intensity: 35 }),
      "lampLeft",
      { enabled: false },
    );
    const frozen = structuredClone(custom);
    const on = lightOutputs(custom, night, true);
    assert.deepEqual(on, {
      tv: 0.35,
      setup: 0.6,
      lampLeft: 0,
      lampRight: 0.8,
    });
    const off = lightOutputs(custom, night, false);
    for (const id of LIGHT_IDS) {
      assert.equal(off[id], 0, id);
      assert.equal(lightLevel(custom[id], night, false), 0, id);
    }
    // The master is separate state: settings survive off and on.
    assert.deepEqual(custom, frozen);
    assert.deepEqual(lightOutputs(custom, night, true), on);
    // Defaults to on, so older callers keep their behavior.
    assert.deepEqual(lightOutputs(custom, night), on);
    assert.equal(lightLevel(custom.tv, night), 0.35);
  });

  it("never lights anything by day, whatever the master", () => {
    for (const power of [true, false])
      for (const id of LIGHT_IDS)
        assert.equal(lightOutputs(DEFAULT_LIGHTS, day, power)[id], 0);
  });

  it("turns screens and LEDs off only at night", () => {
    assert.equal(glowPower(true, night), 1);
    assert.equal(glowPower(false, night), 0);
    assert.equal(glowPower(true, day), 1);
    assert.equal(glowPower(false, day), 1, "daytime screens stay as they are");
  });
});

describe("night light fixtures", () => {
  it("keeps a modest budget of four finite, non-shadow lights", () => {
    assert.deepEqual(Object.keys(LIGHT_FIXTURES).sort(), [...LIGHT_IDS].sort());
    for (const id of LIGHT_IDS) {
      const fixture = LIGHT_FIXTURES[id];
      assert.equal(fixture.castShadow, false, id);
      assert.ok(fixture.distance > 0 && fixture.distance <= 2, id);
      // T13: the backlight washes use decay 0 (near field of the strip);
      // their centre irradiance is pinned in lights-spread.test.ts.
      if (id === "tv" || id === "setup") assert.equal(fixture.decay, 0, id);
      else {
        assert.equal(fixture.decay, 2, id);
        assert.ok(fixture.intensity > 0 && fixture.intensity < 1, id);
      }
    }
  });

  // S18: backlights wash the wall broadly. T12: the shelf lamps are spots
  // aimed down at the desk (tests/world/setup-finish.test.ts).
  it("makes the backlights wall-aimed spots and the lamps spots too", () => {
    assert.equal(LIGHT_FIXTURES.lampLeft.kind, "spot");
    assert.equal(LIGHT_FIXTURES.lampRight.kind, "spot");
    const walls = {
      tv: { axis: 2, wall: MAIN_ROOM.z0 },
      setup: { axis: 0, wall: MAIN_ROOM.x0 },
    } as const;
    for (const id of ["tv", "setup"] as const) {
      const fixture = LIGHT_FIXTURES[id];
      assert.equal(fixture.kind, "spot", id);
      if (fixture.kind !== "spot") continue;
      const { axis, wall } = walls[id];
      // Aimed straight at the wall: only the wall side is lit, no spill
      // through the panel into the room.
      assert.ok(Math.abs(fixture.target[axis] - wall) < EPS, id);
      for (const other of [0, 1, 2].filter((a) => a !== axis))
        assert.ok(
          Math.abs(fixture.target[other] - fixture.position[other]) < EPS,
          id,
        );
      assert.ok(fixture.angle > 1 && fixture.angle < Math.PI / 2, id);
      assert.ok(fixture.penumbra >= 0.25 && fixture.penumbra <= 1, id);
    }
  });

  it("hides each backlight's hotspot behind the middle of its panel", () => {
    const tv = LIGHT_FIXTURES.tv.position;
    assert.ok(Math.abs(tv[1] - TV_PANEL.center[1]) < 0.05, `tv y ${tv[1]}`);
    const setup = LIGHT_FIXTURES.setup.position;
    assert.ok(
      Math.abs(setup[1] - MAIN_MONITOR.center[1]) < 0.05,
      `setup y ${setup[1]}`,
    );
    // Far enough from the wall for a broad wash rather than a pinpoint.
    assert.ok(tv[2] - MAIN_ROOM.z0 >= 0.14, "tv off the wall");
    assert.ok(setup[0] - MAIN_ROOM.x0 >= 0.2, "setup off the wall");
  });

  it("puts the TV backlight between the TV and the back wall", () => {
    const [x, y, z] = LIGHT_FIXTURES.tv.position;
    assert.ok(z < TV_PANEL.panelBack && z > MAIN_ROOM.z0, `z ${z}`);
    assert.ok(Math.abs(x - TV_PANEL.center[0]) < 0.1);
    assert.ok(Math.abs(y - TV_PANEL.center[1]) < TV_PANEL.height / 2);
  });

  it("puts the setup backlight between the monitor and the left wall", () => {
    const [x, y, z] = LIGHT_FIXTURES.setup.position;
    assert.ok(x > MAIN_ROOM.x0 && x < MAIN_MONITOR.back, `x ${x}`);
    assert.ok(Math.abs(z - MAIN_MONITOR.center[2]) < 0.1);
    assert.ok(Math.abs(y - MAIN_MONITOR.center[1]) < MAIN_MONITOR.size[1] / 2);
  });

  it("stands both lamps on the shelf, clear of every other setup item", () => {
    const meshes = setupMeshes();
    const others = [
      ...meshes.solid,
      ...meshes.glow,
      ...meshes.glass,
      ...meshes.hull,
    ]
      .filter((part) => part.item !== "shelf")
      .map(partBounds);
    const { center, radius, height } = SETUP_PROPS.mug;
    others.push({
      x0: center[0] - radius,
      x1: center[0] + radius,
      y0: center[1],
      // Steam rises above the mug.
      y1: center[1] + height + 0.3,
      z0: center[2] - radius,
      z1: center[2] + radius,
    });
    for (const id of ["lampLeft", "lampRight"] as const) {
      const parts = lampParts(id);
      assert.ok(parts.length >= 6, `${id} is a detailed model`);
      const bounds = parts.map(partBounds);
      const shade = LAMP.shade;
      const base = LIGHT_FIXTURES[id].base;
      const head = base[0] + LAMP.head.dx;
      bounds.push({
        x0: head - shade.bottom,
        x1: head + shade.bottom,
        y0: base[1] + shade.y0,
        y1: base[1] + shade.y1,
        z0: base[2] - shade.bottom,
        z1: base[2] + shade.bottom,
      });
      const lowest = Math.min(...bounds.map((b) => b.y0));
      assert.ok(Math.abs(lowest - SHELF.top) < EPS, `${id} sits on the shelf`);
      for (const b of bounds) {
        assert.ok(b.z0 >= SHELF.z0 - EPS && b.z1 <= SHELF.z1 + EPS, id);
        for (const o of others) {
          const overlap =
            b.x0 < o.x1 &&
            b.x1 > o.x0 &&
            b.y0 < o.y1 &&
            b.y1 > o.y0 &&
            b.z0 < o.z1 &&
            b.z1 > o.z0;
          assert.ok(!overlap, `${id} collides with a setup item`);
        }
      }
      const [, by] = LIGHT_FIXTURES[id].position;
      assert.ok(
        by > base[1] + shade.y0 && by < base[1] + shade.y1,
        `${id} bulb under the shade`,
      );
    }
    // Seated at the desk you face the wall (-x): your left is +z.
    assert.ok(
      LIGHT_FIXTURES.lampLeft.base[2] > LIGHT_FIXTURES.lampRight.base[2],
    );
  });
});
