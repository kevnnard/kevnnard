// Cherry's cinematic close-up (dog-rig T3), mirroring the coffee mug's and
// the keyboard's (coffee-shot.ts, keyboard-shot.ts) with a video-game
// "character intro" feel: a slow eased dolly with a sideways arc from
// wherever the camera is, down to the grass at her eye level, a front
// three-quarter view with her face to the lens, the lens narrowing on the
// way; reduced motion cuts straight to the shot. With her card open the
// shot slides so she stands in the left third and the card has the right.
// Leaving runs the same path backwards. She stands at the day's spot
// (cherry.ts), so the shot is built per spot. Pure numbers; the scene
// samples `shotAt` each frame.

import type { Vec3 } from "./camera.ts";
import { type CherrySpot, cherryNose, cherryPlacement } from "./cherry.ts";
import type { ShotPose } from "./coffee-shot.ts";
import { STORY_CARD } from "./gallery-camera.ts";

export type { ShotPose };

const DEG = Math.PI / 180;

/**
 * The final shot: 1.15 m out, 6 degrees down at a point 0.21 m up (her
 * middle) and 5 cm ahead of her centre, from 40 degrees off her nose, so
 * the lens sits by her eyes (0.33 m) and the whole dog fills about two
 * thirds of the height. The lens closes from the room's 35 degrees to 28.
 */
export const CHERRY_SHOT = {
  height: 0.21,
  ahead: 0.05,
  distance: 1.15,
  pitch: 6 * DEG,
  /** Off her nose, toward the spot's lens side. */
  azimuth: 40 * DEG,
  fov: 28,
  /** Seconds in, and back out to the room. */
  duration: 2.5,
  leaveDuration: 1.8,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.12,
  maxArc: 0.6,
  /** The aim settles on her a little before the eye arrives. */
  aimLead: 0.85,
} as const;

/** The shot's aim, the eye's offset from it and the final lens, at a spot. */
export function cherryView(spot: CherrySpot): {
  centre: Vec3;
  offset: Vec3;
  fov: number;
} {
  const { position } = cherryPlacement(spot);
  const [nx, nz] = cherryNose(spot);
  const { height, ahead, distance, pitch, azimuth, fov } = CHERRY_SHOT;
  // The nose's angle on the ground, from +x toward +z, turned to the lens.
  const angle = Math.atan2(nz, nx) + spot.lensSide * azimuth;
  const level = distance * Math.cos(pitch);
  return {
    centre: [
      position[0] + nx * ahead,
      position[1] + height,
      position[2] + nz * ahead,
    ],
    offset: [
      level * Math.cos(angle),
      distance * Math.sin(pitch),
      level * Math.sin(angle),
    ],
    fov,
  };
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Cubic ease in and out: a slow start and a slow landing. */
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const mix = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

/** A cinematic move, in WorldScene's shape (CINEMATIC_SHOTS). */
export interface CherryShot {
  shotAt: (t: number, from: ShotPose, shift?: number) => ShotPose;
  leaveAt: (t: number, to: ShotPose, shift?: number) => ShotPose;
  progress: (elapsed: number, reduced: boolean, leaving?: boolean) => number;
  shift: (width: number, aspect: number) => number;
}

/** The close-up of Cherry at `spot`. */
export function cherryShot(spot: CherrySpot): CherryShot {
  const { centre, offset, fov } = cherryView(spot);
  const level = Math.hypot(offset[0], offset[2]);

  /**
   * The final shot, `shift` metres toward screen right (eye and aim
   * together), so she sits left of the open card.
   */
  const shotEnd = (shift: number): ShotPose => {
    // Screen right: the level view direction turned a quarter.
    const right = [offset[2] / level, -offset[0] / level];
    const target: Vec3 = [
      centre[0] + right[0] * shift,
      centre[1],
      centre[2] + right[1] * shift,
    ];
    const eye: Vec3 = [
      target[0] + offset[0],
      target[1] + offset[1],
      target[2] + offset[2],
    ];
    return { eye, target, fov };
  };

  /**
   * The pose `t` (0-1, clamped) of the way from `from` into the shot: the
   * eye eases along the straight line, bowed sideways toward the side the
   * shot looks from (most at mid-move, none at either end), the aim eases
   * onto her a bit sooner and the lens narrows with the eye.
   */
  const shotAt = (t: number, from: ShotPose, shift = 0): ShotPose => {
    const end = shotEnd(shift);
    const s = ease(clamp01(t));
    const aim = ease(clamp01(t / CHERRY_SHOT.aimLead));
    const eye = mix(from.eye, end.eye, s);
    const travel = [end.eye[0] - from.eye[0], end.eye[2] - from.eye[2]];
    const length = Math.hypot(travel[0], travel[1]);
    if (length > 1e-6) {
      let side = [-travel[1] / length, travel[0] / length];
      if (side[0] * offset[0] + side[1] * offset[2] < 0)
        side = [-side[0], -side[1]];
      const bow =
        Math.min(CHERRY_SHOT.maxArc, CHERRY_SHOT.arc * length) *
        Math.sin(Math.PI * s);
      eye[0] += side[0] * bow;
      eye[2] += side[1] * bow;
    }
    return {
      eye,
      target: mix(from.target, end.target, aim),
      fov: from.fov + (end.fov - from.fov) * s,
    };
  };

  return {
    shotAt,
    /** Leaving: the same path backwards, from the shot to `to`. */
    leaveAt: (t, to, shift = 0) => shotAt(1 - clamp01(t), to, shift),
    progress: (elapsed, reduced, leaving = false) => {
      if (reduced) return 1;
      const duration = leaving
        ? CHERRY_SHOT.leaveDuration
        : CHERRY_SHOT.duration;
      return clamp01(elapsed / duration);
    },
    /**
     * How far to slide the shot (metres) so she sits at the centre of the
     * screen left of the card (its footprint): the card's share of the
     * width, in the half-width the final lens spans at her. Zero once the
     * card stacks above her.
     */
    shift: (width, aspect) => {
      if (width <= STORY_CARD.stackBelow) return 0;
      const card =
        width <= STORY_CARD.narrowBelow
          ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
          : STORY_CARD.width + STORY_CARD.inset;
      const halfWidth =
        CHERRY_SHOT.distance * Math.tan((fov / 2) * DEG) * aspect;
      return (card / width) * halfWidth;
    },
  };
}
