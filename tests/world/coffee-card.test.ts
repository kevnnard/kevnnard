import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE } from "../../src/lib/world/camera.ts";
import {
  MUG_REST,
  MUG_TURN,
  type MugTurn,
  mugAtRest,
  mugPose,
  mugTurnStep,
} from "../../src/lib/world/coffee-mug.ts";
import {
  COFFEE_HITBOX,
  COFFEE_SHOT,
  COFFEE_START,
  COFFEE_VIEW,
  coffeeLeaveAt,
  coffeeShotAt,
  coffeeShotProgress,
  coffeeShotShift,
} from "../../src/lib/world/coffee-shot.ts";
import { DESK_STORIES } from "../../src/lib/world/desk-stories.ts";
import { MONITOR_FOCUS } from "../../src/lib/world/monitor.ts";
import {
  CHAIR_PIVOT,
  DESK_HITBOXES,
  DESK_TOP,
  MAIN_MONITOR,
  MAIN_ROOM,
  partBounds,
  SETUP_PROPS,
  setupMeshes,
} from "../../src/lib/world/setup.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

type Vec3 = readonly [number, number, number];
interface Box {
  min: number[];
  max: number[];
}
const box = (center: Vec3, size: Vec3): Box => ({
  min: center.map((c, i) => c - size[i] / 2),
  max: center.map((c, i) => c + size[i] / 2),
});
const bounds = (p: Parameters<typeof partBounds>[0]): Box => {
  const b = partBounds(p);
  return { min: [b.x0, b.y0, b.z0], max: [b.x1, b.y1, b.z1] };
};
/** Gap between two boxes along their most separated axis (negative: overlap). */
const gap = (a: Box, b: Box) =>
  Math.max(
    ...[0, 1, 2].map((i) => Math.max(b.min[i] - a.max[i], a.min[i] - b.max[i])),
  );
const meshes = setupMeshes();
const parts = [
  ...meshes.solid,
  ...meshes.glow,
  ...meshes.glass,
  ...meshes.hull,
];
const itemBox = (item: string): Box => {
  const all = parts.filter((p) => p.item === item).map(bounds);
  assert.ok(all.length > 0, item);
  return {
    min: [0, 1, 2].map((i) => Math.min(...all.map((b) => b.min[i]))),
    max: [0, 1, 2].map((i) => Math.max(...all.map((b) => b.max[i]))),
  };
};
const inside = (point: readonly number[], margin: number) =>
  parts.some((p) => {
    const b = bounds(p);
    return point.every(
      (v, i) => v > b.min[i] - margin && v < b.max[i] + margin,
    );
  });
const near = (a: readonly number[], b: readonly number[], eps = 1e-9) =>
  a.every((v, i) => Math.abs(v - b[i]) < eps);
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));

const mug = SETUP_PROPS.mug;
/** The mug's handle reaches this far toward +x (SetupEffects mugGeometry). */
const HANDLE_REACH = 0.04 + 0.024 + 0.0065;

describe("coffee card data (coffee-card T1, T2)", () => {
  const story = DESK_STORIES.coffee;

  it("holds the owner's coffee, its processes and their friend's shop", () => {
    assert.equal(story.kicker, "DESK · COFFEE");
    assert.equal(story.title, "Chiroso");
    assert.equal(
      story.subtitle,
      "My favourite coffee, a rare Colombian variety",
    );
    assert.deepEqual(story.stats, [
      { label: "Origin", value: "Urrao, Antioquia" },
      { label: "Altitude", value: "1,800–2,200 m" },
      { label: "Variety", value: "Caturra Chiroso" },
    ]);
    assert.deepEqual(story.altitude, { low: 1800, high: 2200 });
    assert.deepEqual(story.processes, [
      { name: "Washed", note: "clean, bright citrus acidity, floral" },
      { name: "Honey", note: "honeyed sweetness, rounder body" },
      { name: "Natural", note: "red fruit, berries, winey" },
    ]);
    assert.equal(story.place.name, "Café Mi Tierra");
    assert.equal(story.place.city, "Bogotá");
    assert.equal(
      story.place.text,
      "my friend's coffee shop. Go have a cup there.",
    );
    assert.equal(story.place.link.label, "Open in Google Maps");
    assert.equal(
      story.place.link.url,
      "https://www.google.com/maps/place/Caf%C3%A9+Mi+Tierra/@4.6035678,-74.1123538,17z/data=!4m6!3m5!1s0x8e3f990041f72565:0xf58a44f4848c28b5!8m2!3d4.6035678!4d-74.1123538",
    );
  });

  it("leaves an empty slot for the owner's own photos", () => {
    assert.equal(story.media, null);
  });
});

describe("mug turntable (coffee-card T2)", () => {
  const TURN = 2 * Math.PI;
  /** Runs `seconds` at 60 fps from `state`. */
  const run = (
    state: MugTurn,
    seconds: number,
    turning: boolean,
    reduced = false,
  ) => {
    let next = state;
    for (let i = 0; i < Math.round(seconds * 60); i++)
      next = mugTurnStep(next, 1 / 60, turning, reduced);
    return next;
  };

  it("turns once per 20 s, like the display cases, once up to speed", () => {
    assert.equal(MUG_TURN.period, 20);
    const steady = run(MUG_REST, MUG_TURN.spinUp + 0.5, true);
    const later = run(steady, 5, true);
    const turned = (later.yaw - steady.yaw + TURN) % TURN;
    assert.ok(Math.abs(turned - TURN / 4) < 1e-6, `quarter: ${turned}`);
  });

  it("eases in on arrival rather than jumping to full speed", () => {
    const first = mugTurnStep(MUG_REST, 0.1, true, false);
    const full = (TURN * 0.1) / MUG_TURN.period;
    assert.ok(first.yaw > 0 && first.yaw < full * 0.1, `${first.yaw}`);
    let state = MUG_REST;
    let last = 0;
    for (let i = 0; i < MUG_TURN.spinUp * 60; i++) {
      const next = mugTurnStep(state, 1 / 60, true, false);
      const step = next.yaw - state.yaw;
      assert.ok(step >= last - 1e-12, "speed only grows");
      last = step;
      state = next;
    }
  });

  it("lifts about a centimetre, eased, and stays up while focused", () => {
    assert.ok(MUG_TURN.lift >= 0.008 && MUG_TURN.lift <= 0.012);
    assert.equal(mugPose(MUG_REST).lift, 0);
    const early = mugPose(run(MUG_REST, 0.1, true)).lift;
    assert.ok(early > 0 && early < MUG_TURN.lift * 0.1);
    assert.equal(mugPose(run(MUG_REST, 4, true)).lift, MUG_TURN.lift);
    assert.equal(mugPose(run(MUG_REST, 30, true)).lift, MUG_TURN.lift);
  });

  it("eases back to its rest angle and height on leave, then rests", () => {
    for (const seconds of [3, 7, 11, 16]) {
      const away = run(MUG_REST, seconds, true);
      assert.equal(mugAtRest(away), false);
      const soon = run(away, 0.2, false);
      // No jump: the first moments of the leave stay close to the turn.
      const moved = Math.abs(
        ((soon.yaw - away.yaw + 3 * Math.PI) % TURN) - Math.PI,
      );
      assert.ok(moved < 0.6, `moved ${moved}`);
      const back = run(away, 4, false);
      assert.deepEqual(back, MUG_REST);
      assert.equal(mugAtRest(back), true);
      assert.deepEqual(mugPose(back), { yaw: 0, lift: 0 });
    }
  });

  it("never turns or lifts under reduced motion", () => {
    assert.deepEqual(run(MUG_REST, 5, true, true), MUG_REST);
    const away = run(MUG_REST, 5, true);
    assert.deepEqual(mugTurnStep(away, 1 / 60, true, true), MUG_REST);
  });

  it("keeps its yaw within one turn", () => {
    const state = run(MUG_REST, 45, true);
    assert.ok(state.yaw >= 0 && state.yaw < TURN);
  });
});

describe("coffee shot (coffee-card T1)", () => {
  const end = coffeeShotAt(1);

  it("ends low and close on the steaming mug at a 3/4 angle", () => {
    // Aimed just under the rim, so the steam rises in the upper frame.
    assert.ok(
      near([end.target[0], end.target[2]], [mug.center[0], mug.center[2]]),
    );
    assert.ok(end.target[1] > mug.center[1] + mug.height / 2);
    assert.ok(end.target[1] < mug.center[1] + mug.height);
    const d = dist(end.eye, end.target);
    assert.ok(d < 0.5 && d > MONITOR_FOCUS.limits.minDistance, `close: ${d}`);
    const down = Math.asin((end.eye[1] - end.target[1]) / d);
    assert.ok(down > 0 && down < (15 * Math.PI) / 180, `low: ${down}`);
    // 3/4: from the chair's side (+x), turned 20-45 degrees toward +z.
    const azimuth = Math.atan2(
      end.eye[2] - end.target[2],
      end.eye[0] - end.target[0],
    );
    assert.ok(azimuth > (20 * Math.PI) / 180 && azimuth < (45 * Math.PI) / 180);
    assert.ok(end.fov < GUIDE.fov && end.fov >= GUIDE.fov - 8);
  });

  it("keeps the eye in the room, over the floor, clear of the setup", () => {
    for (const shift of [0, coffeeShotShift(1440, 1440 / 900)]) {
      const { eye } = coffeeShotAt(1, COFFEE_START, shift);
      assert.ok(eye[1] > DESK_TOP.y + 0.1);
      assert.ok(eye[0] > DESK_TOP.x1, "past the desk's front edge");
      assert.ok(eye[2] > MAIN_ROOM.z0 + 0.2);
      assert.ok(
        dist([eye[0], eye[2]], CHAIR_PIVOT) > 0.45,
        "clear of the chair",
      );
      assert.equal(inside(eye, 0.05), false);
    }
  });

  it("slides the mug left of the open card, none once it stacks", () => {
    const shift = coffeeShotShift(1440, 1440 / 900);
    assert.ok(shift > 0.03 && shift < 0.15, `shift ${shift}`);
    assert.equal(coffeeShotShift(700, 0.5), 0);
    const moved = coffeeShotAt(1, COFFEE_START, shift);
    // Screen right while looking at the mug from +x/+z is toward -z.
    assert.ok(moved.target[2] < end.target[2]);
    assert.ok(
      near(
        moved.eye.map((v, i) => v - moved.target[i]),
        end.eye.map((v, i) => v - end.target[i]),
      ),
    );
  });

  it("is a slow eased dolly with a slight arc and a narrowing lens", () => {
    assert.ok(COFFEE_SHOT.duration >= 2.2 && COFFEE_SHOT.duration <= 3);
    const from = {
      eye: [2.2, 2.1, -0.2] as Vec3,
      target: [0.4, 1.2, -1] as Vec3,
      fov: GUIDE.fov,
    };
    const start = coffeeShotAt(0, from);
    assert.ok(near(start.eye, from.eye) && near(start.target, from.target));
    assert.equal(start.fov, GUIDE.fov);
    const stop = coffeeShotAt(1, from);
    assert.ok(near(stop.eye, end.eye) && near(stop.target, end.target));
    assert.equal(stop.fov, end.fov);
    // Eased: barely moves in the first and the last tenth.
    const total = dist(from.eye, end.eye);
    assert.ok(dist(coffeeShotAt(0.1, from).eye, from.eye) < total * 0.05);
    assert.ok(dist(coffeeShotAt(0.9, from).eye, end.eye) < total * 0.05);
    // A dolly in: the eye only closes on the mug; the lens only narrows.
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const now = coffeeShotAt(t, from);
      const before = coffeeShotAt(t - 0.05, from);
      assert.ok(
        dist(now.eye, end.target) <= dist(before.eye, end.target) + 1e-9,
      );
      assert.ok(now.fov <= before.fov + 1e-9);
    }
    // The arc: halfway, off the straight line, but only slightly.
    const mid = coffeeShotAt(0.5, from).eye;
    const line = from.eye.map((v, i) => (v + end.eye[i]) / 2);
    const off = dist(mid, line);
    assert.ok(off > 0.05 && off < 0.4, `arc ${off}`);
  });

  it("offers the end pose as an inspection view (centre, offset, lens)", () => {
    assert.ok(near(COFFEE_VIEW.centre, end.target));
    assert.ok(
      near(
        COFFEE_VIEW.offset,
        end.eye.map((v, i) => v - end.target[i]),
      ),
    );
    assert.equal(COFFEE_VIEW.fov, end.fov);
  });

  it("samples from a default room pose and clamps its time", () => {
    assert.ok(near(coffeeShotAt(0).eye, COFFEE_START.eye));
    assert.ok(near(coffeeShotAt(-1).eye, COFFEE_START.eye));
    assert.ok(near(coffeeShotAt(2).eye, end.eye));
  });

  it("leaves along the same path, reversed", () => {
    const back = {
      eye: [1.5, 1.7, -0.5] as Vec3,
      target: [0, 1.1, -1.4] as Vec3,
      fov: GUIDE.fov,
    };
    for (const t of [0, 0.3, 0.7, 1]) {
      const leave = coffeeLeaveAt(t, back);
      const enter = coffeeShotAt(1 - t, back);
      assert.ok(near(leave.eye, enter.eye) && near(leave.target, enter.target));
      assert.equal(leave.fov, enter.fov);
    }
    assert.ok(near(coffeeLeaveAt(1, back).eye, back.eye));
  });

  it("cuts straight to the shot under reduced motion", () => {
    assert.equal(coffeeShotProgress(0, true), 1);
    assert.equal(coffeeShotProgress(0, false), 0);
    assert.equal(coffeeShotProgress(COFFEE_SHOT.duration / 2, false), 0.5);
    assert.equal(coffeeShotProgress(99, false), 1);
    assert.equal(coffeeShotProgress(0, true, true), 1);
    assert.equal(
      coffeeShotProgress(COFFEE_SHOT.leaveDuration / 2, false, true),
      0.5,
    );
  });
});

describe("coffee hitbox (coffee-card T1)", () => {
  const hit = box(COFFEE_HITBOX.center, COFFEE_HITBOX.size);

  it("encloses the mug, its handle and the coaster, tightly", () => {
    assert.ok(hit.max[0] > mug.center[0] + HANDLE_REACH);
    assert.ok(hit.max[0] < mug.center[0] + HANDLE_REACH + 0.02);
    const coaster = itemBox("coaster");
    for (const i of [0, 2]) assert.ok(hit.min[i] < coaster.min[i]);
    assert.ok(hit.max[2] > coaster.max[2]);
    assert.ok(hit.min[1] >= DESK_TOP.y - 1e-9, "sits on the desk");
    assert.ok(hit.max[1] > mug.center[1] + mug.height);
    assert.ok(hit.max[1] < mug.center[1] + mug.height + 0.02);
  });

  it("stays clear of the mouse, the keyboard, the mat and the monitor", () => {
    assert.ok(gap(hit, itemBox("mouse")) > 0.2);
    assert.ok(gap(hit, itemBox("keyboard")) > 0.5);
    const kb = DESK_HITBOXES.keyboard;
    assert.ok(gap(hit, box(kb.center, kb.size)) > 0.5);
    assert.ok(gap(hit, itemBox("mat")) > 0.05);
    assert.ok(gap(hit, itemBox("monitor")) > 0.15);
    const monitorBottom = MAIN_MONITOR.center[1] - MAIN_MONITOR.size[1] / 2;
    assert.ok(monitorBottom - hit.max[1] > 0.05);
  });
});

describe("coffee card, mug and hitbox components (coffee-card T1, T2)", () => {
  const card = source("src/components/world/CoffeeCard.tsx");

  it("renders the helmet card's layout for Chiroso", () => {
    assert.match(card, /className="case-story coffee-card"/);
    assert.match(card, /case-story\.css/);
    assert.match(card, /coffee-card\.css/);
    assert.match(card, /case-story-head/);
    assert.match(card, /coffee-card-stats/);
    assert.match(card, /<svg/);
    assert.match(card, /story\.altitude/);
    assert.match(card, /case-story-media/);
    assert.match(card, />\s*Where to drink it\s*</);
    assert.doesNotMatch(card, /https?:\/\//, "no hard-coded requests");
  });

  it("shows the processes as accessible tabs with roving focus", () => {
    assert.match(card, /role="tablist"/);
    assert.match(card, /role="tab"/);
    assert.match(card, /aria-selected=\{/);
    assert.match(card, /aria-controls=/);
    assert.match(card, /tabIndex=\{[^}]*-1/);
    assert.match(card, /role="tabpanel"/);
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"])
      assert.match(card, new RegExp(`"${key}"`));
  });

  it("opens on Back to room and links Maps safely in a new tab", () => {
    assert.match(card, /Back to room/);
    assert.match(card, /onClose/);
    assert.match(card, /focus\(\{ preventScroll: true \}\)/);
    assert.match(card, /target="_blank"/);
    assert.match(card, /rel="noopener noreferrer"/);
    assert.match(card, /opens in a new tab/);
  });

  it("respects reduced motion in the card's transitions", () => {
    const css = source("src/components/world/coffee-card.css");
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /max-width: 1100px/);
    assert.match(css, /max-width: 700px/);
  });

  it("turns the mug from the pure timing and rests it afterwards", () => {
    const mug = source("src/components/world/CoffeeMug.tsx");
    assert.match(mug, /useFrame/);
    assert.match(mug, /mugTurnStep\(/);
    assert.match(mug, /mugPose\(/);
    assert.match(mug, /mugAtRest\(/);
    assert.match(mug, /reducedMotion/);
    assert.match(mug, /invalidate\(\)/);
    assert.match(mug, /rotation\.y/);
    assert.match(mug, /position\.y/);
  });

  it("makes an invisible, gated, drag-safe click box", () => {
    const hit = source("src/components/world/CoffeeHitbox.tsx");
    assert.match(hit, /COFFEE_HITBOX/);
    assert.match(hit, /event\.delta > CLICK_SLOP/);
    assert.match(hit, /canEnterMonitor\(/);
    assert.match(hit, /cursor = "pointer"/);
    assert.match(hit, /colorWrite=\{false\}/);
  });
});
