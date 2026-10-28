// Living area in the main room (T4j, S14), across a 0.6 m corridor from the
// gaming setup, which keeps the shared garage wall. KayKit Furniture Bits give
// the sofa, coffee table, TV bench, rug, books and a small cactus; the TV, a
// DualSense-style controller, a stack of PS5-style game cases and three leafy
// potted plants are original rounded geometry. The TV backs onto the back
// wall and faces the sofa. Pure numbers; Living.tsx bakes the models and
// merges the original parts into one mesh per material, plus one glow mesh.

import { HOUSE, type Part, type Rect, type Vec3 } from "./house.ts";
import type { NormalPattern } from "./normals.ts";
import { worldLight } from "./palette.ts";
import { seededRandom } from "./random.ts";
import {
  MAIN_ROOM,
  partBounds,
  SETUP_ZONE,
  type SetupMaterial,
} from "./setup.ts";

/** Top of the floor boards. */
const Y0 = HOUSE.floorY + 0.04;
/** Centre line of the living area, between the corridor and the right wall. */
const LX = 2.775;

export const LIVING_COLORS = {
  bezel: "#2a2930",
  housing: "#34333a",
  logo: "#8d8b96",
  sky: "#7cc4f2",
  cloud: "#f4f8ff",
  hills: "#8fe0b8",
  ground: "#5fae86",
  sun: "#ffe1a1",
  hero: "#ff9ad5",
  hud: "#ffffff",
  shell: "#f4f2f6",
  core: "#26252b",
  touchpad: "#33323a",
  stick: "#2b2a30",
  buttons: "#d8d5de",
  lightBar: "#5b8cff",
  caseBlue: "#2563c9",
  caseWhite: "#f3f1f8",
  labels: ["#ff8a5c", "#f4cf6e", "#9b7bea", "#5ccf9a"],
  pot: "#d9835f",
  rim: "#e69a76",
  soil: "#6e4c3c",
  leaves: ["#7fbf6a", "#69ad5c", "#93cf7a", "#5c9f55"],
} as const;

/** One merged draw each; the same PBR model as the setup's materials. */
export const LIVING_MATERIALS = {
  /** Satin plastic: TV bezel and housing, controller, game cases. */
  satin: {
    roughness: 0.45,
    metalness: 0,
    normal: "noise",
    normalScale: 0.05,
    tile: [0.3, 0.3],
  },
  /** Unglazed terracotta pots. */
  ceramic: {
    roughness: 0.85,
    metalness: 0,
    normal: "noise",
    normalScale: 0.3,
    tile: [0.12, 0.12],
  },
  soil: {
    roughness: 1,
    metalness: 0,
    normal: "noise",
    normalScale: 0.8,
    tile: [0.05, 0.05],
  },
  /** Waxy leaves: a soft sheen and faint veins of noise. */
  leaf: {
    roughness: 0.55,
    metalness: 0,
    normal: "noise",
    normalScale: 0.12,
    tile: [0.2, 0.2],
  },
} as const satisfies Record<string, SetupMaterial>;

export type LivingMaterialId = keyof typeof LIVING_MATERIALS;
export type LivingItem = "tv" | "controller" | "game-case" | "plant";
export type LivingPart = Part & {
  material: LivingMaterialId;
  item: LivingItem;
  /** One controller, case or plant among several parts. */
  group?: string;
  role?: string;
};

export type LivingModel =
  | "sofa"
  | "coffee-table"
  | "tv-stand"
  | "rug"
  | "books"
  | "cactus";

/** KayKit Furniture Bits models (credited in public/world/credits.json). */
export const LIVING_FILES: Record<LivingModel, string> = {
  sofa: "/world/models/sofa.glb",
  "coffee-table": "/world/models/coffee-table.glb",
  "tv-stand": "/world/models/tv-stand.glb",
  rug: "/world/models/rug.glb",
  books: "/world/models/books.glb",
  cactus: "/world/models/cactus.glb",
};

export interface ModelPlacement {
  kind: LivingModel;
  /** Centre of the model's base. */
  center: Vec3;
  /** Width, height, depth before `yaw` (the model is stretched to it). */
  size: Vec3;
  /** Radians around +y; KayKit models face +z. */
  yaw: number;
  /** Stands on the floor (else it sits on another piece). */
  onFloor: boolean;
  /** Multiplies the pack's atlas colors: stays close to white. */
  tint: string;
  roughness: number;
  /** Wood grain: the house's plank maps, boards along the long side. */
  surface?: "planks";
  /** Original procedural normal (fabric weave), tiled in metres. */
  normal?: NormalPattern;
  normalScale?: number;
  tile?: number;
}

const BENCH = { z: MAIN_ROOM.z0 + 0.03 + 0.2, width: 1.3, depth: 0.4 };
const BENCH_TOP = Y0 + 0.45;
const RUG_T = 0.02;
const TABLE = { z: -1.28, top: Y0 + RUG_T + 0.38 };
const SOFA_Z = -0.33;

export const LIVING_MODELS: readonly ModelPlacement[] = [
  {
    kind: "tv-stand",
    center: [LX, Y0, BENCH.z],
    size: [BENCH.width, BENCH_TOP - Y0, BENCH.depth],
    yaw: 0,
    onFloor: true,
    tint: "#fff4e6",
    roughness: 0.7,
    surface: "planks",
  },
  {
    kind: "rug",
    center: [LX, Y0, -1.22],
    size: [1.9, RUG_T, 1.3],
    yaw: 0,
    onFloor: true,
    tint: "#fff3f4",
    roughness: 1,
    normal: "weave",
    normalScale: 0.7,
    tile: 0.05,
  },
  {
    kind: "coffee-table",
    center: [LX, Y0 + RUG_T, TABLE.z],
    size: [1, TABLE.top - Y0 - RUG_T, 0.56],
    yaw: 0,
    onFloor: true,
    tint: "#fff4e6",
    roughness: 0.7,
    surface: "planks",
  },
  {
    kind: "sofa",
    center: [LX, Y0, SOFA_Z],
    size: [1.7, 0.72, 0.86],
    // Its back to the front wall: seated, you face the TV.
    yaw: Math.PI,
    onFloor: true,
    tint: "#fbf4ff",
    roughness: 0.95,
    normal: "weave",
    normalScale: 0.5,
    tile: 0.03,
  },
  {
    kind: "books",
    center: [LX - 0.5, BENCH_TOP, -2.27],
    size: [0.26, 0.17, 0.12],
    yaw: 0,
    onFloor: false,
    tint: "#fffaf2",
    roughness: 0.85,
  },
  {
    kind: "cactus",
    center: [LX + 0.3, TABLE.top, -1.38],
    size: [0.12, 0.13, 0.12],
    yaw: 0.6,
    onFloor: false,
    tint: "#fffaf2",
    roughness: 0.8,
  },
];

/** Axis-aligned bounds of a placed model (yaw in quarter turns). */
export function modelBounds(model: ModelPlacement) {
  const quarter = Math.abs(Math.sin(model.yaw)) > 0.5;
  const [w, h, d] = model.size;
  const [hx, hz] = quarter ? [d / 2, w / 2] : [w / 2, d / 2];
  const [x, y, z] = model.center;
  return { x0: x - hx, x1: x + hx, y0: y, y1: y + h, z0: z - hz, z1: z + hz };
}

const rounded = (
  material: LivingMaterialId,
  item: LivingItem,
  radius: number,
  center: Vec3,
  size: Vec3,
  color: string,
  rotation?: Vec3,
  shade = 1,
): LivingPart => ({
  material,
  item,
  shape: "rounded",
  radius,
  center,
  size,
  color,
  shade,
  ...(rotation && { rotation }),
});

const round = (
  material: LivingMaterialId,
  item: LivingItem,
  center: Vec3,
  size: Vec3,
  color: string,
  rotation?: Vec3,
  shade = 1,
): LivingPart => ({
  material,
  item,
  shape: "round",
  center,
  size,
  color,
  shade,
  ...(rotation && { rotation }),
});

/** Axis of a "round" part laid along world z: a disc facing the room. */
const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0];

/** A point `[dx, dy, dz]` in a frame at `origin` turned `yaw` around +y. */
const local = (origin: Vec3, yaw: number, [dx, dy, dz]: Vec3): Vec3 => {
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return [
    origin[0] + dx * cos + dz * sin,
    origin[1] + dy,
    origin[2] - dx * sin + dz * cos,
  ];
};

const TV = { z: BENCH.z - 0.05, width: 1.04, height: 0.6, lift: 0.09 };

/** Thin-bezel flat TV on two feet, a deeper back housing and a game on screen. */
function tv(solid: LivingPart[], glow: LivingPart[]) {
  const C = LIVING_COLORS;
  const s = (center: Vec3, size: Vec3, color: string, r = 0.006, shade = 1) =>
    solid.push(
      rounded("satin", "tv", r, center, size, color, undefined, shade),
    );
  for (const side of [-1, 1]) {
    const x = LX + side * 0.34;
    s([x, BENCH_TOP + 0.007, TV.z + 0.02], [0.05, 0.014, 0.18], C.bezel, 0.006);
    s([x, BENCH_TOP + 0.052, TV.z], [0.028, 0.084, 0.022], C.bezel, 0.008);
  }
  const yc = BENCH_TOP + TV.lift + TV.height / 2;
  s([LX, yc, TV.z], [TV.width, TV.height, 0.03], C.bezel, 0.01);
  s([LX, yc - 0.03, TV.z - 0.035], [0.72, 0.42, 0.05], C.housing, 0.02);
  s([LX, yc - 0.03, TV.z - 0.061], [0.3, 0.02, 0.006], C.bezel, 0.002, 0.9);
  s(
    [LX, BENCH_TOP + TV.lift + 0.01, TV.z + 0.0155],
    [0.06, 0.008, 0.002],
    C.logo,
    0.001,
  );
  // The screen: 1 x 0.56 m inside a 2 cm bezel, showing a sunny platformer.
  const face = TV.z + 0.016;
  const bottom = BENCH_TOP + TV.lift + 0.02;
  const g = (center: Vec3, size: Vec3, color: string, r = 0.001) =>
    glow.push(rounded("satin", "tv", r, center, size, color));
  g([LX, bottom + 0.41, face], [1, 0.3, 0.002], C.sky);
  g([LX, bottom + 0.19, face], [1, 0.14, 0.002], C.hills);
  g([LX, bottom + 0.06, face], [1, 0.12, 0.002], C.ground);
  glow.push(
    round(
      "satin",
      "tv",
      [LX + 0.28, bottom + 0.44, face + 0.0015],
      [0.09, 0.002, 0.09],
      C.sun,
      ALONG_Z,
    ),
  );
  g(
    [LX - 0.12, bottom + 0.47, face + 0.0015],
    [0.14, 0.035, 0.002],
    C.cloud,
    0.0008,
  );
  g(
    [LX + 0.06, bottom + 0.5, face + 0.0015],
    [0.1, 0.03, 0.002],
    C.cloud,
    0.0008,
  );
  g(
    [LX - 0.2, bottom + 0.15, face + 0.0015],
    [0.04, 0.06, 0.002],
    C.hero,
    0.0008,
  );
  g(
    [LX - 0.38, bottom + 0.52, face + 0.0015],
    [0.18, 0.02, 0.002],
    C.hud,
    0.0008,
  );
}

/** Lying flat, spines toward the room: PS5-blue cases with coloured labels. */
function gameCases(solid: LivingPart[]) {
  const C = LIVING_COLORS;
  const origin: Vec3 = [LX + 0.5, BENCH_TOP, -2.27];
  const turns = [0.05, -0.08, 0.12, -0.03];
  C.labels.forEach((label, i) => {
    const yaw = turns[i];
    const y = 0.007 + i * 0.0145;
    const at = (d: Vec3) => local(origin, yaw, [d[0], y + d[1], d[2]]);
    const push = (
      d: Vec3,
      size: Vec3,
      color: string,
      r: number,
      role: string,
    ) =>
      solid.push({
        ...rounded("satin", "game-case", r, at(d), size, color, [0, yaw, 0]),
        group: `case-${i}`,
        role,
      });
    push([0, 0, 0], [0.17, 0.014, 0.135], C.caseBlue, 0.004, "case");
    // Cover art inset and the white PS5 header band on top.
    push([0.012, 0.0072, 0], [0.13, 0.002, 0.115], label, 0.0008, "cover");
    push(
      [-0.07, 0.0072, 0],
      [0.014, 0.002, 0.115],
      C.caseWhite,
      0.0008,
      "header",
    );
    // Spine: a coloured title strip and the white header block.
    push([0.012, 0, 0.0676], [0.12, 0.006, 0.002], label, 0.0008, "spine");
    push(
      [-0.07, 0, 0.0676],
      [0.018, 0.006, 0.002],
      C.caseWhite,
      0.0008,
      "spine",
    );
  });
}

/** DualSense-style controller on the coffee table, grips toward the sofa. */
function controller(solid: LivingPart[], glow: LivingPart[]) {
  const C = LIVING_COLORS;
  const origin: Vec3 = [LX - 0.2, TABLE.top, -1.18];
  const yaw = 0.35;
  const put = (
    list: LivingPart[],
    shape: "rounded" | "round",
    d: Vec3,
    size: Vec3,
    color: string,
    r: number,
    turn = 0,
    role = "body",
  ) => {
    const center = local(origin, yaw, d);
    const rotation: Vec3 = [0, yaw + turn, 0];
    const part =
      shape === "rounded"
        ? rounded("satin", "controller", r, center, size, color, rotation)
        : round("satin", "controller", center, size, color, rotation);
    list.push({ ...part, group: "dualsense", role });
  };
  // White shell, and each grip as three rounded pieces curving out and down.
  put(solid, "rounded", [0, 0.017, 0], [0.155, 0.03, 0.058], C.shell, 0.013);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++)
      put(
        solid,
        "rounded",
        [s * (0.052 + 0.009 * k), 0.016 - 0.002 * k, 0.03 + 0.02 * k],
        [0.044 - 0.004 * k, 0.03 - 0.003 * k, 0.034],
        C.shell,
        0.012,
        s * 0.3,
        "grip",
      );
    put(
      solid,
      "rounded",
      [s * 0.052, 0.024, -0.033],
      [0.032, 0.012, 0.014],
      C.shell,
      0.005,
      0,
      "shoulder",
    );
    put(
      solid,
      "round",
      [s * 0.021, 0.042, 0.016],
      [0.018, 0.012, 0.018],
      C.stick,
      0,
      0,
      "stick",
    );
    put(
      solid,
      "round",
      [s * 0.021, 0.049, 0.016],
      [0.022, 0.004, 0.022],
      C.touchpad,
      0,
      0,
      "stick",
    );
    put(
      solid,
      "rounded",
      [s * 0.036, 0.038, -0.026],
      [0.004, 0.003, 0.008],
      C.stick,
      0.001,
      0,
      "button",
    );
    // Light bar along both sides of the touchpad.
    put(
      glow,
      "rounded",
      [s * 0.031, 0.04, -0.01],
      [0.004, 0.004, 0.032],
      C.lightBar,
      0.0015,
      0,
      "light-bar",
    );
  }
  // Black centre with the touchpad, PS button, D-pad and face buttons.
  put(
    solid,
    "rounded",
    [0, 0.022, 0.004],
    [0.07, 0.03, 0.062],
    C.core,
    0.01,
    0,
    "core",
  );
  put(
    solid,
    "rounded",
    [0, 0.039, -0.01],
    [0.056, 0.006, 0.034],
    C.touchpad,
    0.003,
    0,
    "touchpad",
  );
  put(
    solid,
    "round",
    [0, 0.039, 0.027],
    [0.008, 0.004, 0.008],
    C.touchpad,
    0,
    0,
    "button",
  );
  put(
    solid,
    "rounded",
    [-0.055, 0.034, -0.006],
    [0.022, 0.005, 0.007],
    C.buttons,
    0.002,
    0,
    "d-pad",
  );
  put(
    solid,
    "rounded",
    [-0.055, 0.034, -0.006],
    [0.007, 0.005, 0.022],
    C.buttons,
    0.002,
    0,
    "d-pad",
  );
  for (const [dx, dz] of [
    [0, -0.01],
    [0.01, 0],
    [0, 0.01],
    [-0.01, 0],
  ])
    put(
      solid,
      "round",
      [0.055 + dx, 0.034, -0.006 + dz],
      [0.008, 0.005, 0.008],
      C.buttons,
      0,
      0,
      "button",
    );
}

/** Terracotta pot with a rim and soil, and a rosette of rounded leaves. */
function plant(
  solid: LivingPart[],
  id: string,
  x: number,
  z: number,
  seed: number,
) {
  const C = LIVING_COLORS;
  const random = seededRandom(seed);
  const s = 0.9;
  const push = (part: LivingPart, role: string) =>
    solid.push({ ...part, group: id, role });
  push(
    round(
      "ceramic",
      "plant",
      [x, Y0 + 0.04 * s, z],
      [0.18 * s, 0.08 * s, 0.18 * s],
      C.pot,
      undefined,
      0.92,
    ),
    "pot",
  );
  push(
    round(
      "ceramic",
      "plant",
      [x, Y0 + 0.145 * s, z],
      [0.21 * s, 0.13 * s, 0.21 * s],
      C.pot,
    ),
    "pot",
  );
  const top = Y0 + 0.21 * s;
  push(
    round(
      "ceramic",
      "plant",
      [x, top, z],
      [0.24 * s, 0.035 * s, 0.24 * s],
      C.rim,
    ),
    "rim",
  );
  push(
    round(
      "soil",
      "plant",
      [x, top + 0.012 * s, z],
      [0.2 * s, 0.012 * s, 0.2 * s],
      C.soil,
    ),
    "soil",
  );
  const count = 8 + Math.floor(random() * 6);
  for (let i = 0; i < count; i++) {
    // Ry(yaw) Rz(tilt): the leaf's long x axis rises `tilt` and points `yaw`.
    const yaw = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.5;
    const tilt = 0.6 + random() * 0.65;
    const length = (0.15 + random() * 0.08) * s;
    const dir: Vec3 = [
      Math.cos(yaw) * Math.cos(tilt),
      Math.sin(tilt),
      -Math.sin(yaw) * Math.cos(tilt),
    ];
    const base: Vec3 = [x + dir[0] * 0.02, top + 0.02 * s, z + dir[2] * 0.02];
    push(
      round(
        "leaf",
        "plant",
        [
          base[0] + (dir[0] * length) / 2,
          base[1] + (dir[1] * length) / 2,
          base[2] + (dir[2] * length) / 2,
        ],
        [length, 0.008 * s, length * 0.42],
        C.leaves[Math.floor(random() * C.leaves.length)],
        [0, yaw, tilt],
        0.92 + random() * 0.12,
      ),
      "leaf",
    );
  }
}

/** Plant spots: both back corners by the TV bench, and behind the sofa's end. */
const PLANTS: readonly [string, number, number][] = [
  ["plant-left", 1.87, BENCH.z],
  ["plant-right", 3.68, BENCH.z],
  ["plant-front", 3.68, 0.47],
];

export interface LivingMeshes {
  solid: LivingPart[];
  glow: LivingPart[];
}

/** Every original living-area part. */
export function livingMeshes(): LivingMeshes {
  const meshes: LivingMeshes = { solid: [], glow: [] };
  tv(meshes.solid, meshes.glow);
  gameCases(meshes.solid);
  controller(meshes.solid, meshes.glow);
  PLANTS.forEach(([id, x, z], i) => plant(meshes.solid, id, x, z, 31 + i));
  return meshes;
}

const sofa = LIVING_MODELS.find((model) => model.kind === "sofa");
if (!sofa) throw new Error("the living area needs a sofa");

export const LIVING = {
  tv: {
    center: [LX, BENCH_TOP + TV.lift + TV.height / 2, TV.z] as Vec3,
    facing: [0, 0, 1] as Vec3,
  },
  sofa: { center: sofa.center, facing: [0, 0, -1] as Vec3 },
} as const;

const living = livingMeshes();
const extents = [
  ...[...living.solid, ...living.glow].map(partBounds),
  ...LIVING_MODELS.map(modelBounds),
];

/** Everything the living area covers: clear of the setup and the corridor. */
export const LIVING_ZONE: Rect = {
  x0: Math.min(...extents.map((b) => b.x0)),
  x1: Math.max(...extents.map((b) => b.x1)),
  z0: Math.min(...extents.map((b) => b.z0)),
  z1: Math.max(...extents.map((b) => b.z1)),
};
if (LIVING_ZONE.x0 - SETUP_ZONE.x1 < 0.6)
  throw new Error("the corridor past the setup must stay 0.6 m wide");

const TABLE_BOUNDS = modelBounds(
  LIVING_MODELS.find((model) => model.kind === "coffee-table") ?? sofa,
);
const SOFA_BOUNDS = modelBounds(sofa);

/**
 * Baked ambient occlusion per vertex (setupOcclusion's pattern): darker near
 * the floor, on faces turned down, and under the coffee table and the TV
 * bench, so the pieces sit on the floor instead of floating.
 */
export function livingOcclusion(
  [x, y, z]: readonly [number, number, number],
  [, ny]: readonly [number, number, number],
): number {
  const h = Math.max(0, y - Y0);
  let ao = h >= 0.5 ? 1 : 1 - 0.35 * (1 - h / 0.5) ** 2;
  if (ny < -0.5) ao *= 0.8;
  const under = (b: ReturnType<typeof modelBounds>) =>
    x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y < b.y1 - 0.04;
  if (under(TABLE_BOUNDS) || under(SOFA_BOUNDS)) ao *= 0.85;
  return Math.max(ao, 0.5);
}

/** TV and light bar brightness: soft by day, brighter at night. */
export function livingGlow(hours: number): number {
  return 0.6 + 0.5 * worldLight(hours).stars;
}
