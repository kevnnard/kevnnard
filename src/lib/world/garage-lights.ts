// The garage as a detailing bay (dream-truck T2, S3, L2): a honeycomb LED
// grid on the ceiling for wide, even light and a clean reflection on the
// paint, two low LED bars along the side walls for the flanks, an LED strip
// round the truck on the floor, cool daylight white. In the truck's
// close-up they ramp up to full level at any hour; at night they come on by
// themselves, softer, and the garage door rolls down, back up by day or for
// the close-up. The close-up dissolves the roof and the walls, so it also
// brings a showroom set lit like the display cases (T14, T3): a soft key
// from the camera's side, uplights from the floor at the left and the
// front, a top light over the bonnet and a gentle rim from behind, about
// the cases' 23 lx on the body, plus stronger reflections on the paint. The
// master power switch turns everything off like the cases. Pure numbers;
// GarageLights draws the LEDs and lights, Truck boosts its reflections,
// House rolls the door.

import { GARAGE_INTERIOR } from "./garage.ts";
import { HOUSE, type Part, type Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
import { environmentIntensity } from "./palette.ts";
import { TRUCK, truckBox } from "./truck.ts";

const FLOOR = HOUSE.floorY;

export const GARAGE_LIGHTS = {
  /** Daylight white, about 6000 K. */
  color: "#fff3ef",
  /** Unlit LEDs: a pale diffuser. */
  off: "#d9d4ce",
  /** Emissive strength of the LEDs at full level. */
  glow: 2.2,
  /** Level by night with no close-up: softer than the showroom's 1. */
  night: 0.45,
  /** Seconds to ramp between levels. */
  ramp: 0.8,
  /**
   * Reflection strength on the truck's paint in the close-up: the scene's
   * environment is 0.1 by day and 0.01 at night, which leaves black paint
   * a flat silhouette (the cases boost theirs to 0.5 the same way).
   */
  envBoost: 0.6,
} as const;

/**
 * The ceiling grid: inside the walls, short of the rolled-up door's drum at
 * the front, 1.88 m over the floor (0.26 m over the truck's roof, under the
 * 1.95 m eave). Flat-topped hexagons of `side` metres, tubes `bar` wide.
 */
export const GARAGE_GRID = {
  x0: GARAGE_INTERIOR.x0 + 0.15,
  x1: GARAGE_INTERIOR.x1 - 0.15,
  z0: GARAGE_INTERIOR.z0 + 0.2,
  z1: GARAGE_INTERIOR.z1 - 0.45,
  y: FLOOR + 1.88,
  side: 0.28,
  bar: 0.035,
  thickness: 0.02,
} as const;

type Point = [number, number];

/**
 * The honeycomb's edges (world x, z): every whole hexagon that fits the
 * grid's frame, the lattice centred in it, each shared edge once.
 */
export function hexGrid(): [Point, Point][] {
  const { x0, x1, z0, z1, side: s } = GARAGE_GRID;
  const h = Math.sqrt(3) * s;
  const hexes: Point[][] = [];
  for (let col = 0; ; col++) {
    const cx = x0 + s + col * 1.5 * s;
    if (cx + s > x1 + 1e-9) break;
    for (let row = 0; ; row++) {
      const cz = z0 + h / 2 + row * h + (col % 2 === 1 ? h / 2 : 0);
      if (cz + h / 2 > z1 + 1e-9) break;
      hexes.push(
        Array.from({ length: 6 }, (_, k): Point => {
          const angle = (k * Math.PI) / 3;
          return [cx + s * Math.cos(angle), cz + s * Math.sin(angle)];
        }),
      );
    }
  }
  // Centre the lattice in the frame.
  const xs = hexes.flat().map(([x]) => x);
  const zs = hexes.flat().map(([, z]) => z);
  const dx = (x0 + x1) / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dz = (z0 + z1) / 2 - (Math.min(...zs) + Math.max(...zs)) / 2;
  const edges = new Map<string, [Point, Point]>();
  for (const hex of hexes)
    for (let k = 0; k < 6; k++) {
      const a: Point = [hex[k][0] + dx, hex[k][1] + dz];
      const b: Point = [hex[(k + 1) % 6][0] + dx, hex[(k + 1) % 6][1] + dz];
      const key = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        .map((v) => v.toFixed(4))
        .join();
      if (!edges.has(key)) edges.set(key, [a, b]);
    }
  return [...edges.values()];
}

/** The grid as boxes: one tube per edge and the four sides of its frame. */
export function gridParts(): Part[] {
  const { x0, x1, z0, z1, y, bar, thickness } = GARAGE_GRID;
  const tube = (a: Point, b: Point): Part => ({
    shape: "box",
    center: [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2],
    size: [Math.hypot(b[0] - a[0], b[1] - a[1]), thickness, bar],
    rotation: [0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0],
    color: GARAGE_LIGHTS.color,
    shade: 1,
  });
  return [
    ...hexGrid().map(([a, b]) => tube(a, b)),
    tube([x0, z0], [x1, z0]),
    tube([x0, z1], [x1, z1]),
    tube([x0, z0], [x0, z1]),
    tube([x1, z0], [x1, z1]),
  ];
}

/**
 * The low side bars, 0.62 m over the floor (under the left wall's window
 * sills), 3.3 m long beside the truck: on the left wall's inside face and on
 * the main house's wall, which is the garage's right side there.
 */
export const GARAGE_BARS: readonly { center: Vec3; size: Vec3 }[] = [
  GARAGE_INTERIOR.x0 + 0.015,
  HOUSE.garage.x1 - 0.015,
].map((x) => ({
  center: [x, FLOOR + 0.62, -0.25] as Vec3,
  size: [0.03, 0.04, 3.3] as Vec3,
}));

const BOX = truckBox();
const MID_Z = (BOX.z0 + BOX.z1) / 2;
const [TRUCK_X] = TRUCK.position;

/**
 * The LED strip on the floor: a thin outline 8 cm round the truck's
 * footprint (mirrors included), inside the walls and short of the door,
 * lit with the grid and the bars.
 */
export function floorStripParts(): Part[] {
  const gap = 0.08;
  const width = 0.03;
  const height = 0.006;
  const x0 = BOX.x0 - gap;
  const x1 = BOX.x1 + gap;
  const z0 = BOX.z0 - gap;
  const z1 = BOX.z1 + gap;
  const y = FLOOR + height / 2;
  const strip = (center: Vec3, size: Vec3): Part => ({
    shape: "box",
    center,
    size,
    color: GARAGE_LIGHTS.color,
    shade: 1,
  });
  return [
    strip([(x0 + x1) / 2, y, z0], [x1 - x0 + width, height, width]),
    strip([(x0 + x1) / 2, y, z1], [x1 - x0 + width, height, width]),
    strip([x0, y, (z0 + z1) / 2], [width, height, z1 - z0]),
    strip([x1, y, (z0 + z1) / 2], [width, height, z1 - z0]),
  ];
}

export interface GarageLightFixture {
  role: "ceiling" | "side" | "key" | "uplight" | "top" | "rim";
  position: Vec3;
  target: Vec3;
  /** With the bay at full level (close-up, or 0.45 of it by night). */
  intensity: number;
  /** Added in the close-up only (garageShowroomLevel). */
  showroom: number;
  angle: number;
  penumbra: number;
  /** Metres to zero: the light stays in the garage. */
  distance: number;
  /** No falloff inside the cutoff: even, without a hot spot by the lamp. */
  decay: 0;
  castShadow: false;
}

/** A showroom spot: dark until the close-up, soft and even. */
const showroomSpot = (
  role: GarageLightFixture["role"],
  position: Vec3,
  target: Vec3,
  showroom: number,
  angle: number,
  penumbra: number,
  distance: number,
): GarageLightFixture => ({
  role,
  position,
  target,
  intensity: 0,
  showroom,
  angle,
  penumbra,
  distance,
  decay: 0,
  castShadow: false,
});

/**
 * The bay: two soft spots down from the grid over the truck's front and
 * back halves, narrow enough (0.7 rad) that they stop at the floor short
 * of the main room, and two low fills from the side bars across the doors
 * and flanks, each stopping short of the opposite wall.
 *
 * The showroom set, for the close-up with the roof and walls gone (T3),
 * tuned on the truck's real surfaces (TRUCK_SURFACES) to about 27 lx on the
 * flank, the bonnet and the front, never under 21 nor over 33:
 * - a soft key from the camera's side, high off the front-left corner;
 * - two uplights at the floor out past the dissolved left wall, under the
 *   front and back doors, and one on the apron under the grille;
 * - a top light over the bonnet from the right, from inside the right wall
 *   and only aimed away from it (every ray heads to -x), so it cannot reach
 *   the main room however far it goes;
 * - a gentle rim from behind and above on the right, the camera's far side.
 * All decay 0 for even light without a hot spot by the lamp; every cutoff
 * stops short of the main room (none lights a point inside it).
 */
export const GARAGE_LIGHT_FIXTURES: readonly GarageLightFixture[] = [
  ...[-1.2, 1.2].map(
    (dz): GarageLightFixture => ({
      role: "ceiling",
      position: [TRUCK_X, GARAGE_GRID.y - 0.02, MID_Z + dz],
      target: [TRUCK_X, FLOOR, MID_Z + dz],
      intensity: 2.4,
      showroom: 0,
      angle: 0.7,
      penumbra: 0.5,
      distance: 2.1,
      decay: 0,
      castShadow: false,
    }),
  ),
  ...GARAGE_BARS.map(
    ({ center: [x, y, z] }): GarageLightFixture => ({
      role: "side",
      position: [x + Math.sign(TRUCK_X - x) * 0.03, y, z],
      target: [TRUCK_X, y, z],
      intensity: 1.6,
      showroom: 0,
      angle: 1.45,
      penumbra: 0.4,
      distance: 2,
      decay: 0,
      castShadow: false,
    }),
  ),
  showroomSpot(
    "key",
    [TRUCK_X - 0.96, FLOOR + 2, BOX.z1 + 0.54],
    [TRUCK_X + 0.09, FLOOR + 0.85, MID_Z + 0.85],
    38,
    1.25,
    0.8,
    2.85,
  ),
  ...[1.5, -1.5].map((dz) =>
    showroomSpot(
      "uplight",
      [TRUCK_X - 1.96, FLOOR + 0.07, MID_Z + dz],
      [TRUCK_X - 0.9, FLOOR + 0.85, MID_Z + dz],
      35,
      1.35,
      0.6,
      3.2,
    ),
  ),
  showroomSpot(
    "uplight",
    [TRUCK_X + 0.39, FLOOR + 0.07, BOX.z1 + 1.09],
    [TRUCK_X, FLOOR + 0.85, BOX.z1 - 0.04],
    30,
    1,
    0.6,
    2.4,
  ),
  showroomSpot(
    "top",
    [HOUSE.garage.x1 - 0.05, FLOOR + 1.85, BOX.z1 - 0.06],
    [TRUCK_X - 0.06, FLOOR + 1.15, MID_Z + 1.1],
    37,
    0.75,
    0.6,
    3.85,
  ),
  showroomSpot(
    "rim",
    [HOUSE.garage.x1 - 0.15, FLOOR + 2.15, BOX.z0 - 0.04],
    [TRUCK_X - 0.46, FLOOR + 1.25, MID_Z + 0.8],
    6,
    0.4,
    0.8,
    6,
  ),
];

/**
 * Points on the truck's paint the showroom set is tuned and tested on,
 * measured from dream-truck.glb at its 0.82 scale: the left flank (doors
 * and fenders sit at x -3.24 to -3.45), the bonnet's top (1.25 to 1.35 m,
 * z 1.4 to 2.25) and the grille (z 2.42 in the middle, 2.22 at the
 * corners), each with its outward normal.
 */
export const TRUCK_SURFACES: Record<
  "flank" | "hood" | "front",
  readonly { point: Vec3; normal: Vec3 }[]
> = {
  flank: [0.45, 0.7, 0.95].flatMap((y) =>
    [-2.2, -1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65, 2.2].map((z) => ({
      point: [TRUCK_X - 0.78, FLOOR + y, z] as Vec3,
      normal: [-1, 0, 0] as Vec3,
    })),
  ),
  hood: [-0.66, 0, 0.66].flatMap((dx) =>
    [1.4, 1.75, 2.1].map((z) => ({
      point: [TRUCK_X + dx, FLOOR + 1.15, z] as Vec3,
      normal: [0, 1, 0] as Vec3,
    })),
  ),
  front: [-0.66, -0.31, 0, 0.34, 0.64].flatMap((dx) =>
    [0.45, 0.75, 1.05].map((y) => ({
      point: [
        TRUCK_X + dx,
        FLOOR + y,
        BOX.z1 - 0.036 - (0.2 * Math.abs(dx)) / 0.66,
      ] as Vec3,
      normal: [0, 0, 1] as Vec3,
    })),
  ),
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Light (lux, as three.js computes it) the garage puts on `point` facing
 * `normal` (null: any way it faces), with the bay at `bay` and the showroom
 * set at `showroom`: each spot's cone and penumbra (smoothstep between the
 * outer and inner cosines), its decay and its cutoff window, and the cosine
 * on the surface.
 */
export function garageIlluminance(
  point: Vec3,
  normal: Vec3 | null,
  bay: number,
  showroom: number,
): number {
  let total = 0;
  for (const f of GARAGE_LIGHT_FIXTURES) {
    const power = f.intensity * bay + f.showroom * showroom;
    if (power <= 0) continue;
    const l = f.position.map((v, i) => v - point[i]);
    const d = Math.hypot(...l);
    const axis = f.target.map((v, i) => v - f.position[i]);
    const length = Math.hypot(...axis);
    const angleCos =
      -l.reduce((sum, v, i) => sum + v * axis[i], 0) / (d * length);
    const spot = smoothstep(
      Math.cos(f.angle),
      Math.cos(f.angle * (1 - f.penumbra)),
      angleCos,
    );
    if (spot <= 0) continue;
    let falloff = 1 / Math.max(d ** f.decay, 0.01);
    if (f.distance > 0) falloff *= Math.max(0, 1 - (d / f.distance) ** 4) ** 2;
    const facing = normal
      ? Math.max(0, l.reduce((sum, v, i) => sum + v * normal[i], 0) / d)
      : 1;
    total += power * spot * falloff * facing;
  }
  return total;
}

/**
 * 0-1 level of the garage lights: off with the master power off (like the
 * cases), full in the truck's close-up whatever the hour, softer at night,
 * off by day.
 */
export function garageLightLevel(
  hours: number,
  power: boolean,
  inspecting: boolean,
): number {
  if (!power) return 0;
  if (inspecting) return 1;
  return nightLightsOn(hours) ? GARAGE_LIGHTS.night : 0;
}

/** 0-1 level of the showroom set: the truck's close-up only, power on. */
export function garageShowroomLevel(
  power: boolean,
  inspecting: boolean,
): number {
  return power && inspecting ? 1 : 0;
}

/**
 * Reflection strength for the truck's paint: the scene's own outside the
 * close-up; with the showroom set at `level`, `level * envBoost` of it,
 * never below the scene's (displayCaseEnvIntensity's rule, at any hour).
 */
export function garageTruckEnvIntensity(level: number, hours: number): number {
  const scene = environmentIntensity(hours);
  return Math.min(1, Math.max(scene, level * GARAGE_LIGHTS.envBoost));
}

/** The roller door's motion: seconds from open to closed. */
export const GARAGE_DOOR_MOTION = { duration: 1.5 } as const;

/** 1 when the garage door should be down (night, no close-up), else 0. */
export function garageDoorClosed(hours: number, inspecting: boolean): number {
  return nightLightsOn(hours) && !inspecting ? 1 : 0;
}

/**
 * `current` moved toward `target` by `dt` seconds at a steady rate that
 * covers 0 to 1 in `duration`; reduced motion lands at once.
 */
export function easeToward(
  current: number,
  target: number,
  dt: number,
  duration: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return target;
  const step = dt / duration;
  return current < target
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
}
