import { type ThreeEvent, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { useMemo } from "react";
import type { Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
 * pointer cursor hints at it.
 */
export default function Truck({
  focused,
  onInspect,
}: {
  /** Its close-up is open. */
  focused: boolean;
  /** Absent while another close-up holds the camera. */
  onInspect?: (id: "truck") => void;
}) {
  const gltf = useLoader(GLTFLoader, TRUCK_MODEL.url, loaderOptions);
  const element = useThree((state) => state.gl.domElement);
  const truck = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return scene;
  }, [gltf]);
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
