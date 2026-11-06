// The keyboard's cinematic product shot (keyboard-card T2), mirroring the
// coffee mug's (coffee-shot.ts): a slow eased dolly with a slight arc from
// wherever the camera is to a low 3/4 shot of the NuPhy from the typist's
// front-left, the lens narrowing a little on the way; reduced motion cuts
// straight to the shot. Leaving runs the same path backwards. Pure numbers;
// the scene samples `keyboardShotAt` each frame.

import { GUIDE, type Vec3 } from "./camera.ts";
import type { ShotPose } from "./coffee-shot.ts";
import { STORY_CARD } from "./gallery-camera.ts";
import { KEYBOARD } from "./setup.ts";

export type { ShotPose };

const DEG = Math.PI / 180;

/**
 * The final shot: 0.7 m out, 27 degrees down at the cap tops, from the
 * chair's side turned 45 degrees toward +z (a seated typist's left), so the
 * whole board reads at a slight depth with its legends legible, the eye
 * beside the chair rather than over it. The lens closes from 35 to 30
 * degrees during the move.
 */
export const KEYBOARD_SHOT = {
  target: [
    KEYBOARD.center[0],
    KEYBOARD.center[1] + 0.008,
    KEYBOARD.center[2],
  ] as Vec3,
  distance: 0.7,
  pitch: 27 * DEG,
  azimuth: 45 * DEG,
  fov: 30,
  /** Seconds in, and back out to the room. */
  duration: 2.5,
  leaveDuration: 1.8,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.1,
  maxArc: 0.3,
  /** The aim settles on the board a little before the eye arrives. */
  aimLead: 0.85,
} as const;

/** The eye's offset from the shot's target. */
const OFFSET: Vec3 = (() => {
  const { distance, pitch, azimuth } = KEYBOARD_SHOT;
  const level = distance * Math.cos(pitch);
  return [
    level * Math.cos(azimuth),
    distance * Math.sin(pitch),
    level * Math.sin(azimuth),
  ];
})();

/**
 * The final shot in the inspection views' shape: gallery-camera.ts uses it
 * as KEYBOARD_VIEW, so `galleryCaseFocus` and `galleryStoryShift` give the
 * same end pose and card shift as `keyboardShotAt(1)` and
 * `keyboardShotShift`.
 */
export const KEYBOARD_VIEW = {
  centre: KEYBOARD_SHOT.target,
  offset: OFFSET,
  fov: KEYBOARD_SHOT.fov,
} as const;

/**
 * A room view from behind the chair toward the keyboard, for callers
 * without a live camera pose.
 */
export const KEYBOARD_START: ShotPose = {
  eye: [1.2, 1.7, -0.6],
  target: [-0.5, 1.05, -1.3],
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
 * The final shot, `shift` metres toward screen right (eye and aim together),
 * so the board sits left of the open card.
 */
function shotEnd(shift: number): ShotPose {
  // Screen right: the level view direction turned a quarter toward -x.
  const level = Math.hypot(OFFSET[0], OFFSET[2]);
  const right = [OFFSET[2] / level, 0, -OFFSET[0] / level];
  const [x, y, z] = KEYBOARD_SHOT.target;
  const target: Vec3 = [x + right[0] * shift, y, z + right[2] * shift];
  const eye: Vec3 = [
    target[0] + OFFSET[0],
    target[1] + OFFSET[1],
    target[2] + OFFSET[2],
  ];
  return { eye, target, fov: KEYBOARD_SHOT.fov };
}

/**
 * The pose `t` (0-1, clamped) of the way from `from` into the keyboard
 * shot: the eye eases along the straight line, bowed sideways toward the
 * side the shot looks from (most at mid-move, none at either end), the aim
 * eases onto the board a bit sooner and the lens narrows with the eye.
 */
export function keyboardShotAt(
  t: number,
  from: ShotPose = KEYBOARD_START,
  shift = 0,
): ShotPose {
  const end = shotEnd(shift);
  const s = ease(clamp01(t));
  const aim = ease(clamp01(t / KEYBOARD_SHOT.aimLead));
  const eye = mix(from.eye, end.eye, s);
  const travel = [end.eye[0] - from.eye[0], end.eye[2] - from.eye[2]];
  const length = Math.hypot(travel[0], travel[1]);
  if (length > 1e-6) {
    // Level, across the travel, on the side the final shot looks from.
    let side = [-travel[1] / length, travel[0] / length];
    if (side[0] * OFFSET[0] + side[1] * OFFSET[2] < 0)
      side = [-side[0], -side[1]];
    const bow =
      Math.min(KEYBOARD_SHOT.maxArc, KEYBOARD_SHOT.arc * length) *
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
export function keyboardLeaveAt(
  t: number,
  to: ShotPose = KEYBOARD_START,
  shift = 0,
): ShotPose {
  return keyboardShotAt(1 - clamp01(t), to, shift);
}

/**
 * How far along the move is after `elapsed` seconds; reduced motion is at
 * the end at once, in and out.
 */
export function keyboardShotProgress(
  elapsed: number,
  reducedMotion: boolean,
  leaving = false,
): number {
  if (reducedMotion) return 1;
  const duration = leaving
    ? KEYBOARD_SHOT.leaveDuration
    : KEYBOARD_SHOT.duration;
  return clamp01(elapsed / duration);
}

/**
 * How far to slide the shot (metres) so the board sits at the centre of the
 * screen left of the card (the story card's footprint): the card's share of
 * the width, in the half-width the final lens spans at the board. Zero once
 * the card stacks above it.
 */
export function keyboardShotShift(width: number, aspect: number): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const halfWidth =
    KEYBOARD_SHOT.distance * Math.tan((KEYBOARD_SHOT.fov / 2) * DEG) * aspect;
  return (card / width) * halfWidth;
}
