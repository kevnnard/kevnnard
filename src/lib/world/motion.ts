// Small setup animations (T4i), ported from Bruno Simon's my-room-in-3d at
// 5d00b3f8 (TopChair.js, GoogleLeds.js, BouncingLogo.js) and used with the
// author's permission (credited in public/world/credits.json). Pure numbers
// so the limits are unit tested; Setup.tsx drives them from the frame clock.
// Times are in milliseconds, as in the original.

/** Continuous rendering only this close to the setup (near or inside the house). */
export const ANIMATION_DISTANCE = 16;

/** Animate only near the house, and never with reduced motion. */
export function setupAnimates({
  reducedMotion,
  distance,
}: {
  reducedMotion: boolean;
  distance: number;
}): boolean {
  return !reducedMotion && distance < ANIMATION_DISTANCE;
}

/** Chair sway amplitude: Bruno's 0.5 rad halved, so the seat clears the desk. */
export const CHAIR_SWAY = 0.25;

/** TopChair: `sin(t * 0.0005) * 0.5`, scaled to `CHAIR_SWAY`. */
export function chairSway(t: number): number {
  return Math.sin(t * 0.0005) * 0.5 * (CHAIR_SWAY / 0.5);
}

/** Dimmest LED level, as a share of the hour's glow: never dark. */
export const LED_MIN = 0.4;

/** GoogleLeds' wave `sin(t * 0.002 - index * 0.5) * 0.5 + 0.5`, mapped onto `base`. */
export function ledLevel(t: number, index: number, base: number): number {
  const wave = Math.sin(t * 0.002 - index * 0.5) * 0.5 + 0.5;
  return base * (LED_MIN + (1 - LED_MIN) * wave);
}

/** GoogleLeds.update: each LED's opacity, `sin(t * 0.002 - index * 0.5) * 0.5 + 0.5`. */
export function googleLedOpacity(t: number, index: number): number {
  return Math.sin(t * 0.002 - index * 0.5) * 0.5 + 0.5;
}

/** GoogleLeds' colors, sorted like his led0..led3. */
export const GOOGLE_LED_COLORS = [
  "#196aff",
  "#ff0000",
  "#ff5d00",
  "#7db81b",
] as const;

/** Google Home LED opacity at rest (reduced motion or far away). */
export const GOOGLE_LED_REST = 0.8;

/**
 * LoupedeckButtons' animation (T4k): every 5 s about half the buttons light
 * in one of his colors, staggered 50 ms, fade in over 200 ms, hold 3 s and
 * fade out over 500 ms (gsap's default power1.out). His Math.random picks are
 * replaced by a hash of the cycle, so a frame is a pure function of time.
 */
export const LOUPEDECK = {
  buttons: 14,
  period: 5000,
  stagger: 50,
  fadeIn: 200,
  hold: 3000,
  fadeOut: 500,
  colors: ["#af55cf", "#dbd85d", "#e86b24", "#b81b54"],
} as const;

const unit = (cycle: number, index: number, salt: number) => {
  const x = Math.sin(cycle * 127.1 + index * 311.7 + salt * 74.7) * 43758.5453;
  return x - Math.floor(x);
};
const easeOut = (p: number) => 1 - (1 - Math.min(Math.max(p, 0), 1)) ** 2;

/** One Loupedeck button at `t` ms: its color and opacity. */
export function loupedeckButton(
  t: number,
  index: number,
): { color: (typeof LOUPEDECK.colors)[number]; opacity: number } {
  const cycle = Math.floor(t / LOUPEDECK.period);
  const local = t - cycle * LOUPEDECK.period;
  const { colors } = LOUPEDECK;
  const color = colors[Math.floor(unit(cycle, index, 2) * colors.length)];
  if (unit(cycle, index, 1) >= 0.5) return { color, opacity: 0 };
  let order = 0;
  for (let i = 0; i < index; i++) if (unit(cycle, i, 1) < 0.5) order++;
  const start = order * LOUPEDECK.stagger;
  const fading = start + LOUPEDECK.fadeIn + LOUPEDECK.hold;
  const opacity =
    local < fading
      ? easeOut((local - start) / LOUPEDECK.fadeIn)
      : 1 - easeOut((local - fading) / LOUPEDECK.fadeOut);
  return { color, opacity };
}

/** The Loupedeck's still frame: mid-hold of the first cycle. */
export const LOUPEDECK_REST = 1500;

export interface BounceState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// BouncingLogo's travel (limits) and speeds per millisecond, in his units.
const ORIGINAL = {
  x: { min: -1.076, max: 1.454, speed: 0.00061 },
  y: { min: -1.055, max: 0.947, speed: 0.00037 },
};

/** Side screen and logo, in metres (setup.ts SETUP_PROPS.sideScreen). */
export const LOGO = { width: 0.11, height: 0.06 } as const;
const SCREEN = { width: 0.48, height: 0.28, margin: 0.012 } as const;

const travel = (screen: number, logo: number) =>
  screen / 2 - logo / 2 - SCREEN.margin;
const limitsX = travel(SCREEN.width, LOGO.width);
const limitsY = travel(SCREEN.height, LOGO.height);

/** Bruno's limits and speeds, rescaled so the logo crosses our screen at his pace. */
export const BOUNCE = {
  limits: {
    x: { min: -limitsX, max: limitsX },
    y: { min: -limitsY, max: limitsY },
  },
  start: {
    x: 0,
    y: 0,
    vx: (ORIGINAL.x.speed * (2 * limitsX)) / (ORIGINAL.x.max - ORIGINAL.x.min),
    vy: (ORIGINAL.y.speed * (2 * limitsY)) / (ORIGINAL.y.max - ORIGINAL.y.min),
  } satisfies BounceState,
} as const;

/** BouncingLogo.update: move, clamp at an edge and reverse that axis. */
export function bounceStep(state: BounceState, delta: number): BounceState {
  let { x, y, vx, vy } = state;
  x += vx * delta;
  y += vy * delta;
  const { limits } = BOUNCE;
  if (x > limits.x.max) {
    x = limits.x.max;
    vx = -Math.abs(vx);
  }
  if (x < limits.x.min) {
    x = limits.x.min;
    vx = Math.abs(vx);
  }
  if (y > limits.y.max) {
    y = limits.y.max;
    vy = -Math.abs(vy);
  }
  if (y < limits.y.min) {
    y = limits.y.min;
    vy = Math.abs(vy);
  }
  return { x, y, vx, vy };
}
