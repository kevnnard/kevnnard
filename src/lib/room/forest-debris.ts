// Seeded forest-floor debris (fallen logs, stumps, single mossy rocks) along
// the lower edges of the home view and in clumps beside it. Pure layout:
// tested without WebGL.
import {
  forestTrees,
  seeded,
  terrainHeight,
  WALK_DISC,
  WORLD,
} from "./forest-layout.ts";
import { hidesRoom, VIEW_ZONE, viewPoint, type XZ } from "./forest-view.ts";
import { PLOT } from "./house-layout.ts";

export type DebrisKind = "log" | "stump" | "rock";

export interface DebrisModel {
  /** Node name in the shipped GLB. */
  node: string;
  /** Source extents in metres (x, y, z), as recorded in the manifest. */
  size: readonly number[];
}

export const DEBRIS_URLS = {
  log: "/models/forest-debris/log.glb",
  stump: "/models/forest-debris/stump.glb",
  rock: "/models/forest-debris/rocks.glb",
} as const;

export const DEBRIS_MODELS: Record<DebrisKind, readonly DebrisModel[]> = {
  log: [{ node: "dead_tree_trunk_02", size: [4.0514, 1.0551, 1.0561] }],
  stump: [{ node: "tree_stump_01", size: [1.4256, 0.5727, 1.5903] }],
  rock: [
    { node: "rock_moss_set_01_rock01", size: [2.2376, 1.4727, 3.3688] },
    { node: "rock_moss_set_01_rock02", size: [2.6554, 1.262, 3.2637] },
    { node: "rock_moss_set_01_rock03", size: [2.1086, 1.0997, 2.0796] },
    { node: "rock_moss_set_01_rock04", size: [2.1276, 1.7683, 1.9647] },
    { node: "rock_moss_set_01_rock05", size: [1.8173, 1.2055, 2.9987] },
    { node: "rock_moss_set_01_rock06", size: [2.126, 1.2619, 2.7573] },
  ],
};

export interface DebrisPiece {
  kind: DebrisKind;
  variant: number;
  x: number;
  /** Terrain top under the piece; the model's lowest point before burial. */
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Fraction of the scaled model height sunk below the terrain top. */
  burial: number;
}

/** Conservative ground radius: half the scaled XZ diagonal, any yaw. */
export function debrisFootprint(
  piece: Pick<DebrisPiece, "kind" | "variant" | "scale">,
) {
  const [x, , z] = DEBRIS_MODELS[piece.kind][piece.variant].size;
  return (Math.hypot(x, z) / 2) * piece.scale;
}

/**
 * Lowest and highest rendered terrain under a piece's whole footprint
 * (center, 8 points halfway out and 16 on its ground radius), in world units.
 */
export function footprintGround(
  piece: Pick<DebrisPiece, "kind" | "variant" | "scale" | "x" | "z">,
) {
  const reach = debrisFootprint(piece);
  const heights = [terrainHeight(piece.x, piece.z)];
  for (let i = 0; i < 16; i++)
    for (const r of i % 2 ? [reach] : [reach / 2, reach]) {
      const angle = (i / 16) * Math.PI * 2;
      heights.push(
        terrainHeight(
          piece.x + Math.cos(angle) * r,
          piece.z + Math.sin(angle) * r,
        ),
      );
    }
  return {
    low: WORLD.groundY + Math.min(...heights),
    high: WORLD.groundY + Math.max(...heights),
  };
}

/** Steepest terrain relief under a piece, as a share of its scaled height. */
const MAX_RELIEF = 0.35;

/** World height of the piece's highest point once partly buried. */
export function debrisTop(
  piece: Pick<DebrisPiece, "kind" | "variant" | "scale" | "burial" | "y">,
) {
  const height = DEBRIS_MODELS[piece.kind][piece.variant].size[1];
  return piece.y + height * piece.scale * (1 - piece.burial);
}

const RANGES: Record<
  DebrisKind,
  { scale: [number, number]; burial: [number, number] }
> = {
  log: { scale: [0.8, 1.05], burial: [0.18, 0.3] },
  stump: { scale: [0.85, 1.15], burial: [0.08, 0.15] },
  rock: { scale: [0.28, 0.7], burial: [0.2, 0.45] },
};

// Foreground pieces in view units (`depth` toward the room, `side` to its
// right, as the framing trees): boulders and a stump along the lower edges
// of the home view, at their real scanned sizes. Each takes the nearest legal
// spot around its anchor.
const FOREGROUND: readonly (Omit<DebrisPiece, "x" | "y" | "z"> & {
  depth: number;
  side: number;
})[] = [
  {
    kind: "rock",
    variant: 0,
    depth: 5.5,
    side: -5.5,
    yaw: 0.6,
    scale: 0.7,
    burial: 0.3,
  },
  {
    kind: "rock",
    variant: 2,
    depth: 8,
    side: -3,
    yaw: 2.4,
    scale: 0.6,
    burial: 0.25,
  },
  {
    kind: "rock",
    variant: 3,
    depth: 7,
    side: 2.4,
    yaw: 1.1,
    scale: 0.55,
    burial: 0.3,
  },
  {
    kind: "rock",
    variant: 4,
    depth: 11.5,
    side: -7,
    yaw: 4.1,
    scale: 0.6,
    burial: 0.3,
  },
  {
    kind: "stump",
    variant: 0,
    depth: 9.5,
    side: -4.6,
    yaw: 3.7,
    scale: 1,
    burial: 0.1,
  },
];
// Nearest-first offsets tried around each foreground anchor, in view units.
const NUDGES: readonly XZ[] = [
  [0, 0],
  ...Array.from({ length: 48 }, (_, i): XZ => {
    const ring = 0.4 * (1 + Math.floor(i / 8));
    const angle = (i % 8) * (Math.PI / 4);
    return [Math.cos(angle) * ring, Math.sin(angle) * ring];
  }),
];

// Midground clumps beside the view, around the zone and on the foothill toe
// behind it, each led by a log or stump with rocks gathered round it.
const CLUMPS: readonly { depth: number; side: number; kinds: DebrisKind[] }[] =
  [
    { depth: 14, side: -6, kinds: ["log", "rock", "rock", "rock"] },
    { depth: 20, side: -14, kinds: ["stump", "rock", "rock", "rock"] },
    { depth: 1, side: 8, kinds: ["log", "rock", "rock", "rock"] },
    { depth: -5, side: -8, kinds: ["log", "rock", "rock"] },
    { depth: 6, side: 12, kinds: ["log", "rock", "rock"] },
    { depth: -9, side: 3, kinds: ["stump", "rock", "rock"] },
  ];

/** Fixed seed: identical on every mount, clock tick and camera move. */
export function forestDebris(trees = forestTrees()): DebrisPiece[] {
  const random = seeded(2741);
  const between = ([low, high]: [number, number]) =>
    low + random() * (high - low);
  const pieces: DebrisPiece[] = [];
  const [hx, hz] = VIEW_ZONE.home;
  const fits = (piece: DebrisPiece) => {
    const reach = debrisFootprint(piece);
    const { x, z } = piece;
    const { low, high } = footprintGround(piece);
    const height = DEBRIS_MODELS[piece.kind][piece.variant].size[1];
    return (
      // Only on locally even ground, so the uphill side is not swallowed.
      high - low <= height * piece.scale * MAX_RELIEF &&
      Math.hypot(x - hx, z - hz) <= 40 &&
      Math.hypot(x - WALK_DISC.x, z - WALK_DISC.z) - reach >
        WALK_DISC.radius + 0.5 &&
      (x + reach < PLOT.min[0] - 0.3 ||
        x - reach > PLOT.max[0] + 0.3 ||
        z + reach < PLOT.min[2] - 0.3 ||
        z - reach > PLOT.max[2] + 0.3) &&
      !hidesRoom(x, z, reach, debrisTop(piece)) &&
      trees.every((tree) => Math.hypot(tree.x - x, tree.z - z) > reach + 1.2) &&
      pieces.every(
        (other) =>
          Math.hypot(other.x - x, other.z - z) >
          reach + debrisFootprint(other) + 0.15,
      )
    );
  };
  // Rest on the lowest terrain under the footprint: never floating on a
  // slope, partly buried on its uphill side.
  const ground = (piece: Omit<DebrisPiece, "y">): DebrisPiece => ({
    ...piece,
    y: footprintGround(piece).low,
  });
  for (const { depth, side, ...rest } of FOREGROUND)
    for (const [dd, ds] of NUDGES) {
      const [x, z] = viewPoint(depth + dd, side + ds);
      const piece = ground({ ...rest, x, z });
      if (fits(piece)) {
        pieces.push(piece);
        break;
      }
    }
  let rock = 0;
  for (const { depth, side, kinds } of CLUMPS) {
    const [cx, cz] = viewPoint(depth, side);
    for (const kind of kinds) {
      const variant = kind === "rock" ? rock++ % DEBRIS_MODELS.rock.length : 0;
      for (let attempt = 0; attempt < 80; attempt++) {
        const a = random() * Math.PI * 2;
        const d = attempt === 0 && kind !== "rock" ? 0 : 2 + random() * 3.5;
        const x = cx + Math.cos(a) * d;
        const z = cz + Math.sin(a) * d;
        const piece = ground({
          kind,
          variant,
          x,
          z,
          yaw: random() * Math.PI * 2,
          scale: between(RANGES[kind].scale),
          burial: between(RANGES[kind].burial),
        });
        if (fits(piece)) {
          pieces.push(piece);
          break;
        }
      }
    }
  }
  return pieces;
}
