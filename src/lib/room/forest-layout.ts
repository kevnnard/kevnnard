import { hidesRoom, VIEW_ZONE, viewPoint } from "./forest-view.ts";
import { PLOT } from "./house-layout.ts";

// Scenery never contributes to home framing or camera target boundaries.
export const WORLD = {
  size: 2400,
  far: 700,
  fogStart: 85,
  // Far enough that the higher crests behind the near ridge keep their relief.
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
  const ground = treeBase({ x, z, height });
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

const smooth = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Camera body radius kept clear around the walk disc (`WALK.bodyRadius`). */
const BODY = 0.45;
/** Half width of the flat path from the walk disc to the plot corner. */
const PATH = 2;
// Plot corner nearest the walk disc, where the path meets the yard.
const CORNER = [PLOT.min[0], PLOT.max[2]] as const;

/**
 * Ground distance outside the safe footprint: the house plot, the walk disc
 * with the camera body, and the path between them. Zero inside.
 */
export function safeDistance(x: number, z: number) {
  const plot = Math.hypot(
    Math.max(PLOT.min[0] - x, 0, x - PLOT.max[0]),
    Math.max(PLOT.min[2] - z, 0, z - PLOT.max[2]),
  );
  const disc = Math.hypot(x - WALK_DISC.x, z - WALK_DISC.z);
  const [px, pz] = [CORNER[0] - WALK_DISC.x, CORNER[1] - WALK_DISC.z];
  const t = Math.min(
    1,
    Math.max(
      0,
      ((x - WALK_DISC.x) * px + (z - WALK_DISC.z) * pz) / (px * px + pz * pz),
    ),
  );
  const path = Math.hypot(x - WALK_DISC.x - px * t, z - WALK_DISC.z - pz * t);
  return Math.max(
    0,
    Math.min(plot, disc - WALK_DISC.radius - BODY, path - PATH),
  );
}

/**
 * Near ridge shape: foothills start `flat` units outside the safe footprint
 * and reach their crest after `run` more (varying with bearing), then dip
 * into a saddle before the higher range behind.
 */
export const HILLS = {
  flat: 7,
  run: 28,
  saddle: 24,
  fade: [290, 360],
} as const;

/**
 * Continuous terrain: flat over the house, walk zone and path; irregular
 * forested foothills right beyond them; higher crests behind; flat again
 * past the outer fade so the far ground stays continuous.
 */
export function mountainHeight(x: number, z: number): number {
  const d = safeDistance(x, z) - HILLS.flat;
  if (d <= 0) return 0;
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  // Integer bearing frequencies keep the ridge continuous all the way round;
  // longer spatial waves make it irregular without spiking near the house.
  const run =
    HILLS.run + 4 * Math.sin(3 * angle + 0.7) + 2 * Math.sin(2 * angle + 2.1);
  const amplitude = Math.min(
    run * 0.6,
    22 +
      5 * Math.sin(2 * angle + 1.3) +
      4 * Math.sin(x * 0.07 + z * 0.045) +
      2.5 * Math.sin(z * 0.11 - x * 0.06 + 1),
  );
  // The toe already climbs at a gentle angle (a smoothstep entered a fifth
  // of the way in), so the slope reads a few units from the footprint.
  const toe = smooth(-run / 4, run, 0);
  const rise =
    (smooth(-run / 4, run, d) - toe) / (1 - toe) -
    0.45 * smooth(run, run + HILLS.saddle, d);
  // Short rocky relief on the slopes instead of a smooth bowl.
  const rocky =
    smooth(0, 10, d) *
    (1 * Math.sin(x * 0.31 + z * 0.23) * Math.sin(z * 0.37 - x * 0.19) +
      0.4 * Math.sin(x * 0.61 - z * 0.47));
  const back =
    smooth(48, 120, radius) *
    (34 +
      16 * Math.sin(x * 0.017 + z * 0.024) +
      9 * Math.cos(z * 0.035 - x * 0.009) +
      4 * Math.sin(x * 0.073) * Math.cos(z * 0.061));
  const height = amplitude * rise + rocky + back;
  return (
    Math.max(0, height) * (1 - smooth(HILLS.fade[0], HILLS.fade[1], radius))
  );
}

/**
 * Rendered terrain grid: `segments` cells per side over `size` units, warped
 * so cells are about 0.7 units around the house and the near slopes (under
 * 1.8 out to 60) and grow toward the edge (about 7 at 150, 15 at 300).
 */
export const TERRAIN = { size: 800, segments: 224, core: 0.2 } as const;

const warp = (t: number) => TERRAIN.core * t + (1 - TERRAIN.core) * t ** 7;

/** Grid line coordinates shared by the x and z axes, ascending. */
export const TERRAIN_AXIS: readonly number[] = Array.from(
  { length: TERRAIN.segments + 1 },
  (_, i) => (TERRAIN.size / 2) * warp((2 * i) / TERRAIN.segments - 1),
);

let vertexHeights: Float64Array | undefined;

/**
 * `mountainHeight` at every grid vertex, row by row along +z (the vertex order
 * of a `PlaneGeometry` laid flat). Computed once; never modify.
 */
export function terrainVertexHeights() {
  if (!vertexHeights) {
    const n = TERRAIN_AXIS.length;
    vertexHeights = new Float64Array(n * n);
    for (let iz = 0; iz < n; iz++)
      for (let ix = 0; ix < n; ix++)
        vertexHeights[iz * n + ix] = mountainHeight(
          TERRAIN_AXIS[ix],
          TERRAIN_AXIS[iz],
        );
  }
  return vertexHeights;
}

/** Cell containing `value` and the fraction across it. */
function cellOf(value: number): [number, number] {
  let low = 0;
  let high = TERRAIN_AXIS.length - 2;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (TERRAIN_AXIS[mid] <= value) low = mid;
    else high = mid - 1;
  }
  const a = TERRAIN_AXIS[low];
  const b = TERRAIN_AXIS[low + 1];
  return [low, Math.min(1, Math.max(0, (value - a) / (b - a)))];
}

/**
 * Height of the rendered terrain surface above `WORLD.groundY`: the same grid
 * vertices and the same triangle diagonal as `PlaneGeometry` (each cell split
 * along its (x0, z1)–(x1, z0) edge). Scenery stands on this, not on the
 * analytic `mountainHeight` between vertices.
 */
export function terrainHeight(x: number, z: number) {
  const heights = terrainVertexHeights();
  const n = TERRAIN_AXIS.length;
  const [ix, u] = cellOf(x);
  const [iz, v] = cellOf(z);
  const at = (dx: number, dz: number) => heights[(iz + dz) * n + ix + dx];
  if (u + v <= 1)
    return at(0, 0) + u * (at(1, 0) - at(0, 0)) + v * (at(0, 1) - at(0, 0));
  return (
    at(1, 1) + (1 - u) * (at(0, 1) - at(1, 1)) + (1 - v) * (at(1, 0) - at(1, 1))
  );
}

/** Greatest terrain rise per unit around a point (sampled 1 unit away). */
export function terrainSlope(x: number, z: number) {
  const center = terrainHeight(x, z);
  let steepest = 0;
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    steepest = Math.max(
      steepest,
      Math.abs(
        terrainHeight(x + Math.cos(angle), z + Math.sin(angle)) - center,
      ),
    );
  }
  return steepest;
}

/** World height of a tree's origin: the lowest terrain under its trunk. */
export function treeBase({
  x,
  z,
  height,
}: Pick<ForestTree, "x" | "z" | "height">) {
  const r = height * TREE_SHAPE.trunk;
  return (
    WORLD.groundY +
    Math.min(
      terrainHeight(x, z),
      terrainHeight(x + r, z),
      terrainHeight(x - r, z),
      terrainHeight(x, z + r),
      terrainHeight(x, z - r),
    )
  );
}

/** Shipped tree models, in instancing batch order. */
export const TREE_MODELS = [
  "pine-near",
  "pine-far",
  "fir-near",
  "fir-far",
] as const;

/**
 * Indices of `trees` drawn by each model in `TREE_MODELS`. Every tree,
 * including understory saplings, lands in exactly one batch.
 */
export const treeBatches = (trees: readonly ForestTree[]) =>
  TREE_MODELS.map((model) =>
    trees.flatMap((tree, i) =>
      `${tree.species}-${tree.lod}` === model ? [i] : [],
    ),
  );

const FOREST = {
  trees: 112,
  saplings: 44,
  /** Origin radius the groves stay within: the near slopes and crests. */
  reach: 72,
  spacing: 3.2,
  near: 10,
  /** Steepest ground rise per unit a trunk or sapling may stand on. */
  slope: 1.1,
};

// Large trees by the home view, in view units (`depth` toward the room,
// `side` to its right): trunks frame the open left of the frame, one stands
// at its right edge past the room, and canopies overhang the top.
const FRAMING: readonly (Omit<ForestTree, "x" | "z" | "lod"> & {
  depth: number;
  side: number;
})[] = [
  { depth: 5.3, side: -3.45, height: 15, yaw: 0.4, species: "fir" },
  { depth: 8.04, side: -6.75, height: 17, yaw: 2.1, species: "pine" },
  { depth: 9.38, side: -9.71, height: 19, yaw: 4.3, species: "fir" },
  { depth: 18.0, side: -10.82, height: 20, yaw: 1.2, species: "pine" },
  { depth: 6.8, side: 3.17, height: 16, yaw: 5.5, species: "pine" },
];

const plotGap = (x: number, z: number) =>
  Math.max(PLOT.min[0] - x, x - PLOT.max[0], PLOT.min[2] - z, z - PLOT.max[2]);
const walkGap = (x: number, z: number) =>
  Math.hypot(x - WALK_DISC.x, z - WALK_DISC.z) - WALK_DISC.radius - BODY;

/**
 * Fixed seed: no changes on clock ticks, remounts or camera movement. A few
 * large trees frame the home view; the rest stand in small mixed groves on
 * the foothills right around the clearing and up to the near crests,
 * denser close to the safe footprint, instead of a distant inventory.
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
    const trunk = height * TREE_SHAPE.trunk;
    return (
      Math.hypot(x, z) <= FOREST.reach &&
      plotGap(x, z) > trunk + 0.4 &&
      walkGap(x, z) > trunk + 0.55 &&
      terrainSlope(x, z) <= FOREST.slope &&
      !treeHidesRoom({ x, z, height }) &&
      trees.every(
        (tree) => Math.hypot(tree.x - x, tree.z - z) >= FOREST.spacing,
      )
    );
  };
  const [hx, hz] = VIEW_ZONE.home;
  for (let grove = 0; grove < 600 && trees.length < FOREST.trees; grove++) {
    // The first groves ring the walk zone so every look-around is wooded;
    // the rest crowd the clearing edge and thin out toward the crests.
    const ring = grove < 4;
    const a = ((grove % 8) / 8) * Math.PI * 2 + random() * 0.6;
    const cx = ring
      ? hx + Math.cos(a) * (10 + random() * 10)
      : (random() * 2 - 1) * FOREST.reach;
    const cz = ring
      ? hz + Math.sin(a) * (10 + random() * 10)
      : (random() * 2 - 1) * FOREST.reach;
    const d = safeDistance(cx, cz);
    if (!ring && (d > 40 || random() > 1 - d / 48)) continue;
    const spread = 3 + random() * 4;
    const count = 3 + Math.floor(random() * 4);
    const species = random() < 0.45 ? "pine" : "fir";
    for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
      const a = random() * Math.PI * 2;
      const r = spread * Math.sqrt(random());
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const height = 11 + random() * 9;
      const yaw = random() * Math.PI * 2;
      const mixed = random() < 0.3;
      if (trees.length >= FOREST.trees || !free(x, z, height)) continue;
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

/**
 * Low saplings and young trees in patches around the clearing edge and on
 * the lower slopes, from the far-detail models of the existing species. They
 * may stand in the room view only below its sight line, and stay off the
 * yard, the walk zone and the trunks.
 */
export function forestUnderstory(trees = forestTrees()): ForestTree[] {
  const random = seeded(4099);
  const saplings: ForestTree[] = [];
  const [hx, hz] = VIEW_ZONE.home;
  const free = (x: number, z: number, height: number) => {
    const reach = height * TREE_SHAPE.canopy;
    return (
      plotGap(x, z) > reach + 0.1 &&
      walkGap(x, z) > reach + 0.55 &&
      terrainSlope(x, z) <= FOREST.slope &&
      !treeHidesRoom({ x, z, height }) &&
      trees.every(
        (tree) =>
          Math.hypot(tree.x - x, tree.z - z) >
          tree.height * TREE_SHAPE.trunk + reach + 0.2,
      ) &&
      saplings.every((other) => Math.hypot(other.x - x, other.z - z) >= 1.3)
    );
  };
  for (
    let patch = 0;
    patch < 400 && saplings.length < FOREST.saplings;
    patch++
  ) {
    // Half the patches gather around the walk zone, the rest along the
    // foothill toe right outside the safe footprint.
    const around = patch % 2 === 0;
    const a = random() * Math.PI * 2;
    const r = around ? 6 + random() * 9 : 10 + random() * 40;
    const cx = (around ? hx : 0) + Math.cos(a) * r;
    const cz = (around ? hz : 0) + Math.sin(a) * r;
    if (!around && safeDistance(cx, cz) > 10) continue;
    const species = random() < 0.7 ? "fir" : "pine";
    const count = 3 + Math.floor(random() * 3);
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
      const angle = random() * Math.PI * 2;
      const d = 2.4 * Math.sqrt(random());
      const x = cx + Math.cos(angle) * d;
      const z = cz + Math.sin(angle) * d;
      const height = 1.2 + random() * 2.6;
      const yaw = random() * Math.PI * 2;
      if (saplings.length >= FOREST.saplings || !free(x, z, height)) continue;
      i++;
      saplings.push({ x, z, height, yaw, species, lod: "far" });
    }
  }
  return saplings;
}
