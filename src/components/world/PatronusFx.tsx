import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  Vector3,
} from "three";
import { PATRONUS, patronusAt } from "@/lib/world/patronus.ts";
import { patronusFxAt, streamPoint } from "@/lib/world/patronus-fx.ts";
import { dotTexture, GhostParticles } from "./Patronus.tsx";

const STREAM_POINTS = 384;

/** Light flows from the actual tip into a soft cloud; never a solid laser. */
export default function PatronusFx({
  castAt,
  reducedMotion,
}: {
  castAt: RefObject<number | null>;
  reducedMotion: boolean;
}) {
  const fx = useMemo(() => {
    const texture = dotTexture();
    const positions = new Float32Array(STREAM_POINTS * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      map: texture,
      color: "#d9eeff",
      size: 0.1,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const points = new Points(geometry, material);
    points.frustumCulled = false;
    const mist = new GhostParticles(90, 0.35, "#4a74a8");
    return {
      points,
      positions,
      geometry,
      material,
      texture,
      mist,
      carry: 0,
      position: new Vector3(),
      velocity: new Vector3(),
    };
  }, []);
  useEffect(
    () => () => {
      fx.geometry.dispose();
      fx.material.dispose();
      fx.texture?.dispose();
      fx.mist.dispose();
    },
    [fx],
  );
  useFrame((frame, delta) => {
    const t =
      castAt.current === null ? -1 : performance.now() / 1000 - castAt.current;
    const envelope = patronusFxAt(t, reducedMotion);
    fx.material.opacity = envelope.stream * 0.9;
    fx.points.visible = envelope.stream > 0;
    if (envelope.stream > 0) {
      const target = patronusAt(
        Math.max(PATRONUS.start + 0.1, Math.min(PATRONUS.start + 0.5, t)),
      )?.position ?? [0, 0.8, 0.6];
      for (let i = 0; i < STREAM_POINTS; i++) {
        const u = ((i % 96) / 96 + t * 0.9) % 1;
        const p = streamPoint(u, target, t, Math.floor(i / 96));
        fx.positions.set(p, i * 3);
      }
      fx.geometry.attributes.position.needsUpdate = true;
      fx.carry += Math.min(delta, 0.05) * 45;
      while (fx.carry >= 1) {
        fx.carry--;
        fx.position.set(
          target[0] + (Math.random() - 0.5) * 0.16,
          target[1] + 0.12,
          target[2],
        );
        fx.velocity.set(
          (Math.random() - 0.5) * 0.15,
          0.12,
          (Math.random() - 0.5) * 0.15,
        );
        fx.mist.emit(fx.position, fx.velocity, 0.9);
      }
    }
    const alive = fx.mist.update(Math.min(delta, 0.05), 0.04);
    if (envelope.stream > 0 || alive) frame.invalidate();
  });
  return (
    <>
      <primitive object={fx.points} />
      <primitive object={fx.mist.points} />
    </>
  );
}
