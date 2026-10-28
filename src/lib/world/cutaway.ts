// Zoom-driven cutaway (T4c, S7): far away the house is whole; zooming in
// dissolves both roofs, then every wall whose outside faces the camera, so
// the empty interior shows from any side. Pure numbers; House.tsx turns each
// fade into a dithered discard and hides fully faded groups.

import {
  HOUSE,
  HOUSE_FOCUS,
  HOUSE_GROUPS,
  type HouseGroup,
  WALLS,
} from "./house.ts";

type Point = readonly [number, number, number];

export const CUTAWAY = {
  /** Camera-to-focus distances: fading starts at `start`, done at `gone`. */
  roof: { start: 14, gone: 8 },
  wall: { start: 11, gone: 6 },
  /** Cosine between the wall's outward normal and the camera direction. */
  facing: { start: 0.1, full: 0.3 },
} as const;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Fade per house group: 0 intact, 1 gone. Throws a RangeError for non-finite input. */
export function cutaway(
  camera: Point,
  focus: Point = HOUSE_FOCUS,
): Record<HouseGroup, number> {
  if (![...camera, ...focus].every(Number.isFinite))
    throw new RangeError("Camera position must be finite");
  const distance = Math.hypot(
    camera[0] - focus[0],
    camera[1] - focus[1],
    camera[2] - focus[2],
  );
  const fades = Object.fromEntries(
    HOUSE_GROUPS.map((group) => [group, 0]),
  ) as Record<HouseGroup, number>;
  const roof = smoothstep(CUTAWAY.roof.start, CUTAWAY.roof.gone, distance);
  fades["main-roof"] = roof;
  fades["garage-roof"] = roof;
  const close = smoothstep(CUTAWAY.wall.start, CUTAWAY.wall.gone, distance);
  if (close === 0) return fades;
  for (const wall of WALLS) {
    const u = (wall.from + wall.to) / 2;
    const y = HOUSE.floorY + wall.height / 2;
    const [x, z] = wall.axis === "x" ? [u, wall.at] : [wall.at, u];
    const dx = camera[0] - x;
    const dz = camera[2] - z;
    const length = Math.hypot(dx, camera[1] - y, dz) || 1;
    const dot = (wall.side * (wall.axis === "x" ? dz : dx)) / length;
    fades[wall.group] =
      close * smoothstep(CUTAWAY.facing.start, CUTAWAY.facing.full, dot);
  }
  return fades;
}
