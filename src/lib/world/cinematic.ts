// The cinematic close-ups' shared move (dream-truck T3, S4): the coffee
// mug's, the keyboard's, Cherry's, the garden sign's and the dream truck's
// (the *-shot.ts modules) all play this one path. It starts from the pose
// the camera is drawn at, whatever came before (the room, another close-up,
// a move still under way), so it never cuts to another view first. Calm
// rather than quick: about 3.8 s in and 3 s out, a quintic ease that starts
// and lands at rest, a small sideways bow, and the lens change spread over
// the whole move; reduced motion cuts straight to the end. Pure numbers.

import type { Vec3 } from "./camera.ts";

/** An eye, its aim and the lens (vertical fov, degrees). */
export interface ShotPose {
  eye: Vec3;
  target: Vec3;
  fov: number;
}

export const CINEMATIC = {
  /** Seconds in, and back out to the room. */
  duration: 3.8,
  leaveDuration: 3,
  /** The aim settles on the subject a little before the eye arrives. */
  aimLead: 0.9,
} as const;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const mix = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

/**
 * Quintic smootherstep: no speed and no acceleration at either end, so the
 * move never kicks off or stops short; its peak speed is 1.875 times the
 * average (the old cubic's was 3).
 */
export function cinematicEase(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (6 * x - 15) + 10);
}

/** Sine ease in and out, for the lens: under way early, still going late. */
export function lensEase(t: number): number {
  return (1 - Math.cos(Math.PI * clamp01(t))) / 2;
}

/** A shot's bow: a share of the level travel, capped in metres. */
export interface CinematicArc {
  arc: number;
  maxArc: number;
  /** The final eye's offset from its aim: the bow leans to that side. */
  offset: Vec3;
}

/**
 * The pose `t` (0-1, clamped) of the way from `from` to `end`: the eye
 * eases along the straight line, bowed sideways toward the side the shot
 * looks from (most at mid-move, none at either end), the aim eases onto
 * the subject a bit sooner and the lens changes over the whole move.
 */
export function cinematicPoseAt(
  t: number,
  from: ShotPose,
  end: ShotPose,
  { arc, maxArc, offset }: CinematicArc,
): ShotPose {
  const s = cinematicEase(t);
  const aim = cinematicEase(clamp01(t) / CINEMATIC.aimLead);
  const eye = mix(from.eye, end.eye, s);
  const travel = [end.eye[0] - from.eye[0], end.eye[2] - from.eye[2]];
  const length = Math.hypot(travel[0], travel[1]);
  if (length > 1e-6) {
    // Level, across the travel, on the side the final shot looks from.
    let side = [-travel[1] / length, travel[0] / length];
    if (side[0] * offset[0] + side[1] * offset[2] < 0)
      side = [-side[0], -side[1]];
    const bow = Math.min(maxArc, arc * length) * Math.sin(Math.PI * s);
    eye[0] += side[0] * bow;
    eye[2] += side[1] * bow;
  }
  return {
    eye,
    target: mix(from.target, end.target, aim),
    fov: from.fov + (end.fov - from.fov) * lensEase(t),
  };
}

/**
 * How far along the move is after `elapsed` seconds; reduced motion is at
 * the end at once, in and out.
 */
export function cinematicProgress(
  elapsed: number,
  reducedMotion: boolean,
  leaving = false,
): number {
  if (reducedMotion) return 1;
  const duration = leaving ? CINEMATIC.leaveDuration : CINEMATIC.duration;
  return clamp01(elapsed / duration);
}

/**
 * Leaving a close-up, `t` (0-1) of the way back to `to`: the shot's own
 * path backwards (`leaveAt`) once the camera had arrived; from `live`,
 * straight and eased, when it is closed before the move in finished, so it
 * never cuts to the shot's end first.
 */
export function cinematicLeaveAt(
  t: number,
  live: ShotPose,
  to: ShotPose,
  leaveAt: (t: number) => ShotPose,
): ShotPose {
  const start = leaveAt(0);
  const arrived =
    Math.hypot(...live.eye.map((v, i) => v - start.eye[i])) < 1e-3 &&
    Math.hypot(...live.target.map((v, i) => v - start.target[i])) < 1e-3;
  if (arrived) return leaveAt(t);
  return cinematicPoseAt(t, live, to, {
    arc: 0,
    maxArc: 0,
    offset: [0, 0, 0],
  });
}

/**
 * Where a cinematic move into a close-up starts and where leaving it goes:
 * it always starts at `live`, the pose the camera is drawn at now; it goes
 * back to `back`, the room pose the visit began in, or to `live` when the
 * visit begins with this shot.
 */
export function cinematicEntry(
  live: ShotPose,
  back: ShotPose | null,
): { from: ShotPose; back: ShotPose } {
  return { from: live, back: back ?? live };
}
