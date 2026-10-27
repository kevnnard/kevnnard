// Pure accelerated clock for the room's day cycle. One simulated minute passes
// per real second (60×), so a full day takes 24 real minutes. Time is derived
// from an anchor and monotonic timestamps (`performance.now()` in the browser),
// never from counting ticks, so throttled or late callbacks cannot drift it.

import { wrapHours } from "./day-cycle.ts";

/** Simulated hours per real millisecond: one minute per second. */
const HOURS_PER_MS = 1 / 60 / 1000;

/** `auto` runs; `paused` and `manual` both hold the time (manual = user set it). */
export type ClockMode = "auto" | "paused" | "manual";

export interface ClockState {
  mode: ClockMode;
  /** Simulated hour at `anchorAt`, in [0, 24). */
  anchorHours: number;
  /** Monotonic timestamp in milliseconds where `anchorHours` applies. */
  anchorAt: number;
}

/** Local PC time of `date` as fractional hours, including seconds. */
export function localHours(date: Date): number {
  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3_600_000
  );
}

export function createClock(
  hours: number,
  now: number,
  mode: ClockMode = "auto",
): ClockState {
  return { mode, anchorHours: wrapHours(hours), anchorAt: now };
}

/** Simulated hour at `now`. Timestamps before the anchor read as the anchor. */
export function clockHours(state: ClockState, now: number): number {
  if (state.mode !== "auto") return state.anchorHours;
  const elapsed = Math.max(0, now - state.anchorAt);
  return wrapHours(state.anchorHours + elapsed * HOURS_PER_MS);
}

export function pauseClock(state: ClockState, now: number): ClockState {
  return createClock(clockHours(state, now), now, "paused");
}

/** Continues from the current simulated time, wherever it was held. */
export function resumeClock(state: ClockState, now: number): ClockState {
  return createClock(clockHours(state, now), now, "auto");
}

/** Manual input holds the given hour so auto never fights the user. */
export function setClockHours(state: ClockState, hours: number): ClockState {
  return createClock(hours, state.anchorAt, "manual");
}

/** Jumps to the PC time (`pcHours`, see `localHours`) and runs from there. */
export function syncClock(
  _state: ClockState,
  pcHours: number,
  now: number,
): ClockState {
  return createClock(pcHours, now, "auto");
}
