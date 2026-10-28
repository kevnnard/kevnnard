import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayCycle, type RGB } from "../../src/lib/room/day-cycle.ts";
import { HOUSE } from "../../src/lib/world/house.ts";
import { ISLAND, islandOutline } from "../../src/lib/world/island.ts";
import { KIND_SPECS } from "../../src/lib/world/layout.ts";
import {
  chairShade,
  cloudShade,
  environmentIntensity,
  KEY_DISTANCE_SCALE,
  PALETTE,
  WORLD_SHADOW,
  worldLight,
} from "../../src/lib/world/palette.ts";

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

  it("keeps clouds warm white by day and tinted, never brighter, at night", () => {
    const noon = cloudShade(worldLight(13));
    assert.ok(Math.min(...noon.color) >= 0.85, `${noon.color}`);
    assert.ok(noon.emissiveIntensity > 0.2);
    const night = cloudShade(worldLight(23));
    assert.ok(luminance(night.color) < luminance(noon.color));
    assert.ok(night.emissiveIntensity < noon.emissiveIntensity);
  });
});

// S18: night reads as moonlit night, the sun casts clear shadows, and the
// change is world-only and smooth (the fixtures' 18:00 gate is separate).
describe("world light balance (S18)", () => {
  const fill = (hour: number) =>
    worldLight(hour).ambient.intensity + environmentIntensity(hour);
  const minutes = Array.from({ length: 24 * 60 + 1 }, (_, m) => m / 60);

  it("gives the noon sun a strong key-to-fill ratio for visible shadows", () => {
    const noon = worldLight(13);
    assert.equal(noon.key.source, "sun");
    // S21: a softer sun than S18 (x1.3), still above the shared cycle.
    const scale = noon.key.intensity / dayCycle(13).key.intensity;
    assert.ok(scale >= 1.05 && scale <= 1.15, `${scale}`);
    assert.ok(noon.key.intensity / fill(13) >= 3.5, `${noon.key.intensity}`);
    // Lit faces stay near the previous total, so colors do not wash out.
    assert.ok(noon.key.intensity + fill(13) <= 3.6);
  });

  it("keeps the noon sun warm-neutral, not orange", () => {
    const [r, g, b] = worldLight(13).key.color;
    assert.ok(r >= g && g >= b, "warm");
    assert.ok(b >= 0.7, `neutral enough: ${b}`);
  });

  it("darkens the night fill and keeps a cool, directional moon", () => {
    for (const hour of [0, 21, 23, 3]) {
      const light = worldLight(hour);
      assert.equal(light.key.source, "moon");
      assert.ok(light.ambient.intensity <= 0.12, `${hour} ambient`);
      assert.ok(environmentIntensity(hour) <= 0.05, `${hour} env`);
      assert.ok(light.key.intensity / fill(hour) >= 2.5, `${hour} ratio`);
      const [r, , b] = light.key.color;
      assert.ok(b - r >= 0.35, `${hour} moon is blue, not white`);
      assert.equal(light.night, 1);
    }
  });

  it("brightens the moon key modestly over the shared cycle (S21)", () => {
    for (const hour of [0, 21, 23, 3]) {
      const scale =
        worldLight(hour).key.intensity / dayCycle(hour).key.intensity;
      assert.ok(scale > 0.9 && scale <= 1.05, `${hour}: ${scale}`);
    }
  });

  it("is already dim at 19:19, after sunset", () => {
    const hour = 19 + 19 / 60;
    assert.ok(fill(hour) <= 0.25, `${fill(hour)}`);
    assert.ok(worldLight(hour).night > 0.95);
  });

  it("dims the shadowless twilight fill around 18:00", () => {
    assert.ok(fill(18) <= 0.45, `${fill(18)}`);
    assert.ok(fill(18) < fill(13));
  });

  it("changes smoothly minute by minute, without an 18:00 jump", () => {
    for (let i = 1; i < minutes.length; i++) {
      const [a, b] = [worldLight(minutes[i - 1]), worldLight(minutes[i])];
      const at = minutes[i];
      assert.ok(
        Math.abs(a.ambient.intensity - b.ambient.intensity) < 0.01,
        `${at}`,
      );
      assert.ok(
        Math.abs(
          environmentIntensity(minutes[i - 1]) - environmentIntensity(at),
        ) < 0.01,
        `${at}`,
      );
      assert.ok(Math.abs(a.key.intensity - b.key.intensity) < 0.06, `${at}`);
      assert.ok(Math.abs(a.night - b.night) < 0.03, `${at}`);
      for (let c = 0; c < 3; c++)
        assert.ok(Math.abs(a.key.color[c] - b.key.color[c]) < 0.05, `${at}`);
    }
  });

  it("dims Bruno's unlit chair bake at night instead of brightening it", () => {
    assert.ok(chairShade(23) < chairShade(13));
    assert.ok(chairShade(23) <= 0.6 && chairShade(13) <= 0.8);
    for (let i = 1; i < minutes.length; i++)
      assert.ok(
        Math.abs(chairShade(minutes[i]) - chairShade(minutes[i - 1])) < 0.01,
      );
  });
});

describe("world shadow map (S18)", () => {
  it("keeps one 2048 map with a tighter, crisper fit around the island", () => {
    assert.equal(WORLD_SHADOW.mapSize, 2048);
    assert.ok(WORLD_SHADOW.extent < 9, "tighter than before");
    assert.ok(WORLD_SHADOW.radius <= 2.5, "less blur");
    assert.ok(WORLD_SHADOW.normalBias <= 0.02, "contact shadows stay attached");
    assert.ok(WORLD_SHADOW.bias < 0 && WORLD_SHADOW.bias > -0.001);
  });

  it("covers every island rim point up to the tallest caster from any sun", () => {
    // The ortho camera looks at the origin: any point closer to the origin
    // than the extent is inside it, whatever the light direction.
    for (const [x, z] of islandOutline(144))
      for (const y of [-ISLAND.grassThickness, WORLD_SHADOW.casterTop])
        assert.ok(Math.hypot(x, y, z) <= WORLD_SHADOW.extent, `${x},${y},${z}`);
    const roof = HOUSE.floorY + HOUSE.main.height + HOUSE.main.rise;
    assert.ok(WORLD_SHADOW.casterTop >= roof + 0.2);
    assert.ok(WORLD_SHADOW.casterTop >= KIND_SPECS.tree.height * 1.2);
  });

  it("spans the key light's whole path in depth", () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const [x, y, z] = worldLight(hour).key.position;
      const distance = Math.hypot(x, y, z) * KEY_DISTANCE_SCALE;
      assert.ok(WORLD_SHADOW.near < distance - WORLD_SHADOW.extent, `${hour}`);
      assert.ok(WORLD_SHADOW.far > distance + WORLD_SHADOW.extent, `${hour}`);
    }
  });
});
