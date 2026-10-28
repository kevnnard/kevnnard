import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LIGHTS,
  LAMP,
  LIGHT_FIXTURES,
  LIGHT_IDS,
  lampParts,
  lightLevel,
  nightLightsOn,
  updateLight,
} from "../../src/lib/world/lights.ts";
import { TV_PANEL } from "../../src/lib/world/living.ts";
import {
  DESK_TOP,
  MAIN_MONITOR,
  MAIN_ROOM,
  partBounds,
  SETUP_PROPS,
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

describe("night light fixtures", () => {
  it("keeps a modest budget of finite, non-shadow point lights", () => {
    assert.deepEqual(Object.keys(LIGHT_FIXTURES).sort(), [...LIGHT_IDS].sort());
    for (const id of LIGHT_IDS) {
      const fixture = LIGHT_FIXTURES[id];
      assert.equal(fixture.castShadow, false, id);
      assert.ok(fixture.distance > 0 && fixture.distance <= 2, id);
      assert.equal(fixture.decay, 2, id);
      assert.ok(fixture.intensity > 0 && fixture.intensity < 1, id);
    }
  });

  it("puts the TV backlight between the TV and the back wall", () => {
    const [x, y, z] = LIGHT_FIXTURES.tv.position;
    assert.ok(z < TV_PANEL.panelBack && z > MAIN_ROOM.z0, `z ${z}`);
    assert.ok(Math.abs(x - TV_PANEL.center[0]) < 0.1);
    assert.ok(Math.abs(y - TV_PANEL.center[1]) < TV_PANEL.height / 2);
  });

  it("puts the setup backlight between the monitor and the left wall", () => {
    const [x, y, z] = LIGHT_FIXTURES.setup.position;
    const back = MAIN_MONITOR.center[0] - MAIN_MONITOR.size[0] / 2;
    assert.ok(x > MAIN_ROOM.x0 && x < back, `x ${x}`);
    assert.ok(Math.abs(z - MAIN_MONITOR.center[2]) < 0.1);
    assert.ok(Math.abs(y - MAIN_MONITOR.center[1]) < MAIN_MONITOR.size[1] / 2);
  });

  it("stands both lamps on the desk ends, clear of every other desk item", () => {
    const meshes = setupMeshes();
    const others = [
      ...meshes.solid,
      ...meshes.glow,
      ...meshes.glass,
      ...meshes.hull,
    ]
      .map(partBounds)
      .filter((b) => b.y1 > DESK_TOP.y + EPS);
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
      assert.ok(parts.length >= 5, `${id} is a detailed model`);
      const bounds = parts.map(partBounds);
      const shade = LAMP.shade;
      const base = LIGHT_FIXTURES[id].base;
      bounds.push({
        x0: base[0] - shade.bottom,
        x1: base[0] + shade.bottom,
        y0: base[1] + shade.y0,
        y1: base[1] + shade.y1,
        z0: base[2] - shade.bottom,
        z1: base[2] + shade.bottom,
      });
      const lowest = Math.min(...bounds.map((b) => b.y0));
      assert.ok(Math.abs(lowest - DESK_TOP.y) < EPS, `${id} sits on the desk`);
      for (const b of bounds) {
        assert.ok(b.x0 >= DESK_TOP.x0 - EPS && b.x1 <= DESK_TOP.x1 + EPS, id);
        assert.ok(b.z0 >= DESK_TOP.z0 - EPS && b.z1 <= DESK_TOP.z1 + EPS, id);
        for (const o of others) {
          const overlap =
            b.x0 < o.x1 &&
            b.x1 > o.x0 &&
            b.y0 < o.y1 &&
            b.y1 > o.y0 &&
            b.z0 < o.z1 &&
            b.z1 > o.z0;
          assert.ok(!overlap, `${id} collides with a desk item`);
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
