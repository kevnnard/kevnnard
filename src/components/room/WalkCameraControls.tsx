import type { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import {
  look,
  stepWalk,
  WALK,
  type WalkArea,
  type WalkInput,
  type WalkPose,
  walk,
  walkView,
} from "@/lib/room/walk-camera.ts";

export const WALK_HELP_ID = "room-walk-help";
export const WALK_HELP =
  "Drag to look around. Wheel or pinch to step. Focus the scene, then use W A S D or the arrow keys to walk and turn, Page Up and Page Down to look up or down.";

type Axis = keyof WalkInput;

// event.code, so W A S D stay put on non-QWERTY layouts.
const KEYS: Record<string, readonly [Axis, number]> = {
  KeyW: ["forward", 1],
  ArrowUp: ["forward", 1],
  KeyS: ["forward", -1],
  ArrowDown: ["forward", -1],
  KeyA: ["strafe", -1],
  KeyD: ["strafe", 1],
  ArrowLeft: ["turn", -1],
  ArrowRight: ["turn", 1],
  PageUp: ["tilt", 1],
  PageDown: ["tilt", -1],
};
// Wheel pixels and pinch pixels per world unit walked.
const WHEEL_PX = 120;
const PINCH_PX = 80;
const FOCUS_CLASSES = [
  "focus-visible:outline-2",
  "focus-visible:-outline-offset-4",
  "focus-visible:outline-emerald-400",
];

interface WalkCameraControlsProps {
  controls: RefObject<CameraControls | null>;
  /** Shared with the scene so focus views return to where the user was. */
  pose: RefObject<WalkPose | null>;
  area: WalkArea;
  /** Only listens and moves while the walk view is shown. */
  active: boolean;
  reducedMotion: boolean;
  onMove: () => void;
}

/**
 * Grounded walking input on the canvas: pointer drag looks, wheel and pinch
 * step, keys walk only while the canvas has focus. Renders on demand and only
 * keeps requesting frames while a key is held.
 */
export function WalkCameraControls({
  controls,
  pose,
  area,
  active,
  reducedMotion,
  onMove,
}: WalkCameraControlsProps) {
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const fov = useThree((state) => (state.camera as { fov?: number }).fov ?? 45);
  const held = useRef(new Map<string, readonly [Axis, number]>());
  const last = useRef<number | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const apply = (next: WalkPose) => {
    const instance = controls.current;
    if (!instance) return;
    pose.current = next;
    const { position, target } = walkView(area, next);
    instance.setLookAt(...position, ...target, false);
    onMoveRef.current();
    invalidate();
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // reducedMotion is a dependency so a preference change cancels held motion.
  useEffect(() => {
    if (!active) return;
    const pointers = new Map<number, { x: number; y: number }>();
    const keys = held.current;
    const cancel = () => {
      keys.clear();
      pointers.clear();
      last.current = null;
    };
    const update = (change: (current: WalkPose) => WalkPose) => {
      if (pose.current) applyRef.current(change(pose.current));
    };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const binding = KEYS[event.code];
      if (!binding || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (keys.size === 0) last.current = null;
      keys.set(event.code, binding);
      invalidate();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      element.focus({ preventScroll: true });
      element.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const before = pointers.size === 2 ? spread() : 0;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        // Grab-style: one viewport height of drag turns by one field of view.
        const scale = (fov * Math.PI) / 180 / Math.max(1, element.clientHeight);
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        update((current) => look(current, dx * scale, dy * scale));
      } else if (pointers.size === 2) {
        const step = (spread() - before) / PINCH_PX;
        update((current) => walk(area, current, step, 0));
      }
    };
    const onPointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : 1;
      const step = (-event.deltaY * lines) / WHEEL_PX;
      update((current) => walk(area, current, step, 0));
    };
    const onVisibility = () => {
      if (document.hidden) cancel();
    };

    element.tabIndex = 0;
    element.setAttribute("role", "application");
    element.setAttribute("aria-roledescription", "3D walk view");
    element.setAttribute("aria-label", "Walk around the house");
    element.setAttribute("aria-describedby", WALK_HELP_ID);
    element.classList.add(...FOCUS_CLASSES);
    const touchAction = element.style.touchAction;
    element.style.touchAction = "none";
    const listeners = [
      ["keydown", onKeyDown],
      ["keyup", onKeyUp],
      ["blur", cancel],
      ["pointerdown", onPointerDown],
      ["pointermove", onPointerMove],
      ["pointerup", onPointerEnd],
      ["pointercancel", onPointerEnd],
      ["lostpointercapture", onPointerEnd],
    ] as const;
    for (const [type, listener] of listeners)
      element.addEventListener(type, listener as EventListener);
    element.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancel();
      for (const [type, listener] of listeners)
        element.removeEventListener(type, listener as EventListener);
      element.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
      element.style.touchAction = touchAction;
      element.classList.remove(...FOCUS_CLASSES);
      for (const name of [
        "role",
        "aria-roledescription",
        "aria-label",
        "aria-describedby",
        "tabindex",
      ])
        element.removeAttribute(name);
    };
  }, [active, reducedMotion, element, area, fov, pose, invalidate]);

  // Runs before CameraControls' own update (-1), so a step shows this frame.
  useFrame(() => {
    const keys = held.current;
    if (!active || keys.size === 0 || !pose.current) return;
    const now = performance.now();
    // The first frame after a key press or resume moves nothing.
    const dt = last.current === null ? 0 : (now - last.current) / 1000;
    last.current = now;
    const input: WalkInput = { forward: 0, strafe: 0, turn: 0, tilt: 0 };
    for (const [axis, sign] of keys.values()) input[axis] += sign;
    const next = stepWalk(
      area,
      pose.current,
      input,
      Math.min(dt, WALK.maxFrame),
    );
    applyRef.current(next);
  }, -2);

  return null;
}
