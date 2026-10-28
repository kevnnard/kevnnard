// Ground PBR layers (lawn → forest soil → rock) on plain three.js materials.
// UVs are world metres, so every surface shares one orientation and phase, and
// each texture repeats at its captured size. Pure enough to test without WebGL.
import {
  type BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  type Matrix4,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from "three";
import { WORLD } from "./forest-layout.ts";

export type GroundLayer = "grass" | "forest" | "rock";
export type MapKind = "color" | "normal" | "roughness";

/** Captured surface size in metres (Poly Haven `/info` dimensions, manifest). */
export const GROUND_SIZE: Record<GroundLayer, number> = {
  grass: 2.51,
  forest: 2,
  rock: 90,
};

export const groundUrls = (layer: GroundLayer) =>
  (["color", "normal", "roughness"] as const).map(
    (kind) => `/textures/ground/${layer}-${kind}.webp`,
  );

/**
 * Clone of `geometry` with `uv = (x, -z)` in world metres and the neutral
 * `groundShade` as RGB color, so it matches the terrain in phase and tone.
 * `(x, -z)` is the unmirrored orientation of a plane rotated flat, so the
 * shader-derived tangent frame keeps OpenGL normals upright. Positions,
 * normals and groups are copied unchanged; the input is never modified.
 */
export function worldUv(geometry: BufferGeometry, matrix?: Matrix4) {
  const result = geometry.clone();
  const uv = worldUvAttribute(geometry, matrix);
  const shade: number[] = [];
  for (let i = 0; i < uv.count; i++) {
    const value = groundShade(uv.getX(i), -uv.getY(i));
    shade.push(value, value, value);
  }
  result.setAttribute("uv", uv);
  result.setAttribute("color", new Float32BufferAttribute(shade, 3));
  return result;
}

function worldUvAttribute(geometry: BufferGeometry, matrix?: Matrix4) {
  const position = geometry.getAttribute("position");
  const point = new Vector3();
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    if (matrix) point.applyMatrix4(matrix);
    uv.push(point.x, -point.z);
  }
  return new Float32BufferAttribute(uv, 2);
}

const smooth = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Low-frequency, deterministic variation in [-1, 1]; periods of 55–200 m. */
export function macroVariation(x: number, z: number) {
  return (
    0.5 * Math.sin(x * 0.051 + z * 0.033) +
    0.3 * Math.sin(z * 0.071 - x * 0.027 + 1.7) +
    0.2 * Math.sin(x * 0.113 - z * 0.097 + 0.4)
  );
}

/**
 * Neutral brightness in [0.84, 1] shared by the lawn and the terrain. Periods
 * stay above ~70 m so the 4-vertex lawn top and the 8 m terrain grid
 * interpolate it to within one 8-bit step along the plot edge.
 */
export const groundShade = (x: number, z: number) =>
  0.92 + 0.08 * macroVariation(z * 0.8 + 40, x * 0.6);

/**
 * Overlay alphas over an opaque forest-soil base: rock is composited over
 * grass over soil, so weights are rock, (1 - rock)·grass, (1 - rock)(1 - grass).
 */
export function groundBlend(x: number, z: number, height: number) {
  const variation = macroVariation(x, z);
  return {
    grass: 1 - smooth(20, 46, Math.hypot(x, z) + variation * 7),
    rock: smooth(14, 34, height + variation * 6),
  };
}

/**
 * Three geometries over the same terrain. Each owns copies of the index,
 * position and normal (identical topology and coordinates), its world UVs and
 * an RGBA color with neutral macro brightness and its layer alpha, so
 * disposing a layer never frees `source` or a sibling. `source` is unchanged.
 */
export function terrainLayers(source: BufferGeometry) {
  const position = source.getAttribute("position");
  const colors = {
    forest: [] as number[],
    grass: [] as number[],
    rock: [] as number[],
  };
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const blend = groundBlend(x, z, position.getY(i) - WORLD.groundY);
    const shade = groundShade(x, z);
    colors.forest.push(shade, shade, shade, 1);
    colors.grass.push(shade, shade, shade, blend.grass);
    colors.rock.push(shade, shade, shade, blend.rock);
  }
  const layer = (color: number[]) => {
    const geometry = new BufferGeometry();
    geometry.setIndex(source.getIndex()?.clone() ?? null);
    for (const name of ["position", "normal"])
      geometry.setAttribute(
        name,
        (source.getAttribute(name) as BufferAttribute).clone(),
      );
    geometry.setAttribute("uv", worldUvAttribute(source));
    geometry.setAttribute("color", new Float32BufferAttribute(color, 4));
    geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
    return geometry;
  };
  return {
    forest: layer(colors.forest),
    grass: layer(colors.grass),
    rock: layer(colors.rock),
  };
}

/**
 * Standard PBR material for one layer. Textures are cloned so the cached
 * loader images stay shared and untouched; `dispose` frees only the clones.
 */
export function groundMaterial(
  layer: GroundLayer,
  maps: Record<MapKind, Texture>,
  {
    anisotropy,
    vertexColors = false,
    overlay = false,
  }: { anisotropy: number; vertexColors?: boolean; overlay?: boolean },
) {
  const own = (kind: MapKind) => {
    const texture = maps[kind].clone();
    texture.colorSpace = kind === "color" ? SRGBColorSpace : NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.setScalar(1 / GROUND_SIZE[layer]);
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  };
  const textures = [own("color"), own("normal"), own("roughness")];
  const material = new MeshStandardMaterial({
    map: textures[0],
    normalMap: textures[1],
    roughnessMap: textures[2],
    roughness: 1,
    metalness: 0,
    vertexColors,
    // Overlays redraw the same surface; blend without fighting its depth.
    transparent: overlay,
    depthWrite: !overlay,
    polygonOffset: overlay,
    polygonOffsetFactor: overlay ? -1 : 0,
    polygonOffsetUnits: overlay ? -1 : 0,
  });
  return {
    material,
    dispose() {
      material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}

/** Opaque lawn grass, shaded by the vertex `groundShade` like the terrain. */
export const lawnMaterial = (
  maps: Record<MapKind, Texture>,
  anisotropy: number,
) => groundMaterial("grass", maps, { anisotropy, vertexColors: true });
