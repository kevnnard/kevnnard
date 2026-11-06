import {
  createPortal,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  type BufferAttribute,
  Color,
  DataTexture,
  type Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  Raycaster,
  RepeatWrapping,
  type Texture,
  Vector3,
} from "three";
import { BrunoChair } from "@/components/world/BrunoProps";
import { mergeParts } from "@/components/world/House";
import MonitorScreen, {
  type MonitorTerminal,
} from "@/components/world/MonitorScreen";
import PortraitScreen, {
  type PortraitControl,
} from "@/components/world/PortraitScreen";
import {
  CoffeeSteam,
  mugGeometry,
  steamMaterial,
} from "@/components/world/SetupEffects";
import SpeakerZone, {
  type SpeakerControl,
} from "@/components/world/SpeakerZone";
import { type SurfaceMaps, surfaceMaterial } from "@/components/world/surfaces";
import type { DeskItemId, InspectItemId } from "@/lib/world/display-cases.ts";
import {
  DEFAULT_LIGHTS,
  glowPower,
  type LightSettings,
  sideLight,
} from "@/lib/world/lights.ts";
import { canEnterMonitor, isMainScreenGlow } from "@/lib/world/monitor.ts";
import { chairSway, ledLevel, setupAnimates } from "@/lib/world/motion.ts";
import {
  NORMAL_SIZE,
  normalPixels,
  woodGrainPixels,
} from "@/lib/world/normals.ts";
import { isPortraitCodeGlow } from "@/lib/world/portrait.ts";
import {
  CHAIR_PIVOT,
  DESK_HITBOXES,
  SETUP_COLORS,
  SETUP_MATERIALS,
  SETUP_PROPS,
  SETUP_ROUND_SEGMENTS,
  type SetupMaterial,
  type SetupMaterialId,
  type SetupPart,
  setupGlow,
  setupMeshes,
  setupOcclusion,
} from "@/lib/world/setup.ts";

/** Where the animation gate measures the camera distance from. */
const FOCUS = new Vector3(
  CHAIR_PIVOT[0],
  SETUP_PROPS.mug.center[1],
  CHAIR_PIVOT[1],
);
const SOLID_MERGE = {
  roundSegments: SETUP_ROUND_SEGMENTS,
  occlusion: setupOcclusion,
};

/** Pixels a press may travel and still count as a click, not a drag. */
const CLICK_SLOP = 6;

/** The desk things the camera inspects (keyboard-card T1), from WorldApp. */
export interface DeskControl {
  /** The inspected item, desk or gallery; null in the room. */
  focused: InspectItemId | null;
  /** Absent while another close-up holds the camera. */
  onInspect?: (id: DeskItemId) => void;
}

/**
 * A transparent click target just around one desk thing: only from inside
 * the room (the monitor's gate) with nothing in the way, so the ultrawide,
 * the portrait, the mouse and the speakers keep their own clicks.
 */
function DeskHit({
  id,
  occluders,
  control,
}: {
  id: DeskItemId;
  occluders: Object3D;
  control: DeskControl;
}) {
  const element = useThree((state) => state.gl.domElement);
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );
  const raycaster = useMemo(() => new Raycaster(), []);
  const { center, size } = DESK_HITBOXES[id];
  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!control.onInspect || control.focused === id) return false;
    const { x, y, z } = event.camera.position;
    if (!canEnterMonitor([x, y, z])) return false;
    // The box encloses the thing: anything hit before it is in the way.
    raycaster.set(event.ray.origin, event.ray.direction);
    raycaster.far = Math.max(0, event.distance - 0.005);
    return raycaster.intersectObject(occluders, true).length === 0;
  };
  return (
    <mesh
      name={`setup-${id}-hit`}
      position={center}
      onClick={(event) => {
        if (event.delta > CLICK_SLOP || !reachable(event)) return;
        event.stopPropagation();
        element.style.cursor = "";
        control.onInspect?.(id);
      }}
      onPointerOver={(event) => {
        if (reachable(event)) element.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        element.style.cursor = "";
      }}
    >
      <boxGeometry args={size} />
      <meshBasicMaterial
        transparent
        opacity={0}
        colorWrite={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Vertex index of the parts lit by the setup channel in the LED mesh. */
const CHANNEL_LED = 255;
/** The keyboard side lights' colour while the setup channel is dark. */
const SIDE_OFF = new Color("#2a2930");

/** An owned DataTexture over cached procedural pixels, tiled in metres. */
function tiledTexture(pixels: Uint8Array, spec: SetupMaterial): Texture {
  const texture = new DataTexture(pixels, NORMAL_SIZE, NORMAL_SIZE);
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  if (spec.tile) texture.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
  if (spec.offset) texture.offset.set(...spec.offset);
  texture.needsUpdate = true;
  return texture;
}

/** An owned DataTexture over a cached procedural normal map, tiled in metres. */
export function proceduralNormal(spec: SetupMaterial): Texture | null {
  if (!spec.normal || !spec.tile) return null;
  return tiledTexture(normalPixels(spec.normal), spec);
}

/** One material per setup material id; textures it creates join `owned`. */
export function setupMaterial(
  spec: SetupMaterial,
  maps: SurfaceMaps | undefined,
  owned: { materials: Material[]; textures: Texture[] },
): MeshStandardMaterial {
  const params = {
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    shadowSide: BackSide,
  };
  const base = spec.clearcoat
    ? new MeshPhysicalMaterial({
        ...params,
        clearcoat: spec.clearcoat,
        clearcoatRoughness: 0.4,
      })
    : new MeshStandardMaterial(params);
  const normal = proceduralNormal(spec);
  if (normal) {
    base.normalMap = normal;
    base.normalScale.setScalar(spec.normalScale ?? 1);
    owned.textures.push(normal);
  }
  // Wood grain (T12): the colour map multiplies the copper vertex colours.
  if (spec.grain && spec.tile) {
    const grain = tiledTexture(woodGrainPixels(), spec);
    base.map = grain;
    owned.textures.push(grain);
  }
  if (!spec.surface || !maps) {
    owned.materials.push(base);
    return base;
  }
  const textured = surfaceMaterial(base, spec.surface, maps);
  base.dispose();
  owned.materials.push(textured);
  return textured;
}

/** Merges parts into one mesh per material, shadowed, under `parent`. */
function addSolids(
  parent: Object3D,
  parts: SetupPart[],
  material: (id: SetupMaterialId) => Material,
) {
  const groups = new Map<SetupMaterialId, SetupPart[]>();
  for (const part of parts) {
    const list = groups.get(part.material);
    if (list) list.push(part);
    else groups.set(part.material, [part]);
  }
  for (const [id, list] of groups) {
    const body = new Mesh(mergeParts(list, SOLID_MERGE), material(id));
    body.name = `setup-${id}`;
    body.castShadow = true;
    body.receiveShadow = true;
    parent.add(body);
  }
}

/**
 * One merged LED mesh; `index` holds each vertex's LED phase index, or
 * CHANNEL_LED for the keyboard side lights on the setup channel.
 */
function ledMesh(parts: SetupPart[], material: Material) {
  const merge = { roundSegments: SETUP_ROUND_SEGMENTS };
  const geometry = mergeParts(parts, merge);
  const index = new Uint8Array(geometry.getAttribute("position").count);
  let offset = 0;
  for (const part of parts) {
    const single = mergeParts([part], merge);
    const count = single.getAttribute("position").count;
    index.fill(
      part.channel ? CHANNEL_LED : (part.led ?? 0),
      offset,
      offset + count,
    );
    offset += count;
    single.dispose();
  }
  const colors = geometry.getAttribute("color") as BufferAttribute;
  const mesh = new Mesh(geometry, material);
  mesh.name = "setup-leds";
  return { mesh, index, colors, base: Float32Array.from(colors.array) };
}

/** Paints the LED mesh: breathing LEDs at `level(index)`, side lights `side`. */
function paintLeds(
  leds: ReturnType<typeof ledMesh>,
  level: (index: number) => number,
  side: Color,
) {
  const { colors, index, base } = leds;
  for (let v = 0; v < index.length; v++) {
    const i = v * 3;
    if (index[v] === CHANNEL_LED) {
      colors.array[i] = base[i] * side.r;
      colors.array[i + 1] = base[i + 1] * side.g;
      colors.array[i + 2] = base[i + 2] * side.b;
      continue;
    }
    const k = level(index[v]);
    for (let c = 0; c < 3; c++) colors.array[i + c] = base[i + c] * k;
  }
  colors.needsUpdate = true;
}

/** The resting pose, also what reduced motion and far views show. */
function rest(
  { swivel, leds }: { swivel: Object3D; leds: ReturnType<typeof ledMesh> },
  base: number,
  side: Color,
) {
  swivel.rotation.y = 0;
  paintLeds(leds, () => base, side);
}

/**
 * Original procedural gaming setup in the main room (T4d, finished in T12).
 * Lives outside the cutaway groups, so it never fades. Screens and RGB are
 * unlit vertex colors scaled by the hour: no extra lights. Solid parts merge
 * into one mesh per material (T4g): copper wood with an original grain map,
 * powder coat, satin and matte plastics, keycaps, cones and cloth with
 * original procedural normals, and with `maps` the mesh grilles and sci-fi
 * PC panels. Grilles wait for their opacity map, so the flat fallback never
 * hides the cones. The seat is Bruno Simon's top chair with his baked
 * shader (T4k, BrunoProps.tsx).
 *
 * Effects ported from Bruno Simon's my-room-in-3d (T4i, with permission):
 * the seat sways on its column, the PC LEDs breathe and steam rises from an
 * original mug on its wooden coaster. The keyboard's side lights (T12) never animate: they take
 * the setup light's colour at a subtle strength, only at night, through its
 * switch and the master. Frames are requested continuously only while the
 * camera is near the house and motion is allowed; otherwise the setup rests
 * (chair centred, LEDs at the hour's glow, steam frozen, or
 * hidden with reduced motion). At night the scene panel's master `power` off
 * turns every screen, LED and the chair bake's artificial channels dark;
 * motion keeps running on the dark values.
 *
 * The ultrawide's screen is the terminal's idle dashboard (T16,
 * MonitorScreen.tsx): its old landscape glow parts are left out here. The
 * portrait's code lines and bouncing logo give way to its page (T18,
 * PortraitScreen.tsx): YouTube's official player and a NestJS docs preview.
 */
export default function Setup({
  hours,
  maps,
  reducedMotion = false,
  lights,
  power = true,
  terminal,
  portrait,
  speakers,
  desk,
  prepared,
}: {
  hours: number;
  maps?: SurfaceMaps;
  reducedMotion?: boolean;
  /**
   * Night light settings (T6b): Bruno's chair bake follows their colors and
   * the keyboard side lights the setup light (T12).
   */
  lights?: LightSettings;
  /** The scene panel's master switch (night only). */
  power?: boolean;
  /** The terminal drawn on the ultrawide's screen (T16), from WorldApp. */
  terminal?: MonitorTerminal;
  /** The portrait monitor's close-up (T18), from WorldApp. */
  portrait?: PortraitControl;
  /** The shelf speakers' music and close-up (world-speaker-music T2). */
  speakers?: SpeakerControl;
  /** The desk things' inspection (keyboard-card T1). */
  desk?: DeskControl;
  /**
   * World entry loader: only the textured instance reports its steam and
   * chair; the flat fallback instance is replaced and never counts.
   */
  prepared?: { steam?: () => void; chair?: () => void };
}) {
  const { invalidate } = useThree();
  const { group, glow, owned, swivel, leds, steam } = useMemo(() => {
    const meshes = setupMeshes();
    const owned = { materials: [] as Material[], textures: [] as Texture[] };
    const screens = new MeshBasicMaterial({ vertexColors: true });
    const ledMaterial = new MeshBasicMaterial({ vertexColors: true });
    const glass = new MeshStandardMaterial({
      color: SETUP_COLORS.glass,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const mugMaterial = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0,
    });
    const steam = steamMaterial();
    owned.materials.push(screens, ledMaterial, glass, mugMaterial, steam);
    const materials = new Map<SetupMaterialId, Material>();
    const material = (id: SetupMaterialId) => {
      let found = materials.get(id);
      if (!found) {
        found = setupMaterial(SETUP_MATERIALS[id], maps, owned);
        materials.set(id, found);
      }
      return found;
    };
    const setup = new Object3D() as Group;
    setup.name = "house-interior";
    const shown = meshes.solid.filter(
      (part) => maps || part.material !== "grille",
    );
    addSolids(
      setup,
      shown.filter((part) => part.rig !== "swivel"),
      material,
    );
    // The seat turns around the column: Bruno's top chair (BrunoChair) is
    // rendered into this pivot, on its axis.
    const swivel = new Object3D();
    swivel.position.set(CHAIR_PIVOT[0], 0, CHAIR_PIVOT[1]);
    addSolids(
      swivel,
      shown.filter((part) => part.rig === "swivel"),
      material,
    );
    for (const child of swivel.children)
      (child as Mesh).geometry.translate(-CHAIR_PIVOT[0], 0, -CHAIR_PIVOT[1]);
    const lit = new Mesh(
      mergeParts(
        meshes.glow.filter(
          (part) =>
            part.led === undefined &&
            !isMainScreenGlow(part) &&
            !isPortraitCodeGlow(part),
        ),
        { roundSegments: SETUP_ROUND_SEGMENTS },
      ),
      screens,
    );
    const leds = ledMesh(
      meshes.glow.filter((part) => part.led !== undefined),
      ledMaterial,
    );
    const pane = new Mesh(mergeParts(meshes.glass), glass);
    pane.renderOrder = 1;
    const mug = new Mesh(mugGeometry(), mugMaterial);
    mug.name = "setup-mug";
    mug.position.set(...SETUP_PROPS.mug.center);
    mug.castShadow = true;
    mug.receiveShadow = true;
    setup.add(swivel, lit, leds.mesh, pane, mug);
    return {
      group: setup,
      glow: screens,
      owned,
      swivel,
      leds,
      steam,
    };
  }, [maps]);

  const base = setupGlow(hours) * glowPower(power, hours);
  const side = sideLight(lights ?? DEFAULT_LIGHTS, hours, power);
  const sideColor = useMemo(
    () =>
      side.level > 0
        ? new Color(side.color).multiplyScalar(side.strength)
        : SIDE_OFF.clone(),
    [side.level, side.color, side.strength],
  );
  const effects = useMemo(() => ({ swivel, leds }), [swivel, leds]);
  const motion = useRef({ active: false });

  useLayoutEffect(() => {
    glow.color.setScalar(base);
    rest(effects, base, sideColor);
    motion.current.active = false;
    invalidate();
  }, [base, sideColor, reducedMotion, glow, effects, invalidate]);

  useFrame((frame) => {
    const active = setupAnimates({
      reducedMotion,
      distance: frame.camera.position.distanceTo(FOCUS),
    });
    if (!active) {
      if (motion.current.active) {
        motion.current.active = false;
        rest(effects, base, sideColor);
        frame.invalidate();
      }
      return;
    }
    motion.current.active = true;
    const t = frame.clock.elapsedTime * 1000;
    swivel.rotation.y = chairSway(t);
    paintLeds(leds, (index) => ledLevel(t, index, base), sideColor);
    steam.uniforms.uTime.value = t;
    frame.invalidate();
  });

  useEffect(
    () => () => {
      for (const material of owned.materials) material.dispose();
      for (const texture of owned.textures) texture.dispose();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
    [group, owned],
  );

  return (
    <>
      <primitive object={group} />
      <MonitorScreen glow={base} occluders={group} terminal={terminal} />
      <PortraitScreen
        powered={glowPower(power, hours) > 0}
        terminal={terminal?.focused ?? false}
        reducedMotion={reducedMotion}
        occluders={group}
        control={portrait}
      />
      {speakers && <SpeakerZone occluders={group} control={speakers} />}
      {desk && <DeskHit id="keyboard" occluders={group} control={desk} />}
      <Suspense fallback={null}>
        <CoffeeSteam
          material={steam}
          visible={!reducedMotion}
          onPrepared={prepared?.steam}
        />
      </Suspense>
      {createPortal(
        <Suspense fallback={null}>
          <BrunoChair
            hours={hours}
            lights={lights}
            power={power}
            onPrepared={prepared?.chair}
          />
        </Suspense>,
        swivel,
      )}
    </>
  );
}
