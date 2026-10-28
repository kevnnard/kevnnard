// Original procedural wooden house for the island pad (T4a, S6): one spacious
// main volume, kept empty for later items, plus a garage on its left side.
// Walls are horizontal planks laid around real window and door openings, so
// the sun and moon light shines through the glass onto the floor. Pure
// numbers; House.tsx merges the parts into a few meshes per material.

import { PAD } from "./island.ts";
import { seededRandom } from "./random.ts";
import type { Surface } from "./textures.ts";

export type Vec3 = [number, number, number];

/** Warm pastel wood, cream trim and a coral shingle roof (02-cozy-diorama). */
export const HOUSE_COLORS = {
  plank: "#eabd8e",
  post: "#c98d62",
  trim: "#fff1dc",
  roof: "#e08b78",
  ridge: "#b9675a",
  floor: "#e3b78a",
  plinth: "#d8cbbf",
  door: "#8fbfae",
  knob: "#f4cf6e",
  garageDoor: "#f7ead6",
  driveway: "#e0d6cb",
  glass: "#d9f1f6",
} as const;

/**
 * A box, a 10-sided cylinder ("round", axis along y) or a "prism" (convex
 * `profile` in the unit xy square, extruded along z), scaled to `size`.
 */
export interface Part {
  shape: "box" | "round" | "prism";
  /** Prism outline, counter-clockwise, within [-0.5, 0.5]. */
  profile?: [number, number][];
  center: Vec3;
  size: Vec3;
  /** Euler XYZ radians. */
  rotation?: Vec3;
  color: string;
  /** Multiplies the color: the subtle per-plank variation. */
  shade: number;
  /** Textured surface (T4e); untextured trim and fittings have none. */
  surface?: Surface;
}

/**
 * Separately rendered groups for the cutaway (T4c): every wall with its trim
 * and glass, and each roof, fade on their own; `base` (plinths, floor, porch,
 * driveway, corner posts) never fades.
 */
export const HOUSE_GROUPS = [
  "base",
  "main-front",
  "main-right",
  "main-back",
  "main-left",
  "garage-front",
  "garage-left",
  "garage-back",
  "main-roof",
  "garage-roof",
] as const;
export type HouseGroup = (typeof HOUSE_GROUPS)[number];

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface Volume extends Rect {
  /** Wall height above the floor. */
  height: number;
  /** Gable rise above the walls; the ridge runs along x. */
  rise: number;
  /** Roof overhang past each wall. */
  overhang: Rect;
}

const FLOOR_Y = PAD.height + 0.1;
const PAD_FRONT = PAD.center[1] + PAD.halfZ;

export const HOUSE = {
  seed: 11,
  /** Top of the stone plinth: walls stand here. */
  floorY: FLOOR_Y,
  wall: 0.14,
  plank: 0.17,
  main: {
    x0: -1.25,
    x1: 2.25,
    z0: -2.75,
    z1: 0.85,
    height: 1.95,
    rise: 1.15,
    overhang: { x0: 0.22, x1: 0.22, z0: 0.22, z1: 0.22 },
  } satisfies Volume,
  garage: {
    x0: -3.1,
    x1: -1.25,
    z0: -2.45,
    z1: 0.55,
    height: 1.45,
    rise: 0.6,
    // No overhang on the right: that side leans on the main house.
    overhang: { x0: 0.18, x1: 0, z0: 0.18, z1: 0.18 },
  } satisfies Volume,
  porch: { x0: 0.04, x1: 0.96, z0: 0.85, z1: 1.41 },
  driveway: { x0: -2.95, x1: -1.42, z0: 0.55, z1: PAD_FRONT },
} as const;

/** Middle of the house and garage, a little above the floor: the camera target. */
export const HOUSE_FOCUS: Vec3 = [
  (HOUSE.garage.x0 + HOUSE.main.x1) / 2,
  FLOOR_Y + 1.2,
  (HOUSE.main.z0 + HOUSE.main.z1) / 2,
];

export interface Opening {
  kind: "window" | "door" | "garage";
  /** Along the wall, in world x (walls along x) or z (walls along z). */
  u0: number;
  u1: number;
  /** Height above the floor. */
  v0: number;
  v1: number;
}

export interface Wall {
  id: string;
  group: HouseGroup;
  /** World axis the wall runs along. */
  axis: "x" | "z";
  /** Fixed coordinate of the wall's center plane on the other axis. */
  at: number;
  /** Outward direction on the other axis. */
  side: 1 | -1;
  from: number;
  to: number;
  height: number;
  /** Triangular gable above `height`, under the roof. */
  gable?: { center: number; half: number; rise: number };
  openings: Opening[];
}

const W = HOUSE.wall;
const M = HOUSE.main;
const G = HOUSE.garage;

const pane = (u0: number, u1: number, v0 = 0.75, v1 = 1.5): Opening => ({
  kind: "window",
  u0,
  u1,
  v0,
  v1,
});

const gable = (volume: Volume) => ({
  center: (volume.z0 + volume.z1) / 2,
  half: (volume.z1 - volume.z0) / 2,
  rise: volume.rise,
});

export const WALLS: readonly Wall[] = [
  {
    id: "main-front",
    group: "main-front",
    axis: "x",
    at: M.z1 - W / 2,
    side: 1,
    from: M.x0,
    to: M.x1,
    height: M.height,
    openings: [
      pane(-0.95, -0.2),
      { kind: "door", u0: 0.14, u1: 0.86, v0: 0, v1: 1.5 },
      pane(1.25, 2),
    ],
  },
  {
    id: "main-right",
    group: "main-right",
    axis: "z",
    at: M.x1 - W / 2,
    side: 1,
    from: M.z0 + W,
    to: M.z1 - W,
    height: M.height,
    gable: gable(M),
    openings: [pane(-2.2, -1.4), pane(-0.6, 0.2)],
  },
  {
    id: "main-back",
    group: "main-back",
    axis: "x",
    at: M.z0 + W / 2,
    side: -1,
    from: M.x0,
    to: M.x1,
    height: M.height,
    openings: [pane(-0.6, 0.2), pane(0.9, 1.7)],
  },
  {
    id: "main-left",
    group: "main-left",
    axis: "z",
    at: M.x0 + W / 2,
    side: -1,
    from: M.z0 + W,
    to: M.z1 - W,
    height: M.height,
    gable: gable(M),
    openings: [],
  },
  {
    id: "garage-front",
    group: "garage-front",
    axis: "x",
    at: G.z1 - W / 2,
    side: 1,
    from: G.x0,
    to: G.x1,
    height: G.height,
    openings: [{ kind: "garage", u0: -2.88, u1: -1.5, v0: 0, v1: 1.15 }],
  },
  {
    id: "garage-left",
    group: "garage-left",
    axis: "z",
    at: G.x0 + W / 2,
    side: -1,
    from: G.z0 + W,
    to: G.z1 - W,
    height: G.height,
    gable: gable(G),
    openings: [pane(-1.3, -0.7, 0.6, 1.1)],
  },
  {
    id: "garage-back",
    group: "garage-back",
    axis: "x",
    at: G.z0 + W / 2,
    side: -1,
    from: G.x0,
    to: G.x1,
    height: G.height,
    openings: [],
  },
];

const roofRect = (volume: Volume, id: string) => ({
  id,
  x0: volume.x0 - volume.overhang.x0,
  x1: volume.x1 + volume.overhang.x1,
  z0: volume.z0 - volume.overhang.z0,
  z1: volume.z1 + volume.overhang.z1,
});

/** Everything the house covers, roof overhang included: nature stays out. */
export const HOUSE_FOOTPRINT: readonly (Rect & { id: string })[] = [
  roofRect(M, "main"),
  roofRect(G, "garage"),
  { id: "porch", ...HOUSE.porch },
  { id: "driveway", ...HOUSE.driveway },
];

export interface Plank {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  shade: number;
  /** Small outward offset so neighbouring rows read as separate boards. */
  lift: number;
}

/**
 * The gable above the eave, as one sloped outline in (u, v): eave corners,
 * the slope clipped at both wall ends, and the ridge apex. Counter-clockwise;
 * null for walls without a gable.
 */
export function gablePanel(wall: Wall): [number, number][] | null {
  if (!wall.gable) return null;
  const { center, half, rise } = wall.gable;
  const slope = (u: number) =>
    wall.height + rise * (1 - Math.abs(u - center) / half);
  return [
    [wall.from, wall.height],
    [wall.to, wall.height],
    [wall.to, slope(wall.to)],
    [center, wall.height + rise],
    [wall.from, slope(wall.from)],
  ];
}

/**
 * Horizontal planks laid row by row around the openings, up to the eave (the
 * gable above is one sloped panel). A row crossing an opening's sill or head
 * is split there, so every hole is exact.
 */
export function wallPlanks(wall: Wall, random: () => number): Plank[] {
  const planks: Plank[] = [];
  const top = wall.height;
  const rows = Math.ceil(top / HOUSE.plank - 1e-9);
  for (let row = 0; row < rows; row++) {
    const v0 = row * HOUSE.plank;
    const v1 = Math.min(v0 + HOUSE.plank, top);
    const shade = (row % 2 === 0 ? 1 : 0.96) * (0.95 + random() * 0.08);
    const lift = random() * 0.012;
    const cuts = [
      v0,
      v1,
      wall.height,
      ...wall.openings.flatMap((opening) => [opening.v0, opening.v1]),
    ]
      .filter((v) => v >= v0 && v <= v1)
      .sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 1e-6) continue;
      const [lo, hi] = [wall.from, wall.to];
      const holes = wall.openings
        .filter((opening) => opening.v0 < b - 1e-9 && opening.v1 > a + 1e-9)
        .sort((p, q) => p.u0 - q.u0);
      let start = lo;
      const push = (u0: number, u1: number) => {
        if (u1 - u0 > 1e-6) planks.push({ u0, u1, v0: a, v1: b, shade, lift });
      };
      for (const hole of holes) {
        push(start, Math.min(hole.u0, hi));
        start = Math.max(start, hole.u1);
      }
      push(start, hi);
    }
  }
  return planks;
}

/** A box on the wall: u along it, v up from the floor, n outward from its center plane. */
function onWall(
  wall: Wall,
  [u, v, n]: Vec3,
  [du, dv, dn]: Vec3,
  color: string,
  shade = 1,
  surface?: Surface,
): Part {
  const out = wall.at + n * wall.side;
  return {
    shape: "box",
    center: wall.axis === "x" ? [u, FLOOR_Y + v, out] : [out, FLOOR_Y + v, u],
    size: wall.axis === "x" ? [du, dv, dn] : [dn, dv, du],
    color,
    shade,
    ...(surface && { surface }),
  };
}

/** The gable panel as a plank-textured prism in the wall plane. */
function gableParts(wall: Wall, wood: Part[]) {
  const outline = gablePanel(wall);
  if (!outline) return;
  const us = outline.map(([u]) => u);
  const vs = outline.map(([, v]) => v);
  const [u0, u1] = [Math.min(...us), Math.max(...us)];
  const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
  const [um, vm] = [(u0 + u1) / 2, (v0 + v1) / 2];
  const out = wall.at;
  wood.push({
    shape: "prism",
    profile: outline.map(([u, v]) => [
      (u - um) / (u1 - u0),
      (v - vm) / (v1 - v0),
    ]),
    center:
      wall.axis === "x" ? [um, FLOOR_Y + vm, out] : [out, FLOOR_Y + vm, um],
    size: [u1 - u0, v1 - v0, W],
    // Local x runs along the wall: world z for walls along z.
    ...(wall.axis === "z" && { rotation: [0, -Math.PI / 2, 0] as Vec3 }),
    color: HOUSE_COLORS.plank,
    shade: 0.97,
    surface: "planks",
  });
}

const FRAME = 0.07;

/** Cream frame, sill and cross mullions around a window; one glass pane. */
function windowParts(wall: Wall, o: Opening, wood: Part[], glass: Part[]) {
  const { trim } = HOUSE_COLORS;
  const du = o.u1 - o.u0;
  const dv = o.v1 - o.v0;
  const um = (o.u0 + o.u1) / 2;
  const vm = (o.v0 + o.v1) / 2;
  const depth = W + 0.05;
  wood.push(
    onWall(
      wall,
      [o.u0 - FRAME / 2, vm, 0],
      [FRAME, dv + 2 * FRAME, depth],
      trim,
    ),
    onWall(
      wall,
      [o.u1 + FRAME / 2, vm, 0],
      [FRAME, dv + 2 * FRAME, depth],
      trim,
    ),
    onWall(
      wall,
      [um, o.v1 + FRAME / 2, 0.01],
      [du + 2 * FRAME + 0.04, FRAME, depth + 0.02],
      trim,
    ),
    onWall(
      wall,
      [um, o.v0 - FRAME / 2, 0.04],
      [du + 2 * FRAME + 0.08, FRAME, depth + 0.08],
      trim,
      0.97,
    ),
    // The mullions cast a cross into the light patch on the floor.
    onWall(wall, [um, vm, 0], [0.04, dv, W * 0.5], trim),
    onWall(wall, [um, vm, 0], [du, 0.04, W * 0.5], trim),
  );
  glass.push(onWall(wall, [um, vm, 0], [du, dv, 0.015], HOUSE_COLORS.glass));
}

function doorParts(wall: Wall, o: Opening, wood: Part[]) {
  const { trim, door, knob } = HOUSE_COLORS;
  const du = o.u1 - o.u0;
  const dv = o.v1 - o.v0;
  const um = (o.u0 + o.u1) / 2;
  const depth = W + 0.05;
  wood.push(
    onWall(
      wall,
      [o.u0 - FRAME / 2, dv / 2 + FRAME / 2, 0],
      [FRAME, dv + FRAME, depth],
      trim,
    ),
    onWall(
      wall,
      [o.u1 + FRAME / 2, dv / 2 + FRAME / 2, 0],
      [FRAME, dv + FRAME, depth],
      trim,
    ),
    onWall(
      wall,
      [um, o.v1 + FRAME / 2, 0.01],
      [du + 2 * FRAME + 0.04, FRAME, depth + 0.02],
      trim,
    ),
    onWall(wall, [um, dv / 2, 0], [du, dv, 0.06], door),
    onWall(
      wall,
      [um, dv * 0.32, 0.035],
      [du * 0.62, dv * 0.34, 0.02],
      door,
      1.08,
    ),
    onWall(
      wall,
      [um, dv * 0.73, 0.035],
      [du * 0.62, dv * 0.34, 0.02],
      door,
      1.08,
    ),
    onWall(wall, [o.u1 - 0.11, dv * 0.5, 0.06], [0.06, 0.06, 0.05], knob),
  );
}

/** Wide sectional door: four horizontal panels with raised strips. */
function garageDoorParts(wall: Wall, o: Opening, wood: Part[]) {
  const { trim, garageDoor } = HOUSE_COLORS;
  const du = o.u1 - o.u0;
  const dv = o.v1 - o.v0;
  const um = (o.u0 + o.u1) / 2;
  const depth = W + 0.05;
  const panels = 4;
  const ph = dv / panels;
  for (let i = 0; i < panels; i++) {
    const v = o.v0 + ph * (i + 0.5);
    const shade = i % 2 === 0 ? 1 : 0.95;
    wood.push(
      onWall(wall, [um, v, -0.01], [du, ph, 0.06], garageDoor, shade),
      onWall(
        wall,
        [um, v, 0.025],
        [du - 0.16, ph * 0.42, 0.015],
        garageDoor,
        shade * 1.05,
      ),
    );
  }
  wood.push(
    onWall(
      wall,
      [o.u0 - FRAME / 2, dv / 2 + FRAME / 2, 0],
      [FRAME, dv + FRAME, depth],
      trim,
    ),
    onWall(
      wall,
      [o.u1 + FRAME / 2, dv / 2 + FRAME / 2, 0],
      [FRAME, dv + FRAME, depth],
      trim,
    ),
    onWall(
      wall,
      [um, o.v1 + FRAME / 2, 0.01],
      [du + 2 * FRAME + 0.04, FRAME, depth + 0.02],
      trim,
    ),
    onWall(
      wall,
      [um, o.v0 + ph * 0.5, 0.04],
      [0.22, 0.04, 0.03],
      HOUSE_COLORS.ridge,
    ),
  );
}

/** Planks, base and top boards, and whatever fills each opening. */
function wallParts(
  wall: Wall,
  random: () => number,
  wood: Part[],
  glass: Part[],
) {
  for (const p of wallPlanks(wall, random))
    wood.push(
      onWall(
        wall,
        [(p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, p.lift],
        [p.u1 - p.u0, p.v1 - p.v0, W],
        HOUSE_COLORS.plank,
        p.shade,
        "planks",
      ),
    );
  gableParts(wall, wood);
  // Base board, broken by the doors; a top board right under the eave.
  const doors = wall.openings.filter((o) => o.v0 < 0.1);
  let start = wall.from;
  for (const segment of [...doors, { u0: wall.to, u1: wall.to }]) {
    const end = segment.u0 - (segment.u0 < wall.to ? FRAME : 0);
    if (end - start > 0.02)
      wood.push(
        onWall(
          wall,
          [(start + end) / 2, 0.06, W / 2 + 0.02],
          [end - start, 0.12, 0.04],
          HOUSE_COLORS.trim,
          0.96,
        ),
      );
    start = segment.u1 + FRAME;
  }
  wood.push(
    onWall(
      wall,
      [(wall.from + wall.to) / 2, wall.height - 0.05, W / 2 + 0.02],
      [wall.to - wall.from, 0.1, 0.04],
      HOUSE_COLORS.trim,
    ),
  );
  for (const opening of wall.openings)
    if (opening.kind === "window") windowParts(wall, opening, wood, glass);
    else if (opening.kind === "door") doorParts(wall, opening, wood);
    else garageDoorParts(wall, opening, wood);
}

/** Chunky rounded corner post. */
const post = (x: number, z: number, height: number): Part => ({
  shape: "round",
  center: [x, FLOOR_Y + height / 2, z],
  size: [0.24, height, 0.24],
  color: HOUSE_COLORS.post,
  shade: 1,
});

const add = (a: Vec3, b: Vec3, scale: number): Vec3 => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
  a[2] + b[2] * scale,
];

/** Pitched roof with the ridge along x: slabs, staggered shingle rows, trim. */
function roofParts(volume: Volume, random: () => number): Part[] {
  const parts: Part[] = [];
  const { overhang: oh } = volume;
  const halfD = (volume.z1 - volume.z0) / 2;
  const theta = Math.atan2(volume.rise, halfD);
  const eaveY = FLOOR_Y + volume.height;
  const x0 = volume.x0 - oh.x0;
  const x1 = volume.x1 + oh.x1;
  const width = x1 - x0;
  const xc = (x0 + x1) / 2;
  const ridge: Vec3 = [xc, eaveY + volume.rise, (volume.z0 + volume.z1) / 2];
  const t = 0.1;
  const tab = 0.36;
  for (const side of [1, -1] as const) {
    const dir: Vec3 = [0, -Math.sin(theta), side * Math.cos(theta)];
    const normal: Vec3 = [0, Math.cos(theta), side * Math.sin(theta)];
    const length = (halfD + (side > 0 ? oh.z1 : oh.z0)) / Math.cos(theta);
    const rotation: Vec3 = [side * theta, 0, 0];
    const slab = (
      along: number,
      up: number,
      size: Vec3,
      color: string,
      shade = 1,
      tilt = 0,
      surface?: Surface,
    ) =>
      parts.push({
        shape: "box",
        center: add(add(ridge, dir, along), normal, up),
        size,
        rotation: [side * (theta - tilt), 0, 0],
        color,
        shade,
        ...(surface && { surface }),
      });
    slab(
      length / 2,
      t / 2,
      [width, t, length],
      HOUSE_COLORS.roof,
      0.82,
      0,
      "shingles",
    );
    // Shingle rows from the ridge down, tabs staggered on alternate rows; a
    // flatter tilt lifts each row's lower edge into a soft sawtooth.
    const rows = Math.ceil(length / 0.24);
    const rowLength = length / rows;
    for (let row = 0; row < rows; row++) {
      const along = (row + 0.5) * rowLength;
      const offset = row % 2 === 0 ? 0 : tab / 2;
      for (let u = x0 - offset; u < x1 - 1e-6; u += tab) {
        const a = Math.max(u, x0);
        const b = Math.min(u + tab, x1);
        if (b - a < 0.05) continue;
        const shade = (row % 2 === 0 ? 1 : 0.95) * (0.96 + random() * 0.07);
        const center = add(add(ridge, dir, along), normal, t + 0.03);
        center[0] = (a + b) / 2;
        parts.push({
          shape: "box",
          center,
          size: [b - a - 0.015, 0.05, rowLength * 1.12],
          rotation: [side * (theta - 0.07), 0, 0],
          color: HOUSE_COLORS.roof,
          shade,
          surface: "shingles",
        });
      }
    }
    // Eave board and gable-end boards (none where the roof meets a wall).
    slab(length, t / 2, [width, t + 0.08, 0.05], HOUSE_COLORS.trim);
    for (const [end, reach] of [
      [x0, oh.x0],
      [x1, oh.x1],
    ] as const) {
      if (reach <= 0) continue;
      const along = add(add(ridge, dir, length / 2), normal, t / 2 + 0.02);
      along[0] = end + (end < xc ? -0.035 : 0.035);
      parts.push({
        shape: "box",
        center: along,
        size: [0.07, t + 0.12, length],
        rotation,
        color: HOUSE_COLORS.trim,
        shade: 1,
      });
    }
  }
  parts.push({
    shape: "round",
    center: [xc, ridge[1] + t / Math.cos(theta) + 0.03, ridge[2]],
    size: [0.2, width + 0.06, 0.2],
    rotation: [0, 0, Math.PI / 2],
    color: HOUSE_COLORS.ridge,
    shade: 1,
  });
  return parts;
}

const flat = (
  rect: Rect,
  y0: number,
  y1: number,
  color: string,
  shade = 1,
  surface?: Surface,
): Part => ({
  shape: "box",
  center: [(rect.x0 + rect.x1) / 2, (y0 + y1) / 2, (rect.z0 + rect.z1) / 2],
  size: [rect.x1 - rect.x0, y1 - y0, rect.z1 - rect.z0],
  color,
  shade,
  ...(surface && { surface }),
});

const grow = (rect: Rect, by: number): Rect => ({
  x0: rect.x0 - by,
  x1: rect.x1 + by,
  z0: rect.z0 - by,
  z1: rect.z1 + by,
});

/** Interior floor boards, staggered at a seeded seam per row. */
function floorParts(random: () => number): Part[] {
  const parts: Part[] = [];
  const x0 = M.x0 + W;
  const x1 = M.x1 - W;
  const z0 = M.z0 + W;
  const z1 = M.z1 - W;
  const width = 0.28;
  const rows = Math.round((z1 - z0) / width);
  const step = (z1 - z0) / rows;
  for (let row = 0; row < rows; row++) {
    const seam = x0 + 0.6 + random() * (x1 - x0 - 1.2);
    for (const [a, b] of [
      [x0, seam],
      [seam, x1],
    ])
      parts.push(
        flat(
          {
            x0: a + 0.004,
            x1: b - 0.004,
            z0: z0 + row * step + 0.004,
            z1: z0 + (row + 1) * step - 0.004,
          },
          FLOOR_Y,
          FLOOR_Y + 0.04,
          HOUSE_COLORS.floor,
          0.92 + random() * 0.12,
          "floor",
        ),
      );
  }
  return parts;
}

export interface HouseMeshes {
  wood: Part[];
  glass: Part[];
}

/** Every part of the house, grouped for rendering and the cutaway. */
export function houseMeshes(
  seed: number = HOUSE.seed,
): Record<HouseGroup, HouseMeshes> {
  const random = seededRandom(seed);
  const meshes = Object.fromEntries(
    HOUSE_GROUPS.map((group) => [group, { wood: [], glass: [] }]),
  ) as unknown as Record<HouseGroup, HouseMeshes>;
  for (const wall of WALLS)
    wallParts(wall, random, meshes[wall.group].wood, meshes[wall.group].glass);

  const { porch, driveway } = HOUSE;
  meshes.base.wood.push(
    flat(grow(M, 0.05), PAD.height, FLOOR_Y, HOUSE_COLORS.plinth),
    flat(grow(G, 0.05), PAD.height, FLOOR_Y, HOUSE_COLORS.plinth, 0.97),
    flat(driveway, PAD.height, PAD.height + 0.03, HOUSE_COLORS.driveway),
    flat(
      { ...porch, z1: porch.z1 - 0.2 },
      PAD.height,
      FLOOR_Y,
      HOUSE_COLORS.plank,
      0.9,
    ),
    flat(
      {
        ...porch,
        x0: porch.x0 + 0.06,
        x1: porch.x1 - 0.06,
        z0: porch.z1 - 0.2,
      },
      PAD.height,
      PAD.height + 0.05,
      HOUSE_COLORS.plank,
      0.86,
    ),
    ...floorParts(random),
    post(M.x0 + W / 2, M.z0 + W / 2, M.height),
    post(M.x1 - W / 2, M.z0 + W / 2, M.height),
    post(M.x0 + W / 2, M.z1 - W / 2, M.height),
    post(G.x0 + W / 2, G.z0 + W / 2, G.height),
    post(G.x0 + W / 2, G.z1 - W / 2, G.height),
    post(G.x1 + 0.02, G.z1 - W / 2, G.height),
  );
  meshes["garage-roof"].wood.push(...roofParts(G, random));
  meshes.base.wood.push(post(M.x1 - W / 2, M.z1 - W / 2, M.height));
  meshes["main-roof"].wood.push(...roofParts(M, random));
  return meshes;
}
