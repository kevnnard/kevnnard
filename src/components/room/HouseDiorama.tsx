import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  type InstancedMesh,
  LineBasicMaterial,
  type Material,
  MeshStandardMaterial,
  Object3D,
  Shape,
} from "three";
import {
  type Box,
  BUSHES,
  type Finish,
  LEVELS,
  PARKING,
  PARTS,
  PLOT,
  type Plant,
  ROOF,
  TREES,
  type Vec3,
} from "@/lib/room/house-layout.ts";

// Warm, matte finishes so the shell stays quieter than the original room.
const FINISHES: Record<Finish, string> = {
  concrete: "#b7afa3",
  plaster: "#e6d9c6",
  trim: "#6e5a4a",
  glass: "#3b4b58",
  door: "#7a4c34",
  roof: "#8b4f3f",
  paving: "#c8bba5",
  deck: "#a67a55",
  wood: "#86603f",
  hedge: "#4e7a3d",
};

interface Instance {
  position: Vec3;
  scale: Vec3;
  rotation?: number;
  color?: string;
}

// Seeded per plant so the low-poly foliage varies without randomness.
const FOLIAGE = ["#5f9247", "#4f8240", "#6a9a4c", "#57873f"];
const shade = (plant: Plant, i: number) =>
  FOLIAGE[(i * 3 + plant.kind.length) % 4];
const ground = LEVELS.terrainTop;

// Every box is the shared unit cube, moved to its center and scaled to size.
type Tuple = [number, number, number];
const centerOf = ({ min, max }: Box) =>
  [0, 1, 2].map((i) => (min[i] + max[i]) / 2) as Tuple;
const sizeOf = ({ min, max }: Box) =>
  [0, 1, 2].map((i) => max[i] - min[i]) as Tuple;

const trunks: Instance[] = TREES.map((tree) => {
  const height = tree.height * (tree.kind === "cone" ? 0.3 : 0.5);
  return {
    position: [tree.x, ground, tree.z],
    scale: [tree.radius, height, tree.radius],
  };
});
const crowns: Instance[] = TREES.filter((tree) => tree.kind === "round").map(
  (tree, i) => ({
    position: [tree.x, ground + tree.height - tree.radius * 0.9, tree.z],
    scale: [tree.radius, tree.radius * 0.9, tree.radius],
    rotation: i * 1.3,
    color: shade(tree, i),
  }),
);
const cones: Instance[] = TREES.filter((tree) => tree.kind === "cone").map(
  (tree, i) => ({
    position: [tree.x, ground + tree.height * 0.25, tree.z],
    scale: [tree.radius, tree.height * 0.75, tree.radius],
    rotation: i * 0.7,
    color: shade(tree, i + 1),
  }),
);
const bushes: Instance[] = BUSHES.map((bush, i) => ({
  position: [bush.x, ground + bush.height * 0.4, bush.z],
  scale: [bush.radius, bush.height * 0.6, bush.radius],
  rotation: i * 0.9,
  color: shade(bush, i),
}));

function createResources() {
  const standard = (color: string, flatShading = false) =>
    new MeshStandardMaterial({ color, roughness: 0.9, flatShading });
  const finishes = Object.fromEntries(
    Object.entries(FINISHES).map(([finish, color]) => [
      finish,
      standard(color),
    ]),
  ) as Record<Finish, MeshStandardMaterial>;
  finishes.glass.roughness = 0.25;

  // Gable prism: a triangle extruded along x, from the wing's west gable.
  const width = ROOF.z[1] - ROOF.z[0];
  const profile = new Shape()
    .moveTo(-width / 2, 0)
    .lineTo(width / 2, 0)
    .lineTo(0, ROOF.ridge - ROOF.eave)
    .closePath();
  const roof = new ExtrudeGeometry(profile, {
    depth: ROOF.x[1] - ROOF.x[0],
    bevelEnabled: false,
  })
    .rotateY(Math.PI / 2)
    .translate(ROOF.x[0], ROOF.eave, (ROOF.z[0] + ROOF.z[1]) / 2);

  // Painted bay outlines, lifted clear of the slab to avoid z-fighting.
  const bays = new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(
      PARKING.flatMap(({ min, max }) => {
        const y = max[1] + 0.02;
        const a = [min[0], y, min[2]];
        const b = [max[0], y, min[2]];
        const c = [max[0], y, max[2]];
        const d = [min[0], y, max[2]];
        return [a, b, b, c, c, d, d, a].flat();
      }),
      3,
    ),
  );

  const geometries = {
    box: new BoxGeometry(),
    roof,
    bays,
    trunk: new CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0),
    crown: new IcosahedronGeometry(1, 0),
    cone: new ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  };
  const materials = {
    ...finishes,
    grass: standard("#6f9a4f"),
    soil: standard("#6b4f3a"),
    bark: standard("#6d4c35"),
    // Instance colors tint a white base.
    foliage: standard("#ffffff", true),
    marking: new LineBasicMaterial({ color: "#f2ead8" }),
  };
  return { geometries, materials };
}

/**
 * One-story cutaway house on a finite plot, built from shared primitives:
 * a closed wing and carport east of the original room, a patio on its open
 * -x side and a walk and driveway to the street. The room stays untouched.
 */
export const HouseDiorama = memo(function HouseDiorama() {
  const { geometries, materials } = useMemo(createResources, []);
  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
    [geometries, materials],
  );

  const { grass, soil } = materials;

  return (
    <group name="house-diorama">
      {/* Box faces: +x, -x, +y, -y, +z, -z. Only the top is grass. */}
      <mesh
        name="plot"
        geometry={geometries.box}
        material={[soil, soil, grass, soil, soil, soil]}
        position={centerOf(PLOT)}
        scale={sizeOf(PLOT)}
        receiveShadow
      />
      {PARTS.map((part) => (
        <mesh
          key={part.id}
          name={part.id}
          geometry={geometries.box}
          material={materials[part.finish]}
          position={centerOf(part)}
          scale={sizeOf(part)}
          castShadow={part.role !== "paving"}
          receiveShadow
        />
      ))}
      <mesh
        name="roof"
        geometry={geometries.roof}
        material={materials.roof}
        castShadow
        receiveShadow
      />
      <lineSegments
        name={`parking: ${PARKING.map((space) => space.label).join(", ")}`}
        geometry={geometries.bays}
        material={materials.marking}
      />
      <Instances
        geometry={geometries.trunk}
        material={materials.bark}
        items={trunks}
      />
      <Instances
        geometry={geometries.crown}
        material={materials.foliage}
        items={crowns}
      />
      <Instances
        geometry={geometries.cone}
        material={materials.foliage}
        items={cones}
      />
      <Instances
        geometry={geometries.crown}
        material={materials.foliage}
        items={bushes}
      />
    </group>
  );
});

interface InstancesProps {
  geometry: BufferGeometry;
  material: Material;
  items: readonly Instance[];
}

function Instances({ geometry, material, items }: InstancesProps) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.rotation.set(0, item.rotation ?? 0, 0);
      dummy.scale.set(...item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(item.color ?? "#ffffff"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow
      receiveShadow
    />
  );
}
