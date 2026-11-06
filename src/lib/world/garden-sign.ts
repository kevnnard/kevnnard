// The garden sign's face, flip tiles, lantern glow and card (garden-sign
// T2, design/garden-sign/01-wooden-board.html): a painted board with the
// status headline (GARDEN_SIGN.status), the owner's name and role, and a
// dark flip-tile strip that rotates one short line every 3 s; a status
// lantern (green open, amber busy) that glows at night; a click target for
// the cinematic close-up (sign-shot.ts) and the compact card's content,
// all from the site's own copy. Email and city stay null until the owner
// gives them. Pure numbers; GardenSign.tsx and SignCard.tsx render them.

import type { Vec3 } from "./camera.ts";
import {
  GARDEN_PROPS,
  GARDEN_SIGN,
  lanternLevel,
  SIGN_LANTERN,
  SIGN_PANEL,
  type SignStatus,
} from "./garden.ts";
import {
  CONTACT_LINKS,
  portfolioBuffers,
  type TerminalLink,
} from "./terminal-content.ts";

export type { SignStatus };

export interface SignCopy {
  /** Painted on the board. */
  headline: string;
  /** The card's kicker, beside GARDEN SIGN. */
  kicker: string;
  /** The card's availability pill. */
  availability: string;
  /** The lantern glass and its light (sRGB hex). */
  lantern: string;
}

/** The emerald signal (design/system.md) when open, lamp amber when busy. */
const SIGN_COPY: Record<SignStatus, SignCopy> = {
  open: {
    headline: "OPEN TO WORK",
    kicker: "OPEN TO WORK",
    availability: "Available for projects",
    lantern: "#10b981",
  },
  busy: {
    headline: "BACK SOON",
    kicker: "BUSY",
    availability: "Busy · not taking new projects",
    lantern: "#ffc27a",
  },
};

export const signCopy = (status: SignStatus): SignCopy => SIGN_COPY[status];

/* ------------------------------------------------------------------ */
/* Flip tiles                                                          */
/* ------------------------------------------------------------------ */

/**
 * The one rotating line, from the site copy: the About summary's role, the
 * current role (Three Labs) and the core stack. "Based in" waits for the
 * owner's city.
 */
export const SIGN_MESSAGES = [
  "TypeScript full-stack",
  "Building Three Labs",
  "React · Next.js · NestJS",
] as const;

/**
 * Seconds per line, the flip at the end of each (folding the old line shut,
 * then opening the next) and, under reduced motion, a slower change with
 * no flip at all.
 */
export const SIGN_FLIP = { hold: 3, flip: 0.3, reducedHold: 9 } as const;

export interface SignTile {
  /** Index into SIGN_MESSAGES. */
  index: number;
  /** The line's vertical scale: 1 at rest, 0 when the tile is edge-on. */
  scale: number;
}

const wrapIndex = (k: number) =>
  ((k % SIGN_MESSAGES.length) + SIGN_MESSAGES.length) % SIGN_MESSAGES.length;

/** The tile line `elapsed` seconds after the sign appeared. */
export function signTile(elapsed: number, reduced: boolean): SignTile {
  const t = Math.max(0, elapsed);
  if (reduced)
    return {
      index: wrapIndex(Math.floor(t / SIGN_FLIP.reducedHold)),
      scale: 1,
    };
  const { hold, flip } = SIGN_FLIP;
  const k = Math.floor(t / hold);
  const u = (t - k * hold - (hold - flip)) / flip;
  if (u < 0) return { index: wrapIndex(k), scale: 1 };
  return u < 0.5
    ? { index: wrapIndex(k), scale: Math.max(0, Math.cos(u * Math.PI)) }
    : { index: wrapIndex(k + 1), scale: Math.max(0, -Math.cos(u * Math.PI)) };
}

/**
 * Seconds until the tile needs a frame again (the demand frameloop): the
 * next flip, 0 while one runs, or the next change under reduced motion.
 */
export function signTileWake(elapsed: number, reduced: boolean): number {
  const t = Math.max(0, elapsed);
  if (reduced) {
    const { reducedHold } = SIGN_FLIP;
    return reducedHold - (t - Math.floor(t / reducedHold) * reducedHold);
  }
  const { hold, flip } = SIGN_FLIP;
  const phase = t - Math.floor(t / hold) * hold;
  return Math.max(0, hold - flip - phase);
}

/* ------------------------------------------------------------------ */
/* Face                                                                */
/* ------------------------------------------------------------------ */

/**
 * The painted face in canvas pixels (SIGN_PANEL's shape, crisp at the
 * close-up): a coral rule, the status headline, the name line (the dot in
 * the coral) and the dark tile strip with its hairline. `y` is a line's
 * middle; the tiles are a box.
 */
export const SIGN_FACE = {
  canvas: [2048, 928] as const,
  rule: { inset: 40, width: 12 },
  headline: { y: 280, width: 1760, maxSize: 220, minSize: 96 },
  who: {
    y: 480,
    width: 1760,
    size: 76,
    text: "Kevin Londoño · Software Engineer",
  },
  tiles: {
    x: 184,
    y: 588,
    width: 1680,
    height: 200,
    radius: 18,
    ink: GARDEN_SIGN.ink,
    paint: GARDEN_SIGN.board,
  },
} as const;

/** Canvas width of `text` at a font size (the canvas's measureText). */
export type MeasureText = (text: string, size: number) => number;

/** The largest size, `step` at a time, at which `text` fits one line. */
export function fitLine(
  text: string,
  measure: MeasureText,
  width: number,
  maxSize: number,
  minSize = 12,
  step = 2,
): number {
  let size = maxSize;
  while (size > minSize && measure(text, size) > width) size -= step;
  return Math.max(size, minSize);
}

const PX = SIGN_PANEL.width / SIGN_FACE.canvas[0];

/**
 * The plane the rotating line is drawn on, over the face's strip (local to
 * the sign), and its own small canvas: only it redraws when the line
 * changes, and it folds (scale y) for the flip.
 */
export const SIGN_TILE_PANEL = (() => {
  const [w, h] = SIGN_FACE.canvas;
  const { x, y, width, height } = SIGN_FACE.tiles;
  const [cx, cy, cz] = SIGN_PANEL.center;
  return {
    width: width * PX,
    height: height * PX,
    center: [
      cx + (x + width / 2 - w / 2) * PX,
      cy - (y + height / 2 - h / 2) * PX,
      cz + 0.0015,
    ] as Vec3,
    canvas: [1260, 150] as const,
    fontSize: 66,
  };
})();

/* ------------------------------------------------------------------ */
/* Lantern, placement, click                                           */
/* ------------------------------------------------------------------ */

/**
 * The lantern at `hours`: its status colour, the light's candela (0 by day
 * and with the scene's master power off, the wall lanterns' night gate) and
 * the glass's emissive strength, low by day so the colour still reads.
 */
export function signLanternGlow(
  hours: number,
  power: boolean,
  status: SignStatus,
): { color: string; intensity: number; emissive: number } {
  const level = lanternLevel(hours, power);
  return {
    color: signCopy(status).lantern,
    intensity: SIGN_LANTERN.light.intensity * level,
    emissive: 0.35 + 1.25 * level,
  };
}

/** A point local to the sign, in the world (its prop frame on the grass). */
export function signWorld([x, y, z]: Vec3): Vec3 {
  const { position, rotationY } = GARDEN_PROPS.sign;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [position[0] + x * cos + z * sin, y, position[1] - x * sin + z * cos];
}

/** Click target, local to the sign: posts, board, cap and lantern. */
export const SIGN_HITBOX = {
  center: [0.025, 0.47, 0.01] as Vec3,
  size: [0.92, 0.96, 0.14] as Vec3,
} as const;

/** The middle of the face, in the world: what a click must see. */
export const SIGN_FACE_CENTRE = signWorld(SIGN_PANEL.center);

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface SignProfile {
  name: string;
  handle: string;
  role: string;
  /** The About summary, as the monitor's about buffer shows it. */
  summary: string;
  /** Core skills (src/components/page/Skills.astro). */
  stack: readonly string[];
  /** LinkedIn, GitHub (Footer), then the CVs (About), all external. */
  links: readonly TerminalLink[];
  /** Not in the site copy yet: hidden until the owner gives them. */
  email: string | null;
  city: string | null;
}

const ABOUT = portfolioBuffers({ projects: [], experience: [] }).about;
const contact = (label: string) =>
  CONTACT_LINKS.filter((link) => link.label === label);

/** The compact card beside the close-up: who, availability, stack, links. */
export const SIGN_PROFILE: SignProfile = {
  name: "Kevin Londoño",
  handle: "KEVNNARD",
  role: "Software Engineer",
  summary: ABOUT.summary,
  stack: [
    "TypeScript",
    "React",
    "Next.js",
    "React Native",
    "Node.js",
    "NestJS",
    "PostgreSQL",
    "Supabase",
    "AWS",
  ],
  links: [...contact("LinkedIn"), ...contact("GitHub"), ...ABOUT.links],
  email: null,
  city: null,
};
