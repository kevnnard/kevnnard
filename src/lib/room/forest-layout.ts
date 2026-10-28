import { hidesRoom, VIEW_ZONE, viewPoint } from "./forest-view.ts";
import { PLOT } from "./house-layout.ts";

// Scenery never contributes to home framing or camera target boundaries.
export const WORLD = {
  size: 2400,
  far: 700,
  fogStart: 85,
  // Far enough that the mountain bowl (135-360) keeps its relief.
  fogEnd: 480,
  // Bury the floating slab's soil edge without fighting its lawn surface.
  groundY: -0.16,
} as const;

export interface ForestTree {
  x: number;
  z: number;
  height: number;
  yaw: number;
  species: "pine" | "fir";
  lod: "near" | "far";
}

/**
 * Ground disc the walking camera may cover, from the shared view zone. Solid
 * scenery stays entirely outside it.
 */
export const WALK_DISC = {
  x: VIEW_ZONE.center[0],
  z: VIEW_ZONE.center[1],
  radius: VIEW_ZONE.radius,
} as const;

/**
 * Conservative silhouette of the shipped tree models, relative to height:
 * trunk radius up to the lowest branches, then the canopy radius.
 */
export const TREE_SHAPE = { trunk: 0.05, branches: 0.3, canopy: 0.25 } as const;

/** Whether a tree's trunk or canopy would hide the room from the home view. */
export function treeHidesRoom({
  x,
  z,
  height,
}: Pick<ForestTree, "x" | "z" | "height">) {
  const ground = WORLD.groundY + mountainHeight(x, z);
  const crown = ground + height * TREE_SHAPE.branches;
  return (
    hidesRoom(x, z, height * TREE_SHAPE.trunk, crown, ground) ||
    hidesRoom(x, z, height * TREE_SHAPE.canopy, ground + height, crown)
  );
}

/** Deterministic Park–Miller generator; one stream per layout. */
export function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const FOREST = {
  stands: 26,
  inner: 26,
  outer: 108,
  spacing: 3.2,
  near: 10,
};

// Large trees by the home view, in view units (`depth` toward the room,
// `side` to its right): trunks frame the open left of the frame, one stands
// at its right edge past the room, and canopies overhang the top.
const FRAMING: readonly (Omit<ForestTree, "x" | "z" | "lod"> & {
  depth: number;
  side: number;
})[] = [
  { depth: 5.3, side: -2.82, height: 15, yaw: 0.4, species: "fir" },
  { depth: 8.04, side: -6.75, height: 17, yaw: 2.1, species: "pine" },
  { depth: 9.38, side: -9.71, height: 19, yaw: 4.3, species: "fir" },
  { depth: 18.0, side: -10.82, height: 20, yaw: 1.2, species: "pine" },
  { depth: 6.8, side: 3.17, height: 16, yaw: 5.5, species: "pine" },
];

/**
 * Fixed seed: no changes on clock ticks, remounts or camera movement. A few
 * large trees frame the home view; the rest stand in irregular clumps of
 * mixed species separated by open glades, close enough to read through the
 * lowland fog instead of distant rings.
 */
export function forestTrees(): ForestTree[] {
  const random = seeded(1937);
  const trees: Omit<ForestTree, "lod">[] = FRAMING.map(
    ({ depth, side, ...tree }) => {
      const [x, z] = viewPoint(depth, side);
      return { ...tree, x, z };
    },
  );
  const free = (x: number, z: number, height: number) => {
    const radius = Math.hypot(x, z);
    return (
      radius >= FOREST.inner &&
      radius <= FOREST.outer &&
      !treeHidesRoom({ x, z, height }) &&
      (x < PLOT.min[0] - 8 ||
        x > PLOT.max[0] + 8 ||
        z < PLOT.min[2] - 8 ||
        z > PLOT.max[2] + 8) &&
      Math.hypot(x - WALK_DISC.x, z - WALK_DISC.z) > WALK_DISC.radius + 1.5 &&
      trees.every(
        (tree) => Math.hypot(tree.x - x, tree.z - z) >= FOREST.spacing,
      )
    );
  };
  for (let stand = 0; stand < FOREST.stands; stand++) {
    const angle = random() * Math.PI * 2;
    const radius = 34 + random() ** 0.8 * 68;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const spread = 4 + random() * 5;
    const count = 4 + Math.floor(random() * 6);
    const species = random() < 0.5 ? "pine" : "fir";
    for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
      const a = random() * Math.PI * 2;
      const d = spread * Math.sqrt(random());
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const height = 11 + random() * 9;
      const yaw = random() * Math.PI * 2;
      const mixed = random() < 0.3;
      if (!free(x, z, height)) continue;
      i++;
      trees.push({
        x,
        z,
        height,
        yaw,
        species: mixed ? (species === "pine" ? "fir" : "pine") : species,
      });
    }
  }
  // Only the trees closest to the home view carry the near-detail model.
  const [hx, hz] = VIEW_ZONE.home;
  const near = new Set(
    [...trees]
      .sort(
        (a, b) =>
          Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz),
      )
      .slice(0, FOREST.near),
  );
  return trees.map((tree) => ({
    ...tree,
    lod: near.has(tree) ? "near" : "far",
  }));
}

const smooth = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Continuous mountain bowl, flat in the house clearing and beyond the ridge. */
export function mountainHeight(x: number, z: number): number {
  const radius = Math.hypot(x, z);
  const envelope = smooth(135, 200, radius) * (1 - smooth(290, 360, radius));
  const ridge =
    30 +
    16 * Math.sin(x * 0.017 + z * 0.024) +
    9 * Math.cos(z * 0.035 - x * 0.009) +
    4 * Math.sin(x * 0.073) * Math.cos(z * 0.061);
  return envelope * ridge;
}
