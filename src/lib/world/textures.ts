// Stylized CC0 textures for the house and the gaming chair (T4e, S9), from
// StylizedTextures by CreativeTrio. scripts/prepare-world.py ships them as
// 1024 WebP maps in public/world/textures/ and credits each file. Pure numbers
// here; the components load the maps and patch the materials.

export const SURFACES = ["planks", "floor", "shingles", "leather"] as const;
export type Surface = (typeof SURFACES)[number];

export const TEXTURE_MAPS = ["color", "normal", "roughness"] as const;
export type TextureMap = (typeof TEXTURE_MAPS)[number];

export interface SurfaceTexture {
  /** StylizedTextures material name: files are `<name>-<map>.webp`. */
  name: string;
  /** Metres covered by one repeat of the map. */
  tile: number;
  /**
   * Mean linear RGB of the color map (recorded in credits.json). The shader
   * divides by it, so the map adds grain around the pastel vertex colors
   * instead of replacing them.
   */
  mean: [number, number, number];
  /** 0 keeps the flat vertex color, 1 applies the full normalized map. */
  strength: number;
  /** Normal map strength: modest, to keep the stylized look. */
  normalScale: number;
}

export const TEXTURES: Record<Surface, SurfaceTexture> = {
  // About ten boards per repeat: roughly the 0.17 m wall planks.
  planks: {
    name: "Stylized_Wood_Planks_001",
    tile: 1.7,
    mean: [0.04, 0.0167, 0.0047],
    strength: 0.75,
    normalScale: 0.6,
  },
  floor: {
    name: "Stylized_Wood_Floor_001",
    tile: 1.8,
    mean: [0.1641, 0.0779, 0.0533],
    strength: 0.7,
    normalScale: 0.5,
  },
  // About ten scale rows per repeat, close to the 0.24 m shingle rows.
  shingles: {
    name: "Stylized_Wood_Shingles_001",
    tile: 2.4,
    mean: [0.097, 0.1579, 0.4217],
    strength: 0.6,
    normalScale: 0.6,
  },
  leather: {
    name: "Stylized_Leather_Patch_001",
    tile: 0.6,
    mean: [0.2299, 0.1499, 0.1204],
    strength: 0.55,
    normalScale: 0.6,
  },
};

/** Shipped file for a map, relative to public/world/. */
export const textureFile = (surface: Surface, map: TextureMap) =>
  `textures/${TEXTURES[surface].name}-${map}.webp`;

/** Every map the runtime loads, as site URLs. */
export const TEXTURE_URLS: readonly string[] = SURFACES.flatMap((surface) =>
  TEXTURE_MAPS.map((map) => `/world/${textureFile(surface, map)}`),
);

/**
 * Box projection in world metres: walls use their horizontal run and height,
 * so boards stay horizontal; up-facing faces use x and the down-slope
 * direction, so roof shingles point down both slopes.
 */
export function boxUv(
  [x, y, z]: readonly [number, number, number],
  [nx, ny, nz]: readonly [number, number, number],
): [number, number] {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [x, nz < 0 ? z : -z];
  if (ax >= az) return [z, y];
  return [x, y];
}
