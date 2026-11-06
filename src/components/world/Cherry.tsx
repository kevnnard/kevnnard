import {
  type ThreeEvent,
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimationMixer, type Group, type Material, type Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  CHERRY_HITBOX,
  CHERRY_MODEL,
  CHERRY_SPOTS,
  type CherryPresence,
  type CherrySpot,
  cherryChest,
  cherryPlacement,
  cherryPresence,
  cherrySpotIndex,
  houseBlocks,
  isCherryHour,
  nextVisit,
  startVisit,
} from "@/lib/world/cherry.ts";

/** Pointer travel (px) past which a press is a drag, not a click. */
const CLICK_SLOP = 6;
/** Below this she is too faint to click. */
const CLICKABLE = 0.5;

const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * The spot of the current in-world day (dog-rig T3): a new day each time
 * the morning starts, its spot picked by cherry.ts. `held` (her close-up is
 * open) keeps the spot she is framed at, whatever the clock does.
 */
export function useCherrySpot(hours: number, held: boolean): CherrySpot {
  const [visit, setVisit] = useState(() => startVisit(new Date(), hours));
  const next = nextVisit(visit, hours);
  // Derived from the clock as it renders, like a previous-props check.
  if (next !== visit) setVisit(next);
  const spot = CHERRY_SPOTS[cherrySpotIndex(next.day)];
  const [kept, setKept] = useState(spot);
  if (!held && kept !== spot) setKept(spot);
  return held ? kept : spot;
}

/**
 * Cherry, the owner's Miniature Pinscher (dog-rig T3), in the front yard:
 * true size, feet on the grass at the day's spot, playing her idle loop
 * through an AnimationMixer. She is out in the morning hours (and while
 * her close-up is open), fading in and out over about a second, and moves
 * to a new spot only once she is gone (cherryPresence). A transparent box
 * round her takes the click, only while she shows and nothing of the
 * house stands between her and the camera; the pointer cursor hints at
 * it. Reduced motion cuts the fades and holds her still. Demand frameloop:
 * frames are requested while she shows or fades.
 */
export default function Cherry({
  hours,
  spot,
  reducedMotion,
  focused,
  onInspect,
}: {
  /** Hour of the day (0-24) from the shared clock. */
  hours: number;
  /** The day's spot (useCherrySpot). */
  spot: CherrySpot;
  reducedMotion: boolean;
  /** Her close-up is open: she stays out. */
  focused: boolean;
  /** Absent while another close-up holds the camera. */
  onInspect?: (id: "cherry") => void;
}) {
  const gltf = useLoader(GLTFLoader, CHERRY_MODEL.url, loaderOptions);
  const invalidate = useThree((state) => state.invalidate);
  const element = useThree((state) => state.gl.domElement);
  const root = useRef<Group>(null);

  // A skinned copy (the skeleton rebound to it) with materials of our own,
  // so the fade leaves the loader's shared ones alone.
  const owned = useMemo(() => {
    const dog = cloneSkinned(gltf.scene) as Group;
    const materials: Material[] = [];
    dog.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const material = (mesh.material as Material).clone();
      materials.push(material);
      mesh.material = material;
    });
    const mixer = new AnimationMixer(dog);
    const clip = gltf.animations.find(
      (animation) => animation.name === CHERRY_MODEL.clip,
    );
    if (clip) mixer.clipAction(clip).play();
    // The loop's first pose, also the still one under reduced motion.
    mixer.update(0);
    return { dog, materials, mixer };
  }, [gltf]);

  useEffect(
    () => () => {
      owned.mixer.stopAllAction();
      owned.mixer.uncacheRoot(owned.dog);
      for (const material of owned.materials) material.dispose();
    },
    [owned],
  );
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );

  const show = isCherryHour(hours) || focused;
  // Already in or out when the world opens; the fades are for changes.
  const presence = useRef<CherryPresence>({ opacity: show ? 1 : 0, spot });

  /** Shows her as `state`: placed, faded, hidden at zero. */
  const apply = (group: Group | null, state: CherryPresence) => {
    if (!group) return;
    const { position, rotationY } = cherryPlacement(state.spot);
    group.position.set(...position);
    group.rotation.y = rotationY;
    group.visible = state.opacity > 0;
    const solid = state.opacity >= 1;
    for (const material of owned.materials) {
      material.opacity = state.opacity;
      // Opaque once fully in: no sorting, the usual shadows and depth.
      if (material.transparent === solid) {
        material.transparent = !solid;
        material.needsUpdate = true;
      }
    }
  };

  // Placed before the first paint; the frame loop takes over from here.
  const placed = useRef<typeof owned | null>(null);
  useLayoutEffect(() => {
    if (placed.current === owned) return;
    placed.current = owned;
    apply(root.current, presence.current);
  });

  // A change of hour, spot or focus wakes the demand frameloop.
  useEffect(() => {
    if (show || presence.current.opacity > 0) invalidate();
  }, [show, spot, invalidate]);

  useFrame((frame, delta) => {
    // A long frame (a hidden tab) must not skip the fade.
    const dt = Math.min(delta, 0.1);
    const before = presence.current;
    const now = cherryPresence(before, show, spot, dt, reducedMotion);
    presence.current = now;
    if (now !== before) apply(root.current, now);
    if (now.opacity <= 0) return;
    if (!reducedMotion) owned.mixer.update(dt);
    if (!reducedMotion || now !== before) frame.invalidate();
  });

  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!onInspect || focused) return false;
    if (presence.current.opacity < CLICKABLE) return false;
    const { x, y, z } = event.camera.position;
    return !houseBlocks([x, y, z], cherryChest(presence.current.spot));
  };

  return (
    <group ref={root} name="cherry" visible={false}>
      <primitive object={owned.dog} />
      <mesh
        name="cherry-hit"
        position={CHERRY_HITBOX.center}
        onClick={(event) => {
          if (event.delta > CLICK_SLOP || !reachable(event)) return;
          event.stopPropagation();
          element.style.cursor = "";
          onInspect?.("cherry");
        }}
        onPointerOver={(event) => {
          if (reachable(event)) element.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          element.style.cursor = "";
        }}
      >
        <boxGeometry args={CHERRY_HITBOX.size} />
        <meshBasicMaterial
          transparent
          opacity={0}
          colorWrite={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
