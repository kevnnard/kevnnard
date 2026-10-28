// Stylized CC0 textures for the house and the gaming setup (T4e S9, T4g S11), from
// StylizedTextures by CreativeTrio. scripts/prepare-world.py ships them as
// 1024 WebP maps in public/world/textures/ and credits each file. Pure numbers
// here; the components load the maps and patch the materials.

export const SURFACES = [
  "planks",
  "floor",
  "shingles",
  "leather",
  "grille",
  "panel",
] as const;
export type Surface = (typeof SURFACES)[number];

/** Surfaces added for the gaming setup (T4g): their own 2.5 MB budget. */
export const SETUP_SURFACES: readonly Surface[] = ["grille", "panel"];

export const TEXTURE_MAPS = [
  "color",
  "normal",
  "roughness",
  "opacity",
] as const;
export type TextureMap = (typeof TEXTURE_MAPS)[number];

const PBR: readonly TextureMap[] = ["color", "normal", "roughness"];

export interface SurfaceTexture {
  /** StylizedTextures material name: files are `<name>-<map>.webp`. */
  name: string;
  /** Shipped maps; `opacity` is an alpha mask (alpha test). */
  maps: readonly TextureMap[];
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
  // About ten boards per repeat, larger than the geometric wall planks and
  // at low contrast (T4h): grain rather than a second set of boards.
  planks: {
    name: "Stylized_Wood_Planks_001",
    maps: PBR,
    tile: 2.4,
    mean: [0.04, 0.0167, 0.0047],
    strength: 0.45,
    normalScale: 0.6,
  },
  // The plank maps again (shared files), at the 0.28 m floor board width:
  // up faces project x along u, so the boards run with the floor boards.
  floor: {
    name: "Stylized_Wood_Planks_001",
    maps: PBR,
    tile: 2.8,
    mean: [0.04, 0.0167, 0.0047],
    strength: 0.4,
    normalScale: 0.5,
  },
  // About ten scale rows per repeat, close to the 0.24 m shingle rows.
  shingles: {
    name: "Stylized_Wood_Shingles_001",
    maps: PBR,
    tile: 2.4,
    mean: [0.097, 0.1579, 0.4217],
    strength: 0.6,
    normalScale: 0.6,
  },
  leather: {
    name: "Stylized_Leather_Patch_001",
    maps: PBR,
    tile: 0.6,
    mean: [0.2299, 0.1499, 0.1204],
    strength: 0.35,
    normalScale: 0.6,
  },
  // Speaker grilles: perforated, so the cones show through the holes.
  grille: {
    name: "Metal_Mesh_009",
    maps: [...PBR, "opacity"],
    tile: 0.12,
    mean: [0.0056, 0.0077, 0.1869],
    strength: 0.5,
    normalScale: 0.6,
  },
  // PC case side and front, at a small scale.
  panel: {
    name: "Stylized_Sci_fi_Metal_Panel_001",
    maps: PBR,
    tile: 0.3,
    mean: [0.0158, 0.1591, 0.4758],
    strength: 0.5,
    normalScale: 0.5,
  },
};

/** Shipped file for a map, relative to public/world/. */
export const textureFile = (surface: Surface, map: TextureMap) =>
  `textures/${TEXTURES[surface].name}-${map}.webp`;

/** Site URL of a surface's map; surfaces may share files. */
export const textureUrl = (surface: Surface, map: TextureMap) =>
  `/world/${textureFile(surface, map)}`;

/** Every map the runtime loads, once each, as site URLs. */
export const TEXTURE_URLS: readonly string[] = [
  ...new Set(
    SURFACES.flatMap((surface) =>
      TEXTURES[surface].maps.map((map) => textureUrl(surface, map)),
    ),
  ),
];

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
