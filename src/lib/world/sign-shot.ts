// The garden sign's cinematic close-up (garden-sign T2), mirroring the
// coffee mug's and Cherry's (coffee-shot.ts, cherry-shot.ts): a slow eased
// dolly with a sideways arc from wherever the camera is, down the front
// garden to a near face-on view of the board from the lantern's side, the
// lens narrowing on the way; reduced motion cuts straight to the shot. With
// the card open the shot slides so the sign stands in the free space on
// the left and the card has the right. Leaving runs the same path
// backwards. Pure numbers; the scene samples `signShotAt` each frame.

import { GUIDE, type Vec3 } from "./camera.ts";
import type { ShotPose } from "./coffee-shot.ts";
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
  /** Seconds in, and back out to the room. */
  duration: 2.5,
  leaveDuration: 1.8,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.12,
  maxArc: 0.6,
  /** The aim settles on the sign a little before the eye arrives. */
  aimLead: 0.85,
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
/** Cubic ease in and out: a slow start and a slow landing. */
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const mix = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

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
 * the eye eases along the straight line, bowed sideways toward the side the
 * shot looks from (most at mid-move, none at either end), the aim eases
 * onto the sign a bit sooner and the lens narrows with the eye.
 */
export function signShotAt(
  t: number,
  from: ShotPose = SIGN_START,
  shift = 0,
): ShotPose {
  const end = shotEnd(shift);
  const s = ease(clamp01(t));
  const aim = ease(clamp01(t / SIGN_SHOT.aimLead));
  const eye = mix(from.eye, end.eye, s);
  const travel = [end.eye[0] - from.eye[0], end.eye[2] - from.eye[2]];
  const length = Math.hypot(travel[0], travel[1]);
  if (length > 1e-6) {
    let side = [-travel[1] / length, travel[0] / length];
    if (side[0] * OFFSET[0] + side[1] * OFFSET[2] < 0)
      side = [-side[0], -side[1]];
    const bow =
      Math.min(SIGN_SHOT.maxArc, SIGN_SHOT.arc * length) *
      Math.sin(Math.PI * s);
    eye[0] += side[0] * bow;
    eye[2] += side[1] * bow;
  }
  return {
    eye,
    target: mix(from.target, end.target, aim),
    fov: from.fov + (end.fov - from.fov) * s,
  };
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
  if (reducedMotion) return 1;
  const duration = leaving ? SIGN_SHOT.leaveDuration : SIGN_SHOT.duration;
  return clamp01(elapsed / duration);
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
