import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackSide, Object3D, Quaternion, Vector3 } from "three";
import {
  FLOOR_LAMP,
  floorLampAim,
  floorLampHeadPosition,
  floorLampLevel,
  floorLampLightTarget,
  playLampSwitch,
} from "@/lib/world/floor-lamp.ts";
import type { Vec3 } from "@/lib/world/house.ts";

const CLICK_STORAGE_KEY = "world:floor-lamp";

function defaultEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const val = localStorage.getItem(CLICK_STORAGE_KEY);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

/** Rotation turning a mesh's local `from` axis onto `to`. */
function turn(from: Vec3, to: Vec3): Quaternion {
  return new Quaternion().setFromUnitVectors(
    new Vector3(...from).normalize(),
    new Vector3(...to).normalize(),
  );
}

/** A thin metal arm tube from `a` to `b`. */
function Arm({ a, b }: { a: Vec3; b: Vec3 }) {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(...d);
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return (
    <mesh position={mid} quaternion={turn([0, 1, 0], d)} castShadow>
      <cylinderGeometry
        args={[FLOOR_LAMP.armRadius, FLOOR_LAMP.armRadius, length, 12]}
      />
      <meshStandardMaterial
        color={FLOOR_LAMP.colors.arm}
        roughness={0.35}
        metalness={0.8}
      />
    </mesh>
  );
}

/** A brass knuckle joint. */
function Joint({ at }: { at: Vec3 }) {
  return (
    <mesh position={at} castShadow>
      <sphereGeometry args={[FLOOR_LAMP.jointRadius, 16, 12]} />
      <meshStandardMaterial
        color={FLOOR_LAMP.colors.joint}
        roughness={0.3}
        metalness={0.9}
      />
    </mesh>
  );
}

/**
 * Wall lamp centred over the collection shelf: a straight level arm and a
 * vertical drop to the shade, aimed at the shelf's items. Toggles on/off from
 * 3D pointer clicks with a soft mechanical switch sound, and emits a warm spot
 * and a glowing bulb only at night.
 */
export default function FloorLamp({
  power = true,
  hours = 12,
}: {
  power?: boolean;
  hours?: number;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const { invalidate } = useThree();
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CLICK_STORAGE_KEY, String(next));
      } catch {
        // Storage might be blocked
      }
      return next;
    });
    playLampSwitch();
  }, []);

  const { mount, shoulder, elbow, head, plate, shade } = FLOOR_LAMP;
  const bulb = floorLampHeadPosition();
  // The shade's narrow crown sits at the head pivot and opens along the aim.
  const headTurn = useMemo(() => turn([0, -1, 0], floorLampAim()), []);
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(...floorLampLightTarget());
    return object;
  }, []);

  const level = floorLampLevel(enabled, hours, power);
  const isLit = level > 0;

  // Demand frameloop: redraw once whenever the switch, clock or power moves
  // the output.
  useEffect(() => {
    invalidate();
  }, [level, invalidate]);

  return (
    <group name="floor-lamp">
      {/* Wall plate */}
      <mesh
        position={[mount[0] + plate.depth / 2, mount[1], mount[2]]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[plate.depth, plate.height, plate.width]} />
        <meshStandardMaterial
          color={FLOOR_LAMP.colors.plate}
          roughness={0.4}
          metalness={0.7}
        />
      </mesh>
      {/* Bracket from the plate to the shoulder pivot */}
      <Arm a={[mount[0] + plate.depth, mount[1], mount[2]]} b={shoulder} />
      <Joint at={shoulder} />
      <Arm a={shoulder} b={elbow} />
      <Joint at={elbow} />
      {/* Vertical drop to the shade */}
      <Arm a={elbow} b={head} />
      <Joint at={head} />

      <group position={head} quaternion={headTurn}>
        {/* Click target around the shade */}
        <mesh
          name="floor-lamp-hitbox"
          position={[0, -shade.length / 2, 0]}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
          visible={false}
        >
          <sphereGeometry args={[FLOOR_LAMP.hitboxRadius, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* Conical shade, open at the mouth */}
        <mesh position={[0, -shade.length / 2, 0]} castShadow>
          <cylinderGeometry
            args={[shade.top, shade.bottom, shade.length, 24, 1, true]}
          />
          <meshStandardMaterial
            color={FLOOR_LAMP.colors.shade}
            roughness={0.5}
            metalness={0.4}
          />
        </mesh>
        {/* Pale liner catching the bulb's light */}
        <mesh position={[0, -shade.length / 2, 0]}>
          <cylinderGeometry
            args={[
              shade.top * 0.94,
              shade.bottom * 0.96,
              shade.length * 0.98,
              24,
              1,
              true,
            ]}
          />
          <meshStandardMaterial
            color={FLOOR_LAMP.colors.shadeInner}
            emissive={FLOOR_LAMP.lightColor}
            emissiveIntensity={0.25 * level}
            roughness={0.8}
            side={BackSide}
          />
        </mesh>
        {/* Crown cap closing the narrow end */}
        <mesh position={[0, 0.006, 0]} castShadow>
          <cylinderGeometry args={[shade.top, shade.top, 0.012, 24]} />
          <meshStandardMaterial
            color={FLOOR_LAMP.colors.joint}
            roughness={0.3}
            metalness={0.9}
          />
        </mesh>
        {/* Emissive bulb inside the shade */}
        <mesh position={[0, -shade.length * 0.55, 0]}>
          <sphereGeometry args={[FLOOR_LAMP.bulbRadius, 16, 16]} />
          <meshStandardMaterial
            color={isLit ? FLOOR_LAMP.colors.bulbOn : FLOOR_LAMP.colors.bulbOff}
            emissive={isLit ? FLOOR_LAMP.lightColor : "#000000"}
            emissiveIntensity={FLOOR_LAMP.bulbEmissive * level}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* The spot's target must sit in the scene for its matrix to update. */}
      <primitive object={target} />
      {/* Lights stay mounted and drop to zero intensity when off: adding or
          removing a light changes the scene's light count and recompiles
          every material's shader, which froze the render on each toggle. */}
      <spotLight
        position={bulb}
        target={target}
        color={FLOOR_LAMP.lightColor}
        intensity={FLOOR_LAMP.spotIntensity * level}
        distance={FLOOR_LAMP.spotDistance}
        angle={FLOOR_LAMP.spotAngle}
        penumbra={FLOOR_LAMP.spotPenumbra}
        decay={FLOOR_LAMP.lightDecay}
      />
      <pointLight
        position={bulb}
        color={FLOOR_LAMP.lightColor}
        intensity={FLOOR_LAMP.pointIntensity * level}
        distance={FLOOR_LAMP.pointDistance}
        decay={FLOOR_LAMP.lightDecay}
      />
    </group>
  );
}
