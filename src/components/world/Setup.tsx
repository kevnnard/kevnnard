import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  BackSide,
  DataTexture,
  type Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  type Texture,
} from "three";
import { mergeParts } from "@/components/world/House";
import { type SurfaceMaps, surfaceMaterial } from "@/components/world/surfaces";
import { NORMAL_SIZE, normalPixels } from "@/lib/world/normals.ts";
import {
  SETUP_COLORS,
  SETUP_MATERIALS,
  SETUP_ROUND_SEGMENTS,
  type SetupMaterial,
  type SetupMaterialId,
  type SetupPart,
  setupGlow,
  setupMeshes,
  setupOcclusion,
} from "@/lib/world/setup.ts";

const SOLID_MERGE = {
  roundSegments: SETUP_ROUND_SEGMENTS,
  occlusion: setupOcclusion,
};

/** An owned DataTexture over a cached procedural normal map, tiled in metres. */
function proceduralNormal(spec: SetupMaterial): Texture | null {
  if (!spec.normal || !spec.tile) return null;
  const texture = new DataTexture(
    normalPixels(spec.normal),
    NORMAL_SIZE,
    NORMAL_SIZE,
  );
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
  if (spec.offset) texture.offset.set(...spec.offset);
  texture.needsUpdate = true;
  return texture;
}

/** One material per setup material id; textures it creates join `owned`. */
function setupMaterial(
  spec: SetupMaterial,
  maps: SurfaceMaps | undefined,
  owned: { materials: Material[]; textures: Texture[] },
): MeshStandardMaterial {
  const params = {
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    shadowSide: BackSide,
  };
  const base = spec.clearcoat
    ? new MeshPhysicalMaterial({
        ...params,
        clearcoat: spec.clearcoat,
        clearcoatRoughness: 0.4,
      })
    : new MeshStandardMaterial(params);
  const normal = proceduralNormal(spec);
  if (normal) {
    base.normalMap = normal;
    base.normalScale.setScalar(spec.normalScale ?? 1);
    owned.textures.push(normal);
  }
  if (!spec.surface || !maps) {
    owned.materials.push(base);
    return base;
  }
  const textured = surfaceMaterial(base, spec.surface, maps);
  base.dispose();
  owned.materials.push(textured);
  return textured;
}

/**
 * Original procedural gaming setup in the main room (T4d). Lives outside the
 * cutaway groups, so it never fades. Screens and RGB are unlit vertex colors
 * scaled by the hour: no extra lights. Solid parts merge into one mesh per
 * material (T4g): laminate, powder coat, satin and matte plastics, keycaps,
 * cones and cloth with original procedural normals, and with `maps` the
 * leather chair, mesh grilles and sci-fi PC panels. Grilles wait for their
 * opacity map, so the flat fallback never hides the cones.
 */
export default function Setup({
  hours,
  maps,
}: {
  hours: number;
  maps?: SurfaceMaps;
}) {
  const { invalidate } = useThree();
  const { group, glow, owned } = useMemo(() => {
    const meshes = setupMeshes();
    const owned = { materials: [] as Material[], textures: [] as Texture[] };
    const screens = new MeshBasicMaterial({ vertexColors: true });
    const glass = new MeshStandardMaterial({
      color: SETUP_COLORS.glass,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    owned.materials.push(screens, glass);
    const setup = new Object3D() as Group;
    setup.name = "house-interior";
    const groups = new Map<SetupMaterialId, SetupPart[]>();
    for (const part of meshes.solid) {
      const list = groups.get(part.material);
      if (list) list.push(part);
      else groups.set(part.material, [part]);
    }
    for (const [id, parts] of groups) {
      const spec: SetupMaterial = SETUP_MATERIALS[id];
      if (id === "grille" && !maps) continue;
      const body = new Mesh(
        mergeParts(parts, SOLID_MERGE),
        setupMaterial(spec, maps, owned),
      );
      body.name = `setup-${id}`;
      body.castShadow = true;
      body.receiveShadow = true;
      setup.add(body);
    }
    const lit = new Mesh(
      mergeParts(meshes.glow, { roundSegments: SETUP_ROUND_SEGMENTS }),
      screens,
    );
    const pane = new Mesh(mergeParts(meshes.glass), glass);
    pane.renderOrder = 1;
    setup.add(lit, pane);
    return { group: setup, glow: screens, owned };
  }, [maps]);

  useLayoutEffect(() => {
    glow.color.setScalar(setupGlow(hours));
    invalidate();
  }, [hours, glow, invalidate]);

  useEffect(
    () => () => {
      for (const material of owned.materials) material.dispose();
      for (const texture of owned.textures) texture.dispose();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
    [group, owned],
  );

  return <primitive object={group} />;
}
