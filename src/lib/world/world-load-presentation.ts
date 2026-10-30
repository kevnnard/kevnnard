import type { WorldLoadState } from "./world-loading.ts";

/** Minimum visual assembly duration, not an artificial network delay. */
export const WORLD_REVEAL_MS = 2500;

export function presentWorldLoad(
  state: WorldLoadState,
  elapsed: number,
): WorldLoadState {
  if (state.error) return state;
  const reveal = Math.min(
    100,
    1 + Math.floor((Math.max(0, elapsed) / WORLD_REVEAL_MS) * 99),
  );
  const progress = Math.min(state.progress, reveal);
  return {
    ...state,
    progress,
    phase: state.phase === "ready" && progress < 100 ? "frame" : state.phase,
  };
}
