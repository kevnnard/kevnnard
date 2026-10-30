import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Matrix4, type Object3D, Raycaster, Vector3 } from "three";
import type { Vec3 } from "@/lib/world/camera.ts";
import {
  canReachSpeakers,
  clickArbiter,
  SPEAKER_BOXES,
} from "@/lib/world/speaker.ts";
import type { SpeakerMusic } from "@/lib/world/speaker-music.ts";

/** The speaker music and close-up, held by WorldApp (world-speaker-music T2). */
export interface SpeakerControl {
  music: SpeakerMusic;
  /** Explicit play/pause through the app, including persisted intent. */
  onToggle: () => void;
  /** The camera is on, or moving to, the speaker close-up. */
  focused: boolean;
  /** Enters the close-up; unset while another close-up holds the camera. */
  onFocus?: () => void;
}

/** Pointer travel past which a press is a drag, in screen px. */
const CLICK_SLOP = 6;

/**
 * The shelf speakers as the music's controls: one transparent hit box per
 * cabinet (speaker.ts, the merged parts' own bounds). One click plays or
 * pauses after a short wait, a double click focuses the speakers instead
 * (clickArbiter); the click itself unlocks the audio context, as Safari
 * requires, without fetching or playing anything. Clicks count from the
 * room side with no setup part in the way, like the screens. Rendered
 * frames only (no render loop of its own) move the audio listener with the
 * camera, which pans the music and fades it with distance.
 */
export default function SpeakerZone({
  occluders,
  control,
}: {
  /** The setup: what can stand between the camera and the speakers. */
  occluders: Object3D;
  control: SpeakerControl;
}) {
  const { gl } = useThree();
  const latest = useRef(control);
  useEffect(() => {
    latest.current = control;
  }, [control]);
  const clicks = useMemo(
    () =>
      clickArbiter(
        {
          single: () => {
            latest.current.onToggle();
          },
          double: () => latest.current.onFocus?.(),
        },
        {
          set: (run, ms) => setTimeout(run, ms),
          clear: (handle) =>
            clearTimeout(handle as ReturnType<typeof setTimeout>),
        },
      ),
    [],
  );
  useEffect(() => () => clicks.cancel(), [clicks]);

  const seen = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      forward: new Vector3(),
      up: new Vector3(),
    }),
    [],
  );
  useFrame(({ camera }) => {
    camera.updateMatrixWorld();
    if (seen.matrix.equals(camera.matrixWorld)) return;
    seen.matrix.copy(camera.matrixWorld);
    camera.getWorldPosition(seen.position);
    camera.getWorldDirection(seen.forward);
    seen.up.set(0, 1, 0).transformDirection(camera.matrixWorld);
    latest.current.music.setListener(
      seen.position.toArray() as Vec3,
      seen.forward.toArray() as Vec3,
      seen.up.toArray() as Vec3,
    );
  });

  const element = gl.domElement;
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );
  const raycaster = useMemo(() => new Raycaster(), []);
  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    const { focused, onFocus } = latest.current;
    if (!focused && !onFocus) return false;
    const { x, y, z } = event.camera.position;
    if (!canReachSpeakers([x, y, z])) return false;
    // The box encloses its cabinet: anything hit before it is in the way.
    raycaster.set(event.ray.origin, event.ray.direction);
    raycaster.far = Math.max(0, event.distance - 0.005);
    return raycaster.intersectObject(occluders, true).length === 0;
  };

  return (
    <>
      {SPEAKER_BOXES.map((box) => (
        <mesh
          key={box.center[2]}
          name="setup-speaker-hit"
          position={box.center}
          onClick={(event) => {
            if (event.delta > CLICK_SLOP || !reachable(event)) return;
            event.stopPropagation();
            latest.current.music.unlock();
            clicks.click();
          }}
          onDoubleClick={(event) => {
            if (!reachable(event)) return;
            event.stopPropagation();
            latest.current.music.unlock();
            clicks.dblclick();
          }}
          onPointerOver={(event) => {
            if (reachable(event)) element.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            element.style.cursor = "";
          }}
        >
          <boxGeometry args={box.size} />
          <meshBasicMaterial
            transparent
            opacity={0}
            colorWrite={false}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  );
}
