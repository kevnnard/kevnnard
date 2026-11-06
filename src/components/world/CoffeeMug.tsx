import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Object3D } from "three";
import {
  MUG_REST,
  mugAtRest,
  mugPose,
  mugTurnStep,
} from "@/lib/world/coffee-mug.ts";

/** The desk mug's node in Setup's group (Setup.tsx names it). */
const MUG_NAME = "setup-mug";

/**
 * The desk mug's turntable (coffee-card T2): while the coffee close-up is
 * open, the mug Setup builds inside `root` turns slowly about its own
 * vertical axis and lifts a centimetre off its coaster, then eases back
 * (coffee-mug.ts). The coaster and the steam are other objects and stay
 * put. Renders nothing; it moves the existing node. Demand frameloop: frames
 * are requested only while the mug is turning or settling; reduced motion
 * keeps it at rest.
 */
export default function CoffeeMug({
  root,
  turning,
  reducedMotion,
}: {
  /** Setup's group, which holds the mug. */
  root: Object3D;
  /** True while the coffee close-up is open. */
  turning: boolean;
  reducedMotion: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const mug = useMemo(() => root.getObjectByName(MUG_NAME), [root]);
  // The node's own pose: the turn and the lift are applied over it.
  const rest = useMemo(
    () => mug && { y: mug.position.y, yaw: mug.rotation.y },
    [mug],
  );
  const state = useRef(MUG_REST);

  useEffect(() => {
    if (turning) invalidate();
  }, [turning, invalidate]);

  useEffect(
    () => () => {
      if (!mug || !rest) return;
      mug.position.y = rest.y;
      mug.rotation.y = rest.yaw;
    },
    [mug, rest],
  );

  useFrame((frame, delta) => {
    if (!mug || !rest) return;
    if ((reducedMotion || !turning) && mugAtRest(state.current)) return;
    // A long frame (a hidden tab) must not fling the mug round.
    const dt = Math.min(delta, 0.1);
    state.current = mugTurnStep(state.current, dt, turning, reducedMotion);
    const pose = mugPose(state.current);
    mug.rotation.y = rest.yaw + pose.yaw;
    mug.position.y = rest.y + pose.lift;
    frame.invalidate();
  });

  return null;
}
