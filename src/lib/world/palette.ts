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
} as const;

/** Warm soft white the clouds start from, before the hour tints them. */
const CLOUD_WHITE: RGB = [1, 0.98, 0.95];

/** Warm cream the daytime sky is lifted toward. */
const PASTEL_SKY: RGB = [1, 0.95, 0.9];
const PASTEL_DUSK: RGB = [1, 0.78, 0.74];

/** Deeper moon blue the world's moonlight leans toward (S18). */
const MOON_DEEP: RGB = [0.42, 0.55, 0.95];

/**
 * World-only light balance (S18). The sun keys harder and the fill and
 * environment drop, so shadows read; by night the fill falls further and the
 * moon turns bluer, so the night lights carry the interior. Fill scales from
 * day to full night follow the sun's elevation, never the 18:00 fixture gate.
 */
const BALANCE = {
  sunKey: 1.3,
  moonKey: 0.85,
  fill: { day: 0.8, night: 0.45 },
  environment: { day: 0.16, night: 0.03 },
  chair: { day: 0.8, night: 0.55 },
} as const;

/** Key light distance multiplier over the cycle's 9 m path. */
export const KEY_DISTANCE_SCALE = 1.6;

/**
 * The single directional shadow map (S18): one 2048 map, its ortho box fitted
 * to the island rim up to the tallest caster (house ridge, scaled trees) for
 * any light direction, a near/far span around the key's 14.4-15 m distance,
 * a small normal bias so contact shadows stay attached, and a light blur.
 */
export const WORLD_SHADOW = {
  mapSize: 2048,
  extent: 8.25,
  casterTop: 3.6,
  near: 2,
  far: 32,
  bias: -0.0004,
  normalBias: 0.02,
  radius: 2,
} as const;

export interface WorldLight {
  hours: number;
  phase: Phase;
  /** 0 with the sun well up, 1 once it is 0.2 below the horizon. */
  night: number;
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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Smooth 0 (day) to 1 (night) from the sun's elevation. */
const nightAt = (sunY: number) => 1 - smoothstep(-0.2, 0.3, sunY);

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
  const sunY = cycle.sun.direction[1];
  const night = nightAt(sunY);
  // The bodies swap only while the key is dark, so the scale never jumps.
  const keyScale =
    cycle.key.source === "sun" ? BALANCE.sunKey : BALANCE.moonKey;
  const moonlit = 1 - smoothstep(-0.25, 0.25, sunY);
  return {
    hours: cycle.hours,
    phase: cycle.phase,
    night,
    sky: {
      zenith: mix(cycle.sky.zenith, target, 0.3 * day),
      horizon,
      ground: mix(cycle.sky.ground, horizon, 0.5),
    },
    fog: horizon,
    key: {
      ...cycle.key,
      color: mix(cycle.key.color, MOON_DEEP, 0.6 * moonlit),
      intensity: cycle.key.intensity * keyScale,
    },
    // S18: a lower fill than the sun-to-shadow ratio of T4h, and lower still
    // at night, so shadows read by day and the night stays dark blue.
    ambient: {
      sky: mix(cycle.ambient.sky, PASTEL_SKY, 0.3 * day),
      ground: cycle.ambient.ground,
      intensity:
        cycle.ambient.intensity *
        lerp(BALANCE.fill.day, BALANCE.fill.night, night),
    },
    exposure: cycle.exposure,
    stars: cycle.stars,
  };
}

/**
 * Strength of the generated environment reflections (T4h): enough by day to
 * lift the metals and plastics without flattening the sun's shadows, nearly
 * off at night, where its neutral studio light would read as white moonlight
 * (S18).
 */
export function environmentIntensity(hours: number): number {
  const { day, night } = BALANCE.environment;
  return lerp(day, night, worldLight(hours).night);
}

/**
 * Brightness of Bruno's unlit chair bake: dimmer than his bake by day, and
 * lower still at night so it does not float above the moonlit room.
 */
export function chairShade(hours: number): number {
  const { day, night } = BALANCE.chair;
  return lerp(day, night, worldLight(hours).night);
}

export interface CloudShade {
  color: RGB;
  emissive: RGB;
  emissiveIntensity: number;
}

/**
 * Cloud color for an hour: warm white tinted by the sky fill and key light
 * (pink at dusk, blue at night), with an emissive lift so the faces turned
 * away from the sun stay soft instead of reading as gray rock.
 */
export function cloudShade(light: WorldLight): CloudShade {
  const tint = mix(light.ambient.sky, light.key.color, 0.5);
  const day = 1 - light.stars;
  return {
    color: mix(CLOUD_WHITE, tint, 0.3 + 0.4 * (1 - day)),
    emissive: mix(CLOUD_WHITE, tint, 0.5),
    emissiveIntensity: 0.06 + 0.24 * day,
  };
}
