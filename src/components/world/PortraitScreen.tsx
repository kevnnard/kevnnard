import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Matrix4, type Object3D, Raycaster, Vector3 } from "three";
import type { Vec3 } from "@/lib/world/camera.ts";
import {
  createEditor,
  type EditorEnv,
  openView,
  type PortraitView,
  pressKey,
} from "@/lib/world/nvim-editor.ts";
import {
  PORTRAIT_DOCS,
  PORTRAIT_IFRAME,
  PORTRAIT_LINKS,
  PORTRAIT_PAGE,
  type PortraitMode,
  playerPixels,
  portraitDocsSrc,
  portraitMode,
  portraitSrc,
} from "@/lib/world/portrait.ts";
import { NVIM_CONTENT, NvimEditor, NvimPreview } from "./NvimScreen";
import "./portrait-screen.css";

/** The portrait close-up, held by WorldApp (T18, L75). */
export interface PortraitControl {
  /** The camera is on, or moving to, the portrait close-up. */
  focused: boolean;
  /** Enters the close-up; unset while the terminal holds the camera. */
  onEnter?: () => void;
  onExit: () => void;
}

const { center, rotationY, size, width, height, distanceFactor, normal } =
  PORTRAIT_PAGE;
/** The preview's plane, a hair in front of the hit area. */
const PREVIEW_AT: Vec3 = [
  center[0] + normal[0] * 0.0008,
  center[1],
  center[2] + normal[2] * 0.0008,
];

/** The page's tabs, as Neovim's bufferline. */
const TABS: readonly { view: PortraitView; label: string }[] = [
  { view: "editor", label: "NVIM" },
  { view: "gentleman", label: "Gentleman" },
  { view: "nest", label: "NestJS" },
];

/**
 * The left portrait monitor (T18, S31; portrait-neovim T1-T2). From the
 * room it shows Neovim typing this repository's code in a loop, a canvas
 * texture (NvimPreview) that animates only while the room view faces the
 * screen up close (mode "preview") and rests otherwise; reduced motion
 * shows a still frame. A click on the screen enters the close-up, where a
 * real DOM page takes its place in perspective on the flat screen (drei
 * <Html transform>; occlude="blending" punches a screen-sized depth hole in
 * the canvas, so the house, chair and desk hide it like any mesh). Its tabs:
 * a playable Neovim (NvimEditor, the default), Gentleman Programming's
 * official YouTube player looping the clip's first ten seconds, and the
 * official NestJS Controllers docs (S32), framed from docs.nestjs.com with a
 * native link outside the frame in case the site refuses it. Each iframe
 * loads only in its own tab, the player only at YouTube's 200x200 minimum
 * (portraitMode). Esc in a frame stays there; Esc on the Gentleman or NestJS
 * tab returns to Neovim; Esc in Neovim's NORMAL mode, Back and Exit portrait
 * leave. The canvas lets the page take the pointer only during the close-up.
 * With the night master off the screen goes dark.
 */
export default function PortraitScreen({
  powered,
  terminal,
  reducedMotion,
  occluders,
  control,
}: {
  powered: boolean;
  /** The terminal close-up holds the camera. */
  terminal: boolean;
  reducedMotion: boolean;
  /** The setup: what can stand between the camera and the screen. */
  occluders: Object3D;
  control?: PortraitControl;
}) {
  const { gl, invalidate } = useThree();
  const focused = control?.focused ?? false;
  const [mode, setMode] = useState<PortraitMode>(powered ? "idle" : "off");
  const seen = useRef({ matrix: new Matrix4(), key: "" });
  const eye = useMemo(() => new Vector3(), []);
  // The editor outlives the close-up: the buffer is still there next time.
  const [editor, setEditor] = useState(() => createEditor(NVIM_CONTENT));
  const view = editor.view;
  const setView = (next: PortraitView) =>
    setEditor((state) => openView(state, next));
  useEffect(() => {
    if (!focused) setEditor((state) => openView(state, "editor"));
  }, [focused]);

  // Measured on rendered frames only, and only when the camera, viewport or
  // inputs changed: no render loop of its own.
  useFrame(({ camera, size: viewport }) => {
    const key = `${powered} ${terminal} ${focused} ${viewport.width}x${viewport.height}`;
    camera.updateMatrixWorld();
    const last = seen.current;
    if (last.key === key && last.matrix.equals(camera.matrixWorld)) return;
    last.key = key;
    last.matrix.copy(camera.matrixWorld);
    camera.getWorldPosition(eye);
    setMode(
      portraitMode({
        powered,
        terminal,
        focused,
        camera: eye.toArray() as unknown as Vec3,
        pixels: playerPixels(camera, viewport),
      }),
    );
  });
  useEffect(() => {
    invalidate();
  }, [powered, terminal, focused, invalidate]);

  // The page exists only in the close-up; from the room the preview shows.
  // drei's blending turns canvas pointer events off when the page mounts;
  // they come back when it leaves.
  const mounted = focused && mode !== "off";
  const interactive = mounted;
  useLayoutEffect(() => {
    if (!mounted) return;
    const canvas = gl.domElement;
    canvas.style.pointerEvents = interactive ? "none" : "";
    return () => {
      canvas.style.pointerEvents = "";
    };
  }, [gl, mounted, interactive]);

  const canEnter = mode === "preview" && !focused && Boolean(control?.onEnter);
  const element = gl.domElement;
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );
  const raycaster = useMemo(() => new Raycaster(), []);
  const reachable = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!canEnter) return false;
    raycaster.set(event.ray.origin, event.ray.direction);
    raycaster.far = Math.max(0, event.distance - 0.005);
    return raycaster.intersectObject(occluders, true).length === 0;
  };

  const src = view === "gentleman" ? portraitSrc(mode, reducedMotion) : null;
  const docs = view === "nest" ? portraitDocsSrc(mode, focused) : null;

  // Off the editor, focus rests on the open tab, so Esc reaches the page.
  const tabRefs = useRef(new Map<PortraitView, HTMLButtonElement>());
  useEffect(() => {
    if (!interactive || view === "editor") return;
    tabRefs.current.get(view)?.focus({ preventScroll: true });
  }, [interactive, view]);
  const onPageKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (view === "editor" || event.key !== "Escape") return;
    event.stopPropagation();
    setView("editor");
  };
  const onEditorKey = (key: string, env: EditorEnv) =>
    setEditor((state) => pressKey(state, key, env));

  return (
    <>
      <NvimPreview
        position={PREVIEW_AT}
        rotationY={rotationY}
        size={size}
        visible={mode !== "off" && !mounted}
        animate={mode === "preview" && !focused}
        reducedMotion={reducedMotion}
      />
      {/* Transparent hit area: a click on the screen enters the close-up. */}
      <mesh
        position={center}
        rotation={[0, rotationY, 0]}
        onClick={(event) => {
          if (!reachable(event)) return;
          event.stopPropagation();
          control?.onEnter?.();
        }}
        onPointerOver={(event) => {
          if (reachable(event)) element.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          element.style.cursor = "";
        }}
      >
        <planeGeometry args={[size[0], size[1]]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {mounted && (
        <Html
          transform
          occlude="blending"
          geometry={<planeGeometry args={[size[0], size[1]]} />}
          distanceFactor={distanceFactor}
          position={center}
          rotation={[0, rotationY, 0]}
          pointerEvents={interactive ? "auto" : "none"}
        >
          <div
            className="portrait-page"
            style={{ width, height }}
            inert={!interactive}
            onKeyDown={onPageKey}
          >
            <header
              className="portrait-tabs"
              style={{ height: PORTRAIT_PAGE.header }}
            >
              <nav aria-label="Portrait screen">
                {TABS.map((tab) => (
                  <button
                    key={tab.view}
                    ref={(node) => {
                      if (node) tabRefs.current.set(tab.view, node);
                      else tabRefs.current.delete(tab.view);
                    }}
                    type="button"
                    aria-current={view === tab.view}
                    onClick={() => setView(tab.view)}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
              {focused && (
                <button
                  type="button"
                  className="portrait-back"
                  onClick={control?.onExit}
                >
                  Back
                </button>
              )}
            </header>
            {view === "editor" && (
              <NvimEditor
                state={editor}
                active={interactive}
                onKey={onEditorKey}
              />
            )}
            {view === "gentleman" && (
              <section
                className="portrait-gentleman"
                aria-label="Gentleman Programming"
              >
                <div
                  className="portrait-player"
                  style={{ height: PORTRAIT_PAGE.player.height }}
                >
                  {src ? (
                    <iframe
                      src={src}
                      title={PORTRAIT_IFRAME.title}
                      allow={PORTRAIT_IFRAME.allow}
                      referrerPolicy={PORTRAIT_IFRAME.referrerPolicy}
                    />
                  ) : (
                    <div className="portrait-still">
                      <span className="portrait-mark" aria-hidden="true">
                        GP
                      </span>
                      <p>This window is too small for the YouTube player.</p>
                    </div>
                  )}
                </div>
                <div className="portrait-channel">
                  <span className="portrait-mark" aria-hidden="true">
                    GP
                  </span>
                  <div className="portrait-channel-text">
                    <a
                      href={PORTRAIT_LINKS.channel}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Gentleman Programming
                    </a>
                    <span>YouTube · first 10 s on loop</span>
                  </div>
                  <a
                    href={PORTRAIT_LINKS.video}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch on YouTube ↗
                  </a>
                </div>
              </section>
            )}
            {view === "nest" && (
              <section
                className="portrait-docs"
                aria-label="NestJS documentation"
              >
                <p className="portrait-docs-bar">
                  <span>NestJS · Controllers</span>
                  <a
                    href={PORTRAIT_DOCS.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open NestJS documentation ↗
                  </a>
                </p>
                {docs ? (
                  <iframe
                    src={docs}
                    title={PORTRAIT_DOCS.title}
                    referrerPolicy={PORTRAIT_DOCS.referrerPolicy}
                  />
                ) : (
                  <div className="portrait-still">
                    <p>The official NestJS docs open here in the close-up.</p>
                  </div>
                )}
              </section>
            )}
          </div>
        </Html>
      )}
    </>
  );
}
