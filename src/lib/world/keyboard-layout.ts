// The owner's NuPhy Air75 V2, black colourway (keyboard-faithful T1, S1):
// the 84-key ANSI 75% layout cap by cap, with each cap's width, colour role
// and printed legend. Pure data; setup.ts places the caps and
// scripts/prepare-keyboard-legends.mjs draws the legend atlas from it.
//
// Sources (read 2026-11-05):
// - https://nuphy.com/products/air75-v2 (official page; it answered with a
//   Vercel bot checkpoint, so the layout was read from the listing below).
// - https://www.amazon.com/dp/B0CMX8SLF6 (the owner's exact SKU, "Black"):
//   "Number of Keys: 84", 12.46 x 5.22 x 0.53 in (316.5 x 132.6 x 13.5 mm),
//   aluminium frame, PBT caps, an RGB light bar on each side of the frame;
//   main photo https://m.media-amazon.com/images/I/61aaNyky3sL._AC_SL1500_.jpg
//   for the rows, widths, legends and colours: black case, near-black
//   alphas, dark grey mods (F5-F8 too), mint Esc, coral Enter, yellow space.
// The F-row's Mac media icons are omitted: unreadable at scene scale.

export type KeyRole = "alpha" | "mod" | "esc" | "enter" | "space";
/** Drawn shapes for caps whose legend is an icon, not text. */
export type KeyIcon = "screenshot" | "up" | "down" | "left" | "right";

export interface KeyLegend {
  /** The main (lower, or only) legend. */
  main: string;
  /** The shifted symbol printed above `main`, number row and punctuation. */
  sub?: string;
  icon?: KeyIcon;
}

export interface KeySpec {
  units: number;
  role: KeyRole;
  /** `null` for a blank cap (the space bar). */
  legend: KeyLegend | null;
}

/** Board width in key units: every row fills it. */
export const BOARD_UNITS = 16;

const k = (
  units: number,
  role: KeyRole,
  main: string,
  sub?: string,
): KeySpec => ({ units, role, legend: sub ? { main, sub } : { main } });
const icon = (role: KeyRole, name: KeyIcon): KeySpec => ({
  units: 1,
  role,
  legend: { main: "", icon: name },
});
/** One-unit keys from a string of single-character legends. */
const run = (role: KeyRole, chars: string) =>
  [...chars].map((c) => k(1, role, c));
/** One-unit keys printing a shifted symbol over the main one. */
const pairs = (role: KeyRole, list: string) =>
  list.split(" ").map((p) => k(1, role, p.slice(1), p[0]));

/** Six rows, back (Esc) to front (space); left to right as typed. */
export const KEY_ROWS: readonly (readonly KeySpec[])[] = [
  [
    k(1, "esc", "ESC"),
    ...[1, 2, 3, 4].map((n) => k(1, "alpha", `F${n}`)),
    ...[5, 6, 7, 8].map((n) => k(1, "mod", `F${n}`)),
    ...[9, 10, 11, 12].map((n) => k(1, "alpha", `F${n}`)),
    icon("mod", "screenshot"),
    k(1, "mod", "INS"),
    k(1, "mod", "DEL"),
  ],
  [
    k(1, "mod", "`", "~"),
    ...pairs("alpha", "!1 @2 #3 $4 %5 ^6 &7 *8 (9 )0 _- +="),
    k(2, "mod", "BACKSPACE"),
    k(1, "mod", "PGUP"),
  ],
  [
    k(1.5, "mod", "TAB"),
    ...run("alpha", "QWERTYUIOP"),
    ...pairs("alpha", "{[ }]"),
    k(1.5, "alpha", "\\", "|"),
    k(1, "mod", "PGDN"),
  ],
  [
    k(1.75, "mod", "CAPS"),
    ...run("alpha", "ASDFGHJKL"),
    ...pairs("alpha", ":; \"'"),
    k(2.25, "enter", "ENTER"),
    k(1, "mod", "HOME"),
  ],
  [
    k(2.25, "mod", "SHIFT"),
    ...run("alpha", "ZXCVBNM"),
    ...pairs("alpha", "<, >. ?/"),
    k(1.75, "mod", "SHIFT"),
    icon("mod", "up"),
    k(1, "mod", "END"),
  ],
  [
    k(1.25, "mod", "CTRL"),
    k(1.25, "mod", "OPT"),
    k(1.25, "mod", "CMD"),
    { units: 6.25, role: "space", legend: null },
    k(1, "mod", "CMD"),
    k(1, "mod", "FN"),
    k(1, "mod", "CTRL"),
    icon("mod", "left"),
    icon("mod", "down"),
    icon("mod", "right"),
  ],
];

/**
 * The legend atlas is the board seen from above: one cell per cap at its own
 * place, `unit` pixels per key unit, row 0 (Esc) on the image's top edge.
 */
export const LEGEND_ATLAS = {
  file: "public/world/keyboard/keyboard-legends.webp",
  url: "/world/keyboard/keyboard-legends.webp",
  unit: 128,
  width: BOARD_UNITS * 128,
  height: KEY_ROWS.length * 128,
  maxBytes: 150 * 1024,
} as const;

export interface KeyCap extends KeySpec {
  row: number;
  /** Left edge from the board's left, in units. */
  x: number;
  /** Atlas cell, texture UVs (v up, as three.js samples a flipped image). */
  cell: { u0: number; v0: number; u1: number; v1: number };
}

/** Every cap, Esc first, with its position and atlas cell. */
export function keyCaps(): KeyCap[] {
  const caps: KeyCap[] = [];
  for (const [row, keys] of KEY_ROWS.entries()) {
    let x = 0;
    for (const key of keys) {
      caps.push({
        ...key,
        row,
        x,
        cell: {
          u0: x / BOARD_UNITS,
          u1: (x + key.units) / BOARD_UNITS,
          v0: 1 - (row + 1) / KEY_ROWS.length,
          v1: 1 - row / KEY_ROWS.length,
        },
      });
      x += key.units;
    }
  }
  return caps;
}
