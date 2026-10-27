import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Bounds,
  fitView,
  focusView,
  MIN_EYE_HEIGHT,
  orbitLimits,
  overviewView,
  SCREENS,
  type Vec3,
} from "../../src/lib/room/camera.ts";
import {
  LEVELS,
  PARTS,
  ROOF,
  SCENE_BOUNDS,
  TARGET_BOUNDS,
} from "../../src/lib/room/house-layout.ts";

const room = { min: [-3.46, 0, -3.06], max: [3.47, 4.74, 3.0] } as const;
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("overviewView", () => {
  it("looks at the bounds center from the open (-x, +z) side, outside the room", () => {
    const view = overviewView(room, 45, 16 / 9);
    assert.deepEqual(
      view.target.map((v) => +v.toFixed(3)),
      [0.005, 2.37, -0.03],
    );
    assert.ok(view.position[0] < room.min[0]);
    assert.ok(view.position[2] > room.max[2]);
    assert.ok(view.position[1] > view.target[1]);
  });

  it("backs off further on portrait viewports so the room still fits", () => {
    const wide = overviewView(room, 45, 16 / 9);
    const tall = overviewView(room, 45, 9 / 16);
    assert.ok(
      dist(tall.position, tall.target) > dist(wide.position, wide.target),
    );
  });
});

describe("focusView", () => {
  it("places the camera in front of the PC screen along its facing normal", () => {
    const { position, target } = focusView(SCREENS.pc, 45, 16 / 9);
    assert.deepEqual(target, SCREENS.pc.position);
    // rotation y -1.53 faces -x, so the camera sits at smaller x, same height.
    assert.ok(position[0] < SCREENS.pc.position[0]);
    assert.ok(Math.abs(position[1] - SCREENS.pc.position[1]) < 1e-9);
    assert.ok(dist(position, target) > 0.3 && dist(position, target) < 2);
  });

  it("places the camera in front of the TV (+z) and further away on narrow screens", () => {
    const wide = focusView(SCREENS.tv, 45, 16 / 9);
    const narrow = focusView(SCREENS.tv, 45, 9 / 19);
    assert.ok(wide.position[2] > SCREENS.tv.position[2]);
    assert.ok(
      dist(narrow.position, narrow.target) > dist(wide.position, wide.target),
    );
  });
});

describe("existing room framing (regression)", () => {
  const rounded = (v: readonly number[]) => v.map((n) => +n.toFixed(4));

  it("keeps the measured-room overview unchanged", () => {
    assert.deepEqual(
      rounded(overviewView(room, 45, 16 / 9).position),
      [-6.8538, 7.1712, 6.8288],
    );
    assert.deepEqual(
      rounded(overviewView(room, 45, 9 / 16).position),
      [-11.5621, 10.4669, 11.5371],
    );
  });

  it("keeps the PC and TV focus positions unchanged", () => {
    assert.deepEqual(
      rounded(focusView(SCREENS.pc, 45, 16 / 9).position),
      [2.6329, 1.483, 0.5709],
    );
    assert.deepEqual(
      rounded(focusView(SCREENS.pc, 45, 9 / 19).position),
      [1.3849, 1.483, 0.6218],
    );
    assert.deepEqual(
      rounded(focusView(SCREENS.tv, 45, 16 / 9).position),
      [-1.365, 1.061, -1.7849],
    );
    assert.deepEqual(
      rounded(focusView(SCREENS.tv, 45, 9 / 19).position),
      [-1.365, 1.061, 0.6808],
    );
  });
});

describe("house overview and orbit limits", () => {
  const ASPECTS = [16 / 9, 4 / 3, 1, 9 / 16, 9 / 19];
  const rig = (aspect: number) => {
    const overview = fitView(SCENE_BOUNDS, 45, aspect);
    return {
      overview,
      limits: orbitLimits({
        overview,
        scene: SCENE_BOUNDS,
        boundary: TARGET_BOUNDS,
        groundY: LEVELS.terrainTop,
      }),
    };
  };
  const spherical = (view: { position: Vec3; target: Vec3 }) => {
    const offset = view.position.map((v, i) => v - view.target[i]);
    const radius = Math.hypot(...offset);
    return {
      radius,
      polar: Math.acos(offset[1] / radius),
      azimuth: Math.atan2(offset[0], offset[2]),
    };
  };
  const contains = (box: Bounds, point: readonly number[], pad = 0) =>
    point.every((v, i) => v >= box.min[i] - pad && v <= box.max[i] + pad);
  const corners = (box: Bounds) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((bits) =>
      [0, 1, 2].map((i) => ((bits >> i) & 1 ? box.max[i] : box.min[i])),
    );

  it("frames every plot and roof corner inside the view frustum", () => {
    for (const aspect of ASPECTS) {
      const { position, target } = fitView(SCENE_BOUNDS, 45, aspect);
      const forward = target.map((v, i) => v - position[i]);
      const length = Math.hypot(...forward);
      const f = forward.map((v) => v / length);
      const right = [-f[2], 0, f[0]].map((v) => v / Math.hypot(f[0], f[2]));
      const up = [
        right[1] * f[2] - right[2] * f[1],
        right[2] * f[0] - right[0] * f[2],
        right[0] * f[1] - right[1] * f[0],
      ];
      const tanV = Math.tan(((45 / 2) * Math.PI) / 180);
      const tanH = tanV * aspect;
      let tightest = 0;
      for (const corner of corners(SCENE_BOUNDS)) {
        const r = corner.map((v, i) => v - position[i]);
        const dot = (a: readonly number[]) =>
          r[0] * a[0] + r[1] * a[1] + r[2] * a[2];
        const depth = dot(f);
        assert.ok(depth > 0);
        const used = Math.max(
          Math.abs(dot(right)) / (depth * tanH),
          Math.abs(dot(up)) / (depth * tanV),
        );
        assert.ok(used <= 1 + 1e-9, `corner ${corner} clipped at ${aspect}`);
        tightest = Math.max(tightest, used);
      }
      // A fit, not a far-away bounding sphere.
      assert.ok(tightest > 0.85, `loose fit ${tightest} at ${aspect}`);
    }
  });

  it("returns finite limits that the overview itself satisfies", () => {
    for (const aspect of ASPECTS) {
      const { overview, limits } = rig(aspect);
      for (const value of [
        limits.minDistance,
        limits.maxDistance,
        limits.minPolarAngle,
        limits.maxPolarAngle,
        limits.minAzimuthAngle,
        limits.maxAzimuthAngle,
        limits.far,
        ...limits.boundary.min,
        ...limits.boundary.max,
      ])
        assert.ok(Number.isFinite(value));
      const view = spherical(overview);
      assert.ok(
        view.radius >= limits.minDistance && view.radius <= limits.maxDistance,
      );
      assert.ok(
        view.polar >= limits.minPolarAngle &&
          view.polar <= limits.maxPolarAngle,
      );
      assert.ok(
        view.azimuth >= limits.minAzimuthAngle &&
          view.azimuth <= limits.maxAzimuthAngle,
      );
      assert.ok(contains(limits.boundary, overview.target));
    }
  });

  it("never lets the camera reach the ground or look under the plot", () => {
    for (const aspect of ASPECTS) {
      const { limits } = rig(aspect);
      assert.ok(limits.maxPolarAngle < Math.PI / 2);
      // y = target.y + distance * cos(polar) is smallest at these extremes.
      const lowest =
        limits.boundary.min[1] +
        limits.minDistance * Math.cos(limits.maxPolarAngle);
      assert.ok(lowest >= LEVELS.terrainTop + MIN_EYE_HEIGHT);
    }
  });

  it("allows backing off further on portrait, within the camera far plane", () => {
    const wide = rig(16 / 9).limits;
    const tall = rig(9 / 19).limits;
    assert.ok(tall.maxDistance > wide.maxDistance);
    for (const limits of [wide, tall]) {
      let reach = 0;
      for (const a of corners(limits.boundary))
        for (const b of corners(SCENE_BOUNDS))
          reach = Math.max(reach, Math.hypot(...a.map((v, i) => v - b[i])));
      assert.ok(limits.maxDistance + reach <= limits.far);
    }
  });

  it("keeps the PC and TV targets inside the pan boundary", () => {
    const { limits } = rig(16 / 9);
    for (const screen of [SCREENS.pc, SCREENS.tv])
      assert.ok(contains(limits.boundary, screen.position));
  });

  it("never places a reachable camera inside the house shell", () => {
    const { limits } = rig(9 / 19);
    const shell: Bounds[] = [
      ...PARTS.filter((part) => part.max[1] > LEVELS.roomFloor),
      {
        min: [ROOF.x[0], ROOF.eave, ROOF.z[0]],
        max: [ROOF.x[1], ROOF.ridge, ROOF.z[1]],
      },
    ];
    const steps = (lo: number, hi: number, n: number) =>
      Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
    const targets = steps(0, 1, 4).flatMap((u) =>
      steps(0, 1, 3).flatMap((v) =>
        steps(0, 1, 4).map((w) =>
          [u, v, w].map(
            (t, i) =>
              limits.boundary.min[i] +
              t * (limits.boundary.max[i] - limits.boundary.min[i]),
          ),
        ),
      ),
    );
    const distances = steps(
      limits.minDistance,
      Math.min(limits.maxDistance, 24),
      8,
    );
    for (const target of targets)
      for (const azimuth of steps(
        limits.minAzimuthAngle,
        limits.maxAzimuthAngle,
        9,
      ))
        for (const polar of steps(
          limits.minPolarAngle,
          limits.maxPolarAngle,
          6,
        ))
          for (const radius of distances) {
            const camera = [
              target[0] + radius * Math.sin(polar) * Math.sin(azimuth),
              target[1] + radius * Math.cos(polar),
              target[2] + radius * Math.sin(polar) * Math.cos(azimuth),
            ];
            for (const solid of shell)
              assert.ok(
                !contains(solid, camera, 0.1),
                `camera ${camera} in shell`,
              );
          }
  });
});
