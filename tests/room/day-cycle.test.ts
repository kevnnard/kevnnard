import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type DayCycle,
  dayCycle,
  formatHours,
  PRESETS,
  phaseAt,
  shortestHourDelta,
  wrapHours,
} from "../../src/lib/room/day-cycle.ts";

const INVALID = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

// Every hour of the day at one-minute resolution, plus the wrap back to 0.
const MINUTES = Array.from({ length: 24 * 60 + 1 }, (_, minute) => minute / 60);

const colors = (state: DayCycle) => [
  state.sky.zenith,
  state.sky.horizon,
  state.sky.ground,
  state.key.color,
  state.ambient.sky,
  state.ambient.ground,
];
const scalars = (state: DayCycle) => [
  state.key.intensity,
  state.ambient.intensity,
  state.environment,
  state.exposure,
  state.accent,
  state.stars,
  state.moon.opacity,
  state.sun.glow,
];
const maxChannelGap = (a: DayCycle, b: DayCycle) =>
  Math.max(
    ...colors(a).flatMap((color, i) =>
      color.map((channel, c) => Math.abs(channel - colors(b)[i][c])),
    ),
  );

describe("wrapHours", () => {
  it("wraps any finite hour into [0, 24)", () => {
    assert.equal(wrapHours(25), 1);
    assert.equal(wrapHours(-1), 23);
    assert.equal(wrapHours(24), 0);
    assert.equal(wrapHours(48.5), 0.5);
    assert.ok(Object.is(wrapHours(-24), 0), "never returns -0");
  });

  it("rejects non-finite input with a RangeError", () => {
    for (const value of INVALID)
      assert.throws(() => wrapHours(value), RangeError);
  });
});

describe("phaseAt", () => {
  it("names the presets after their phase", () => {
    assert.equal(phaseAt(PRESETS.day), "day");
    assert.equal(phaseAt(PRESETS.sunset), "sunset");
    assert.equal(phaseAt(PRESETS.night), "night");
    assert.equal(phaseAt(6), "dawn");
  });

  it("wraps negative and multi-day hours", () => {
    assert.equal(phaseAt(-1), "night");
    assert.equal(phaseAt(24 + PRESETS.day), "day");
  });
});

describe("formatHours", () => {
  it("formats a wrapped 24-hour clock with minutes", () => {
    assert.equal(formatHours(13.5), "13:30");
    assert.equal(formatHours(-0.5), "23:30");
    assert.equal(formatHours(23.999), "00:00");
    assert.equal(formatHours(24 + 7.25), "07:15");
  });
});

describe("shortestHourDelta", () => {
  it("travels the short way around midnight", () => {
    assert.equal(shortestHourDelta(23, 1), 2);
    assert.equal(shortestHourDelta(1, 23), -2);
    assert.equal(shortestHourDelta(10, 13), 3);
    assert.equal(Math.abs(shortestHourDelta(0, 12)), 12);
  });

  it("rejects non-finite input with a RangeError", () => {
    for (const value of INVALID) {
      assert.throws(() => shortestHourDelta(value, 1), RangeError);
      assert.throws(() => shortestHourDelta(1, value), RangeError);
    }
  });
});

describe("dayCycle", () => {
  it("is the same state for equivalent hours", () => {
    assert.deepEqual(dayCycle(24), dayCycle(0));
    assert.deepEqual(dayCycle(-1), dayCycle(23));
    assert.deepEqual(dayCycle(36), dayCycle(12));
  });

  it("rejects non-finite input with a RangeError", () => {
    for (const value of INVALID)
      assert.throws(() => dayCycle(value), RangeError);
  });

  it("returns finite, in-range values for every minute of the day", () => {
    for (const hours of MINUTES) {
      const state = dayCycle(hours);
      for (const color of colors(state))
        for (const channel of color)
          assert.ok(channel >= 0 && channel <= 1, `${hours}h color ${channel}`);
      for (const value of scalars(state))
        assert.ok(Number.isFinite(value) && value >= 0, `${hours}h ${value}`);
      assert.ok(state.stars <= 1 && state.moon.opacity <= 1);
      assert.ok(state.sun.glow <= 1);
      assert.ok(state.exposure >= 0.8 && state.exposure <= 1.2);
      assert.ok(state.key.position.every(Number.isFinite));
      assert.ok(state.key.position[1] > 0, "key light stays above the floor");
      for (const direction of [state.sun.direction, state.moon.direction])
        assert.ok(Math.abs(Math.hypot(...direction) - 1) < 1e-9);
    }
  });

  it("changes smoothly minute to minute, including across midnight", () => {
    for (let i = 1; i < MINUTES.length; i++) {
      const before = dayCycle(MINUTES[i - 1]);
      const after = dayCycle(MINUTES[i]);
      assert.ok(
        maxChannelGap(before, after) < 0.03,
        `color jump at ${MINUTES[i]}h`,
      );
      scalars(before).forEach((value, s) => {
        assert.ok(
          Math.abs(value - scalars(after)[s]) < 0.06,
          `scalar ${s} jumps at ${MINUTES[i]}h`,
        );
      });
    }
  });

  it("never has the sun and the moon above the horizon together", () => {
    for (const hours of MINUTES) {
      const { sun, moon, key } = dayCycle(hours);
      assert.ok(!(sun.direction[1] > 0 && moon.direction[1] > 0), `${hours}h`);
      // The single shadow-casting key switches body only while it is dark.
      if (key.source === "sun")
        assert.ok(moon.direction[1] <= 0 || key.intensity === 0);
      if (key.source === "moon")
        assert.ok(sun.direction[1] <= 0 || key.intensity === 0);
    }
  });

  it("lights day with the sun and night with the moon and stars", () => {
    const day = dayCycle(PRESETS.day);
    const night = dayCycle(PRESETS.night);
    assert.equal(day.key.source, "sun");
    assert.equal(night.key.source, "moon");
    assert.ok(day.key.intensity > night.key.intensity * 2);
    assert.ok(day.ambient.intensity > night.ambient.intensity);
    assert.ok(day.environment > night.environment);
    assert.equal(day.stars, 0);
    assert.equal(day.moon.opacity, 0);
    assert.ok(night.stars > 0.5 && night.moon.opacity > 0.5);
    // Indoor lamps carry more of the room once it is dark outside.
    assert.ok(night.accent > day.accent);
  });

  it("makes the sunset horizon warm and the sun glow near the horizon", () => {
    const sunset = dayCycle(PRESETS.sunset);
    const day = dayCycle(PRESETS.day);
    const [r, , b] = sunset.sky.horizon;
    assert.ok(r > b, "warm horizon");
    assert.ok(sunset.sun.glow > day.sun.glow);
    assert.ok(sunset.key.intensity > 0, "low sun still lights the room");
    assert.ok(sunset.key.color[0] > sunset.key.color[2], "warm key light");
  });
});
