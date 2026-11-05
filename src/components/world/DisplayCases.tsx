import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box3,
  Group,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  type Vector3Tuple,
} from "three";
import {
  type GLTF,
  GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DISPLAY_CASE,
  DISPLAY_CASE_AIM,
  DISPLAY_CASE_SPOT_POSITION,
  DISPLAY_CASE_UPLIGHT_POSITION,
  DISPLAY_CASES,
  DISPLAY_ITEMS,
  DISPLAY_LIFT,
  DISPLAY_MODEL_FILES,
  type DisplayCasePlacement,
  type DisplayItemId,
  type DisplayModel,
  displayCaseEnvIntensity,
  displayCaseLevel,
  displayCaseStoredEnabled,
  displayLiftStep,
  displayMeshCastsShadow,
  displayModelFit,
  displayTurnStep,
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

/** A standard material of our own for this case, or the shared one. */
function ownMaterial(
  material: Material,
  owned: MeshStandardMaterial[],
): Material {
  if (!(material as MeshStandardMaterial).isMeshStandardMaterial)
    return material;
  const own = material.clone() as MeshStandardMaterial;
  owned.push(own);
  return own;
}

/**
 * A shipped mesh turned to face the room, scaled uniformly and grounded from
 * its own bounds. The scene is cloned per case, and so are its standard
 * materials (T14), so this case's reflections leave the loader's shared ones
 * alone; those clones and the tint materials are ours to dispose, the
 * loader's geometry and textures stay cached.
 */
function DisplayMesh({
  gltf,
  model,
  level,
  hours,
}: {
  gltf: GLTF;
  model: DisplayModel;
  level: number;
  hours: number;
}) {
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
      if (!tint) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((material) => ownMaterial(material, materials))
          : ownMaterial(mesh.material, materials);
        return;
      }
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
  // Case-local reflections (T14): the scene's environment, as strong as the
  // scene's by day and kept up at night while the case is lit, where the
  // scene's alone leaves the metals black. Synced each drawn frame, so the
  // environment's late arrival is picked up too.
  const { scene } = useThree();
  const envIntensity = displayCaseEnvIntensity(level, hours);
  useFrame(() => {
    for (const material of owned.materials) {
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
 * The inspected case's presentation (T8, T9): its mesh rises off the riser
 * and turns about the case axis, then settles down and back to the front.
 * Under reduced motion it neither turns nor eases: the lift jumps. Asks for
 * frames only while moving, like the chair's sway under the demand loop.
 */
function Turntable({
  lifted,
  reducedMotion,
  children,
}: {
  lifted: boolean;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const yaw = useRef(0);
  const lift = useRef(0);
  const turning = lifted && !reducedMotion;
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
  }, [lifted, invalidate]);
  useFrame((frame, delta) => {
    const node = group.current;
    const rest = lifted ? DISPLAY_LIFT.height : 0;
    if (!node || (!turning && yaw.current === 0 && lift.current === rest))
      return;
    // Clamp a long hidden-tab gap so nothing jumps.
    const dt = Math.min(delta, 0.1);
    yaw.current = displayTurnStep(yaw.current, dt, turning);
    lift.current = reducedMotion
      ? rest
      : displayLiftStep(lift.current, dt, lifted);
    node.rotation.y = yaw.current;
    node.position.y = lift.current;
    frame.invalidate();
  });
  return <group ref={group}>{children}</group>;
}

/**
 * The licensed case meshes, behind their own Suspense: counted as one
 * preparation milestone once all have committed. The inspected one turns.
 */
function DisplayModels({
  onPrepared,
  focused,
  reducedMotion,
  levels,
  hours,
}: {
  onPrepared: () => void;
  focused: DisplayItemId | null;
  reducedMotion: boolean;
  levels: Record<DisplayItemId, number>;
  hours: number;
}) {
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
            <Turntable
              lifted={focused === item.id}
              reducedMotion={reducedMotion}
            >
              <DisplayMesh
                gltf={gltf}
                model={shown.model}
                level={levels[item.id]}
                hours={hours}
              />
            </Turntable>
          </group>
        );
      })}
    </>
  );
}

/**
 * Plinth, brass reveal, five-sided glass, lid fixture and the museum lights
 * (T14): a key spot from the front of the lid aimed at the item, a weak warm
 * uplight and an LED line on the riser's front edge. The licensed meshes
 * inside come from DisplayModels.
 */
function DisplayCase({
  item,
  level,
  focused,
  onToggle,
  onInspect,
}: {
  item: DisplayCasePlacement;
  level: number;
  focused: boolean;
  onToggle: (item: DisplayCasePlacement) => void;
  onInspect?: (id: DisplayItemId) => void;
}) {
  const { invalidate } = useThree();
  // The spot's aim: a child of the case, so its world matrix stays current.
  const [spotTarget] = useState(() => new Object3D());
  const toggle = useCallback(() => onToggle(item), [onToggle, item]);

  const {
    plinth,
    plinthKick,
    rim,
    glass,
    riser,
    housing,
    puck,
    strip,
    colors,
  } = DISPLAY_CASE;
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

      {/* LED line along the riser's front edge */}
      <mesh
        position={[
          0,
          top + riser.height - strip.height / 2,
          -riser.depth / 2 - strip.depth / 2,
        ]}
      >
        <boxGeometry args={[riser.width, strip.height, strip.depth]} />
        <meshStandardMaterial
          color={isLit ? colors.puckOn : colors.puckOff}
          emissive={isLit ? DISPLAY_CASE.lightColor : "#000000"}
          emissiveIntensity={DISPLAY_CASE.stripEmissive * level}
          roughness={0.4}
        />
      </mesh>

      {/* Always mounted, zero intensity when off: a changing light count
          recompiles every material's shader and stalls the render. No
          shadows: one more shadow map per case is not worth it. */}
      <primitive object={spotTarget} position={DISPLAY_CASE_AIM} />
      <spotLight
        position={DISPLAY_CASE_SPOT_POSITION}
        target={spotTarget}
        color={DISPLAY_CASE.lightColor}
        intensity={DISPLAY_CASE.spotIntensity * level}
        angle={DISPLAY_CASE.spotAngle}
        penumbra={DISPLAY_CASE.spotPenumbra}
        distance={DISPLAY_CASE.spotDistance}
        decay={DISPLAY_CASE.lightDecay}
        castShadow={false}
      />
      <pointLight
        position={DISPLAY_CASE_UPLIGHT_POSITION}
        color={DISPLAY_CASE.lightColor}
        intensity={DISPLAY_CASE.upIntensity * level}
        distance={DISPLAY_CASE.upDistance}
        decay={DISPLAY_CASE.lightDecay}
      />
    </group>
  );
}

/**
 * The three glass display cases behind the sofa. A click from the main view
 * enters inspection; clicking the focused case toggles its night-only lights
 * with the original soft switch sound. The switches live here, so a case and
 * its model share one level. Cases and lights mount at once; the meshes
 * suspend on their own and report `onPrepared` once committed.
 */
export default function DisplayCases({
  power = true,
  hours = 12,
  onPrepared,
  focused = null,
  reducedMotion = false,
  onInspect,
}: {
  power?: boolean;
  hours?: number;
  onPrepared: () => void;
  focused?: DisplayItemId | null;
  reducedMotion?: boolean;
  onInspect?: (id: DisplayItemId) => void;
}) {
  const [enabled, setEnabled] = useState(
    () =>
      Object.fromEntries(
        DISPLAY_CASES.map((item) => [item.id, storedEnabled(item.storageKey)]),
      ) as Record<DisplayItemId, boolean>,
  );

  const toggle = useCallback((item: DisplayCasePlacement) => {
    setEnabled((prev) => {
      const next = !prev[item.id];
      try {
        localStorage.setItem(item.storageKey, String(next));
      } catch {
        // Storage might be blocked
      }
      return { ...prev, [item.id]: next };
    });
    playLampSwitch();
  }, []);

  const levels = Object.fromEntries(
    DISPLAY_CASES.map((item) => [
      item.id,
      displayCaseLevel(enabled[item.id], hours, power),
    ]),
  ) as Record<DisplayItemId, number>;

  return (
    <group name="display-cases">
      {DISPLAY_CASES.map((item) => (
        <DisplayCase
          key={item.id}
          item={item}
          level={levels[item.id]}
          focused={focused === item.id}
          onToggle={toggle}
          onInspect={onInspect}
        />
      ))}
      <Suspense fallback={null}>
        <DisplayModels
          onPrepared={onPrepared}
          focused={focused}
          reducedMotion={reducedMotion}
          levels={levels}
          hours={hours}
        />
      </Suspense>
    </group>
  );
}
