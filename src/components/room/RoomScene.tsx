import { CameraControls, Html } from "@react-three/drei";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Box3,
  type Material,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  type Bounds,
  type CameraView,
  focusView,
  overviewView,
  SCREENS,
  type Screen,
} from "@/lib/room/camera.ts";
import {
  currentRoles,
  featuredProjects,
  topStack,
} from "@/lib/room/content.ts";
import { RoomAtmosphere } from "./RoomAtmosphere";

export type RoomView = "overview" | "pc" | "tv";

// Optimized exports keep their baked world transforms: render each whole scene
// untouched instead of extracting or re-positioning nodes.
export const MODEL_URLS = ["office", "desk", "chair", "lounge"].map(
  (name) => `/models/room/${name}.glb`,
);

const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

// drei <Html transform> maps 1 CSS px to distanceFactor / 400 world units.
const pxScale = (worldWidth: number, pxWidth: number) =>
  (worldWidth / pxWidth) * 400;
const PC_PX = [560, 320] as const;
const TV_PX = [660, 372] as const;
const WALL_PX = 420;

interface RoomProps {
  view: RoomView;
  reducedMotion: boolean;
  onSelect: (view: RoomView) => void;
  onReady: () => void;
  pcScreen: ReactNode;
}

interface RoomSceneProps extends RoomProps {
  /** Hour of the day (0-24) for the sky and lighting. */
  hours: number;
}

export default function RoomScene({ hours, ...props }: RoomSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: 45, near: 0.05, far: 100, position: [-8, 7, 8] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Interactive 3D room. Use the controls to focus the PC or the TV."
      role="img"
    >
      <color attach="background" args={["#151923"]} />
      <RoomAtmosphere hours={hours} reducedMotion={props.reducedMotion} />
      <Room {...props} />
    </Canvas>
  );
}

function disposeScene(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of ([] as Material[]).concat(mesh.material)) {
      for (const value of Object.values(material))
        if ((value as Texture)?.isTexture) (value as Texture).dispose();
      material.dispose();
    }
  });
}

// Memoized so time-of-day updates don't re-render the HTML screens and panels.
const Room = memo(function Room({
  view,
  reducedMotion,
  onSelect,
  onReady,
  pcScreen,
}: RoomProps) {
  const gltfs = useLoader(GLTFLoader, MODEL_URLS, extendLoader);
  const groupRef = useRef<Object3D>(null);
  const controlsRef = useRef<CameraControls>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const aspect = useThree((state) => state.size.width / state.size.height);

  useEffect(
    () => () => {
      for (const gltf of gltfs) disposeScene(gltf.scene);
      useLoader.clear(GLTFLoader, MODEL_URLS);
      document.body.style.cursor = "";
    },
    [gltfs],
  );

  // Frame the camera from what actually loaded rather than hard-coded offsets.
  useLayoutEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const box = new Box3().setFromObject(groupRef.current);
    setBounds({ min: box.min.toArray(), max: box.max.toArray() });
  }, []);

  const firstMove = useRef(true);
  useEffect(() => {
    const controls = controlsRef.current;
    if (!bounds || !controls) return;
    const target: CameraView =
      view === "overview"
        ? overviewView(bounds, camera.fov, aspect)
        : focusView(SCREENS[view], camera.fov, aspect);
    const animate = !reducedMotion && !firstMove.current;
    const [x, y, z] = target.position;
    const [tx, ty, tz] = target.target;
    controls.setLookAt(x, y, z, tx, ty, tz, animate);
    if (firstMove.current) {
      firstMove.current = false;
      onReady();
    }
  }, [bounds, view, aspect, camera, reducedMotion, onReady]);

  return (
    <>
      <CameraControls
        ref={controlsRef}
        enabled={view === "overview"}
        smoothTime={reducedMotion ? 0 : 0.6}
        minDistance={0.1}
        maxDistance={40}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2}
      />
      <group ref={groupRef}>
        {gltfs.map((gltf, index) => (
          <primitive key={MODEL_URLS[index]} object={gltf.scene} />
        ))}
      </group>

      <ScreenSurface
        screen={SCREENS.pc}
        px={PC_PX}
        label="Use the PC terminal"
        interactive={view === "pc"}
        onSelect={() => onSelect("pc")}
      >
        {pcScreen}
      </ScreenSurface>

      <ScreenSurface
        screen={SCREENS.tv}
        px={TV_PX}
        label="Watch featured projects on the TV"
        interactive={false}
        onSelect={() => onSelect("tv")}
      >
        <div
          className="h-full w-full overflow-hidden rounded bg-zinc-950/95 p-5 text-zinc-100"
          aria-hidden={view !== "tv"}
        >
          <p className="text-xs uppercase tracking-widest text-emerald-400">
            Featured projects
          </p>
          {featuredProjects.map((project) => (
            <article key={project.title} className="mt-3">
              <h3 className="text-lg font-semibold">{project.title}</h3>
              <p className="line-clamp-2 text-sm text-zinc-400">
                {project.description}
              </p>
              <p className="mt-1 text-xs text-emerald-300">
                {project.tags.map((tag) => tag.title).join(" · ")}
              </p>
            </article>
          ))}
        </div>
      </ScreenSurface>

      <WallPanel position={[1.1, 2.7, -2.9]} rotation={[0, 0, 0]} title="Stack">
        <p className="text-sm leading-relaxed">{topStack.join(" · ")}</p>
      </WallPanel>
      <WallPanel
        position={[3.35, 2.7, -1.7]}
        rotation={[0, -Math.PI / 2, 0]}
        title="Currently"
      >
        {currentRoles.map((role) => (
          <p key={role.company} className="text-sm">
            {role.title} — {role.company}
          </p>
        ))}
      </WallPanel>
    </>
  );
});

interface ScreenSurfaceProps {
  screen: Screen;
  px: readonly [number, number];
  label: string;
  /** When false, DOM content lets clicks through to the 3D hit area. */
  interactive: boolean;
  onSelect: () => void;
  children: ReactNode;
}

function ScreenSurface({
  screen,
  px,
  label,
  interactive,
  onSelect,
  children,
}: ScreenSurfaceProps) {
  const [width, height] = screen.size;
  return (
    <group position={screen.position} rotation={screen.rotation}>
      {/* Transparent hit area: the DOM controls remain the accessible path. */}
      <mesh
        position={[0, 0, 0.005]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
        name={label}
      >
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html
        transform
        position={[0, 0, 0.01]}
        distanceFactor={pxScale(width, px[0])}
        zIndexRange={[10, 0]}
        pointerEvents={interactive ? "auto" : "none"}
      >
        <div
          style={{
            width: px[0],
            height: px[1],
            pointerEvents: interactive ? "auto" : "none",
          }}
        >
          {children}
        </div>
      </Html>
    </group>
  );
}

interface WallPanelProps {
  position: [number, number, number];
  rotation: [number, number, number];
  title: string;
  children: ReactNode;
}

function WallPanel({ position, rotation, title, children }: WallPanelProps) {
  return (
    <Html
      transform
      position={position}
      rotation={rotation}
      distanceFactor={pxScale(1.4, WALL_PX)}
      zIndexRange={[5, 0]}
      pointerEvents="none"
    >
      <div
        aria-hidden
        className="pointer-events-none select-none rounded-lg border border-emerald-500/30 bg-zinc-950/80 p-4 text-zinc-100"
        style={{ width: WALL_PX }}
      >
        <p className="mb-2 text-xs uppercase tracking-widest text-emerald-400">
          {title}
        </p>
        {children}
      </div>
    </Html>
  );
}
