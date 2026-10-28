// Original low-poly flowers (credited in public/world/credits.json as work made
// for this project): a thin stem, a round center and five rounded petals,
// instanced in small seeded patches beside the bushes and the pad edges.
// Pure numbers; WorldScene builds the meshes.

import { ISLAND, insideIsland, onPad, PAD } from "./island.ts";
import { KIND_SPECS, type Placement } from "./layout.ts";
import { seededRandom } from "./random.ts";

/** Pastel petal colors (sRGB hex): pink, lavender, butter, peach, cream. */
export const FLOWER_COLORS = [
  "#f7b6c8",
  "#cdb8f2",
  "#fde5a0",
  "#f9c4a6",
  "#fff4ec",
] as const;

export interface FlowerPlacement {
  position: [number, number, number];
  rotationY: number;
  scale: number;
  /** Index into FLOWER_COLORS. */
  color: number;
}

const STEM_HEIGHT = 0.18;
const STEM_RADIUS = 0.008;
const CENTER_RADIUS = 0.022;
const PETALS = 5;
const PETAL_LENGTH = 0.06;
const PETAL_WIDTH = 0.036;
const PETAL_SIDES = 6;
const PETAL_TILT = 0.3;
const STEM_COLOR: [number, number, number] = [0.47, 0.7, 0.38];
const CENTER_COLOR: [number, number, number] = [1, 0.84, 0.42];

type Vec = [number, number, number];

/**
 * Non-indexed triangles for one flower at scale 1, base on the origin. `body`
 * is the stem and center with sRGB vertex colors; `petals` takes the
 * per-instance pastel color.
 */
export function flowerMesh(): {
  body: { positions: number[]; colors: number[] };
  petals: { positions: number[] };
} {
  const body = { positions: [] as number[], colors: [] as number[] };
  const petals = { positions: [] as number[] };
  const bodyTriangle = (color: Vec, ...corners: Vec[]) => {
    for (const corner of corners) {
      body.positions.push(...corner);
      body.colors.push(...color);
    }
  };

  // Stem: a three-sided prism.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const b = ((i + 1) / 3) * Math.PI * 2;
    const ax = Math.cos(a) * STEM_RADIUS;
    const az = Math.sin(a) * STEM_RADIUS;
    const bx = Math.cos(b) * STEM_RADIUS;
    const bz = Math.sin(b) * STEM_RADIUS;
    bodyTriangle(STEM_COLOR, [ax, 0, az], [bx, 0, bz], [bx, STEM_HEIGHT, bz]);
    bodyTriangle(
      STEM_COLOR,
      [ax, 0, az],
      [bx, STEM_HEIGHT, bz],
      [ax, STEM_HEIGHT, az],
    );
  }

  // Center: a squashed octahedron, round enough at this size.
  const top = STEM_HEIGHT + CENTER_RADIUS * 0.4;
  const ring: Vec[] = [0, 1, 2, 3].map((i) => [
    Math.cos((i / 4) * Math.PI * 2) * CENTER_RADIUS,
    STEM_HEIGHT,
    Math.sin((i / 4) * Math.PI * 2) * CENTER_RADIUS,
  ]);
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    bodyTriangle(CENTER_COLOR, a, [0, top + CENTER_RADIUS * 0.5, 0], b);
    bodyTriangle(CENTER_COLOR, a, b, [0, top - CENTER_RADIUS * 0.9, 0]);
  }

  // Petals: rounded ellipse fans around the center, tilted up a little.
  for (let p = 0; p < PETALS; p++) {
    const angle = (p / PETALS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const point = (along: number, side: number): Vec => [
      dx * along - dz * side,
      STEM_HEIGHT + along * Math.tan(PETAL_TILT),
      dz * along + dx * side,
    ];
    const middle = CENTER_RADIUS * 0.5 + PETAL_LENGTH / 2;
    const center = point(middle, 0);
    for (let i = 0; i < PETAL_SIDES; i++) {
      const a = (i / PETAL_SIDES) * Math.PI * 2;
      const b = ((i + 1) / PETAL_SIDES) * Math.PI * 2;
      petals.positions.push(
        ...center,
        ...point(
          middle + (Math.cos(a) * PETAL_LENGTH) / 2,
          (Math.sin(a) * PETAL_WIDTH) / 2,
        ),
        ...point(
          middle + (Math.cos(b) * PETAL_LENGTH) / 2,
          (Math.sin(b) * PETAL_WIDTH) / 2,
        ),
      );
    }
  }
  return { body, petals };
}

/** Triangles per flower, for the render budget. */
export const FLOWER_TRIANGLES = (() => {
  const { body, petals } = flowerMesh();
  return (body.positions.length + petals.positions.length) / 9;
})();

const MAX_FLOWERS = 80;
const GAP = 0.12;
// Pad-edge patches, just outside the pad, away from the front path.
const PAD_EDGE: readonly [number, number][] = [
  [PAD.center[0] + PAD.halfX + 0.45, PAD.center[1] - 1.4],
  [PAD.center[0] + PAD.halfX + 0.45, PAD.center[1] + 0.9],
  [PAD.center[0] - 1.8, PAD.center[1] + PAD.halfZ + 0.45],
  [PAD.center[0] - PAD.halfX - 0.45, PAD.center[1] + 1.2],
  [PAD.center[0] + 0.6, PAD.center[1] - PAD.halfZ - 0.45],
];

/** Seeded flower patches beside the bushes and the pad edges, off the pad. */
export function flowerLayout(
  layout: Placement[],
  seed: number = ISLAND.seed,
): FlowerPlacement[] {
  const random = seededRandom(seed * 17 + 3);
  const ground = layout.filter((item) => !KIND_SPECS[item.kind].floating);
  const flowers: FlowerPlacement[] = [];

  const free = (x: number, z: number) =>
    insideIsland(x, z, 0.3) &&
    !onPad(x, z, 0.25) &&
    ground.every(
      (item) =>
        item.kind === "tuft-small" ||
        Math.hypot(x - item.position[0], z - item.position[2]) >=
          KIND_SPECS[item.kind].radius * item.scale * 0.6 + 0.08,
    ) &&
    flowers.every(
      (other) =>
        Math.hypot(x - other.position[0], z - other.position[2]) >= GAP,
    );

  const centers: [number, number][] = [...PAD_EDGE];
  for (const bush of ground.filter((item) => item.kind === "bush")) {
    const angle = random() * Math.PI * 2;
    const reach = KIND_SPECS.bush.radius * bush.scale + 0.25;
    centers.push([
      bush.position[0] + Math.cos(angle) * reach,
      bush.position[2] + Math.sin(angle) * reach,
    ]);
  }

  for (const [cx, cz] of centers) {
    const count = 3 + Math.floor(random() * 4);
    const color = Math.floor(random() * FLOWER_COLORS.length);
    for (let i = 0; i < count && flowers.length < MAX_FLOWERS; i++) {
      const angle = random() * Math.PI * 2;
      const distance = 0.08 + random() * 0.4;
      const x = cx + Math.cos(angle) * distance;
      const z = cz + Math.sin(angle) * distance;
      // Mostly one color per patch, with an occasional stray.
      const stray = random() < 0.25;
      const scale = 0.8 + random() * 0.5;
      const rotationY = random() * Math.PI * 2;
      if (!free(x, z)) continue;
      flowers.push({
        position: [x, 0, z],
        rotationY,
        scale,
        color: stray ? Math.floor(random() * FLOWER_COLORS.length) : color,
      });
    }
  }
  return flowers;
}
