import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  type DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  type HemisphereLight,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  type PerspectiveCamera,
  PMREMGenerator,
  type Points,
  type PointsMaterial,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Vector3Tuple,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import DisplayCases from "@/components/world/DisplayCases";
import FloorLamp from "@/components/world/FloorLamp";
import Garden from "@/components/world/Garden";
import House from "@/components/world/House";
import KatanaShelf from "@/components/world/KatanaShelf";
import Living from "@/components/world/Living";
import type { MonitorTerminal } from "@/components/world/MonitorScreen";
import NightLights from "@/components/world/NightLights";
import type { PortraitControl } from "@/components/world/PortraitScreen";
import Setup from "@/components/world/Setup";
import Shelf from "@/components/world/Shelf";
import SofaLamps from "@/components/world/SofaLamps";
import SpeakerWaves from "@/components/world/SpeakerWaves";
import type { SpeakerControl } from "@/components/world/SpeakerZone";
import { pastelMaterial, useSurfaceMaps } from "@/components/world/surfaces";
import type { RGB } from "@/lib/room/day-cycle.ts";
import { outdoorLevel, SHELTER } from "@/lib/world/ambient-sound.ts";
import {
  GUIDE,
  guideMotion,
  guidePose,
  poseToPosition,
} from "@/lib/world/camera.ts";
import { cloudLayout, cloudShapes } from "@/lib/world/clouds.ts";
import {
  type GalleryItemId,
  isDisplayCaseId,
} from "@/lib/world/display-cases.ts";
import {
  FLOWER_COLORS,
  flowerLayout,
  flowerMesh,
} from "@/lib/world/flowers.ts";
import {
  galleryCaseFocus,
  galleryStoryShift,
} from "@/lib/world/gallery-camera.ts";
import { clearOfGarden } from "@/lib/world/garden.ts";
import {
  ISLAND,
  islandOutline,
  PAD,
  undersideMesh,
} from "@/lib/world/island.ts";
import {
  islandLayout,
  KIND_SPECS,
  type NatureKind,
  type Placement,
} from "@/lib/world/layout.ts";
import type { LightSettings } from "@/lib/world/lights.ts";
import { MODEL_FILES } from "@/lib/world/models.ts";
import { MONITOR_FOCUS, monitorFocus } from "@/lib/world/monitor.ts";
import {
  cloudShade,
  environmentIntensity,
  KEY_DISTANCE_SCALE,
  PALETTE,
  WORLD_SHADOW,
  worldLight,
} from "@/lib/world/palette.ts";
import { portraitFocus } from "@/lib/world/portrait.ts";
import { seededRandom } from "@/lib/world/random.ts";
import { lensKeeper, speakerFocus } from "@/lib/world/speaker.ts";
import { normalizeWheel, wheelDolly } from "@/lib/world/wheel.ts";
import {
  bindWorldContextLoss,
  createWorldLoadTracker,
  prepareFirstFrame,
  type WorldLoadState,
  type WorldLoadTracker,
  worldLoadError,
} from "@/lib/world/world-loading.ts";

const KINDS = Object.keys(MODEL_FILES) as NatureKind[];
const URLS = KINDS.map((kind) => MODEL_FILES[kind]);
// Nature and flowers stay off the entrance path, mailbox and sign (T7).
const LAYOUT = clearOfGarden(islandLayout(ISLAND.seed));
const FLOWERS = clearOfGarden(flowerLayout(LAYOUT, ISLAND.seed), 0.06);
const SKY_RADIUS = 90;
const STAR_COUNT = 260;

const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

const setColor = (color: Color, [r, g, b]: RGB) =>
  color.setRGB(r, g, b, SRGBColorSpace);

interface WorldSceneProps {
  /** Hour of the day (0-24) from the shared room clock. */
  hours: number;
  reducedMotion: boolean;
  /** Incremented by "Recenter view" to return to the home framing. */
  home: number;
  /** Night light settings from the scene panel (T6b). */
  lights: LightSettings;
  /**
   * The scene panel's master switch (S20): off at night darkens every
   * artificial light and glow; the sun, moon and sky never change.
   */
  power?: boolean;
  /** Listener level for the outdoor ambient beds: 0 inside the house, 1 outdoors. */
  onOutdoor?: (level: number) => void;
  /**
   * Called once, after every critical asset has committed and this canvas
   * has rendered its first prepared frame (world entry loader T2).
   */
  onReady: () => void;
  /** Preparation progress, on every change (world-loading.ts). */
  onProgress?: (state: WorldLoadState) => void;
  /** The camera holds the terminal close-up (T16). */
  focus?: boolean;
  /** The terminal on the ultrawide's screen, for both Setup branches. */
  terminal?: MonitorTerminal;
  /** The close-up transition finished (at once with reduced motion). */
  onMonitorArrive?: () => void;
  /** The portrait monitor's close-up (T18), for both Setup branches. */
  portrait?: PortraitControl;
  /** The speakers' music and close-up (world-speaker-music T2). */
  speakers?: SpeakerControl;
  /**
   * The selected gallery item, a case or the wall katana; null restores the
   * adapted home framing.
   */
  galleryCase?: GalleryItemId | null;
  /** Its story card is open: frame the model left of it (T12). */
  galleryStory?: boolean;
  onInspectCase?: (id: GalleryItemId) => void;
}

/** Critical groups that report their commit; the textured branch only. */
type Prepared = Record<
  "nature" | "surfaces" | "living" | "steam" | "chair" | "display",
  () => void
>;

/**
 * The world canvas plus its preparation tracker (T2): progress and ready
 * come from the tracker, not from any single group. Failures are reported
 * as progress errors, then rethrown to the parent's error boundary.
 */
/** Reports the camera's outdoor level from rendered frames only; no loop of its own. */
function OutdoorListener({
  onOutdoor,
}: {
  onOutdoor?: (level: number) => void;
}) {
  const latest = useRef(onOutdoor);
  useLayoutEffect(() => {
    latest.current = onOutdoor;
  }, [onOutdoor]);
  const last = useRef<number | null>(null);
  useFrame((state) => {
    const { x, z } = state.camera.position;
    const level = outdoorLevel(x, z, SHELTER);
    if (level === last.current) return;
    last.current = level;
    latest.current?.(level);
  });
  return null;
}

export default function WorldScene({
  onReady,
  onProgress,
  ...props
}: WorldSceneProps) {
  const [tracker] = useState(() => createWorldLoadTracker());
  const callbacks = useRef({ onReady, onProgress });
  useLayoutEffect(() => {
    callbacks.current = { onReady, onProgress };
  }, [onReady, onProgress]);
  // Child effects run first: subscribing replays the current state, and
  // ready is taken once even across StrictMode's second subscription.
  useEffect(
    () =>
      tracker.subscribe((state) => {
        callbacks.current.onProgress?.(state);
        if (state.phase === "ready" && tracker.takeReady())
          callbacks.current.onReady();
      }),
    [tracker],
  );
  return (
    <PreparationBoundary onError={tracker.fail}>
      <SceneCanvas {...props} tracker={tracker} />
    </PreparationBoundary>
  );
}

/**
 * Reports a failure from the canvas (a loader, WebGL or the frame barrier)
 * to the tracker once it has committed, then rethrows it so the parent's
 * boundary still shows its fallback.
 */
class PreparationBoundary extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { error: unknown; failed: boolean; reported: boolean }
> {
  state = { error: null as unknown, failed: false, reported: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
    this.setState({ reported: true });
  }

  render() {
    if (this.state.reported) throw this.state.error;
    return this.state.failed ? null : this.props.children;
  }
}

function SceneCanvas({
  hours,
  reducedMotion,
  home,
  lights,
  power = true,
  focus = false,
  terminal,
  onMonitorArrive,
  portrait,
  speakers,
  galleryCase,
  galleryStory = false,
  onInspectCase,
  tracker,
  onOutdoor,
}: Omit<WorldSceneProps, "onReady" | "onProgress"> & {
  tracker: WorldLoadTracker;
}) {
  const prepared = useMemo<Prepared>(
    () => ({
      nature: () => tracker.complete("nature"),
      surfaces: () => tracker.complete("surfaces"),
      living: () => tracker.complete("living"),
      steam: () => tracker.complete("steam"),
      chair: () => tracker.complete("chair"),
      display: () => tracker.complete("display"),
    }),
    [tracker],
  );
  // One close-up at a time (WorldApp): the terminal's, the portrait's or
  // the speakers'.
  const closeUp = portrait?.focused
    ? "portrait"
    : speakers?.focused
      ? "speakers"
      : "terminal";
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: GUIDE.fov, near: 0.1, far: 200, position: [20, 14, 20] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Stylized floating island with a wooden house. Drag to orbit, scroll to zoom in and see inside."
      role="img"
      // The portrait page's depth blending stacks the canvas over its DOM
      // (T18): kept inside this wrapper, under the world controls.
      style={{ isolation: "isolate" }}
    >
      <Preparation tracker={tracker} />
      <WorldLighting hours={hours} />
      <GuidedCamera
        galleryCase={galleryCase}
        galleryStory={galleryStory}
        reducedMotion={reducedMotion}
        home={home}
        focus={focus || closeUp !== "terminal"}
        closeUp={closeUp}
        onArrive={focus && closeUp === "terminal" ? onMonitorArrive : undefined}
      />
      <Island />
      {/* Flat materials until the texture maps arrive (T4e). */}
      <Suspense
        fallback={
          <>
            <House reducedMotion={reducedMotion} />
            <Garden hours={hours} power={power} />
            <Setup
              hours={hours}
              reducedMotion={reducedMotion}
              lights={lights}
              power={power}
              terminal={terminal}
              portrait={portrait}
              speakers={speakers}
            />
            <Shelf />
            <Suspense fallback={null}>
              <Living hours={hours} power={power} />
            </Suspense>
          </>
        }
      >
        <TexturedHouse
          reducedMotion={reducedMotion}
          hours={hours}
          lights={lights}
          power={power}
          terminal={terminal}
          portrait={portrait}
          speakers={speakers}
          galleryCase={galleryCase}
          onInspectCase={onInspectCase}
          prepared={prepared}
        />
      </Suspense>
      <NightLights hours={hours} lights={lights} power={power} />
      {/* Once, outside both Setup branches: waves while music plays. */}
      {speakers && (
        <SpeakerWaves music={speakers.music} reducedMotion={reducedMotion} />
      )}
      <OutdoorListener onOutdoor={onOutdoor} />
      <Flowers />
      <Clouds hours={hours} reducedMotion={reducedMotion} />
      {/* Its own boundary, so the scene root commits (and counts) first. */}
      <Suspense fallback={null}>
        <Nature onPrepared={prepared.nature} />
      </Suspense>
    </Canvas>
  );
}

/**
 * The scene root has committed (canvas, lights, island); once every
 * critical asset has too, compile the programs and wait for this canvas's
 * first main render after that: its default camera, to the screen. Late
 * results after unmount are dropped; failures throw to the boundary.
 */
function Preparation({ tracker }: { tracker: WorldLoadTracker }) {
  const { gl, scene, camera, invalidate } = useThree();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(
    () =>
      bindWorldContextLoss(gl.domElement, (failure) => {
        // Freeze progress immediately; React then replaces the canvas with the
        // retry fallback. The frame barrier's cleanup drops late compile work.
        tracker.fail(failure);
        setError(failure);
      }),
    [gl, tracker],
  );
  useEffect(() => tracker.complete("scene"), [tracker]);
  useEffect(
    () =>
      tracker.subscribe((state) => {
        if (state.phase === "frame" && state.error === null) setArmed(true);
      }),
    [tracker],
  );

  useEffect(() => {
    if (!armed || tracker.getState().phase === "ready") return;
    const barrier = prepareFirstFrame(
      {
        compile: () => gl.compileAsync(scene, camera),
        requestFrame: invalidate,
        // Chained onto this scene only, and restored: three calls it at the
        // end of each renderer.render(scene, ...), never for shadow passes.
        onMainRender: (listener) => {
          const previous = scene.onAfterRender;
          const hook: typeof previous = function (this: Object3D, ...args) {
            previous.apply(this, args);
            const [renderer, , view] = args;
            if (view === camera && renderer.getRenderTarget() === null)
              listener();
          };
          scene.onAfterRender = hook;
          return () => {
            if (scene.onAfterRender === hook) scene.onAfterRender = previous;
          };
        },
      },
      {
        onCompiled: () => tracker.complete("compile"),
        onFrame: () => tracker.complete("frame"),
        onError: (cause) =>
          setError(
            cause instanceof Error ? cause : new Error(worldLoadError(cause)),
          ),
      },
    );
    return barrier.cancel;
  }, [armed, gl, scene, camera, invalidate, tracker]);

  if (error) throw error;
  return null;
}

function TexturedHouse({
  reducedMotion,
  hours,
  lights,
  power,
  terminal,
  portrait,
  speakers,
  galleryCase,
  onInspectCase,
  prepared,
}: {
  reducedMotion: boolean;
  hours: number;
  lights: LightSettings;
  power: boolean;
  terminal?: MonitorTerminal;
  portrait?: PortraitControl;
  speakers?: SpeakerControl;
  galleryCase?: GalleryItemId | null;
  onInspectCase?: (id: GalleryItemId) => void;
  prepared: Prepared;
}) {
  const maps = useSurfaceMaps();
  // The textured house replaced the flat fallback.
  useEffect(() => prepared.surfaces(), [prepared]);
  return (
    <>
      <House reducedMotion={reducedMotion} maps={maps} />
      <Garden hours={hours} maps={maps} power={power} />
      <Setup
        hours={hours}
        maps={maps}
        reducedMotion={reducedMotion}
        lights={lights}
        power={power}
        terminal={terminal}
        portrait={portrait}
        speakers={speakers}
        prepared={prepared}
      />
      <Shelf
        maps={maps}
        focused={galleryCase === "collection-shelf"}
        onInspect={onInspectCase}
      />
      <FloorLamp power={power} hours={hours} />
      <SofaLamps power={power} hours={hours} />
      <DisplayCases
        power={power}
        hours={hours}
        onPrepared={prepared.display}
        focused={
          galleryCase && isDisplayCaseId(galleryCase) ? galleryCase : null
        }
        reducedMotion={reducedMotion}
        onInspect={onInspectCase}
      />
      <KatanaShelf
        power={power}
        hours={hours}
        focused={galleryCase === "katana"}
        onInspect={onInspectCase}
      />
      <Suspense fallback={null}>
        <Living
          hours={hours}
          maps={maps}
          power={power}
          onPrepared={prepared.living}
        />
      </Suspense>
    </>
  );
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  varying vec3 vDirection;
  void main() {
    float y = vDirection.y;
    vec3 color = y >= 0.0
      ? mix(horizon, zenith, pow(smoothstep(0.0, 1.0, y), 0.7))
      : mix(horizon, ground, smoothstep(0.0, 0.4, -y));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Pastel sky, stars, sun/moon key light and soft fill, all from the hour. */
function WorldLighting({ hours }: { hours: number }) {
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const stars = useRef<Points>(null);
  const { gl, scene, invalidate } = useThree();

  const uniforms = useMemo(
    () => ({
      zenith: { value: new Color() },
      horizon: { value: new Color() },
      ground: { value: new Color() },
    }),
    [],
  );

  const starGeometry = useMemo(() => {
    const random = seededRandom(ISLAND.seed * 31);
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = random() * Math.PI * 2;
      const y = 0.15 + random() * 0.85;
      const ring = Math.sqrt(1 - y * y);
      const r = SKY_RADIUS * 0.9;
      positions.set(
        [Math.cos(theta) * ring * r, y * r, Math.sin(theta) * ring * r],
        i * 3,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    return geometry;
  }, []);
  useEffect(() => () => starGeometry.dispose(), [starGeometry]);

  // A generated environment, as in /room (T4h): restrained reflections on the
  // metals and plastics. Computed once; the hour only changes its intensity.
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04);
    const previous = scene.environment;
    scene.environment = environment.texture;
    invalidate();
    room.dispose();
    generator.dispose();
    return () => {
      scene.environment = previous;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);

  // Restore what the cycle overrides on the shared renderer and scene.
  useLayoutEffect(() => {
    const exposure = gl.toneMappingExposure;
    const intensity = scene.environmentIntensity;
    return () => {
      gl.toneMappingExposure = exposure;
      scene.environmentIntensity = intensity;
    };
  }, [gl, scene]);

  useLayoutEffect(() => {
    const light = worldLight(hours);
    setColor(uniforms.zenith.value, light.sky.zenith);
    setColor(uniforms.horizon.value, light.sky.horizon);
    setColor(uniforms.ground.value, light.sky.ground);
    if (key.current) {
      const [x, y, z] = light.key.position;
      key.current.position.set(
        x * KEY_DISTANCE_SCALE,
        y * KEY_DISTANCE_SCALE,
        z * KEY_DISTANCE_SCALE,
      );
      setColor(key.current.color, light.key.color);
      key.current.intensity = light.key.intensity;
    }
    if (fill.current) {
      setColor(fill.current.color, light.ambient.sky);
      setColor(fill.current.groundColor, light.ambient.ground);
      fill.current.intensity = light.ambient.intensity;
    }
    if (stars.current) {
      const material = stars.current.material as PointsMaterial;
      material.opacity = light.stars;
      stars.current.visible = light.stars > 0.01;
    }
    if (scene.fog) setColor(scene.fog.color, light.fog);
    gl.toneMappingExposure = light.exposure;
    scene.environmentIntensity = environmentIntensity(hours);
    invalidate();
  }, [hours, uniforms, gl, scene, invalidate]);

  return (
    <>
      <fog attach="fog" args={["#f4e9e0", 45, 110]} />
      <mesh renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          fog={false}
          uniforms={uniforms}
          vertexShader={SKY_VERTEX}
          fragmentShader={SKY_FRAGMENT}
        />
      </mesh>
      <points ref={stars} geometry={starGeometry} frustumCulled={false}>
        <pointsMaterial
          color="#fff7e8"
          size={1.4}
          sizeAttenuation={false}
          transparent
          depthWrite={false}
          fog={false}
        />
      </points>
      <hemisphereLight ref={fill} />
      {/* The only shadow map (S18 fit and bias in WORLD_SHADOW). */}
      <directionalLight
        ref={key}
        castShadow
        shadow-mapSize={[WORLD_SHADOW.mapSize, WORLD_SHADOW.mapSize]}
        shadow-bias={WORLD_SHADOW.bias}
        shadow-normalBias={WORLD_SHADOW.normalBias}
        shadow-radius={WORLD_SHADOW.radius}
        shadow-camera-left={-WORLD_SHADOW.extent}
        shadow-camera-right={WORLD_SHADOW.extent}
        shadow-camera-top={WORLD_SHADOW.extent}
        shadow-camera-bottom={-WORLD_SHADOW.extent}
        shadow-camera-near={WORLD_SHADOW.near}
        shadow-camera-far={WORLD_SHADOW.far}
      />
    </>
  );
}

const { ACTION } = CameraControlsImpl;

type Pose = { position: Vector3Tuple; target: Vector3Tuple };

/**
 * Three-quarter home framing, 360° orbit around the house and close zoom; no
 * panning. With `focus` (T16) it saves the pose it had once, moves to the
 * terminal close-up with its own temporary limits and input off, reports
 * arrival, and on exit returns to the saved pose (Recenter goes home).
 * `closeUp` picks the pose: the terminal's, or the portrait's face-on one
 * fitted to the viewport (T18), refitted on resize, or the speakers' (T2),
 * whose narrow views widen the lens; the lens it had is restored on exit.
 */
function GuidedCamera({
  reducedMotion,
  home,
  focus,
  closeUp = "terminal",
  galleryCase = null,
  galleryStory = false,
  onArrive,
}: {
  reducedMotion: boolean;
  home: number;
  focus: boolean;
  closeUp?: "terminal" | "portrait" | "speakers";
  galleryCase?: GalleryItemId | null;
  galleryStory?: boolean;
  onArrive?: () => void;
}) {
  const controls = useRef<CameraControls>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);
  // Saves the lens once per visit; only the speaker close-up changes it.
  const lens = useMemo(
    () => lensKeeper(camera, invalidate),
    [camera, invalidate],
  );
  useEffect(() => () => lens.release(), [lens]);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const viewportWidth = useThree((state) => state.size.width);
  // The portrait's fit needs the viewport's pixels; other poses only refit
  // on aspect changes, as before.
  const portraitFit = useThree((state) =>
    focus && closeUp === "portrait"
      ? `${state.size.width}x${state.size.height}`
      : "",
  );
  const motion = guideMotion(reducedMotion);
  const { limits } = GUIDE;
  const first = useRef(true);
  const element = useThree((state) => state.gl.domElement);
  const focused = useRef(focus);
  const saved = useRef<Pose | null>(null);
  const epoch = useRef(0);
  const lastHome = useRef(home);
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  }, [onArrive]);
  // Unmounting cancels a pending arrival.
  useEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );

  // Wheel zoom through the ported normalize-wheel logic (T4i), so a notch or
  // a trackpad swipe zooms alike on every browser; camera-controls' own wheel
  // handling is off (`wheel: ACTION.NONE`) and still clamps the distance.
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const current = controls.current;
      if (!current) return;
      event.preventDefault();
      // The terminal close-up owns the camera: no zoom out of it.
      if (focused.current) return;
      const { pixelY } = normalizeWheel(event);
      current.dolly(wheelDolly(pixelY, current.distance), !reducedMotion);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element, reducedMotion]);

  useEffect(() => {
    const current = controls.current;
    if (!current) return;
    focused.current = focus || galleryCase !== null;
    const run = ++epoch.current;
    const animate = !reducedMotion && !first.current;
    first.current = false;
    const recentered = lastHome.current !== home;
    lastHome.current = home;
    if (focus || galleryCase) {
      // Saved once per visit: resizing re-frames the close-up only.
      saved.current ??= {
        position: current.getPosition(new Vector3()).toArray(),
        target: current.getTarget(new Vector3()).toArray(),
      };
      const [width, height] = portraitFit.split("x").map(Number);
      const speaker =
        closeUp === "speakers" && focus ? speakerFocus(aspect) : null;
      const gallery = galleryCase
        ? galleryCaseFocus(
            galleryCase,
            galleryStory
              ? galleryStoryShift(viewportWidth, aspect, galleryCase)
              : 0,
          )
        : null;
      lens.focus(gallery?.fov ?? speaker?.fov ?? GUIDE.fov);
      const { position, target } =
        gallery ??
        speaker ??
        (portraitFit ? portraitFocus({ width, height }) : monitorFocus(aspect));
      current.setLookAt(...position, ...target, animate).then(() => {
        if (epoch.current === run) arrive.current?.();
      });
      return;
    }
    lens.release();
    const back = recentered ? null : saved.current;
    saved.current = null;
    if (back) {
      current.setLookAt(...back.position, ...back.target, animate);
      return;
    }
    const [x, y, z] = poseToPosition(guidePose(aspect));
    const [tx, ty, tz] = GUIDE.target;
    current.setLookAt(x, y, z, tx, ty, tz, animate);
  }, [
    aspect,
    home,
    reducedMotion,
    focus,
    galleryCase,
    galleryStory,
    viewportWidth,
    portraitFit,
    closeUp,
    lens,
  ]);

  // Disabled controls hand touch gestures back to the browser; on the
  // terminal a touch drag scrolls the screen instead (MonitorScreen).
  useEffect(() => {
    if (focus) element.style.touchAction = "none";
  }, [focus, element]);

  const bounds = focus || galleryCase ? MONITOR_FOCUS.limits : null;

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!focus && !galleryCase}
      minDistance={bounds?.minDistance ?? limits.minDistance}
      maxDistance={bounds?.maxDistance ?? limits.maxDistance}
      minPolarAngle={bounds?.minPolar ?? limits.minPolar}
      maxPolarAngle={bounds?.maxPolar ?? limits.maxPolar}
      smoothTime={motion.smoothTime}
      draggingSmoothTime={motion.draggingSmoothTime}
      azimuthRotateSpeed={motion.azimuthRotateSpeed}
      polarRotateSpeed={motion.polarRotateSpeed}
      dollySpeed={motion.dollySpeed}
      truckSpeed={0}
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.DOLLY,
        right: ACTION.NONE,
        wheel: ACTION.NONE,
      }}
      touches={{
        one: ACTION.TOUCH_ROTATE,
        two: ACTION.TOUCH_DOLLY,
        three: ACTION.NONE,
      }}
    />
  );
}

/** Rounded grass slab, rocky underside and the building pad (T4). */
function Island() {
  const grass = useMemo(() => {
    const outline = islandOutline(72);
    // Shape is drawn in x/-z, then the extrusion is turned to grow upward.
    const shape = new Shape(outline.map(([x, z]) => new Vector2(x, -z)));
    const depth = Math.max(0.01, ISLAND.grassThickness - 2 * ISLAND.bevel);
    const geometry = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: ISLAND.bevel,
      bevelSize: ISLAND.bevel,
      bevelSegments: 4,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -(depth + ISLAND.bevel), 0);
    return geometry;
  }, []);

  const rock = useMemo(() => {
    const { positions, indices } = undersideMesh(ISLAND.seed);
    const indexed = new BufferGeometry();
    indexed.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3),
    );
    indexed.setIndex(indices);
    // Faceted rock: every face gets its own normal.
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    geometry.computeVertexNormals();
    geometry.translate(0, -ISLAND.grassThickness + 0.08, 0);
    return geometry;
  }, []);

  useEffect(
    () => () => {
      grass.dispose();
      rock.dispose();
    },
    [grass, rock],
  );

  return (
    <group>
      <mesh geometry={grass} receiveShadow castShadow>
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <mesh geometry={rock} receiveShadow>
        <meshStandardMaterial color={PALETTE.rock} roughness={1} flatShading />
      </mesh>
      {/* Flat pad the house (T4a) stands on. */}
      <mesh
        position={[PAD.center[0], PAD.height / 2, PAD.center[1]]}
        receiveShadow
      >
        <boxGeometry args={[PAD.halfX * 2, PAD.height, PAD.halfZ * 2]} />
        <meshStandardMaterial color={PALETTE.pad} roughness={1} />
      </mesh>
    </group>
  );
}

// Owned material tints: atlas colors are multiplied, then lifted toward cream.
const TINTS: Record<NatureKind, string> = {
  tree: PALETTE.foliage,
  pine: PALETTE.foliage,
  pines: PALETTE.foliage,
  "pines-b": PALETTE.foliage,
  "rock-a": PALETTE.stone,
  "rock-b": PALETTE.stone,
  stone: PALETTE.stone,
  tuft: PALETTE.foliage,
  "tuft-small": PALETTE.foliage,
  bush: PALETTE.foliage,
};
const scratch = {
  placement: new Matrix4(),
  normalize: new Matrix4(),
  instance: new Matrix4(),
  rotation: new Quaternion(),
  axis: new Vector3(0, 1, 0),
};

/** One InstancedMesh per model primitive: a draw call per primitive, not per item. */
function buildInstances(
  kind: NatureKind,
  root: Object3D,
  placements: Placement[],
): Group {
  const group = new Object3D() as Group;
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const height = KIND_SPECS[kind].height;
  const unit = height / Math.max(size.y, 1e-6);
  // Base centered on the origin, scaled to the kind's height.
  scratch.normalize
    .makeScale(unit, unit, unit)
    .multiply(new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const material = pastelMaterial(mesh.material as Material, TINTS[kind]);
    const instanced = new InstancedMesh(
      mesh.geometry,
      material,
      placements.length,
    );
    placements.forEach((item, index) => {
      scratch.rotation.setFromAxisAngle(scratch.axis, item.rotationY);
      scratch.placement.compose(
        new Vector3(...item.position),
        scratch.rotation,
        new Vector3(item.scale, item.scale, item.scale),
      );
      scratch.instance
        .copy(scratch.placement)
        .multiply(scratch.normalize)
        .multiply(mesh.matrixWorld);
      instanced.setMatrixAt(index, scratch.instance);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    group.add(instanced);
  });
  return group;
}

function Nature({ onPrepared }: { onPrepared: () => void }) {
  const gltfs = useLoader(GLTFLoader, URLS, extendLoader);

  const groups = useMemo(
    () =>
      KINDS.map((kind, index) => ({
        kind,
        group: buildInstances(
          kind,
          gltfs[index].scene,
          LAYOUT.filter((item) => item.kind === kind),
        ),
      })),
    [gltfs],
  );

  useEffect(
    () => () => {
      for (const { group } of groups)
        for (const child of group.children) {
          const mesh = child as InstancedMesh;
          (mesh.material as Material).dispose();
          mesh.dispose();
        }
    },
    [groups],
  );
  useEffect(() => onPrepared(), [onPrepared]);

  return (
    <>
      {groups.map(({ kind, group }) => (
        <primitive key={kind} object={group} />
      ))}
    </>
  );
}

/**
 * Original procedural clouds: one instanced draw per seeded shape, in a soft
 * material (fully rough, smooth normals, emissive lift) tinted by the hour.
 */
function Clouds({
  hours,
  reducedMotion,
}: {
  hours: number;
  reducedMotion: boolean;
}) {
  const clouds = useRef<Group>(null);
  const { drift } = guideMotion(reducedMotion);
  const invalidate = useThree((state) => state.invalidate);

  const { group, material } = useMemo(() => {
    const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const group = new Object3D() as Group;
    const placements = cloudLayout(ISLAND.seed);
    cloudShapes(ISLAND.seed).forEach((shape, index) => {
      const mine = placements.filter((cloud) => cloud.shape === index);
      if (mine.length === 0) return;
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(shape.positions), 3),
      );
      geometry.setAttribute(
        "normal",
        new BufferAttribute(new Float32Array(shape.normals), 3),
      );
      geometry.setIndex(shape.indices);
      const instanced = new InstancedMesh(geometry, material, mine.length);
      mine.forEach((cloud, slot) => {
        scratch.rotation.setFromAxisAngle(scratch.axis, cloud.rotationY);
        scratch.instance.compose(
          new Vector3(...cloud.position),
          scratch.rotation,
          new Vector3(cloud.scale, cloud.scale, cloud.scale),
        );
        instanced.setMatrixAt(slot, scratch.instance);
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    });
    return { group, material };
  }, []);

  useEffect(
    () => () => {
      material.dispose();
      for (const child of group.children) {
        const mesh = child as InstancedMesh;
        mesh.geometry.dispose();
        mesh.dispose();
      }
    },
    [group, material],
  );

  // Warm white by day, pink at dusk, dim blue at night.
  useLayoutEffect(() => {
    const shade = cloudShade(worldLight(hours));
    setColor(material.color, shade.color);
    setColor(material.emissive, shade.emissive);
    material.emissiveIntensity = shade.emissiveIntensity;
    invalidate();
  }, [hours, material, invalidate]);

  // Clouds drift slowly around the island; reduced motion keeps them still.
  useFrame((state, delta) => {
    if (!drift || !clouds.current) return;
    clouds.current.rotation.y += delta * 0.01;
    state.invalidate();
  });

  return (
    <group ref={clouds}>
      <primitive object={group} />
    </group>
  );
}

/** Original procedural flowers: two instanced draws for every flower. */
function Flowers() {
  const group = useMemo(() => {
    const { body, petals } = flowerMesh();
    const color = new Color();
    const bodyColors = new Float32Array(body.colors.length);
    for (let i = 0; i < body.colors.length; i += 3) {
      const [r, g, b] = body.colors.slice(i, i + 3);
      setColor(color, [r, g, b]);
      bodyColors.set([color.r, color.g, color.b], i);
    }
    const bodyGeometry = new BufferGeometry();
    bodyGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(body.positions), 3),
    );
    bodyGeometry.setAttribute("color", new BufferAttribute(bodyColors, 3));
    bodyGeometry.computeVertexNormals();
    const petalGeometry = new BufferGeometry();
    petalGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(petals.positions), 3),
    );
    petalGeometry.computeVertexNormals();

    const stems = new InstancedMesh(
      bodyGeometry,
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: DoubleSide,
      }),
      FLOWERS.length,
    );
    const blooms = new InstancedMesh(
      petalGeometry,
      new MeshStandardMaterial({ roughness: 1, side: DoubleSide }),
      FLOWERS.length,
    );
    FLOWERS.forEach((flower, index) => {
      scratch.rotation.setFromAxisAngle(scratch.axis, flower.rotationY);
      scratch.instance.compose(
        new Vector3(...flower.position),
        scratch.rotation,
        new Vector3(flower.scale, flower.scale, flower.scale),
      );
      stems.setMatrixAt(index, scratch.instance);
      blooms.setMatrixAt(index, scratch.instance);
      blooms.setColorAt(index, color.set(FLOWER_COLORS[flower.color]));
    });
    const flowers = new Object3D() as Group;
    for (const mesh of [stems, blooms]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      flowers.add(mesh);
    }
    return flowers;
  }, []);

  useEffect(
    () => () => {
      for (const child of group.children) {
        const mesh = child as InstancedMesh;
        (mesh.material as Material).dispose();
        mesh.geometry.dispose();
        mesh.dispose();
      }
    },
    [group],
  );

  return <primitive object={group} />;
}
