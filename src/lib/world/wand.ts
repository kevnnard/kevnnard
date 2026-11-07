// The Elder Wand on the collection shelf (patronus T1, S1): Heniqueish's
// "Elder Wand" (Sketchfab, CC BY 4.0, scripts/prepare-wand.mjs) at true
// scale, 38 cm, lying on a small dark wooden stand at the front of the
// eye-level board's right column, in front of the cameras. A subtle accent
// light picks it out at night, like the display cases. Clicked, its
// close-up (wand-shot.ts) plays the spell on arrival: the tip lights, a
// short silver-blue spark trail, "Expecto Patronum" in the card's type,
// and the patronus (patronus.ts) runs out across the room. Harry Potter,
// the Elder Wand and Expecto Patronum belong to Warner Bros. and J.K.
// Rowling; fan tribute, no affiliation. Pure numbers; Wand.tsx renders it.

import type { Part, Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
import { SHELF_TIERS, shelfToWorld } from "./shelf.ts";

/** The derived mesh: one wand, 2 units along x, its tip at -x. */
export const WAND_MODEL = {
  url: "/world/models/elder-wand.glb",
  length: 2,
} as const;

/** The stand: an oak-dark plate and two cradles, in the shelf's frame. */
export const WAND_STAND = {
  width: 0.3,
  depth: 0.045,
  plate: 0.012,
  /** Cradle tops under the handle and under the shaft (thinner there). */
  cradles: [
    { x: 0.11, height: 0.024, width: 0.022 },
    { x: -0.11, height: 0.028, width: 0.022 },
  ],
  cradleDepth: 0.036,
  color: "#3b2a20",
} as const;

const FLOOR = SHELF_TIERS[3];
/** The handle's radius at its cradle, so the wand rests on it. */
const HANDLE_RADIUS = 0.009;

/**
 * Lying along the board's width (shelf local x), the tip toward the
 * divider, 12.8 cm in front of the back so the stand clears the Zenit and
 * the Samsung behind it. `local` is the wand's middle, on its axis.
 */
export const WAND = {
  length: 0.38,
  floor: FLOOR,
  local: [
    0.29,
    FLOOR + WAND_STAND.plate + WAND_STAND.cradles[0].height + HANDLE_RADIUS,
    0.128,
  ] as Vec3,
} as const;

/** The wand's middle and its tip in the world. */
export const WAND_CENTRE: Vec3 = shelfToWorld(WAND.local);
export const WAND_TIP: Vec3 = shelfToWorld([
  WAND.local[0] - WAND.length / 2,
  WAND.local[1],
  WAND.local[2],
]);

/** The stand's parts in the shelf's local frame (base centre at the origin). */
export function wandStandParts(): (Part & { material: "wood" })[] {
  const [x, , z] = WAND.local;
  const { plate, depth, width, color } = WAND_STAND;
  const block = (center: Vec3, size: Vec3, shade = 1) => ({
    shape: "rounded" as const,
    radius: 0.003,
    segments: 2,
    center,
    size,
    color,
    shade,
    material: "wood" as const,
  });
  return [
    block([x, FLOOR + plate / 2, z], [width, plate, depth]),
    ...WAND_STAND.cradles.map((c) =>
      block(
        [x + c.x, FLOOR + plate + c.height / 2, z],
        [c.width, c.height, WAND_STAND.cradleDepth],
        0.92,
      ),
    ),
  ];
}

/**
 * Click target: wand and stand only, a little above the wand. Its front
 * pokes 3 cm past the shelf's face (SHELF_HITBOX), so it takes the click
 * before the shelf's own box; nothing else on the board is inside it.
 */
export const WAND_HITBOX: { center: Vec3; size: Vec3 } = (() => {
  const [x, , z] = WAND.local;
  const x0 = x - 0.21;
  const x1 = x + 0.21;
  const z0 = z - 0.033;
  const z1 = 0.19;
  const y0 = FLOOR;
  const y1 = FLOOR + 0.07;
  const a = shelfToWorld([x0, y0, z0]);
  const b = shelfToWorld([x1, y1, z1]);
  return {
    center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    size: [Math.abs(b[0] - a[0]), b[1] - a[1], Math.abs(b[2] - a[2])],
  };
})();

/**
 * The accent: one soft warm spot under the top board, in front, aimed at
 * the wand; night only, like the cases (display-cases.ts).
 */
export const WAND_LIGHT = {
  position: shelfToWorld([WAND.local[0], FLOOR + 0.3, 0.155]),
  target: WAND_CENTRE,
  color: "#ffe6c2",
  intensity: 0.9,
  angle: 0.55,
  penumbra: 0.8,
  distance: 0.6,
  decay: 2,
} as const;

/** The accent's level: on at night with the power, else 0 (still mounted). */
export function wandAccentLevel(hours: number, power: boolean): number {
  return power && nightLightsOn(hours) ? 1 : 0;
}

/**
 * The spell, in seconds from the camera's arrival (or Cast again): the
 * tip's glow rises, the silver-blue sparks trail off it, the words show
 * briefly, and the glow settles to an ember once it is over.
 */
export const SPELL = {
  color: "#cfe3ff",
  /** Glow rise; the glow then holds until `fade` and eases to `ember`. */
  rise: 0.45,
  fade: [3.6, 5] as const,
  ember: 0.25,
  /** The tip light at full glow. */
  light: 1.6,
  lightDistance: 1.4,
  /** Sparks spawn over this span. */
  sparks: [0.15, 1.5] as const,
  /** The words: in, held, out. */
  words: [0.35, 2.8] as const,
  wordsFade: 0.4,
  /** Under reduced motion: a static glow, no particles. */
  staticGlow: 0.7,
} as const;

export interface SpellState {
  /** Tip emissive, 0-1. */
  glow: number;
  /** Tip point light, 0-1. */
  light: number;
  /** Spark spawn rate, 0-1. */
  sparks: number;
  /** The words' opacity, 0-1. */
  words: number;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** The spell `t` seconds after it began; negative: not cast yet. */
export function wandSpellAt(t: number, reducedMotion: boolean): SpellState {
  if (t < 0) return { glow: 0, light: 0, sparks: 0, words: 0 };
  const [w0, w1] = SPELL.words;
  if (reducedMotion) {
    const shown = t >= w0 && t <= w1 ? 1 : 0;
    return {
      glow: SPELL.staticGlow,
      light: SPELL.staticGlow,
      sparks: 0,
      words: shown,
    };
  }
  const [f0, f1] = SPELL.fade;
  const up = smooth(t / SPELL.rise);
  const down = smooth((t - f0) / (f1 - f0));
  const glow = up * (1 - down * (1 - SPELL.ember));
  const [s0, s1] = SPELL.sparks;
  const sparks = t >= s0 && t <= s1 ? 1 - smooth((t - s0) / (s1 - s0)) ** 2 : 0;
  const fade = SPELL.wordsFade;
  const words =
    t < w0 || t > w1
      ? 0
      : Math.min(smooth((t - w0) / fade), smooth((w1 - t) / fade));
  return { glow, light: glow, sparks, words };
}

export interface WandStory {
  kicker: string;
  title: string;
  /** Why this corner exists: the owner is a fan. */
  lines: readonly string[];
  filmsLabel: string;
  films: readonly { title: string; year: number }[];
  /** Short facts about the wand and the charm. */
  lore: readonly { term: string; text: string }[];
  spell: string;
}

export const WAND_STORY: WandStory = {
  kicker: "COLLECTION · ELDER WAND",
  title: "Expecto Patronum",
  lines: [
    "Harry Potter has been part of my life since I was a kid: the books, the films, the music. I'm a big fan.",
    "So this corner of my open world recreates one of its most iconic moments: the Elder Wand casting the Patronus Charm. My patronus is a lion.",
  ],
  filmsLabel: "The eight films",
  films: [
    { title: "Philosopher's Stone", year: 2001 },
    { title: "Chamber of Secrets", year: 2002 },
    { title: "Prisoner of Azkaban", year: 2004 },
    { title: "Goblet of Fire", year: 2005 },
    { title: "Order of the Phoenix", year: 2007 },
    { title: "Half-Blood Prince", year: 2009 },
    { title: "Deathly Hallows – Part 1", year: 2010 },
    { title: "Deathly Hallows – Part 2", year: 2011 },
  ],
  lore: [
    {
      term: "The wand",
      text: "The Elder Wand, the most powerful of the three Deathly Hallows.",
    },
    {
      term: "The charm",
      text: "Expecto Patronum conjures a guardian of silver light. Harry first casts a full one in Prisoner of Azkaban.",
    },
  ],
  spell: "Expecto Patronum",
};
