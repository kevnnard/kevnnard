// Owned pastel palette for the world (01-warm-baked) and its lighting, derived
// from the room's shared day cycle so both routes keep the same hours, phases
// and sun/moon path. Pure sRGB numbers; the scene maps them onto three.js.

import {
  dayCycle,
  type Phase,
  type RGB,
  type Vec3,
} from "../room/day-cycle.ts";

/** Owned colors: island surfaces, and tints for the cloned model materials. */
export const PALETTE = {
  grass: "#9ccf7c",
  rock: "#b9a9b8",
  pad: "#efdcc0",
  /** Multiplies the packs' atlas colors, so it stays close to white. */
  foliage: "#f1fbe8",
  stone: "#f6f0f4",
  cloud: "#ffffff",
} as const;

/** Warm cream the daytime sky is lifted toward. */
const PASTEL_SKY: RGB = [1, 0.95, 0.9];
const PASTEL_DUSK: RGB = [1, 0.78, 0.74];

export interface WorldLight {
  hours: number;
  phase: Phase;
  sky: { zenith: RGB; horizon: RGB; ground: RGB };
  fog: RGB;
  key: {
    source: "sun" | "moon";
    position: Vec3;
    color: RGB;
    intensity: number;
  };
  ambient: { sky: RGB; ground: RGB; intensity: number };
  exposure: number;
  stars: number;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Pastel sky and soft light for an hour. Daylight lifts the shared cycle's
 * colors toward cream (pink at dusk); night keeps them dark so stars read.
 */
export function worldLight(hours: number): WorldLight {
  const cycle = dayCycle(hours);
  // 0 at night, 1 at noon: the cycle's ambient level already encodes it.
  const day = Math.min(Math.max((cycle.ambient.intensity - 0.2) / 0.4, 0), 1);
  const dusk = cycle.phase === "sunset" || cycle.phase === "dawn" ? 1 : 0;
  const target = mix(PASTEL_SKY, PASTEL_DUSK, dusk);
  const horizon = mix(cycle.sky.horizon, target, 0.45 * day);
  return {
    hours: cycle.hours,
    phase: cycle.phase,
    sky: {
      zenith: mix(cycle.sky.zenith, target, 0.3 * day),
      horizon,
      ground: mix(cycle.sky.ground, horizon, 0.5),
    },
    fog: horizon,
    key: { ...cycle.key, intensity: cycle.key.intensity * 0.9 },
    // Brighter fill than the room: soft, baked-looking shadows.
    ambient: {
      sky: mix(cycle.ambient.sky, PASTEL_SKY, 0.3 * day),
      ground: cycle.ambient.ground,
      intensity: cycle.ambient.intensity * 1.6 + 0.15,
    },
    exposure: cycle.exposure,
    stars: cycle.stars,
  };
}
