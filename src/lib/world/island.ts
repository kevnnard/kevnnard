// Shape of the floating island (01-warm-baked): a chunky rounded-square grass
// slab over a tapering rocky underside, with a flat empty pad in the middle
// reserved for the house (T4). Pure numbers; WorldIsland builds the meshes.

import { seededRandom } from "./random.ts";

export const ISLAND = {
  /** Superellipse half extents in meters (x, z) and exponent: 2 = ellipse. */
  halfX: 6.4,
  halfZ: 5.6,
  exponent: 4,
  /** Grass slab thickness and its rounded bevel. */
  grassThickness: 0.45,
  bevel: 0.22,
  /** How far the rock reaches below the grass. */
  depth: 4.6,
  seed: 7,
} as const;

/**
 * Building pad for T4: kept flat and empty, slightly back of center. Grown
 * 1.8 m toward +x with the main room for the living area (T4j).
 */
export const PAD = {
  center: [0.5, -0.5] as const,
  halfX: 3.8,
  halfZ: 2.5,
  height: 0.05,
} as const;

/** Distance from the center to the island rim at `angle` (radians from +x toward +z). */
export function islandRadiusAt(angle: number): number {
  const n = ISLAND.exponent;
  const x = Math.abs(Math.cos(angle)) / ISLAND.halfX;
  const z = Math.abs(Math.sin(angle)) / ISLAND.halfZ;
  return (x ** n + z ** n) ** (-1 / n);
}

/** Rim points, counterclockwise from +x, as [x, z]. */
export function islandOutline(segments: number): [number, number][] {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    const radius = islandRadiusAt(angle);
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
}

/** True when (x, z) is on the grass at least `margin` meters from the rim. */
export function insideIsland(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x, z) <= islandRadiusAt(Math.atan2(z, x)) - margin;
}

/** True when (x, z) is on the building pad grown by `margin` meters. */
export function onPad(x: number, z: number, margin = 0): boolean {
  return (
    Math.abs(x - PAD.center[0]) <= PAD.halfX + margin &&
    Math.abs(z - PAD.center[1]) <= PAD.halfZ + margin
  );
}

const SEGMENTS = 40;
const RINGS = 6;

/**
 * Rocky underside as indexed triangles, outward facing (counterclockwise).
 * Ring 0 sits just inside the grass rim at y = 0; lower rings taper and are
 * jittered by the seed; a single apex closes the bottom. Flat shading is
 * applied by the renderer.
 */
export function undersideMesh(seed: number): {
  positions: number[];
  indices: number[];
} {
  const random = seededRandom(seed);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring < RINGS; ring++) {
    const t = ring / RINGS;
    const y = -ISLAND.depth * t ** 1.1;
    const taper = 0.97 * (1 - 0.82 * t ** 0.85);
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2;
      // The top ring stays smooth so it meets the slab; rock below is chunky.
      const jitter = ring === 0 ? 1 : 1 + (random() - 0.5) * 0.28;
      const radius = islandRadiusAt(angle) * taper * jitter;
      const lift = ring === 0 ? 0 : (random() - 0.5) * 0.35;
      positions.push(
        radius * Math.cos(angle),
        Math.min(0, y + lift),
        radius * Math.sin(angle),
      );
    }
  }
  const apex = RINGS * SEGMENTS;
  positions.push(
    (random() - 0.5) * 0.8,
    -ISLAND.depth - 0.3,
    (random() - 0.5) * 0.8,
  );
  for (let ring = 0; ring < RINGS; ring++)
    for (let i = 0; i < SEGMENTS; i++) {
      const next = (i + 1) % SEGMENTS;
      const a = ring * SEGMENTS + i;
      const a1 = ring * SEGMENTS + next;
      if (ring === RINGS - 1) {
        indices.push(a, a1, apex);
        continue;
      }
      const b = a + SEGMENTS;
      const b1 = a1 + SEGMENTS;
      indices.push(a, a1, b, a1, b1, b);
    }
  return { positions, indices };
}
