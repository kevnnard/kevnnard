// Seeded nature layout for the floating island. Hand-placed anchors give the
// composition (tall trees behind, open lawn and path toward the camera); the
// seed only jitters them and scatters bushes, grass tufts and cloud puffs, so
// every visit looks the same.

import { ISLAND, insideIsland, islandRadiusAt, onPad, PAD } from "./island.ts";
import { seededRandom } from "./random.ts";

export type NatureKind =
  | "tree"
  | "pine"
  | "pines"
  | "pines-b"
  | "rock-a"
  | "rock-b"
  | "stone"
  | "tuft"
  | "tuft-small"
  | "bush"
  | "cloud";

export interface KindSpec {
  /** Rendered height in meters; the model is scaled uniformly to it. */
  height: number;
  /** Footprint radius at scale 1, for spacing. */
  radius: number;
  /** Distance kept from the building pad. */
  clearance: number;
  /** Clouds float around the island instead of standing on it. */
  floating: boolean;
}

const spec = (
  height: number,
  radius: number,
  clearance: number,
  floating = false,
): KindSpec => ({ height, radius, clearance, floating });

export const KIND_SPECS: Record<NatureKind, KindSpec> = {
  tree: spec(2.8, 0.6, 0.8),
  pine: spec(2.4, 0.58, 0.6),
  pines: spec(1.9, 1.2, 0.8),
  "pines-b": spec(1.7, 1.2, 0.8),
  "rock-a": spec(0.5, 0.46, 0.3),
  "rock-b": spec(0.45, 0.58, 0.3),
  stone: spec(0.1, 0.22, 0.08),
  tuft: spec(0.45, 0.37, 0.2),
  "tuft-small": spec(0.35, 0.2, 0.12),
  bush: spec(0.55, 0.42, 0.3),
  cloud: spec(1.1, 1.6, 0, true),
};

export interface Placement {
  kind: NatureKind;
  position: [number, number, number];
  rotationY: number;
  scale: number;
}

type Anchor = readonly [NatureKind, number, number];

// Back-left grove frames the pad without hiding it from the front-right camera.
const ANCHORS: readonly Anchor[] = [
  ["tree", -5, -2],
  ["tree", -4.5, 1.3],
  ["tree", -2.1, -4.3],
  ["tree", 1.3, -4.4],
  ["tree", 4.5, -3],
  ["tree", -4.7, 3.6],
  ["pine", -5.4, -0.3],
  ["pine", 3, -4.6],
  ["pine", 5.1, -1],
  ["pines", -0.4, -4.7],
  ["pines-b", -4.4, -4.1],
  ["rock-a", 5.6, 0.6],
  ["rock-a", -2.6, 4.6],
  ["rock-b", 5.2, 3.3],
  ["rock-b", 0.2, 4.9],
  ["tuft", 3.4, -1.7],
  ["tuft", 3.2, 2.6],
  ["tuft", -1.6, 3.4],
  ["tuft", 5.1, 1.9],
  ["tuft", 2.1, -3.5],
  ["tuft", -3.6, 2.4],
];

// Stepping stones from the pad's front edge toward the front-right rim.
const PATH_FROM = [1.1, PAD.center[1] + PAD.halfZ + 0.45] as const;
const PATH_TO = [3.7, 4.7] as const;
const PATH_STONES = 6;

// Cloud cluster centers; each grows 3-5 overlapping puffs of varied size.
const CLOUDS: readonly [number, number, number][] = [
  [-9, 2, -5],
  [6, 3, -9],
  [-8, -3, 4],
  [9.5, -2.5, 1.5],
  [0.5, 4.2, -11],
];

/** Bush clusters spread along the rim, besides those hugging trees and rocks. */
const RIM_CLUSTERS = 6;
const BUSHES_PER_RIM_CLUSTER = 3;

const TUFTS = 18;
const SPACING = 0.8;

export function islandLayout(seed: number = ISLAND.seed): Placement[] {
  const random = seededRandom(seed);
  const placed: Placement[] = [];

  const fits = (kind: NatureKind, x: number, z: number, scale: number) => {
    const { radius, clearance } = KIND_SPECS[kind];
    if (!insideIsland(x, z, Math.max(0.3, radius * scale * 0.6))) return false;
    if (onPad(x, z, clearance)) return false;
    return placed.every((other) => {
      if (KIND_SPECS[other.kind].floating) return true;
      const gap = Math.hypot(x - other.position[0], z - other.position[2]);
      const need =
        (radius * scale + KIND_SPECS[other.kind].radius * other.scale) *
        SPACING;
      return gap >= need;
    });
  };

  const tryPlace = (
    kind: NatureKind,
    x: number,
    z: number,
    jitter: number,
    attempts = 10,
  ) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const px = x + (random() - 0.5) * 2 * jitter;
      const pz = z + (random() - 0.5) * 2 * jitter;
      const scale = 0.85 + random() * 0.3;
      const rotationY = random() * Math.PI * 2;
      if (!fits(kind, px, pz, scale)) continue;
      // Rocks sit a little into the grass so they look embedded.
      const y = kind.startsWith("rock") ? -0.04 : 0;
      placed.push({ kind, position: [px, y, pz], rotationY, scale });
      return;
    }
  };

  for (const [kind, x, z] of ANCHORS) tryPlace(kind, x, z, 0.35);

  for (let i = 0; i < PATH_STONES; i++) {
    const t = i / (PATH_STONES - 1);
    const side = i % 2 === 0 ? -0.18 : 0.18;
    tryPlace(
      "stone",
      PATH_FROM[0] + (PATH_TO[0] - PATH_FROM[0]) * t + side,
      PATH_FROM[1] + (PATH_TO[1] - PATH_FROM[1]) * t - side,
      0.06,
    );
  }

  // Bushes hug the trees and rocks, then gather in clusters along the rim.
  const hosts = placed.filter((item) => /^(tree|pine|rock)/.test(item.kind));
  for (const host of hosts) {
    const angle = random() * Math.PI * 2;
    const reach =
      KIND_SPECS[host.kind].radius * host.scale + KIND_SPECS.bush.radius;
    tryPlace(
      "bush",
      host.position[0] + Math.cos(angle) * reach,
      host.position[2] + Math.sin(angle) * reach,
      0.2,
      4,
    );
  }
  for (let i = 0; i < RIM_CLUSTERS; i++) {
    const angle = ((i + random() * 0.5) / RIM_CLUSTERS) * Math.PI * 2;
    const reach = islandRadiusAt(angle) - 0.8;
    for (let j = 0; j < BUSHES_PER_RIM_CLUSTER; j++)
      tryPlace(
        "bush",
        Math.cos(angle) * reach,
        Math.sin(angle) * reach,
        0.5,
        4,
      );
  }

  let tufts = 0;
  for (let attempt = 0; attempt < 400 && tufts < TUFTS; attempt++) {
    const x = (random() - 0.5) * 2 * ISLAND.halfX;
    const z = (random() - 0.5) * 2 * ISLAND.halfZ;
    const before = placed.length;
    tryPlace("tuft-small", x, z, 0, 1);
    if (placed.length > before) tufts++;
  }

  for (const [x, y, z] of CLOUDS) {
    const puffs = 3 + Math.floor(random() * 3);
    const heading = random() * Math.PI * 2;
    for (let i = 0; i < puffs; i++) {
      // The first puff is the big middle one; the rest trail off both sides.
      const side = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2);
      const along = side * (0.9 + random() * 0.4);
      const across = (random() - 0.5) * 0.9;
      placed.push({
        kind: "cloud",
        position: [
          x + Math.cos(heading) * along - Math.sin(heading) * across,
          y + (random() - 0.5) * 0.35 - Math.abs(side) * 0.12,
          z + Math.sin(heading) * along + Math.cos(heading) * across,
        ],
        rotationY: random() * Math.PI * 2,
        scale: i === 0 ? 1.15 + random() * 0.25 : 0.55 + random() * 0.45,
      });
    }
  }

  return placed;
}
