import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Object3D, type SpotLight } from "three";
import {
  COFFEE_LIGHT,
  COFFEE_LIGHT_AIM,
  COFFEE_LIGHT_POSITION,
  coffeeLightFadeStep,
  coffeeLightLevel,
  coffeeLightOutput,
} from "@/lib/world/coffee-light.ts";

/**
 * The coffee close-up's key light (coffee-card T4): a soft warm spot over
 * the shot's camera, aimed at the cup, eased in while the close-up is open
 * and out on leave; night only, and off with the master power (coffee-light.ts).
 * Always mounted, zero intensity when off: a changing light count recompiles
 * every material's shader and stalls the render. No shadows. Demand
 * frameloop: frames are requested only while it fades.
 */
export default function CoffeeLight({
  active,
  hours,
  power = true,
  reducedMotion,
}: {
  /** True while the coffee close-up is open. */
  active: boolean;
  hours: number;
  power?: boolean;
  reducedMotion: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const light = useRef<SpotLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const fade = useRef(0);
  const level = coffeeLightLevel(hours, power);

  // Redraw once when the focus, clock or power moves.
  useEffect(() => {
    invalidate();
  }, [active, level, invalidate]);

  useFrame((frame, delta) => {
    const node = light.current;
    if (!node) return;
    const goal = active ? 1 : 0;
    if (fade.current !== goal) {
      // A long frame (a hidden tab) must not skip the fade.
      const dt = Math.min(delta, 0.1);
      fade.current = coffeeLightFadeStep(
        fade.current,
        dt,
        active,
        reducedMotion,
      );
      frame.invalidate();
    }
    node.intensity =
      COFFEE_LIGHT.intensity * coffeeLightOutput(fade.current, level);
  });

  return (
    <>
      <primitive object={target} position={COFFEE_LIGHT_AIM} />
      <spotLight
        ref={light}
        position={COFFEE_LIGHT_POSITION}
        target={target}
        color={COFFEE_LIGHT.color}
        intensity={0}
        angle={COFFEE_LIGHT.angle}
        penumbra={COFFEE_LIGHT.penumbra}
        distance={COFFEE_LIGHT.distance}
        decay={COFFEE_LIGHT.decay}
        castShadow={false}
      />
    </>
  );
}
