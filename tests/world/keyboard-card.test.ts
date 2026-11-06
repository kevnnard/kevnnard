import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
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
import { MONITOR_FOCUS } from "../../src/lib/world/monitor.ts";
import {
  CHAIR_PIVOT,
  DESK_HITBOXES,
  DESK_TOP,
  KEYBOARD,
  MAIN_MONITOR,
  MAIN_ROOM,
  MOUSE,
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
const insideSetup = (point: Vec3, margin: number) => {
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
    assert.equal(product.line, "The keyboard I write every line on.");
    assert.deepEqual(product.specs, [
      "75% low-profile, 84 keys",
      "Wireless: Bluetooth, 2.4G, USB-C",
      "Aluminium frame, RGB backlight",
    ]);
    assert.equal(product.link.label, "View on Amazon");
    assert.equal(product.link.url, "https://www.amazon.com/dp/B0CMX8SLF6");
    // A plain product link, not an affiliate one: no "sponsored".
    assert.equal(product.link.affiliate, false);
  });

  it("is a desk item, off the collection rail and not a glass case", () => {
    assert.equal(isDeskItemId("keyboard"), true);
    assert.equal(isDeskItemId("katana"), false);
    assert.equal(isDisplayCaseId("keyboard"), false);
    assert.ok(!(GALLERY_ORDER as readonly string[]).includes("keyboard"));
  });

  it("frames the keyboard from above the desk front, clear of the chair", () => {
    const { position, target, fov } = galleryCaseFocus("keyboard");
    assert.deepEqual(target, [...KEYBOARD.center]);
    // In front of the keyboard (the chair side, +x), looking down at it.
    assert.ok(position[0] > KEYBOARD.center[0] + 0.3);
    assert.ok(position[1] > DESK_TOP.y + 0.25);
    assert.equal(position[2], KEYBOARD.center[2]);
    // In the room, in front of the chair's backrest, inside no desk part.
    assert.ok(position[0] < CHAIR_PIVOT[0] - 0.1);
    assert.ok(position[0] < MAIN_ROOM.x1 && position[0] > MAIN_ROOM.x0);
    assert.equal(insideSetup(position as Vec3, 0.05), false);
    const distance = Math.hypot(...position.map((v, i) => v - target[i]));
    const { minDistance, maxDistance } = MONITOR_FOCUS.limits;
    assert.ok(distance > minDistance && distance < maxDistance);
    // The whole board fits left of the open card on a 1440 x 900 screen.
    const aspect = 1440 / 900;
    const half = distance * Math.tan(((fov / 2) * Math.PI) / 180) * aspect;
    const free = (1440 - STORY_CARD.width - STORY_CARD.inset) / 1440;
    assert.ok(KEYBOARD.size[2] < 2 * half * free * 0.9);
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

  it("renders a lo-fi card with a safe Amazon link and no product photo", () => {
    const card = source("src/components/world/ProductCard.tsx");
    assert.match(card, /katana-story/);
    assert.match(card, /target="_blank"/);
    assert.match(
      card,
      /affiliate\s*\? "sponsored noopener noreferrer"\s*: "noopener noreferrer"/,
    );
    assert.match(card, /opens in a new tab/);
    assert.match(card, /Link coming soon/);
    assert.match(card, /disabled/);
    assert.match(card, /Back to room/);
    assert.doesNotMatch(card, /<img\b/);
  });
});
