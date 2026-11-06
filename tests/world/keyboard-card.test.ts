import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE } from "../../src/lib/world/camera.ts";
import { DESK_PRODUCTS } from "../../src/lib/world/desk-products.ts";
import {
  GALLERY_ORDER,
  isDeskItemId,
  isDisplayCaseId,
} from "../../src/lib/world/display-cases.ts";
import {
  galleryCaseFocus,
  galleryStoryShift,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import {
  KEYBOARD_SHOT,
  KEYBOARD_START,
  KEYBOARD_VIEW,
  keyboardLeaveAt,
  keyboardShotAt,
  keyboardShotProgress,
  keyboardShotShift,
} from "../../src/lib/world/keyboard-shot.ts";
import { MONITOR_FOCUS } from "../../src/lib/world/monitor.ts";
import {
  CHAIR_PIVOT,
  DESK_HITBOXES,
  DESK_TOP,
  KEYBOARD,
  MAIN_MONITOR,
  MAIN_ROOM,
  MOUSE,
  partBounds,
  SETUP_PROPS,
  setupMeshes,
} from "../../src/lib/world/setup.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

type Vec3 = readonly [number, number, number];
const box = (center: Vec3, size: Vec3) => ({
  min: center.map((c, i) => c - size[i] / 2),
  max: center.map((c, i) => c + size[i] / 2),
});
/** Gap between two boxes along their most separated axis (negative: overlap). */
const gap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  Math.max(
    ...[0, 1, 2].map((i) => Math.max(b.min[i] - a.max[i], a.min[i] - b.max[i])),
  );
/** A part's world half extents: its box turned by its XYZ Euler rotation. */
const halfExtents = (size: Vec3, [a, b, c]: Vec3 = [0, 0, 0]): number[] => {
  const [ca, sa, cb, sb, cc, sc] = [a, b, c].flatMap((r) => [
    Math.cos(r),
    Math.sin(r),
  ]);
  // three's Euler XYZ: R = Rx(a) Ry(b) Rz(c).
  const R = [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
  return R.map((row) =>
    row.reduce((sum, v, j) => sum + Math.abs(v) * (size[j] / 2), 0),
  );
};
/** Whether `point` sits inside any setup part's world bounding box. */
const insideSetup = (point: readonly number[], margin: number) => {
  const meshes = setupMeshes();
  return [...meshes.solid, ...meshes.glow, ...meshes.glass].some((part) => {
    const half = halfExtents(part.size, part.rotation);
    return part.center.every(
      (c, i) => Math.abs(point[i] - c) < half[i] + margin,
    );
  });
};

describe("keyboard product card (keyboard-card T1)", () => {
  const product = DESK_PRODUCTS.keyboard;

  it("holds the owner's keyboard as typed data", () => {
    assert.equal(product.kicker, "DESK · KEYBOARD");
    assert.equal(product.title, "NuPhy Air75 V2");
    assert.equal(product.subtitle, "The keyboard I write every line on.");
    assert.deepEqual(product.stats, [
      { label: "Layout", value: "75% · 84 keys" },
      { label: "Profile", value: "Low-profile" },
      { label: "Connection", value: "Bluetooth / 2.4G / USB-C" },
    ]);
    assert.equal(product.link.label, "View on Amazon");
    assert.equal(product.link.url, "https://www.amazon.com/dp/B0CMX8SLF6");
    // A plain product link, not an affiliate one: no "sponsored".
    assert.equal(product.link.affiliate, false);
  });

  it("describes the owner's Gateron Moss switch and its sound (keyboard-card T2)", () => {
    const { switch: sw } = product;
    assert.equal(sw.name, "Gateron Moss");
    assert.match(sw.type, /tactile/i);
    // The listing's figures: 60 gf, 1.7 mm pre-travel, 3.0 mm total.
    assert.ok(sw.specs.some((spec) => /60\s?gf/.test(spec.value)));
    assert.ok(sw.specs.some((spec) => /1\.7 mm/.test(spec.value)));
    assert.ok(sw.specs.some((spec) => /3\.0 mm/.test(spec.value)));
    assert.match(sw.feel, /bump/i);
    assert.match(sw.sound, /thock/i);
  });

  it("lists the low-profile black keycaps with their accents", () => {
    const caps = product.keycaps.map((cap) => cap.label).join(" ");
    for (const part of [
      /low-profile/i,
      /PBT/,
      /mint Esc/i,
      /coral Enter/i,
      /yellow space/i,
    ])
      assert.match(caps, part);
  });

  it("says why the owner chose it, in his voice", () => {
    for (const part of [
      /wrist rest/i,
      /wireless/i,
      /Mac/,
      /Linux/,
      /night/i,
      /flow/i,
    ])
      assert.match(product.why, part);
    assert.ok(product.why.length < 420, "a short paragraph");
  });

  it("is a desk item, off the collection rail and not a glass case", () => {
    assert.equal(isDeskItemId("keyboard"), true);
    assert.equal(isDeskItemId("katana"), false);
    assert.equal(isDisplayCaseId("keyboard"), false);
    assert.ok(!(GALLERY_ORDER as readonly string[]).includes("keyboard"));
  });

  it("frames the keyboard from the chair side, clear of the chair", () => {
    const { position, target, fov } = galleryCaseFocus("keyboard");
    // Aimed at the board (its cap tops), as the cinematic shot ends.
    assert.ok(Math.abs(target[0] - KEYBOARD.center[0]) < 1e-9);
    assert.ok(Math.abs(target[2] - KEYBOARD.center[2]) < 1e-9);
    assert.ok(target[1] >= KEYBOARD.center[1]);
    assert.ok(target[1] < KEYBOARD.center[1] + KEYBOARD.size[1]);
    // In front of the keyboard (the chair side, +x), looking down at it.
    assert.ok(position[0] > KEYBOARD.center[0] + 0.3);
    assert.ok(position[1] > DESK_TOP.y + 0.25);
    // In the room, inside no desk or chair part.
    assert.ok(position[0] < MAIN_ROOM.x1 && position[0] > MAIN_ROOM.x0);
    assert.equal(insideSetup(position as Vec3, 0.05), false);
    const distance = Math.hypot(...position.map((v, i) => v - target[i]));
    const { minDistance, maxDistance } = MONITOR_FOCUS.limits;
    assert.ok(distance > minDistance && distance < maxDistance);
    // The whole board, turned to the 3/4 view, fits left of the open card
    // on a 1440 x 900 screen.
    const aspect = 1440 / 900;
    const half = distance * Math.tan(((fov / 2) * Math.PI) / 180) * aspect;
    const free = (1440 - STORY_CARD.width - STORY_CARD.inset) / 1440;
    const azimuth = Math.atan2(
      position[2] - target[2],
      position[0] - target[0],
    );
    const across =
      KEYBOARD.size[2] * Math.cos(azimuth) +
      KEYBOARD.size[0] * Math.abs(Math.sin(azimuth));
    assert.ok(across < 2 * half * free * 0.95);
  });

  it("slides the view so the keyboard sits left of the card", () => {
    const shift = galleryStoryShift(1440, 1440 / 900, "keyboard");
    assert.ok(shift > 0);
    const { target } = galleryCaseFocus("keyboard", shift);
    // Screen right, seated at the desk, is world -z.
    assert.ok(target[2] < KEYBOARD.center[2]);
    assert.equal(galleryStoryShift(600, 0.6, "keyboard"), 0);
  });

  it("clicks only around the keyboard, clear of the mouse, mug and monitor", () => {
    const hit = box(DESK_HITBOXES.keyboard.center, DESK_HITBOXES.keyboard.size);
    const board = box(KEYBOARD.center, KEYBOARD.size);
    for (const i of [0, 1, 2]) {
      assert.ok(hit.min[i] < board.min[i] && hit.max[i] > board.max[i]);
      assert.ok(hit.max[i] - board.max[i] <= 0.02);
    }
    assert.ok(gap(hit, box(MOUSE.center, MOUSE.size)) > 0.25);
    const mug = SETUP_PROPS.mug;
    const mugBox = box(
      [mug.center[0], mug.center[1] + mug.height / 2, mug.center[2]],
      [mug.radius * 2, mug.height, mug.radius * 2],
    );
    assert.ok(gap(hit, mugBox) > 0.5);
    // Under the ultrawide's bottom edge and in front of its curved ends.
    const monitorBottom = MAIN_MONITOR.center[1] - MAIN_MONITOR.size[1] / 2;
    assert.ok(monitorBottom - hit.max[1] > 0.1);
    assert.ok(hit.min[0] - (MAIN_MONITOR.center[0] + 0.15) > 0);
  });
});

describe("keyboard card wiring", () => {
  it("adds a gated hitbox on the desk keyboard in Setup", () => {
    const setup = source("src/components/world/Setup.tsx");
    assert.match(setup, /name=\{`setup-\$\{id\}-hit`\}/);
    assert.match(setup, /DESK_HITBOXES\[id\]/);
    assert.match(
      setup,
      /<DeskHit id="keyboard" occluders=\{group\} control=\{desk\} \/>/,
    );
    assert.match(setup, /control\.onInspect\?\.\(id\)/);
    // Same gate as the monitor: inside the room, nothing in the way.
    assert.match(setup, /canEnterMonitor\(/);
    assert.match(setup, /raycaster\.intersectObject\(occluders, true\)/);
    assert.match(setup, /event\.stopPropagation\(\)/);
  });

  it("passes the desk control to both Setup branches", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    const setups = scene.match(/<Setup\b[\s\S]*?\/>/g) ?? [];
    assert.equal(setups.length, 2);
    for (const tag of setups) assert.match(tag, /desk=\{desk\}/);
  });

  it("shows the product card for the keyboard, with no collection rail", () => {
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(app, /!isDeskItemId\(galleryCase\)/);
    assert.match(app, /<ProductCard\b/);
    assert.match(app, /DESK_PRODUCTS\.keyboard/);
    assert.match(app, /onReturn=\{\(\) => setGalleryCase\(null\)\}/);
  });

  it("renders the helmet card's layout with a safe Amazon link and no photo", () => {
    const card = source("src/components/world/ProductCard.tsx");
    // The football helmet / coffee card family and footprint.
    assert.match(card, /className="case-story product-card"/);
    assert.match(card, /case-story-kicker/);
    assert.match(card, /case-story-head/);
    assert.match(card, /<dl className="product-card-stats"/);
    assert.match(card, /Switches &amp; sound|Switches & sound/);
    assert.match(card, /Keycaps/);
    assert.match(card, /Why I chose it/);
    assert.match(card, /target="_blank"/);
    assert.match(
      card,
      /affiliate\s*\? "sponsored noopener noreferrer"\s*: "noopener noreferrer"/,
    );
    assert.match(card, /opens in a new tab/);
    assert.match(card, /Link coming soon/);
    assert.match(card, /disabled/);
    assert.match(card, /Back to room/);
    assert.match(card, /focus\(\{ preventScroll: true \}\)/);
    // No photos and no third-party requests: the 3D board is the visual.
    assert.doesNotMatch(card, /<img\b|<video\b|https?:\/\//);
    const css = source("src/components/world/product-card.css");
    assert.match(css, /@media \(max-width: 700px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(css, /url\(/);
  });
});

describe("keyboard shot (keyboard-card T2)", () => {
  const end = keyboardShotAt(1);
  const DEG = Math.PI / 180;
  const dist = (a: readonly number[], b: readonly number[]) =>
    Math.hypot(...a.map((v, i) => v - b[i]));
  const near = (a: readonly number[], b: readonly number[], eps = 1e-9) =>
    a.every((v, i) => Math.abs(v - b[i]) < eps);
  const chairBox = (() => {
    const meshes = setupMeshes();
    const all = [
      ...meshes.solid,
      ...meshes.glow,
      ...meshes.glass,
      ...meshes.hull,
    ]
      .filter((part) => part.item === "chair")
      .map(partBounds);
    return {
      x1: Math.max(...all.map((b) => b.x1)),
      y1: Math.max(...all.map((b) => b.y1)),
      z1: Math.max(...all.map((b) => b.z1)),
    };
  })();

  it("ends on a low 3/4 product shot from the front-left, 25-30 degrees down", () => {
    assert.ok(
      near(
        [end.target[0], end.target[2]],
        [KEYBOARD.center[0], KEYBOARD.center[2]],
      ),
    );
    const d = dist(end.eye, end.target);
    const down = Math.asin((end.eye[1] - end.target[1]) / d);
    assert.ok(down >= 25 * DEG && down <= 30 * DEG, `pitch ${down / DEG}`);
    // Front-left of a seated typist: the chair side (+x), turned toward +z.
    const azimuth = Math.atan2(
      end.eye[2] - end.target[2],
      end.eye[0] - end.target[0],
    );
    assert.ok(
      azimuth > 30 * DEG && azimuth < 55 * DEG,
      `azimuth ${azimuth / DEG}`,
    );
    // Close enough to read the legends, a narrower lens than the room's.
    assert.ok(d > 0.5 && d < 0.85, `distance ${d}`);
    assert.ok(end.fov < GUIDE.fov && end.fov >= GUIDE.fov - 8);
  });

  it("keeps the eye in the room, out of the desk, monitor and chair", () => {
    const monitorFront = MAIN_MONITOR.center[0] + MAIN_MONITOR.size[0] / 2;
    for (const width of [1440, 1100, 1920]) {
      const shift = keyboardShotShift(width, width / 900);
      const { eye } = keyboardShotAt(1, KEYBOARD_START, shift);
      assert.ok(eye[1] > DESK_TOP.y + 0.2);
      assert.ok(eye[0] > DESK_TOP.x1, "past the desk's front edge");
      assert.ok(eye[0] - monitorFront > 0.5, "well in front of the monitor");
      assert.ok(eye[2] < MAIN_ROOM.z1 - 0.2 && eye[2] > MAIN_ROOM.z0 + 0.2);
      // Beside the chair's whole box (it stands taller than the eye).
      assert.ok(eye[1] < chairBox.y1 || eye[2] > chairBox.z1);
      assert.ok(
        eye[2] - chairBox.z1 > 0.08,
        `chair clearance ${eye[2] - chairBox.z1}`,
      );
      assert.equal(insideSetup(eye, 0.05), false);
    }
    // And the default approach never cuts through a desk or chair part.
    for (let t = 0; t <= 1.0001; t += 0.02)
      assert.equal(insideSetup(keyboardShotAt(t).eye, 0.03), false, `t ${t}`);
  });

  it("slides the board left of the open card, none once it stacks", () => {
    const shift = keyboardShotShift(1440, 1440 / 900);
    assert.ok(shift > 0.05 && shift < 0.2, `shift ${shift}`);
    assert.equal(keyboardShotShift(700, 0.5), 0);
    assert.ok(
      Math.abs(shift - galleryStoryShift(1440, 1440 / 900, "keyboard")) < 1e-9,
    );
    const moved = keyboardShotAt(1, KEYBOARD_START, shift);
    // Screen right while looking from +x/+z is toward -z.
    assert.ok(moved.target[2] < end.target[2]);
    assert.ok(
      near(
        moved.eye.map((v, i) => v - moved.target[i]),
        end.eye.map((v, i) => v - end.target[i]),
      ),
    );
    const focus = galleryCaseFocus("keyboard", shift);
    assert.ok(
      near(focus.position, moved.eye) && near(focus.target, moved.target),
    );
  });

  it("is a ~2.5 s eased dolly with a slight arc and a narrowing lens", () => {
    assert.ok(KEYBOARD_SHOT.duration >= 2.2 && KEYBOARD_SHOT.duration <= 3);
    const from = {
      eye: [2.2, 2.1, -0.2] as Vec3,
      target: [0.4, 1.2, -1] as Vec3,
      fov: GUIDE.fov,
    };
    const start = keyboardShotAt(0, from);
    assert.ok(near(start.eye, from.eye) && near(start.target, from.target));
    assert.equal(start.fov, GUIDE.fov);
    const stop = keyboardShotAt(1, from);
    assert.ok(near(stop.eye, end.eye) && near(stop.target, end.target));
    assert.equal(stop.fov, end.fov);
    const total = dist(from.eye, end.eye);
    assert.ok(dist(keyboardShotAt(0.1, from).eye, from.eye) < total * 0.05);
    assert.ok(dist(keyboardShotAt(0.9, from).eye, end.eye) < total * 0.05);
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const now = keyboardShotAt(t, from);
      const before = keyboardShotAt(t - 0.05, from);
      assert.ok(
        dist(now.eye, end.target) <= dist(before.eye, end.target) + 1e-9,
      );
      assert.ok(now.fov <= before.fov + 1e-9);
    }
    const mid = keyboardShotAt(0.5, from).eye;
    const line = from.eye.map((v, i) => (v + end.eye[i]) / 2);
    const off = dist(mid, line);
    assert.ok(off > 0.05 && off < 0.4, `arc ${off}`);
  });

  it("is the keyboard's inspection view (centre, offset, lens)", () => {
    assert.ok(near(KEYBOARD_VIEW.centre, end.target));
    assert.ok(
      near(
        KEYBOARD_VIEW.offset,
        end.eye.map((v, i) => v - end.target[i]),
      ),
    );
    assert.equal(KEYBOARD_VIEW.fov, end.fov);
  });

  it("clamps its time, leaves along the same path and cuts under reduced motion", () => {
    assert.ok(near(keyboardShotAt(-1).eye, KEYBOARD_START.eye));
    assert.ok(near(keyboardShotAt(2).eye, end.eye));
    const back = {
      eye: [1.5, 1.7, -0.5] as Vec3,
      target: [0, 1.1, -1.4] as Vec3,
      fov: GUIDE.fov,
    };
    for (const t of [0, 0.3, 0.7, 1]) {
      const leave = keyboardLeaveAt(t, back);
      const enter = keyboardShotAt(1 - t, back);
      assert.ok(near(leave.eye, enter.eye) && near(leave.target, enter.target));
      assert.equal(leave.fov, enter.fov);
    }
    assert.equal(keyboardShotProgress(0, true), 1);
    assert.equal(keyboardShotProgress(0, true, true), 1);
    assert.equal(keyboardShotProgress(0, false), 0);
    assert.equal(keyboardShotProgress(KEYBOARD_SHOT.duration / 2, false), 0.5);
    assert.equal(
      keyboardShotProgress(KEYBOARD_SHOT.leaveDuration / 2, false, true),
      0.5,
    );
    assert.equal(keyboardShotProgress(99, false), 1);
  });

  it("is wired into the scene's cinematic desk items next to the coffee", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /from "@\/lib\/world\/keyboard-shot\.ts"/);
    assert.match(
      scene,
      /coffee: \{\s*shotAt: coffeeShotAt,\s*leaveAt: coffeeLeaveAt,\s*progress: coffeeShotProgress,\s*shift: coffeeShotShift,?\s*\}/,
    );
    assert.match(
      scene,
      /keyboard: \{\s*shotAt: keyboardShotAt,\s*leaveAt: keyboardLeaveAt,\s*progress: keyboardShotProgress,\s*shift: keyboardShotShift,?\s*\}/,
    );
  });
});
