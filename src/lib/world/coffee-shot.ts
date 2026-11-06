// The coffee mug's cinematic close-up (coffee-card T1): a slow eased dolly
// with a slight arc from wherever the camera is to a low, close 3/4 shot of
// the steaming cup on its wooden coaster, the lens narrowing a little on the
// way; reduced motion cuts straight to the shot. Leaving runs the same path
// backwards. The move itself is the shared one (cinematic.ts). Pure
// numbers; the scene samples `coffeeShotAt` each frame.

import { GUIDE, type Vec3 } from "./camera.ts";
import {
  CINEMATIC,
  cinematicPoseAt,
  cinematicProgress,
  type ShotPose,
} from "./cinematic.ts";
import { STORY_CARD } from "./gallery-camera.ts";
import { COASTER, DESK_TOP, SETUP_PROPS } from "./setup.ts";

export type { ShotPose };

const MUG = SETUP_PROPS.mug;
/** Padding around the click target, each side (as setup.ts HIT_PAD). */
const HIT_PAD = 0.01;
const DEG = Math.PI / 180;

/**
 * Click target around the cup, its handle at rest and the coaster only
 * (coffee-card T3): from the desk top to a centimetre over the rim, clear
 * of the mouse and the mat.
 */
export const COFFEE_HITBOX = (() => {
  const [cx, cy, cz] = MUG.center;
  // The node's +x, where the handle points, after its yaw.
  const tip = [
    cx + MUG.handleReach * Math.cos(MUG.yaw),
    cz - MUG.handleReach * Math.sin(MUG.yaw),
  ];
  const round = Math.max(COASTER.radius, MUG.radius);
  const x0 = Math.min(cx - round, tip[0]) - HIT_PAD;
  const x1 = Math.max(cx + round, tip[0]) + HIT_PAD;
  const z0 = Math.min(cz - round, tip[1]) - HIT_PAD;
  const z1 = Math.max(cz + round, tip[1]) + HIT_PAD;
  const y0 = DESK_TOP.y;
  const y1 = cy + MUG.height + HIT_PAD;
  return {
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] as Vec3,
    size: [x1 - x0, y1 - y0, z1 - z0] as Vec3,
  };
})();

/**
 * The final shot: 0.42 m out, 9 degrees down at a point three quarters up
 * the cup, from the chair's side turned 30 degrees toward the desk's middle
 * (+z), so Jack looks into the lens, the handle shows on the right and the
 * steam rises in the upper frame. The lens closes from 35 to 30 degrees
 * during the move.
 */
export const COFFEE_SHOT = {
  target: [
    MUG.center[0],
    MUG.center[1] + 0.75 * MUG.height,
    MUG.center[2],
  ] as Vec3,
  distance: 0.42,
  pitch: 9 * DEG,
  azimuth: 30 * DEG,
  fov: 30,
  /** Seconds in, and back out to the room (cinematic.ts). */
  duration: CINEMATIC.duration,
  leaveDuration: CINEMATIC.leaveDuration,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.05,
  maxArc: 0.15,
} as const;

/** The eye's offset from the shot's target. */
const OFFSET: Vec3 = (() => {
  const { distance, pitch, azimuth } = COFFEE_SHOT;
  const level = distance * Math.cos(pitch);
  return [
    level * Math.cos(azimuth),
    distance * Math.sin(pitch),
    level * Math.sin(azimuth),
  ];
})();

/**
 * The final shot in the inspection views' shape (gallery-camera.ts
 * KEYBOARD_VIEW): `galleryCaseFocus` and `galleryStoryShift` then give the
 * same end pose and card shift as `coffeeShotAt(1)` and `coffeeShotShift`.
 */
export const COFFEE_VIEW = {
  centre: COFFEE_SHOT.target,
  offset: OFFSET,
  fov: COFFEE_SHOT.fov,
} as const;

/**
 * A room view from behind the chair toward the desk's mug end, for callers
 * without a live camera pose.
 */
export const COFFEE_START: ShotPose = {
  eye: [0.9, 1.6, -0.9],
  target: [-0.5, 1.05, -1.7],
  fov: GUIDE.fov,
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * The final shot, `shift` metres toward screen right (eye and aim together),
 * so the mug sits left of the open card.
 */
function shotEnd(shift: number): ShotPose {
  // Screen right: the level view direction turned a quarter toward -x.
  const level = Math.hypot(OFFSET[0], OFFSET[2]);
  const right = [OFFSET[2] / level, 0, -OFFSET[0] / level];
  const [x, y, z] = COFFEE_SHOT.target;
  const target: Vec3 = [x + right[0] * shift, y, z + right[2] * shift];
  const eye: Vec3 = [
    target[0] + OFFSET[0],
    target[1] + OFFSET[1],
    target[2] + OFFSET[2],
  ];
  return { eye, target, fov: COFFEE_SHOT.fov };
}

/**
 * The pose `t` (0-1, clamped) of the way from `from` into the coffee shot:
 * the shared move (cinematic.ts), bowed sideways away from the mug.
 */
export function coffeeShotAt(
  t: number,
  from: ShotPose = COFFEE_START,
  shift = 0,
): ShotPose {
  const { arc, maxArc } = COFFEE_SHOT;
  return cinematicPoseAt(t, from, shotEnd(shift), {
    arc,
    maxArc,
    offset: OFFSET,
  });
}

/** Leaving: the same path backwards, from the shot to `to` (the room pose). */
export function coffeeLeaveAt(
  t: number,
  to: ShotPose = COFFEE_START,
  shift = 0,
): ShotPose {
  return coffeeShotAt(1 - clamp01(t), to, shift);
}

/**
 * How far along the move is after `elapsed` seconds; reduced motion is at
 * the end at once, in and out.
 */
export function coffeeShotProgress(
  elapsed: number,
  reducedMotion: boolean,
  leaving = false,
): number {
  return cinematicProgress(elapsed, reducedMotion, leaving);
}

/**
 * How far to slide the shot (metres) so the mug sits at the centre of the
 * screen left of the card (the katana card's footprint): the card's share of
 * the width, in the half-width the final lens spans at the mug. Zero once
 * the card stacks above the mug.
 */
export function coffeeShotShift(width: number, aspect: number): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const halfWidth =
    COFFEE_SHOT.distance * Math.tan((COFFEE_SHOT.fov / 2) * DEG) * aspect;
  return (card / width) * halfWidth;
}
