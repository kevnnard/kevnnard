import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clockHours,
  createClock,
  pauseClock,
} from "../../src/lib/room/clock.ts";
import {
  CONTROLLER_STYLES,
  DEFAULT_CONTROLLER_STYLE,
  loadControllerStyle,
  parseControllerStyle,
  STYLE_STORAGE_KEY,
  saveControllerStyle,
} from "../../src/lib/room/controller-style.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const blocked = {
  getItem(): string | null {
    throw new DOMException("Storage disabled", "SecurityError");
  },
  setItem(): void {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  },
};

describe("controller style", () => {
  it("offers exactly the three designs with Compact as the default", () => {
    assert.deepEqual(
      [...CONTROLLER_STYLES],
      ["compact", "orbital", "timeline"],
    );
    assert.equal(DEFAULT_CONTROLLER_STYLE, "compact");
  });

  it("accepts only known style names", () => {
    for (const style of CONTROLLER_STYLES)
      assert.equal(parseControllerStyle(style), style);
    for (const value of [null, undefined, "", "Compact", "dial", "{}", 3])
      assert.equal(parseControllerStyle(value), "compact");
  });

  it("remembers the chosen style in browser storage", () => {
    const storage = memoryStorage();
    assert.equal(loadControllerStyle(storage), "compact");
    assert.equal(saveControllerStyle(storage, "timeline"), true);
    assert.deepEqual([...storage.values], [[STYLE_STORAGE_KEY, "timeline"]]);
    assert.equal(loadControllerStyle(storage), "timeline");
  });

  it("falls back to Compact for corrupt, missing or blocked storage without throwing", () => {
    assert.equal(
      loadControllerStyle(memoryStorage({ [STYLE_STORAGE_KEY]: "<script>" })),
      "compact",
    );
    assert.equal(loadControllerStyle(undefined), "compact");
    assert.equal(loadControllerStyle(blocked), "compact");
    assert.equal(saveControllerStyle(blocked, "orbital"), false);
    assert.equal(saveControllerStyle(undefined, "orbital"), false);
  });

  it("switching style leaves the shared clock untouched", () => {
    const paused = pauseClock(createClock(17, 0), 5_000);
    const snapshot = { ...paused };
    const storage = memoryStorage();
    for (const style of CONTROLLER_STYLES) {
      saveControllerStyle(storage, style);
      loadControllerStyle(storage);
      saveControllerStyle(blocked, style);
      loadControllerStyle(blocked);
    }
    assert.deepEqual(paused, snapshot);
    assert.equal(clockHours(paused, 600_000), clockHours(snapshot, 600_000));
  });
});
