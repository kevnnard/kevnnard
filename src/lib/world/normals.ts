// Original procedural normal maps for the gaming setup (T4g, S11): a fine
// noise for powder coat and plastics, concentric speaker-cone rings, a fabric
// weave for the mousepad, a rounded keycap, football pebble grain (T10) and
// wood grain for the copper desk (T12), with its matching colour map. Pure
// pixels, generated once per pattern and cached; Setup.tsx wraps them in
// owned DataTextures.

export const NORMAL_PATTERNS = [
  "noise",
  "radial",
  "weave",
  "keycap",
  "pebble",
  "grain",
] as const;
export type NormalPattern = (typeof NORMAL_PATTERNS)[number];

/** Pixels per side: tileable, power of two for mipmaps. */
export const NORMAL_SIZE = 128;

/** Integer hash of a lattice point, in [0, 1). */
function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise with `period` cells per tile, wrapping at the edges. */
function noise(u: number, v: number, period: number) {
  const x = u * period;
  const y = v * period;
  const [x0, y0] = [Math.floor(x), Math.floor(y)];
  const [fx, fy] = [x - x0, y - y0];
  const [sx, sy] = [fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)];
  const at = (i: number, j: number) =>
    hash((x0 + i) % period, (y0 + j) % period);
  const a = at(0, 0) + (at(1, 0) - at(0, 0)) * sx;
  const b = at(0, 1) + (at(1, 1) - at(0, 1)) * sx;
  return a + (b - a) * sy;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Height in [0, 1] at tile coordinates u, v in [0, 1); `slope` scales it. */
const HEIGHTS: Record<
  NormalPattern,
  { slope: number; height: (u: number, v: number) => number }
> = {
  noise: {
    slope: 3,
    height: (u, v) => 0.65 * noise(u, v, 16) + 0.35 * noise(u, v, 32),
  },
  // A shallow cone with ripples, centred in the tile and flat past its rim.
  radial: {
    slope: 4,
    height: (u, v) => {
      const r = Math.min(Math.hypot(u - 0.5, v - 0.5) * 2, 1);
      return r + 0.04 * Math.sin(r * Math.PI * 14) * (1 - r);
    },
  },
  // Eight threads per tile, over-under: each thread bulges where it crosses
  // on top and dips where it passes under.
  weave: {
    slope: 10,
    height: (u, v) => {
      const [x, y] = [u * 8, v * 8];
      const [cx, cy] = [Math.floor(x), Math.floor(y)];
      const over = (cx + cy) % 2 === 0;
      const warp = Math.sin(Math.PI * (x - cx)) * (over ? 1 : 0.55);
      const weft = Math.sin(Math.PI * (y - cy)) * (over ? 0.55 : 1);
      return Math.max(warp, weft);
    },
  },
  // One key per tile: flat top with a light dish, rounded shoulders, gap.
  keycap: {
    slope: 6,
    height: (u, v) => {
      const [x, y] = [Math.abs(u - 0.5), Math.abs(v - 0.5)];
      const d = (x ** 4 + y ** 4) ** 0.25;
      return smooth(0.47, 0.34, d) * (1 - 0.3 * (x * x + y * y));
    },
  },
  // Leather pebbling: rounded bumps with narrow valleys between them.
  // Shallow grooves along the darker latewood rings.
  grain: { slope: 0.8, height: (u, v) => 1 - grain(u, v) },
  pebble: {
    slope: 2.5,
    height: (u, v) =>
      smooth(0.3, 0.7, noise(u, v, 24)) * 0.8 + 0.2 * noise(u, v, 48),
  },
};

/**
 * Wood grain in [0, 1]: six growth rings across u, wobbling slowly along v,
 * plus fine fibres. Wraps on both axes (whole ring counts, periodic noise).
 */
function grain(u: number, v: number) {
  const wobble = 1.4 * noise(u, v, 4) + 0.35 * noise(u, v, 12);
  const rings = 0.5 + 0.5 * Math.sin(2 * Math.PI * (6 * u + wobble));
  return 0.75 * rings ** 3 + 0.25 * noise(u, v, 48);
}

const cache = new Map<NormalPattern, Uint8Array>();

/** RGBA tangent-space normals (z up), generated once per pattern. */
export function normalPixels(pattern: NormalPattern): Uint8Array {
  const cached = cache.get(pattern);
  if (cached) return cached;
  const n = NORMAL_SIZE;
  const { slope, height } = HEIGHTS[pattern];
  const h = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) h[y * n + x] = height(x / n, y / n);
  const at = (x: number, y: number) => h[((y + n) % n) * n + ((x + n) % n)];
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = ((at(x + 1, y) - at(x - 1, y)) * slope * n) / 64;
      const dy = ((at(x, y + 1) - at(x, y - 1)) * slope * n) / 64;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      data[i] = Math.round((-dx / length + 1) * 127.5);
      data[i + 1] = Math.round((-dy / length + 1) * 127.5);
      data[i + 2] = Math.round((1 / length + 1) * 127.5);
      data[i + 3] = 255;
    }
  cache.set(pattern, data);
  return data;
}

let grainCache: Uint8Array | undefined;

/**
 * Wood grain colour multiplier (T12), same tiling as the "grain" normals:
 * 1 on the light earlywood, about 0.7 on the latewood streaks, so the
 * copper vertex colours keep their tone and gain visible grain.
 */
export function woodGrainPixels(): Uint8Array {
  if (grainCache) return grainCache;
  const n = NORMAL_SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const value = Math.round(255 * (1 - 0.3 * grain(x / n, y / n)));
      const i = (y * n + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  grainCache = data;
  return data;
}
