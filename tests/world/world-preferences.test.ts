import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LIGHTS,
  LIGHT_IDS,
  updateLight,
} from "../../src/lib/world/lights.ts";
import {
  AMBIENT_STORAGE_KEY,
  DEFAULT_AMBIENT_PREFERENCES,
  DEFAULT_LIGHT_PREFERENCES,
  DEFAULT_MUSIC_PREFERENCES,
  LIGHTS_STORAGE_KEY,
  loadAmbientPreferences,
  loadLightPreferences,
  loadMusicPreferences,
  MUSIC_STORAGE_KEY,
  PREFERENCES_VERSION,
  type PreferenceStorage,
  saveAmbientPreferences,
  saveLightPreferences,
  saveMusicPreferences,
} from "../../src/lib/world/world-preferences.ts";

/** A `localStorage` stand-in that outlives each "page load". */
class FakeStorage implements PreferenceStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

/** Storage the browser blocks: every access throws. */
const blocked: PreferenceStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("SecurityError");
  },
};

/** Storage that reads fine but is full. */
class FullStorage extends FakeStorage {
  setItem(): void {
    throw new Error("QuotaExceededError");
  }
}

const raw = (storage: FakeStorage, key: string, value: unknown) =>
  storage.setItem(key, JSON.stringify(value));

describe("world preference defaults (S2-S3)", () => {
  it("music starts enabled at 50 % volume and the full 100 % range", () => {
    assert.deepEqual(DEFAULT_MUSIC_PREFERENCES, {
      volume: 0.5,
      range: 1,
      enabled: true,
    });
  });

  it("lights default to the requested colours with the master on", () => {
    assert.deepEqual(DEFAULT_LIGHT_PREFERENCES, {
      lights: DEFAULT_LIGHTS,
      power: true,
    });
  });

  it("missing, blocked or absent storage loads fresh default copies", () => {
    for (const storage of [new FakeStorage(), blocked, undefined]) {
      const lights = loadLightPreferences(storage);
      const music = loadMusicPreferences(storage);
      assert.deepEqual(lights, DEFAULT_LIGHT_PREFERENCES);
      assert.deepEqual(music, DEFAULT_MUSIC_PREFERENCES);
      assert.notEqual(lights.lights, DEFAULT_LIGHTS, "a copy, not the default");
      assert.notEqual(lights.lights.tv, DEFAULT_LIGHTS.tv);
      assert.notEqual(music, DEFAULT_MUSIC_PREFERENCES);
    }
  });
});

describe("world preferences across reloads (S1)", () => {
  it("a new consumer reads back changed lights, master and music", () => {
    const storage = new FakeStorage();
    const lights = updateLight(
      updateLight(DEFAULT_LIGHTS, "tv", { color: "#123abc", intensity: 35 }),
      "lampLeft",
      { enabled: false },
    );
    assert.equal(saveLightPreferences(storage, { lights, power: false }), true);
    assert.equal(
      saveMusicPreferences(storage, {
        volume: 0.2,
        range: 0.35,
        enabled: false,
      }),
      true,
    );
    // Reload: nothing in memory survives but the storage.
    assert.deepEqual(loadLightPreferences(storage), { lights, power: false });
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0.2,
      range: 0.35,
      enabled: false,
    });
  });

  it("paused music stays paused: a stored false is never defaulted to true", () => {
    const storage = new FakeStorage();
    saveMusicPreferences(storage, {
      ...DEFAULT_MUSIC_PREFERENCES,
      enabled: false,
    });
    assert.equal(loadMusicPreferences(storage).enabled, false);
    assert.equal(loadMusicPreferences(storage).enabled, false, "twice");
  });

  it("lights and music are separate records: saving one keeps the other", () => {
    const storage = new FakeStorage();
    const lights = updateLight(DEFAULT_LIGHTS, "setup", { color: "#00ff00" });
    saveLightPreferences(storage, { lights, power: true });
    saveMusicPreferences(storage, { volume: 0.8, range: 0, enabled: true });
    saveLightPreferences(storage, { lights: DEFAULT_LIGHTS, power: false });
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0.8,
      range: 0,
      enabled: true,
    });
    saveMusicPreferences(storage, DEFAULT_MUSIC_PREFERENCES);
    assert.equal(loadLightPreferences(storage).power, false);
    assert.notEqual(storage.getItem(LIGHTS_STORAGE_KEY), null);
    assert.notEqual(storage.getItem(MUSIC_STORAGE_KEY), null);
    assert.notEqual(LIGHTS_STORAGE_KEY, MUSIC_STORAGE_KEY);
  });

  it("Reset lights then reload gives the defaults back, master and music kept", () => {
    const storage = new FakeStorage();
    const changed = updateLight(DEFAULT_LIGHTS, "tv", { intensity: 5 });
    saveLightPreferences(storage, { lights: changed, power: false });
    saveMusicPreferences(storage, { volume: 0.1, range: 0.4, enabled: false });
    // Reset lights only replaces the per-light settings.
    saveLightPreferences(storage, { lights: DEFAULT_LIGHTS, power: false });
    assert.deepEqual(loadLightPreferences(storage), {
      lights: DEFAULT_LIGHTS,
      power: false,
    });
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0.1,
      range: 0.4,
      enabled: false,
    });
  });

  it("writes versioned JSON with only the known fields", () => {
    const storage = new FakeStorage();
    saveMusicPreferences(storage, {
      volume: 0.3,
      range: 0.6,
      enabled: true,
      extra: "dropped",
    } as never);
    assert.deepEqual(JSON.parse(storage.getItem(MUSIC_STORAGE_KEY) ?? ""), {
      version: PREFERENCES_VERSION,
      volume: 0.3,
      range: 0.6,
      enabled: true,
    });
    saveLightPreferences(storage, DEFAULT_LIGHT_PREFERENCES);
    const lights = JSON.parse(storage.getItem(LIGHTS_STORAGE_KEY) ?? "");
    assert.equal(lights.version, PREFERENCES_VERSION);
    assert.deepEqual(Object.keys(lights.lights).sort(), [...LIGHT_IDS].sort());
  });

  it("never mutates the user's data or the defaults", () => {
    const storage = new FakeStorage();
    const lights = updateLight(DEFAULT_LIGHTS, "tv", { color: "#abcdef" });
    const prefs = { lights, power: true };
    const music = { volume: 0.4, range: 0.9, enabled: true };
    const before = structuredClone({ prefs, music, DEFAULT_LIGHTS });
    const defaults = structuredClone({
      DEFAULT_LIGHT_PREFERENCES,
      DEFAULT_MUSIC_PREFERENCES,
    });
    saveLightPreferences(storage, prefs);
    saveMusicPreferences(storage, music);
    const loaded = loadLightPreferences(storage);
    loaded.lights.tv.intensity = 1;
    loadMusicPreferences(storage).volume = 0;
    loadLightPreferences(new FakeStorage()).lights.setup.color = "#000000";
    assert.deepEqual({ prefs, music, DEFAULT_LIGHTS }, before);
    assert.deepEqual(
      { DEFAULT_LIGHT_PREFERENCES, DEFAULT_MUSIC_PREFERENCES },
      defaults,
    );
    assert.equal(loadLightPreferences(storage).lights.tv.color, "#abcdef");
  });
});

describe("world preferences reject malformed storage", () => {
  it("falls back to the defaults for garbage, wrong types and other versions", () => {
    for (const value of [
      "not json{",
      "null",
      "42",
      '"text"',
      "[]",
      JSON.stringify({ version: PREFERENCES_VERSION + 1, volume: 0.1 }),
      JSON.stringify({ volume: 0.1, range: 0.1, enabled: false }),
    ]) {
      const storage = new FakeStorage();
      storage.setItem(LIGHTS_STORAGE_KEY, value);
      storage.setItem(MUSIC_STORAGE_KEY, value);
      assert.deepEqual(
        loadLightPreferences(storage),
        DEFAULT_LIGHT_PREFERENCES,
      );
      assert.deepEqual(
        loadMusicPreferences(storage),
        DEFAULT_MUSIC_PREFERENCES,
      );
    }
  });

  it("keeps each valid field of a partial record and defaults the rest", () => {
    const storage = new FakeStorage();
    raw(storage, MUSIC_STORAGE_KEY, {
      version: PREFERENCES_VERSION,
      volume: 0.25,
      enabled: "yes",
    });
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0.25,
      range: DEFAULT_MUSIC_PREFERENCES.range,
      enabled: DEFAULT_MUSIC_PREFERENCES.enabled,
    });
    raw(storage, LIGHTS_STORAGE_KEY, {
      version: PREFERENCES_VERSION,
      power: "off",
      lights: {
        tv: { enabled: false, color: "#ABCDEF", intensity: "loud" },
        setup: "red",
        lampLeft: { color: "white", intensity: 12 },
        unknown: { enabled: false, color: "#000000", intensity: 0 },
      },
    });
    const loaded = loadLightPreferences(storage);
    assert.equal(loaded.power, true, "a non-boolean master stays on");
    assert.deepEqual(loaded.lights.tv, {
      enabled: false,
      color: "#abcdef",
      intensity: DEFAULT_LIGHTS.tv.intensity,
    });
    assert.deepEqual(loaded.lights.setup, DEFAULT_LIGHTS.setup);
    assert.deepEqual(loaded.lights.lampLeft, {
      ...DEFAULT_LIGHTS.lampLeft,
      intensity: 12,
    });
    assert.deepEqual(loaded.lights.lampRight, DEFAULT_LIGHTS.lampRight);
    assert.deepEqual(Object.keys(loaded.lights).sort(), [...LIGHT_IDS].sort());
  });

  it("rejects out-of-bounds, non-finite numbers and bad hex colours", () => {
    const storage = new FakeStorage();
    for (const [volume, range] of [
      [1.5, -0.1],
      [-1, 2],
      [null, "0.5"],
    ]) {
      raw(storage, MUSIC_STORAGE_KEY, {
        version: PREFERENCES_VERSION,
        volume,
        range,
        enabled: false,
      });
      assert.deepEqual(loadMusicPreferences(storage), {
        ...DEFAULT_MUSIC_PREFERENCES,
        enabled: false,
      });
    }
    // JSON cannot hold NaN or Infinity: they arrive as null.
    storage.setItem(
      MUSIC_STORAGE_KEY,
      `{"version":${PREFERENCES_VERSION},"volume":1e999,"range":-1e999}`,
    );
    assert.deepEqual(loadMusicPreferences(storage), DEFAULT_MUSIC_PREFERENCES);
    for (const light of [
      { color: "#fff", intensity: 101 },
      { color: "ffffff", intensity: -1 },
      { color: "#gggggg", intensity: Number.POSITIVE_INFINITY },
      { color: " #ffffff", intensity: null },
    ]) {
      raw(storage, LIGHTS_STORAGE_KEY, {
        version: PREFERENCES_VERSION,
        power: false,
        lights: { tv: light },
      });
      assert.deepEqual(loadLightPreferences(storage), {
        lights: DEFAULT_LIGHTS,
        power: false,
      });
    }
  });

  it("keeps the edges and rounds a stored intensity like the slider", () => {
    const storage = new FakeStorage();
    raw(storage, MUSIC_STORAGE_KEY, {
      version: PREFERENCES_VERSION,
      volume: 0,
      range: 1,
      enabled: true,
    });
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0,
      range: 1,
      enabled: true,
    });
    raw(storage, LIGHTS_STORAGE_KEY, {
      version: PREFERENCES_VERSION,
      lights: { tv: { intensity: 0 }, setup: { intensity: 42.6 } },
    });
    const { lights } = loadLightPreferences(storage);
    assert.equal(lights.tv.intensity, 0);
    assert.equal(lights.setup.intensity, 43);
  });
});

describe("world preferences never throw at the UI", () => {
  it("reports blocked, full or missing storage as an unsaved write", () => {
    for (const storage of [blocked, new FullStorage(), undefined]) {
      assert.equal(
        saveLightPreferences(storage, DEFAULT_LIGHT_PREFERENCES),
        false,
      );
      assert.equal(
        saveMusicPreferences(storage, DEFAULT_MUSIC_PREFERENCES),
        false,
      );
    }
  });

  it("a full storage still reads what it already holds", () => {
    const storage = new FullStorage();
    storage.data.set(
      MUSIC_STORAGE_KEY,
      JSON.stringify({
        version: PREFERENCES_VERSION,
        volume: 0.7,
        range: 0.2,
        enabled: false,
      }),
    );
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0.7,
      range: 0.2,
      enabled: false,
    });
  });
});

describe("ambient sound preference", () => {
  it("defaults to enabled under world:ambient", () => {
    assert.equal(AMBIENT_STORAGE_KEY, "world:ambient");
    assert.deepEqual(DEFAULT_AMBIENT_PREFERENCES, { enabled: true });
  });

  it("missing, blocked or absent storage loads a fresh default", () => {
    for (const storage of [new FakeStorage(), blocked, undefined]) {
      const loaded = loadAmbientPreferences(storage);
      assert.deepEqual(loaded, DEFAULT_AMBIENT_PREFERENCES);
      assert.notEqual(loaded, DEFAULT_AMBIENT_PREFERENCES);
    }
  });

  it("a stored false survives a reload and keeps the other records", () => {
    const storage = new FakeStorage();
    saveMusicPreferences(storage, { volume: 0.3, range: 0.4, enabled: false });
    assert.equal(saveAmbientPreferences(storage, { enabled: false }), true);
    assert.deepEqual(loadAmbientPreferences(storage), { enabled: false });
    assert.deepEqual(loadMusicPreferences(storage), {
      volume: 0.3,
      range: 0.4,
      enabled: false,
    });
    assert.deepEqual(JSON.parse(storage.getItem(AMBIENT_STORAGE_KEY) ?? ""), {
      version: PREFERENCES_VERSION,
      enabled: false,
    });
  });

  it("writes only the known field", () => {
    const storage = new FakeStorage();
    saveAmbientPreferences(storage, { enabled: true, extra: 1 } as never);
    assert.deepEqual(JSON.parse(storage.getItem(AMBIENT_STORAGE_KEY) ?? ""), {
      version: PREFERENCES_VERSION,
      enabled: true,
    });
  });

  it("falls back to the default for bad values", () => {
    for (const value of [
      "not json{",
      "null",
      "[]",
      JSON.stringify({ version: PREFERENCES_VERSION, enabled: "no" }),
      JSON.stringify({ version: PREFERENCES_VERSION, enabled: 0 }),
      JSON.stringify({ version: PREFERENCES_VERSION + 1, enabled: false }),
      JSON.stringify({ enabled: false }),
    ]) {
      const storage = new FakeStorage();
      storage.setItem(AMBIENT_STORAGE_KEY, value);
      assert.deepEqual(
        loadAmbientPreferences(storage),
        DEFAULT_AMBIENT_PREFERENCES,
        value,
      );
    }
  });

  it("reports blocked, full or missing storage as an unsaved write", () => {
    for (const storage of [blocked, new FullStorage(), undefined])
      assert.equal(saveAmbientPreferences(storage, { enabled: false }), false);
  });
});
