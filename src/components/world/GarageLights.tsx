import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type SpotLight,
} from "three";
import { mergeParts } from "@/components/world/House";
import {
  easeToward,
  floorStripParts,
  GARAGE_BARS,
  GARAGE_LIGHT_FIXTURES,
  GARAGE_LIGHTS,
  garageLightLevel,
  garageShowroomLevel,
  gridParts,
} from "@/lib/world/garage-lights.ts";
import type { Part } from "@/lib/world/house.ts";

/**
 * The garage's detailing-bay lights (dream-truck T2): the honeycomb LED
 * grid on the ceiling, the two low side bars and the LED strip round the
 * truck on the floor as one emissive draw, with four soft spots (two down
 * from the grid, two across from the bars), plus the close-up's showroom
 * set (T3: key, uplights, top light, rim). All always mounted and at zero
 * intensity while off, so turning them on never recompiles a shader. Two
 * levels ease over about 0.8 s: the bay's toward garageLightLevel (full in
 * the truck's close-up, softer by night, off by day or with the master
 * power off) and the showroom set's toward garageShowroomLevel (the
 * close-up only); reduced motion jumps.
 */
export default function GarageLights({
  hours,
  power,
  inspecting,
  reducedMotion,
}: {
  hours: number;
  power: boolean;
  /** The truck's close-up is open. */
  inspecting: boolean;
  reducedMotion: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const { leds, material, targets } = useMemo(() => {
    const bars: Part[] = GARAGE_BARS.map(({ center, size }) => ({
      shape: "box",
      center,
      size,
      color: GARAGE_LIGHTS.color,
      shade: 1,
    }));
    const material = new MeshStandardMaterial({
      vertexColors: true,
      color: GARAGE_LIGHTS.off,
      roughness: 0.4,
      metalness: 0,
      emissive: new Color(GARAGE_LIGHTS.color),
      emissiveIntensity: 0,
    });
    const leds = new Mesh(
      mergeParts([...gridParts(), ...bars, ...floorStripParts()]),
      material,
    );
    leds.name = "garage-leds";
    leds.castShadow = false;
    leds.receiveShadow = false;
    const targets = GARAGE_LIGHT_FIXTURES.map((fixture) => {
      const target = new Object3D();
      target.position.set(...fixture.target);
      return target;
    });
    return { leds, material, targets };
  }, []);
  useEffect(
    () => () => {
      leds.geometry.dispose();
      material.dispose();
    },
    [leds, material],
  );

  const lights = useRef<(SpotLight | null)[]>([]);
  const level = useRef({ bay: 0, showroom: 0 });
  const bay = garageLightLevel(hours, power, inspecting);
  const showroom = garageShowroomLevel(power, inspecting);
  // A new target wakes the demand frameloop.
  useEffect(() => {
    const { current } = level;
    if (bay !== current.bay || showroom !== current.showroom) invalidate();
  }, [bay, showroom, invalidate]);
  useFrame((_, delta) => {
    const before = level.current;
    const step = (from: number, to: number) =>
      easeToward(
        from,
        to,
        Math.min(delta, 0.1),
        GARAGE_LIGHTS.ramp,
        reducedMotion,
      );
    const now = {
      bay: step(before.bay, bay),
      showroom: step(before.showroom, showroom),
    };
    if (now.bay === before.bay && now.showroom === before.showroom) return;
    level.current = now;
    material.emissiveIntensity = GARAGE_LIGHTS.glow * now.bay;
    GARAGE_LIGHT_FIXTURES.forEach((fixture, i) => {
      const light = lights.current[i];
      if (light)
        light.intensity =
          fixture.intensity * now.bay + fixture.showroom * now.showroom;
    });
    invalidate();
  });

  return (
    <group name="garage-lights">
      <primitive object={leds} />
      {targets.map((object) => (
        <primitive key={object.uuid} object={object} />
      ))}
      {GARAGE_LIGHT_FIXTURES.map((fixture, i) => (
        <spotLight
          key={`${fixture.role}-${fixture.position.join()}`}
          ref={(light) => {
            lights.current[i] = light;
          }}
          position={fixture.position}
          target={targets[i]}
          color={GARAGE_LIGHTS.color}
          intensity={0}
          angle={fixture.angle}
          penumbra={fixture.penumbra}
          distance={fixture.distance}
          decay={fixture.decay}
          castShadow={fixture.castShadow}
        />
      ))}
    </group>
  );
}
