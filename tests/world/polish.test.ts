import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bayer8,
  castsShadow,
  DITHER_GLSL,
} from "../../src/lib/world/cutaway.ts";
import { environmentIntensity } from "../../src/lib/world/palette.ts";
import { roundedBox } from "../../src/lib/world/rounded.ts";
import {
  SETUP_MATERIALS,
  SETUP_ROUND_SEGMENTS,
  setupMeshes,
  setupOcclusion,
} from "../../src/lib/world/setup.ts";
import { TEXTURE_URLS, TEXTURES } from "../../src/lib/world/textures.ts";

const EPS = 1e-6;

describe("setup and house polish (T4h, S12)", () => {
  it("builds a rounded box that fills its size with unit normals", () => {
    const size = [0.5, 0.1, 0.3] as const;
    const box = roundedBox(size, 0.03, 2);
    const count = box.position.length / 3;
    assert.equal(box.normal.length, box.position.length);
    assert.ok(box.index.length % 3 === 0 && count < 300, `${count} vertices`);
    for (let axis = 0; axis < 3; axis++) {
      const values = box.position.filter((_, i) => i % 3 === axis);
      assert.ok(Math.abs(Math.max(...values) - size[axis] / 2) < EPS);
      assert.ok(Math.abs(Math.min(...values) + size[axis] / 2) < EPS);
    }
    for (let i = 0; i < count; i++) {
      const [x, y, z] = box.normal.slice(i * 3, i * 3 + 3);
      assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-5);
    }
    // The corner is cut: no vertex sits on the sharp box corner.
    for (let i = 0; i < count; i++) {
      const [x, y, z] = box.position.slice(i * 3, i * 3 + 3);
      assert.ok(
        !(
          Math.abs(Math.abs(x) - 0.25) < EPS &&
          Math.abs(Math.abs(y) - 0.05) < EPS &&
          Math.abs(Math.abs(z) - 0.15) < EPS
        ),
      );
    }
    // Radius is clamped to half the thinnest side.
    const thin = roundedBox([0.2, 0.02, 0.2], 0.5, 2);
    const ys = thin.position.filter((_, i) => i % 3 === 1);
    assert.ok(Math.abs(Math.max(...ys) - 0.01) < EPS);
  });

  it("rounds the desk top, bezels, speakers, PC case, desk gadgets and keycaps", () => {
    const { solid } = setupMeshes();
    const rounded = solid.filter((part) => part.shape === "rounded");
    // The leather seat gave way to Bruno Simon's top chair (T4k).
    for (const id of ["laminate", "satin", "panel", "keycap"] as const)
      assert.ok(
        rounded.some((part) => part.material === id),
        `${id} rounded`,
      );
    assert.ok(rounded.length >= 20, `${rounded.length} rounded parts`);
    for (const part of rounded) assert.ok((part.radius ?? 0) > 0);
    assert.ok(SETUP_ROUND_SEGMENTS >= 16, "smooth round parts");
  });

  it("darkens setup vertices near the floor and on undersides", () => {
    const up: [number, number, number] = [0, 1, 0];
    const high = setupOcclusion([0, 2, 0], up);
    const low = setupOcclusion([0, -10, 0], up);
    assert.equal(high, 1);
    assert.ok(low < high && low >= 0.5);
    assert.ok(setupOcclusion([0, 2, 0], [0, -1, 0]) < high, "underside");
  });

  it("stops casting shadows as soon as a group fades, until it is whole", () => {
    assert.equal(castsShadow(0, true), true);
    assert.equal(castsShadow(0.03, true), false);
    assert.equal(castsShadow(0.01, false), false, "hysteresis");
    assert.equal(castsShadow(0, false), true);
  });

  it("dithers with a finer 8x8 Bayer pattern", () => {
    const levels = new Set<number>();
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 8; y++) levels.add(bayer8(x, y));
    assert.equal(levels.size, 64);
    for (const level of levels) assert.ok(level >= 0 && level < 1);
    assert.match(DITHER_GLSL, /cutawayBayer8/);
  });

  it("dims the environment reflections at night", () => {
    assert.ok(Math.abs(environmentIntensity(12) - 0.22) < 0.03);
    assert.ok(Math.abs(environmentIntensity(0) - 0.1) < 0.03);
  });

  it("tunes texture scale and contrast, and boards the floor", () => {
    assert.equal(TEXTURES.planks.tile, 2.4);
    assert.equal(TEXTURES.planks.strength, 0.45);
    assert.equal(TEXTURES.leather.strength, 0.35);
    assert.equal(SETUP_MATERIALS.powder.metalness, 0.35);
    assert.equal(TEXTURES.floor.name, TEXTURES.planks.name);
    assert.equal(TEXTURES.floor.strength, 0.4);
    assert.deepEqual(TEXTURES.floor.mean, TEXTURES.planks.mean);
    // About ten boards per repeat at the 0.28 m floor board width.
    assert.ok(Math.abs(TEXTURES.floor.tile - 2.8) < EPS);
    assert.equal(new Set(TEXTURE_URLS).size, TEXTURE_URLS.length, "no reloads");
  });
});
