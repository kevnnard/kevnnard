import {
  type ThreeEvent,
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { useEffect, useMemo, useRef } from "react";
import type { Material, Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  easeToward,
  GARAGE_LIGHTS,
  garageShowroomLevel,
  garageTruckEnvIntensity,
} from "@/lib/world/garage-lights.ts";
import {
  TRUCK,
  TRUCK_HITBOX,
  TRUCK_MODEL,
  truckInSight,
} from "@/lib/world/truck.ts";

/** Pointer travel (px) past which a press is a drag, not a click. */
const CLICK_SLOP = 6;

const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * The owner's dream truck (dream-truck T1), a Ford F-150 Raptor parked nose
 * out in the grown garage at the scale truck.ts records. It casts and takes
 * shadows like the house. A transparent box round it takes the click, only
 * while it shows (through the open door, or with the roofs lifted); the
 * pointer cursor hints at it. In its close-up the paint's reflections
 * strengthen with the garage's showroom lights (T3), as the display cases
 * do at night, so the black paint shows its shape.
 */
export default function Truck({
  focused,
  onInspect,
  hours,
  power,
  reducedMotion,
}: {
  /** Its close-up is open. */
  focused: boolean;
  /** Absent while another close-up holds the camera. */
  onInspect?: (id: "truck") => void;
  hours: number;
  /** The master power switch. */
  power: boolean;
  reducedMotion: boolean;
}) {
  const gltf = useLoader(GLTFLoader, TRUCK_MODEL.url, loaderOptions);
  const element = useThree((state) => state.gl.domElement);
  // Its own copies of the materials, so the boost touches nothing shared
  // with the loader's cache.
  const { truck, materials } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const copies = new Map<Material, MeshStandardMaterial>();
    const own = (material: Material) => {
      let copy = copies.get(material);
      if (!copy) {
        copy = material.clone() as MeshStandardMaterial;
        copies.set(material, copy);
      }
      return copy;
    };
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(own)
        : own(mesh.material);
    });
    return { truck: scene, materials: [...copies.values()] };
  }, [gltf]);
  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );
  // The scene's environment on the paint, eased with the showroom lights
  // (GARAGE_LIGHTS.ramp) toward garageTruckEnvIntensity. Synced each drawn
  // frame, so the environment's late arrival is picked up too.
  const { scene, invalidate } = useThree();
  const target = garageShowroomLevel(power, focused);
  const level = useRef(0);
  useEffect(() => {
    if (target !== level.current) invalidate();
  }, [target, invalidate]);
  useFrame((_, delta) => {
    const before = level.current;
    level.current = easeToward(
      before,
      target,
      Math.min(delta, 0.1),
      GARAGE_LIGHTS.ramp,
      reducedMotion,
    );
    const envIntensity = garageTruckEnvIntensity(level.current, hours);
    for (const material of materials) {
      if (material.envMap !== scene.environment) {
        material.envMap = scene.environment;
        material.needsUpdate = true;
      }
      material.envMapIntensity = envIntensity;
    }
    if (level.current !== before) invalidate();
  });
  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!onInspect || focused) return false;
    const { x, y, z } = event.camera.position;
    return truckInSight([x, y, z]);
  };

  return (
    <group name="dream-truck">
      <primitive
        object={truck}
        position={TRUCK.position}
        rotation-y={TRUCK.rotationY}
        scale={TRUCK.scale}
      />
      <mesh
        name="dream-truck-hit"
        position={TRUCK_HITBOX.center}
        onClick={(event) => {
          if (event.delta > CLICK_SLOP || !reachable(event)) return;
          event.stopPropagation();
          element.style.cursor = "";
          onInspect?.("truck");
        }}
        onPointerOver={(event) => {
          if (reachable(event)) element.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          element.style.cursor = "";
        }}
      >
        <boxGeometry args={TRUCK_HITBOX.size} />
        <meshBasicMaterial
          transparent
          opacity={0}
          colorWrite={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
