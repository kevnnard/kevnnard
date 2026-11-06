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
  GARAGE_BARS,
  GARAGE_LIGHT_FIXTURES,
  GARAGE_LIGHTS,
  garageLightLevel,
  gridParts,
} from "@/lib/world/garage-lights.ts";
import type { Part } from "@/lib/world/house.ts";

/**
 * The garage's detailing-bay lights (dream-truck T2): the honeycomb LED
 * grid on the ceiling and the two low side bars as one emissive draw, with
 * four soft spots (two down from the grid, two across from the bars),
 * always mounted and at zero intensity while off, so turning them on never
 * recompiles a shader. The level eases over about 0.8 s toward
 * garageLightLevel: showroom in the truck's close-up, softer by night, off
 * by day or with the master power off; reduced motion jumps.
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
    const leds = new Mesh(mergeParts([...gridParts(), ...bars]), material);
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
  const level = useRef(0);
  const target = garageLightLevel(hours, power, inspecting);
  // A new target wakes the demand frameloop.
  useEffect(() => {
    if (target !== level.current) invalidate();
  }, [target, invalidate]);
  useFrame((_, delta) => {
    const before = level.current;
    const now = easeToward(
      before,
      target,
      Math.min(delta, 0.1),
      GARAGE_LIGHTS.ramp,
      reducedMotion,
    );
    if (now === before) return;
    level.current = now;
    material.emissiveIntensity = GARAGE_LIGHTS.glow * now;
    GARAGE_LIGHT_FIXTURES.forEach((fixture, i) => {
      const light = lights.current[i];
      if (light) light.intensity = fixture.intensity * now;
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
