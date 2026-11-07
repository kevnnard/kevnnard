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
import { HOUSE } from "./house.ts";
import { PATRONUS, PATRONUS_BOUNDS, patronusAt } from "./patronus.ts";
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

/**
 * The chase (patronus T2, S3): once the tip has lit and the words are up,
 * the camera leaves the close-up for a wide, elevated view of the living
 * room that frames the whole run, gently follows the patronus (the aim
 * takes a share of its smoothed offset, the eye drifts a little less),
 * and once it has dissolved returns to the close-up. Times are seconds of
 * the spell (wand.ts SPELL). Reduced motion cuts to the still wide view
 * and back.
 */
export const WAND_CHASE = {
  /** Leaves the close-up this long into the spell. */
  leave: 0.8,
  /** Seconds out to the wide view. */
  out: 1.2,
  /** Heads back once the patronus has dissolved. */
  returnAt: PATRONUS.start + PATRONUS.duration,
  /** Seconds back to the close-up. */
  back: 1.5,
  fov: 48,
  /**
   * Down onto the room from high in its front corner by the entrance and
   * the east wall, so the turn out of the close-up (which looks west at
   * the shelf) stays small and the eye stays inside, under the cut-away
   * roof, clear of every wall.
   */
  pitch: 35 * DEG,
  yaw: 50 * DEG,
  /** Frame padding: the box fills at most 1 / margin of the lens. */
  margin: 1.04,
  /** The eye stays this far inside the main room's walls. */
  inset: 0.15,
  /** Shares of the patronus' offset the aim and the eye follow. */
  follow: 0.45,
  drift: 0.12,
  /** The patronus' position is averaged over this many seconds behind. */
  lag: 0.6,
  arc: 0.06,
  maxArc: 0.3,
} as const;

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];

/**
 * The wide view of a box (world): from high in the room's front east
 * corner, as close as fits every corner inside the lens with the margin
 * (`aspect` across), never past the room's walls.
 */
export function chaseWideView(
  bounds: { min: Vec3; max: Vec3 },
  aspect: number,
): ShotPose {
  const { fov, pitch, yaw, margin, inset } = WAND_CHASE;
  const centre: Vec3 = [0, 1, 2].map(
    (k) => (bounds.min[k] + bounds.max[k]) / 2,
  ) as Vec3;
  // From the centre toward the eye, and the lens' basis.
  const back: Vec3 = [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const forward: Vec3 = [-back[0], -back[1], -back[2]];
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const tanV = Math.tan((fov / 2) * DEG) / margin;
  const tanH = tanV * aspect;
  let distance = 0;
  for (const corner of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const p: Vec3 = [
      corner & 1 ? bounds.max[0] : bounds.min[0],
      corner & 2 ? bounds.max[1] : bounds.min[1],
      corner & 4 ? bounds.max[2] : bounds.min[2],
    ];
    const o: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const depth = dot(o, forward);
    distance = Math.max(
      distance,
      Math.abs(dot(o, right)) / tanH - depth,
      Math.abs(dot(o, up)) / tanV - depth,
    );
  }
  // Narrow screens would need it further: it stops inside the room.
  const { x0, x1, z0, z1 } = HOUSE.main;
  const room = (k: 0 | 2, lo: number, hi: number) =>
    back[k] > 0
      ? (hi - inset - centre[k]) / back[k]
      : back[k] < 0
        ? (lo + inset - centre[k]) / back[k]
        : Infinity;
  return {
    eye: add(
      centre,
      back,
      Math.min(distance, room(0, x0, x1), room(2, z0, z1)),
    ),
    target: centre,
    fov,
  };
}

/** The patronus' position averaged over the last `lag` seconds of its run. */
function trailingRun(t: number): Vec3 {
  const first = PATRONUS.start;
  const last = PATRONUS.start + PATRONUS.duration;
  const steps = 8;
  const sum: Vec3 = [0, 0, 0];
  for (let k = 0; k < steps; k++) {
    const at = Math.min(
      last,
      Math.max(first, t - (WAND_CHASE.lag * k) / (steps - 1)),
    );
    const state = patronusAt(at);
    if (state) for (let i = 0; i < 3; i++) sum[i] += state.position[i] / steps;
  }
  return sum;
}

/** The wide view following the patronus, `t` seconds into the spell. */
function trackPose(t: number, wide: ShotPose): ShotPose {
  const offset: Vec3 = trailingRun(t).map((v, i) => v - wide.target[i]) as Vec3;
  const { follow, drift } = WAND_CHASE;
  return {
    eye: add(wide.eye, [offset[0], 0, offset[2]], drift),
    target: add(wide.target, offset, follow),
    fov: wide.fov,
  };
}

/**
 * The chase's pose `t` seconds into the spell, or null outside it (the
 * close-up holds): out from `from` (the pose the camera was drawn at as it
 * began) onto the following view, which it then plays, and back to `back`
 * (the close-up's own end pose).
 */
export function wandChaseAt(
  t: number,
  {
    from,
    back,
    reducedMotion,
    aspect,
  }: { from: ShotPose; back: ShotPose; reducedMotion: boolean; aspect: number },
): ShotPose | null {
  const { leave, out, returnAt, arc, maxArc } = WAND_CHASE;
  const end = returnAt + (reducedMotion ? 0 : WAND_CHASE.back);
  if (t < leave || t > end) return null;
  const wide = chaseWideView(PATRONUS_BOUNDS, aspect);
  if (reducedMotion) return t < returnAt ? wide : back;
  const track = trackPose(t, wide);
  if (t < leave + out) {
    const offset = track.eye.map((v, i) => v - track.target[i]) as Vec3;
    return cinematicPoseAt((t - leave) / out, from, track, {
      arc,
      maxArc,
      offset,
    });
  }
  if (t < returnAt) return track;
  return cinematicPoseAt((t - returnAt) / WAND_CHASE.back, track, back, {
    arc,
    maxArc,
    offset: OFFSET,
  });
}

/** When the card hides for the chase and shows again, spell seconds. */
export function wandChaseCard(): { hide: number; show: number } {
  return { hide: WAND_CHASE.leave, show: WAND_CHASE.returnAt };
}
