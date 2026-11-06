// The garage's cinematic close-up (dream-truck T4; T1 framed the truck):
// the shared eased dolly (cinematic.ts) from wherever the camera is to a
// view of the closed roller door and its "Coming soon" sign from the front
// yard, a little off its left; reduced motion cuts straight to the shot.
// Nothing dissolves: the door stays shut. With the card open the shot
// slides so the door stands on the left and the card has the right.
// Leaving runs the same path backwards. Pure numbers; the scene samples
// `truckShotAt` each frame (the internal id stays "truck").

import { GUIDE, type Vec3 } from "./camera.ts";
import {
  CINEMATIC,
  cinematicPoseAt,
  cinematicProgress,
  type ShotPose,
} from "./cinematic.ts";
import { STORY_CARD } from "./gallery-camera.ts";
import { GARAGE_DOOR_FACE } from "./truck.ts";

export type { ShotPose };

const DEG = Math.PI / 180;

/**
 * The final shot: 5.5 m out from the door's middle, 4 degrees down, from
 * 15 degrees off its left, so the lens stands at about head height in the
 * front yard and sees the whole door, the sign and a little wall round it,
 * left of the card. The lens closes from the room's 35 degrees to 34.
 */
export const TRUCK_SHOT = {
  target: GARAGE_DOOR_FACE.center,
  distance: 5.5,
  pitch: 4 * DEG,
  /** Off the door's normal (+z), toward -x. */
  azimuth: 15 * DEG,
  fov: 34,
  /** Seconds in, and back out to the room (cinematic.ts). */
  duration: CINEMATIC.duration,
  leaveDuration: CINEMATIC.leaveDuration,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.06,
  maxArc: 0.3,
} as const;

/** The eye's offset from the shot's target. */
const OFFSET: Vec3 = (() => {
  const { distance, pitch, azimuth } = TRUCK_SHOT;
  const level = distance * Math.cos(pitch);
  return [
    -level * Math.sin(azimuth),
    distance * Math.sin(pitch),
    level * Math.cos(azimuth),
  ];
})();

/**
 * The final shot in the inspection views' shape (gallery-camera.ts):
 * `galleryCaseFocus` and `galleryStoryShift` then give the same end pose
 * and card shift as `truckShotAt(1)` and `truckShotShift`.
 */
export const TRUCK_VIEW = {
  centre: TRUCK_SHOT.target,
  offset: OFFSET,
  fov: TRUCK_SHOT.fov,
} as const;

/** A front-yard view toward the garage, for callers without a live pose. */
export const TRUCK_START: ShotPose = {
  eye: [1.5, 4, 10],
  target: [-1.5, 1, 1],
  fov: GUIDE.fov,
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * The final shot, `shift` metres toward screen right (eye and aim
 * together), so the door sits left of the open card.
 */
function shotEnd(shift: number): ShotPose {
  // Screen right: the level view direction turned a quarter.
  const level = Math.hypot(OFFSET[0], OFFSET[2]);
  const right = [OFFSET[2] / level, -OFFSET[0] / level];
  const [x, y, z] = TRUCK_SHOT.target;
  const target: Vec3 = [x + right[0] * shift, y, z + right[1] * shift];
  const eye: Vec3 = [
    target[0] + OFFSET[0],
    target[1] + OFFSET[1],
    target[2] + OFFSET[2],
  ];
  return { eye, target, fov: TRUCK_SHOT.fov };
}

/**
 * The pose `t` (0-1, clamped) of the way from `from` into the garage shot:
 * the shared move (cinematic.ts), bowed toward the side the shot looks from.
 */
export function truckShotAt(
  t: number,
  from: ShotPose = TRUCK_START,
  shift = 0,
): ShotPose {
  const { arc, maxArc } = TRUCK_SHOT;
  return cinematicPoseAt(t, from, shotEnd(shift), {
    arc,
    maxArc,
    offset: OFFSET,
  });
}

/** Leaving: the same path backwards, from the shot to `to` (the room pose). */
export function truckLeaveAt(
  t: number,
  to: ShotPose = TRUCK_START,
  shift = 0,
): ShotPose {
  return truckShotAt(1 - clamp01(t), to, shift);
}

/**
 * How far along the move is after `elapsed` seconds; reduced motion is at
 * the end at once, in and out.
 */
export function truckShotProgress(
  elapsed: number,
  reducedMotion: boolean,
  leaving = false,
): number {
  return cinematicProgress(elapsed, reducedMotion, leaving);
}

/**
 * How far to slide the shot (metres) so the door sits at the centre of the
 * screen left of the card: the card's share of the width, in the
 * half-width the final lens spans at the door. Zero once the card stacks
 * above the door.
 */
export function truckShotShift(width: number, aspect: number): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const halfWidth =
    TRUCK_SHOT.distance * Math.tan((TRUCK_SHOT.fov / 2) * DEG) * aspect;
  return (card / width) * halfWidth;
}
