import { Html } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Matrix4, type Object3D, Raycaster, Vector3 } from "three";
import type { Vec3 } from "@/lib/world/camera.ts";
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
import "./portrait-screen.css";

/** The portrait close-up, held by WorldApp (T18, L75). */
export interface PortraitControl {
  /** The camera is on, or moving to, the portrait close-up. */
  focused: boolean;
  /** Enters the close-up; unset while the terminal holds the camera. */
  onEnter?: () => void;
  onExit: () => void;
}

const { center, rotationY, size, width, height, distanceFactor } =
  PORTRAIT_PAGE;

/**
 * The left portrait monitor's page (T18, S31): Gentleman Programming's
 * official YouTube player looping the clip's first ten seconds above the
 * official NestJS Controllers docs (S32), framed from docs.nestjs.com with a
 * native link outside the frame in case the site refuses it. Real DOM in perspective on the flat
 * screen (drei <Html transform>); occlude="blending" punches a screen-sized
 * depth hole in the canvas, so the house, chair and desk hide it like any
 * mesh. The official iframe mounts only in the portrait close-up while its
 * player renders at YouTube's 200x200 minimum (portraitMode); elsewhere the
 * page shows an original still with a native watch link, and a click on
 * the screen enters the close-up. The docs frame loads only in that
 * close-up too; Esc pressed inside either frame stays there, so Back and
 * Exit portrait remain the way out. The canvas lets the page take the pointer
 * only during that close-up. With the night master off the page unmounts
 * and the screen goes dark.
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

  // drei's blending turns canvas pointer events off when the page mounts;
  // they come back everywhere except in the portrait close-up.
  const mounted = mode !== "off";
  const interactive = mounted && focused;
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

  const src = portraitSrc(mode, reducedMotion);
  const docs = portraitDocsSrc(mode, focused);
  return (
    <>
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
          >
            <header
              className="portrait-channel"
              style={{ height: PORTRAIT_PAGE.header }}
            >
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
                  <p>
                    {focused
                      ? "This window is too small for the YouTube player."
                      : "Click the screen to play the loop."}
                  </p>
                  <a
                    href={PORTRAIT_LINKS.video}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch on YouTube ↗
                  </a>
                </div>
              )}
            </div>
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
          </div>
        </Html>
      )}
    </>
  );
}
