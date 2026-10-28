// Original personal collection shelf (T10, S22): a white two-column display
// shelf left of the gaming setup, modelled after the site owner's own shelf
// from reference photos they supplied. The brown Nike football rests on a
// wooden stand on top; photography and video sit at eye level (a black
// instant camera with its rainbow film carton, a Zenit SLR, a silver Samsung
// compact); computer hardware boxes below (Corsair VS600 power supply, Ryzen 7,
// memory and NVMe packs); then a keyboard and books, and a Gigabyte box at the
// bottom. Stylized, not a scan: shapes are rebuilt and labels are drawn from
// measured layouts (Shelf.tsx), never cut from the photos. Brand names and
// marks belong to their owners; no affiliation. Pure numbers; Shelf.tsx
// merges the parts into one mesh per material.

import { HOUSE, type Part, type Vec3 } from "./house.ts";
import type { SetupMaterial } from "./setup.ts";
import { partBounds } from "./setup.ts";

/**
 * Base centre on the floor boards, turned a quarter so the open front (local
 * +z) faces the room (+x). Local x runs along the width: world z = base - x.
 */
export const SHELF = {
  base: [-0.89, HOUSE.floorY + 0.04, 0.45] as Vec3,
  yaw: Math.PI / 2,
  width: 1.2,
  depth: 0.32,
  height: 1.45,
  /** Board thickness. */
  board: 0.022,
} as const;

export const SHELF_ITEMS = [
  "carcass",
  "football",
  "polaroid-camera",
  "zenit-camera",
  "samsung-camera",
  "polaroid-carton",
  "psu-box",
  "ryzen-box",
  "gigabyte-box",
  "memory",
  "nvme",
  "keyboard",
  "book",
] as const;
export type ShelfItem = (typeof SHELF_ITEMS)[number];

/** PBR per shelf material: one merged draw each. */
export const SHELF_MATERIALS = {
  /** White satin lacquer of the carcass, and the football's white laces. */
  paint: {
    roughness: 0.42,
    metalness: 0,
    normal: "noise",
    normalScale: 0.03,
    tile: [0.5, 0.5],
  },
  /** Oak kick board and football stand: the house's plank grain. */
  wood: { roughness: 0.7, metalness: 0, surface: "planks" },
  /** Printed cardboard and book covers. */
  card: {
    roughness: 0.78,
    metalness: 0,
    normal: "noise",
    normalScale: 0.08,
    tile: [0.15, 0.15],
  },
  /** Camera leatherette and satin plastics, keyboard. */
  plastic: {
    roughness: 0.48,
    metalness: 0,
    normal: "noise",
    normalScale: 0.18,
    tile: [0.03, 0.03],
  },
  /** Chrome lens rings, dials and the brushed compact body. */
  metal: {
    roughness: 0.3,
    metalness: 0.9,
    normal: "noise",
    normalScale: 0.04,
    tile: [0.05, 0.05],
  },
  /** Coated lens glass: dark, glossy, reflecting the room. */
  glass: { roughness: 0.06, metalness: 0.6 },
} as const satisfies Record<string, SetupMaterial>;

export type ShelfMaterialId = keyof typeof SHELF_MATERIALS;
export type ShelfPart = Part & {
  material: ShelfMaterialId;
  item: ShelfItem;
  /** The object it belongs to (one camera, one book, the stand...). */
  group: string;
  role: string;
};

export const SHELF_COLORS = {
  paint: "#f6f3ee",
  oak: "#d6a878",
  back: "#ece7df",
  lace: "#fbf8f2",
  black: "#26252a",
  charcoal: "#3a393f",
  chrome: "#d9dadd",
  silver: "#c9cbcf",
  glass: "#1d2a38",
  flash: "#f4f1ea",
  shutter: "#e5532d",
  slot: "#141316",
  carton: "#f2efe8",
  psu: "#f2d33c",
  ryzen: "#2c2b30",
  gigabyte: "#1f2024",
  memory: "#2a2d33",
  nvme: "#30343b",
  keys: "#2b2a2f",
  books: [
    "#2f4f6f",
    "#9b3d33",
    "#e2d3b5",
    "#3f6b4f",
    "#c88a3a",
    "#5b4a7a",
    "#7d2f3a",
    "#d9cdb8",
    "#35506b",
    "#a46a3c",
    "#4d5b3c",
  ],
} as const;

/** Sides of the shelf's cylinders: lens rings and dials. */
export const SHELF_ROUND_SEGMENTS = 20;

const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0];

const T = SHELF.board;
const HW = SHELF.width / 2;
const HD = SHELF.depth / 2;
/** Back panel thickness; boards start in front of it. */
const BACK = 0.008;
const INNER_BACK = -HD + BACK;
/** Kick plinth height; the bottom board sits on it. */
const PLINTH = 0.07;
/** Tops of the bottom board and the three shelves; floors of the four tiers. */
export const SHELF_TIERS = [PLINTH + T, 0.42, 0.76, 1.1] as const;
/** Inner column extents (local x). */
const LEFT = [-HW + T, -T / 2] as const;
const RIGHT = [T / 2, HW - T] as const;

interface Options {
  radius?: number;
  segments?: number;
  rotation?: Vec3;
  shade?: number;
  profile?: [number, number][];
}

function piece(
  item: ShelfItem,
  group: string,
  role: string,
  material: ShelfMaterialId,
  shape: Part["shape"],
  center: Vec3,
  size: Vec3,
  color: string,
  options: Options = {},
): ShelfPart {
  return {
    item,
    group,
    role,
    material,
    shape,
    center,
    size,
    color,
    shade: options.shade ?? 1,
    ...(shape === "rounded" && {
      radius: options.radius ?? 0.003,
      segments: options.segments ?? 1,
    }),
    ...(options.rotation && { rotation: options.rotation }),
    ...(options.profile && { profile: options.profile }),
  };
}

/** A rounded box standing on `floor`: centre x, z and its size. */
const standing = (
  item: ShelfItem,
  group: string,
  role: string,
  material: ShelfMaterialId,
  floor: number,
  [x, z]: [number, number],
  size: Vec3,
  color: string,
  options: Options = {},
) =>
  piece(
    item,
    group,
    role,
    material,
    "rounded",
    [x, floor + size[1] / 2, z],
    size,
    color,
    options,
  );

/** A cylinder along local z (lens rings): radius, length, front-back centre. */
const ring = (
  item: ShelfItem,
  group: string,
  role: string,
  material: ShelfMaterialId,
  [x, y, z]: Vec3,
  radius: number,
  length: number,
  color: string,
  shade = 1,
) =>
  piece(
    item,
    group,
    role,
    material,
    "round",
    [x, y, z],
    [radius * 2, length, radius * 2],
    color,
    { rotation: ALONG_Z, shade },
  );

/* ------------------------------------------------------------------ */
/* Carcass                                                             */
/* ------------------------------------------------------------------ */

function carcass(): ShelfPart[] {
  const C = SHELF_COLORS;
  const board = (role: string, center: Vec3, size: Vec3, shade = 1) =>
    piece(
      "carcass",
      "carcass",
      role,
      "paint",
      "rounded",
      center,
      size,
      C.paint,
      {
        radius: 0.005,
        segments: 2,
        shade,
      },
    );
  const depth = HD - INNER_BACK;
  const zMid = (HD + INNER_BACK) / 2;
  const parts: ShelfPart[] = [
    board(
      "side",
      [-HW + T / 2, SHELF.height / 2, 0],
      [T, SHELF.height, SHELF.depth],
    ),
    board(
      "side",
      [HW - T / 2, SHELF.height / 2, 0],
      [T, SHELF.height, SHELF.depth],
    ),
    board("top", [0, SHELF.height - T / 2, 0], [SHELF.width, T, SHELF.depth]),
    board(
      "bottom",
      [0, PLINTH + T / 2, zMid],
      [SHELF.width - 2 * T, T, depth],
      0.98,
    ),
    board(
      "divider",
      [0, (SHELF_TIERS[0] + SHELF.height - T) / 2, zMid],
      [T, SHELF.height - T - SHELF_TIERS[0], depth],
    ),
    piece(
      "carcass",
      "carcass",
      "back",
      "paint",
      "rounded",
      [0, SHELF.height / 2, -HD + BACK / 2],
      [SHELF.width - 2 * T + 0.004, SHELF.height - 0.004, BACK],
      C.back,
      { radius: 0.002, segments: 1, shade: 0.95 },
    ),
    // Oak kick board, set back under the bottom board.
    piece(
      "carcass",
      "carcass",
      "plinth",
      "wood",
      "rounded",
      [0, PLINTH / 2, HD - 0.03 - T / 2],
      [SHELF.width - 2 * T, PLINTH, T],
      C.oak,
      { radius: 0.004, segments: 2 },
    ),
  ];
  for (const top of SHELF_TIERS.slice(1))
    for (const [x0, x1] of [LEFT, RIGHT])
      parts.push(
        board("shelf", [(x0 + x1) / 2, top - T / 2, zMid], [x1 - x0, T, depth]),
      );
  return parts;
}

/* ------------------------------------------------------------------ */
/* Football                                                            */
/* ------------------------------------------------------------------ */

/**
 * The football lies along local x on the top, laces turned up toward the
 * room: `laceAngle` is the laces' direction from straight up toward the
 * front (+z). A real ball is 28 cm by 17 cm.
 */
export const FOOTBALL = {
  length: 0.28,
  radius: 0.085,
  center: [0, 1.556, 0.01] as Vec3,
  laceAngle: 0.9,
  /** Lathe sides around the long axis. */
  segments: 48,
  /** Profile steps tip to tip. */
  steps: 32,
} as const;

/**
 * Pointed prolate profile as lathe points [radius, along the axis], tip to
 * tip: r = R (1 - u^2). Cosine spacing packs points into the tips.
 */
export function footballProfile(
  steps: number = FOOTBALL.steps,
): [number, number][] {
  const h = FOOTBALL.length / 2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const y = -h * Math.cos((Math.PI * i) / steps);
    const u = y / h;
    return [Math.max(0, FOOTBALL.radius * (1 - u * u)), y];
  });
}

/** Lathe v (profile fraction) at an axial position: inverse of the cosine spacing. */
const vAt = (y: number) =>
  Math.acos(Math.max(-1, Math.min(1, -y / (FOOTBALL.length / 2)))) / Math.PI;
/**
 * Lathe u for a direction `psi` from up toward the front, once the lathe is
 * turned onto local x (Shelf.tsx: rotateZ(-PI/2)): angle phi lands at
 * (0, -sin phi, cos phi), so phi = psi - PI/2.
 */
const uAt = (psi: number) => {
  const turn = (psi - Math.PI / 2) / (Math.PI * 2);
  return turn - Math.floor(turn);
};

/**
 * Leather skin painted in Shelf.tsx on a canvas: u runs around the ball, v
 * tip to tip. Four panels split by seams; the white stripes cross the two
 * panels beside the laces near both ends (as on the owner's college ball);
 * a white swoosh in the panel below the laces, facing the room. No model
 * text: none is readable in the photos.
 */
export const BALL_SKIN = {
  width: 1024,
  height: 512,
  leather: "#7b3f22",
  seam: "#3d1d10",
  stripe: "#fbf8f2",
  /** Seam directions (laces on the first), as lathe u. */
  seams: [0, 1, 2, 3].map((k) => uAt(FOOTBALL.laceAngle + (k * Math.PI) / 2)),
  /** Stripes, 2.5 cm wide, 5 to 7.5 cm from the centre toward each tip. */
  stripes: [
    { v0: vAt(-0.0735), v1: vAt(-0.0485) },
    { v0: vAt(0.0485), v1: vAt(0.0735) },
  ],
  /** Stripes span the two panels next to the laces: lathe u half-width. */
  stripeSpan: 0.25,
  swoosh: {
    u: uAt(FOOTBALL.laceAngle + Math.PI / 4),
    v: 0.5,
    /** Length along the ball and height, as fractions of the canvas. */
    width: 0.03,
    length: 0.17,
    color: "#f4efe6",
  },
  normal: "pebble",
  /** Pebble repeats around and along the ball. */
  pebbleRepeat: [36, 18] as const,
  text: null,
} as const;

function football(): ShelfPart[] {
  const C = SHELF_COLORS;
  const [cx, cy, cz] = FOOTBALL.center;
  const R = FOOTBALL.radius;
  const h = FOOTBALL.length / 2;
  const top = SHELF.height;
  const plate = 0.016;
  // Two oak cradles touch the ball where its radius is r(0.065).
  const at = 0.065;
  const rAt = (x: number) => R * (1 - (x / h) ** 2);
  const riserTop = cy - rAt(at);
  const parts: ShelfPart[] = [
    piece(
      "football",
      "stand",
      "plate",
      "wood",
      "rounded",
      [cx, top + plate / 2, cz],
      [0.18, plate, 0.1],
      C.oak,
      { radius: 0.006, segments: 2 },
    ),
  ];
  for (const x of [-at, at])
    parts.push(
      piece(
        "football",
        "stand",
        "cradle",
        "wood",
        "rounded",
        [cx + x, (top + plate + riserTop) / 2, cz],
        [0.03, riserTop - top - plate, 0.09],
        C.oak,
        { radius: 0.004, segments: 2, shade: 0.94 },
      ),
    );
  // Eight raised cross laces over a running lace on the seam.
  const psi = FOOTBALL.laceAngle;
  const onSeam = (x: number, lift: number): Vec3 => {
    const r = rAt(x) + lift;
    return [cx + x, cy + r * Math.cos(psi), cz + r * Math.sin(psi)];
  };
  const xs = Array.from({ length: 8 }, (_, i) => -0.049 + i * 0.014);
  for (const x of xs)
    parts.push(
      piece(
        "football",
        "ball",
        "lace",
        "paint",
        "rounded",
        onSeam(x, 0.0035),
        [0.0065, 0.005, 0.032],
        C.lace,
        { radius: 0.0022, rotation: [psi, 0, 0] },
      ),
    );
  for (let i = 0; i < xs.length - 1; i++) {
    const x = (xs[i] + xs[i + 1]) / 2;
    parts.push(
      piece(
        "football",
        "ball",
        "lace-seam",
        "paint",
        "box",
        onSeam(x, 0.0015),
        [0.0145, 0.003, 0.006],
        C.lace,
        { rotation: [psi, 0, 0], shade: 0.96 },
      ),
    );
  }
  return parts;
}

/* ------------------------------------------------------------------ */
/* Photography and video (top tier)                                    */
/* ------------------------------------------------------------------ */

/** Pentaprism housing outline, front view: a trapezoid with clipped shoulders. */
const HUMP: [number, number][] = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, -0.2],
  [0.24, 0.5],
  [-0.24, 0.5],
  [-0.5, -0.2],
];

function photography(): ShelfPart[] {
  const C = SHELF_COLORS;
  const floor = SHELF_TIERS[3];
  const parts: ShelfPart[] = [
    standing(
      "polaroid-carton",
      "carton",
      "box",
      "card",
      floor,
      [-0.45, -0.07],
      [0.12, 0.155, 0.12],
      C.carton,
    ),
  ];

  // Black instant camera: rounded body, big lens with a chrome ring,
  // viewfinder, flash diffuser, orange shutter and the film slot.
  const pc = "polaroid";
  const px = -0.19;
  const pz = 0.035;
  const body = [0.15, 0.094, 0.11] as Vec3;
  const front = pz + body[2] / 2;
  parts.push(
    standing(
      "polaroid-camera",
      pc,
      "body",
      "plastic",
      floor,
      [px, pz],
      body,
      C.black,
      {
        radius: 0.02,
        segments: 2,
      },
    ),
    ring(
      "polaroid-camera",
      pc,
      "bezel",
      "plastic",
      [px, floor + 0.043, front + 0.006],
      0.028,
      0.012,
      C.charcoal,
    ),
    ring(
      "polaroid-camera",
      pc,
      "lens-ring",
      "metal",
      [px, floor + 0.043, front + 0.0135],
      0.022,
      0.004,
      C.chrome,
    ),
    ring(
      "polaroid-camera",
      pc,
      "lens",
      "glass",
      [px, floor + 0.043, front + 0.016],
      0.016,
      0.004,
      C.glass,
    ),
    piece(
      "polaroid-camera",
      pc,
      "viewfinder",
      "glass",
      "rounded",
      [px - 0.047, floor + 0.074, front + 0.003],
      [0.022, 0.016, 0.008],
      C.glass,
      { radius: 0.003 },
    ),
    piece(
      "polaroid-camera",
      pc,
      "flash",
      "paint",
      "rounded",
      [px + 0.044, floor + 0.074, front + 0.003],
      [0.042, 0.018, 0.008],
      C.flash,
      { radius: 0.003 },
    ),
    piece(
      "polaroid-camera",
      pc,
      "shutter",
      "plastic",
      "round",
      [px + 0.052, floor + 0.03, front + 0.004],
      [0.014, 0.008, 0.014],
      C.shutter,
      { rotation: ALONG_Z },
    ),
    piece(
      "polaroid-camera",
      pc,
      "slot",
      "plastic",
      "rounded",
      [px, floor + 0.008, front + 0.002],
      [0.1, 0.005, 0.006],
      C.slot,
      { radius: 0.002 },
    ),
  );

  // Zenit 12XP: leatherette body, pentaprism hump with the nameplate,
  // chrome mount, knurled focus ring and front ring, coated glass, dials.
  const zc = "zenit";
  const zx = 0.17;
  const zBody = [0.14, 0.085, 0.05] as Vec3;
  const zy = floor + zBody[1] / 2;
  const zFront = zBody[2] / 2;
  const lensY = zy - 0.003;
  parts.push(
    standing(
      "zenit-camera",
      zc,
      "body",
      "plastic",
      floor,
      [zx, 0],
      zBody,
      C.black,
      {
        radius: 0.008,
        segments: 2,
      },
    ),
    piece(
      "zenit-camera",
      zc,
      "hump",
      "plastic",
      "prism",
      [zx, floor + zBody[1] + 0.02, -0.0025],
      [0.07, 0.04, 0.045],
      C.black,
      { shade: 1.06, profile: HUMP },
    ),
    piece(
      "zenit-camera",
      zc,
      "top-plate",
      "metal",
      "rounded",
      [zx, floor + zBody[1] + 0.002, 0],
      [0.13, 0.004, 0.046],
      C.charcoal,
      { radius: 0.0015 },
    ),
    ring(
      "zenit-camera",
      zc,
      "mount",
      "metal",
      [zx, lensY, zFront + 0.004],
      0.031,
      0.008,
      C.chrome,
    ),
    ring(
      "zenit-camera",
      zc,
      "barrel",
      "plastic",
      [zx, lensY, zFront + 0.028],
      0.027,
      0.04,
      C.black,
    ),
    ring(
      "zenit-camera",
      zc,
      "focus-ring",
      "plastic",
      [zx, lensY, zFront + 0.02],
      0.0295,
      0.012,
      C.charcoal,
      0.85,
    ),
    ring(
      "zenit-camera",
      zc,
      "aperture-ring",
      "metal",
      [zx, lensY, zFront + 0.036],
      0.028,
      0.004,
      C.chrome,
    ),
    ring(
      "zenit-camera",
      zc,
      "front-ring",
      "metal",
      [zx, lensY, zFront + 0.051],
      0.026,
      0.006,
      C.chrome,
      0.9,
    ),
    ring(
      "zenit-camera",
      zc,
      "lens",
      "glass",
      [zx, lensY, zFront + 0.0555],
      0.019,
      0.003,
      C.glass,
    ),
    piece(
      "zenit-camera",
      zc,
      "dial",
      "metal",
      "round",
      [zx + 0.045, floor + zBody[1] + 0.009, 0],
      [0.022, 0.01, 0.022],
      C.chrome,
    ),
    piece(
      "zenit-camera",
      zc,
      "rewind",
      "plastic",
      "round",
      [zx - 0.045, floor + zBody[1] + 0.01, 0],
      [0.02, 0.012, 0.02],
      C.charcoal,
    ),
    piece(
      "zenit-camera",
      zc,
      "shutter",
      "metal",
      "round",
      [zx + 0.045, floor + zBody[1] + 0.017, 0],
      [0.008, 0.006, 0.008],
      C.chrome,
    ),
  );

  // Samsung S760: brushed silver compact, lens rings, flash, shutter.
  const sc = "samsung";
  const sBody = [0.095, 0.06, 0.024] as Vec3;
  const sx = 0.4;
  const sz = 0.03;
  const sFront = sz + sBody[2] / 2;
  parts.push(
    standing(
      "samsung-camera",
      sc,
      "body",
      "metal",
      floor,
      [sx, sz],
      sBody,
      C.silver,
      {
        radius: 0.006,
        segments: 2,
      },
    ),
    ring(
      "samsung-camera",
      sc,
      "lens-ring",
      "metal",
      [sx + 0.018, floor + 0.028, sFront + 0.003],
      0.021,
      0.006,
      C.chrome,
      1.05,
    ),
    ring(
      "samsung-camera",
      sc,
      "lens-barrel",
      "plastic",
      [sx + 0.018, floor + 0.028, sFront + 0.007],
      0.016,
      0.004,
      C.charcoal,
    ),
    ring(
      "samsung-camera",
      sc,
      "lens",
      "glass",
      [sx + 0.018, floor + 0.028, sFront + 0.0095],
      0.011,
      0.002,
      C.glass,
    ),
    piece(
      "samsung-camera",
      sc,
      "flash",
      "paint",
      "rounded",
      [sx - 0.03, floor + 0.05, sFront + 0.0015],
      [0.016, 0.008, 0.003],
      C.flash,
      { radius: 0.001 },
    ),
    piece(
      "samsung-camera",
      sc,
      "shutter",
      "metal",
      "round",
      [sx + 0.03, floor + sBody[1] + 0.002, sz],
      [0.012, 0.004, 0.012],
      C.chrome,
    ),
  );
  return parts;
}

/* ------------------------------------------------------------------ */
/* Computer hardware                                                   */
/* ------------------------------------------------------------------ */

function hardware(): ShelfPart[] {
  const C = SHELF_COLORS;
  const floor = SHELF_TIERS[2];
  const box = (
    item: ShelfItem,
    group: string,
    xz: [number, number],
    size: Vec3,
    color: string,
  ) => standing(item, group, "box", "card", floor, xz, size, color);
  return [
    box("psu-box", "psu", [-0.33, 0.055], [0.23, 0.19, 0.15], C.psu),
    box("ryzen-box", "ryzen", [-0.11, 0.055], [0.13, 0.14, 0.13], C.ryzen),
    box("memory", "memory", [0.1, 0.09], [0.1, 0.15, 0.018], C.memory),
    box("nvme", "nvme", [0.21, 0.1], [0.075, 0.11, 0.016], C.nvme),
    box("nvme", "nvme-2", [0.31, 0.1], [0.075, 0.11, 0.016], C.nvme),
    // A second memory kit lies flat behind the packs.
    box("memory", "memory-2", [0.44, -0.04], [0.2, 0.03, 0.15], C.memory),
  ];
}

/* ------------------------------------------------------------------ */
/* Keyboard, books and the Gigabyte box                                */
/* ------------------------------------------------------------------ */

/** Standing books: thickness, height, depth; backs against the back panel. */
const BOOKS_UPPER: readonly Vec3[] = [
  [0.035, 0.24, 0.17],
  [0.03, 0.22, 0.16],
  [0.045, 0.26, 0.18],
  [0.028, 0.2, 0.15],
  [0.04, 0.23, 0.17],
  [0.032, 0.21, 0.16],
];
const BOOKS_LOWER: readonly Vec3[] = [
  [0.034, 0.22, 0.16],
  [0.04, 0.2, 0.15],
];
/** Lying stack: width, thickness, depth, bottom to top. */
const STACK: readonly Vec3[] = [
  [0.24, 0.034, 0.17],
  [0.22, 0.028, 0.16],
  [0.2, 0.032, 0.15],
];
const BOOK_RADIUS = 0.003;

function shelfBooks(): ShelfPart[] {
  const parts: ShelfPart[] = [];
  let colour = 0;
  const next = () => SHELF_COLORS.books[colour++ % SHELF_COLORS.books.length];
  const row = (
    books: readonly Vec3[],
    floor: number,
    start: number,
    first: number,
  ) => {
    let x = start;
    books.forEach(([t, h, d], i) => {
      parts.push(
        standing(
          "book",
          `book-${first + i}`,
          "cover",
          "card",
          floor,
          [x + t / 2, INNER_BACK + 0.004 + d / 2],
          [t, h, d],
          next(),
          {
            radius: BOOK_RADIUS,
          },
        ),
      );
      x += t + 0.002;
    });
  };
  row(BOOKS_UPPER, SHELF_TIERS[1], RIGHT[0] + 0.03, 1);
  // Lower tier, left: a lying stack, then two standing books.
  let y = SHELF_TIERS[0];
  const stackX = LEFT[0] + 0.02 + STACK[0][0] / 2;
  for (const [w, t, d] of STACK) {
    parts.push(
      piece(
        "book",
        "stack",
        "cover",
        "card",
        "rounded",
        [stackX, y + t / 2, INNER_BACK + 0.004 + d / 2],
        [w, t, d],
        next(),
        {
          radius: BOOK_RADIUS,
        },
      ),
    );
    y += t;
  }
  row(
    BOOKS_LOWER,
    SHELF_TIERS[0],
    stackX + STACK[0][0] / 2 + 0.03,
    1 + BOOKS_UPPER.length,
  );
  return parts;
}

function lowerTiers(): ShelfPart[] {
  const C = SHELF_COLORS;
  const kb = "keyboard";
  const floor = SHELF_TIERS[1];
  return [
    standing(
      "keyboard",
      kb,
      "body",
      "plastic",
      floor,
      [-0.295, 0.03],
      [0.42, 0.022, 0.14],
      C.black,
      {
        radius: 0.006,
        segments: 2,
      },
    ),
    piece(
      "keyboard",
      kb,
      "keys",
      "plastic",
      "rounded",
      [-0.295, floor + 0.022 + 0.004, 0.025],
      [0.39, 0.008, 0.115],
      C.keys,
      { radius: 0.002 },
    ),
    ...shelfBooks(),
    standing(
      "gigabyte-box",
      "gigabyte",
      "box",
      "card",
      SHELF_TIERS[0],
      [0.3, 0.02],
      [0.42, 0.1, 0.24],
      C.gigabyte,
    ),
  ];
}

/** Every shelf part in the shelf's local frame (base centre at the origin). */
export function shelfParts(): ShelfPart[] {
  return [
    ...carcass(),
    ...football(),
    ...photography(),
    ...hardware(),
    ...lowerTiers(),
  ];
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** One canvas for every printed face; Shelf.tsx draws each region. */
export const LABEL_ATLAS = { width: 1024, height: 512 } as const;

export type LabelKind =
  | "psu"
  | "ryzen"
  | "gigabyte"
  | "memory"
  | "nvme"
  | "carton"
  | "keys"
  | "zenit"
  | "samsung"
  | "spine"
  | "spine-flat";

export interface ShelfLabel {
  id: string;
  kind: LabelKind;
  item: ShelfItem;
  /** The part it is printed on: its role, and its group when needed. */
  anchor: string;
  group?: string;
  /** Front (+z) or top (+y) face. */
  face: "front" | "top";
  /** Atlas pixels: x, y from the top-left, width, height. */
  region: [number, number, number, number];
  /** Local centre, 1.5 mm proud of the face, and size along the face. */
  center: Vec3;
  size: [number, number];
  /** Book cover colour, for spines. */
  color?: string;
}

const LIFT = 0.0015;

/** A label covering the front of `part`, inset by `inset` on each side. */
function frontLabel(
  part: ShelfPart,
  id: string,
  kind: LabelKind,
  region: ShelfLabel["region"],
  inset = 0.002,
): ShelfLabel {
  const b = partBounds(part);
  return {
    id,
    kind,
    item: part.item,
    anchor: part.role,
    group: part.group,
    face: "front",
    region,
    center: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.z1 + LIFT],
    size: [b.x1 - b.x0 - 2 * inset, b.y1 - b.y0 - 2 * inset],
    color: part.color,
  };
}

function buildLabels(): ShelfLabel[] {
  const parts = shelfParts();
  const find = (group: string, role = "box") => {
    const part = parts.find((p) => p.group === group && p.role === role);
    if (!part) throw new Error(`no ${group} ${role}`);
    return part;
  };
  const labels: ShelfLabel[] = [
    frontLabel(find("psu"), "psu", "psu", [0, 0, 256, 212]),
    frontLabel(find("ryzen"), "ryzen", "ryzen", [256, 0, 200, 216]),
    frontLabel(find("gigabyte"), "gigabyte", "gigabyte", [456, 0, 432, 100]),
    frontLabel(find("memory"), "memory", "memory", [888, 0, 128, 188]),
    frontLabel(find("nvme"), "nvme", "nvme", [456, 104, 96, 140]),
    frontLabel(find("nvme-2"), "nvme-2", "nvme", [552, 104, 96, 140]),
    frontLabel(find("carton"), "carton", "carton", [648, 104, 180, 232]),
  ];
  const keys = find("keyboard", "keys");
  const kb = partBounds(keys);
  labels.push({
    id: "keys",
    kind: "keys",
    item: "keyboard",
    anchor: "keys",
    face: "top",
    region: [0, 220, 400, 120],
    center: [(kb.x0 + kb.x1) / 2, kb.y1 + LIFT, (kb.z0 + kb.z1) / 2],
    size: [kb.x1 - kb.x0 - 0.004, kb.z1 - kb.z0 - 0.004],
  });
  const hump = partBounds(find("zenit", "hump"));
  labels.push({
    id: "zenit",
    kind: "zenit",
    item: "zenit-camera",
    anchor: "hump",
    face: "front",
    region: [400, 250, 96, 32],
    center: [(hump.x0 + hump.x1) / 2, hump.y0 + 0.012, hump.z1 + LIFT],
    size: [0.04, 0.0134],
  });
  const compact = partBounds(find("samsung", "body"));
  labels.push({
    id: "samsung",
    kind: "samsung",
    item: "samsung-camera",
    anchor: "body",
    face: "front",
    region: [400, 290, 128, 24],
    center: [compact.x0 + 0.023, compact.y0 + 0.0075, compact.z1 + LIFT],
    size: [0.04, 0.0075],
  });
  // Standing spines: six upper, two lower; then the lying stack.
  const standingBooks = parts.filter(
    (p) => p.item === "book" && p.group !== "stack",
  );
  standingBooks.forEach((book, i) => {
    const tall = i < BOOKS_UPPER.length;
    const region: ShelfLabel["region"] = tall
      ? [828 + 32 * i, 200, 32, 240]
      : [560 + 32 * (i - BOOKS_UPPER.length), 340, 32, 160];
    labels.push(frontLabel(book, `spine-${i + 1}`, "spine", region, 0.003));
  });
  parts
    .filter((p) => p.item === "book" && p.group === "stack")
    .forEach((book, i) => {
      const label = frontLabel(
        book,
        `spine-flat-${i + 1}`,
        "spine-flat",
        [0, 350 + 34 * i, 200, 30],
        0.003,
      );
      labels.push({ ...label, id: `spine-flat-${i + 1}` });
    });
  return labels;
}

export const SHELF_LABELS: readonly ShelfLabel[] = buildLabels();

/* ------------------------------------------------------------------ */
/* World frame and budget                                              */
/* ------------------------------------------------------------------ */

/** Local point to world: turned by the yaw about the base. */
export function shelfToWorld([x, y, z]: Vec3): Vec3 {
  const c = Math.cos(SHELF.yaw);
  const s = Math.sin(SHELF.yaw);
  const [bx, by, bz] = SHELF.base;
  return [bx + x * c + z * s, by + y, bz - x * s + z * c];
}

/** World axis-aligned bounds of a local part. */
export function shelfWorldBounds(part: Part) {
  const b = partBounds(part);
  const corners = [b.x0, b.x1].flatMap((x) =>
    [b.z0, b.z1].map((z) => shelfToWorld([x, 0, z])),
  );
  const xs = corners.map((p) => p[0]);
  const zs = corners.map((p) => p[2]);
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: SHELF.base[1] + b.y0,
    y1: SHELF.base[1] + b.y1,
    z0: Math.min(...zs),
    z1: Math.max(...zs),
  };
}

/** Triangles a part adds when merged (House.tsx mergeParts). */
function partTriangles(part: Part): number {
  if (part.shape === "box") return 12;
  if (part.shape === "round") return 4 * SHELF_ROUND_SEGMENTS;
  if (part.shape === "prism") {
    const n = part.profile?.length ?? 0;
    return 2 * (n - 2) + 2 * n;
  }
  const cells = 2 * ((part.segments ?? 2) + 1) - 1;
  return 6 * cells * cells * 2;
}

/** Triangles and draw calls of the whole shelf: solids, ball and labels. */
export function shelfBudget() {
  const parts = shelfParts();
  const solids = parts.reduce((sum, p) => sum + partTriangles(p), 0);
  const ball = FOOTBALL.segments * FOOTBALL.steps * 2;
  const labels = SHELF_LABELS.length * 2;
  return {
    triangles: solids + ball + labels,
    solids,
    ball,
    labels,
    draws: new Set(parts.map((p) => p.material)).size + 2,
  };
}
