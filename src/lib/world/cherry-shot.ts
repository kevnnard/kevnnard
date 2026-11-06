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
import {
  CINEMATIC,
  cinematicPoseAt,
  cinematicProgress,
  type ShotPose,
} from "./cinematic.ts";
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
  /** Seconds in, and back out to the room (cinematic.ts). */
  duration: CINEMATIC.duration,
  leaveDuration: CINEMATIC.leaveDuration,
  /** Sideways bow at mid-move: a share of the horizontal travel, capped. */
  arc: 0.06,
  maxArc: 0.3,
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
   * shared move (cinematic.ts), bowed toward the side the shot looks from.
   */
  const shotAt = (t: number, from: ShotPose, shift = 0): ShotPose =>
    cinematicPoseAt(t, from, shotEnd(shift), {
      arc: CHERRY_SHOT.arc,
      maxArc: CHERRY_SHOT.maxArc,
      offset,
    });

  return {
    shotAt,
    /** Leaving: the same path backwards, from the shot to `to`. */
    leaveAt: (t, to, shift = 0) => shotAt(1 - clamp01(t), to, shift),
    progress: (elapsed, reduced, leaving = false) =>
      cinematicProgress(elapsed, reduced, leaving),
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
