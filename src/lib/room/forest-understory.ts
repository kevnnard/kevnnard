// Seeded fern patches on the forest floor: clumps gathered at trunk bases and
// beside rocks, stumps and logs in the near and middle ground of the home
// view. Pure layout: tested without WebGL.
import {
  type DebrisPiece,
  debrisFootprint,
  forestDebris,
} from "./forest-debris.ts";
import { lowFogFactor } from "./forest-fog.ts";
import {
  type ForestTree,
  forestTrees,
  forestUnderstory,
  safeDistance,
  seeded,
  TREE_SHAPE,
  terrainHeight,
  WORLD,
} from "./forest-layout.ts";
import { hidesRoom, VIEW_ZONE } from "./forest-view.ts";
import { PLOT } from "./house-layout.ts";

export const FERN_URL = "/models/forest-understory/ferns.glb";

export interface FernModel {
  /** Node name in the shipped GLB. */
  node: string;
  /** Source extents in metres (x, y, z), as recorded in the manifest. */
  size: readonly number[];
  /** Triangles in the shipped GLB: the full source mesh, not decimated. */
  triangles: number;
}

/** The four scanned clumps of Poly Haven `fern_02`: two broad, two small. */
export const FERN_MODELS: readonly FernModel[] = [
  { node: "fern_02_b", size: [0.9897, 0.4277, 0.8937], triangles: 2384 },
  { node: "fern_02_c", size: [0.8743, 0.349, 0.7652], triangles: 2248 },
  { node: "fern_02_a", size: [0.5519, 0.2868, 0.6134], triangles: 784 },
  { node: "fern_02_d", size: [0.5728, 0.2131, 0.5933], triangles: 816 },
];

export interface Fern {
  variant: number;
  x: number;
  /** Rendered terrain under the crown base; the model's lowest point before burial. */
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** Fraction of the scaled height sunk below the root. */
  burial: number;
  /**
   * Rise per unit along x and z of the clump's tilted base plane: part of
   * the local terrain grade, so fronds follow a bank instead of floating.
   */
  tilt: readonly [number, number];
}

/** Conservative ground radius: half the scaled XZ diagonal, any yaw. */
export function fernFootprint({
  variant,
  scale,
}: Pick<Fern, "variant" | "scale">) {
  const [x, , z] = FERN_MODELS[variant].size;
  return (Math.hypot(x, z) / 2) * scale;
}

/** Scaled height of a clump, in metres. */
export const fernHeight = ({
  variant,
  scale,
}: Pick<Fern, "variant" | "scale">) => FERN_MODELS[variant].size[1] * scale;

/** Lowest rendered ground around the crown base, where the fronds root. */
function rootGround(x: number, z: number, reach: number) {
  let low = terrainHeight(x, z);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    low = Math.min(
      low,
      terrainHeight(
        x + Math.cos(angle) * reach * 0.2,
        z + Math.sin(angle) * reach * 0.2,
      ),
    );
  }
  return WORLD.groundY + low;
}

/** Mean terrain grade across a footprint, as rise per unit along x and z. */
export function fernGrade(
  x: number,
  z: number,
  reach: number,
): [number, number] {
  return [
    (terrainHeight(x + reach, z) - terrainHeight(x - reach, z)) / (2 * reach),
    (terrainHeight(x, z + reach) - terrainHeight(x, z - reach)) / (2 * reach),
  ];
}

/**
 * Greatest gap between the rendered terrain and a clump's tilted base plane
 * over its whole footprint (24 bearings, half and full radius), in metres.
 */
export function fernRelief(
  fern: Pick<Fern, "variant" | "scale" | "x" | "y" | "z" | "tilt">,
) {
  const reach = fernFootprint(fern);
  let gap = 0;
  for (let i = 0; i < 24; i++)
    for (const r of [reach / 2, reach]) {
      const angle = (i / 24) * Math.PI * 2;
      const dx = Math.cos(angle) * r;
      const dz = Math.sin(angle) * r;
      const ground = WORLD.groundY + terrainHeight(fern.x + dx, fern.z + dz);
      gap = Math.max(
        gap,
        Math.abs(ground - (fern.y + fern.tilt[0] * dx + fern.tilt[1] * dz)),
      );
    }
  return gap;
}

const FERNS = {
  /** Anchors farther than this from home get no patch: no far-edge carpet. */
  reach: 40,
  /** Triangle budget for all instances, before culling. */
  triangles: 240_000,
  /** Share of eligible trees left bare, so the floor stays irregular. */
  gaps: 0.2,
  /** Greatest terrain gap from a clump's base plane, as a share of its height. */
  relief: 0.4,
  /** Steepest mean grade under a clump (rise per unit): no cliffs. */
  grade: 0.6,
  /** Share of the grade the base plane follows; fronds stay mostly upright. */
  follow: 0.7,
};

interface Anchor {
  x: number;
  z: number;
  /** Clearance radius of the trunk or debris piece itself. */
  radius: number;
  /** Share of a clump's footprint kept clear of it (fronds may arch over rocks). */
  share: number;
  clumps: number;
}

/**
 * Fixed seed: identical on every mount, clock tick and camera move. Each
 * patch fans out over one side of a trunk or rock, larger clumps in the
 * shade at its base and small ones at the patch edge, nearest anchors first
 * so the triangle budget goes to the visible foreground.
 */
export function forestFerns(
  trees: ForestTree[] = forestTrees(),
  debris: DebrisPiece[] = forestDebris(trees),
): Fern[] {
  const random = seeded(6311);
  const [hx, hz] = VIEW_ZONE.home;
  const away = (x: number, z: number) => Math.hypot(x - hx, z - hz);
  const trunks = [...trees, ...forestUnderstory(trees)].map((tree) => ({
    x: tree.x,
    z: tree.z,
    radius: tree.height * TREE_SHAPE.trunk,
  }));
  const pieces = debris.map((piece) => ({
    x: piece.x,
    z: piece.z,
    radius: debrisFootprint(piece),
  }));
  const anchors: Anchor[] = [
    ...trees.map((tree) => ({
      x: tree.x,
      z: tree.z,
      radius: tree.height * TREE_SHAPE.trunk,
      share: 1,
      clumps: 4 + Math.floor(random() * 4),
    })),
    ...pieces.map((piece) => ({
      ...piece,
      share: 0.5,
      clumps: 2 + Math.floor(random() * 2),
    })),
  ]
    .filter((anchor) => away(anchor.x, anchor.z) <= FERNS.reach)
    .sort((a, b) => away(a.x, a.z) - away(b.x, b.z));
  const ferns: Fern[] = [];
  let triangles = 0;
  const camera = { x: hx, y: VIEW_ZONE.eyeY, z: hz };
  const fits = (fern: Fern) => {
    const reach = fernFootprint(fern);
    const height = fernHeight(fern);
    const { x, z } = fern;
    return (
      away(x, z) <= 45 &&
      // Plot, walk disc with the camera body, and the path between them.
      safeDistance(x, z) > reach + 0.1 &&
      (x + reach < PLOT.min[0] - 0.1 ||
        x - reach > PLOT.max[0] + 0.1 ||
        z + reach < PLOT.min[2] - 0.1 ||
        z - reach > PLOT.max[2] + 0.1) &&
      Math.hypot(...fernGrade(x, z, reach)) <= FERNS.grade &&
      fernRelief(fern) <= height * FERNS.relief &&
      !hidesRoom(x, z, reach, fern.y + height * (1 - fern.burial)) &&
      lowFogFactor({ x, y: fern.y, z }, camera) < 0.3 &&
      trunks.every(
        (t) => Math.hypot(t.x - x, t.z - z) > t.radius + reach + 0.05,
      ) &&
      pieces.every(
        (p) => Math.hypot(p.x - x, p.z - z) > p.radius + reach * 0.5 + 0.05,
      ) &&
      ferns.every(
        (other) =>
          Math.hypot(other.x - x, other.z - z) >
          (reach + fernFootprint(other)) * 0.5,
      )
    );
  };
  for (const anchor of anchors) {
    if (anchor.share === 1 && random() < FERNS.gaps) continue;
    // One side of the anchor, not a ring: asymmetric patches with gaps.
    const facing = random() * Math.PI * 2;
    const arc = 1.4 + random() * 2.4;
    for (let clump = 0; clump < anchor.clumps; clump++) {
      // The first clumps are the broad ones at the base, the rest smaller.
      const inner = clump < 2;
      const variant = inner
        ? Math.floor(random() * 2)
        : Math.floor(random() * 4);
      const target = inner ? 0.6 + random() * 0.6 : 0.3 + random() * 0.55;
      const scale = Math.min(
        3,
        Math.max(0.9, target / FERN_MODELS[variant].size[1]),
      );
      if (triangles + FERN_MODELS[variant].triangles > FERNS.triangles)
        return ferns;
      for (let attempt = 0; attempt < 10; attempt++) {
        const reach = fernFootprint({ variant, scale });
        const angle = facing + (random() - 0.5) * arc;
        const d = anchor.radius + reach * anchor.share + 0.06 + random() * 1.4;
        const x = anchor.x + Math.cos(angle) * d;
        const z = anchor.z + Math.sin(angle) * d;
        const [gx, gz] = fernGrade(x, z, reach);
        const fern: Fern = {
          variant,
          x,
          y: rootGround(x, z, reach),
          z,
          yaw: random() * Math.PI * 2,
          scale,
          burial: 0.04 + random() * 0.06,
          tilt: [gx * FERNS.follow, gz * FERNS.follow],
        };
        if (fits(fern)) {
          ferns.push(fern);
          triangles += FERN_MODELS[variant].triangles;
          break;
        }
      }
    }
  }
  return ferns;
}
