import { type ThreeEvent, useThree } from "@react-three/fiber";
import { GARAGE_DOOR_HITBOX, garageDoorInSight } from "@/lib/world/truck.ts";

/** Pointer travel (px) past which a press is a drag, not a click. */
const CLICK_SLOP = 6;

/**
 * The closed garage door's click target (dream-truck T4): a thin
 * transparent box over the roller door and its "Coming soon" sign (House
 * paints both), clickable from in front of the garage; the pointer cursor
 * hints at it. It opens the garage's close-up and card (id "truck").
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
  const element = useThree((state) => state.gl.domElement);
  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!onInspect || focused) return false;
    const { x, y, z } = event.camera.position;
    return garageDoorInSight([x, y, z]);
  };

  return (
    <mesh
      name="garage-door-hit"
      position={GARAGE_DOOR_HITBOX.center}
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
      <boxGeometry args={GARAGE_DOOR_HITBOX.size} />
      <meshBasicMaterial
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
      />
    </mesh>
  );
}
