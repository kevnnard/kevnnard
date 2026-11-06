import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { type Object3D, Raycaster } from "three";
import { COFFEE_HITBOX } from "@/lib/world/coffee-shot.ts";
import { canEnterMonitor } from "@/lib/world/monitor.ts";

/** Pointer travel (px) past which a press is a drag, not a click. */
const CLICK_SLOP = 6;

/**
 * A transparent click target around the coffee mug and its coaster only
 * (coffee-card T1), like the desk keyboard's: only from inside the room (the
 * monitor's gate) with nothing in the way, so the mouse, the keyboard and
 * the ultrawide keep their own clicks, and a drag still orbits.
 */
export default function CoffeeHitbox({
  occluders,
  control,
}: {
  occluders: Object3D;
  control: {
    /** The inspected item; null in the room. */
    focused: string | null;
    /** Absent while another close-up holds the camera. */
    onInspect?: (id: "coffee") => void;
  };
}) {
  const element = useThree((state) => state.gl.domElement);
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );
  const raycaster = useMemo(() => new Raycaster(), []);
  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!control.onInspect || control.focused === "coffee") return false;
    const { x, y, z } = event.camera.position;
    if (!canEnterMonitor([x, y, z])) return false;
    // The box encloses the mug: anything hit before it is in the way.
    raycaster.set(event.ray.origin, event.ray.direction);
    raycaster.far = Math.max(0, event.distance - 0.005);
    return raycaster.intersectObject(occluders, true).length === 0;
  };
  return (
    <mesh
      name="setup-coffee-hit"
      position={COFFEE_HITBOX.center}
      onClick={(event) => {
        if (event.delta > CLICK_SLOP || !reachable(event)) return;
        event.stopPropagation();
        element.style.cursor = "";
        control.onInspect?.("coffee");
      }}
      onPointerOver={(event) => {
        if (reachable(event)) element.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        element.style.cursor = "";
      }}
    >
      <boxGeometry args={COFFEE_HITBOX.size} />
      <meshBasicMaterial
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
      />
    </mesh>
  );
}
