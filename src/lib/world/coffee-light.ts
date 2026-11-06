// The coffee close-up's key light (coffee-card T4): a warm, soft spot above
// and a little behind the coffee shot's end camera, aimed at the cup's
// middle, that fades in while the close-up is open and out on leave. At
// night it lights the cup about as the display cases' key lights their items
// (display-cases.ts, ~23 lx), a little under it and with no hot spot; by
// day, and with the master power off, it is off. A short range keeps it on
// the cup and the coaster. Pure numbers; CoffeeLight.tsx renders them.

import type { Vec3 } from "./camera.ts";
import { coffeeShotAt } from "./coffee-shot.ts";
import { DISPLAY_CASE } from "./display-cases.ts";
import { nightLightsOn } from "./lights.ts";
import { SETUP_PROPS } from "./setup.ts";

export const COFFEE_LIGHT = {
  /** The cases' warm museum white. */
  color: DISPLAY_CASE.lightColor,
  /** Candela: ~19 lx on the cup's middle, under the cases' ~23. */
  intensity: 17,
  /**
   * Half-angle: a ~0.16 m pool at the cup, so the soft core covers the cup
   * and the edge falls off over the coaster.
   */
  angle: 0.27,
  /** Soft edge, as the cases' key. */
  penumbra: DISPLAY_CASE.spotPenumbra,
  /** Range: just past the cup, so the desk behind it barely catches it. */
  distance: 0.8,
  decay: DISPLAY_CASE.lightDecay,
  castShadow: false,
  /** Head: this far up from the end camera, and back away from the cup. */
  rise: 0.25,
  back: 0.1,
  /** Seconds to fade in, and out. */
  fade: 0.8,
  /** Output by day: off, like the cases. */
  dayLevel: 0,
} as const;

const MUG = SETUP_PROPS.mug;

/** The cup's middle, at rest on the coaster. */
export const COFFEE_LIGHT_AIM: Vec3 = [
  MUG.center[0],
  MUG.center[1] + MUG.height / 2,
  MUG.center[2],
];

/** The spot's head: over the end camera, a little further from the cup. */
export const COFFEE_LIGHT_POSITION: Vec3 = (() => {
  const { eye } = coffeeShotAt(1);
  const away = [eye[0] - COFFEE_LIGHT_AIM[0], eye[2] - COFFEE_LIGHT_AIM[2]];
  const level = Math.hypot(away[0], away[1]);
  return [
    eye[0] + (away[0] / level) * COFFEE_LIGHT.back,
    eye[1] + COFFEE_LIGHT.rise,
    eye[2] + (away[1] / level) * COFFEE_LIGHT.back,
  ];
})();

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Smoothstep: a slow start and a slow landing. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * Illuminance (lux) on a surface facing a point light of `intensity`
 * candela `distance` metres away, with three.js's physical falloff: inverse
 * square, windowed to zero at `range`.
 */
export function spotLux(
  intensity: number,
  distance: number,
  range: number,
): number {
  const window = clamp01(1 - (distance / range) ** 4) ** 2;
  return (intensity / Math.max(distance * distance, 0.01)) * window;
}

/**
 * 0-1 output at full fade: on at night (the NightLights gate), `dayLevel`
 * by day, zero with the master `power` off.
 */
export function coffeeLightLevel(hours: number, power = true): number {
  if (!power) return 0;
  return nightLightsOn(hours) ? 1 : COFFEE_LIGHT.dayLevel;
}

/**
 * The fade's progress (0-1) after `dt` seconds: toward 1 while `active`,
 * toward 0 otherwise, over `fade` seconds; reduced motion cuts.
 */
export function coffeeLightFadeStep(
  fade: number,
  dt: number,
  active: boolean,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return active ? 1 : 0;
  const step = dt / COFFEE_LIGHT.fade;
  return clamp01(active ? fade + step : fade - step);
}

/** The light's 0-1 output: the eased fade times the time-of-day level. */
export function coffeeLightOutput(fade: number, level: number): number {
  return ease(clamp01(fade)) * level;
}

/** Lux on the cup's middle at `output`. */
export function coffeeLightLux(output: number): number {
  const d = Math.hypot(
    COFFEE_LIGHT_POSITION[0] - COFFEE_LIGHT_AIM[0],
    COFFEE_LIGHT_POSITION[1] - COFFEE_LIGHT_AIM[1],
    COFFEE_LIGHT_POSITION[2] - COFFEE_LIGHT_AIM[2],
  );
  return spotLux(COFFEE_LIGHT.intensity * output, d, COFFEE_LIGHT.distance);
}
