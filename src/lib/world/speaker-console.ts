// The speaker close-up's console (speaker-focus-console T3, S1/S3/S6): its
// keys, after gentle-stream's (Space, n, +/-) plus p for previous and Esc to
// leave; the spectrum bars from the real analyser's bins; and the bounded
// frame loop that draws them. Pure: the panel and WorldApp wire the DOM.

import { TRACK_IDS, type Track } from "./speaker-music.ts";

export type ConsoleAction =
  | "toggle"
  | "next"
  | "previous"
  | "louder"
  | "quieter"
  | "exit";

/**
 * The fields read from a keydown. A DOM KeyboardEvent passes as is: its
 * fields are inherited getters, so never copy it with a spread.
 */
export interface ConsoleKey {
  readonly key: string;
  readonly target: unknown;
  readonly repeat: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

export interface ConsoleTargets {
  /** The world holds the focus (the page body or inside the world). */
  owns(target: unknown): boolean;
  /** Fields, sliders, selects, editors and frames keep every key. */
  editable(target: unknown): boolean;
  /** Buttons and links: Space activates them natively. */
  activates(target: unknown): boolean;
}

/** Volume change per + or - (gentle-stream's 5%). */
export const VOLUME_STEP = 0.05;

const KEYS: Record<string, ConsoleAction> = {
  " ": "toggle",
  n: "next",
  N: "next",
  p: "previous",
  P: "previous",
  "+": "louder",
  "=": "louder",
  "-": "quieter",
  _: "quieter",
};

/** The console action for a keydown during the speaker close-up, if any. */
export function consoleKeydown(
  event: ConsoleKey,
  { owns, editable, activates }: ConsoleTargets,
): ConsoleAction | null {
  const { key, target } = event;
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
    return null;
  if (!owns(target)) return null;
  // Esc leaves from anywhere in the world, sliders included (as before).
  if (key === "Escape") return "exit";
  if (event.repeat || editable(target)) return null;
  const action = KEYS[key] ?? null;
  if (action === "toggle" && activates(target)) return null;
  return action;
}

/**
 * Averages the analyser's bins (DC excluded) into `out.length` bars, 0..1,
 * on log-spaced bands so the low notes get their own bars; each bar has at
 * least one bin of its own.
 */
export function spectrumBars(data: Uint8Array, out: Float32Array) {
  const count = out.length;
  const bins = data.length;
  let from = 1;
  for (let k = 0; k < count; k++) {
    const edge = Math.floor(bins ** ((k + 1) / count));
    const to =
      k === count - 1
        ? bins
        : Math.min(Math.max(edge, from + 1), bins - (count - k - 1));
    let sum = 0;
    for (let i = from; i < to; i++) sum += data[i];
    out[k] = to > from ? sum / (to - from) / 255 : 0;
    from = to;
  }
}

/** Spectrum redraws per second: enough to read, cheap on battery. */
export const SPECTRUM_HZ = 20;

/**
 * A frame loop at `hz` (clamped to 15-30) over a requestAnimationFrame-like
 * pair: one pending frame at most; `stop` cancels it and clears once.
 */
export function spectrumLoop({
  request,
  cancel,
  draw,
  clear,
  hz = SPECTRUM_HZ,
}: {
  request: (run: (time: number) => void) => number;
  cancel: (handle: number) => void;
  draw: (time: number) => void;
  clear: () => void;
  hz?: number;
}) {
  const interval = 1000 / Math.min(Math.max(hz, 15), 30);
  let handle: number | null = null;
  let last = Number.NEGATIVE_INFINITY;
  const frame = (time: number) => {
    handle = request(frame);
    // A millisecond of slack: display frames jitter around the interval.
    if (time - last < interval - 1) return;
    last = time;
    draw(time);
  };
  return {
    start() {
      if (handle !== null) return;
      last = Number.NEGATIVE_INFINITY;
      handle = request(frame);
    },
    stop() {
      if (handle === null) return;
      cancel(handle);
      handle = null;
      clear();
    },
    get running() {
      return handle !== null;
    },
  };
}

/** "01 / 05": the track's place in the list. */
export function trackPosition(id: Track["id"] | null): string {
  const total = String(TRACK_IDS.length).padStart(2, "0");
  const index = id ? TRACK_IDS.indexOf(id) : -1;
  return `${index < 0 ? "--" : String(index + 1).padStart(2, "0")} / ${total}`;
}
