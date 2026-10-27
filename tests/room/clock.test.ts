import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClockState,
  clockHours,
  createClock,
  localHours,
  pauseClock,
  resumeClock,
  setClockHours,
  syncClock,
} from "../../src/lib/room/clock.ts";
import { PRESETS } from "../../src/lib/room/day-cycle.ts";

const MINUTE = 1 / 60;
const close = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${expected}, got ${actual}`,
  );

// Fake monotonic timestamps in milliseconds; never real time.
const T0 = 1_000;

describe("localHours", () => {
  it("reads the PC's local hour, minute and second", () => {
    close(localHours(new Date(2026, 9, 27, 14, 30, 45)), 14.5 + 45 / 3600);
    close(localHours(new Date(2026, 9, 27, 0, 0, 0)), 0);
  });
});

describe("room clock", () => {
  const start = createClock(14.5, T0);

  it("starts in auto mode at the given hour", () => {
    assert.equal(start.mode, "auto");
    close(clockHours(start, T0), 14.5);
  });

  it("advances one simulated minute per real second", () => {
    close(clockHours(start, T0 + 1_000), 14.5 + MINUTE);
    close(clockHours(start, T0 + 60_000), 15.5);
    // A full simulated day takes 24 real minutes.
    close(clockHours(start, T0 + 24 * 60_000), 14.5);
  });

  it("derives time from elapsed timestamps, so late or skipped callbacks never drift", () => {
    // A throttled background tab may call back after 7.3 s instead of every 1 s.
    close(clockHours(start, T0 + 7_300), 14.5 + 7.3 * MINUTE);
  });

  it("wraps past midnight", () => {
    const late = createClock(23 + 59 * MINUTE, T0);
    close(clockHours(late, T0 + 2_000), MINUTE);
  });

  it("never runs backwards for a timestamp before the anchor", () => {
    close(clockHours(start, T0 - 5_000), 14.5);
  });

  it("pauses at the current time and resumes from that same time", () => {
    const paused = pauseClock(start, T0 + 10_000);
    assert.equal(paused.mode, "paused");
    close(clockHours(paused, T0 + 500_000), 14.5 + 10 * MINUTE);
    const resumed = resumeClock(paused, T0 + 500_000);
    assert.equal(resumed.mode, "auto");
    close(clockHours(resumed, T0 + 500_000), 14.5 + 10 * MINUTE);
    close(clockHours(resumed, T0 + 503_000), 14.5 + 13 * MINUTE);
  });

  it("freezes on manual input until auto is chosen again", () => {
    const manual = setClockHours(start, PRESETS.sunset);
    assert.equal(manual.mode, "manual");
    close(clockHours(manual, T0 + 90_000), PRESETS.sunset);
    const resumed = resumeClock(manual, T0 + 90_000);
    close(clockHours(resumed, T0 + 92_000), PRESETS.sunset + 2 * MINUTE);
    // Manual hours are wrapped; non-finite input is rejected.
    close(clockHours(setClockHours(start, 25), T0), 1);
    assert.throws(() => setClockHours(start, Number.NaN), RangeError);
  });

  it("syncs to the PC time and resumes", () => {
    const manual = setClockHours(start, PRESETS.night);
    const synced = syncClock(manual, 9.25, T0 + 4_000);
    assert.equal(synced.mode, "auto");
    close(clockHours(synced, T0 + 4_000), 9.25);
    close(clockHours(synced, T0 + 5_000), 9.25 + MINUTE);
  });

  it("can start paused (reduced motion) and only runs after resume", () => {
    const held = createClock(8, T0, "paused");
    close(clockHours(held, T0 + 30_000), 8);
    close(clockHours(resumeClock(held, T0 + 30_000), T0 + 31_000), 8 + MINUTE);
  });

  it("returns new states and never mutates the previous one", () => {
    const before: ClockState = { ...start };
    pauseClock(start, T0 + 1_000);
    setClockHours(start, 3);
    syncClock(start, 3, T0 + 1_000);
    assert.deepEqual(start, before);
  });
});
