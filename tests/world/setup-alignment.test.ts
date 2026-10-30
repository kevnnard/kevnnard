// T14 (S27): the ultrawide centred on the desk with the keyboard and mat
// under it. S30 moves the portrait back to the seated left (+z).
// Seated at the desk you face the left wall (-x), so your right is -z.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOUNCE_FIXTURES,
  LIGHT_FIXTURES,
  LIGHTBAR_FIXTURE,
} from "../../src/lib/world/lights.ts";
import {
  CHAIR_PIVOT,
  COASTER,
  DESK_TOP,
  HEADPHONES,
  KEYBOARD,
  LIGHTBAR,
  MAIN_MONITOR,
  MAT,
  MONITOR_ARMS,
  MOUSE,
  partBounds,
  SETUP_PROPS,
  type SetupItem,
  type SetupPart,
  SIDE_MONITOR,
  setupMeshes,
} from "../../src/lib/world/setup.ts";

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
const gap = (a: Box, b: Box) =>
  Math.hypot(
    Math.max(0, a.x0 - b.x1, b.x0 - a.x1),
    Math.max(0, a.y0 - b.y1, b.y0 - a.y1),
    Math.max(0, a.z0 - b.z1, b.z0 - a.z1),
  );
const minGap = (a: SetupPart[], b: SetupPart[]) =>
  Math.min(
    ...a.flatMap((p) => b.map((q) => gap(partBounds(p), partBounds(q)))),
  );
const mid = (b: Box) => (b.z0 + b.z1) / 2;

/** The desk's centre along its length (world z). */
const CENTRE = (DESK_TOP.z0 + DESK_TOP.z1) / 2;

/** T12 (ea0d4aa) placement, for the old -> new record. */
const T12 = {
  main: -1.55,
  portrait: -0.67,
  keyboard: -1.35,
  mat: -1.35,
  mainWidth: 1.15,
  pc: { z0: -2.17, z1: -1.946 },
} as const;

describe("T14 ultrawide, keyboard and mat on the desk's centre (S27)", () => {
  it("centres the ultrawide on the desk top, curve and width kept", () => {
    assert.ok(Math.abs(T12.main - CENTRE) > 0.2, "T12 sat off-centre");
    assert.ok(Math.abs(MAIN_MONITOR.center[2] - CENTRE) < EPS, "panel centre");
    assert.ok(Math.abs(mid(box(item("monitor"))) - CENTRE) < 1e-4, "bounds");
    const width = MAIN_MONITOR.size[2];
    assert.ok(width <= T12.mainWidth + EPS && width >= 1, `width ${width}`);
    assert.ok(MAIN_MONITOR.curve.radius <= 2.3, "still curved");
  });

  it("puts the keyboard exactly under the screen's centre", () => {
    assert.ok(Math.abs(KEYBOARD.center[2] - CENTRE) < EPS);
    assert.ok(Math.abs(mid(box(item("keyboard"))) - CENTRE) < 1e-4);
    assert.ok(Math.abs(KEYBOARD.center[2] - MAIN_MONITOR.center[2]) < EPS);
  });

  it("centres the mat, sized to the desk, the mouse and coaster still right", () => {
    assert.ok(Math.abs(MAT.center[2] - CENTRE) < EPS);
    assert.ok(Math.abs(mid(box(item("mat"))) - CENTRE) < 1e-4);
    const deskWidth = DESK_TOP.z1 - DESK_TOP.z0;
    const share = MAT.size[2] / deskWidth;
    assert.ok(share >= 0.65 && share <= 0.8, `mat ${share} of the desk`);
    const mouse = box(item("mouse"));
    const mat = box(item("mat"));
    assert.ok(mouse.z0 - mat.z0 >= 0.1, "pad room right of the mouse");
    assert.ok(MOUSE.center[2] < KEYBOARD.center[2], "mouse on the right");
    const coaster = box(item("coaster"));
    assert.ok(mat.z0 - coaster.z1 >= 0.05, "coaster beside the mat");
    assert.ok(coaster.z1 < mouse.z0 - 0.1, "coaster right of the mouse");
    assert.ok(COASTER.center[2] - COASTER.radius >= DESK_TOP.z0 - EPS);
  });
});

describe("S30 portrait monitor on the seated left", () => {
  const main = box(item("monitor"));
  const portrait = box(item("portrait"));

  it("moves the portrait to +z, past the ultrawide's left end", () => {
    assert.ok(SIDE_MONITOR.center[2] > MAIN_MONITOR.center[2]);
    assert.ok(portrait.z0 >= main.z1 + 0.04, "a panel gap of 4 cm or more");
    assert.ok(minGap(item("monitor"), item("portrait")) >= 0.04, "no clash");
    const lightbar = box(item("lightbar"));
    assert.ok(gap(portrait, lightbar) >= 0.04, "clear of the light bar");
  });

  it("turns toward the seat from its new side", () => {
    const n = [Math.cos(SIDE_MONITOR.yaw), 0, -Math.sin(SIDE_MONITOR.yaw)];
    assert.ok(n[0] > 0.9, "into the room");
    assert.ok(n[2] < -0.2, "turned in toward the desk centre");
    const [px, pz] = CHAIR_PIVOT;
    const [sx, , sz] = SIDE_MONITOR.center;
    const toSeat = [px - sx, pz - sz];
    const cos = (n[0] * toSeat[0] + n[2] * toSeat[1]) / Math.hypot(...toSeat);
    assert.ok(cos > 0.9, `faces the seat (cos ${cos.toFixed(3)})`);
  });

  it("keeps both displays over the desk and under the shelf", () => {
    for (const b of [main, portrait]) {
      assert.ok(b.z0 >= DESK_TOP.z0 - EPS && b.z1 <= DESK_TOP.z1 + EPS);
      assert.ok(b.y0 > DESK_TOP.y + 0.05, "hung, not standing");
    }
  });
});

describe("T14 arms, light bar, screen props and lights follow", () => {
  it("hangs each display from its own clamp behind it", () => {
    const { main, side } = MONITOR_ARMS;
    assert.ok(Math.abs(main.vesa[2] - MAIN_MONITOR.center[2]) < EPS);
    const half = MAIN_MONITOR.size[2] / 2;
    assert.ok(Math.abs(main.clamp[2] - MAIN_MONITOR.center[2]) < half);
    const portrait = box(item("portrait"));
    assert.ok(side.clamp[2] >= portrait.z0 && side.clamp[2] <= portrait.z1);
    assert.ok(Math.abs(side.vesa[2] - SIDE_MONITOR.center[2]) < 0.05);
    for (const arm of [main, side]) {
      assert.ok(Math.abs(arm.clamp[1] - DESK_TOP.y) < EPS, "on the top");
      assert.ok(arm.clamp[0] - DESK_TOP.x0 < 0.08, "at the back edge");
    }
    // Under the top, the clamps keep off the frame, the PC and the headphones.
    const below = item("monitor-arm").filter(
      (p) => partBounds(p).y1 <= DESK_TOP.y + EPS,
    );
    assert.ok(below.length >= 4, "two clamps under the top");
    const frame = item("desk").filter(
      (p) => p.material === "powder" && partBounds(p).y1 < DESK_TOP.y - 0.04,
    );
    assert.ok(minGap(below, frame) >= 0.005, "clear of the frame");
    assert.ok(minGap(below, item("pc")) >= 0.02, "clear of the PC");
    assert.ok(minGap(below, item("headphones")) >= 0.02);
  });

  it("centres the light bar on the ultrawide and the logo on the portrait", () => {
    assert.ok(Math.abs(LIGHTBAR.center[2] - MAIN_MONITOR.center[2]) < EPS);
    assert.ok(Math.abs(mid(box(item("lightbar"))) - CENTRE) < 1e-4);
    const { sideScreen } = SETUP_PROPS;
    assert.equal(sideScreen.yaw, SIDE_MONITOR.yaw);
    const n = [Math.cos(SIDE_MONITOR.yaw), 0, -Math.sin(SIDE_MONITOR.yaw)];
    const d = sideScreen.center.map((v, i) => v - SIDE_MONITOR.center[i]);
    const out = d[0] * n[0] + d[2] * n[2];
    assert.ok(out > SIDE_MONITOR.size[0] / 2, "in front of the screen");
    assert.ok(Math.hypot(d[0] - out * n[0], d[2] - out * n[2]) < EPS);
  });

  it("moves the setup wash, its bounce and the light bar spot with the screen", () => {
    const z = MAIN_MONITOR.center[2];
    assert.ok(Math.abs(LIGHT_FIXTURES.setup.position[2] - z) < EPS);
    assert.ok(Math.abs(BOUNCE_FIXTURES.setup.position[2] - z) < EPS);
    assert.ok(Math.abs(LIGHTBAR_FIXTURE.position[2] - z) < EPS);
  });
});

describe("T14 leaves the rest of the setup where it was", () => {
  it("keeps the PC and the headphones under the desk's far end", () => {
    const pc = box(item("pc"));
    assert.ok(
      Math.abs(pc.z0 - T12.pc.z0) < 1e-4 && Math.abs(pc.z1 - T12.pc.z1) < 1e-4,
    );
    assert.ok(Math.abs(HEADPHONES.center[2] - -1.92) < EPS);
  });

  it("adds no parts: 297 of the 300 budget", () => {
    const parts = all.length + meshes.hull.length;
    assert.equal(parts, 297);
  });
});
