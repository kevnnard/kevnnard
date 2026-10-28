import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayCycle, type RGB } from "../../src/lib/room/day-cycle.ts";
import { PALETTE, worldLight } from "../../src/lib/world/palette.ts";

const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const inRange = (color: RGB) => color.every((c) => c >= 0 && c <= 1);

describe("worldLight", () => {
  it("follows the shared day cycle: same phase and key light source", () => {
    for (const hour of [0, 6, 13, 17.5, 23]) {
      const light = worldLight(hour);
      const cycle = dayCycle(hour);
      assert.equal(light.phase, cycle.phase);
      assert.equal(light.key.source, cycle.key.source);
      assert.deepEqual(light.key.position, cycle.key.position);
    }
  });

  it("softens the daytime sky toward pastel, lighter than the room's sky", () => {
    const light = worldLight(13);
    const cycle = dayCycle(13);
    assert.ok(luminance(light.sky.horizon) > luminance(cycle.sky.horizon));
    assert.ok(luminance(light.sky.zenith) > luminance(cycle.sky.zenith));
  });

  it("keeps the night dark and shifts colors through the hours", () => {
    assert.ok(luminance(worldLight(23).sky.zenith) < 0.15);
    const noon = worldLight(13).sky.horizon;
    const dusk = worldLight(17.5).sky.horizon;
    assert.notDeepEqual(noon, dusk);
    assert.ok(dusk[0] > dusk[2], "warm sunset horizon");
  });

  it("returns channels in [0, 1] for every quarter hour", () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const light = worldLight(hour);
      for (const color of [
        light.sky.zenith,
        light.sky.horizon,
        light.sky.ground,
        light.key.color,
        light.ambient.sky,
        light.ambient.ground,
        light.fog,
      ])
        assert.ok(inRange(color), `${hour}: ${color}`);
    }
  });

  it("defines an owned pastel palette as hex colors", () => {
    for (const value of Object.values(PALETTE))
      assert.match(value, /^#[0-9a-f]{6}$/);
  });
});
