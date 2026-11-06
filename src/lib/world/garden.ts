// Front garden entrance (T7, S19, S20): wall lanterns beside the front door,
// at the garage door and on the back wall that light up with the night
// lights gate, a stone stepping path from the porch step into the garden,
// a decorative mailbox and the garden sign, whose face follows one typed
// status, GARDEN_SIGN.status (garden-sign T2: garden-sign.ts draws it).
// Pure numbers; Garden.tsx builds the meshes. No form, no network.

import { HOUSE, type Part, type Vec3, WALLS } from "./house.ts";
import { onPad, PAD } from "./island.ts";
import { KIND_SPECS, type NatureKind } from "./layout.ts";
import { nightLightsOn } from "./lights.ts";
import { seededRandom } from "./random.ts";
import type { SetupMaterial } from "./setup.ts";

/** Whether the owner takes new work: the sign's headline and lantern. */
export type SignStatus = "open" | "busy";

/**
 * The garden sign. Flip `status` to "busy" when not taking new projects:
 * the board then reads BACK SOON, the lantern turns amber and the card
 * says so (garden-sign.ts holds the copy).
 */
export const GARDEN_SIGN: {
  status: SignStatus;
  /** Board paint behind the letters, ink and the inner rule (sRGB hex). */
  board: string;
  ink: string;
  accent: string;
} = {
  status: "open",
  board: "#fff4e3",
  ink: "#2b211c",
  accent: "#b9675a",
};

/** PBR per garden material: one merged draw each. */
export const GARDEN_MATERIALS = {
  /** Stepping stones: rough, with a fine pitted normal. */
  stone: {
    roughness: 0.92,
    metalness: 0,
    normal: "noise",
    normalScale: 0.55,
    tile: [0.35, 0.35],
  },
  /** Mailbox post and sign: the house's plank texture when the maps load. */
  wood: { roughness: 0.85, metalness: 0, surface: "planks" },
  /** Mailbox enamel and its flag. */
  paint: {
    roughness: 0.42,
    metalness: 0.1,
    normal: "noise",
    normalScale: 0.05,
    tile: [0.3, 0.3],
  },
  /** Dark bronze lantern frames, mailbox slot. */
  iron: {
    roughness: 0.5,
    metalness: 0.45,
    normal: "noise",
    normalScale: 0.12,
    tile: [0.08, 0.08],
  },
  /** Finials, sockets, handle, screws. */
  brass: { roughness: 0.32, metalness: 0.85 },
} as const satisfies Record<string, SetupMaterial>;

export type GardenMaterialId = keyof typeof GARDEN_MATERIALS;
export type GardenPart = Part & { material: GardenMaterialId; role: string };

export const GARDEN_COLORS = {
  iron: "#3d3532",
  brass: "#d9a95b",
  /** The front door's sage green, so the mailbox belongs to the house. */
  mailbox: "#8fbfae",
  /** The roof coral. */
  flag: "#e08b78",
  post: "#c98d62",
  board: "#eabd8e",
  cap: "#b9675a",
  slot: "#2a2523",
  stone: "#cfc6ba",
  glass: "#fff3dc",
  bulbOff: "#d9d4ce",
  /** Warm 2700 K-ish lamp light. */
  light: "#ffc27a",
} as const;

/** Sides of the garden's cylinders. */
export const GARDEN_ROUND_SEGMENTS = 16;

const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0];
const ALONG_X: Vec3 = [0, 0, Math.PI / 2];

const piece = (
  role: string,
  material: GardenMaterialId,
  shape: "round" | "rounded",
  center: Vec3,
  size: Vec3,
  color: string,
  options: { radius?: number; rotation?: Vec3; shade?: number } = {},
): GardenPart => ({
  role,
  material,
  shape,
  center,
  size,
  color,
  shade: options.shade ?? 1,
  ...(shape === "rounded" && { radius: options.radius ?? 0.01 }),
  ...(options.rotation && { rotation: options.rotation }),
});

/* ------------------------------------------------------------------ */
/* Lanterns                                                            */
/* ------------------------------------------------------------------ */

export const LANTERN_IDS = [
  "lanternLeft",
  "lanternRight",
  "lanternGarage",
  "lanternBack",
] as const;
export type LanternId = (typeof LANTERN_IDS)[number];

/**
 * On (1) from 18:00 through 05:59, off (0) by day: the S17 gate, no settings.
 * The scene panel's master `power` switches them off too.
 */
export function lanternLevel(hours: number, power = true): number {
  return power && nightLightsOn(hours) ? 1 : 0;
}

const FLOOR = HOUSE.floorY;
/** Door middle (front wall door spans x 0.14-0.86): lanterns sit 0.54 m out. */
const DOOR_MID = 0.5;

/** Walls along x that carry a lantern; each is also its cutaway group. */
export type LanternWall = "main-front" | "garage-front" | "main-back";

export interface LanternMount {
  wall: LanternWall;
  /** World x along the wall. */
  u: number;
  /** How much lower than the front pair it hangs (under the low garage eave). */
  drop: number;
  /** How far out from the wall the spot meets the ground. */
  reach: number;
  /** Extra distance out from the plank face: a corner post's front. */
  out: number;
  /** Size of the shared lantern body, 1 at the front door. */
  scale: number;
  /** World x, z the spot aims at, when not square out of the wall. */
  aim?: [number, number];
}

const DOOR_MOUNT = { drop: 0, reach: 1.6, out: 0, scale: 1 } as const;

export const LANTERN_MOUNTS: Record<LanternId, LanternMount> = {
  lanternLeft: { wall: "main-front", u: DOOR_MID - 0.54, ...DOOR_MOUNT },
  lanternRight: { wall: "main-front", u: DOOR_MID + 0.54, ...DOOR_MOUNT },
  // On the front face of the garage's outer corner post (0.24 m round,
  // 0.05 m proud of the planks), at 0.8 scale so the cage clears the
  // garage door trim; aimed out across the apron in front of the door, near
  // its outer edge, wherever the garage reaches (dream-truck T1 grew it).
  lanternGarage: {
    wall: "garage-front",
    u: HOUSE.garage.x0 + HOUSE.wall / 2,
    drop: 0.05,
    reach: 0.8,
    out: 0.12 - HOUSE.wall / 2,
    scale: 0.8,
    aim: [(HOUSE.driveway.x0 + HOUSE.driveway.x1) / 2, HOUSE.driveway.z1 - 0.1],
  },
  // Between the two back windows.
  lanternBack: { wall: "main-back", u: 0.55, ...DOOR_MOUNT },
};

/** Carriage lantern, heights above the floor; `out` is the body's distance from the wall. */
export const LANTERN = {
  out: 0.14,
  arm: 1.2,
  glass: { y: 1.345, size: [0.11, 0.19, 0.11] as Vec3 },
  bulb: { y: 1.32, radius: 0.024 },
} as const;

/**
 * Lantern frame on its wall: `u` along it, the outer plank face, and `side`,
 * the outward direction (+z on front walls, -z at the back).
 */
function lanternFrame(id: LanternId) {
  const mount = LANTERN_MOUNTS[id];
  const wall = WALLS.find((w) => w.id === mount.wall);
  if (!wall || wall.axis !== "x") throw new Error(`no wall ${mount.wall}`);
  const face = wall.at + (wall.side * HOUSE.wall) / 2;
  const { side } = wall;
  const s = mount.scale;
  /** Local (along, up from the floor, out of the wall) to world, scaled. */
  const at = ([x, y, z]: Vec3): Vec3 => [
    mount.u + side * x * s,
    FLOOR - mount.drop + y * s,
    face + side * (mount.out + z * s),
  ];
  return { face, side, at, scale: s };
}

export interface LanternFixture {
  /** Bulb center. */
  position: Vec3;
  /** Point on the ground the spot faces: out and down, never into the house. */
  target: Vec3;
  /** Cone half-angle and soft edge: a wide lantern spill. */
  angle: number;
  penumbra: number;
  /** Candela when on: twice the first pass (0.85), so the porch reads lit. */
  intensity: number;
  /** Metres to zero: the porch, path start and sign, not the island. */
  distance: number;
  decay: 2;
  castShadow: false;
}

const lanternFixture = (id: LanternId): LanternFixture => {
  const { at, scale } = lanternFrame(id);
  const { aim, reach } = LANTERN_MOUNTS[id];
  const position = at([0, LANTERN.bulb.y, LANTERN.out]);
  const ground = at([0, 0, reach / scale]);
  return {
    position,
    target: aim ? [aim[0], 0, aim[1]] : [ground[0], 0, ground[2]],
    angle: 1.0,
    penumbra: 0.7,
    intensity: 1.7,
    distance: 3.2,
    decay: 2,
    castShadow: false,
  };
};

export const LANTERN_FIXTURES: Record<LanternId, LanternFixture> = {
  lanternLeft: lanternFixture("lanternLeft"),
  lanternRight: lanternFixture("lanternRight"),
  lanternGarage: lanternFixture("lanternGarage"),
  lanternBack: lanternFixture("lanternBack"),
};

/**
 * One wall lantern: backplate, arm and diagonal brace, a square bronze cage
 * on a pan with a drip ball, corner posts and bands around the glass, a
 * stepped round hood with a brass finial, and the bulb socket. Glass and
 * bulb are separate meshes. Built against a front wall (out is +z), then
 * turned onto its own wall: tilts about x flip with the outward side.
 */
export function lanternParts(id: LanternId): GardenPart[] {
  const { at, side, scale } = lanternFrame(id);
  const z = LANTERN.out;
  const { iron, brass } = GARDEN_COLORS;
  const parts: GardenPart[] = [
    piece(
      "backplate",
      "iron",
      "rounded",
      [0, 1.3, 0.022],
      [0.09, 0.22, 0.02],
      iron,
      { radius: 0.009 },
    ),
    piece(
      "boss",
      "brass",
      "round",
      [0, LANTERN.arm, 0.036],
      [0.032, 0.012, 0.032],
      brass,
      { rotation: ALONG_Z },
    ),
    piece(
      "arm",
      "iron",
      "round",
      [0, LANTERN.arm, (0.03 + z) / 2],
      [0.024, z - 0.03, 0.024],
      iron,
      { rotation: ALONG_Z },
    ),
    piece(
      "brace",
      "iron",
      "rounded",
      [0, 1.1475, 0.065],
      [0.014, 0.014, 0.118],
      iron,
      { radius: 0.006, rotation: [-0.936, 0, 0] },
    ),
    piece("pan", "iron", "rounded", [0, 1.225, z], [0.14, 0.03, 0.14], iron, {
      radius: 0.012,
    }),
    piece("drip", "brass", "round", [0, 1.198, z], [0.03, 0.025, 0.03], brass),
    piece("band", "iron", "rounded", [0, 1.247, z], [0.13, 0.014, 0.13], iron, {
      radius: 0.006,
    }),
    piece(
      "band",
      "iron",
      "rounded",
      [0, 1.445, z],
      [0.135, 0.02, 0.135],
      iron,
      {
        radius: 0.008,
      },
    ),
    piece("hood", "iron", "round", [0, 1.465, z], [0.17, 0.022, 0.17], iron),
    piece("hood", "iron", "round", [0, 1.49, z], [0.12, 0.03, 0.12], iron, {
      shade: 1.05,
    }),
    piece("hood", "iron", "round", [0, 1.517, z], [0.07, 0.025, 0.07], iron),
    piece(
      "finial",
      "brass",
      "round",
      [0, 1.548, z],
      [0.022, 0.04, 0.022],
      brass,
    ),
    piece(
      "finial",
      "brass",
      "round",
      [0, 1.574, z],
      [0.034, 0.014, 0.034],
      brass,
    ),
    piece("socket", "brass", "round", [0, 1.275, z], [0.03, 0.04, 0.03], brass),
  ];
  for (const dx of [-0.055, 0.055])
    for (const dz of [-0.055, 0.055])
      parts.push(
        piece(
          "post",
          "iron",
          "rounded",
          [dx, 1.345, z + dz],
          [0.016, 0.2, 0.016],
          iron,
          { radius: 0.005 },
        ),
      );
  // A half turn about y: x and z mirror, and a tilt about x reverses.
  return parts.map((part) => ({
    ...part,
    center: at(part.center),
    size: part.size.map((v) => v * scale) as Vec3,
    ...(part.radius !== undefined && { radius: part.radius * scale }),
    ...(part.rotation && {
      rotation: [side * part.rotation[0], 0, 0] as Vec3,
    }),
  }));
}

/** Glass box of a lantern, world space. */
export function lanternGlass(id: LanternId): { center: Vec3; size: Vec3 } {
  const { at, scale } = lanternFrame(id);
  return {
    center: at([0, LANTERN.glass.y, LANTERN.out]),
    size: LANTERN.glass.size.map((v) => v * scale) as Vec3,
  };
}

/* ------------------------------------------------------------------ */
/* Stepping path                                                       */
/* ------------------------------------------------------------------ */

/**
 * Beveled slab: rings around the outline from a tucked-in foot, out to the
 * `bevel` waist, back in over a rounded shoulder to a slightly domed top.
 */
export const STONE = {
  /** How far the waist grows past the outline. */
  bevel: 0.018,
  height: 0.053,
  /** Outline points per stone. */
  points: 14,
  /** Sunk this far into the ground: seated, never floating. */
  sink: 0.008,
  /** (offset past the outline, height above the bottom) per ring. */
  rings: [
    [-0.012, 0],
    [0.018, 0.014],
    [0.018, 0.028],
    [0, 0.043],
    [-0.03, 0.05],
  ] as const,
} as const;

/** Ground height: the pad's top on the pad, the grass (0) elsewhere. */
export function groundY(x: number, z: number): number {
  return onPad(x, z) ? PAD.height : 0;
}

export interface PathStone {
  /** World x, z. */
  center: [number, number];
  /** Half extents of the irregular outline before rotation. */
  size: [number, number];
  rotationY: number;
  /** Bottom of the stone. */
  y: number;
  seed: number;
  shade: number;
}

// A gentle S-curve from the porch step toward the front-right lawn, where
// the island's older trail continues to the rim.
const STONES: readonly [number, number, number, number, number, number][] = [
  // x, z, half width, half depth, turn, shade
  // Moved out with the porch (T10): z from 1.7..3.8 to 2.37..4.2, x kept;
  // the first sits 2 cm past the planned 2.35 so its outline clears the
  // pad's new front edge (2.2) instead of straddling it.
  [0.5, 2.37, 0.2, 0.15, 0.15, 1],
  [0.66, 2.85, 0.21, 0.17, -0.3, 0.95],
  [1.02, 3.25, 0.23, 0.17, 0.5, 1.03],
  [1.48, 3.6, 0.2, 0.16, -0.2, 0.97],
  [1.97, 3.9, 0.22, 0.17, 0.35, 1.01],
  [2.46, 4.2, 0.19, 0.15, -0.1, 0.94],
];

export const PATH_STONES: readonly PathStone[] = STONES.map(
  ([x, z, a, b, rotationY, shade], i) => ({
    center: [x, z],
    size: [a, b],
    rotationY,
    y: groundY(x, z) - STONE.sink,
    seed: 31 + i * 7,
    shade,
  }),
);

/**
 * Irregular rounded outline of a stone in world x, z: points around an
 * ellipse at seeded angles and radii (86-100 % of its size), turned by its
 * rotation. Counter-clockwise from +x toward +z, like the island outline.
 */
export function stoneOutline(stone: PathStone): [number, number][] {
  const random = seededRandom(stone.seed);
  const n = STONE.points;
  const [a, b] = stone.size;
  const cos = Math.cos(stone.rotationY);
  const sin = Math.sin(stone.rotationY);
  return Array.from({ length: n }, (_, i) => {
    const angle = ((i + (random() - 0.5) * 0.5) / n) * Math.PI * 2;
    const scale = 0.86 + random() * 0.14;
    const lx = Math.cos(angle) * a * scale;
    const lz = Math.sin(angle) * b * scale;
    return [
      stone.center[0] + lx * cos - lz * sin,
      stone.center[1] + lx * sin + lz * cos,
    ];
  });
}

export interface StoneMesh {
  positions: number[];
  indices: number[];
  /** Stone index of each vertex, for its shade. */
  stone: number[];
}

/**
 * Every stone as one indexed mesh, outward facing (counter-clockwise from
 * outside): side rings, then a fan to the domed top center. Shared vertices,
 * so smooth normals round the bevel. Bottoms are open: they sit in the ground.
 */
export function pathMesh(
  stones: readonly PathStone[] = PATH_STONES,
): StoneMesh {
  const mesh: StoneMesh = { positions: [], indices: [], stone: [] };
  stones.forEach((stone, s) => {
    const outline = stoneOutline(stone);
    const [cx, cz] = stone.center;
    const n = outline.length;
    const base = mesh.positions.length / 3;
    for (const [offset, height] of STONE.rings)
      for (const [x, z] of outline) {
        const reach = Math.hypot(x - cx, z - cz);
        const k = 1 + offset / reach;
        mesh.positions.push(
          cx + (x - cx) * k,
          stone.y + height,
          cz + (z - cz) * k,
        );
        mesh.stone.push(s);
      }
    const top = mesh.positions.length / 3;
    mesh.positions.push(cx, stone.y + STONE.height, cz);
    mesh.stone.push(s);
    const rings = STONE.rings.length;
    for (let r = 0; r < rings - 1; r++)
      for (let i = 0; i < n; i++) {
        const a = base + r * n + i;
        const b = base + r * n + ((i + 1) % n);
        const c = a + n;
        const d = b + n;
        // Outline runs +x toward +z, clockwise seen from above.
        mesh.indices.push(a, c, b, b, c, d);
      }
    const last = base + (rings - 1) * n;
    for (let i = 0; i < n; i++)
      mesh.indices.push(last + i, top, last + ((i + 1) % n));
  });
  return mesh;
}

/* ------------------------------------------------------------------ */
/* Mailbox and sign                                                    */
/* ------------------------------------------------------------------ */

export interface GardenProp {
  /** World x, z of the base. */
  position: [number, number];
  /** Turn about y: 0 keeps it square to the front facade (+z). */
  rotationY: number;
  /** Footprint radius, for spacing and clearing nature. */
  radius: number;
}

export const GARDEN_PROPS: { mailbox: GardenProp; sign: GardenProp } = {
  mailbox: { position: [-0.05, 2.55], rotationY: 0, radius: 0.28 },
  // 0.22 m further out than T7 (2.48): its footprint stays off the pad,
  // whose front edge moved from 2 to 2.2 (T10).
  sign: { position: [1.72, 2.7], rotationY: 0, radius: 0.45 },
};

/**
 * Decorative mailbox, base at the origin and door toward +z: a planted post
 * with a ground collar, a support plate on two braces, the body with a round
 * hood, an arched door with a letter slot and brass pull, and a raised flag.
 */
export function mailboxParts(): GardenPart[] {
  const C = GARDEN_COLORS;
  return [
    piece("post", "wood", "rounded", [0, 0.43, 0], [0.08, 0.98, 0.08], C.post, {
      radius: 0.012,
    }),
    piece(
      "post",
      "wood",
      "rounded",
      [0, 0.005, 0],
      [0.12, 0.04, 0.12],
      C.post,
      { radius: 0.012, shade: 0.85 },
    ),
    piece(
      "support",
      "wood",
      "rounded",
      [0, 0.935, 0],
      [0.14, 0.03, 0.36],
      C.post,
      { radius: 0.01, shade: 0.92 },
    ),
    piece(
      "support",
      "wood",
      "rounded",
      [0, 0.86, 0.095],
      [0.03, 0.03, 0.163],
      C.post,
      { radius: 0.008, rotation: [-0.829, 0, 0], shade: 0.9 },
    ),
    piece(
      "support",
      "wood",
      "rounded",
      [0, 0.86, -0.095],
      [0.03, 0.03, 0.163],
      C.post,
      { radius: 0.008, rotation: [0.829, 0, 0], shade: 0.9 },
    ),
    piece("body", "paint", "rounded", [0, 1, 0], [0.19, 0.1, 0.4], C.mailbox, {
      radius: 0.02,
    }),
    piece(
      "hood",
      "paint",
      "round",
      [0, 1.05, 0],
      [0.19, 0.4, 0.19],
      C.mailbox,
      {
        rotation: ALONG_Z,
      },
    ),
    piece(
      "door",
      "paint",
      "rounded",
      [0, 1, 0.205],
      [0.18, 0.1, 0.016],
      C.mailbox,
      { radius: 0.006, shade: 0.9 },
    ),
    piece(
      "door",
      "paint",
      "round",
      [0, 1.05, 0.205],
      [0.18, 0.016, 0.18],
      C.mailbox,
      { rotation: ALONG_Z, shade: 0.9 },
    ),
    piece(
      "slot",
      "iron",
      "rounded",
      [0, 1.06, 0.216],
      [0.1, 0.014, 0.01],
      C.slot,
      { radius: 0.004 },
    ),
    piece(
      "handle",
      "brass",
      "round",
      [0, 0.985, 0.222],
      [0.02, 0.03, 0.02],
      C.brass,
      { rotation: ALONG_Z },
    ),
    piece(
      "flag",
      "brass",
      "round",
      [0.105, 1, -0.08],
      [0.03, 0.02, 0.03],
      C.brass,
      { rotation: ALONG_X },
    ),
    piece(
      "flag",
      "paint",
      "rounded",
      [0.11, 1.09, -0.08],
      [0.012, 0.2, 0.022],
      C.flag,
      { radius: 0.004 },
    ),
    piece(
      "flag",
      "paint",
      "rounded",
      [0.11, 1.155, -0.04],
      [0.012, 0.07, 0.1],
      C.flag,
      { radius: 0.006 },
    ),
  ];
}

/** The painted text panel on the sign's front, local to the sign. */
export const SIGN_PANEL = {
  width: 0.66,
  height: 0.3,
  center: [0, 0.62, 0.0215] as Vec3,
} as const;

/**
 * The status lantern on its bracket from the right post (garden-sign T2),
 * local to the sign: an iron arm, a small cage with a brass finial under
 * it, the glass (a separate, emissive mesh) and its soft night light at the
 * glass. It stays inside the sign's footprint radius.
 */
export const SIGN_LANTERN = {
  bracket: {
    center: [0.386, 0.36, 0] as Vec3,
    size: [0.088, 0.016, 0.018] as Vec3,
  },
  body: {
    center: [0.405, 0.27, 0] as Vec3,
    size: [0.085, 0.144, 0.085] as Vec3,
  },
  glass: {
    center: [0.405, 0.27, 0] as Vec3,
    size: [0.064, 0.108, 0.064] as Vec3,
  },
  light: { intensity: 0.6, distance: 1.6, decay: 2 },
} as const;

/** The lantern's iron cage and brass finial, hung from the bracket. */
function signLanternParts(): GardenPart[] {
  const C = GARDEN_COLORS;
  const { bracket, body, glass } = SIGN_LANTERN;
  const [x, y, z] = body.center;
  const half = body.size[1] / 2;
  const rail = 0.014;
  const corner = (glass.size[0] + 0.008) / 2;
  const parts: GardenPart[] = [
    piece(
      "lantern-bracket",
      "iron",
      "rounded",
      bracket.center,
      bracket.size,
      C.iron,
      {
        radius: 0.004,
      },
    ),
    piece(
      "lantern-frame",
      "iron",
      "rounded",
      [x, y + half - rail / 2, z],
      [body.size[0], rail, body.size[2]],
      C.iron,
      {
        radius: 0.004,
      },
    ),
    piece(
      "lantern-frame",
      "iron",
      "rounded",
      [x, y - half + rail / 2, z],
      [body.size[0], rail, body.size[2]],
      C.iron,
      {
        radius: 0.004,
      },
    ),
    piece(
      "lantern-finial",
      "brass",
      "round",
      [x, y + half + 0.006, z],
      [0.018, 0.012, 0.018],
      C.brass,
    ),
  ];
  for (const dx of [-corner, corner])
    for (const dz of [-corner, corner])
      parts.push(
        piece(
          "lantern-frame",
          "iron",
          "rounded",
          [x + dx, y, z + dz],
          [0.008, body.size[1] - 2 * rail, 0.008],
          C.iron,
          {
            radius: 0.002,
          },
        ),
      );
  return parts;
}

/**
 * Garden sign, base at the origin and facing +z: two planted posts, a board
 * with a raised frame and brass screws, a small cap on top and the status
 * lantern on its bracket. The face (a canvas texture) is a separate plane.
 */
export function signParts(): GardenPart[] {
  const C = GARDEN_COLORS;
  const parts: GardenPart[] = [];
  for (const x of [-0.31, 0.31])
    parts.push(
      piece(
        "post",
        "wood",
        "rounded",
        [x, 0.405, 0],
        [0.065, 0.97, 0.065],
        C.post,
        {
          radius: 0.012,
        },
      ),
    );
  parts.push(
    piece(
      "board",
      "wood",
      "rounded",
      [0, 0.62, 0],
      [0.74, 0.38, 0.04],
      C.board,
      {
        radius: 0.015,
        shade: 0.95,
      },
    ),
    piece(
      "frame",
      "wood",
      "rounded",
      [0, 0.81, 0.005],
      [0.76, 0.04, 0.06],
      C.post,
      {
        radius: 0.01,
        shade: 0.85,
      },
    ),
    piece(
      "frame",
      "wood",
      "rounded",
      [0, 0.43, 0.005],
      [0.76, 0.04, 0.06],
      C.post,
      {
        radius: 0.01,
        shade: 0.85,
      },
    ),
    piece(
      "frame",
      "wood",
      "rounded",
      [-0.36, 0.62, 0.005],
      [0.04, 0.38, 0.06],
      C.post,
      {
        radius: 0.01,
        shade: 0.85,
      },
    ),
    piece(
      "frame",
      "wood",
      "rounded",
      [0.36, 0.62, 0.005],
      [0.04, 0.38, 0.06],
      C.post,
      {
        radius: 0.01,
        shade: 0.85,
      },
    ),
    piece("cap", "wood", "rounded", [0, 0.905, 0], [0.84, 0.035, 0.11], C.cap, {
      radius: 0.015,
    }),
  );
  for (const x of [-0.36, 0.36])
    for (const y of [0.43, 0.81])
      parts.push(
        piece(
          "screw",
          "brass",
          "round",
          [x, y, 0.037],
          [0.018, 0.008, 0.018],
          C.brass,
          {
            rotation: ALONG_Z,
          },
        ),
      );
  parts.push(...signLanternParts());
  return parts;
}

/** Every garden part (props in their local frames), for material checks. */
export function gardenParts(): GardenPart[] {
  return [
    ...LANTERN_IDS.flatMap(lanternParts),
    ...mailboxParts(),
    ...signParts(),
  ];
}

/* ------------------------------------------------------------------ */
/* Clearing the nature layout                                          */
/* ------------------------------------------------------------------ */

export interface Footprint {
  x: number;
  z: number;
  radius: number;
}

/** Circles around every stone and prop. */
export const GARDEN_FOOTPRINTS: readonly Footprint[] = [
  ...PATH_STONES.map((stone) => ({
    x: stone.center[0],
    z: stone.center[1],
    radius: Math.max(...stone.size) + STONE.bevel,
  })),
  ...Object.values(GARDEN_PROPS).map((prop) => ({
    x: prop.position[0],
    z: prop.position[1],
    radius: prop.radius,
  })),
];

const GAP = 0.05;

/**
 * `items` without those whose footprint meets a stone or prop. Nature items
 * use their kind's footprint (the flowers' 0.6 share); others `radius`.
 */
export function clearOfGarden<
  T extends {
    position: readonly [number, number, number];
    kind?: NatureKind;
    scale?: number;
  },
>(items: T[], radius = 0): T[] {
  return items.filter((item) => {
    const reach = item.kind
      ? KIND_SPECS[item.kind].radius * (item.scale ?? 1) * 0.6
      : radius;
    return GARDEN_FOOTPRINTS.every(
      (f) =>
        Math.hypot(item.position[0] - f.x, item.position[2] - f.z) >=
        f.radius + reach + GAP,
    );
  });
}
