// The garage as a detailing bay (dream-truck T2, S3, L2): a honeycomb LED
// grid on the ceiling for wide, even light and a clean reflection on the
// paint, two low LED bars along the side walls for the flanks, cool
// daylight white. In the truck's close-up they ramp up to showroom level at
// any hour; at night they come on by themselves, softer, and the garage
// door rolls down, back up by day or for the close-up. The master power
// switch turns them off like the display cases. Pure numbers; GarageLights
// draws the LEDs and lights, House rolls the door.

import { GARAGE_INTERIOR } from "./garage.ts";
import { HOUSE, type Part, type Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
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

export interface GarageLightFixture {
  role: "ceiling" | "side";
  position: Vec3;
  target: Vec3;
  /** At full level. */
  intensity: number;
  angle: number;
  penumbra: number;
  /** Metres to zero: the light stays in the garage. */
  distance: number;
  /** No falloff inside the cutoff: even, without a hot spot by the lamp. */
  decay: 0;
  castShadow: false;
}

const BOX = truckBox();
const MID_Z = (BOX.z0 + BOX.z1) / 2;
const [TRUCK_X] = TRUCK.position;

/**
 * Two soft spots down from the grid over the truck's front and back
 * halves, cut off at the floor so none reaches the main room, and two low
 * fills from the side bars across the doors and flanks, each stopping short
 * of the opposite wall.
 */
export const GARAGE_LIGHT_FIXTURES: readonly GarageLightFixture[] = [
  ...[-1.2, 1.2].map(
    (dz): GarageLightFixture => ({
      role: "ceiling",
      position: [TRUCK_X, GARAGE_GRID.y - 0.02, MID_Z + dz],
      target: [TRUCK_X, FLOOR, MID_Z + dz],
      intensity: 2.4,
      angle: 1,
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
      angle: 1.45,
      penumbra: 0.4,
      distance: 2,
      decay: 0,
      castShadow: false,
    }),
  ),
];

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
