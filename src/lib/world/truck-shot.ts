// The dream truck's cinematic close-up (dream-truck T1), mirroring the
// garden sign's and Cherry's (sign-shot.ts, cherry-shot.ts): a slow eased
// dolly with a sideways arc from wherever the camera is, down to a low
// three-quarter front view from the open yard left of the garage, the lens
// narrowing on the way; reduced motion cuts straight to the shot. While it
// plays the garage's front and left walls and its roof dissolve
// (TRUCK_REVEAL), so the truck stands clear of them. With the card open the
// shot slides so the truck stands on the left and the card has the right.
// Leaving runs the same path backwards. Pure numbers; the scene samples
// `truckShotAt` each frame.

import { GUIDE, type Vec3 } from "./camera.ts";
import {
  CINEMATIC,
  cinematicPoseAt,
  cinematicProgress,
  type ShotPose,
} from "./cinematic.ts";
import { STORY_CARD } from "./gallery-camera.ts";
import type { HouseGroup } from "./house.ts";
import { TRUCK, truckBox } from "./truck.ts";

export type { ShotPose };

const DEG = Math.PI / 180;

const BOX = truckBox();

/**
 * The final shot: 6.6 m out, 3 degrees down at a point 0.75 m above the
 * garage floor, a metre ahead of the truck's middle, from 25 degrees off
 * its nose toward the left yard, so the lens stands at bonnet height
 * (1.1 m up) out past the apron, clear of the yard's tree, and sees the
 * grille, the left flank and the wheels, the whole truck left of the card.
 * The lens closes from the room's 35 degrees to 34.
 */
export const TRUCK_SHOT = {
  target: [
    TRUCK.position[0],
    TRUCK.position[1] + 0.75,
    (BOX.z0 + BOX.z1) / 2 + 1,
  ] as Vec3,
  distance: 6.6,
  pitch: 3 * DEG,
  /** Off the nose (+z), toward -x. */
  azimuth: 25 * DEG,
  fov: 34,
  /** Seconds in, and back out to the room (cinematic.ts). */
  duration: CINEMATIC.duration,
  leaveDuration: CINEMATIC.leaveDuration,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.06,
  maxArc: 0.3,
} as const;

/** The garage parts dissolved while the shot plays, eased like the cutaway. */
export const TRUCK_REVEAL: readonly HouseGroup[] = [
  "garage-front",
  "garage-left",
  "garage-roof",
];

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
 * together), so the truck sits left of the open card.
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
 * The pose `t` (0-1, clamped) of the way from `from` into the truck shot:
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
 * How far to slide the shot (metres) so the truck sits at the centre of the
 * screen left of the card: the card's share of the width, in the
 * half-width the final lens spans at the truck. Zero once the card stacks
 * above the truck.
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
