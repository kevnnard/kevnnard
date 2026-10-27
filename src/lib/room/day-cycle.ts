// Pure 24-hour day cycle for the room's sky and lighting. Plain numbers and
// tuples only, so it can be unit tested without WebGL; the scene maps the
// result onto three.js objects. Colors are sRGB channels in [0, 1].

export type RGB = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];
export type Phase = "night" | "dawn" | "day" | "sunset";

export const PRESETS = { day: 13, sunset: 17.5, night: 23 } as const;
export type Preset = keyof typeof PRESETS;

export interface DayCycle {
  hours: number;
  phase: Phase;
  sky: { zenith: RGB; horizon: RGB; ground: RGB };
  /** The single shadow-casting light: the sun by day, the moon by night. */
  key: {
    source: "sun" | "moon";
    position: Vec3;
    color: RGB;
    intensity: number;
  };
  ambient: { sky: RGB; ground: RGB; intensity: number };
  /** Multiplier for the indoor accent lamps; 1 at midday. */
  accent: number;
  /** `scene.environmentIntensity` for the generated reflections. */
  environment: number;
  /** Renderer tone-mapping exposure. */
  exposure: number;
  stars: number;
  sun: { direction: Vec3; glow: number };
  moon: { direction: Vec3; opacity: number };
}

/** Wraps a finite hour into [0, 24). Throws a RangeError for NaN or ±Infinity. */
export function wrapHours(hours: number): number {
  if (!Number.isFinite(hours))
    throw new RangeError(`Expected a finite hour, got ${hours}`);
  return ((hours % 24) + 24) % 24;
}

export function phaseAt(hours: number): Phase {
  const h = wrapHours(hours);
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 16.5) return "day";
  if (h >= 16.5 && h < 19.5) return "sunset";
  return "night";
}

/** "HH:MM" on a 24-hour clock, rounded to the nearest minute. */
export function formatHours(hours: number): string {
  const minutes = Math.round(wrapHours(hours) * 60) % (24 * 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Signed hours from `from` to `to` going the short way around the clock. */
export function shortestHourDelta(from: number, to: number): number {
  const delta = wrapHours(to - wrapHours(from));
  return delta > 12 ? delta - 24 : delta;
}

const hex = (value: string): RGB => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
};

interface Keyframe {
  hour: number;
  zenith: RGB;
  horizon: RGB;
  ground: RGB;
  ambientSky: RGB;
  ambientGround: RGB;
  ambient: number;
  environment: number;
  exposure: number;
  accent: number;
  stars: number;
}

const frame = (
  hour: number,
  [zenith, horizon, ground, ambientSky, ambientGround]: string[],
  [ambient, environment, exposure, accent, stars]: number[],
): Keyframe => ({
  hour,
  zenith: hex(zenith),
  horizon: hex(horizon),
  ground: hex(ground),
  ambientSky: hex(ambientSky),
  ambientGround: hex(ambientGround),
  ambient,
  environment,
  exposure,
  accent,
  stars,
});

const NIGHT = ["#040713", "#18213d", "#07080d", "#5d73a8", "#15121c"];
const NIGHT_LEVELS = [0.2, 0.07, 0.95, 1.8, 1];
// Sorted by hour; the cycle wraps from the last frame back to the first.
const KEYFRAMES: readonly Keyframe[] = [
  frame(0, NIGHT, NIGHT_LEVELS),
  frame(4.5, NIGHT, NIGHT_LEVELS),
  frame(
    6,
    ["#2a3766", "#f0a27a", "#2a2228", "#b49ab4", "#2e2228"],
    [0.32, 0.12, 0.95, 1.5, 0.25],
  ),
  frame(
    8,
    ["#5b8fd0", "#f5d7b0", "#5a5650", "#c8d8ec", "#4a3a30"],
    [0.5, 0.2, 1, 1.1, 0],
  ),
  frame(
    12,
    ["#3f7dcc", "#c4dcf0", "#66645e", "#c2d7ee", "#46302a"],
    [0.6, 0.24, 1, 1, 0],
  ),
  frame(
    16,
    ["#4a78b8", "#ead0a8", "#5f5a52", "#d6d2d0", "#4a3428"],
    [0.55, 0.22, 1, 1.1, 0],
  ),
  frame(
    18,
    ["#33407a", "#ff8c50", "#3a2a26", "#e8a888", "#3a2622"],
    [0.42, 0.16, 1, 1.35, 0],
  ),
  frame(
    19.5,
    ["#141c3e", "#5a3f6e", "#15121a", "#8a7fb0", "#201822"],
    [0.28, 0.1, 0.97, 1.65, 0.6],
  ),
  frame(21, NIGHT, NIGHT_LEVELS),
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

function sampleKeyframes(h: number) {
  let index = KEYFRAMES.length - 1;
  while (KEYFRAMES[index].hour > h) index--;
  const from = KEYFRAMES[index];
  const to = KEYFRAMES[(index + 1) % KEYFRAMES.length];
  const span = wrapHours(to.hour - from.hour) || 24;
  // Cosine easing: no visible kinks when the slider passes a keyframe.
  const t = (1 - Math.cos(((h - from.hour) / span) * Math.PI)) / 2;
  return {
    zenith: mix(from.zenith, to.zenith, t),
    horizon: mix(from.horizon, to.horizon, t),
    ground: mix(from.ground, to.ground, t),
    ambientSky: mix(from.ambientSky, to.ambientSky, t),
    ambientGround: mix(from.ambientGround, to.ambientGround, t),
    ambient: lerp(from.ambient, to.ambient, t),
    environment: lerp(from.environment, to.environment, t),
    exposure: lerp(from.exposure, to.exposure, t),
    accent: lerp(from.accent, to.accent, t),
    stars: lerp(from.stars, to.stars, t),
  };
}

// Sun and moon travel opposite arcs: rising at +x, setting at -x, tilted
// toward +z (the room's open side) so their light reaches inside.
function celestial(angle: number): Vec3 {
  const [x, y, z] = [Math.cos(angle), Math.sin(angle), 0.5];
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

const SUN_LOW = hex("#ff9a5a");
const SUN_HIGH = hex("#ffe6c4");
const MOON = hex("#9fb6e8");
const SUN_INTENSITY = 2.2;
const MOON_INTENSITY = 0.55;
const KEY_DISTANCE = 9;

/** Sky, light and exposure for an hour. Throws a RangeError for non-finite input. */
export function dayCycle(hours: number): DayCycle {
  const h = wrapHours(hours);
  const frame = sampleKeyframes(h);
  const sun = celestial(((h - 6) / 12) * Math.PI);
  const moon = celestial(((h - 18) / 12) * Math.PI);
  const sunUp = smoothstep(0, 0.35, sun[1]);
  const moonUp = smoothstep(0, 0.35, moon[1]);

  // Bodies swap only at 06:00/18:00, where both sit on the horizon and the key
  // intensity is zero, so the jump in position is never lit.
  const source = sun[1] >= moon[1] ? "sun" : "moon";
  const body = source === "sun" ? sun : moon;
  const sunColor = mix(SUN_LOW, SUN_HIGH, smoothstep(0.05, 0.6, sun[1]));

  return {
    hours: h,
    phase: phaseAt(h),
    sky: { zenith: frame.zenith, horizon: frame.horizon, ground: frame.ground },
    key: {
      source,
      position: [
        body[0] * KEY_DISTANCE,
        Math.max(body[1], 0.3) * KEY_DISTANCE,
        body[2] * KEY_DISTANCE,
      ],
      color: mix(MOON, sunColor, smoothstep(-0.25, 0.25, sun[1])),
      intensity: SUN_INTENSITY * sunUp + MOON_INTENSITY * moonUp,
    },
    ambient: {
      sky: frame.ambientSky,
      ground: frame.ambientGround,
      intensity: frame.ambient,
    },
    accent: frame.accent,
    environment: frame.environment,
    exposure: frame.exposure,
    stars: frame.stars,
    sun: {
      direction: sun,
      glow:
        (1 - smoothstep(0.05, 0.5, sun[1])) * smoothstep(-0.2, 0.02, sun[1]),
    },
    moon: { direction: moon, opacity: moonUp },
  };
}
