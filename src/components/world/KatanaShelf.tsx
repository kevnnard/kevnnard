import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box3,
  Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  type Vector3Tuple,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  displayCaseEnvIntensity,
  displayCaseStoredEnabled,
} from "@/lib/world/display-cases.ts";
import { playLampSwitch } from "@/lib/world/floor-lamp.ts";
import {
  KATANA_LIGHT_AIM,
  KATANA_LIGHT_POSITION,
  KATANA_MODEL,
  KATANA_SHELF,
  KATANA_SHELF_HITBOX,
  katanaLightLevel,
  katanaModelFit,
  SHELF_INTERIOR_X,
} from "@/lib/world/katana-shelf.ts";

const { light, bracket, inlay, colors, materials } = KATANA_SHELF;

function storedEnabled(): boolean {
  if (typeof window === "undefined") return light.defaultEnabled;
  try {
    return displayCaseStoredEnabled(localStorage.getItem(light.storageKey));
  } catch {
    return light.defaultEnabled;
  }
}

const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * Blossom Katana turned to face the room and fitted to the board. Its
 * standard materials are cloned, so the night reflections (as in the cases,
 * T14) leave the loader's shared ones alone; the clones are ours to dispose.
 */
function KatanaModel({ level, hours }: { level: number; hours: number }) {
  const gltf = useLoader(GLTFLoader, KATANA_MODEL.url, loaderOptions);
  const owned = useMemo(() => {
    const clones: MeshStandardMaterial[] = [];
    const own = (material: Material) => {
      if (!(material as MeshStandardMaterial).isMeshStandardMaterial)
        return material;
      const clone = material.clone() as MeshStandardMaterial;
      clones.push(clone);
      return clone;
    };
    const turned = new Group();
    turned.rotation.y = KATANA_MODEL.frontYaw;
    const scene = gltf.scene.clone(true);
    scene.traverse((node) => {
      if (!(node as Mesh).isMesh) return;
      const mesh = node as Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(own)
        : own(mesh.material);
    });
    turned.add(scene);
    turned.updateMatrixWorld(true);
    const box = new Box3().setFromObject(turned);
    const fit = katanaModelFit({
      min: box.min.toArray(),
      max: box.max.toArray(),
    });
    return { turned, clones, fit };
  }, [gltf]);
  useEffect(
    () => () => {
      for (const material of owned.clones) material.dispose();
    },
    [owned],
  );
  const { scene, invalidate } = useThree();
  // Demand frameloop: draw the stand once it arrives.
  useEffect(() => invalidate(), [owned, invalidate]);
  const envIntensity = displayCaseEnvIntensity(level, hours);
  useFrame(() => {
    for (const material of owned.clones) {
      if (material.envMap !== scene.environment) {
        material.envMap = scene.environment;
        material.needsUpdate = true;
      }
      material.envMapIntensity = envIntensity;
    }
  });
  return (
    <group position={owned.fit.offset as Vector3Tuple} scale={owned.fit.scale}>
      <primitive object={owned.turned} />
    </group>
  );
}

/**
 * The katana wall shelf (katana-wall-shelf T4, T5): lacquered board, brass
 * inlay, two black brackets, the stand, and a slim picture light above it.
 * A click from the room enters inspection like the cases; clicking the
 * inspected shelf toggles the night-only light with the shared lamp click.
 * Static while inspected: a wall rack does not turn.
 */
export default function KatanaShelf({
  power = true,
  hours = 12,
  focused = false,
  onInspect,
}: {
  power?: boolean;
  hours?: number;
  focused?: boolean;
  onInspect?: (id: "katana") => void;
}) {
  const { invalidate } = useThree();
  const [enabled, setEnabled] = useState(storedEnabled);
  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(light.storageKey, String(next));
      } catch {
        // Storage might be blocked
      }
      return next;
    });
    playLampSwitch();
  }, []);
  const level = katanaLightLevel(enabled, hours, power);
  const isLit = level > 0;
  useEffect(() => {
    invalidate();
  }, [level, invalidate]);
  // The spot's aim, in world space like the light.
  const [spotTarget] = useState(() => new Object3D());

  const { topY, thickness, depth, length, centreZ } = KATANA_SHELF;
  const x = SHELF_INTERIOR_X;
  const boardY = topY - thickness / 2;
  const plateY = (topY - thickness + topY - bracket.height) / 2;
  const plateHeight = bracket.height - thickness;
  const [lx, ly, lz] = KATANA_LIGHT_POSITION;

  return (
    <group name="katana-shelf">
      {/* Click target around the shelf, the stand and the light */}
      <mesh
        name="katana-shelf-hitbox"
        position={KATANA_SHELF_HITBOX.center}
        onClick={(e) => {
          e.stopPropagation();
          if (focused) toggle();
          else onInspect?.("katana");
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
        <boxGeometry args={KATANA_SHELF_HITBOX.size} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Lacquered black board */}
      <mesh
        position={[x - depth / 2, boardY, centreZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[depth, thickness, length]} />
        <meshStandardMaterial color={colors.board} {...materials.board} />
      </mesh>
      {/* Brass inlay along the front edge */}
      <mesh position={[x - depth - inlay.depth / 2, boardY, centreZ]}>
        <boxGeometry args={[inlay.depth, inlay.height, length]} />
        <meshStandardMaterial color={colors.brass} {...materials.brass} />
      </mesh>

      {/* Two black brackets: a wall plate and an arm under the board */}
      {[-1, 1].map((side) => {
        const z = centreZ + side * (length / 2 - bracket.inset);
        return (
          <group key={side}>
            <mesh position={[x - bracket.plate / 2, plateY, z]} castShadow>
              <boxGeometry args={[bracket.plate, plateHeight, bracket.width]} />
              <meshStandardMaterial
                color={colors.bracket}
                {...materials.bracket}
              />
            </mesh>
            <mesh
              position={[
                x - bracket.armDepth / 2,
                topY - thickness - bracket.arm / 2,
                z,
              ]}
              castShadow
            >
              <boxGeometry
                args={[bracket.armDepth, bracket.arm, bracket.width]}
              />
              <meshStandardMaterial
                color={colors.bracket}
                {...materials.bracket}
              />
            </mesh>
          </group>
        );
      })}

      {/* The stand and its katanas */}
      <group position={[x, topY, centreZ]}>
        <Suspense fallback={null}>
          <KatanaModel level={level} hours={hours} />
        </Suspense>
      </group>

      {/* Picture light: a slim bar on a thin arm, glowing underneath */}
      <mesh
        position={[(x + lx) / 2, ly, lz]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry
          args={[light.armRadius, light.armRadius, x - lx, 8]}
        />
        <meshStandardMaterial color={colors.housing} {...materials.brass} />
      </mesh>
      <mesh position={[lx, ly, lz]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[light.barRadius, light.barRadius, light.barLength, 20]}
        />
        <meshStandardMaterial color={colors.housing} {...materials.bracket} />
      </mesh>
      <mesh position={[lx, ly - light.barRadius, lz]}>
        <boxGeometry args={[0.006, 0.002, light.barLength - 0.02]} />
        <meshStandardMaterial
          color={isLit ? colors.glowOn : colors.glowOff}
          emissive={isLit ? light.color : "#000000"}
          emissiveIntensity={light.emissive * level}
          roughness={0.4}
        />
      </mesh>

      {/* Always mounted, zero intensity when off: a changing light count
          recompiles every material's shader. No shadow map. */}
      <primitive object={spotTarget} position={KATANA_LIGHT_AIM} />
      <spotLight
        position={KATANA_LIGHT_POSITION}
        target={spotTarget}
        color={light.color}
        intensity={KATANA_SHELF.light.intensity * level}
        angle={light.angle}
        penumbra={light.penumbra}
        distance={light.distance}
        decay={light.decay}
        castShadow={false}
      />
    </group>
  );
}
