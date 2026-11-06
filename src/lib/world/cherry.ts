// Cherry, the owner's Miniature Pinscher (dog-rig T3): with him for more
// than nineteen years, kept here for good. She trots out to the front yard
// in the morning, 06:00-11:59 on the world clock, and stands at one of a few
// curated spots on open grass, playing her idle loop; each in-world morning
// picks the next spot (deterministic per day, never the same two mornings
// running), and she stays put through the visit, so she is findable. She
// fades in and out over about a second, and moves only once she is gone.
// Clicking her opens a cinematic close-up and her card (cherry-shot.ts,
// CherryCard.tsx). Pure numbers; Cherry.tsx renders her.
//
// Model: "Dog (Miniature Pinscher 小鹿犬)" by 3D Creator (Sketchfab, CC BY
// 4.0), rigged, animated and decimated by scripts/prepare-dog.mjs. Three's
// frame: +x her nose, +y up, +z her right; feet at y = 0, centred in x and z.

import { wrapHours } from "../room/day-cycle.ts";
import { groundY } from "./garden.ts";
import { HOUSE, type Vec3 } from "./house.ts";
import { seededRandom } from "./random.ts";

/**
 * The shipped model, true size: a Min Pin stands 25-32 cm at the withers.
 * Height is to the ear tips; length nose to tail; width across the body.
 */
export const CHERRY_MODEL = {
  url: "/world/models/cherry.glb",
  clip: "idle",
  withers: 0.28,
  height: 0.413,
  length: 0.453,
  width: 0.139,
} as const;

/** Her eyes, above the ground and ahead of her centre. */
const EYE = { y: 0.33, ahead: 0.18 } as const;

/** Out from `from` to before `to`, world-clock hours. */
export const CHERRY_HOURS = { from: 6, to: 12 } as const;

/** Whether she is out in the yard at `hours` (any finite hour, wrapped). */
export function isCherryHour(hours: number): boolean {
  if (!Number.isFinite(hours)) return false;
  const hour = wrapHours(hours);
  return hour >= CHERRY_HOURS.from && hour < CHERRY_HOURS.to;
}

/** Seconds to fade fully in or out. */
export const CHERRY_FADE = 1;

/** Ground she needs around her centre: half her length and a little more. */
export const CHERRY_REACH = 0.26;

export interface CherrySpot {
  id: string;
  /** World x, z of her centre. */
  position: readonly [number, number];
  /** Turn about y: 0 points her nose to +x. */
  rotationY: number;
  /**
   * Which side of her nose the close-up looks from: 1 her right (toward
   * +z when she faces +x), -1 her left. Picked so the lens stays on grass.
   */
  lensSide: 1 | -1;
}

/**
 * Open grass in the front yard, off the pad, the stepping-stone path, the
 * mailbox and sign, the plants and the flowers, each in sight of the home
 * view and facing the yard (a three-quarter view from home), with room
 * for the close-up's lens on grass too: left of the path behind the
 * mailbox, the lawn out front, among the stones on the right, and the
 * front-right corner by the house. tests/world/cherry.test.ts checks the
 * clearances.
 */
export const CHERRY_SPOTS: readonly CherrySpot[] = [
  { id: "mailbox", position: [-0.5, 3.3], rotationY: -0.9, lensSide: 1 },
  { id: "front-lawn", position: [-0.6, 4.4], rotationY: -0.15, lensSide: -1 },
  { id: "stones", position: [3.5, 3.9], rotationY: -0.9, lensSide: 1 },
  { id: "corner", position: [4.4, 2.6], rotationY: -0.75, lensSide: -1 },
];

/** Local calendar day number of `date` (days since 1970-01-01). */
export function cherryDayOf(date: Date): number {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

/** Which in-world day it is, and whether she is out. */
export interface CherryVisit {
  day: number;
  morning: boolean;
}

/**
 * The visit at load: today's date, or yesterday's before 06:00, so the
 * first morning that comes is today's.
 */
export function startVisit(date: Date, hours: number): CherryVisit {
  const early = Number.isFinite(hours) && wrapHours(hours) < CHERRY_HOURS.from;
  return {
    day: cherryDayOf(date) - (early ? 1 : 0),
    morning: isCherryHour(hours),
  };
}

/**
 * The visit at `hours`: each time the morning starts it is the next day.
 * Returns `visit` itself when nothing changes.
 */
export function nextVisit(visit: CherryVisit, hours: number): CherryVisit {
  const morning = isCherryHour(hours);
  if (morning === visit.morning) return visit;
  return { day: morning ? visit.day + 1 : visit.day, morning };
}

const SPOT_SEED = 1906;

/** The spots' order in one stretch of as many days as there are spots. */
function stretch(index: number): number[] {
  const random = seededRandom(SPOT_SEED + index * 7919);
  const order = CHERRY_SPOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * The spot of `day`: each stretch of days visits every spot once, in a
 * seeded order; a stretch never opens where the last one closed.
 */
export function cherrySpotIndex(day: number): number {
  const n = CHERRY_SPOTS.length;
  const index = Math.floor(day / n);
  const order = stretch(index);
  const last = stretch(index - 1)[n - 1];
  if (order[0] === last) [order[0], order[1]] = [order[1], order[0]];
  return order[day - index * n];
}

/** She shows as `opacity` (0-1) at `spot`. */
export interface CherryPresence {
  opacity: number;
  spot: CherrySpot;
}

/**
 * One frame (`dt` seconds) of her fade toward shown or gone at `spot`: a
 * new spot first fades her out where she is, then moves her. `instant`
 * (reduced motion) cuts. Returns `state` itself when nothing changes.
 */
export function cherryPresence(
  state: CherryPresence,
  show: boolean,
  spot: CherrySpot,
  dt: number,
  instant: boolean,
): CherryPresence {
  if (instant) {
    const next = { opacity: show ? 1 : 0, spot: show ? spot : state.spot };
    return next.opacity === state.opacity && next.spot === state.spot
      ? state
      : next;
  }
  const step = Math.max(0, dt) / CHERRY_FADE;
  if (spot !== state.spot) {
    if (state.opacity <= 0) return { opacity: 0, spot };
    return {
      opacity: Math.max(0, state.opacity - step),
      spot: state.spot,
    };
  }
  const opacity = show
    ? Math.min(1, state.opacity + step)
    : Math.max(0, state.opacity - step);
  return opacity === state.opacity ? state : { opacity, spot: state.spot };
}

/** Her root at a spot: feet on the ground, turned to face the yard. */
export function cherryPlacement(spot: CherrySpot): {
  position: Vec3;
  rotationY: number;
} {
  const [x, z] = spot.position;
  return { position: [x, groundY(x, z), z], rotationY: spot.rotationY };
}

/** Her nose's direction on the ground (x, z) at a spot. */
export function cherryNose(spot: CherrySpot): [number, number] {
  return [Math.cos(spot.rotationY), -Math.sin(spot.rotationY)];
}

/** A point on her chest, for sight lines. */
export function cherryChest(spot: CherrySpot): Vec3 {
  const { position } = cherryPlacement(spot);
  const [nx, nz] = cherryNose(spot);
  return [position[0] + nx * 0.1, position[1] + 0.22, position[2] + nz * 0.1];
}

/** Her eyes' midpoint at a spot. */
export function cherryEyes(spot: CherrySpot): Vec3 {
  const { position } = cherryPlacement(spot);
  const [nx, nz] = cherryNose(spot);
  return [
    position[0] + nx * EYE.ahead,
    position[1] + EYE.y,
    position[2] + nz * EYE.ahead,
  ];
}

/**
 * Click target in her own frame: a box round the whole dog, ears and tail
 * included, a little roomier than her so she is easy to find from afar.
 */
export const CHERRY_HITBOX = {
  center: [0, 0.25, 0] as Vec3,
  size: [0.6, 0.5, 0.34] as Vec3,
} as const;

/** The house's solid volumes to the roof ridge: main house and garage. */
const HOUSE_BOXES = [HOUSE.main, HOUSE.garage].map((volume) => ({
  min: [
    volume.x0 - volume.overhang.x0,
    0,
    volume.z0 - volume.overhang.z0,
  ] as Vec3,
  max: [
    volume.x1 + volume.overhang.x1,
    HOUSE.floorY + volume.height + volume.rise,
    volume.z1 + volume.overhang.z1,
  ] as Vec3,
}));

/**
 * Whether the house stands between `from` and `to` (a slab test against
 * its boxes): she is only clickable in plain sight.
 */
export function houseBlocks(from: Vec3, to: Vec3): boolean {
  return HOUSE_BOXES.some(({ min, max }) => {
    let enter = 0;
    let exit = 1;
    for (let axis = 0; axis < 3; axis++) {
      const d = to[axis] - from[axis];
      if (Math.abs(d) < 1e-12) {
        if (from[axis] < min[axis] || from[axis] > max[axis]) return false;
        continue;
      }
      let t0 = (min[axis] - from[axis]) / d;
      let t1 = (max[axis] - from[axis]) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      enter = Math.max(enter, t0);
      exit = Math.min(exit, t1);
      if (enter > exit) return false;
    }
    return true;
  });
}

/** A photo or clip of her, once the owner sends them. */
export interface CherryMedia {
  kind: "photo" | "clip";
  src: string;
  alt: string;
  /** A clip's still. */
  poster?: string;
  /** CSS object-position: the part to keep when cropped. */
  focus?: string;
}

export interface CherryStory {
  kicker: string;
  name: string;
  stats: readonly { label: string; value: string }[];
  /** Her story, a paragraph each, in the owner's words. */
  story: readonly string[];
  /** Photos and videos: none yet (null renders nothing). */
  media: readonly CherryMedia[] | null;
}

/** Her card (CherryCard.tsx): owner-approved copy (dog-rig S8). */
export const CHERRY_STORY: CherryStory = {
  kicker: "COMPANION · MINIATURE PINSCHER",
  name: "Cherry",
  stats: [
    { label: "With me", value: "19+ years" },
    { label: "Breed", value: "Miniature Pinscher" },
    { label: "Size", value: "Small, big heart" },
  ],
  story: [
    "Cherry has been by my side my whole life: more than nineteen years.",
    "Someday she will rest, and she will live on in my thoughts. I wish she never had to go, so I put her here, to keep her with me forever and never forget her.",
  ],
  media: null,
};
