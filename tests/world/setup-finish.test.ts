import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Color, SRGBColorSpace } from "three";
import {
  type Credits,
  creditProblems,
  type OriginalCredit,
} from "../../src/lib/world/credits.ts";
import { HOUSE } from "../../src/lib/world/house.ts";
import {
  DEFAULT_LIGHTS,
  glowPower,
  INTERIOR_FIXTURES,
  LAMP,
  LIGHT_FIXTURES,
  LIGHT_IDS,
  LIGHT_INFO,
  LIGHTBAR_FIXTURE,
  lampParts,
  lightLevel,
  sideLight,
  updateLight,
} from "../../src/lib/world/lights.ts";
import { BOUNCE, LOGO } from "../../src/lib/world/motion.ts";
import {
  NORMAL_PATTERNS,
  woodGrainPixels,
} from "../../src/lib/world/normals.ts";
import {
  COASTER,
  DESK_TOP,
  HEADPHONES,
  KEY_ROWS,
  KEYBOARD,
  LIGHTBAR,
  MAIN_MONITOR,
  MAIN_ROOM,
  MAT,
  MONITOR_ARMS,
  MOUSE,
  MOUSE_SOURCE,
  mainCurve,
  partBounds,
  SETUP_COLORS,
  SETUP_MATERIALS,
  SETUP_PROPS,
  type SetupItem,
  type SetupPart,
  SHELF,
  SIDE_MONITOR,
  setupMeshes,
  TABLETOP_ITEMS,
} from "../../src/lib/world/setup.ts";
import { PUBLIC } from "./glb.ts";

// T12 (S24-S25): the setup finished as one unit. Seated at the desk you face
// the left wall (-x), so your right is -z.

const EPS = 1e-6;
const meshes = setupMeshes();
const all = [...meshes.solid, ...meshes.glow, ...meshes.glass];
const item = (id: SetupItem) => all.filter((part) => part.item === id);
const box = (parts: SetupPart[]) => {
  const b = parts.map(partBounds);
  return {
    x0: Math.min(...b.map((v) => v.x0)),
    x1: Math.max(...b.map((v) => v.x1)),
    y0: Math.min(...b.map((v) => v.y0)),
    y1: Math.max(...b.map((v) => v.y1)),
    z0: Math.min(...b.map((v) => v.z0)),
    z1: Math.max(...b.map((v) => v.z1)),
  };
};
type Box = ReturnType<typeof box>;
/** Smallest gap between two boxes (0 when they touch or overlap). */
const gap = (a: Box, b: Box) =>
  Math.hypot(
    Math.max(0, a.x0 - b.x1, b.x0 - a.x1),
    Math.max(0, a.y0 - b.y1, b.y0 - a.y1),
    Math.max(0, a.z0 - b.z1, b.z0 - a.z1),
  );
/** Every part of `a` against every part of `b`. */
const minGap = (a: SetupPart[], b: SetupPart[]) =>
  Math.min(
    ...a.flatMap((p) => b.map((q) => gap(partBounds(p), partBounds(q)))),
  );
const hue = (hex: string) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(hsl, SRGBColorSpace);
  return hsl;
};
const at = (h: number, m: number) => h + m / 60;
const night = at(22, 0);
const day = at(12, 0);

describe("T12 mouse on the right (S24)", () => {
  it("puts the mouse right of the keyboard (-z), on the mat", () => {
    const keyboard = box(item("keyboard"));
    const mouse = box(item("mouse"));
    assert.ok(mouse.z1 < keyboard.z0 - 0.15, "right of the keyboard");
    assert.ok(MOUSE.center[2] < KEYBOARD.center[2]);
    const mat = box(item("mat"));
    assert.ok(mouse.z0 >= mat.z0 && mouse.z1 <= mat.z1, "on the mat");
    assert.ok(mouse.x0 >= mat.x0 && mouse.x1 <= mat.x1);
    assert.ok(Math.abs(mouse.y0 - mat.y1) < EPS, "rests on the mat");
  });

  it("models an original curved mouse: the owner's desk GLB has no separable mouse", () => {
    const buffer = readFileSync(
      new URL("../models/room/desk.glb", PUBLIC.href),
    );
    const json = JSON.parse(
      buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
    );
    assert.equal(json.nodes.length, 1, "one baked node");
    assert.equal(json.meshes.length, 1, "one mesh");
    const names = [
      ...json.nodes.map((n: { name?: string }) => n.name ?? ""),
      ...json.meshes.map((n: { name?: string }) => n.name ?? ""),
      ...json.materials.map((n: { name?: string }) => n.name ?? ""),
    ];
    assert.ok(!names.some((name) => /mouse|rat[oó]n/i.test(name)), "no mouse");
    assert.equal(MOUSE_SOURCE.reused, false);
    const mouse = item("mouse");
    assert.ok(
      mouse.some((part) => part.shape === "prism"),
      "curved shell",
    );
    assert.ok(mouse.length >= 5, "shell, two buttons, wheel, grips");
    const wheel = mouse.filter(
      (part) => part.shape === "round" && part.rotation?.[0] === Math.PI / 2,
    );
    assert.equal(wheel.length, 1, "one scroll wheel turning along z");
  });
});

describe("T12 NuPhy-style wireless low-profile 75% keyboard (S24)", () => {
  it("lays out 84 keys in six 16-unit rows with a right navigation column", () => {
    assert.equal(KEY_ROWS.length, 6);
    assert.equal(
      KEY_ROWS.reduce((n, row) => n + row.length, 0),
      84,
    );
    for (const row of KEY_ROWS)
      assert.ok(
        Math.abs(row.reduce((n, key) => n + key.units, 0) - 16) < EPS,
        "16 units",
      );
    const caps = item("keyboard").filter((part) => part.material === "keycap");
    assert.equal(caps.length, 84, "one cap per key");
    // The last unit of rows 1-5 is the navigation column (or the arrows).
    for (const row of KEY_ROWS.slice(1))
      assert.equal(row[row.length - 1].units, 1);
  });

  it("colour-blocks the black V2's caps: mint Esc, coral Enter, yellow space", () => {
    const caps = item("keyboard").filter((part) => part.material === "keycap");
    const esc = caps[0];
    const right = Math.min(...caps.map((p) => p.center[2]));
    assert.ok(esc.center[2] > right, "Esc at the left end");
    assert.equal(esc.color, SETUP_COLORS.keyEsc);
    assert.ok(caps.some((p) => p.color === SETUP_COLORS.keyEnter));
    const space = caps.reduce((a, b) => (a.size[2] > b.size[2] ? a : b));
    assert.equal(space.color, SETUP_COLORS.keySpace);
    assert.ok(space.size[2] > 6 * 0.019 - 0.01, "6.25u space");
    const h = (hex: string) => hue(hex).h * 360;
    assert.ok(h(SETUP_COLORS.keyEsc) > 140 && h(SETUP_COLORS.keyEsc) < 180);
    assert.ok(h(SETUP_COLORS.keyEnter) < 20 || h(SETUP_COLORS.keyEnter) > 340);
    assert.ok(h(SETUP_COLORS.keySpace) > 40 && h(SETUP_COLORS.keySpace) < 60);
    const tones = new Set(caps.map((p) => p.color));
    assert.ok(tones.size >= 5, "letters, modifiers and three accents");
    // Black colourway: a black case, near-black letters under grey mods.
    const l = (hex: string) => hue(hex).l;
    assert.ok(l(SETUP_COLORS.case) < 0.15, "black case");
    assert.ok(l(SETUP_COLORS.keyAlpha) < l(SETUP_COLORS.keyMod));
    assert.ok(l(SETUP_COLORS.keyMod) < 0.4);
  });

  it("is low profile, compact, rounded and has no cable", () => {
    const keyboard = box(item("keyboard"));
    assert.ok(keyboard.y1 - keyboard.y0 <= 0.03, "low profile");
    assert.ok(Math.abs(KEYBOARD.size[2] - 0.316) < 0.01, "75% width");
    assert.ok(Math.abs(KEYBOARD.size[0] - 0.133) < 0.01, "75% depth");
    const caseParts = item("keyboard").filter((p) => p.material !== "keycap");
    assert.ok(
      caseParts.some((p) => p.shape === "rounded"),
      "rounded case",
    );
    assert.ok(keyboard.x0 >= KEYBOARD.center[0] - KEYBOARD.size[0] / 2 - EPS);
    assert.ok(keyboard.x1 <= KEYBOARD.center[0] + KEYBOARD.size[0] / 2 + EPS);
    assert.equal(KEYBOARD.wireless, true);
    assert.ok(
      !all.some((p) => p.item === "keyboard" && p.color === SETUP_COLORS.cable),
    );
  });

  it("lights two slender side bars on the setup channel, off by day", () => {
    const side = meshes.glow.filter((p) => p.item === "keyboard");
    assert.equal(side.length, 2, "left and right side bars");
    for (const bar of side) {
      assert.equal(bar.channel, "setup");
      assert.equal(bar.led, undefined, "no breathing animation");
      assert.ok(Math.min(...bar.size) <= 0.004, "slender");
    }
    const z = side.map((p) => p.center[2]).sort((a, b) => a - b);
    assert.ok(z[0] < KEYBOARD.center[2] - KEYBOARD.size[2] / 2 + 0.005);
    assert.ok(z[1] > KEYBOARD.center[2] + KEYBOARD.size[2] / 2 - 0.005);
    const lit = sideLight(DEFAULT_LIGHTS, night, true);
    assert.ok(
      lit.level > 0 && lit.level === lightLevel(DEFAULT_LIGHTS.setup, night),
    );
    assert.equal(lit.color, DEFAULT_LIGHTS.setup.color, "the setup colour");
    assert.ok(lit.strength > 0 && lit.strength <= 0.6, "subtle");
    for (const [hours, power] of [
      [day, true],
      [at(17, 59), true],
      [at(6, 0), true],
      [night, false],
    ] as const)
      assert.equal(sideLight(DEFAULT_LIGHTS, hours, power).level, 0);
    assert.ok(sideLight(DEFAULT_LIGHTS, at(18, 0), true).level > 0);
    assert.ok(sideLight(DEFAULT_LIGHTS, at(5, 59), true).level > 0);
    const off = updateLight(DEFAULT_LIGHTS, "setup", { enabled: false });
    assert.equal(sideLight(off, night, true).level, 0);
  });
});

describe("T12 giant black mouse pad (S24)", () => {
  it("covers the desk front, black, under the keyboard and mouse", () => {
    const mat = box(item("mat"));
    assert.ok(MAT.size[2] >= 1.2 && MAT.size[0] >= 0.4, "oversized");
    assert.ok(hue(SETUP_COLORS.mat).l < 0.12, "black");
    assert.ok(mat.x0 >= DESK_TOP.x0 - EPS && mat.x1 <= DESK_TOP.x1 + EPS);
    assert.ok(mat.z0 >= DESK_TOP.z0 - EPS && mat.z1 <= DESK_TOP.z1 + EPS);
    assert.ok(Math.abs(mat.y0 - DESK_TOP.y) < EPS, "lies on the top");
    const keyboard = box(item("keyboard"));
    assert.ok(keyboard.z0 >= mat.z0 && keyboard.z1 <= mat.z1);
    assert.ok(keyboard.x0 >= mat.x0 && keyboard.x1 <= mat.x1);
    assert.ok(Math.abs(keyboard.y0 - mat.y1) < EPS, "keyboard on the mat");
    assert.ok(minGap(item("mouse"), item("keyboard")) >= 0.15, "mouse room");
    assert.equal(SETUP_MATERIALS[item("mat")[0].material].normal, "weave");
  });
});

describe("T12 copper-toned wooden desk top (S24)", () => {
  it("builds the top from copper wood planks with grain", () => {
    const top = item("desk").filter((p) => p.material === "wood");
    const planks = top.filter((p) => p.size[2] > 1 && p.size[0] < 0.3);
    assert.ok(planks.length >= 4, `${planks.length} planks`);
    for (const plank of planks) {
      const { h, s } = hue(plank.color);
      assert.ok(h * 360 > 12 && h * 360 < 35, "copper hue");
      assert.ok(s > 0.35, "warm, not grey");
      assert.ok(Math.abs(partBounds(plank).y1 - DESK_TOP.y) < EPS);
    }
    assert.ok(new Set(planks.map((p) => p.shade)).size >= 3, "board tones");
    const wood = SETUP_MATERIALS.wood;
    assert.equal(wood.metalness, 0, "wood, not metal");
    assert.equal(wood.normal, "grain");
    assert.equal(wood.grain, true, "grain colour map");
    assert.ok(NORMAL_PATTERNS.includes("grain"));
    const grain = woodGrainPixels();
    assert.equal(grain, woodGrainPixels(), "cached");
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < grain.length; i += 4) {
      lo = Math.min(lo, grain[i]);
      hi = Math.max(hi, grain[i]);
    }
    assert.ok(hi - lo >= 40, "visible streaks");
    assert.ok(!("laminate" in SETUP_MATERIALS), "no white laminate");
  });
});

describe("T12 monitors on arms (S24)", () => {
  it("curves the ultrawide: segments on one arc, screen conforming", () => {
    const panel = item("monitor").filter((p) => p.material === "satin");
    const { radius, halfAngle } = MAIN_MONITOR.curve;
    assert.ok(radius >= 1.5 && radius <= 2.3, "1800R-ish");
    const yaws = panel
      .filter((p) => p.curve !== undefined)
      .map((p) => p.rotation?.[1] ?? 0);
    assert.ok(yaws.length >= 10, `${yaws.length} bezel segments`);
    assert.ok(Math.max(...yaws) - Math.min(...yaws) > 1.5 * halfAngle);
    const sag = radius * (1 - Math.cos(halfAngle));
    assert.ok(sag >= 0.05, `visible curve (${sag})`);
    const screen = meshes.glow.filter((p) => p.item === "monitor");
    assert.ok(screen.length >= 10);
    for (const part of screen) {
      assert.ok(part.curve !== undefined, "on the arc");
      const at = mainCurve(part.curve ?? 0, 0.0255, part.center[1]);
      assert.ok(
        Math.hypot(at[0] - part.center[0], at[2] - part.center[2]) < 0.004,
      );
    }
    assert.ok(
      panel.some((p) => p.shape === "rounded" && (p.radius ?? 0) >= 0.008),
      "rounded corners",
    );
    // Concave toward the chair: the ends come forward.
    const ends = mainCurve(halfAngle, 0, 0);
    assert.ok(ends[0] > MAIN_MONITOR.center[0] + 0.05);
  });

  it("puts the secondary monitor in portrait on its own clamp arm", () => {
    assert.ok(SIDE_MONITOR.size[1] > SIDE_MONITOR.size[2] * 1.5, "portrait");
    assert.ok(SIDE_MONITOR.screen[1] > SIDE_MONITOR.screen[0] * 1.5);
    const { main, side } = MONITOR_ARMS;
    assert.ok(Math.abs(main.clamp[2] - side.clamp[2]) > 0.5, "two clamps");
    for (const arm of [main, side]) {
      assert.ok(Math.abs(arm.clamp[1] - DESK_TOP.y) < EPS, "on the top");
      assert.ok(arm.clamp[0] - DESK_TOP.x0 < 0.08, "at the back edge");
    }
    const arms = item("monitor-arm");
    assert.ok(arms.length >= 10, "clamps, poles, arms, joints, VESA plates");
    const vesa = arms.filter((p) => p.vesa);
    assert.equal(vesa.length, 2, "one VESA plate per monitor");
    const sideVesa = vesa.find(
      (p) => Math.abs(p.center[2] - side.vesa[2]) < 0.05,
    );
    assert.ok(sideVesa, "side plate");
    // Behind the panel along its own normal.
    const n = [Math.cos(SIDE_MONITOR.yaw), 0, -Math.sin(SIDE_MONITOR.yaw)];
    const back = sideVesa.center.reduce(
      (sum, v, i) => sum + (v - SIDE_MONITOR.center[i]) * n[i],
      0,
    );
    assert.ok(back < -SIDE_MONITOR.size[0] / 2, "behind the screen");
    // Nothing stands on the desk under the monitors but the clamps.
    const stands = all.filter(
      (p) =>
        (p.item === "monitor" || p.item === "portrait") &&
        partBounds(p).y0 < DESK_TOP.y + 0.05,
    );
    assert.equal(stands.length, 0, "no desk stands");
  });

  it("bounces the logo inside the portrait screen", () => {
    const { logo, screen } = SETUP_PROPS.sideScreen;
    assert.equal(logo.swap, true, "bounce x runs up the tall screen");
    const across = logo.scale * (BOUNCE.limits.y.max + LOGO.width / 2);
    const up = logo.scale * (BOUNCE.limits.x.max + LOGO.height / 2);
    assert.ok(across <= screen[0] / 2, `${across} across`);
    assert.ok(up <= screen[1] / 2, `${up} up`);
    assert.ok(
      -logo.scale * BOUNCE.limits.y.min + (logo.scale * LOGO.width) / 2 <=
        screen[0] / 2,
    );
    assert.deepEqual(screen, SIDE_MONITOR.screen);
  });
});

describe("T12 white monitor light bar (S24)", () => {
  it("rides the main monitor's top with a clamp and a shielded slit", () => {
    const bar = item("lightbar");
    assert.ok(bar.length >= 3, "housing, clamp, counterweight");
    const b = box(bar);
    const top = MAIN_MONITOR.center[1] + MAIN_MONITOR.size[1] / 2;
    assert.ok(Math.abs(b.y0 - top) < 0.03, "on the monitor top");
    assert.ok(Math.abs(LIGHTBAR.size[2] - 0.45) < 0.05, "about 45 cm");
    assert.ok(hue(SETUP_COLORS.lightbar).l > 0.85, "white housing");
    assert.ok(LIGHTBAR.slit.center[1] < LIGHTBAR.center[1], "slit underneath");
  });

  it("aims down onto the keyboard and mouse, softly, never up", () => {
    const f = LIGHTBAR_FIXTURE;
    assert.equal(f.kind, "spot");
    assert.equal(f.castShadow, false);
    assert.ok(f.intensity > 0 && f.intensity <= 0.5, "not overbright");
    assert.ok(f.distance > 0 && f.distance <= 1.5);
    const d = f.target.map((v, i) => v - f.position[i]);
    const len = Math.hypot(...d);
    assert.ok(d[1] / len < -0.85, "mostly down");
    assert.ok(Math.abs(f.target[1] - MAT.center[1] - MAT.size[1] / 2) < 0.01);
    for (const target of [KEYBOARD.center, MOUSE.center]) {
      const v = target.map((x, i) => x - f.position[i]);
      const cos =
        (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / Math.hypot(...v) / len;
      assert.ok(Math.acos(cos) < f.angle, "inside the cone");
    }
    // The cone's upper edge still points down: no ceiling or eye glare.
    assert.ok(Math.acos(-d[1] / len) + f.angle < Math.PI / 2);
    assert.equal(f.color, "#ffffff");
  });
});

describe("T12 shelf over the setup (S24)", () => {
  it("hangs on the wall on metal brackets, above the monitors", () => {
    const shelf = item("shelf");
    const board = shelf.filter((p) => p.material === "wood");
    const brackets = shelf.filter((p) => p.material === "powder");
    assert.ok(board.length >= 1 && brackets.length >= 4);
    assert.ok(Math.abs(SHELF.x0 - MAIN_ROOM.x0) < 0.01, "against the wall");
    for (const bracket of brackets) {
      const b = partBounds(bracket);
      assert.ok(b.y1 <= SHELF.y0 + EPS, "under the board");
    }
    const walls = brackets.filter(
      (p) => partBounds(p).x0 <= MAIN_ROOM.x0 + EPS,
    );
    assert.ok(walls.length >= 2, "screwed to the wall");
    assert.ok(SHELF.z0 >= DESK_TOP.z0 && SHELF.z1 <= DESK_TOP.z1);
    const below = box([
      ...item("monitor"),
      ...item("portrait"),
      ...item("lightbar"),
    ]);
    assert.ok(SHELF.y0 - below.y1 >= 0.04, "clears the screens");
  });

  it("carries the speakers, lamps and plants, none left on the desk", () => {
    for (const id of ["speaker", "plant"] as const) {
      const parts = item(id);
      assert.ok(parts.length > 0, id);
      const b = box(parts);
      assert.ok(Math.abs(b.y0 - SHELF.top) < EPS, `${id} on the shelf`);
      assert.ok(b.z0 >= SHELF.z0 && b.z1 <= SHELF.z1, id);
    }
    for (const id of ["lampLeft", "lampRight"] as const) {
      const b = box(lampParts(id));
      assert.ok(Math.abs(b.y0 - SHELF.top) < EPS, `${id} on the shelf`);
      assert.ok(b.z0 >= SHELF.z0 && b.z1 <= SHELF.z1, id);
      assert.ok(b.y1 < HOUSE.floorY + HOUSE.main.height, "under the eaves");
      assert.ok(
        minGap(lampParts(id), [...item("speaker"), ...item("plant")]) > 0.01,
      );
    }
    const speakers = new Set(
      item("speaker").map((p) => (p.center[2] > -1.3 ? 1 : 0)),
    );
    assert.equal(speakers.size, 2, "a pair at both ends");
  });

  it("aims both gamer lamps down at the desk with finite spots", () => {
    for (const id of ["lampLeft", "lampRight"] as const) {
      const f = LIGHT_FIXTURES[id];
      assert.equal(f.kind, "spot", id);
      if (f.kind !== "spot") continue;
      assert.ok(Math.abs(f.target[1] - DESK_TOP.y) < 0.02, "onto the desk");
      const d = f.target.map((v, i) => v - f.position[i]);
      assert.ok(d[1] / Math.hypot(...d) < -0.9, "down");
      assert.ok(f.position[0] > SHELF.x1, "head past the shelf front");
      // S27 raised them; the desk irradiance cap is in lights-spread.test.ts.
      assert.ok(f.intensity < 1);
      assert.ok(Math.abs(f.base[1] - SHELF.top) < EPS, `${id} on the shelf`);
      assert.ok(Math.abs(f.position[1] - f.base[1] - LAMP.bulb.y) < EPS);
      assert.ok(f.position[1] > SHELF.top + 0.05, "head above the shelf");
      assert.match(LIGHT_INFO[id].where, /shelf/i);
    }
    assert.ok(
      LIGHT_FIXTURES.lampLeft.base[2] > LIGHT_FIXTURES.lampRight.base[2],
    );
  });

  it("grows two potted plants with real leaves", () => {
    const plants = item("plant");
    const leaves = plants.filter((p) => p.leaf);
    assert.ok(leaves.length >= 10, `${leaves.length} leaves`);
    for (const leaf of leaves) {
      const { h, s } = hue(leaf.color);
      assert.ok(h * 360 > 80 && h * 360 < 160 && s > 0.3, "green");
    }
    const pots = [...new Set(plants.map((p) => p.group))];
    assert.equal(pots.length, 2, "two plants");
    for (const pot of pots) {
      const b = box(plants.filter((p) => p.group === pot));
      // S28 grew them from 0.10 m sprouts; setup-plants.test.ts has the rest.
      assert.ok(b.y1 - b.y0 <= 0.35, "shelf-sized");
      assert.ok(plants.filter((p) => p.group === pot && p.leaf).length >= 5);
    }
  });
});

describe("T12 headphones on an under-desk hanger (S24)", () => {
  it("hangs broad-band over-ear headphones under the desk edge, clear of the PC", () => {
    const phones = item("headphones");
    assert.ok(
      phones.length >= 10,
      "band, sliders, yokes, cups, cushions, hanger",
    );
    const b = box(phones);
    assert.ok(b.y1 <= DESK_TOP.y - 0.05 + EPS, "under the top");
    assert.ok(HEADPHONES.band >= 0.03, "broad flat headband");
    const pc = item("pc");
    assert.ok(pc.length > 0);
    assert.ok(minGap(phones, pc) >= 0.02, "clear of the PC");
    const legs = item("desk").filter((p) => p.material === "powder");
    const free = phones.filter((p) => !p.hanger);
    assert.ok(minGap(free, legs) >= 0.005, "clear of the frame");
    assert.ok(b.z1 < KEYBOARD.center[2], "right side");
  });
});

describe("T12 coffee on a wooden coaster, right (S25)", () => {
  it("stands the mug on a wood coaster right of the mouse and the mat", () => {
    const coaster = item("coaster");
    assert.equal(coaster.length >= 1, true);
    assert.ok(coaster.every((p) => p.material === "wood"));
    const c = box(coaster);
    assert.ok(Math.abs(c.y0 - DESK_TOP.y) < EPS, "on the desk");
    const mug = SETUP_PROPS.mug;
    assert.ok(Math.abs(mug.center[1] - c.y1) < EPS, "mug base on the coaster");
    assert.ok(Math.abs(mug.center[2] - COASTER.center[2]) < EPS);
    assert.ok(Math.abs(mug.center[0] - COASTER.center[0]) < EPS);
    assert.ok(mug.radius < COASTER.radius, "fits on it");
    assert.ok(c.z1 < box(item("mouse")).z0, "right of the mouse");
    assert.ok(box(item("mat")).z0 - c.z1 >= 0.05, "beside the mat");
    assert.ok(c.z0 >= DESK_TOP.z0 && c.x1 <= DESK_TOP.x1, "on the desk");
  });
});

describe("T12 only the requested items on the desk (S25)", () => {
  it("keeps the tabletop to keyboard, mouse, mat, monitors, light bar and coffee", () => {
    assert.deepEqual([...TABLETOP_ITEMS].sort(), [
      "coaster",
      "keyboard",
      "lightbar",
      "mat",
      "monitor",
      "monitor-arm",
      "mouse",
      "portrait",
    ]);
    // The wall shelf hangs above on its own brackets, never on the desk.
    for (const part of item("shelf"))
      assert.ok(partBounds(part).y0 > DESK_TOP.y + 0.3, "shelf off the desk");
    for (const part of all) {
      if (part.item === "shelf") continue;
      const b = partBounds(part);
      const onTop =
        b.y0 >= DESK_TOP.y - EPS &&
        b.y0 < SHELF.y0 &&
        b.x0 < DESK_TOP.x1 &&
        b.z0 < DESK_TOP.z1 &&
        b.z1 > DESK_TOP.z0;
      if (onTop)
        assert.ok(
          TABLETOP_ITEMS.includes(part.item as never),
          `${part.item} on the desk`,
        );
    }
  });

  it("drops the Elgato, Google Home and Loupedeck with their overlays", () => {
    const setup = readFileSync(
      new URL("../../src/components/world/Setup.tsx", import.meta.url),
      "utf8",
    );
    for (const gone of [
      "BrunoOverlayModel",
      "GoogleHomeLeds",
      "BRUNO_OVERLAYS",
      "loupedeck",
      "elgato",
      "googleLed",
    ])
      assert.ok(!setup.toLowerCase().includes(gone.toLowerCase()), gone);
    assert.match(setup, /BrunoChair/, "the chair stays");
    assert.match(setup, /chairSway/, "and sways");
  });
});

describe("T12 lights: four channels, seven interior emitters (T13)", () => {
  it("adds the light bar spot to the setup channel only", () => {
    assert.equal(LIGHT_IDS.length, 4);
    // T13 added one bounce fill each to the TV and setup channels.
    assert.equal(INTERIOR_FIXTURES.length, 7);
    for (const fixture of INTERIOR_FIXTURES) {
      assert.equal(fixture.castShadow, false);
      assert.ok(fixture.distance > 0 && fixture.distance <= 2.4);
    }
    assert.equal(LIGHTBAR_FIXTURE.channel, "setup");
    assert.match(LIGHT_INFO.setup.where, /light bar/i);
  });

  it("keeps the PC and screens on by day whatever the master", () => {
    assert.equal(glowPower(false, day), 1);
    assert.equal(glowPower(true, night), 1);
    assert.equal(glowPower(false, night), 0);
  });
});

describe("T12 credits (S24)", () => {
  const shipped = JSON.parse(
    readFileSync(new URL("credits.json", PUBLIC), "utf8"),
  ) as Credits;

  it("credits the finished setup as original work with its official references", () => {
    const setup = shipped.original?.find((item) => item.id === "setup");
    assert.ok(setup);
    for (const word of ["NuPhy", "light bar", "shelf", "headphones", "coaster"])
      assert.ok(setup.asset.includes(word), word);
    assert.deepEqual(setup.references, [
      "https://nuphy.com/products/air75-v2",
      "https://nuphy.com/blogs/journal/air75-v2",
    ]);
    assert.ok(!/bruno/i.test(setup.asset), "no copied Bruno pieces claimed");
    const normals = shipped.original?.find((i) => i.id === "setup-normals");
    assert.match(normals?.asset ?? "", /wood grain/);
    assert.deepEqual(creditProblems(shipped), []);
    const bad = {
      ...shipped,
      original: [{ ...setup, references: ["http://nuphy.com/"] }],
    };
    assert.equal(creditProblems(bad).length, 1, "references must be https");
  });

  it("regenerates the same entries from scripts/prepare-world.py", () => {
    // Reads ORIGINAL statically (ast.literal_eval): no import, no downloads.
    const script = fileURLToPath(
      new URL("../../scripts/prepare-world.py", import.meta.url),
    );
    const read = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import ast, json, sys",
          "tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())",
          "node = next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, 'id', None) == 'ORIGINAL' for t in n.targets))",
          "print(json.dumps(ast.literal_eval(node)))",
        ].join("\n"),
        script,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(read.status, 0, read.stderr);
    const generated = JSON.parse(read.stdout) as OriginalCredit[];
    for (const id of ["setup", "setup-normals"])
      assert.deepEqual(
        generated.find((item) => item.id === id),
        shipped.original?.find((item) => item.id === id),
        id,
      );
  });
});
