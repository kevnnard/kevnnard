// Collection shelf lamp (T14, S29): a wall lamp in the style of the setup
// shelf's gamer lamps (lights.ts LAMP), mounted on the left wall centred over
// the personal collection shelf. A wall plate and a straight arm run out
// along the shelf's centre line (z = SHELF.base[2]) above the football, drop
// to the head, which hangs well out in front of the shelf so the bell shade
// aims back at the shelf's centre and its warm spot washes every tier, from
// the football on top down to the bottom shelf.
// Night only, like the other night lights. Clickable to toggle on/off with an
// audible mechanical switch click (CC0).
// Module name kept from the earlier floor lamp so imports stay stable.

import { HOUSE, type Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
import { SHELF } from "./shelf.ts";

/** Inner face of the main room's left wall, where the plate is screwed. */
const WALL_X = HOUSE.main.x0 + HOUSE.wall;
const FLOOR = SHELF.base[1];

/** Centre line of the shelf's width, which the whole lamp sits on. */
const CENTER_Z = SHELF.base[2];
/** Height of the plate and the straight arm, ~0.2 m over the football's top. */
const ARM_Y = FLOOR + 1.84;
/** Where the arm turns down: about 0.3 m in front of the shelf face. */
const REACH_X = -0.42;

/**
 * Wall lamp joints in world coordinates, all on the shelf's centre line so
 * the lamp reads straight and symmetric from the room. The arm runs level
 * over the football (top ~1.64 m) and drops vertically to the head.
 */
export const FLOOR_LAMP = {
  /** Centre of the wall plate, on the wall face. */
  mount: [WALL_X, ARM_Y, CENTER_Z] as Vec3,
  /** Shoulder pivot just off the plate. */
  shoulder: [WALL_X + 0.05, ARM_Y, CENTER_Z] as Vec3,
  /** Elbow at the end of the level arm, past the shelf front. */
  elbow: [REACH_X, ARM_Y, CENTER_Z] as Vec3,
  /** Head pivot (shade crown), straight below the elbow. */
  head: [REACH_X, ARM_Y - 0.08, CENTER_Z] as Vec3,
  plate: { width: 0.09, height: 0.13, depth: 0.012 },
  armRadius: 0.008,
  jointRadius: 0.016,
  shade: { length: 0.13, top: 0.025, bottom: 0.075 },
  bulbRadius: 0.022,
  /** Warm amber of the lamp light. */
  lightColor: "#ffd28a",
  /** Soft glow around the head, well under the spot. */
  pointIntensity: 0.4,
  pointDistance: 1.2,
  /** Main spot on the shelf; above the desk lamps (0.75) for the longer throw. */
  spotIntensity: 2,
  spotDistance: 3.5,
  /** Cone half-angle (radians): the football on top down to the bottom shelf's ends. */
  spotAngle: 1.15,
  /** Soft edge so the wide cone fades instead of drawing a hard ring. */
  spotPenumbra: 0.6,
  lightDecay: 2,
  /** Bulb glow when lit; enough to read as on without blowing out. */
  bulbEmissive: 0.7,
  /** Output by day: none, the lamp only lights at night. */
  dayLevel: 0,
  /** Click target: a sphere around the shade. */
  hitboxRadius: 0.12,
  colors: {
    plate: "#1c1b1f",
    arm: "#27272a",
    joint: "#b89058",
    shade: "#222126",
    shadeInner: "#e6d7b8",
    bulbOff: "#d4ceb8",
    bulbOn: "#fff3cc",
  },
} as const;

/** Point the spot aims at: the centre of the shelf's front face, mid height. */
export function floorLampLightTarget(): Vec3 {
  const [sx, sy, sz] = SHELF.base;
  return [sx + SHELF.depth / 2, sy + SHELF.height / 2, sz];
}

/** Unit vector from the head pivot toward the light target: the shade's axis. */
export function floorLampAim(): Vec3 {
  const [hx, hy, hz] = FLOOR_LAMP.head;
  const [tx, ty, tz] = floorLampLightTarget();
  const d: Vec3 = [tx - hx, ty - hy, tz - hz];
  const len = Math.hypot(...d);
  return [d[0] / len, d[1] / len, d[2] / len];
}

/** Bulb centre: partway down the shade along its axis. */
export function floorLampHeadPosition(): Vec3 {
  const [hx, hy, hz] = FLOOR_LAMP.head;
  const [ax, ay, az] = floorLampAim();
  const t = FLOOR_LAMP.shade.length * 0.55;
  return [hx + ax * t, hy + ay * t, hz + az * t];
}

/**
 * 0-1 output of the lamp: full at night (the NightLights gate, 18:00-05:59),
 * off by day (`dayLevel`), and zero when switched off or `power` is off.
 */
export function floorLampLevel(
  enabled: boolean,
  hours: number,
  power = true,
): number {
  if (!enabled || !power) return 0;
  return nightLightsOn(hours) ? 1 : FLOOR_LAMP.dayLevel;
}

/** The lamp switch click (CC0), shared by every clickable lamp. */
export const LAMP_SWITCH_URL = "/world/audio/lamp-click.mp3";
/** Soft, subtle click volume. */
export const LAMP_SWITCH_GAIN = 0.35;

function defaultLampContext(): AudioContext | null {
  const Context =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Context ? new Context() : null;
}

/**
 * A lamp switch player with one lazy AudioContext: nothing is created or
 * fetched until the first click (a user gesture), the click is fetched and
 * decoded once, and every later click reuses the same context and buffer.
 * `play` never throws or rejects.
 */
export function createLampSwitch({
  createContext = defaultLampContext,
  fetch: fetcher = (input, init) => globalThis.fetch(input, init),
}: {
  createContext?: () => AudioContext | null;
  fetch?: typeof fetch;
} = {}): () => void {
  let context: AudioContext | null = null;
  let failed = false;
  let load: Promise<AudioBuffer | null> | null = null;

  const start = (ctx: AudioContext, buffer: AudioBuffer) => {
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(LAMP_SWITCH_GAIN, ctx.currentTime);
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    } catch {
      // A failed click is not worth surfacing.
    }
  };

  return () => {
    if (failed) return;
    try {
      context ??= createContext();
    } catch {
      context = null;
    }
    const ctx = context;
    if (!ctx) {
      failed = true;
      return;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
    load ??= fetcher(LAMP_SWITCH_URL)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    load.then((buffer) => {
      if (buffer) start(ctx, buffer);
      else failed = true;
    });
  };
}

/** The page's shared lamp switch click. */
export const playLampSwitch = createLampSwitch();
