// The garden sign's cinematic close-up (garden-sign T2), mirroring the
// coffee mug's and Cherry's (coffee-shot.ts, cherry-shot.ts): a slow eased
// dolly with a sideways arc from wherever the camera is, down the front
// garden to a near face-on view of the board from the lantern's side, the
// lens narrowing on the way; reduced motion cuts straight to the shot. With
// the card open the shot slides so the sign stands in the free space on
// the left and the card has the right. Leaving runs the same path
// backwards. Pure numbers; the scene samples `signShotAt` each frame.

import { GUIDE, type Vec3 } from "./camera.ts";
import {
  CINEMATIC,
  cinematicPoseAt,
  cinematicProgress,
  type ShotPose,
} from "./cinematic.ts";
import { STORY_CARD } from "./gallery-camera.ts";
import { signWorld } from "./garden-sign.ts";

export type { ShotPose };

const DEG = Math.PI / 180;

/**
 * The final shot: 2.3 m out, 6 degrees down at the sign's middle (0.47 m
 * up, between its posts and the lantern), from 24 degrees off its face
 * toward the lantern side, so the lens clears the bush in front of the
 * board and the whole sign, lantern included, stands about two thirds of
 * the frame's height. The lens closes from the room's 35 degrees to 28.
 */
export const SIGN_SHOT = {
  target: signWorld([0.02, 0.47, 0]),
  distance: 2.3,
  pitch: 6 * DEG,
  azimuth: 24 * DEG,
  fov: 28,
  /** Seconds in, and back out to the room (cinematic.ts). */
  duration: CINEMATIC.duration,
  leaveDuration: CINEMATIC.leaveDuration,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.06,
  maxArc: 0.3,
} as const;

/** The eye's offset from the shot's target: out of the face (+z), turned. */
const OFFSET: Vec3 = (() => {
  const { distance, pitch, azimuth } = SIGN_SHOT;
  const level = distance * Math.cos(pitch);
  const [ox, , oz] = signWorld([Math.sin(azimuth), 0, Math.cos(azimuth)]);
  const [px, , pz] = signWorld([0, 0, 0]);
  return [level * (ox - px), distance * Math.sin(pitch), level * (oz - pz)];
})();

/**
 * The final shot in the inspection views' shape (gallery-camera.ts):
 * `galleryCaseFocus` and `galleryStoryShift` then give the same end pose
 * and card shift as `signShotAt(1)` and `signShotShift`.
 */
export const SIGN_VIEW = {
  centre: SIGN_SHOT.target,
  offset: OFFSET,
  fov: SIGN_SHOT.fov,
} as const;

/** A front-garden view toward the sign, for callers without a live pose. */
export const SIGN_START: ShotPose = {
  eye: [4.5, 3.2, 9],
  target: [1, 0.8, 1.5],
  fov: GUIDE.fov,
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/**
 * The final shot, `shift` metres toward screen right (eye and aim
 * together), so the sign sits left of the open card.
 */
function shotEnd(shift: number): ShotPose {
  // Screen right: the level view direction turned a quarter.
  const level = Math.hypot(OFFSET[0], OFFSET[2]);
  const right = [OFFSET[2] / level, -OFFSET[0] / level];
  const [x, y, z] = SIGN_SHOT.target;
  const target: Vec3 = [x + right[0] * shift, y, z + right[1] * shift];
  const eye: Vec3 = [
    target[0] + OFFSET[0],
    target[1] + OFFSET[1],
    target[2] + OFFSET[2],
  ];
  return { eye, target, fov: SIGN_SHOT.fov };
}

/**
 * The pose `t` (0-1, clamped) of the way from `from` into the sign shot:
 * the shared move (cinematic.ts), bowed toward the side the shot looks from.
 */
export function signShotAt(
  t: number,
  from: ShotPose = SIGN_START,
  shift = 0,
): ShotPose {
  const { arc, maxArc } = SIGN_SHOT;
  return cinematicPoseAt(t, from, shotEnd(shift), {
    arc,
    maxArc,
    offset: OFFSET,
  });
}

/** Leaving: the same path backwards, from the shot to `to` (the room pose). */
export function signLeaveAt(
  t: number,
  to: ShotPose = SIGN_START,
  shift = 0,
): ShotPose {
  return signShotAt(1 - clamp01(t), to, shift);
}

/**
 * How far along the move is after `elapsed` seconds; reduced motion is at
 * the end at once, in and out.
 */
export function signShotProgress(
  elapsed: number,
  reducedMotion: boolean,
  leaving = false,
): number {
  return cinematicProgress(elapsed, reducedMotion, leaving);
}

/**
 * How far to slide the shot (metres) so the sign sits at the centre of the
 * screen left of the card: the card's share of the width, in the
 * half-width the final lens spans at the sign. Zero once the card stacks
 * above the sign.
 */
export function signShotShift(width: number, aspect: number): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const halfWidth =
    SIGN_SHOT.distance * Math.tan((SIGN_SHOT.fov / 2) * DEG) * aspect;
  return (card / width) * halfWidth;
}
