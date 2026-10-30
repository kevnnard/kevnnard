// Subtle sound waves beside the shelf speakers (speaker-focus-console T4,
// S5-S6): three thin cartoon arcs per cabinet, after the split console
// artboard's ripples. They show only while the music actually plays; each
// ring grows out of both cabinet sides and fades in and out. Pure
// numbers from the original speaker geometry (speaker.ts); the drawing
// lives in SpeakerWaves.tsx.

import type { Vec3 } from "./camera.ts";
import { SPEAKER_BOXES, SPEAKER_PAIR } from "./speaker.ts";
import type { MusicState } from "./speaker-music.ts";

/**
 * `arcs` rings per cabinet, each of `segments` line segments sweeping
 * ±`sweep` radians, `gap` in front of the cabinet's face. A ring grows
 * from `inner` to `inner + spread` over `period` seconds, peaking at
 * `opacity` (the artboard's ripple peak). `fps` bounds the wave clock;
 * `maxStep` caps one step's seconds so a stalled tab never jumps.
 */
export const SPEAKER_WAVES = {
  arcs: 3,
  segments: 12,
  sweep: (50 * Math.PI) / 180,
  gap: 0.015,
  inner: 0.03,
  spread: 0.09,
  period: 3,
  opacity: 0.5,
  color: "#10b981",
  fps: 24,
  maxStep: 0.25,
} as const;

export const WAVE_ARCS = SPEAKER_BOXES.length * 2 * SPEAKER_WAVES.arcs;
/** Vertices of the one LineSegments draw: two per segment. */
export const WAVE_VERTICES = WAVE_ARCS * SPEAKER_WAVES.segments * 2;

/**
 * Waves mean sound: the source is playing (not loading, paused or failed),
 * the tab is visible and motion is welcome.
 */
export function wavesActive(
  state: Pick<MusicState, "status" | "playing">,
  { hidden, reducedMotion }: { hidden: boolean; reducedMotion: boolean },
): boolean {
  return (
    state.status === "playing" && state.playing && !hidden && !reducedMotion
  );
}

/** Next phase in [0, 1) after `seconds`; bad input never yields NaN. */
export function advancePhase(phase: number, seconds: number): number {
  if (!Number.isFinite(phase)) return 0;
  const step =
    Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds, SPEAKER_WAVES.maxStep) / SPEAKER_WAVES.period
      : 0;
  const next = (phase + step) % 1;
  return next < 0 ? next + 1 : next;
}

/** Ring `k`'s radius and alpha at `phase`: staggered, zero where it wraps. */
export function waveRing(
  phase: number,
  k: number,
): { radius: number; alpha: number } {
  const { arcs, inner, spread, opacity } = SPEAKER_WAVES;
  const base = Number.isFinite(phase) ? phase : 0;
  const t = (((base + k / arcs) % 1) + 1) % 1;
  return {
    radius: inner + spread * t,
    alpha: opacity * Math.max(0, Math.sin(Math.PI * t)),
  };
}

export interface WaveAnchor {
  /** Middle of one cabinet side, just in front of its face. */
  origin: Vec3;
  /** Signed z propagation: the original inward side or its outward mirror. */
  inward: number;
}

/** Inner then outer anchor per cabinet, preserving the original inner waves. */
export function waveAnchors(): WaveAnchor[] {
  return SPEAKER_BOXES.flatMap((box) => {
    const inner = Math.sign(SPEAKER_PAIR.center[2] - box.center[2]);
    return [inner, -inner].map((inward) => ({
      origin: [
        box.max[0] + SPEAKER_WAVES.gap,
        box.center[1],
        box.center[2] + (inward * box.size[2]) / 2,
      ] as Vec3,
      inward,
    }));
  });
}

/** Positions (xyz) and colors (rgba, white: the material tints) to fill. */
export function waveBuffers(): {
  positions: Float32Array;
  colors: Float32Array;
} {
  const colors = new Float32Array(WAVE_VERTICES * 4);
  for (let v = 0; v < WAVE_VERTICES; v++) colors.fill(1, v * 4, v * 4 + 3);
  return { positions: new Float32Array(WAVE_VERTICES * 3), colors };
}

const ANCHORS = waveAnchors();

/** Writes every arc at `phase`: cabinet by cabinet, side by side, ring by ring. */
export function writeWaves(
  phase: number,
  { positions, colors }: { positions: Float32Array; colors: Float32Array },
): void {
  const { arcs, segments, sweep } = SPEAKER_WAVES;
  let v = 0;
  for (const { origin, inward } of ANCHORS)
    for (let k = 0; k < arcs; k++) {
      const { radius, alpha } = waveRing(phase, k);
      for (let s = 0; s < segments; s++)
        for (const end of [s, s + 1]) {
          const angle = -sweep + (2 * sweep * end) / segments;
          positions[v * 3] = origin[0];
          positions[v * 3 + 1] = origin[1] + radius * Math.sin(angle);
          positions[v * 3 + 2] = origin[2] + inward * radius * Math.cos(angle);
          colors[v * 4 + 3] = alpha;
          v++;
        }
    }
}
