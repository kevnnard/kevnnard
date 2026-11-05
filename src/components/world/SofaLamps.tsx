import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useState } from "react";
import { DoubleSide } from "three";
import { playLampSwitch } from "@/lib/world/floor-lamp.ts";
import {
  SOFA_LAMP,
  SOFA_LAMPS,
  type SofaLampPlacement,
  sofaLampBulbPosition,
  sofaLampLevel,
  sofaLampPoint,
  sofaLampStoredEnabled,
} from "@/lib/world/sofa-lamps.ts";

function storedEnabled(key: string): boolean {
  if (typeof window === "undefined") return SOFA_LAMP.defaultEnabled;
  try {
    return sofaLampStoredEnabled(localStorage.getItem(key));
  } catch {
    return SOFA_LAMP.defaultEnabled;
  }
}

/** One floor lamp: weighted base, slim pole and a white drum shade. */
function SofaLamp({
  lamp,
  power,
  hours,
}: {
  lamp: SofaLampPlacement;
  power: boolean;
  hours: number;
}) {
  const { invalidate } = useThree();
  const [enabled, setEnabled] = useState(() => storedEnabled(lamp.storageKey));

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(lamp.storageKey, String(next));
      } catch {
        // Storage might be blocked
      }
      return next;
    });
    playLampSwitch();
  }, [lamp.storageKey]);

  const { base, poleRadius, poleHeight, shade, shadeY, hitbox, colors } =
    SOFA_LAMP;
  const level = sofaLampLevel(enabled, hours, power);
  const isLit = level > 0;
  const bulb = sofaLampBulbPosition(lamp);

  // Demand frameloop: redraw once whenever the switch, clock or power moves
  // the output.
  useEffect(() => {
    invalidate();
  }, [level, invalidate]);

  return (
    <group name={`sofa-lamp-${lamp.id}`}>
      {/* Click target around the pole and the shade */}
      <mesh
        name={`sofa-lamp-${lamp.id}-hitbox`}
        position={sofaLampPoint(lamp, hitbox.height / 2)}
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
        <cylinderGeometry
          args={[hitbox.radius, hitbox.radius, hitbox.height, 12]}
        />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Weighted round base */}
      <mesh
        position={sofaLampPoint(lamp, base.height / 2)}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[base.radius * 0.92, base.radius, base.height, 32]}
        />
        <meshStandardMaterial
          color={colors.base}
          roughness={0.4}
          metalness={0.7}
        />
      </mesh>
      {/* Slim pole */}
      <mesh
        position={sofaLampPoint(lamp, (base.height + poleHeight) / 2)}
        castShadow
      >
        <cylinderGeometry
          args={[poleRadius, poleRadius, poleHeight - base.height, 12]}
        />
        <meshStandardMaterial
          color={colors.pole}
          roughness={0.35}
          metalness={0.8}
        />
      </mesh>
      {/* Brass collar where the pole meets the shade */}
      <mesh position={sofaLampPoint(lamp, shadeY - shade.height / 2)}>
        <cylinderGeometry args={[poleRadius * 2, poleRadius * 2, 0.03, 16]} />
        <meshStandardMaterial
          color={colors.brass}
          roughness={0.3}
          metalness={0.9}
        />
      </mesh>

      {/* White fabric drum shade, open at both ends */}
      <mesh position={sofaLampPoint(lamp, shadeY)} castShadow>
        <cylinderGeometry
          args={[shade.top, shade.bottom, shade.height, 32, 1, true]}
        />
        <meshStandardMaterial
          color={colors.shade}
          emissive={SOFA_LAMP.lightColor}
          emissiveIntensity={SOFA_LAMP.shadeEmissive * level}
          roughness={0.9}
          side={DoubleSide}
        />
      </mesh>
      {/* Emissive bulb inside the shade */}
      <mesh position={bulb}>
        <sphereGeometry args={[SOFA_LAMP.bulbRadius, 16, 16]} />
        <meshStandardMaterial
          color={isLit ? colors.bulbOn : colors.bulbOff}
          emissive={isLit ? SOFA_LAMP.lightColor : "#000000"}
          emissiveIntensity={SOFA_LAMP.bulbEmissive * level}
          roughness={0.2}
        />
      </mesh>

      {/* Always mounted, zero intensity when off: a changing light count
          recompiles every material's shader and stalls the render. */}
      <pointLight
        position={bulb}
        color={SOFA_LAMP.lightColor}
        intensity={SOFA_LAMP.pointIntensity * level}
        distance={SOFA_LAMP.pointDistance}
        decay={SOFA_LAMP.lightDecay}
      />
    </group>
  );
}

/**
 * The two floor lamps flanking the sofa. Each toggles on/off from 3D pointer
 * clicks with a soft switch sound, starts off so the TV keeps priority, and
 * lights only at night.
 */
export default function SofaLamps({
  power = true,
  hours = 12,
}: {
  power?: boolean;
  hours?: number;
}) {
  return (
    <group name="sofa-lamps">
      {SOFA_LAMPS.map((lamp) => (
        <SofaLamp key={lamp.id} lamp={lamp} power={power} hours={hours} />
      ))}
    </group>
  );
}
