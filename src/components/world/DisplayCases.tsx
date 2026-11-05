import { useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Box3,
  Group,
  type Mesh,
  MeshStandardMaterial,
  type Vector3Tuple,
} from "three";
import {
  type GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DISPLAY_CASE,
  DISPLAY_CASE_LIGHT_Y,
  DISPLAY_CASES,
  DISPLAY_ITEMS,
  DISPLAY_MODEL_FILES,
  type DisplayCasePlacement,
  type DisplayItemId,
  type DisplayModel,
  displayCaseLevel,
  displayCaseStoredEnabled,
  displayMeshCastsShadow,
  displayModelFit,
  ITEM_FINISHES,
  ITEM_FLOOR_Y,
} from "@/lib/world/display-cases.ts";
import { playLampSwitch } from "@/lib/world/floor-lamp.ts";

function storedEnabled(key: string): boolean {
  if (typeof window === "undefined") return DISPLAY_CASE.defaultEnabled;
  try {
    return displayCaseStoredEnabled(localStorage.getItem(key));
  } catch {
    return DISPLAY_CASE.defaultEnabled;
  }
}

const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * A shipped mesh turned to face the room, scaled uniformly and grounded from
 * its own bounds. The scene is cloned per case; only the tint materials are
 * ours to dispose, the loader's geometry and textures stay cached.
 */
function DisplayMesh({ gltf, model }: { gltf: GLTF; model: DisplayModel }) {
  const owned = useMemo(() => {
    const materials: MeshStandardMaterial[] = [];
    const turned = new Group();
    turned.rotation.y = model.frontYaw;
    const scene = gltf.scene.clone(true);
    scene.traverse((node) => {
      if (!(node as Mesh).isMesh) return;
      const mesh = node as Mesh;
      mesh.castShadow = [mesh.material]
        .flat()
        .every((material) => displayMeshCastsShadow(material));
      const tint = model.tint?.[mesh.name];
      if (!tint) return;
      const material = new MeshStandardMaterial({
        color: tint.color,
        ...ITEM_FINISHES[tint.finish],
      });
      materials.push(material);
      mesh.material = material;
    });
    turned.add(scene);
    turned.updateMatrixWorld(true);
    const box = new Box3().setFromObject(turned);
    const fit = displayModelFit({
      min: box.min.toArray(),
      max: box.max.toArray(),
    });
    return { turned, materials, fit };
  }, [gltf, model]);
  useEffect(
    () => () => {
      for (const material of owned.materials) material.dispose();
    },
    [owned],
  );
  return (
    <group position={owned.fit.offset as Vector3Tuple} scale={owned.fit.scale}>
      <primitive object={owned.turned} />
    </group>
  );
}

/**
 * The licensed case meshes, behind their own Suspense: counted as one
 * preparation milestone once all have committed.
 */
function DisplayModels({ onPrepared }: { onPrepared: () => void }) {
  const gltfs = useLoader(
    GLTFLoader,
    DISPLAY_MODEL_FILES as string[],
    loaderOptions,
  );
  const { invalidate } = useThree();
  useEffect(() => onPrepared(), [onPrepared]);
  // Demand frameloop: draw the meshes once they arrive.
  useEffect(() => invalidate(), [gltfs, invalidate]);
  return (
    <>
      {DISPLAY_CASES.map((item) => {
        const shown = DISPLAY_ITEMS[item.id];
        const gltf = gltfs[DISPLAY_MODEL_FILES.indexOf(shown.model.url)];
        return (
          <group
            key={item.id}
            name={`display-case-${item.id}-model`}
            position={[item.base[0], item.base[1] + ITEM_FLOOR_Y, item.base[2]]}
            rotation={[0, item.itemYaw, 0]}
          >
            <DisplayMesh gltf={gltf} model={shown.model} />
          </group>
        );
      })}
    </>
  );
}

/**
 * Plinth, brass reveal, five-sided glass and lid spot; the licensed meshes
 * inside come from DisplayModels.
 */
function DisplayCase({
  item,
  power,
  hours,
  focused,
  onInspect,
}: {
  item: DisplayCasePlacement;
  power: boolean;
  hours: number;
  focused: boolean;
  onInspect?: (id: DisplayItemId) => void;
}) {
  const { invalidate } = useThree();
  const [enabled, setEnabled] = useState(() => storedEnabled(item.storageKey));

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(item.storageKey, String(next));
      } catch {
        // Storage might be blocked
      }
      return next;
    });
    playLampSwitch();
  }, [item.storageKey]);

  const { plinth, plinthKick, rim, glass, riser, housing, puck, colors } =
    DISPLAY_CASE;
  const level = displayCaseLevel(enabled, hours, power);
  const isLit = level > 0;
  const top = plinth.height;
  const lidY = top + glass.height - glass.thickness / 2;
  const t = glass.thickness;

  // Demand frameloop: redraw once whenever the switch, clock or power moves
  // the output.
  useEffect(() => {
    invalidate();
  }, [level, invalidate]);

  const glassMaterial = (
    <meshPhysicalMaterial
      color={colors.glass}
      transparent
      depthWrite={false}
      {...DISPLAY_CASE.materials.glass}
    />
  );
  const walls: {
    position: [number, number, number];
    size: [number, number, number];
  }[] = [
    {
      position: [0, top + glass.height / 2, -glass.depth / 2 + t / 2],
      size: [glass.width, glass.height, t],
    },
    {
      position: [0, top + glass.height / 2, glass.depth / 2 - t / 2],
      size: [glass.width, glass.height, t],
    },
    {
      position: [-glass.width / 2 + t / 2, top + glass.height / 2, 0],
      size: [t, glass.height, glass.depth - 2 * t],
    },
    {
      position: [glass.width / 2 - t / 2, top + glass.height / 2, 0],
      size: [t, glass.height, glass.depth - 2 * t],
    },
    {
      position: [0, lidY, 0],
      size: [glass.width, t, glass.depth],
    },
  ];

  return (
    <group name={`display-case-${item.id}`} position={item.base}>
      {/* Click target around the plinth and the glass */}
      <mesh
        name={`display-case-${item.id}-hitbox`}
        position={[0, (top + glass.height) / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (focused) toggle();
          else onInspect?.(item.id);
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
        <boxGeometry args={[plinth.width, top + glass.height, plinth.depth]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Recessed toe kick */}
      <mesh position={[0, plinthKick.height / 2, 0]} receiveShadow>
        <boxGeometry
          args={[
            plinth.width - 2 * plinthKick.inset,
            plinthKick.height,
            plinth.depth - 2 * plinthKick.inset,
          ]}
        />
        <meshStandardMaterial color={colors.kick} roughness={0.9} />
      </mesh>
      {/* Dark matte plinth */}
      <mesh
        position={[0, (plinthKick.height + top) / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[plinth.width, top - plinthKick.height, plinth.depth]}
        />
        <meshStandardMaterial
          color={colors.plinth}
          {...DISPLAY_CASE.materials.plinth}
        />
      </mesh>
      {/* Brass reveal band under the top */}
      <mesh position={[0, top - rim.drop, 0]}>
        <boxGeometry
          args={[
            plinth.width + 2 * rim.overhang,
            rim.height,
            plinth.depth + 2 * rim.overhang,
          ]}
        />
        <meshStandardMaterial
          color={colors.brass}
          {...DISPLAY_CASE.materials.brass}
        />
      </mesh>
      {/* Display riser */}
      <mesh position={[0, top + riser.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[riser.width, riser.height, riser.depth]} />
        <meshStandardMaterial color={colors.riser} roughness={0.6} />
      </mesh>

      {/* Lid light housing and its emissive puck */}
      <mesh position={[0, lidY - t / 2 - housing.height / 2, 0]}>
        <boxGeometry args={[housing.width, housing.height, housing.depth]} />
        <meshStandardMaterial
          color={colors.housing}
          {...DISPLAY_CASE.materials.brass}
        />
      </mesh>
      <mesh position={[0, lidY - t / 2 - housing.height - puck.height / 2, 0]}>
        <cylinderGeometry args={[puck.radius, puck.radius, puck.height, 24]} />
        <meshStandardMaterial
          color={isLit ? colors.puckOn : colors.puckOff}
          emissive={isLit ? DISPLAY_CASE.lightColor : "#000000"}
          emissiveIntensity={DISPLAY_CASE.puckEmissive * level}
          roughness={0.2}
        />
      </mesh>

      {/* Five glass panes: four walls and the lid */}
      {walls.map((wall) => (
        <mesh key={wall.position.join(",")} position={wall.position}>
          <boxGeometry args={wall.size} />
          {glassMaterial}
        </mesh>
      ))}

      {/* Always mounted, zero intensity when off: a changing light count
          recompiles every material's shader and stalls the render. */}
      <pointLight
        position={[0, DISPLAY_CASE_LIGHT_Y, 0]}
        color={DISPLAY_CASE.lightColor}
        intensity={DISPLAY_CASE.pointIntensity * level}
        distance={DISPLAY_CASE.pointDistance}
        decay={DISPLAY_CASE.lightDecay}
      />
    </group>
  );
}

/**
 * The three glass display cases behind the sofa. A click from the main view
 * enters inspection; clicking the focused case toggles its night-only spot
 * with the original soft switch sound. Cases and lights mount at once; the meshes
 * suspend on their own and report `onPrepared` once committed.
 */
export default function DisplayCases({
  power = true,
  hours = 12,
  onPrepared,
  focused = null,
  onInspect,
}: {
  power?: boolean;
  hours?: number;
  onPrepared: () => void;
  focused?: DisplayItemId | null;
  onInspect?: (id: DisplayItemId) => void;
}) {
  return (
    <group name="display-cases">
      {DISPLAY_CASES.map((item) => (
        <DisplayCase
          key={item.id}
          item={item}
          power={power}
          hours={hours}
          focused={focused === item.id}
          onInspect={onInspect}
        />
      ))}
      <Suspense fallback={null}>
        <DisplayModels onPrepared={onPrepared} />
      </Suspense>
    </group>
  );
}
