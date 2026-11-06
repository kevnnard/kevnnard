// Original procedural gaming setup (T4d, S8), the main room's centerpiece,
// finished in T12 (S24-S25): a copper-toned wooden desk top on a black
// frame with a cable tray, a giant black mat under a NuPhy-style wireless
// low-profile 75% keyboard and a curved mouse on the right, a curved
// ultrawide and a portrait monitor on their own clamp arms, a white light bar
// on the ultrawide, and a coffee mug on a wooden coaster to the right. A
// wall shelf above carries the speakers, two gamer lamps (lights.ts) and two
// broad-leaf plants; over-ear headphones hang under the desk's front edge, the
// glass-sided PC stands under its far end and the chair is an original
// five-star base under Bruno Simon's top chair (T4k). It backs onto the main
// room's left wall, which has no openings and faces the home camera from
// inside. Pure numbers; Setup.tsx merges the solid parts into one mesh per
// material (T4g, S11), plus glow (screens and RGB) and glass.

import { HOUSE, type Part, type Rect, type Vec3, WALLS } from "./house.ts";
import type { NormalPattern } from "./normals.ts";
import { worldLight } from "./palette.ts";
import type { Surface } from "./textures.ts";

export const SETUP_COLORS = {
  /** Copper-toned wood: desk top, shelf board and coaster (S24). */
  wood: "#b8643b",
  frame: "#2b2a30",
  tray: "#3a3940",
  cable: "#4a4852",
  bezel: "#26252b",
  /** Aluminium keyboard case. */
  case: "#aeb3bb",
  keys: "#f3eee8",
  keyAlpha: "#eceae6",
  keyMod: "#c3c8d0",
  keyEsc: "#ff6f5e",
  keyEnter: "#2fb5a6",
  keySpace: "#f2c84b",
  /** Giant black mouse pad. */
  mat: "#18171b",
  matEdge: "#2c2b31",
  mouse: "#ebe8e3",
  mouseGrip: "#9a9ca3",
  tower: "#2e2d34",
  inner: "#45434c",
  speaker: "#3a3840",
  cone: "#55535c",
  chair: "#2f2e35",
  chairWhite: "#f3eee8",
  trim: "#efe8de",
  grille: "#3a3942",
  glass: "#bcd3e6",
  screen: "#76c3f2",
  horizon: "#8fe0b8",
  sun: "#ffe1a1",
  hud: "#ffffff",
  side: "#c5b4f0",
  code: "#2a3350",
  rgb: "#b48cff",
  rgbCool: "#7fd8ff",
  rgbWarm: "#ff9ad5",
  /** White housing of the monitor light bar. */
  lightbar: "#f4f4f2",
  metal: "#8d9097",
  headphones: "#1f1e23",
  cushion: "#34333a",
  pot: "#e9e2d8",
  potWarm: "#d98e5f",
  soil: "#4a3428",
  leaf: "#4fa84a",
  leafLight: "#6cbf4f",
} as const;

const M = HOUSE.main;
const W = HOUSE.wall;

/** Inside faces of the main room's walls. */
export const MAIN_ROOM: Rect = {
  x0: M.x0 + W,
  x1: M.x1 - W,
  z0: M.z0 + W,
  z1: M.z1 - W,
};

const door = WALLS.find((wall) => wall.id === "main-front")?.openings.find(
  (opening) => opening.kind === "door",
);
if (!door) throw new Error("main-front needs a door");

/** Floor area the front door sweeps as it swings inward. */
export const DOOR_SWING: Rect = {
  x0: door.u0,
  x1: door.u1,
  z0: MAIN_ROOM.z1 - (door.u1 - door.u0),
  z1: MAIN_ROOM.z1,
};

/** Top of the floor boards. */
const Y0 = HOUSE.floorY + 0.04;
/** Desk frame: `d` meters out from the left wall (world +x), `u` along it (world z). */
const IN = MAIN_ROOM.x0;
const w = (d: number, y: number, u: number): Vec3 => [IN + d, Y0 + y, u];

const DESK = { u0: -2.3, u1: -0.3, d0: 0.03, depth: 0.72, height: 0.76 };
const CHAIR = { d: 1.12, u: -1.42, yaw: 0.22, tilt: 0.14 };

/** Desk top surface in world space (T6b). */
export const DESK_TOP = {
  x0: IN + DESK.d0,
  x1: IN + DESK.d0 + DESK.depth,
  z0: DESK.u0,
  z1: DESK.u1,
  y: Y0 + DESK.height,
} as const;

// Seated at the desk you face the left wall (-x): your right is -z.

/** The desk's middle (T14, S27): the ultrawide, keyboard and mat line up on it. */
const MID = (DESK.u0 + DESK.u1) / 2;

/** Giant black mouse pad across the desk front (S24), centred (T14). */
const MAT_D = { d: 0.5, u: MID, depth: 0.42, width: 1.45, height: 0.006 };
export const MAT = {
  center: w(MAT_D.d, DESK.height + MAT_D.height / 2, MAT_D.u),
  size: [MAT_D.depth, MAT_D.height, MAT_D.width] as Vec3,
} as const;
const MAT_TOP = DESK.height + MAT_D.height;

/** Key pitch: one unit (19.05 mm on the real board). */
const KEY_UNIT = 0.019;
type KeyRole = "alpha" | "mod" | "esc" | "enter" | "space";
const keys = (units: number, role: KeyRole, count = 1) =>
  Array.from({ length: count }, () => ({ units, role }));
/**
 * A low-profile 75% layout like the NuPhy Air75 V2: 84 keys in six rows of
 * 16 units, the last column for navigation, arrows tucked bottom right.
 */
export const KEY_ROWS: readonly (readonly {
  units: number;
  role: KeyRole;
}[])[] = [
  [...keys(1, "esc"), ...keys(1, "mod", 15)],
  [...keys(1, "alpha", 13), ...keys(2, "mod"), ...keys(1, "mod")],
  [
    ...keys(1.5, "mod"),
    ...keys(1, "alpha", 12),
    ...keys(1.5, "alpha"),
    ...keys(1, "mod"),
  ],
  [
    ...keys(1.75, "mod"),
    ...keys(1, "alpha", 11),
    ...keys(2.25, "enter"),
    ...keys(1, "mod"),
  ],
  [
    ...keys(2.25, "mod"),
    ...keys(1, "alpha", 10),
    ...keys(1.75, "mod"),
    ...keys(1, "alpha"),
    ...keys(1, "mod"),
  ],
  [
    ...keys(1.25, "mod", 3),
    ...keys(6.25, "space"),
    ...keys(1, "mod", 3),
    ...keys(1, "alpha", 3),
  ],
];
const KEY_COLORS: Record<KeyRole, string> = {
  alpha: SETUP_COLORS.keyAlpha,
  mod: SETUP_COLORS.keyMod,
  esc: SETUP_COLORS.keyEsc,
  enter: SETUP_COLORS.keyEnter,
  space: SETUP_COLORS.keySpace,
};

/** NuPhy-style wireless keyboard: aluminium case, low caps, no cable. */
export const KEYBOARD = {
  center: w(0.53, MAT_TOP + 0.0105, MID),
  /** Depth, height (case and caps), width. */
  size: [0.133, 0.021, 0.316] as Vec3,
  wireless: true,
} as const;
const CASE_H = 0.014;

/** Padding around a desk thing's click target, each side. */
const HIT_PAD = 0.01;

/** The owner's curved mouse, right of the keyboard. */
export const MOUSE = {
  center: w(0.54, MAT_TOP + 0.0175, MID - 0.53),
  size: [0.115, 0.035, 0.062] as Vec3,
} as const;

/**
 * S24 offered the owner's own mouse: public/models/room/desk.glb is one baked
 * node ("escritorio") holding one mesh of 12 material primitives (keyboard,
 * monitor, phone, wires, "demas"), with no mouse node, mesh or material to
 * lift out, so the mouse is original geometry.
 */
export const MOUSE_SOURCE = {
  reused: false,
  file: "public/models/room/desk.glb",
} as const;

/** Wooden coaster under the coffee mug, right of the mat (S25). */
export const COASTER = {
  center: w(0.59, DESK.height, -2.17),
  radius: 0.06,
  height: 0.008,
} as const;

/** The curved ultrawide's mid-panel; the light bar rides its top. */
const MAIN = { d: 0.27, y: 1.14, u: MID, height: 0.42, width: 1.15 };
const PANEL_DEPTH = 0.045;
const HUMP_DEPTH = 0.03;
const CURVE_RADIUS = 1.8;
const CURVE_HALF = Math.asin(MAIN.width / 2 / CURVE_RADIUS);
/** Centre of the monitor's arc, in front of it (world x, z). */
const ARC: readonly [number, number] = [IN + MAIN.d + CURVE_RADIUS, MAIN.u];

/**
 * A point `inset` metres in front of the ultrawide's mid-surface (negative is
 * behind it) at `theta` radians along its arc, at world height `y`. The arc
 * is concave toward the chair, so its ends come forward.
 */
export function mainCurve(theta: number, inset: number, y: number): Vec3 {
  const r = CURVE_RADIUS - inset;
  return [ARC[0] - r * Math.cos(theta), y, ARC[1] + r * Math.sin(theta)];
}

/** The curved ultrawide (S24); its backlight sits behind its middle. */
export const MAIN_MONITOR = {
  center: w(MAIN.d, MAIN.y, MAIN.u),
  /** Depth of the panel, height, chord width. */
  size: [PANEL_DEPTH, MAIN.height, MAIN.width] as Vec3,
  curve: { radius: CURVE_RADIUS, halfAngle: CURVE_HALF, segments: 12 },
  /** World x of the back of its housing (the VESA hump). */
  back: IN + MAIN.d - PANEL_DEPTH / 2 - HUMP_DEPTH,
} as const;
/** Screen surface, just proud of the bezel. */
const SCREEN_INSET = PANEL_DEPTH / 2 + 0.002;
const OVERLAY_INSET = SCREEN_INSET + 0.002;

/**
 * The portrait side monitor left of the ultrawide (S30), 5 cm past
 * its end, turned in toward the chair.
 */
const SIDE_YAW = 0.4;
const SIDE_U = MID + 0.79;
export const SIDE_MONITOR = {
  center: w(0.27, 1.12, SIDE_U),
  /** Depth, height, width: taller than wide. */
  size: [0.035, 0.54, 0.3] as Vec3,
  yaw: SIDE_YAW,
  /** Visible screen, width and height. */
  screen: [0.27, 0.5] as const,
} as const;
/** Out of the portrait screen (+x turned by its yaw) and along its width. */
const SIDE_N: Vec3 = [Math.cos(SIDE_YAW), 0, -Math.sin(SIDE_YAW)];
const SIDE_T: Vec3 = [Math.sin(SIDE_YAW), 0, Math.cos(SIDE_YAW)];
const onSide = (out: number, along: number, up: number): Vec3 => {
  const [x, y, z] = SIDE_MONITOR.center;
  return [
    x + SIDE_N[0] * out + SIDE_T[0] * along,
    y + up,
    z + SIDE_N[2] * out + SIDE_T[2] * along,
  ];
};

/**
 * Clamp arms on the desk's back edge, one per monitor, each beside its VESA
 * plate; the portrait's sits toward the desk middle, clear of the leg.
 */
export const MONITOR_ARMS = {
  main: {
    clamp: w(0.065, DESK.height, MAIN.u + 0.15),
    vesa: mainCurve(0, -(PANEL_DEPTH / 2 + HUMP_DEPTH + 0.004), Y0 + MAIN.y),
  },
  side: {
    clamp: w(0.065, DESK.height, SIDE_U - 0.07),
    vesa: onSide(-(SIDE_MONITOR.size[0] / 2 + 0.024), 0, 0),
  },
} as const;

const MAIN_TOP = MAIN.y + MAIN.height / 2;
/** White light bar on the ultrawide's top, its slit under a front shield. */
export const LIGHTBAR = {
  center: w(MAIN.d + 0.02, MAIN_TOP + 0.004 + 0.011, MAIN.u),
  size: [0.04, 0.022, 0.45] as Vec3,
  slit: {
    center: w(MAIN.d + 0.03, MAIN_TOP + 0.0025, MAIN.u),
    size: [0.008, 0.003, 0.42] as Vec3,
  },
} as const;

/** Wall shelf above the setup (S24): wooden board on metal brackets. */
const SHELF_D = { depth: 0.33, y0: 1.4625, thick: 0.035, u0: -2.25, u1: -0.35 };
const SHELF_TOP = SHELF_D.y0 + SHELF_D.thick;
export const SHELF = {
  x0: IN,
  x1: IN + SHELF_D.depth,
  z0: SHELF_D.u0,
  z1: SHELF_D.u1,
  /** Underside and top of the board, world y. */
  y0: Y0 + SHELF_D.y0,
  top: Y0 + SHELF_TOP,
  /** Where the lamps stand along the shelf (lights.ts). */
  lamps: { left: -0.8, right: -1.9 },
} as const;
const SPEAKERS = [-2.1, -0.45] as const;
const SPEAKER_Y = 0.1;
const PLANTS = [-1.65, -1.05] as const;

/** Over-ear headphones on a hanger under the desk's front edge (S24). */
const PHONES = { d: 0.63, u: -1.92, radius: 0.085, band: 0.04, peg: 0.62 };
export const HEADPHONES = {
  center: w(PHONES.d, PHONES.peg - 0.08, PHONES.u),
  /** Width of the broad, flat headband. */
  band: PHONES.band,
} as const;

/** Desk-top items S25 keeps; everything else moved to the shelf or left. */
export const TABLETOP_ITEMS = [
  "keyboard",
  "mouse",
  "mat",
  "monitor",
  "monitor-arm",
  "portrait",
  "lightbar",
  "coaster",
] as const;

const frac = (x: number) => x - Math.floor(x);
/** UV offset that centres one `tile` repeat on `at` (box UVs are metres). */
const centre = (
  tile: readonly [number, number],
  at: readonly [number, number],
) => [0.5 - frac(at[0] / tile[0]), 0.5 - frac(at[1] / tile[1])] as const;
// Fifteen cone-map repeats between the two speakers, so both cones (and their
// tweeters) sit on a ring centre. Front faces project to (z, y).
const CONE_TILE = (SPEAKERS[1] - SPEAKERS[0]) / 15;

export interface SetupMaterial {
  roughness: number;
  metalness: number;
  /** Clear lacquer layer (physical material) for the wood. */
  clearcoat?: number;
  /** StylizedTextures surface (color, normal, roughness, opacity maps). */
  surface?: Surface;
  /** Original procedural normal map (src/lib/world/normals.ts). */
  normal?: NormalPattern;
  normalScale?: number;
  /** Original wood grain colour map (normals.ts woodGrainPixels), same tile. */
  grain?: boolean;
  /** Metres covered by one repeat of the procedural map, along u and v. */
  tile?: readonly [number, number];
  offset?: readonly [number, number];
}

/** PBR per setup material: one merged draw each. */
export const SETUP_MATERIALS = {
  /**
   * Copper-toned lacquered wood (S24): grain streaks run along the boards
   * (up faces map x to u, z to v), a few per board width.
   */
  wood: {
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.25,
    normal: "grain",
    normalScale: 0.35,
    grain: true,
    tile: [0.24, 1.1],
  },
  /** Black powder-coated steel: desk frame, legs, tray, arms, brackets. */
  powder: {
    roughness: 0.45,
    metalness: 0.35,
    normal: "noise",
    normalScale: 0.12,
    tile: [0.08, 0.08],
  },
  /** Satin plastic: monitor bezels, light bar, speaker cabinets, mouse. */
  satin: {
    roughness: 0.5,
    metalness: 0,
    normal: "noise",
    normalScale: 0.05,
    tile: [0.3, 0.3],
  },
  /** Keycaps: one rounded cap per key, a fine matte texture on top. */
  keycap: {
    roughness: 0.55,
    metalness: 0,
    normal: "noise",
    normalScale: 0.08,
    tile: [0.05, 0.05],
  },
  /** Speaker cones: concentric ripples centred on each driver. */
  cone: {
    roughness: 0.7,
    metalness: 0,
    normal: "radial",
    normalScale: 0.35,
    tile: [CONE_TILE, CONE_TILE],
    offset: centre(
      [CONE_TILE, CONE_TILE],
      [SPEAKERS[0], Y0 + SHELF_TOP + SPEAKER_Y],
    ),
  },
  /** Mouse pad cloth and headphone cushions. */
  fabric: {
    roughness: 0.95,
    metalness: 0,
    normal: "weave",
    normalScale: 0.6,
    tile: [0.02, 0.02],
  },
  /** Matte plastic: chair base, casters, feet, cables, pots and leaves. */
  base: { roughness: 0.85, metalness: 0 },
  grille: { roughness: 0.5, metalness: 0.5, surface: "grille" },
  panel: { roughness: 0.55, metalness: 0.3, surface: "panel" },
  /** Chair upholstery, and its white trim (tinted vertex color). */
  leather: { roughness: 0.75, metalness: 0, surface: "leather" },
} as const satisfies Record<string, SetupMaterial>;

export type SetupMaterialId = keyof typeof SETUP_MATERIALS;

/** What a part belongs to: the T12 contracts check items, not part lists. */
export type SetupItem =
  | (typeof TABLETOP_ITEMS)[number]
  | "desk"
  | "shelf"
  | "speaker"
  | "plant"
  | "headphones"
  | "pc"
  | "chair";

export type SetupPart = Part & {
  material: SetupMaterialId;
  item?: SetupItem;
  /** Chair rig (T4i): "swivel" turns with the seat, "chair" is its fixed base. */
  rig?: "swivel" | "chair";
  /** Breathing LED phase index (T4i), glow parts only. */
  led?: number;
  /** Lit by a night light channel instead of the hour's glow (T12). */
  channel?: "setup";
  /** Angle on the ultrawide's arc, for its curved segments. */
  curve?: number;
  /** A monitor's VESA plate. */
  vesa?: boolean;
  /** Plant leaves, and which plant a part belongs to. */
  leaf?: boolean;
  group?: string;
  /** The headphone hanger (it is meant to touch the desk). */
  hanger?: boolean;
};

const part = (
  material: SetupMaterialId,
  shape: Part["shape"],
  center: Vec3,
  size: Vec3,
  color: string,
  rotation?: Vec3,
  shade = 1,
): SetupPart => ({
  material,
  shape,
  center,
  size,
  color,
  shade,
  ...(rotation && { rotation }),
});

/** Bevelled box with `radius` metre edges (T4h): softer silhouettes. */
const rounded = (
  material: SetupMaterialId,
  radius: number,
  center: Vec3,
  size: Vec3,
  color: string,
  rotation?: Vec3,
  shade = 1,
): SetupPart => ({
  ...part(material, "rounded", center, size, color, rotation, shade),
  radius,
});

/**
 * A rounded bar from `a` to `b` (its length along local x), `thick` across
 * (local y, then local z), rolled `roll` about its own length.
 */
function beam(
  material: SetupMaterialId,
  a: Vec3,
  b: Vec3,
  thick: readonly [number, number],
  color: string,
  radius = 0.004,
): SetupPart {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...d);
  // R = Ry(yaw) Rz(pitch) carries local +x onto the bar.
  const yaw = Math.atan2(-d[2], d[0]);
  const pitch = Math.asin(d[1] / length);
  return rounded(
    material,
    radius,
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    [length, thick[0], thick[1]],
    color,
    [0, yaw, pitch],
  );
}

/** Sides of the setup's cylinders: smooth knobs, casters and cones. */
export const SETUP_ROUND_SEGMENTS = 16;

/** Axis of a "round" part laid along world z. */
const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0];
/** Axis of a "round" part laid along world x. */
const ALONG_X: Vec3 = [0, 0, Math.PI / 2];

export interface SetupMeshes {
  solid: SetupPart[];
  glow: SetupPart[];
  glass: SetupPart[];
  /** Bruno's top chair as swivel boxes: tested, never drawn (T4k). */
  hull: SetupPart[];
}

/** Shade per desk board: each board a slightly different cut. */
const BOARD_SHADES = [0.94, 1.04, 0.98, 1.07, 0.92] as const;

function desk(solid: SetupPart[]) {
  const { u0, u1, d0, depth, height } = DESK;
  const C = SETUP_COLORS;
  const uc = (u0 + u1) / 2;
  const du = u1 - u0;
  const front = d0 + depth;
  const top = 0.05;
  // Copper wood top (S24): five boards along the desk with fine seams, and
  // a chunky rounded front edge.
  const boards = front - 0.025 - d0;
  const pitch = boards / BOARD_SHADES.length;
  for (const [i, shade] of BOARD_SHADES.entries())
    solid.push(
      rounded(
        "wood",
        0.004,
        w(d0 + pitch * (i + 0.5), height - top / 2, uc),
        [pitch - 0.002, top, du],
        C.wood,
        undefined,
        shade,
      ),
    );
  solid.push(
    part(
      "wood",
      "round",
      w(front - 0.025, height - top / 2, uc),
      [0.05, du, 0.05],
      C.wood,
      ALONG_Z,
      0.95,
    ),
    part(
      "powder",
      "box",
      w(front - 0.04, height - top - 0.015, uc),
      [0.04, 0.03, du - 0.1],
      C.frame,
    ),
    part(
      "powder",
      "box",
      w(0.2, height - top - 0.06, uc),
      [0.05, 0.06, du - 0.14],
      C.frame,
    ),
    // Cable tray with its lips and a bundle of cables.
    part("powder", "box", w(0.17, 0.6, uc), [0.18, 0.02, 1.4], C.tray),
    part("powder", "box", w(0.08, 0.63, uc), [0.02, 0.06, 1.4], C.tray),
    part("powder", "box", w(0.26, 0.63, uc), [0.02, 0.06, 1.4], C.tray),
    part(
      "base",
      "round",
      w(0.17, 0.625, uc),
      [0.03, 1.3, 0.03],
      C.cable,
      ALONG_Z,
    ),
  );
  for (const u of [u0 + 0.07, u1 - 0.07])
    solid.push(
      part("powder", "box", w(0.39, 0.035, u), [0.66, 0.06, 0.08], C.frame),
      part(
        "powder",
        "box",
        w(0.39, (0.06 + height - top) / 2, u),
        [0.08, height - top - 0.06, 0.08],
        C.frame,
      ),
      part(
        "powder",
        "box",
        w(0.39, height - top - 0.02, u),
        [0.62, 0.04, 0.06],
        C.frame,
      ),
      part(
        "base",
        "round",
        w(0.1, 0.012, u),
        [0.08, 0.024, 0.08],
        C.frame,
        undefined,
        0.85,
      ),
      part(
        "base",
        "round",
        w(0.68, 0.012, u),
        [0.08, 0.024, 0.08],
        C.frame,
        undefined,
        0.85,
      ),
    );
}

/** One curved segment of the ultrawide, `inset` in front of its mid-surface. */
function arcPart(
  material: SetupMaterialId,
  theta: number,
  inset: number,
  y: number,
  size: Vec3,
  color: string,
  radius = 0,
): SetupPart {
  const center = mainCurve(theta, inset, Y0 + y);
  const rotation: Vec3 = [0, theta, 0];
  return {
    ...(radius > 0
      ? rounded(material, radius, center, size, color, rotation)
      : part(material, "box", center, size, color, rotation)),
    curve: theta,
  };
}

/**
 * Curved ultrawide (S24): twelve bezel segments on one 1.8 m arc, rounded so
 * the overlapping joins hide and the corners stay soft, a screen of the same
 * segments just in front, a VESA hump behind its middle. No desk stand: it
 * hangs from its clamp arm.
 */
function mainMonitor(solid: SetupPart[], glow: SetupPart[]) {
  const C = SETUP_COLORS;
  const { segments } = MAIN_MONITOR.curve;
  const step = (2 * CURVE_HALF) / segments;
  const chord = 2 * CURVE_RADIUS * Math.sin(step / 2);
  const angle = (i: number) => -CURVE_HALF + (i + 0.5) * step;
  for (let i = 0; i < segments; i++)
    solid.push(
      arcPart(
        "satin",
        angle(i),
        0,
        MAIN.y,
        [PANEL_DEPTH, MAIN.height, chord + 0.02],
        C.bezel,
        0.01,
      ),
    );
  // The screen: sky over a horizon band, a sun and a HUD bar.
  const screenHalf = Math.asin((MAIN.width / 2 - 0.02) / CURVE_RADIUS);
  const glowStep = (2 * screenHalf) / segments;
  const glowChord = 2 * CURVE_RADIUS * Math.sin(glowStep / 2) + 0.002;
  const screenH = MAIN.height - 0.04;
  for (let i = 0; i < segments; i++) {
    const theta = -screenHalf + (i + 0.5) * glowStep;
    glow.push(
      arcPart(
        "satin",
        theta,
        SCREEN_INSET,
        MAIN.y,
        [0.004, screenH, glowChord],
        C.screen,
      ),
      arcPart(
        "satin",
        theta,
        OVERLAY_INSET,
        MAIN.y - 0.08,
        [0.002, 0.1, glowChord],
        C.horizon,
      ),
    );
  }
  const sun = -screenHalf + 3.5 * glowStep;
  const hud = -screenHalf + 9 * glowStep;
  glow.push(
    arcPart(
      "satin",
      sun,
      OVERLAY_INSET,
      MAIN.y + 0.08,
      [0.002, 0.07, 0.07],
      C.sun,
    ),
    {
      ...arcPart(
        "satin",
        hud,
        OVERLAY_INSET,
        MAIN.y + 0.15,
        [0.002, 0.022, 0.25],
        C.hud,
      ),
      shade: 0.95,
    },
  );
  // VESA hump behind the middle.
  solid.push(
    arcPart(
      "satin",
      0,
      -(PANEL_DEPTH / 2 + HUMP_DEPTH / 2),
      MAIN.y - 0.02,
      [HUMP_DEPTH, 0.3, 0.5],
      C.bezel,
      0.02,
    ),
  );
}

/** Portrait side monitor (S24): one tall panel with a code editor. */
function sideMonitor(solid: SetupPart[], glow: SetupPart[]) {
  const C = SETUP_COLORS;
  const rot: Vec3 = [0, SIDE_YAW, 0];
  const [depth, height, width] = SIDE_MONITOR.size;
  const [sw, sh] = SIDE_MONITOR.screen;
  solid.push(
    rounded(
      "satin",
      0.012,
      SIDE_MONITOR.center,
      [depth, height, width],
      C.bezel,
      rot,
    ),
    rounded(
      "satin",
      0.012,
      onSide(-(depth / 2 + 0.01), 0, -0.02),
      [0.02, 0.22, 0.16],
      C.bezel,
      rot,
      0.9,
    ),
  );
  glow.push(
    part(
      "satin",
      "box",
      onSide(depth / 2 + 0.002, 0, 0),
      [0.004, sh, sw],
      C.side,
      rot,
    ),
  );
  // Code lines, left aligned, in two indented blocks.
  const lines = [0.16, 0.12, 0.18, 0.08, 0.14, 0.1, 0.17, 0.06, 0.12, 0.15];
  for (const [i, length] of lines.entries()) {
    const indent = i % 4 === 0 ? 0 : 0.02;
    const along = sw / 2 - 0.02 - indent - length / 2;
    glow.push(
      part(
        "satin",
        "box",
        onSide(depth / 2 + 0.005, along, sh / 2 - 0.05 - i * 0.04),
        [0.002, 0.012, length],
        i % 3 === 0 ? C.hud : C.code,
        rot,
        0.92,
      ),
    );
  }
}

/** A clamp on the desk's back edge with a pole, two arm links and a VESA plate. */
function clampArm(
  solid: SetupPart[],
  clamp: Vec3,
  poleTop: number,
  vesa: Vec3,
  out: Vec3,
  yaw: number,
) {
  const C = SETUP_COLORS;
  const [x, y, z] = clamp;
  const below = y - 0.05;
  solid.push(
    // C-clamp: top plate, back bar behind the edge, bottom plate and screw.
    rounded("powder", 0.004, [x, y + 0.006, z], [0.07, 0.012, 0.06], C.frame),
    rounded(
      "powder",
      0.004,
      [IN + 0.022, y - 0.025, z],
      [0.016, 0.074, 0.06],
      C.frame,
    ),
    rounded(
      "powder",
      0.004,
      [x, below - 0.006, z],
      [0.07, 0.012, 0.06],
      C.frame,
    ),
    part("powder", "round", [x, below - 0.022, z], [0.02, 0.02, 0.02], C.metal),
    // Pole with a collar, then the arm to a tilt joint behind the plate.
    part(
      "powder",
      "round",
      [x, (y + 0.012 + poleTop) / 2, z],
      [0.03, poleTop - y - 0.012, 0.03],
      C.frame,
    ),
    part(
      "powder",
      "round",
      [x, poleTop + 0.012, z],
      [0.038, 0.024, 0.038],
      C.metal,
    ),
  );
  const joint: Vec3 = [
    vesa[0] - out[0] * 0.02,
    vesa[1],
    vesa[2] - out[2] * 0.02,
  ];
  const elbow: Vec3 = [
    (x + joint[0]) / 2 - 0.02,
    poleTop + 0.05,
    (z + joint[2]) / 2,
  ];
  solid.push(
    beam("powder", [x, poleTop + 0.02, z], elbow, [0.022, 0.03], C.frame),
    part("powder", "round", elbow, [0.032, 0.03, 0.032], C.metal),
    beam("powder", elbow, joint, [0.02, 0.028], C.frame),
    part("powder", "round", joint, [0.03, 0.04, 0.03], C.metal, ALONG_Z),
    {
      ...rounded("powder", 0.004, vesa, [0.008, 0.1, 0.1], C.frame, [
        0,
        yaw,
        0,
      ]),
      vesa: true,
    },
  );
}

/**
 * White light bar (S24): a rounded housing across the ultrawide's top with
 * its emitting slit underneath, behind a front shield so it lights the desk
 * and never the eyes; a saddle on the bezel and a counterweight behind.
 * NightLights.tsx draws the slit and its spot.
 */
function lightbar(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const [x, y, z] = LIGHTBAR.center;
  const [depth, height, width] = LIGHTBAR.size;
  const top = Y0 + MAIN_TOP;
  const back = IN + MAIN.d - PANEL_DEPTH / 2;
  solid.push(
    rounded("satin", 0.009, LIGHTBAR.center, LIGHTBAR.size, C.lightbar),
    rounded(
      "satin",
      0.002,
      [x + depth / 2 - 0.002, y - height / 2 - 0.004, z],
      [0.004, 0.008, width - 0.02],
      C.lightbar,
      undefined,
      0.96,
    ),
    rounded(
      "satin",
      0.002,
      [IN + MAIN.d - 0.005, top + 0.002, z],
      [0.05, 0.004, 0.06],
      C.bezel,
    ),
    rounded(
      "satin",
      0.003,
      [back - 0.004, top - 0.008, z],
      [0.008, 0.02, 0.05],
      C.lightbar,
      undefined,
      0.94,
    ),
    rounded(
      "satin",
      0.004,
      [back - 0.014, top - 0.012, z],
      [0.018, 0.025, 0.07],
      C.lightbar,
    ),
  );
  for (const side of [-1, 1])
    solid.push(
      rounded(
        "satin",
        0.004,
        [x, y, z + side * (width / 2 - 0.004)],
        [depth + 0.002, height + 0.002, 0.008],
        C.bezel,
      ),
    );
}

/**
 * NuPhy-style wireless low-profile 75% keyboard (S24): a rounded aluminium
 * case, 84 individual low caps colour-blocked with coral Esc, teal Enter and
 * a yellow space bar, two slender side light bars and no cable.
 */
function keyboard(solid: SetupPart[], glow: SetupPart[]) {
  const C = SETUP_COLORS;
  const [cx, cy, cz] = KEYBOARD.center;
  const [depth, , width] = KEYBOARD.size;
  const base = cy - KEYBOARD.size[1] / 2;
  solid.push(
    rounded(
      "powder",
      0.005,
      [cx, base + CASE_H / 2, cz],
      [depth, CASE_H, width],
      C.case,
    ),
    rounded(
      "powder",
      0.002,
      [cx, base + CASE_H - 0.0005, cz],
      [depth - 0.012, 0.002, width - 0.012],
      C.frame,
      undefined,
      0.9,
    ),
  );
  const capH = KEYBOARD.size[1] - CASE_H;
  const left = cz + (16 * KEY_UNIT) / 2;
  const back = cx - (KEY_ROWS.length * KEY_UNIT) / 2;
  for (const [r, row] of KEY_ROWS.entries()) {
    let units = 0;
    for (const key of row) {
      const z = left - (units + key.units / 2) * KEY_UNIT;
      units += key.units;
      solid.push({
        ...rounded(
          "keycap",
          0.0025,
          [back + (r + 0.5) * KEY_UNIT, base + CASE_H + capH / 2, z],
          [KEY_UNIT - 0.0025, capH, key.units * KEY_UNIT - 0.0025],
          KEY_COLORS[key.role],
        ),
        segments: 1,
      });
    }
  }
  for (const side of [-1, 1])
    glow.push({
      ...part(
        "satin",
        "box",
        [cx, base + CASE_H / 2, cz + side * (width / 2 + 0.0015)],
        [depth - 0.04, 0.004, 0.003],
        "#ffffff",
      ),
      channel: "setup",
    });
}

/** Height of the mouse shell's top, from -0.5 to 0.5 across its length. */
function mouseProfile(): [number, number][] {
  // Two quarter ellipses meeting at the hump, set back toward the palm.
  const hump = 0.08;
  const points: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
  ];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    const reach = a < Math.PI / 2 ? 0.5 - hump : 0.5 + hump;
    points.push([hump + reach * Math.cos(a), -0.35 + 0.85 * Math.sin(a)]);
  }
  return points;
}

/** Shell top above the mouse's centre at local x (metres), front half. */
function mouseTop(x: number): number {
  const [len, height] = [MOUSE.size[0], MOUSE.size[1]];
  const cos = Math.max(-1, Math.min(1, (x / len - 0.08) / 0.58));
  return (-0.35 + 0.85 * Math.sqrt(1 - cos * cos)) * height;
}

/**
 * The owner's curved mouse (S24), original: a sculpted shell higher toward
 * the palm, two buttons split by a groove, a scroll wheel and side grips.
 */
function mouse(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const [cx, cy, cz] = MOUSE.center;
  const [, height, width] = MOUSE.size;
  solid.push({
    ...part("satin", "prism", MOUSE.center, MOUSE.size, C.mouse),
    profile: mouseProfile(),
  });
  const bx = -0.016;
  const slope = Math.atan2(mouseTop(0) - mouseTop(-0.03), 0.03);
  for (const side of [-1, 1])
    solid.push(
      rounded(
        "satin",
        0.0015,
        [cx + bx, cy + mouseTop(bx) + 0.0012, cz + side * 0.0165],
        [0.036, 0.003, 0.027],
        C.mouse,
        [0, 0, slope],
        1.04,
      ),
      rounded(
        "satin",
        0.002,
        [cx + 0.01, cy - height / 2 + 0.013, cz + side * (width / 2 + 0.0012)],
        [0.06, 0.016, 0.003],
        C.mouseGrip,
      ),
    );
  solid.push(
    part(
      "base",
      "box",
      [cx + bx, cy + mouseTop(bx), cz],
      [0.036, 0.003, 0.006],
      C.frame,
    ),
    part(
      "base",
      "round",
      [cx - 0.011, cy + mouseTop(-0.011) + 0.001, cz],
      [0.015, 0.006, 0.015],
      C.frame,
      ALONG_Z,
    ),
  );
}

/** The giant black mouse pad with a stitched edge (S24). */
function mat(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const [x, y, z] = MAT.center;
  const [depth, height, width] = MAT.size;
  solid.push(
    rounded("fabric", 0.003, MAT.center, MAT.size, C.mat),
    rounded(
      "fabric",
      0.001,
      [x, y + height / 2 - 0.0005, z],
      [depth - 0.012, 0.001, width - 0.012],
      C.matEdge,
      undefined,
      0.7,
    ),
  );
}

/** Wooden coaster under the mug (S25): a disc with a turned rim. */
function coaster(solid: SetupPart[]) {
  const [x, y, z] = COASTER.center;
  const d = 2 * COASTER.radius;
  solid.push(
    part(
      "wood",
      "round",
      [x, y + COASTER.height / 2 - 0.001, z],
      [d, COASTER.height - 0.002, d],
      SETUP_COLORS.wood,
      undefined,
      1.06,
    ),
    part(
      "wood",
      "round",
      [x, y + COASTER.height - 0.001, z],
      [d - 0.008, 0.002, d - 0.008],
      SETUP_COLORS.wood,
      undefined,
      0.9,
    ),
  );
}

/** Wall shelf (S24): a wooden board on three metal brackets screwed to the wall. */
function shelf(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const { depth, y0, thick, u0, u1 } = SHELF_D;
  solid.push(
    rounded(
      "wood",
      0.006,
      w(depth / 2, y0 + thick / 2, (u0 + u1) / 2),
      [depth, thick, u1 - u0],
      C.wood,
      undefined,
      1.02,
    ),
  );
  for (const u of [-2.05, -1.3, -0.55])
    solid.push(
      rounded(
        "powder",
        0.002,
        w(0.003, y0 - 0.07, u),
        [0.006, 0.14, 0.03],
        C.frame,
      ),
      rounded(
        "powder",
        0.002,
        w(0.131, y0 - 0.006, u),
        [0.25, 0.012, 0.03],
        C.frame,
      ),
      beam(
        "powder",
        w(0.006, y0 - 0.125, u),
        w(0.17, y0 - 0.012, u),
        [0.01, 0.022],
        C.frame,
        0.002,
      ),
    );
}

/** Speakers on the shelf's ends: woofer, tweeter, white rings and a mesh grille. */
function speakers(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const top = SHELF_TOP;
  for (const u of SPEAKERS)
    solid.push(
      rounded(
        "satin",
        0.004,
        w(0.2, top + 0.005, u),
        [0.18, 0.01, 0.14],
        C.frame,
      ),
      rounded(
        "satin",
        0.02,
        w(0.2, top + 0.15, u),
        [0.2, 0.28, 0.16],
        C.speaker,
      ),
      part(
        "satin",
        "round",
        w(0.301, top + SPEAKER_Y, u),
        [0.13, 0.008, 0.13],
        C.chairWhite,
        ALONG_X,
      ),
      part(
        "cone",
        "round",
        w(0.304, top + SPEAKER_Y, u),
        [0.11, 0.012, 0.11],
        C.cone,
        ALONG_X,
      ),
      part(
        "cone",
        "round",
        w(0.31, top + SPEAKER_Y, u),
        [0.04, 0.012, 0.04],
        C.cone,
        ALONG_X,
        1.25,
      ),
      part(
        "satin",
        "round",
        w(0.303, top + 0.225, u),
        [0.05, 0.01, 0.05],
        C.chairWhite,
        ALONG_X,
      ),
      part(
        "grille",
        "box",
        w(0.32, top + 0.15, u),
        [0.004, 0.26, 0.15],
        C.grille,
      ),
    );
}

/**
 * Broad leaves per shelf plant (S28): yaw (0 faces the room, pi/2 is -z),
 * height up the stem (0..1), upward tilt and length; blades are elliptical
 * discs about 0.7 times as wide as long. The lamps stand beside the pots, so
 * the outer leaves fan toward the wall, the room and the other plant.
 */
const PLANT_LEAVES = [
  [
    [0.35, 0, 0.3, 0.13],
    [2.5, 0.25, 0.45, 0.15],
    [-1.35, 0.5, 0.5, 0.17],
    [1.0, 0.75, 0.7, 0.14],
    [-2.6, 1, 1.0, 0.12],
  ],
  [
    [-0.4, 0, 0.3, 0.12],
    [1.45, 0.3, 0.45, 0.15],
    [-2.7, 0.6, 0.55, 0.14],
    [0.6, 1, 0.9, 0.11],
    [-1.3, 0.8, 0.75, 0.1],
  ],
] as const;
/** Stem top above the shelf, taller for the plant left of the screens. */
const PLANT_STEM = [0.21, 0.16] as const;

/**
 * Two potted plants on the shelf (S24), grown in S28 into broad-leaf plants
 * like a young monstera: a stem out of the soil carrying five leaves of
 * different sizes, the lowest flat and the top one nearly upright.
 */
function plants(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const top = SHELF_TOP;
  for (const [k, u] of PLANTS.entries()) {
    const group = `plant-${k}`;
    const at = (y: number, dx = 0, dz = 0) => w(0.17 + dx, top + y, u + dz);
    const pot = k === 0 ? C.potWarm : C.pot;
    const soil = 0.083;
    const stem = [at(soil), at(PLANT_STEM[k], 0.01, 0.005)] as const;
    const parts: SetupPart[] = [
      part("base", "round", at(0.0375), [0.09, 0.075, 0.09], pot),
      part("base", "round", at(0.078), [0.1, 0.012, 0.1], pot, undefined, 1.05),
      part("base", "round", at(soil), [0.084, 0.004, 0.084], C.soil),
      beam("base", stem[0], stem[1], [0.008, 0.008], C.leaf, 0.003),
    ];
    for (const [i, [yaw, t, pitch, length]] of PLANT_LEAVES[k].entries()) {
      const base = stem[0].map((v, a) => v + (stem[1][a] - v) * t);
      // The blade starts just inside the stem, so every leaf is attached.
      const r = length / 2 - 0.004;
      const center: Vec3 = [
        base[0] + Math.cos(yaw) * Math.cos(pitch) * r,
        base[1] + Math.sin(pitch) * r,
        base[2] - Math.sin(yaw) * Math.cos(pitch) * r,
      ];
      parts.push({
        ...part(
          "base",
          "round",
          center,
          [length, 0.005, length * 0.7],
          i % 2 === 0 ? C.leaf : C.leafLight,
          [0, yaw, pitch],
          1 - 0.04 * (i % 3),
        ),
        leaf: true,
      });
    }
    for (const p of parts) p.group = group;
    solid.push(...parts);
  }
}

/**
 * Black over-ear headphones (S24) on a hanger under the desk's front edge,
 * right of the knees and clear of the PC: a broad flat headband arch over
 * the peg, sliders, yokes, cups and cushions.
 */
function headphones(solid: SetupPart[]) {
  const C = SETUP_COLORS;
  const { d, u, radius, band, peg } = PHONES;
  const under = DESK.height - 0.05;
  const hanger: SetupPart[] = [
    rounded(
      "powder",
      0.002,
      w(d - 0.02, under - 0.005, u),
      [0.1, 0.01, 0.04],
      C.frame,
    ),
    part(
      "powder",
      "round",
      w(d - 0.06, (under - 0.01 + peg) / 2, u),
      [0.012, under - 0.01 - peg, 0.012],
      C.frame,
    ),
    beam(
      "powder",
      w(d - 0.066, peg, u),
      w(d + 0.04, peg, u),
      [0.012, 0.012],
      C.frame,
      0.005,
    ),
  ];
  for (const p of hanger) p.hanger = true;
  solid.push(...hanger);
  // The band's inner top rests on the peg.
  const cy = peg + 0.006 + 0.006 - radius;
  const arch = (a: number): Vec3 =>
    w(d, cy + radius * Math.cos(a), u + radius * Math.sin(a));
  const steps = 6;
  const spread = 1.4;
  for (let i = 0; i < steps; i++) {
    const a0 = -spread + (i * 2 * spread) / steps;
    const a1 = a0 + (2 * spread) / steps;
    solid.push(
      beam(
        "satin",
        arch(a0 - 0.04),
        arch(a1 + 0.04),
        [0.012, band],
        C.headphones,
        0.005,
      ),
    );
  }
  for (const side of [-1, 1]) {
    const end = arch(side * spread);
    const z = u + side * (radius * Math.sin(spread));
    solid.push(
      rounded(
        "powder",
        0.002,
        [end[0], end[1] - 0.025, z],
        [0.01, 0.045, 0.008],
        C.metal,
      ),
      rounded(
        "satin",
        0.003,
        [end[0], end[1] - 0.052, z],
        [0.07, 0.01, 0.012],
        C.headphones,
      ),
      part(
        "satin",
        "round",
        [end[0], end[1] - 0.105, z - side * 0.006],
        [0.088, 0.03, 0.098],
        C.headphones,
        ALONG_Z,
      ),
      part(
        "fabric",
        "round",
        [end[0], end[1] - 0.105, z - side * 0.028],
        [0.078, 0.018, 0.088],
        C.cushion,
        ALONG_Z,
      ),
    );
  }
}

function tower(solid: SetupPart[], glow: SetupPart[], glass: SetupPart[]) {
  const C = SETUP_COLORS;
  // On the floor under the desk's far end; the glass side faces +z.
  const u = -2.07;
  const face = u + 0.1;
  solid.push(
    rounded("panel", 0.02, w(0.33, 0.27, u), [0.44, 0.48, 0.2], C.tower),
    part("satin", "box", w(0.33, 0.3, face + 0.01), [0.3, 0.06, 0.02], C.inner),
    part(
      "satin",
      "round",
      w(0.4, 0.4, face + 0.008),
      [0.1, 0.016, 0.1],
      C.cone,
      ALONG_Z,
    ),
    part(
      "panel",
      "box",
      w(0.33, 0.502, face + 0.01),
      [0.44, 0.02, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
    part(
      "panel",
      "box",
      w(0.33, 0.04, face + 0.01),
      [0.44, 0.02, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
    part(
      "panel",
      "box",
      w(0.12, 0.27, face + 0.01),
      [0.02, 0.48, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
    part(
      "panel",
      "box",
      w(0.54, 0.27, face + 0.01),
      [0.02, 0.48, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
  );
  for (const d of [0.14, 0.52])
    for (const z of [u - 0.07, u + 0.07])
      solid.push(
        part("base", "round", w(d, 0.0125, z), [0.04, 0.025, 0.04], C.frame),
      );
  glow.push(
    {
      ...part("satin", "box", w(0.553, 0.27, u), [0.006, 0.36, 0.025], C.rgb),
      led: 1,
    },
    {
      ...part(
        "satin",
        "box",
        w(0.33, 0.475, face + 0.004),
        [0.36, 0.012, 0.008],
        C.rgbCool,
      ),
      led: 2,
    },
    {
      ...part(
        "satin",
        "round",
        w(0.48, 0.2, face + 0.004),
        [0.08, 0.006, 0.08],
        C.rgbWarm,
        ALONG_Z,
      ),
      led: 3,
    },
  );
  glass.push(
    part(
      "satin",
      "box",
      w(0.33, 0.27, face + 0.022),
      [0.4, 0.44, 0.004],
      C.glass,
    ),
  );
}

/** Chair frame: `lx` metres behind the seat (away from the desk), `ly` up, `lz` across. */
function chairFrame(lx: number, ly: number, lz: number): Vec3 {
  const [px, , pz] = w(CHAIR.d, 0, CHAIR.u);
  const [cos, sin] = [Math.cos(CHAIR.yaw), Math.sin(CHAIR.yaw)];
  return [px + lx * cos + lz * sin, Y0 + ly, pz - lx * sin + lz * cos];
}

/** Top of the gas column, where Bruno's seat mechanism sits. */
const COLUMN_TOP = 0.31;

/** Original five-star base and gas column: they stay while the seat swivels. */
function chair(solid: SetupPart[]) {
  const first = solid.length;
  const C = SETUP_COLORS;
  const [px, , pz] = w(CHAIR.d, 0, CHAIR.u);
  for (let k = 0; k < 5; k++) {
    const a = CHAIR.yaw + (k * 2 * Math.PI) / 5;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    solid.push(
      part(
        "base",
        "box",
        [px + 0.15 * dx, Y0 + 0.07, pz + 0.15 * dz],
        [0.3, 0.05, 0.06],
        C.chair,
        [0, -a, 0],
      ),
      part(
        "base",
        "round",
        [px + 0.29 * dx, Y0 + 0.03, pz + 0.29 * dz],
        [0.06, 0.04, 0.06],
        C.frame,
        ALONG_Z,
        0.8,
      ),
    );
  }
  solid.push(
    part("base", "round", chairFrame(0, 0.08, 0), [0.12, 0.06, 0.12], C.chair),
    part(
      "powder",
      "round",
      chairFrame(0, (0.11 + COLUMN_TOP) / 2, 0),
      [0.05, COLUMN_TOP - 0.11, 0.05],
      C.cone,
    ),
    part("base", "round", chairFrame(0, 0.16, 0), [0.07, 0.1, 0.07], C.chair),
  );
  for (const item of solid.slice(first)) item.rig = "chair";
}

/** Bruno Simon's room units to metres (T4k): his top chair fits our seat. */
export const BRUNO_SCALE = 0.3;

// Slabs [x0, x1, y0, y1, z0, z1] around his chair pivot, in his units,
// measured by scripts/prepare-world.py from the shipped model (credits.json).
const CHAIR_HULL = [
  [-0.767, 0.693, -0.343, 0.028, -0.871, 0.871],
  [-0.767, 0.75, 0.027, 0.399, -0.888, 0.888],
  [-0.797, 0.757, 0.398, 0.769, -0.985, 0.985],
  [0.112, 0.757, 0.768, 1.14, -0.692, 0.692],
  [0.283, 0.757, 1.139, 1.51, -0.803, 0.803],
  [0.223, 0.757, 1.509, 1.881, -0.866, 0.866],
  [0.224, 0.753, 1.88, 2.251, -0.865, 0.865],
  [0.399, 0.694, 2.25, 2.622, -0.513, 0.513],
];

/**
 * Bruno's top chair (topChairModel.glb, T4k): seat, back, armrests and
 * headrest. His seat faces his -x like ours, so it only takes our chair's yaw;
 * his pivot sits on our column, its mechanism just over the column's top.
 */
export const BRUNO_CHAIR = {
  hull: CHAIR_HULL,
  yaw: CHAIR.yaw,
  /** World height of his pivot. */
  y: Y0 + COLUMN_TOP - 0.01 - CHAIR_HULL[0][2] * BRUNO_SCALE,
} as const;

/** The chair's collision hull as swivel boxes, for the sway sweep and bounds. */
function chairHull(): SetupPart[] {
  const s = BRUNO_SCALE;
  const lift = BRUNO_CHAIR.y - Y0;
  return CHAIR_HULL.map(([x0, x1, y0, y1, z0, z1]) => ({
    ...part(
      "powder",
      "box",
      chairFrame(
        ((x0 + x1) / 2) * s,
        lift + ((y0 + y1) / 2) * s,
        ((z0 + z1) / 2) * s,
      ),
      [(x1 - x0) * s, (y1 - y0) * s, (z1 - z0) * s],
      SETUP_COLORS.chair,
      [0, CHAIR.yaw, 0],
    ),
    rig: "swivel" as const,
  }));
}

/**
 * One of Bruno's overlay models moved from his room onto an original body:
 * his node at `from` (his world coordinates) lands on `to`, turned `yaw`
 * around +y and scaled by BRUNO_SCALE, his own orientation kept. T12 (S25)
 * took his Elgato, Google Home and Loupedeck overlays off the desk; the type
 * stays for BrunoProps.tsx.
 */
export interface BrunoOverlay {
  from: Vec3;
  to: Vec3;
  yaw: number;
}

/** Column axis the seat swivels around (world x, z). */
export const CHAIR_PIVOT = [IN + CHAIR.d, CHAIR.u] as const;

/** A swivel part turned `angle` radians around the chair's column (+y, as Object3D.rotation.y). */
export function swivelPart(p: SetupPart, angle: number): SetupPart {
  const [a, b, c] = p.rotation ?? [0, 0, 0];
  if (a !== 0) throw new Error("swivel parts must not roll about x");
  const [px, pz] = CHAIR_PIVOT;
  const [x, y, z] = p.center;
  const [dx, dz] = [x - px, z - pz];
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return {
    ...p,
    center: [px + dx * cos + dz * sin, y, pz - dx * sin + dz * cos],
    // R = Ry(b) Rz(c) when a = 0, so a world turn adds to b.
    rotation: [0, b + angle, c],
  };
}

/** Desk props placed at runtime (T4i): the mug and the side screen's face. */
export const SETUP_PROPS = {
  /** Base centre on the wooden coaster, right of the mouse (S25). */
  mug: {
    center: [
      COASTER.center[0],
      COASTER.center[1] + COASTER.height,
      COASTER.center[2],
    ] as Vec3,
    radius: 0.045,
    height: 0.1,
  },
  /** Just in front of the portrait screen, facing out along its normal. */
  sideScreen: {
    center: onSide(SIDE_MONITOR.size[0] / 2 + 0.008, 0, 0),
    yaw: SIDE_YAW,
    screen: SIDE_MONITOR.screen,
    /**
     * Bruno's bounce travels wider than tall (motion.ts BOUNCE); on the
     * portrait screen its x runs up the screen and its y across, scaled down.
     */
    logo: { scale: 0.85, swap: true },
  },
} as const;

/**
 * Click targets around the desk things the camera inspects (keyboard-card
 * T1): just the board plus a centimetre, clear of the mouse, the mug and the
 * ultrawide above, so their own clicks still land.
 */
export const DESK_HITBOXES = {
  keyboard: {
    center: KEYBOARD.center,
    size: KEYBOARD.size.map((v) => v + 2 * HIT_PAD) as Vec3,
  },
} as const;

/** Every setup part, by material, each tagged with its item. */
export function setupMeshes(): SetupMeshes {
  const meshes: SetupMeshes = {
    solid: [],
    glow: [],
    glass: [],
    hull: chairHull(),
  };
  const { solid, glow, glass } = meshes;
  const add = (item: SetupItem, build: () => void) => {
    const from = [solid.length, glow.length, glass.length];
    build();
    for (const [i, list] of [solid, glow, glass].entries())
      for (const p of list.slice(from[i])) p.item = item;
  };
  add("desk", () => desk(solid));
  add("mat", () => mat(solid));
  add("keyboard", () => keyboard(solid, glow));
  add("mouse", () => mouse(solid));
  add("coaster", () => coaster(solid));
  add("monitor", () => mainMonitor(solid, glow));
  add("portrait", () => sideMonitor(solid, glow));
  add("monitor-arm", () => {
    const { main, side } = MONITOR_ARMS;
    clampArm(solid, main.clamp, Y0 + 1.03, main.vesa, [1, 0, 0], 0);
    clampArm(solid, side.clamp, Y0 + 1.0, side.vesa, SIDE_N, SIDE_YAW);
  });
  add("lightbar", () => lightbar(solid));
  add("shelf", () => shelf(solid));
  add("speaker", () => speakers(solid));
  add("plant", () => plants(solid));
  add("headphones", () => headphones(solid));
  add("pc", () => tower(solid, glow, glass));
  add("chair", () => chair(solid));
  for (const p of meshes.hull) p.item = "chair";
  // Parts thinner than 2 cm get a single chamfer step: the bevel reads the
  // same at that size for about a third of the triangles.
  for (const p of [...solid, ...glow])
    if (
      p.shape === "rounded" &&
      p.segments === undefined &&
      Math.min(...p.size) < 0.02
    )
      p.segments = 1;
  return meshes;
}

/** Axis-aligned bounds of a part, rotation included (Euler XYZ). */
export function partBounds(p: Part) {
  const [a, b, c] = p.rotation ?? [0, 0, 0];
  const [ca, sa, cb, sb, cc, sc] = [
    Math.cos(a),
    Math.sin(a),
    Math.cos(b),
    Math.sin(b),
    Math.cos(c),
    Math.sin(c),
  ];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const i of [-0.5, 0.5])
    for (const j of [-0.5, 0.5])
      for (const k of [-0.5, 0.5]) {
        // R = Rx(a) Ry(b) Rz(c): Rz first.
        let [x, y, z] = [i * p.size[0], j * p.size[1], k * p.size[2]];
        [x, y] = [x * cc - y * sc, x * sc + y * cc];
        [x, z] = [x * cb + z * sb, -x * sb + z * cb];
        [y, z] = [y * ca - z * sa, y * sa + z * ca];
        for (const [axis, value] of [x, y, z].entries()) {
          lo[axis] = Math.min(lo[axis], p.center[axis] + value);
          hi[axis] = Math.max(hi[axis], p.center[axis] + value);
        }
      }
  return { x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1], z0: lo[2], z1: hi[2] };
}

const solidParts = setupMeshes();
const chairBack = Math.max(
  ...[
    ...solidParts.solid,
    ...solidParts.glow,
    ...solidParts.glass,
    ...solidParts.hull,
  ].map((p) => partBounds(p).x1),
);

export const SETUP = {
  /** The wall the desk backs onto: no openings, never faded from home. */
  wall: "main-left",
  /** Screens look into the room, along +x. */
  facing: [1, 0, 0] as Vec3,
  chair: w(CHAIR.d, 0, CHAIR.u),
  /** Free floor kept behind the chair to roll it further out. */
  pullOut: 0.6,
  /** Farthest reach into the room: the chair's back and base. */
  chairBack,
  /** One mesh per solid material, plus glow and glass. */
  draws: new Set(solidParts.solid.map((p) => p.material)).size + 2,
} as const;

/** Desk, chair and pull-out room: kept clear of the door and the walkway. */
export const SETUP_ZONE: Rect = {
  x0: MAIN_ROOM.x0,
  x1: chairBack + SETUP.pullOut,
  z0: DESK.u0,
  z1: DESK.u1,
};

/**
 * Baked ambient occlusion per setup vertex (T4h): a 0.5..1 factor that
 * darkens surfaces near the floor, faces turned down and the knee space
 * under the desk top, so the setup sits on the floor instead of floating.
 */
export function setupOcclusion(
  [x, y, z]: readonly [number, number, number],
  [, ny]: readonly [number, number, number],
): number {
  const h = Math.max(0, y - Y0);
  let ao = h >= 0.5 ? 1 : 1 - 0.35 * (1 - h / 0.5) ** 2;
  if (ny < -0.5) ao *= 0.8;
  const underDesk =
    x < IN + DESK.d0 + DESK.depth &&
    z > DESK.u0 &&
    z < DESK.u1 &&
    y < Y0 + DESK.height - 0.05;
  if (underDesk) ao *= 0.85;
  return Math.max(ao, 0.5);
}

/**
 * Bruno's shipped models and maps (T4k), credited in public/world/credits.json.
 * Since T12 (S25) only the chair and its maps render: the Elgato, Google
 * Home and Loupedeck overlays and the LED mask still ship, credited, but
 * nothing loads them.
 */
export const BRUNO_FILES = {
  chair: "/world/models/bruno-chair.glb",
  elgato: "/world/models/bruno-elgato-light.glb",
  googleHome: "/world/models/bruno-google-home-leds.glb",
  loupedeck: "/world/models/bruno-loupedeck-buttons.glb",
} as const;

/** The chair's baked maps, cropped to its UV islands, and the LED mask. */
export const BRUNO_MAPS = {
  day: "/world/bruno/chair-day.webp",
  night: "/world/bruno/chair-night.webp",
  neutral: "/world/bruno/chair-neutral.webp",
  lightMap: "/world/bruno/chair-light-map.webp",
  ledMask: "/world/bruno/google-home-led-mask.png",
} as const;

/** Screen and RGB brightness: soft by day, brighter at night. */
export function setupGlow(hours: number): number {
  return 0.75 + 0.45 * worldLight(hours).stars;
}
