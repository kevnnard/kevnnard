import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
} from "three";
import type { SpeakerMusic } from "@/lib/world/speaker-music.ts";
import {
  advancePhase,
  SPEAKER_WAVES,
  waveBuffers,
  wavesActive,
  writeWaves,
} from "@/lib/world/speaker-waves.ts";

const watchTab = (change: () => void) => {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
};
const tabHidden = () => document.hidden;
const tabShown = () => false;

/**
 * Thin emerald arcs beside the shelf speakers while the music actually
 * plays (speaker-focus-console T4, S5): one LineSegments draw, built once.
 * Paused, loading, failed, a hidden tab or reduced motion hide them and
 * stop their clock; while shown, a 24 fps timer moves the rings and asks
 * the demand renderer for a frame, nothing more. They never take clicks,
 * so the speakers' hit boxes stay the only pointer targets.
 */
export default function SpeakerWaves({
  music,
  reducedMotion,
}: {
  music: SpeakerMusic;
  reducedMotion: boolean;
}) {
  const state = useSyncExternalStore(
    music.subscribe,
    music.getState,
    music.getState,
  );
  const hidden = useSyncExternalStore(watchTab, tabHidden, tabShown);
  const active = wavesActive(state, { hidden, reducedMotion });
  const invalidate = useThree((three) => three.invalidate);

  const waves = useMemo(() => {
    const buffers = waveBuffers();
    const position = new BufferAttribute(buffers.positions, 3);
    const color = new BufferAttribute(buffers.colors, 4);
    position.setUsage(DynamicDrawUsage);
    color.setUsage(DynamicDrawUsage);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setAttribute("color", color);
    const material = new LineBasicMaterial({
      color: SPEAKER_WAVES.color,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new LineSegments(geometry, material);
    lines.name = "speaker-waves";
    lines.visible = false;
    // A few vertices that move every tick: no bounds to keep in step.
    lines.frustumCulled = false;
    lines.raycast = () => {
      // Never a pointer target: the speakers' hit boxes take the clicks.
    };
    return { buffers, position, color, geometry, material, lines };
  }, []);

  useEffect(
    () => () => {
      waves.geometry.dispose();
      waves.material.dispose();
    },
    [waves],
  );

  useEffect(() => {
    const { buffers, position, color, lines } = waves;
    let phase = 0;
    const draw = () => {
      writeWaves(phase, buffers);
      position.needsUpdate = true;
      color.needsUpdate = true;
    };
    if (active) draw();
    lines.visible = active;
    invalidate();
    if (!active) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      phase = advancePhase(phase, (now - last) / 1000);
      last = now;
      draw();
      invalidate();
    }, 1000 / SPEAKER_WAVES.fps);
    return () => clearInterval(timer);
  }, [active, waves, invalidate]);

  return <primitive object={waves.lines} />;
}
