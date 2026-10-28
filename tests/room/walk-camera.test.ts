import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { fitView } from "../../src/lib/room/camera.ts";
import { VIEW_ZONE } from "../../src/lib/room/forest-view.ts";
import {
  LEVELS,
  PARTS,
  PLOT,
  ROOF,
  ROOM_BOUNDS,
  SCENE_BOUNDS,
} from "../../src/lib/room/house-layout.ts";
import {
  homePose,
  isWalkable,
  look,
  moveWithin,
  stepWalk,
  WALK,
  WALK_AREA,
  type WalkArea,
  type WalkPose,
  walk,
  walkReach,
  walkView,
} from "../../src/lib/room/walk-camera.ts";

const ASPECTS = [16 / 9, 4 / 3, 1, 9 / 16, 9 / 19];
const area = WALK_AREA;
const EYE_Y = LEVELS.terrainTop + WALK.eyeHeight;
const ROOM_CENTER = [0, 1, 2].map(
  (i) => (ROOM_BOUNDS.min[i] + ROOM_BOUNDS.max[i]) / 2,
);
const ROOF_BOX = {
  min: [ROOF.x[0], ROOF.eave, ROOF.z[0]],
  max: [ROOF.x[1], ROOF.ridge, ROOF.z[1]],
};
// Every solid that reaches the camera height: walls, facade, posts, roofs, room.
const SHELL = [
  ROOM_BOUNDS,
  ROOF_BOX,
  ...PARTS.filter((part) => part.max[1] > EYE_Y - WALK.eyeHeight / 2),
];
const inside = (
  box: { min: readonly number[]; max: readonly number[] },
  point: readonly number[],
) => point.every((v, i) => v > box.min[i] && v < box.max[i]);
const fromCenter = (x: number, z: number) =>
  Math.hypot(x - area.center[0], z - area.center[1]);
const HUGE = [0.01, 0.3, 2, 40, 1e3, 1e9, 1e300, Infinity, -Infinity, NaN];
const DIRECTIONS = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2);

/** Grid of reachable start poses: every walkable cell around the house. */
const STARTS: WalkPose[] = [];
for (let x = -14; x <= 20; x += 1.7)
  for (let z = -15; z <= 18; z += 1.7)
    if (isWalkable(area, x, z)) STARTS.push({ x, z, yaw: 0, pitch: 0 });

function assertPhysical(pose: WalkPose, label: string) {
  const { position, target } = walkView(area, pose);
  assert.ok(
    [...position, ...target].every(Number.isFinite),
    `${label}: finite`,
  );
  assert.ok(isWalkable(area, position[0], position[2]), `${label}: walkable`);
  assert.ok(
    fromCenter(position[0], position[2]) <= area.radius + 1e-9,
    `${label}: camera in disc`,
  );
  assert.ok(
    fromCenter(target[0], target[2]) <= area.radius + WALK.lookDistance + 1e-9,
    `${label}: target in disc`,
  );
  for (const point of [position, target]) {
    assert.ok(point[1] > LEVELS.terrainTop + 1, `${label}: above terrain`);
    for (const solid of SHELL)
      assert.ok(!inside(solid, point), `${label}: ${point} inside shell`);
  }
}

describe("walk area", () => {
  it("is a small ground-level zone in front of the cutaway, not the whole plot", () => {
    assert.deepEqual(area.center, VIEW_ZONE.center);
    assert.equal(area.radius, VIEW_ZONE.radius);
    assert.ok(area.radius <= 4);
    // The plot corners are out of reach: no walking around the house.
    for (const x of [PLOT.min[0], PLOT.max[0]])
      for (const z of [PLOT.min[2], PLOT.max[2]])
        assert.ok(fromCenter(x, z) > area.radius);
    assert.ok(Math.abs(area.eyeY - EYE_Y) < 1e-12);
    assert.ok(WALK.eyeHeight >= 1.5 && WALK.eyeHeight <= 2.2);
  });

  it("publishes how far from the world origin the camera and target reach", () => {
    const reach = walkReach(area);
    assert.ok(Number.isFinite(reach));
    for (const angle of DIRECTIONS) {
      const x = area.center[0] + Math.sin(angle) * area.radius;
      const z = area.center[1] + Math.cos(angle) * area.radius;
      assert.ok(Math.hypot(x, z) + WALK.lookDistance <= reach + 1e-9);
    }
    assert.ok(reach < 20);
  });

  it("blocks the room, wing shell, roofs and posts but not low hedges or furniture", () => {
    const center = (box: { min: readonly number[]; max: readonly number[] }) =>
      [0, 2].map((i) => (box.min[i] + box.max[i]) / 2);
    for (const solid of SHELL) {
      const [x, z] = center(solid);
      assert.ok(!isWalkable(area, x, z), `solid at ${x}, ${z} is walkable`);
      assert.ok(
        area.blockers.some(
          (b) => x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1],
        ),
        `solid at ${x}, ${z} is not a blocker`,
      );
    }
    for (const id of ["hedge-front-west", "patio-bench", "patio-table"]) {
      const part = PARTS.find((p) => p.id === id);
      assert.ok(part);
      const [x, z] = center(part);
      assert.ok(
        !area.blockers.some(
          (b) => x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1],
        ),
        `${id} blocks walking`,
      );
    }
    assert.ok(!isWalkable(area, NaN, 0));
    assert.ok(!isWalkable(area, 0, Infinity));
  });
});

describe("home pose", () => {
  it("starts low on the open -x/+z side, facing the room cutaway, for every aspect", () => {
    for (const aspect of ASPECTS) {
      const pose = homePose(area, 45, aspect);
      assertPhysical(pose, `home ${aspect}`);
      const { position, target } = walkView(area, pose);
      // One deterministic spot; only the aim adapts to the screen shape.
      assert.deepEqual([position[0], position[2]], [...VIEW_ZONE.home]);
      assert.equal(position[1], area.eyeY);
      assert.ok(position[0] < ROOM_BOUNDS.min[0]);
      assert.ok(position[2] > ROOM_BOUNDS.max[2]);
      // Far lower than the old aerial overview of the whole plot.
      const aerial = fitView(SCENE_BOUNDS, 45, aspect);
      assert.ok(position[1] < aerial.position[1] / 3);
      // Facing the room center with the real Three.js camera.
      const camera = new PerspectiveCamera(45, aspect, 0.05, 700);
      camera.position.fromArray(position);
      camera.lookAt(new Vector3().fromArray(target));
      camera.updateMatrixWorld();
      const ndc = new Vector3().fromArray(ROOM_CENTER).project(camera);
      // Landscape leaves the room right of center so the forest can frame
      // the left; narrow screens center it.
      assert.ok(
        ndc.x > -0.05 && ndc.x < 0.45 && Math.abs(ndc.y) < 0.5,
        `${ndc}`,
      );
      if (aspect < 1) assert.ok(Math.abs(ndc.x) < 0.05, `${ndc}`);
      assert.ok(ndc.z > -1 && ndc.z < 1);
    }
  });

  it("frames the whole room cutaway on landscape screens", () => {
    for (const aspect of [16 / 9, 4 / 3]) {
      const { position, target } = walkView(area, homePose(area, 45, aspect));
      const camera = new PerspectiveCamera(45, aspect, 0.05, 700);
      camera.position.fromArray(position);
      camera.lookAt(new Vector3().fromArray(target));
      camera.updateMatrixWorld();
      for (let bits = 0; bits < 8; bits++) {
        const corner = [0, 1, 2].map((i) =>
          (bits >> i) & 1 ? ROOM_BOUNDS.max[i] : ROOM_BOUNDS.min[i],
        );
        const ndc = new Vector3().fromArray(corner).project(camera);
        assert.ok(
          Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
          `corner ${corner} clipped at ${aspect}`,
        );
      }
    }
  });

  it("can frame bounds measured from the loaded room", () => {
    const measured = { min: [-3.5, 0, -3.1], max: [3.5, 4.8, 3.1] };
    const pose = homePose(area, 45, 16 / 9, measured);
    assertPhysical(pose, "measured home");
  });
});

describe("looking", () => {
  const start: WalkPose = {
    x: VIEW_ZONE.home[0],
    z: VIEW_ZONE.home[1],
    yaw: 0.4,
    pitch: 0,
  };

  it("looks almost straight up but barely down, even for huge input", () => {
    assert.ok(WALK.maxPitch > 1.35 && WALK.maxPitch < Math.PI / 2);
    assert.ok(WALK.minPitch <= 0 && WALK.minPitch >= -0.25);
    for (const amount of HUGE) {
      const up = look(start, 0, amount);
      const down = look(start, 0, -amount);
      for (const pose of [up, down]) {
        assert.ok(pose.pitch >= WALK.minPitch && pose.pitch <= WALK.maxPitch);
        assertPhysical(pose, `pitch ${amount}`);
      }
    }
    assert.equal(look(start, 0, 10).pitch, WALK.maxPitch);
    assert.equal(look(start, 0, -10).pitch, WALK.minPitch);
  });

  it("keeps the eye height while looking: the camera never dips with pitch", () => {
    for (const pitch of [WALK.minPitch, 0, WALK.maxPitch]) {
      const { position, target } = walkView(area, { ...start, pitch });
      assert.equal(position[1], area.eyeY);
      assert.ok(target[1] >= area.eyeY - WALK.lookDistance);
    }
  });

  it("wraps yaw and ignores non-finite turns", () => {
    for (const amount of HUGE) {
      const pose = look(start, amount, 0);
      assert.ok(Number.isFinite(pose.yaw));
      assert.ok(pose.yaw >= -Math.PI && pose.yaw <= Math.PI);
    }
    assert.equal(look(start, NaN, NaN).yaw, start.yaw);
    assert.equal(look(start, NaN, NaN).pitch, start.pitch);
  });
});

// A disc with one solid crossing it exercises collision independently of
// where the shipped zone sits.
const WALLED: WalkArea = {
  center: [0, 0],
  radius: 8,
  eyeY: EYE_Y,
  blockers: [{ min: [-6, -1], max: [6, 1] }],
  spawn: [0, -4],
};

describe("walking and collision", () => {
  it("never leaves the disc or enters a solid, for any direction and magnitude", () => {
    for (const start of STARTS)
      for (const yaw of DIRECTIONS)
        for (const amount of HUGE) {
          const pose = { ...start, yaw };
          assertPhysical(walk(area, pose, amount, 0), "forward");
          assertPhysical(walk(area, pose, 0, amount), "strafe");
          const [x, z] = moveWithin(
            area,
            [start.x, start.z],
            [
              start.x + Math.sin(yaw) * amount,
              start.z + Math.cos(yaw) * amount,
            ],
          );
          assertPhysical({ x, z, yaw: 0, pitch: 0 }, "moveWithin");
        }
  });

  it("caps one wheel/pinch step and does not tunnel through a solid", () => {
    const north: WalkPose = { x: 2, z: -3, yaw: 0, pitch: 0 };
    assert.ok(isWalkable(WALLED, north.x, north.z));
    let pose = walk(WALLED, north, 1e9, 0);
    assert.ok(
      Math.hypot(pose.x - north.x, pose.z - north.z) <= WALK.maxStep + 1e-9,
    );
    for (let i = 0; i < 100; i++) pose = walk(WALLED, pose, 1e9, 0);
    // Pushed straight at the wall, it stops in front of it, never beyond.
    assert.ok(pose.z <= -1, `tunneled to ${pose.z}`);
    const [, z] = moveWithin(WALLED, [north.x, north.z], [north.x, 1e9]);
    assert.ok(z <= -1);
  });

  it("slides along walls instead of sticking", () => {
    const north: WalkPose = { x: -2, z: -3, yaw: Math.PI / 4, pitch: 0 };
    let pose = north;
    for (let i = 0; i < 20; i++) pose = walk(WALLED, pose, 0.5, 0);
    assert.ok(pose.x > north.x + 2, `stuck at ${pose.x}`);
    assert.ok(pose.z <= -1);
  });

  it("slides along the disc edge", () => {
    const home = homePose(area, 45, 16 / 9);
    let pose = { ...home, yaw: Math.atan2(-1, 1) };
    for (let i = 0; i < 200; i++) pose = walk(area, pose, 0.5, 0);
    assert.ok(fromCenter(pose.x, pose.z) > area.radius - 1e-6);
    assertPhysical(pose, "edge");
  });

  it("strafes to the camera's right", () => {
    const pose: WalkPose = {
      x: VIEW_ZONE.home[0],
      z: VIEW_ZONE.home[1],
      yaw: 0,
      pitch: 0,
    };
    // Facing +z, right is -x in a right-handed y-up scene.
    assert.ok(walk(area, pose, 0, 0.5).x < pose.x);
  });

  it("settles an invalid start inside the walk area", () => {
    for (const from of [
      [0, 0],
      [6, 0],
      [1e9, -1e9],
      [NaN, 3],
    ] as const) {
      const [x, z] = moveWithin(area, from, from);
      assertPhysical({ x, z, yaw: 0, pitch: 0 }, `settle ${from}`);
    }
  });
});

describe("stepWalk", () => {
  const start: WalkPose = {
    x: VIEW_ZONE.home[0],
    z: VIEW_ZONE.home[1],
    yaw: 0,
    pitch: 0,
  };
  const input = { forward: 1, strafe: 0, turn: 0, tilt: 0 };

  it("clamps the frame time after a pause or resume", () => {
    const moved = stepWalk(area, start, input, 1e6);
    const limit = WALK.speed * WALK.maxFrame;
    assert.ok(Math.hypot(moved.x - start.x, moved.z - start.z) <= limit + 1e-9);
    for (const dt of [0, -1, NaN, -Infinity])
      assert.deepEqual(stepWalk(area, start, input, dt), start);
  });

  it("clamps axes, turns, tilts within limits and stays physical", () => {
    const huge = { forward: 1e9, strafe: -1e9, turn: 1e9, tilt: 1e9 };
    let pose = start;
    for (let i = 0; i < 200; i++) pose = stepWalk(area, pose, huge, 1);
    assert.equal(pose.pitch, WALK.maxPitch);
    assertPhysical(pose, "stepWalk");
    const nan = { forward: NaN, strafe: NaN, turn: NaN, tilt: NaN };
    assert.deepEqual(stepWalk(area, start, nan, 0.05), start);
  });
});
