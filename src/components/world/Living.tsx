import { useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  type Group,
  type Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  Object3D,
  Quaternion,
  type Texture,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeParts } from "@/components/world/House";
import { proceduralNormal, setupMaterial } from "@/components/world/Setup";
import { pastelMaterial, type SurfaceMaps } from "@/components/world/surfaces";
import { glowPower } from "@/lib/world/lights.ts";
import {
  LIVING_FILES,
  LIVING_MATERIALS,
  LIVING_MODELS,
  type LivingMaterialId,
  type LivingPart,
  livingGlow,
  livingMeshes,
  livingOcclusion,
  type ModelPlacement,
} from "@/lib/world/living.ts";
import { boxUv, TEXTURES } from "@/lib/world/textures.ts";

const URLS = LIVING_MODELS.map((model) => LIVING_FILES[model.kind]);
const ROUND_SEGMENTS = 16;
const UP = new Vector3(0, 1, 0);

const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

type Owned = { materials: Material[]; textures: Texture[] };

/**
 * Bakes a pack model into world space at its placement: stretched to its
 * size, base on its centre. Keeps the atlas UVs, adds box-projected `uv1` in
 * world metres for the wood grain and fabric weave, and vertex AO colors.
 */
function bakeModel(root: Object3D, model: ModelPlacement): BufferGeometry {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const placement = new Matrix4()
    .compose(
      new Vector3(...model.center),
      new Quaternion().setFromAxisAngle(UP, model.yaw),
      new Vector3(
        model.size[0] / size.x,
        model.size[1] / size.y,
        model.size[2] / size.z,
      ),
    )
    .multiply(new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  const out = {
    position: [] as number[],
    normal: [] as number[],
    color: [] as number[],
    uv: [] as number[],
    uv1: [] as number[],
    index: [] as number[],
  };
  const vertex = new Vector3();
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const matrix = placement.clone().multiply(mesh.matrixWorld);
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    const { geometry } = mesh;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    const base = out.position.length / 3;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      const world: [number, number, number] = [vertex.x, vertex.y, vertex.z];
      vertex.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix);
      vertex.normalize();
      const facing: [number, number, number] = [vertex.x, vertex.y, vertex.z];
      const ao = livingOcclusion(world, facing);
      out.position.push(...world);
      out.normal.push(...facing);
      out.color.push(ao, ao, ao);
      out.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      out.uv1.push(...boxUv(world, facing));
    }
    const index = geometry.getIndex();
    if (index)
      for (let i = 0; i < index.count; i++)
        out.index.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i++) out.index.push(base + i);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(out.position), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(out.normal), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(out.color), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(out.uv), 2));
  geometry.setAttribute(
    "uv1",
    new BufferAttribute(new Float32Array(out.uv1), 2),
  );
  geometry.setIndex(out.index);
  geometry.computeBoundingSphere();
  return geometry;
}

/** A clone of `source` on the second UV set (world metres). */
function onWorldUv(source: Texture | undefined, owned: Owned) {
  if (!source) return null;
  const texture = source.clone();
  texture.channel = 1;
  texture.needsUpdate = true;
  owned.textures.push(texture);
  return texture;
}

/**
 * The pack material through the house's pastel tint, with vertex AO. Wood
 * pieces add the plank normal and roughness maps plus the plank color as
 * grain over the atlas color; fabric pieces add the procedural weave normal.
 */
function modelMaterial(
  source: Material,
  model: ModelPlacement,
  maps: SurfaceMaps | undefined,
  owned: Owned,
): MeshStandardMaterial {
  const material = pastelMaterial(source, model.tint) as MeshStandardMaterial;
  material.vertexColors = true;
  material.roughness = model.roughness;
  let grain: Texture | null = null;
  if (model.surface && maps) {
    const set = maps[model.surface];
    material.normalMap = onWorldUv(set.normal, owned);
    material.normalScale.setScalar(TEXTURES[model.surface].normalScale);
    material.roughnessMap = onWorldUv(set.roughness, owned);
    grain = onWorldUv(set.color, owned);
  } else if (model.normal && model.tile) {
    const normal = proceduralNormal({
      roughness: model.roughness,
      metalness: 0,
      normal: model.normal,
      tile: [model.tile, model.tile],
    });
    if (normal) {
      normal.channel = 1;
      owned.textures.push(normal);
      material.normalMap = normal;
      material.normalScale.setScalar(model.normalScale ?? 1);
    }
  }
  const pastel = material.onBeforeCompile;
  const surface = model.surface && TEXTURES[model.surface];
  material.onBeforeCompile = (shader, renderer) => {
    pastel.call(material, shader, renderer);
    if (!grain || !surface) return;
    const [r, g, b] = surface.mean;
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    shader.uniforms.grainMap = { value: grain };
    shader.fragmentShader =
      `uniform sampler2D grainMap;\n${shader.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float livingGrain = min( dot( texture2D( grainMap, vNormalMapUv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) / ${luma.toFixed(5)}, 2.0 );
      diffuseColor.rgb *= mix( 1.0, livingGrain, ${surface.strength.toFixed(3)} );`,
      );
  };
  material.customProgramCacheKey = () =>
    `living-${model.kind}-${grain ? "grain" : "flat"}`;
  owned.materials.push(material);
  return material;
}

/**
 * Living area (T4j): KayKit sofa, coffee table, TV bench, rug, books and
 * cactus baked at their placements, plus the original TV, controller, game
 * cases and plants merged into one mesh per material and one unlit glow mesh
 * (screen and light bar) scaled by the hour. Lives outside the cutaway
 * groups, so it never fades.
 */
export default function Living({
  hours,
  maps,
  power = true,
}: {
  hours: number;
  maps?: SurfaceMaps;
  /** The scene panel's master switch: off at night darkens the screen. */
  power?: boolean;
}) {
  const { invalidate } = useThree();
  const gltfs = useLoader(GLTFLoader, URLS, extendLoader);
  const { group, glow, owned } = useMemo(() => {
    const owned: Owned = { materials: [], textures: [] };
    const living = new Object3D() as Group;
    living.name = "living-interior";
    LIVING_MODELS.forEach((model, index) => {
      const root = gltfs[index].scene;
      let source: Material | null = null;
      root.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh && !source) source = mesh.material as Material;
      });
      if (!source) throw new Error(`${model.kind} has no mesh`);
      const mesh = new Mesh(
        bakeModel(root, model),
        modelMaterial(source, model, maps, owned),
      );
      mesh.name = `living-${model.kind}`;
      mesh.castShadow = model.kind !== "rug";
      mesh.receiveShadow = true;
      living.add(mesh);
    });
    const meshes = livingMeshes();
    const groups = new Map<LivingMaterialId, LivingPart[]>();
    for (const part of meshes.solid) {
      const list = groups.get(part.material);
      if (list) list.push(part);
      else groups.set(part.material, [part]);
    }
    for (const [id, list] of groups) {
      const mesh = new Mesh(
        mergeParts(list, {
          roundSegments: ROUND_SEGMENTS,
          occlusion: livingOcclusion,
        }),
        setupMaterial(LIVING_MATERIALS[id], undefined, owned),
      );
      mesh.name = `living-${id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      living.add(mesh);
    }
    const glow = new MeshBasicMaterial({ vertexColors: true });
    owned.materials.push(glow);
    const screen = new Mesh(
      mergeParts(meshes.glow, { roundSegments: ROUND_SEGMENTS }),
      glow,
    );
    screen.name = "living-glow";
    living.add(screen);
    return { group: living, glow, owned };
  }, [gltfs, maps]);

  const level = livingGlow(hours) * glowPower(power, hours);
  useLayoutEffect(() => {
    glow.color.setScalar(level);
    invalidate();
  }, [glow, level, invalidate]);

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
