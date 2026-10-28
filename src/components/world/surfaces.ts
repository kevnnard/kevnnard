import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  type Material,
  type MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from "three";
import type { Part } from "@/lib/world/house.ts";
import {
  SURFACES,
  type Surface,
  TEXTURE_URLS,
  TEXTURES,
  type TextureMap,
  textureUrl,
} from "@/lib/world/textures.ts";

export type SurfaceMaps = Record<Surface, Partial<Record<TextureMap, Texture>>>;

/**
 * Loads every map (suspends until they arrive) and returns owned clones set
 * to repeat once per tile in metres; the clones are disposed on unmount, the
 * loader's cached originals are never uploaded.
 */
export function useSurfaceMaps(): SurfaceMaps {
  const loaded = useLoader(TextureLoader, [...TEXTURE_URLS]);
  const maps = useMemo(() => {
    const byUrl = new Map(TEXTURE_URLS.map((url, i) => [url, loaded[i]]));
    return Object.fromEntries(
      SURFACES.map((surface) => [
        surface,
        Object.fromEntries(
          TEXTURES[surface].maps.map((map) => {
            const source = byUrl.get(textureUrl(surface, map));
            if (!source) throw new Error(`${surface} ${map} not loaded`);
            const texture = source.clone();
            texture.colorSpace =
              map === "color" ? SRGBColorSpace : NoColorSpace;
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            texture.repeat.setScalar(1 / TEXTURES[surface].tile);
            texture.anisotropy = 4;
            texture.needsUpdate = true;
            return [map, texture];
          }),
        ),
      ]),
    ) as SurfaceMaps;
  }, [loaded]);
  useEffect(
    () => () => {
      for (const set of Object.values(maps))
        for (const texture of Object.values(set)) texture?.dispose();
    },
    [maps],
  );
  return maps;
}

/**
 * A textured copy of a vertex-colored material. The color map is divided by
 * its mean luminance, so it only adds grain and board edges around the
 * pastel vertex colors (`strength` of the way). An opacity map cuts holes
 * (alpha test), shadows included.
 */
export function surfaceMaterial(
  source: MeshStandardMaterial,
  surface: Surface,
  maps: SurfaceMaps,
): MeshStandardMaterial {
  const { mean, strength, normalScale } = TEXTURES[surface];
  const luma = mean[0] * 0.2126 + mean[1] * 0.7152 + mean[2] * 0.0722;
  const set = maps[surface];
  const material = source.clone();
  material.map = set.color ?? null;
  material.normalMap = set.normal ?? null;
  material.normalScale.setScalar(normalScale);
  material.roughnessMap = set.roughness ?? null;
  if (set.opacity) {
    material.alphaMap = set.opacity;
    material.alphaTest = 0.5;
  }
  material.userData.surface = surface;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        float surfaceGrain = min( dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / ${luma.toFixed(5)}, 2.0 );
        diffuseColor.rgb *= mix( 1.0, surfaceGrain, ${strength.toFixed(3)} );
      #endif`,
    );
  };
  material.customProgramCacheKey = () => `surface-${surface}`;
  return material;
}

/** Parts grouped by surface; untextured parts under "flat". */
export function bySurface(parts: Part[]): Map<Surface | "flat", Part[]> {
  const groups = new Map<Surface | "flat", Part[]>();
  for (const part of parts) {
    const key = part.surface ?? "flat";
    const list = groups.get(key);
    if (list) list.push(part);
    else groups.set(key, [part]);
  }
  return groups;
}

/** The flat material, or its textured copy for a surface (cached per call site). */
export function materialFor(
  key: Surface | "flat",
  flat: MeshStandardMaterial,
  maps: SurfaceMaps | undefined,
  cache: Map<string, MeshStandardMaterial>,
  owned: Material[],
): MeshStandardMaterial {
  if (key === "flat" || !maps) return flat;
  let material = cache.get(key);
  if (!material) {
    material = surfaceMaterial(flat, key, maps);
    cache.set(key, material);
    owned.push(material);
  }
  return material;
}
