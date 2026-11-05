import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOUSE } from "../../src/lib/world/house.ts";
import {
  LIVING_MODELS,
  livingMeshes,
  modelBounds,
} from "../../src/lib/world/living.ts";
import {
  MAIN_ROOM,
  partBounds,
  SETUP_ZONE,
} from "../../src/lib/world/setup.ts";
import {
  SOFA_LAMP,
  SOFA_LAMPS,
  sofaLampBulbPosition,
  sofaLampLevel,
  sofaLampStoredEnabled,
} from "../../src/lib/world/sofa-lamps.ts";

const sofaModel = LIVING_MODELS.find((model) => model.kind === "sofa");
assert.ok(sofaModel);
const sofa = modelBounds(sofaModel);
const sofaCenterX = (sofa.x0 + sofa.x1) / 2;
/** Widest horizontal reach of a lamp around its pole. */
const reach = Math.max(SOFA_LAMP.base.radius, SOFA_LAMP.shade.bottom);
const footprint = ([x, , z]: readonly number[]) => ({
  x0: x - reach,
  x1: x + reach,
  z0: z - reach,
  z1: z + reach,
});
const apart = (
  a: { x0: number; x1: number; z0: number; z1: number },
  b: { x0: number; x1: number; z0: number; z1: number },
) => a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1;

const left = SOFA_LAMPS.find((lamp) => lamp.id === "left");
const right = SOFA_LAMPS.find((lamp) => lamp.id === "right");
assert.ok(left && right);

describe("sofa lamp placement", () => {
  it("flanks the sofa with two lamps, one past each arm", () => {
    assert.equal(SOFA_LAMPS.length, 2);
    assert.ok(left.base[0] < sofa.x0, "left lamp is past the left arm");
    assert.ok(right.base[0] > sofa.x1, "right lamp is past the right arm");
    for (const lamp of SOFA_LAMPS) {
      const gap = Math.min(
        Math.abs(lamp.base[0] - sofa.x0),
        Math.abs(lamp.base[0] - sofa.x1),
      );
      assert.ok(gap < 0.3, `${lamp.id} lamp stays beside the sofa`);
      assert.ok(lamp.base[2] > sofa.z0 && lamp.base[2] < sofa.z1);
    }
  });

  it("is symmetric about the sofa's centre line", () => {
    assert.ok(
      Math.abs(sofaCenterX - left.base[0] - (right.base[0] - sofaCenterX)) <
        1e-9,
    );
    assert.equal(left.base[2], right.base[2]);
  });

  it("stands on the floor, under the eave", () => {
    const eave = HOUSE.floorY + HOUSE.main.height;
    for (const lamp of SOFA_LAMPS) {
      assert.equal(lamp.base[1], sofa.y0, "base on the floor boards");
      const top = lamp.base[1] + SOFA_LAMP.shadeY + SOFA_LAMP.shade.height / 2;
      assert.ok(top < eave - 0.1, `${lamp.id} shade top ${top} below ${eave}`);
      assert.ok(top > sofa.y1, "shade rises above the sofa back");
    }
  });

  it("keeps clear of the sofa, the walls and the setup corridor", () => {
    for (const lamp of SOFA_LAMPS) {
      const box = footprint(lamp.base);
      assert.ok(apart(box, sofa), `${lamp.id} lamp clears the sofa`);
      assert.ok(box.x0 > MAIN_ROOM.x0 && box.x1 < MAIN_ROOM.x1);
      assert.ok(box.z0 > MAIN_ROOM.z0 && box.z1 < MAIN_ROOM.z1);
      assert.ok(box.x0 - SETUP_ZONE.x1 >= 0.6, "corridor stays 0.6 m wide");
    }
  });

  it("does not overlap the other living-room pieces", () => {
    const meshes = livingMeshes();
    const others = [
      ...[...meshes.solid, ...meshes.glow].map((part) => partBounds(part)),
      ...LIVING_MODELS.filter((model) => model.kind !== "rug").map(modelBounds),
    ];
    for (const lamp of SOFA_LAMPS) {
      const box = footprint(lamp.base);
      for (const other of others)
        assert.ok(apart(box, other), `${lamp.id} lamp clears a living piece`);
    }
  });

  it("puts the bulb inside the shade", () => {
    const { shadeY, shade, bulbY, poleHeight } = SOFA_LAMP;
    assert.ok(bulbY > shadeY - shade.height / 2);
    assert.ok(bulbY < shadeY + shade.height / 2);
    assert.ok(poleHeight > shadeY - shade.height / 2, "pole reaches the shade");
    for (const lamp of SOFA_LAMPS) {
      const [bx, by, bz] = sofaLampBulbPosition(lamp);
      assert.equal(bx, lamp.base[0]);
      assert.equal(bz, lamp.base[2]);
      assert.equal(by, lamp.base[1] + bulbY);
    }
  });
});

describe("sofa lamp look", () => {
  it("has white shades that match the pale sofa", () => {
    for (const hex of [SOFA_LAMP.colors.shade, SOFA_LAMP.colors.shadeInner]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.ok(Math.min(r, g, b) >= 0xe0, `${hex} reads as white`);
    }
  });
});

describe("sofa lamp switch and light", () => {
  it("starts off so the TV keeps priority at night", () => {
    assert.equal(SOFA_LAMP.defaultEnabled, false);
    assert.equal(sofaLampStoredEnabled(null), false);
    assert.equal(sofaLampStoredEnabled("true"), true);
    assert.equal(sofaLampStoredEnabled("false"), false);
  });

  it("saves each lamp's switch under its own key", () => {
    const keys = SOFA_LAMPS.map((lamp) => lamp.storageKey);
    assert.deepEqual(keys, ["world:sofa-lamp-left", "world:sofa-lamp-right"]);
  });

  it("stays in the scene's fixture range instead of blowing out", () => {
    assert.ok(SOFA_LAMP.pointIntensity <= 1.5);
    assert.ok(SOFA_LAMP.pointDistance <= 3);
    assert.ok(SOFA_LAMP.shadeEmissive <= 0.5);
    assert.ok(SOFA_LAMP.bulbEmissive <= 0.8);
    assert.equal(SOFA_LAMP.lightDecay, 2);
  });

  it("is full at night once switched on, completely off by day", () => {
    for (const h of [18, 21, 0, 3, 5.99])
      assert.equal(sofaLampLevel(true, h), 1, `on at ${h}h`);
    assert.equal(SOFA_LAMP.dayLevel, 0);
    for (const h of [6, 9, 12, 15, 17.99])
      assert.equal(sofaLampLevel(true, h), 0, `off at ${h}h`);
  });

  it("is dark when switched off or with the power off", () => {
    assert.equal(sofaLampLevel(false, 21), 0);
    assert.equal(sofaLampLevel(true, 21, false), 0);
    assert.equal(sofaLampLevel(false, 12, false), 0);
  });
});
