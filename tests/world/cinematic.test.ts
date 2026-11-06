import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GUIDE,
  guidePose,
  poseToPosition,
  type Vec3,
} from "../../src/lib/world/camera.ts";
import { CHERRY_SPOTS } from "../../src/lib/world/cherry.ts";
import { cherryShot } from "../../src/lib/world/cherry-shot.ts";
import {
  CINEMATIC,
  cinematicEase,
  cinematicEntry,
  cinematicLeaveAt,
  cinematicProgress,
  lensEase,
  type ShotPose,
} from "../../src/lib/world/cinematic.ts";
import {
  COFFEE_SHOT,
  coffeeLeaveAt,
  coffeeShotAt,
  coffeeShotProgress,
} from "../../src/lib/world/coffee-shot.ts";
import {
  KEYBOARD_SHOT,
  keyboardLeaveAt,
  keyboardShotAt,
  keyboardShotProgress,
} from "../../src/lib/world/keyboard-shot.ts";
import {
  SIGN_SHOT,
  signLeaveAt,
  signShotAt,
  signShotProgress,
} from "../../src/lib/world/sign-shot.ts";
import {
  TRUCK_SHOT,
  truckLeaveAt,
  truckShotAt,
  truckShotProgress,
} from "../../src/lib/world/truck-shot.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));

const home = (): ShotPose => ({
  eye: poseToPosition(guidePose(16 / 9)) as Vec3,
  target: GUIDE.target,
  fov: GUIDE.fov,
});

interface Shot {
  id: string;
  shotAt: (t: number, from: ShotPose, shift: number) => ShotPose;
  leaveAt: (t: number, to: ShotPose, shift: number) => ShotPose;
  progress: (elapsed: number, reduced: boolean, leaving?: boolean) => number;
  constants: { duration: number; leaveDuration: number };
}

const cherry = cherryShot(CHERRY_SPOTS[0]);
const SHOTS: Shot[] = [
  {
    id: "coffee",
    shotAt: coffeeShotAt,
    leaveAt: coffeeLeaveAt,
    progress: coffeeShotProgress,
    constants: COFFEE_SHOT,
  },
  {
    id: "keyboard",
    shotAt: keyboardShotAt,
    leaveAt: keyboardLeaveAt,
    progress: keyboardShotProgress,
    constants: KEYBOARD_SHOT,
  },
  {
    id: "sign",
    shotAt: signShotAt,
    leaveAt: signLeaveAt,
    progress: signShotProgress,
    constants: SIGN_SHOT,
  },
  {
    id: "truck",
    shotAt: truckShotAt,
    leaveAt: truckLeaveAt,
    progress: truckShotProgress,
    constants: TRUCK_SHOT,
  },
  {
    id: "cherry",
    shotAt: (t, from, shift) => cherry.shotAt(t, from, shift),
    leaveAt: (t, to, shift) => cherry.leaveAt(t, to, shift),
    progress: cherry.progress,
    constants: {
      duration: CINEMATIC.duration,
      leaveDuration: CINEMATIC.leaveDuration,
    },
  },
];

/** The end pose of every shot, from any start: one shot's arrival is another's live pose. */
const endOf = (shot: Shot) => shot.shotAt(1, home(), 0);

/** Poses the camera could be at when a close-up starts. */
const ROUTES: { name: string; live: ShotPose }[] = [
  { name: "the room orbit", live: home() },
  {
    name: "an orbited, zoomed room view",
    live: { eye: [6, 3.5, -7], target: [0.5, 0.8, -0.5], fov: GUIDE.fov },
  },
  // Monitor, portrait, speakers or TV close-up: a desk-side pose, normal lens.
  {
    name: "a desk close-up (monitor, portrait, speakers, TV)",
    live: { eye: [0.2, 1.25, -0.6], target: [0.1, 1.15, -2.1], fov: 30 },
  },
  ...SHOTS.map((shot) => ({
    name: `the ${shot.id} close-up`,
    live: endOf(shot),
  })),
];

describe("cinematic moves start where the camera is (dream-truck T3)", () => {
  it("enter from the live pose, whatever the route, and return to the room", () => {
    const room = home();
    // From the room: the live pose is both the start and the way back.
    const fresh = cinematicEntry(room, null);
    assert.deepEqual(fresh.from, room);
    assert.deepEqual(fresh.back, room);
    // From another close-up: the live pose starts the move; leaving still
    // returns to the room the visit began in, never jumps there first.
    for (const { name, live } of ROUTES) {
      const entry = cinematicEntry(live, room);
      assert.deepEqual(entry.from, live, name);
      assert.deepEqual(entry.back, room, name);
    }
  });

  it("leave from the live pose too, even when the move in had not finished", () => {
    const room = home();
    for (const shot of SHOTS) {
      const path = (t: number) => shot.leaveAt(t, room, 0);
      // Arrived: the shot's own path backwards.
      const arrived = shot.shotAt(1, room, 0);
      for (const t of [0, 0.3, 0.7, 1])
        assert.deepEqual(cinematicLeaveAt(t, arrived, room, path), path(t));
      // Closed half way in: no jump to the shot's end first.
      const halfway = shot.shotAt(0.5, room, 0);
      const first = cinematicLeaveAt(0, halfway, room, path);
      assert.ok(dist(first.eye, halfway.eye) < 1e-9, shot.id);
      assert.equal(first.fov, halfway.fov);
      const last = cinematicLeaveAt(1, halfway, room, path);
      assert.ok(dist(last.eye, room.eye) < 1e-9 && last.fov === room.fov);
    }
  });

  for (const shot of SHOTS)
    it(`plays the ${shot.id} shot from every live pose, with no detour home`, () => {
      const end = endOf(shot);
      for (const { name, live } of ROUTES) {
        const first = shot.shotAt(0, live, 0);
        // The first frame is the live pose: no snap.
        assert.ok(dist(first.eye, live.eye) < 1e-9, `${name}: eye`);
        assert.ok(dist(first.target, live.target) < 1e-9, `${name}: aim`);
        assert.equal(first.fov, live.fov, `${name}: lens`);
        // The first frames barely move: no jump to any other pose.
        const step = dist(
          shot.shotAt(1 / 60 / CINEMATIC.duration, live, 0).eye,
          live.eye,
        );
        assert.ok(step < 1e-3, `${name}: first frame moves ${step}`);
        // The eye only closes on the end: never a detour to the home view.
        const total = dist(live.eye, end.eye);
        let before = total;
        for (let t = 0.02; t <= 1.0001; t += 0.02) {
          const now = dist(shot.shotAt(t, live, 0).eye, end.eye);
          assert.ok(now <= before + 1e-6, `${name}: away from the end at ${t}`);
          before = now;
        }
        const last = shot.shotAt(1, live, 0);
        // The end pose does not depend on the route.
        assert.ok(dist(last.eye, end.eye) < 1e-9, `${name}: end eye`);
        assert.ok(dist(last.target, end.target) < 1e-9, `${name}: end aim`);
        assert.equal(last.fov, end.fov);
        // Leaving retraces the path back to `to`.
        assert.ok(dist(shot.leaveAt(1, live, 0).eye, live.eye) < 1e-9);
        assert.ok(dist(shot.leaveAt(0, live, 0).eye, end.eye) < 1e-9);
      }
    });
});

describe("calmer cinematic moves (dream-truck T3)", () => {
  it("take about 3.5-4 s in and 3 s out, every shot alike", () => {
    assert.ok(CINEMATIC.duration >= 3.5 && CINEMATIC.duration <= 4);
    assert.ok(Math.abs(CINEMATIC.leaveDuration - 3) < 0.01);
    for (const shot of SHOTS) {
      assert.equal(shot.constants.duration, CINEMATIC.duration, shot.id);
      assert.equal(
        shot.constants.leaveDuration,
        CINEMATIC.leaveDuration,
        shot.id,
      );
      assert.equal(shot.progress(CINEMATIC.duration / 2, false), 0.5);
      assert.equal(shot.progress(CINEMATIC.duration, false), 1);
      assert.equal(
        shot.progress(CINEMATIC.leaveDuration / 2, false, true),
        0.5,
      );
      assert.equal(shot.progress(CINEMATIC.leaveDuration, false, true), 1);
      // Reduced motion stays a cut, in and out.
      assert.equal(shot.progress(0, true), 1);
      assert.equal(shot.progress(0, true, true), 1);
    }
    assert.equal(cinematicProgress(0, true), 1);
    assert.equal(cinematicProgress(99, false), 1);
  });

  it("ease in and out gently: no sudden start, no sudden stop", () => {
    const h = 1e-4;
    const speed = (f: (t: number) => number, t: number) =>
      (f(t + h) - f(t - h)) / (2 * h);
    for (const f of [cinematicEase, lensEase]) {
      assert.equal(f(0), 0);
      assert.equal(f(1), 1);
      assert.ok(Math.abs(f(0.5) - 0.5) < 1e-9);
      assert.ok(speed(f, h) < 1e-2, "starts at rest");
      assert.ok(speed(f, 1 - h) < 1e-2, "lands at rest");
      for (let t = 0.01; t < 1; t += 0.01) assert.ok(f(t) >= f(t - 0.01));
    }
    // The eye's ease also starts without a kick in acceleration (quintic).
    const accel = (t: number) =>
      (cinematicEase(t + h) - 2 * cinematicEase(t) + cinematicEase(t - h)) /
      (h * h);
    assert.ok(Math.abs(accel(2 * h)) < 0.05, `${accel(2 * h)}`);
    // Peak speed under 2x the average (the old cubic peaked at 3x).
    let peak = 0;
    for (let t = 0.01; t < 1; t += 0.01)
      peak = Math.max(peak, speed(cinematicEase, t));
    assert.ok(peak < 2, `${peak}`);
  });

  it("spread the lens change over the whole move", () => {
    for (const shot of SHOTS) {
      const from = home();
      const end = endOf(shot);
      const change = end.fov - from.fov;
      if (Math.abs(change) < 1e-6) continue;
      const share = (t: number) =>
        (shot.shotAt(t, from, 0).fov - from.fov) / change;
      // Already under way in the first quarter, still going in the last.
      assert.ok(share(0.25) > 0.1, `${shot.id} ${share(0.25)}`);
      assert.ok(share(0.75) < 0.9, `${shot.id} ${share(0.75)}`);
    }
  });

  it("bow less: a small arc, never more than a third of a metre", () => {
    for (const shot of SHOTS) {
      for (const { live } of ROUTES.slice(0, 2)) {
        const end = endOf(shot);
        const mid = shot.shotAt(0.5, live, 0).eye;
        const s = cinematicEase(0.5);
        const line = live.eye.map((v, i) => v + (end.eye[i] - v) * s);
        const off = Math.hypot(mid[0] - line[0], mid[2] - line[2]);
        const travel = Math.hypot(
          end.eye[0] - live.eye[0],
          end.eye[2] - live.eye[2],
        );
        assert.ok(
          off <= 0.07 * travel + 1e-9,
          `${shot.id} ${off} of ${travel}`,
        );
        assert.ok(off <= 0.3 + 1e-9, `${shot.id} ${off}`);
      }
    }
  });
});

describe("GuidedCamera wiring (dream-truck T3)", () => {
  const scene = source("src/components/world/WorldScene.tsx");

  it("reads the pose the camera is drawn at, not a transition's end", () => {
    // camera-controls returns a transition's end value by default.
    assert.match(scene, /getPosition\(new Vector3\(\), false\)/);
    assert.match(scene, /getTarget\(new Vector3\(\), false\)/);
  });

  it("starts every cinematic move from the live pose through the shared helper", () => {
    assert.match(scene, /cinematicEntry\(/);
    assert.match(scene, /cinematicLeaveAt\(/);
    // The saved room pose is only where leaving returns, never the start.
    assert.doesNotMatch(scene, /:\s*shotFrom\.current;/);
  });

  it("builds every shot on the shared helper", () => {
    for (const file of ["coffee", "keyboard", "cherry", "sign", "truck"]) {
      const text = source(`src/lib/world/${file}-shot.ts`);
      assert.match(text, /from "\.\/cinematic\.ts"/, file);
      assert.match(text, /cinematicPoseAt\(/, file);
      assert.doesNotMatch(text, /const ease =/, file);
    }
  });
});
