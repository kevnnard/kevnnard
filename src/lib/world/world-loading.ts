import { DISPLAY_MODEL_FILES } from "./display-cases.ts";
import { LIVING_FILES, LIVING_MODELS } from "./living.ts";
import { MODEL_FILES, PROP_FILES } from "./models.ts";
import { BRUNO_FILES, BRUNO_MAPS } from "./setup.ts";
import { TEXTURE_URLS } from "./textures.ts";

// World entry loader (T2, S4): honest preparation progress for /world.
// Progress counts the critical files of each group as that group commits
// in the scene (not bytes), plus three single steps: the scene root, the
// shader compile and this canvas's first prepared frame. It climbs from 1
// and holds at 99 or less until that frame; only then 100 and ready. No
// timers: a stalled or failed load never promotes.

export type WorldLoadPhase = "scene" | "assets" | "frame" | "ready";

export interface WorldLoadState {
  /** 1-99 while preparing; 100 only once ready. */
  progress: number;
  phase: WorldLoadPhase;
  /** Readable failure text; progress then stays where it was. */
  error: string | null;
}

export const INITIAL_WORLD_LOAD_STATE: WorldLoadState = {
  progress: 1,
  phase: "scene",
  error: null,
};

export type WorldMilestoneId =
  | "scene"
  | "nature"
  | "surfaces"
  | "living"
  | "steam"
  | "chair"
  | "display"
  | "compile"
  | "frame";

export interface WorldMilestone {
  id: WorldMilestoneId;
  phase: Exclude<WorldLoadPhase, "ready">;
  /** The files this group loads; empty for single steps. */
  urls: readonly string[];
  /** Files counted, or 1 for a step. */
  weight: number;
}

const milestone = (
  id: WorldMilestoneId,
  phase: WorldMilestone["phase"],
  urls: readonly string[] = [],
): WorldMilestone => ({ id, phase, urls, weight: Math.max(1, urls.length) });

/**
 * Every loader call the scene renders, in order. DOM embeds (terminal,
 * portrait player), credits and music are not part of the visual gate.
 */
export const WORLD_MILESTONES: readonly WorldMilestone[] = [
  milestone("scene", "scene"),
  milestone("nature", "assets", Object.values(MODEL_FILES)),
  milestone("surfaces", "assets", TEXTURE_URLS),
  milestone("living", "assets", [
    ...new Set(LIVING_MODELS.map((model) => LIVING_FILES[model.kind])),
  ]),
  milestone("steam", "assets", [PROP_FILES.coffeeSteam]),
  milestone("chair", "assets", [
    BRUNO_FILES.chair,
    BRUNO_MAPS.day,
    BRUNO_MAPS.night,
    BRUNO_MAPS.neutral,
    BRUNO_MAPS.lightMap,
  ]),
  milestone("display", "assets", DISPLAY_MODEL_FILES),
  milestone("compile", "frame"),
  milestone("frame", "frame"),
];

const FALLBACK_ERROR = "The world could not be prepared.";

/** Readable text for anything thrown or rejected. */
export function worldLoadError(error: unknown): string {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return text.trim() || FALLBACK_ERROR;
}

export interface WorldLoadTracker {
  getState(): WorldLoadState;
  /** Marks a milestone done; repeats are ignored (StrictMode). */
  complete(id: WorldMilestoneId): void;
  /** Keeps the first error; nothing promotes afterwards. */
  fail(error: unknown): void;
  /** Calls `listener` now and on every change; returns unsubscribe. */
  subscribe(listener: (state: WorldLoadState) => void): () => void;
  /** True exactly once, the first time it is asked while ready. */
  takeReady(): boolean;
}

const same = (a: WorldLoadState, b: WorldLoadState) =>
  a.progress === b.progress && a.phase === b.phase && a.error === b.error;

/**
 * Completed milestones are permanent: a resource that committed once stays
 * counted, so progress never goes back. Frame steps only count once every
 * earlier milestone is done.
 */
export function createWorldLoadTracker(
  milestones: readonly WorldMilestone[] = WORLD_MILESTONES,
): WorldLoadTracker {
  const done = new Set<WorldMilestoneId>();
  const listeners = new Set<(state: WorldLoadState) => void>();
  const total = milestones.reduce((sum, m) => sum + m.weight, 0);
  let state = INITIAL_WORLD_LOAD_STATE;
  let readyTaken = false;

  const update = (next: WorldLoadState) => {
    if (same(state, next)) return;
    state = next;
    for (const listener of [...listeners]) listener(state);
  };

  const derive = (): WorldLoadState => {
    const pending = milestones.find((m) => !done.has(m.id));
    if (!pending) return { progress: 100, phase: "ready", error: null };
    const counted = milestones.reduce(
      (sum, m) => sum + (done.has(m.id) ? m.weight : 0),
      0,
    );
    const share = Math.floor((counted / total) * 100);
    return {
      progress: Math.max(state.progress, Math.min(99, Math.max(1, share))),
      phase: pending.phase,
      error: null,
    };
  };

  return {
    getState: () => state,
    complete(id) {
      if (state.error !== null || done.has(id)) return;
      const index = milestones.findIndex((m) => m.id === id);
      if (index < 0) return;
      if (
        milestones[index].phase === "frame" &&
        milestones.some((m, i) => i < index && !done.has(m.id))
      )
        return;
      done.add(id);
      update(derive());
    },
    fail(error) {
      if (state.error !== null || state.phase === "ready") return;
      update({ ...state, error: worldLoadError(error) });
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    takeReady() {
      if (readyTaken || state.phase !== "ready" || state.error !== null)
        return false;
      readyTaken = true;
      return true;
    },
  };
}

/** What the first-frame barrier needs from the canvas; mockable in Node. */
export interface FramePorts {
  /** Compiles the scene's programs (gl.compileAsync). */
  compile(): Promise<unknown>;
  /** Asks the demand loop for a frame (invalidate). */
  requestFrame(): void;
  /**
   * Calls `listener` after each completed main render of this canvas's
   * scene to the screen; returns unsubscribe.
   */
  onMainRender(listener: () => void): () => void;
}

export interface FrameHandlers {
  onCompiled(): void;
  onFrame(): void;
  onError(error: unknown): void;
}

/**
 * Compile, then wait for the first main render that starts after the
 * compile settled: compileAsync alone is not a rendered frame. Cancel drops
 * every late callback (unmount, StrictMode's second run).
 */
export function prepareFirstFrame(
  ports: FramePorts,
  handlers: FrameHandlers,
): { cancel(): void } {
  let live = true;
  let unsubscribe: (() => void) | null = null;
  const stop = () => {
    live = false;
    unsubscribe?.();
    unsubscribe = null;
  };
  const fail = (error: unknown) => {
    if (!live) return;
    stop();
    handlers.onError(error);
  };
  const compiled = () => {
    if (!live) return;
    handlers.onCompiled();
    if (!live) return;
    unsubscribe = ports.onMainRender(() => {
      if (!live) return;
      stop();
      handlers.onFrame();
    });
    ports.requestFrame();
  };
  try {
    Promise.resolve(ports.compile()).then(compiled, fail);
  } catch (error) {
    // Reported asynchronously, like a rejection, so the caller's effect
    // has returned its cleanup first.
    queueMicrotask(() => fail(error));
  }
  return { cancel: stop };
}

/** Observe from scene mount, including loss while assets still suspend. */
export function bindWorldContextLoss(
  target: EventTarget,
  onError: (error: Error) => void,
): () => void {
  let live = true;
  const close = () => {
    live = false;
    target.removeEventListener("webglcontextlost", lost);
  };
  const lost = () => {
    if (!live) return;
    close();
    onError(
      new Error("The graphics context was lost. Try loading the world again."),
    );
  };
  target.addEventListener("webglcontextlost", lost);
  return close;
}
