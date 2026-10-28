// Original procedural clouds (credited in public/world/credits.json as work
// made for this project): each shape is 4-7 overlapping smooth spheres of
// varied size merged into one geometry, with the bottom squashed flat-ish.
// A few seeded shapes are instanced around the island in loose clusters.
// Pure numbers; WorldScene builds the meshes.

import { seededRandom } from "./random.ts";

export interface CloudShape {
  /** Indexed triangles with smooth per-sphere normals, base near y = 0. */
  positions: number[];
  normals: number[];
  indices: number[];
  puffs: number;
}

export interface CloudPlacement {
  /** Index into cloudShapes(). */
  shape: number;
  position: [number, number, number];
  rotationY: number;
  scale: number;
}

export const CLOUD_SHAPES = 3;
const SEGMENTS = 16;
const RINGS = 10;
/** Below its middle a cloud keeps this fraction of its depth. */
const BOTTOM_SQUASH = 0.35;

// Cluster centers floating around the island; each holds one or two clouds.
const CLUSTERS: readonly [number, number, number][] = [
  [-9, 2, -5],
  [6, 3, -9],
  [-8, -3, 4],
  [9.5, -2.5, 1.5],
  [0.5, 4.2, -11],
];

/** One smooth UV sphere appended to the shape, squashed below y = 0. */
function addSphere(
  shape: CloudShape,
  [cx, cy, cz]: [number, number, number],
  radius: number,
) {
  const first = shape.positions.length / 3;
  for (let ring = 0; ring <= RINGS; ring++) {
    const theta = (ring / RINGS) * Math.PI;
    for (let segment = 0; segment <= SEGMENTS; segment++) {
      const phi = (segment / SEGMENTS) * Math.PI * 2;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      let y = cy + ny * radius;
      let normalY = ny;
      if (y < 0) {
        y *= BOTTOM_SQUASH;
        normalY /= BOTTOM_SQUASH;
      }
      const length = Math.hypot(nx, normalY, nz) || 1;
      shape.positions.push(cx + nx * radius, y, cz + nz * radius);
      shape.normals.push(nx / length, normalY / length, nz / length);
    }
  }
  const row = SEGMENTS + 1;
  for (let ring = 0; ring < RINGS; ring++)
    for (let segment = 0; segment < SEGMENTS; segment++) {
      const a = first + ring * row + segment;
      const b = a + row;
      if (ring > 0) shape.indices.push(a, a + 1, b);
      if (ring < RINGS - 1) shape.indices.push(a + 1, b + 1, b);
    }
}

/** Seeded cloud shapes: a big middle puff with smaller ones trailing off. */
export function cloudShapes(seed: number): CloudShape[] {
  const random = seededRandom(seed * 31 + 7);
  return Array.from({ length: CLOUD_SHAPES }, () => {
    const shape: CloudShape = {
      positions: [],
      normals: [],
      indices: [],
      puffs: 4 + Math.floor(random() * 4),
    };
    for (let i = 0; i < shape.puffs; i++) {
      const side = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
      const radius =
        i === 0 ? 0.85 + random() * 0.15 : 0.75 - Math.abs(side) * 0.12;
      addSphere(
        shape,
        [
          side * (0.55 + random() * 0.2),
          radius * 0.45 + random() * 0.15,
          (random() - 0.5) * 0.6,
        ],
        radius * (0.85 + random() * 0.3),
      );
    }
    return shape;
  });
}

/** Triangles of every shape, for the render budget. */
export function cloudTriangles(shapes: CloudShape[], clouds: CloudPlacement[]) {
  return clouds.reduce(
    (sum, cloud) => sum + shapes[cloud.shape].indices.length / 3,
    0,
  );
}

/** One or two seeded clouds per cluster around the island. */
export function cloudLayout(seed: number): CloudPlacement[] {
  const random = seededRandom(seed * 13 + 5);
  const clouds: CloudPlacement[] = [];
  for (const [x, y, z] of CLUSTERS) {
    const count = 1 + Math.floor(random() * 2);
    const heading = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const along = i * (2 + random() * 0.8);
      clouds.push({
        shape: Math.floor(random() * CLOUD_SHAPES),
        position: [
          x + Math.cos(heading) * along,
          y + (random() - 0.5) * 0.4 - i * 0.3,
          z + Math.sin(heading) * along,
        ],
        rotationY: heading + (random() - 0.5) * 0.6,
        scale: i === 0 ? 1 + random() * 0.25 : 0.6 + random() * 0.25,
      });
    }
  }
  return clouds;
}
