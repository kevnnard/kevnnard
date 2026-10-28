// Scenery never contributes to home framing or camera target boundaries.
export const WORLD = {
  size: 2400,
  far: 700,
  fogStart: 85,
  fogEnd: 360,
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

/** Fixed seed: no changes on clock ticks, remounts or camera movement. */
export function forestTrees(): ForestTree[] {
  let seed = 1937;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rings = [
    [32, 12],
    [48, 18],
    [68, 30],
    [94, 44],
    [125, 62],
    [160, 84],
    [205, 110],
  ];
  const trees: ForestTree[] = [];
  rings.forEach(([radius, count], ring) => {
    for (let i = 0; i < count; i++) {
      const angle = ((i + random() * 0.4) / count) * Math.PI * 2 + ring * 0.51;
      const distance = radius + (random() - 0.5) * 6;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      // Keep the open cutaway and initial overview approach readable.
      if (x < -5 && z > 5 && distance < 75) continue;
      trees.push({
        x,
        z,
        height: 11 + random() * 9,
        yaw: random() * Math.PI * 2,
        species: (i + ring) % 2 ? "pine" : "fir",
        lod: ring === 0 ? "near" : "far",
      });
    }
  });
  return trees;
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
