import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  type Group,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { cutaway } from "@/lib/world/cutaway.ts";
import {
  HOUSE_COLORS,
  HOUSE_GROUPS,
  type HouseGroup,
  houseMeshes,
  type Part,
} from "@/lib/world/house.ts";

/** Object names, one per cutaway group. */
export const HOUSE_NAMES = Object.fromEntries(
  HOUSE_GROUPS.map((group) => [group, `house-${group}`]),
) as Record<HouseGroup, string>;

/** Fully faded groups are hidden, so they stop casting shadows too. */
const HIDDEN = 0.995;
/** Fade easing rate per second; the camera is already smoothed. */
const EASE = 12;

/**
 * Screen-door transparency: a 4x4 ordered dither discards a `uFade` share of
 * the pixels. Stays opaque (no sorting) and keeps the vertex colors.
 */
function cutawayMaterial(
  source: MeshStandardMaterial,
  fade: { value: number },
): MeshStandardMaterial {
  const material = source.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform float uFade;
        float cutawayBayer2(vec2 a) {
          a = floor(a);
          return fract(a.x / 2.0 + a.y * a.y * 0.75);
        }
        void main() {`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        vec2 cutawayCell = gl_FragCoord.xy;
        if (cutawayBayer2(0.5 * cutawayCell) * 0.25 + cutawayBayer2(cutawayCell) < uFade) discard;`,
      );
  };
  material.customProgramCacheKey = () =>
    `house-cutaway-${source.transparent ? "glass" : "wood"}`;
  return material;
}

const scratch = {
  matrix: new Matrix4(),
  normals: new Matrix3(),
  rotation: new Quaternion(),
  euler: new Euler(),
  center: new Vector3(),
  scale: new Vector3(),
  vertex: new Vector3(),
  color: new Color(),
};

/** Merges the parts into one vertex-colored geometry: one draw per mesh. */
export function mergeParts(parts: Part[]): BufferGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const round = new CylinderGeometry(0.5, 0.5, 1, 10);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const source = part.shape === "box" ? box : round;
    const { matrix, normals: normalMatrix, vertex, color } = scratch;
    scratch.rotation.setFromEuler(
      scratch.euler.set(...(part.rotation ?? [0, 0, 0])),
    );
    matrix.compose(
      scratch.center.set(...part.center),
      scratch.rotation,
      scratch.scale.set(...part.size),
    );
    normalMatrix.getNormalMatrix(matrix);
    color.set(part.color).multiplyScalar(part.shade);
    const base = positions.length / 3;
    const position = source.getAttribute("position");
    const normal = source.getAttribute("normal");
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      vertex.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix);
      vertex.normalize();
      normals.push(vertex.x, vertex.y, vertex.z);
      colors.push(color.r, color.g, color.b);
    }
    const index = source.getIndex();
    if (index)
      for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
  }
  box.dispose();
  round.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(normals), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

interface FadeGroup {
  object: Object3D;
  fade: { value: number };
}

/**
 * Original procedural wooden house and garage on the island pad. Walls,
 * floor and roof cast and receive shadows; the glass does not, so the sun
 * by day and the moon by night draw window patches on the empty floor.
 * Zooming in dissolves the roofs and camera-facing walls (T4c).
 */
export default function House({ reducedMotion }: { reducedMotion: boolean }) {
  const { group, materials, fades } = useMemo(() => {
    const wood = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    });
    const glass = new MeshStandardMaterial({
      color: HOUSE_COLORS.glass,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const owned: MeshStandardMaterial[] = [wood, glass];
    const fading = new Map<HouseGroup, FadeGroup>();
    const meshes = houseMeshes();
    const house = new Object3D() as Group;
    house.name = "house";
    for (const name of HOUSE_GROUPS) {
      const part = new Object3D();
      part.name = HOUSE_NAMES[name];
      const fade = { value: 0 };
      const [solidMaterial, glassMaterial] =
        name === "base"
          ? [wood, glass]
          : [cutawayMaterial(wood, fade), cutawayMaterial(glass, fade)];
      if (name !== "base") {
        owned.push(solidMaterial, glassMaterial);
        fading.set(name, { object: part, fade });
      }
      const solid = new Mesh(mergeParts(meshes[name].wood), solidMaterial);
      solid.castShadow = true;
      solid.receiveShadow = true;
      part.add(solid);
      if (meshes[name].glass.length > 0) {
        const panes = new Mesh(mergeParts(meshes[name].glass), glassMaterial);
        panes.castShadow = false;
        panes.receiveShadow = false;
        panes.renderOrder = 1;
        part.add(panes);
      }
      house.add(part);
    }
    return { group: house, materials: owned, fades: fading };
  }, []);

  const position = useRef<[number, number, number]>([0, 0, 0]);
  useFrame(({ camera, invalidate }, delta) => {
    const { x, y, z } = camera.position;
    position.current[0] = x;
    position.current[1] = y;
    position.current[2] = z;
    const targets = cutaway(position.current);
    const step = reducedMotion ? 1 : 1 - Math.exp(-EASE * delta);
    let moving = false;
    for (const [name, { object, fade }] of fades) {
      const target = targets[name];
      const next = fade.value + (target - fade.value) * step;
      fade.value = Math.abs(target - next) < 1e-3 ? target : next;
      if (fade.value !== target) moving = true;
      object.visible = fade.value < HIDDEN;
    }
    // Demand frameloop: keep rendering only while a fade is still easing.
    if (moving) invalidate();
  });

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
    [group, materials],
  );

  return <primitive object={group} />;
}
