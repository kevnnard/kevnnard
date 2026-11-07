import {
  type ThreeEvent,
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type PointLight,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeParts } from "@/components/world/House";
import Patronus, { GhostParticles } from "@/components/world/Patronus";
import { CINEMATIC } from "@/lib/world/cinematic.ts";
import { canEnterMonitor } from "@/lib/world/monitor.ts";
import { SHELF, shelfToWorld } from "@/lib/world/shelf.ts";
import { spellSound } from "@/lib/world/spell-sound.ts";
import {
  SPELL,
  WAND,
  WAND_HITBOX,
  WAND_LIGHT,
  WAND_MODEL,
  WAND_TIP,
  wandAccentLevel,
  wandSpellAt,
  wandStandParts,
} from "@/lib/world/wand.ts";

/** Pointer travel (px) past which a press is a drag, not a click. */
const CLICK_SLOP = 6;

const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

/** Heniqueish's Elder Wand, scaled to 38 cm and laid on its stand. */
function WandMesh() {
  const gltf = useLoader(GLTFLoader, WAND_MODEL.url, loaderOptions);
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return copy;
  }, [gltf]);
  return (
    <group
      position={shelfToWorld(WAND.local)}
      rotation-y={SHELF.yaw}
      scale={WAND.length / WAND_MODEL.length}
    >
      <primitive object={scene} />
    </group>
  );
}

/**
 * The Elder Wand on the collection shelf (patronus T1): the mesh on its
 * dark wooden stand, the night accent light (mounted at zero when off),
 * the click box, and the spell. Focused, the spell starts as the camera
 * arrives (after the shared move, CINEMATIC.duration) and again on each
 * Cast again (`cast`): the tip's emissive bead and halo rise, a small
 * point light ramps, a silver-blue spark trail, and the patronus runs out
 * (Patronus.tsx). Reduced motion: a static glow, no particles, no run.
 */
export default function Wand({
  hours,
  power,
  focused,
  cast,
  reducedMotion,
  onInspect,
}: {
  hours: number;
  power: boolean;
  /** Its close-up is open. */
  focused: boolean;
  /** Casts this visit: 0 on arrival, then one more per Cast again. */
  cast: number;
  reducedMotion: boolean;
  /** Absent while another close-up holds the camera. */
  onInspect?: (id: "wand") => void;
}) {
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const level = wandAccentLevel(hours, power);

  const stand = useMemo(() => {
    const geometry = mergeParts(wandStandParts());
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0,
    });
    return { geometry, material };
  }, []);
  useEffect(
    () => () => {
      stand.geometry.dispose();
      stand.material.dispose();
    },
    [stand],
  );
  const aim = useMemo(() => {
    const target = new Object3D();
    target.position.set(...WAND_LIGHT.target);
    return target;
  }, []);

  // The spell's clock: seconds (performance.now() / 1000) it began. The
  // tip's glow follows `spellAt`, cleared on leaving; the run keeps
  // `runAt`, so a patronus already out finishes its run.
  const spellAt = useRef<number | null>(null);
  const runAt = useRef<number | null>(null);
  useEffect(() => {
    if (!focused) {
      spellAt.current = null;
      invalidate();
      return;
    }
    const wait = cast === 0 && !reducedMotion ? CINEMATIC.duration : 0;
    const at = performance.now() / 1000 + wait;
    spellAt.current = at;
    runAt.current = at;
    // Its sounds follow the run: a patronus already out keeps its whoosh.
    spellSound.cast(wait);
    invalidate();
  }, [focused, cast, reducedMotion, invalidate]);

  const bead = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const tipLight = useRef<PointLight>(null);
  const sparks = useMemo(() => new GhostParticles(220, 0.02, SPELL.color), []);
  useEffect(() => () => sparks.dispose(), [sparks]);
  const tip = useMemo(() => new Vector3(...WAND_TIP), []);
  const spray = useMemo(() => new Vector3(), []);
  const emitCarry = useRef(0);

  useFrame((frame, delta) => {
    const start = spellAt.current;
    const now = performance.now() / 1000;
    const t = start === null ? -1 : now - start;
    const spell = wandSpellAt(t, reducedMotion);
    const beadMaterial = bead.current?.material as
      | MeshStandardMaterial
      | undefined;
    if (beadMaterial) beadMaterial.emissiveIntensity = 3 * spell.glow;
    if (bead.current) bead.current.visible = spell.glow > 0.001;
    const haloMaterial = halo.current?.material as
      | MeshBasicMaterial
      | undefined;
    if (haloMaterial) haloMaterial.opacity = 0.55 * spell.glow;
    if (halo.current) halo.current.visible = spell.glow > 0.001;
    if (tipLight.current)
      tipLight.current.intensity = SPELL.light * spell.light;
    // The spark trail: off the tip, drifting up and out toward the room.
    emitCarry.current += 140 * spell.sparks * delta;
    while (emitCarry.current >= 1) {
      emitCarry.current -= 1;
      spray.set(
        0.25 + Math.random() * 0.35,
        0.05 + Math.random() * 0.3,
        0.1 + (Math.random() - 0.4) * 0.4,
      );
      sparks.emit(tip, spray, 0.4 + Math.random() * 0.45);
    }
    const alive = sparks.update(delta, -0.05);
    const waiting = start !== null && t < 0;
    const lit = start !== null && !reducedMotion && t < SPELL.fade[1];
    if (waiting || lit || alive) frame.invalidate();
  });

  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!onInspect || focused) return false;
    const { x, y, z } = event.camera.position;
    return x > WAND_HITBOX.center[0] && canEnterMonitor([x, y, z]);
  };
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );

  return (
    <>
      <mesh
        name="wand-stand"
        geometry={stand.geometry}
        material={stand.material as Material}
        position={SHELF.base}
        rotation-y={SHELF.yaw}
        castShadow
        receiveShadow
      />
      <Suspense fallback={null}>
        <WandMesh />
      </Suspense>

      {/* The tip: an emissive bead and an additive halo, lit by the spell. */}
      <mesh ref={bead} position={WAND_TIP} visible={false}>
        <sphereGeometry args={[0.0045, 12, 8]} />
        <meshStandardMaterial
          color="#000000"
          emissive={SPELL.color}
          emissiveIntensity={0}
        />
      </mesh>
      <mesh ref={halo} position={WAND_TIP} visible={false}>
        <sphereGeometry args={[0.022, 16, 12]} />
        <meshBasicMaterial
          color={SPELL.color}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <primitive object={sparks.points} />

      {/* Always mounted, zero intensity when off: a changing light count
          recompiles every material's shader and stalls the render. */}
      <pointLight
        ref={tipLight}
        position={WAND_TIP}
        color={SPELL.color}
        intensity={0}
        distance={SPELL.lightDistance}
        decay={2}
      />
      <primitive object={aim} />
      <spotLight
        position={WAND_LIGHT.position}
        target={aim}
        color={WAND_LIGHT.color}
        intensity={WAND_LIGHT.intensity * level}
        angle={WAND_LIGHT.angle}
        penumbra={WAND_LIGHT.penumbra}
        distance={WAND_LIGHT.distance}
        decay={WAND_LIGHT.decay}
        castShadow={false}
      />

      <Patronus castAt={runAt} reducedMotion={reducedMotion} />

      <mesh
        name="wand-hit"
        position={WAND_HITBOX.center}
        onClick={(event) => {
          if (event.delta > CLICK_SLOP || !reachable(event)) return;
          event.stopPropagation();
          element.style.cursor = "";
          // The spell's sounds unlock inside this click (spell-sound.ts).
          spellSound.unlock();
          onInspect?.("wand");
        }}
        onPointerOver={(event) => {
          if (!reachable(event)) return;
          event.stopPropagation();
          element.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          element.style.cursor = "";
        }}
      >
        <boxGeometry args={WAND_HITBOX.size} />
        <meshBasicMaterial
          transparent
          opacity={0}
          colorWrite={false}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
