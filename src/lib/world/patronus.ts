// The patronus (patronus T1, S1-S2): a ghostly silver-blue lion that
// bursts from the Elder Wand's tip as the spell plays (wand.ts), leaps
// down off the shelf, runs a curve through the living room at floor level
// (past the cases, round the sofa, between the coffee table and the TV)
// and dissolves into particles, about 3.6 s in all. It reads from a
// distance: translucent, additive, a fresnel rim, wisps trailing, a slight
// flicker (Patronus.tsx). The body is the owner's lion ("Lion" by keh,
// Sketchfab, CC BY 4.0), prepared by scripts/prepare-patronus.mjs (patronus
// T2). Not under reduced motion. Pure numbers.

import type { Vec3 } from "./house.ts";
import { HOUSE } from "./house.ts";
import { WAND_TIP } from "./wand.ts";

const FLOOR = HOUSE.floorY + 0.04;

export const PATRONUS = {
  /** Seconds after the spell began (wand.ts SPELL) that it bursts out. */
  start: 0.9,
  duration: 3.6,
  /** Grows from this share of its size over `grow` seconds at the tip. */
  burstScale: 0.25,
  grow: 0.45,
  fadeIn: 0.25,
  /** The last seconds, dissolving into particles. */
  dissolve: 0.7,
  /**
   * The lion's height to the top of its mane, metres: about 1 m at the
   * shoulder (keh's lion has its shoulder joint at 0.674 of its height),
   * 2.75 m from nose to tail tip; under the walls' top.
   */
  lionHeight: 1.48,
  lionShoulder: 118.7 / 176.2,
  color: "#bcd8ff",
  rim: "#eef6ff",
  /** The prepared lion (scripts/prepare-patronus.mjs). */
  lion: "/world/models/patronus-lion.glb",
} as const;

/**
 * The run's waypoints (world): out of the tip, a leap down off the shelf,
 * then along the floor through the living room's free floor.
 */
export const PATRONUS_PATH: readonly Vec3[] = [
  WAND_TIP,
  [-0.35, 0.75, 0.62],
  [0.35, FLOOR, 0.72],
  [1.2, FLOOR, 0.42],
  [1.55, FLOOR, -0.45],
  [1.7, FLOOR, -1.3],
  [2.1, FLOOR, -1.87],
  [2.9, FLOOR, -1.88],
  [3.5, FLOOR, -1.86],
  [3.7, FLOOR, -1.5],
];

/** Uniform Catmull-Rom through the waypoints, `u` 0-1 over the segments. */
function curveAt(u: number): Vec3 {
  const points = PATRONUS_PATH;
  const n = points.length - 1;
  const x = Math.min(n - 1e-9, Math.max(0, u * n));
  const i = Math.floor(x);
  const t = x - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  const out = [0, 1, 2].map(
    (k) =>
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * t +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
  ) as Vec3;
  // Never under the floor where the leap lands.
  out[1] = Math.max(FLOOR, out[1]);
  return out;
}

/** Arc length table, so the lion runs at an even pace. */
const SAMPLES = 400;
const TABLE: { u: number; s: number }[] = (() => {
  const rows = [{ u: 0, s: 0 }];
  let prev = curveAt(0);
  for (let k = 1; k <= SAMPLES; k++) {
    const u = k / SAMPLES;
    const p = curveAt(u);
    rows.push({
      u,
      s: rows[k - 1].s + Math.hypot(...p.map((v, i) => v - prev[i])),
    });
    prev = p;
  }
  return rows;
})();

/** The run's length in metres. */
export const PATRONUS_LENGTH = TABLE[SAMPLES].s;

function pointAtDistance(s: number): Vec3 {
  const target = Math.min(PATRONUS_LENGTH, Math.max(0, s));
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TABLE[mid].s < target) lo = mid;
    else hi = mid;
  }
  const a = TABLE[lo];
  const b = TABLE[hi];
  const f = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
  return curveAt(a.u + (b.u - a.u) * f);
}

export interface PatronusState {
  position: Vec3;
  /** Yaw about +y, 0 facing +z: atan2 of the run's direction (x, z). */
  heading: number;
  /** Size share, 0-1. */
  scale: number;
  opacity: number;
  /** 0 whole, 1 all particles. */
  dissolve: number;
  /** Seconds into the run. */
  time: number;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** The patronus `t` seconds after the spell began; null when not out. */
export function patronusAt(t: number): PatronusState | null {
  const time = t - PATRONUS.start;
  if (time < 0 || time > PATRONUS.duration) return null;
  const s = (time / PATRONUS.duration) * PATRONUS_LENGTH;
  const position = pointAtDistance(s);
  const ahead = pointAtDistance(s + 0.05);
  const behind = pointAtDistance(s - 0.05);
  const heading = Math.atan2(ahead[0] - behind[0], ahead[2] - behind[2]);
  const grow = smooth(time / PATRONUS.grow);
  const scale = PATRONUS.burstScale + (1 - PATRONUS.burstScale) * grow;
  const dissolve = smooth(
    (time - (PATRONUS.duration - PATRONUS.dissolve)) / PATRONUS.dissolve,
  );
  const opacity = smooth(time / PATRONUS.fadeIn) * (1 - 0.9 * dissolve);
  return { position, heading, scale, opacity, dissolve, time };
}

/**
 * The run's bounding box (world), over the curve itself: the chase camera
 * (wand-shot.ts) frames it.
 */
export const PATRONUS_BOUNDS: { min: Vec3; max: Vec3 } = (() => {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { u } of TABLE) {
    const p = curveAt(u);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  return { min, max };
})();
