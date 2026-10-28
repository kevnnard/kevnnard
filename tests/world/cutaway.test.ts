import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { poseToPosition } from "../../src/lib/world/camera.ts";
import { CUTAWAY, cutaway } from "../../src/lib/world/cutaway.ts";
import {
  HOUSE_FOCUS,
  HOUSE_GROUPS,
  type HouseGroup,
  WALLS,
} from "../../src/lib/world/house.ts";

const at = (azimuth: number, distance: number, polar = 1.1) =>
  cutaway(poseToPosition({ azimuth, polar, distance }));

const ROOFS: HouseGroup[] = ["main-roof", "garage-roof"];

describe("zoom-driven house cutaway (T4c, S7)", () => {
  it("keeps the whole house intact from far away, all around", () => {
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8)
      for (const group of HOUSE_GROUPS) assert.equal(at(a, 25)[group], 0);
  });

  it("dissolves both roofs when zoomed close", () => {
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 8) {
      const fades = at(a, CUTAWAY.roof.gone - 1);
      for (const roof of ROOFS) assert.equal(fades[roof], 1, roof);
    }
    const halfway = at(1, (CUTAWAY.roof.start + CUTAWAY.roof.gone) / 2);
    assert.ok(halfway["main-roof"] > 0 && halfway["main-roof"] < 1);
  });

  it("fades only the walls that face the camera, in every quadrant", () => {
    const quadrants: [number, string[]][] = [
      [0, ["main-front", "garage-front"]],
      [Math.PI / 2, ["main-right"]],
      [Math.PI, ["main-back", "garage-back"]],
      [-Math.PI / 2, ["main-left", "garage-left"]],
    ];
    for (const [azimuth, facing] of quadrants) {
      const fades = at(azimuth, 5, 1.2);
      for (const wall of WALLS)
        if (facing.includes(wall.id))
          assert.ok(fades[wall.group] > 0.9, `${wall.id} at ${azimuth}`);
        else assert.equal(fades[wall.group], 0, `${wall.id} at ${azimuth}`);
    }
  });

  it("is continuous across azimuth 0 and 2π", () => {
    const a = at(1e-4, 6);
    const b = at(2 * Math.PI - 1e-4, 6);
    for (const group of HOUSE_GROUPS)
      assert.ok(Math.abs(a[group] - b[group]) < 1e-2, group);
  });

  it("never fades the floor, plinths, porch and posts", () => {
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 6)
      for (const distance of [4, 6, 10, 40])
        assert.equal(at(a, distance, 0.4).base, 0);
  });

  it("returns fades in 0..1 and rejects non-finite cameras", () => {
    for (const fade of Object.values(at(0.7, 4, 0.35)))
      assert.ok(fade >= 0 && fade <= 1);
    assert.throws(() => cutaway([Number.NaN, 0, 0]), RangeError);
    assert.deepEqual(cutaway(HOUSE_FOCUS).base, 0);
  });
});
