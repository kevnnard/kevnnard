// One ground-level viewing zone in front of the open room cutaway, shared by
// the walking camera (which stays inside it) and the forest layout (which
// keeps every solid outside it and frames the view from its home point).
// Depends only on the house layout, so neither side imports the other.
import { LEVELS, ROOM_BOUNDS } from "./house-layout.ts";

export type XZ = readonly [number, number];

/** Eye height above the grass, in world units. */
export const EYE_HEIGHT = 2;

/** Unit ground direction from the room toward its open -x/+z cutaway. */
export const OPEN_SIDE: XZ = [-Math.SQRT1_2, Math.SQRT1_2];

const ROOM_CENTER: XZ = [
  (ROOM_BOUNDS.min[0] + ROOM_BOUNDS.max[0]) / 2,
  (ROOM_BOUNDS.min[2] + ROOM_BOUNDS.max[2]) / 2,
];
const fromRoom = (distance: number): XZ => [
  ROOM_CENTER[0] + OPEN_SIDE[0] * distance,
  ROOM_CENTER[1] + OPEN_SIDE[1] * distance,
];

export const VIEW_ZONE = {
  /** Walkable disc just outside the yard: a few steps, never around it. */
  center: fromRoom(16.5),
  radius: 3,
  /** Deterministic start, at the back of the disc facing the cutaway. */
  home: fromRoom(18.5),
  /** World height of the eye. */
  eyeY: LEVELS.terrainTop + EYE_HEIGHT,
} as const;

// Ground axes of the home view: forward toward the room, right of it.
const FORWARD: XZ = [-OPEN_SIDE[0], -OPEN_SIDE[1]];
const RIGHT: XZ = [-FORWARD[1], FORWARD[0]];

/** Ground point `depth` units ahead of home toward the room, `side` to its right. */
export function viewPoint(depth: number, side: number): XZ {
  const [hx, hz] = VIEW_ZONE.home;
  return [
    hx + FORWARD[0] * depth + RIGHT[0] * side,
    hz + FORWARD[1] * depth + RIGHT[1] * side,
  ];
}

const wrap = (angle: number) =>
  angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
const bearing = (x: number, z: number) =>
  Math.atan2(x - VIEW_ZONE.home[0], z - VIEW_ZONE.home[1]);
const TO_ROOM = bearing(...ROOM_CENTER);
const CORNERS: XZ[] = [0, 1, 2, 3].map((bits) => [
  bits & 1 ? ROOM_BOUNDS.max[0] : ROOM_BOUNDS.min[0],
  bits & 2 ? ROOM_BOUNDS.max[2] : ROOM_BOUNDS.min[2],
]);
const SPAN = CORNERS.map(([x, z]) => wrap(bearing(x, z) - TO_ROOM));
const DISTANCES = CORNERS.map(([x, z]) =>
  Math.hypot(x - VIEW_ZONE.home[0], z - VIEW_ZONE.home[1]),
);
/** Extra angle kept clear on both sides of the room, in radians. */
const CORRIDOR_MARGIN = 0.04;

// Steepest sight lines from the eye to the room: down to its nearest floor
// edge and up to its nearest roof edge, as rise over ground distance.
const NEAREST = Math.min(...DISTANCES);
const ROOM_LOW = (ROOM_BOUNDS.min[1] - VIEW_ZONE.eyeY) / NEAREST;
const ROOM_HIGH = (ROOM_BOUNDS.max[1] - VIEW_ZONE.eyeY) / NEAREST;

/**
 * Whether a solid of ground `radius` spanning world heights `bottom`..`top`
 * would hide part of the room seen from home. Inside the sight corridor it
 * may stay only entirely below the floor sight line (low rocks and logs) or
 * entirely above the roof sight line (canopies of close trees).
 */
export function hidesRoom(
  x: number,
  z: number,
  radius: number,
  top: number,
  bottom = -Infinity,
) {
  const [hx, hz] = VIEW_ZONE.home;
  const distance = Math.hypot(x - hx, z - hz);
  if (distance <= radius) return true;
  if (distance - radius > Math.max(...DISTANCES)) return false;
  const angle = wrap(bearing(x, z) - TO_ROOM);
  const half = Math.asin(radius / distance);
  if (
    angle + half < Math.min(...SPAN) - CORRIDOR_MARGIN ||
    angle - half > Math.max(...SPAN) + CORRIDOR_MARGIN
  )
    return false;
  const { eyeY } = VIEW_ZONE;
  // Highest and lowest rise of the solid over its nearest and farthest edge.
  const near = distance - radius;
  const far = distance + radius;
  const highest = (top - eyeY) / (top > eyeY ? near : far);
  const lowest = (bottom - eyeY) / (bottom > eyeY ? far : near);
  return highest > ROOM_LOW && lowest < ROOM_HIGH;
}
