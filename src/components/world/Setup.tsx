import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  type Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeParts } from "@/components/world/House";
import { SETUP_COLORS, setupGlow, setupMeshes } from "@/lib/world/setup.ts";

/**
 * Original procedural gaming setup in the main room (T4d). Lives outside the
 * cutaway groups, so it never fades. Screens and RGB are unlit vertex colors
 * scaled by the hour: no extra lights.
 */
export default function Setup({ hours }: { hours: number }) {
  const { invalidate } = useThree();
  const { group, glow, materials } = useMemo(() => {
    const meshes = setupMeshes();
    const solid = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0,
    });
    const screens = new MeshBasicMaterial({ vertexColors: true });
    const glass = new MeshStandardMaterial({
      color: SETUP_COLORS.glass,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const setup = new Object3D() as Group;
    setup.name = "house-interior";
    const body = new Mesh(mergeParts(meshes.solid), solid);
    body.castShadow = true;
    body.receiveShadow = true;
    const lit = new Mesh(mergeParts(meshes.glow), screens);
    const pane = new Mesh(mergeParts(meshes.glass), glass);
    pane.renderOrder = 1;
    setup.add(body, lit, pane);
    return { group: setup, glow: screens, materials: [solid, screens, glass] };
  }, []);

  useLayoutEffect(() => {
    glow.color.setScalar(setupGlow(hours));
    invalidate();
  }, [hours, glow, invalidate]);

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
    [group, materials],
  );

  return <primitive object={group} />;
}
