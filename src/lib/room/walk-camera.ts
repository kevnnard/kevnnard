// Pure grounded walking camera around the house. The camera stays at a fixed
// eye height, inside a disc around the plot and outside every solid that
// reaches that height. PC/TV focus views are scripted and not limited by this.

import { type Bounds, type CameraView, fitView, type Vec3 } from "./camera.ts";
import {
  LEVELS,
  PARTS,
  ROOF,
  ROOM_BOUNDS,
  SCENE_BOUNDS,
} from "./house-layout.ts";

export type XZ = readonly [number, number];

export interface Rect {
  min: XZ;
  max: XZ;
}

export interface WalkPose {
  x: number;
  z: number;
  /** Heading around +y; 0 looks toward +z, like the orbit azimuth. */
  yaw: number;
  /** Radians above the horizon. */
  pitch: number;
}

export interface WalkInput {
  /** Each axis is clamped to -1..1. */
  forward: number;
  strafe: number;
  /** Positive turns right. */
  turn: number;
  /** Positive looks up. */
  tilt: number;
}

export interface WalkArea {
  /** Disc center on the ground (x, z). */
  center: XZ;
  /** Largest camera distance from `center`. */
  radius: number;
  /** World height of the camera. */
  eyeY: number;
  /** Solid footprints grown by the body radius; the camera stays outside. */
  blockers: readonly Rect[];
  /** Known walkable point used when an input position is invalid. */
  spawn: XZ;
}

export const WALK = {
  /** Eye height above the grass, in world units. */
  eyeHeight: 2,
  /** Clearance kept between the camera and any solid. */
  bodyRadius: 0.45,
  /** Look target distance; smaller than bodyRadius so it never enters a solid. */
  lookDistance: 0.25,
  /** Slightly down, so the floor of the room stays visible. */
  minPitch: -0.2,
  /** Almost straight up. */
  maxPitch: 1.45,
  /** Walking speed (units/s) and keyboard turn speed (rad/s). */
  speed: 3.5,
  turnSpeed: 1.6,
  /** Longest frame step after a pause or resume, in seconds. */
  maxFrame: 0.1,
  /** Longest single wheel/pinch step, in units. */
  maxStep: 0.6,
  /** Extra walking room around the plot's half-diagonal. */
  margin: 3,
} as const;

// Directions from the room to where the cutaway is open (-x/+z).
const OPEN_SIDE: Vec3 = [-Math.SQRT1_2, 0, Math.SQRT1_2];
// The eye sits below the room center, so the near top corner needs more room
// than a level fit.
const HOME_MARGIN = 1.3;
const EPSILON = 1e-6;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));
const finite = (value: number) => (Number.isFinite(value) ? value : 0);
const center3 = (box: Bounds) =>
  [0, 1, 2].map((i) => (box.min[i] + box.max[i]) / 2);

export function walkArea(): WalkArea {
  const eyeY = LEVELS.terrainTop + WALK.eyeHeight;
  // Anything taller than waist height blocks: walls, facade, posts, roofs and
  // the room. Hedges, furniture and paving pass under the eye.
  const waist = LEVELS.terrainTop + WALK.eyeHeight / 2;
  const roof: Bounds = {
    min: [ROOF.x[0], ROOF.eave, ROOF.z[0]],
    max: [ROOF.x[1], ROOF.ridge, ROOF.z[1]],
  };
  const solids: Bounds[] = [
    ROOM_BOUNDS,
    roof,
    ...PARTS.filter((part) => part.max[1] > waist),
  ];
  const r = WALK.bodyRadius;
  const blockers = solids.map(
    (box): Rect => ({
      min: [box.min[0] - r, box.min[2] - r],
      max: [box.max[0] + r, box.max[2] + r],
    }),
  );
  const [cx, , cz] = center3(SCENE_BOUNDS);
  const radius =
    Math.hypot(SCENE_BOUNDS.max[0] - cx, SCENE_BOUNDS.max[2] - cz) +
    WALK.margin;
  const area = {
    center: [cx, cz] as XZ,
    radius,
    eyeY,
    blockers,
    spawn: [0, 0] as XZ,
  };
  // Halfway out from the room on the open side is clear of every solid.
  const [rx, , rz] = center3(ROOM_BOUNDS);
  area.spawn = intoDisc(area, [
    rx + OPEN_SIDE[0] * radius * 0.6,
    rz + OPEN_SIDE[2] * radius * 0.6,
  ]);
  return area;
}

export const WALK_AREA = walkArea();

/** Farthest the camera or its target get from the world origin. */
export function walkReach(area: WalkArea): number {
  return Math.hypot(...area.center) + area.radius + WALK.lookDistance;
}

function intoDisc(area: WalkArea, [x, z]: XZ): XZ {
  const dx = x - area.center[0];
  const dz = z - area.center[1];
  const distance = Math.hypot(dx, dz);
  if (distance <= area.radius) return [x, z];
  const scale = area.radius / distance;
  return [area.center[0] + dx * scale, area.center[1] + dz * scale];
}

const blocked = (area: WalkArea, x: number, z: number) =>
  area.blockers.some(
    (b) => x > b.min[0] && x < b.max[0] && z > b.min[1] && z < b.max[1],
  );

export function isWalkable(area: WalkArea, x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const inDisc =
    Math.hypot(x - area.center[0], z - area.center[1]) <= area.radius + 1e-9;
  return inDisc && !blocked(area, x, z);
}

/** Nearest walkable point found by leaving the blocker sides, or the spawn. */
function settle(area: WalkArea, point: XZ): XZ {
  if (!point.every(Number.isFinite)) return area.spawn;
  const [x, z] = intoDisc(area, point);
  if (isWalkable(area, x, z)) return [x, z];
  let best: XZ = area.spawn;
  let bestDistance = Infinity;
  for (const b of area.blockers) {
    const candidates: XZ[] = [
      [b.min[0] - EPSILON, z],
      [b.max[0] + EPSILON, z],
      [x, b.min[1] - EPSILON],
      [x, b.max[1] + EPSILON],
    ];
    for (const [cx, cz] of candidates) {
      const distance = Math.hypot(cx - x, cz - z);
      if (distance < bestDistance && isWalkable(area, cx, cz)) {
        best = [cx, cz];
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * Moves from `from` toward `to` in short sub-steps, sliding along walls and
 * the disc edge. Never tunnels and always returns a walkable point.
 */
export function moveWithin(area: WalkArea, from: XZ, to: XZ): XZ {
  let [x, z] = settle(area, from);
  if (!to.every(Number.isFinite)) return [x, z];
  let dx = to[0] - x;
  let dz = to[1] - z;
  const length = Math.hypot(dx, dz);
  if (length === 0) return [x, z];
  // Never travel further than across the disc, whatever the input.
  const travel = Math.min(length, area.radius * 2);
  const steps = Math.ceil(travel / (WALK.bodyRadius / 2));
  dx = (dx / length) * (travel / steps);
  dz = (dz / length) * (travel / steps);
  for (let i = 0; i < steps; i++) {
    const tries: XZ[] = [
      [x + dx, z + dz],
      [x + dx, z],
      [x, z + dz],
    ];
    const next = tries
      .map((point) => intoDisc(area, point))
      .find(([nx, nz]) => isWalkable(area, nx, nz));
    if (!next) break;
    [x, z] = next;
  }
  return [x, z];
}

const wrap = (angle: number) =>
  angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));

/** Turns by `yaw` and tilts by `pitch` radians; non-finite input is ignored. */
export function look(pose: WalkPose, yaw: number, pitch: number): WalkPose {
  const nextYaw = wrap(pose.yaw + finite(yaw));
  return {
    ...pose,
    yaw: Number.isFinite(nextYaw) ? clamp(nextYaw, -Math.PI, Math.PI) : 0,
    pitch: clamp(pose.pitch + finite(pitch), WALK.minPitch, WALK.maxPitch),
  };
}

/** Walks `forward` and `strafe` units along the ground, at most `maxStep`. */
export function walk(
  area: WalkArea,
  pose: WalkPose,
  forward: number,
  strafe: number,
): WalkPose {
  let f = clamp(finite(forward), -WALK.maxStep, WALK.maxStep);
  let s = clamp(finite(strafe), -WALK.maxStep, WALK.maxStep);
  const length = Math.hypot(f, s);
  if (length > WALK.maxStep) {
    f *= WALK.maxStep / length;
    s *= WALK.maxStep / length;
  }
  const sin = Math.sin(pose.yaw);
  const cos = Math.cos(pose.yaw);
  // Right of a camera facing (sin, cos) on the ground is (-cos, sin).
  const [x, z] = moveWithin(
    area,
    [pose.x, pose.z],
    [pose.x + sin * f - cos * s, pose.z + cos * f + sin * s],
  );
  return { ...pose, x, z };
}

/** One keyboard frame; `dt` is clamped so a resume never jumps. */
export function stepWalk(
  area: WalkArea,
  pose: WalkPose,
  input: WalkInput,
  dt: number,
): WalkPose {
  const time = clamp(finite(dt), 0, WALK.maxFrame);
  if (time === 0) return pose;
  const axis = (value: number) => clamp(finite(value), -1, 1);
  const turned = look(
    pose,
    -axis(input.turn) * WALK.turnSpeed * time,
    axis(input.tilt) * WALK.turnSpeed * time,
  );
  const distance = WALK.speed * time;
  return walk(
    area,
    turned,
    axis(input.forward) * distance,
    axis(input.strafe) * distance,
  );
}

export function walkView(area: WalkArea, pose: WalkPose): CameraView {
  const [x, z] = settle(area, [pose.x, pose.z]);
  const pitch = clamp(finite(pose.pitch), WALK.minPitch, WALK.maxPitch);
  const yaw = finite(pose.yaw);
  const flat = Math.cos(pitch) * WALK.lookDistance;
  const position: Vec3 = [x, area.eyeY, z];
  const target: Vec3 = [
    x + Math.sin(yaw) * flat,
    area.eyeY + Math.sin(pitch) * WALK.lookDistance,
    z + Math.cos(yaw) * flat,
  ];
  return { position, target };
}

/**
 * Starting pose: from the open -x/+z side, as close as fits `room` on screen
 * (limited by the disc on narrow screens), looking at the room center.
 */
export function homePose(
  area: WalkArea,
  fovDegrees: number,
  aspect: number,
  room: Bounds = ROOM_BOUNDS,
): WalkPose {
  const fit = fitView(room, fovDegrees, aspect, OPEN_SIDE, HOME_MARGIN);
  const [x, z] = settle(area, [fit.position[0], fit.position[2]]);
  const [rx, ry, rz] = center3(room);
  const yaw = Math.atan2(rx - x, rz - z);
  const pitch = clamp(
    Math.atan2(ry - area.eyeY, Math.hypot(rx - x, rz - z)),
    WALK.minPitch,
    WALK.maxPitch,
  );
  return { x, z, yaw, pitch };
}
