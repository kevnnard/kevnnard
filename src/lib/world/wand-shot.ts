// The Elder Wand's cinematic close-up (patronus T1): the shared eased
// dolly (cinematic.ts) from wherever the camera is to a low view of the
// wand on its stand from the room, a little off its tip side, the lens
// narrowing on the way; reduced motion cuts straight to the shot. With the
// card open the shot slides so the wand lies on the left and the card has
// the right. The spell plays once it arrives (wand.ts, Wand.tsx). Leaving
// runs the same path backwards. Pure numbers; the scene samples
// `wandShotAt` each frame.

import type { Vec3 } from "./camera.ts";
import {
  CINEMATIC,
  cinematicPoseAt,
  cinematicProgress,
  type ShotPose,
} from "./cinematic.ts";
import { STORY_CARD } from "./gallery-camera.ts";
import { WAND_CENTRE } from "./wand.ts";

export type { ShotPose };

const DEG = Math.PI / 180;

/**
 * The final shot: 0.85 m out from the wand's middle, 8 degrees down, from
 * 15 degrees off the shelf's face toward the tip, so the whole 38 cm wand
 * and its stand lie across the left of the frame with room above the tip
 * for the spark trail. The lens closes from the room's 35 degrees to 30.
 */
export const WAND_SHOT = {
  target: WAND_CENTRE,
  distance: 0.85,
  pitch: 8 * DEG,
  /** Off the shelf's face (+x), toward +z (the tip's side). */
  azimuth: 15 * DEG,
  fov: 30,
  /** Seconds in, and back out to the room (cinematic.ts). */
  duration: CINEMATIC.duration,
  leaveDuration: CINEMATIC.leaveDuration,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.06,
  maxArc: 0.3,
} as const;

/** The eye's offset from the shot's target. */
const OFFSET: Vec3 = (() => {
  const { distance, pitch, azimuth } = WAND_SHOT;
  const level = distance * Math.cos(pitch);
  return [
    level * Math.cos(azimuth),
    distance * Math.sin(pitch),
    level * Math.sin(azimuth),
  ];
})();

/**
 * The final shot in the inspection views' shape (gallery-camera.ts):
 * `galleryCaseFocus` and `galleryStoryShift` then give the same end pose
 * and card shift as `wandShotAt(1)` and `wandShotShift`.
 */
export const WAND_VIEW = {
  centre: WAND_SHOT.target,
  offset: OFFSET,
  fov: WAND_SHOT.fov,
} as const;

/** A room view toward the shelf, for callers without a live pose. */
export const WAND_START: ShotPose = {
  eye: [1.6, 1.6, 0.6],
  target: WAND_CENTRE,
  fov: 35,
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * The final shot, `shift` metres toward screen right (eye and aim
 * together), so the wand lies left of the open card.
 */
function shotEnd(shift: number): ShotPose {
  // Screen right: the level view direction turned a quarter.
  const level = Math.hypot(OFFSET[0], OFFSET[2]);
  const right = [OFFSET[2] / level, -OFFSET[0] / level];
  const [x, y, z] = WAND_SHOT.target;
  const target: Vec3 = [x + right[0] * shift, y, z + right[1] * shift];
  const eye: Vec3 = [
    target[0] + OFFSET[0],
    target[1] + OFFSET[1],
    target[2] + OFFSET[2],
  ];
  return { eye, target, fov: WAND_SHOT.fov };
}

/**
 * The pose `t` (0-1, clamped) of the way from `from` into the wand shot:
 * the shared move (cinematic.ts), bowed toward the side the shot looks from.
 */
export function wandShotAt(
  t: number,
  from: ShotPose = WAND_START,
  shift = 0,
): ShotPose {
  const { arc, maxArc } = WAND_SHOT;
  return cinematicPoseAt(t, from, shotEnd(shift), {
    arc,
    maxArc,
    offset: OFFSET,
  });
}

/** Leaving: the same path backwards, from the shot to `to` (the room pose). */
export function wandLeaveAt(
  t: number,
  to: ShotPose = WAND_START,
  shift = 0,
): ShotPose {
  return wandShotAt(1 - clamp01(t), to, shift);
}

/**
 * How far along the move is after `elapsed` seconds; reduced motion is at
 * the end at once, in and out.
 */
export function wandShotProgress(
  elapsed: number,
  reducedMotion: boolean,
  leaving = false,
): number {
  return cinematicProgress(elapsed, reducedMotion, leaving);
}

/**
 * How far to slide the shot (metres) so the wand sits at the centre of the
 * screen left of the card: the card's share of the width, in the
 * half-width the final lens spans at the wand. Zero once the card stacks
 * above the wand.
 */
export function wandShotShift(width: number, aspect: number): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const halfWidth =
    WAND_SHOT.distance * Math.tan((WAND_SHOT.fov / 2) * DEG) * aspect;
  return (card / width) * halfWidth;
}
