import { useEffect, useMemo } from "react";
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
import {
  HOUSE_COLORS,
  HOUSE_GROUPS,
  type HouseGroup,
  houseMeshes,
  type Part,
} from "@/lib/world/house.ts";

/** Object names, so a later cutaway can hide the camera-facing walls. */
export const HOUSE_NAMES: Record<HouseGroup, string> = {
  shell: "house-shell",
  wallFront: "house-wall-front",
  wallRight: "house-wall-right",
  roof: "house-roof",
};

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
function mergeParts(parts: Part[]): BufferGeometry {
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

/**
 * Original procedural wooden house and garage on the island pad. Walls,
 * floor and roof cast and receive shadows; the glass does not, so the sun
 * by day and the moon by night draw window patches on the empty floor.
 */
export default function House() {
  const { group, materials } = useMemo(() => {
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
    const meshes = houseMeshes();
    const house = new Object3D() as Group;
    house.name = "house";
    for (const name of HOUSE_GROUPS) {
      const part = new Object3D();
      part.name = HOUSE_NAMES[name];
      const solid = new Mesh(mergeParts(meshes[name].wood), wood);
      solid.castShadow = true;
      solid.receiveShadow = true;
      part.add(solid);
      if (meshes[name].glass.length > 0) {
        const panes = new Mesh(mergeParts(meshes[name].glass), glass);
        panes.castShadow = false;
        panes.receiveShadow = false;
        panes.renderOrder = 1;
        part.add(panes);
      }
      house.add(part);
    }
    return { group: house, materials: [wood, glass] };
  }, []);

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
