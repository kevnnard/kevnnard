// The visitor's /world choices that survive a reload (world-persistent-settings
// S1-S3): the night lights with their master switch, and the music's volume,
// listening range and play/pause intent, and the outdoor ambient sound's
// on/off. Separate versioned records, so saving one never rewrites another. Reads validate every known field on
// its own: a missing, malformed or out-of-range field falls back to its
// default, unknown fields are dropped, and blocked or full storage never
// throws. Track, position, errors and loading state are never stored.

import type { StyleStorage } from "@/lib/room/controller-style.ts";
import {
  DEFAULT_LIGHTS,
  LIGHT_IDS,
  type LightSetting,
  type LightSettings,
} from "./lights.ts";

export const LIGHTS_STORAGE_KEY = "world:lights";
export const MUSIC_STORAGE_KEY = "world:music";
export const AMBIENT_STORAGE_KEY = "world:ambient";
/** Bumped when a record's shape changes; other versions read as defaults. */
export const PREFERENCES_VERSION = 1;

/** The subset of `Storage` used here (the room's `browserStorage()` shape). */
export type PreferenceStorage = StyleStorage;

export interface LightPreferences {
  lights: LightSettings;
  /** The scene panel's master Power off / Power on. */
  power: boolean;
}

export interface MusicPreferences {
  /** 0-1, apart from the distance fade. */
  volume: number;
  /** 0 (whole house) to 1 (initial view), see speaker-range.ts. */
  range: number;
  /** The visitor's last explicit play (true) or pause (false). */
  enabled: boolean;
}

export interface AmbientPreferences {
  /** The outdoor ambient sounds (ambient-sound.ts) are on. */
  enabled: boolean;
}

export const DEFAULT_LIGHT_PREFERENCES: Readonly<LightPreferences> = {
  lights: DEFAULT_LIGHTS,
  power: true,
};

/** S2: half volume, the full range, music on. */
export const DEFAULT_MUSIC_PREFERENCES: Readonly<MusicPreferences> = {
  volume: 0.5,
  range: 1,
  enabled: true,
};

/** Ambient sounds on. */
export const DEFAULT_AMBIENT_PREFERENCES: Readonly<AmbientPreferences> = {
  enabled: true,
};

const HEX = /^#[0-9a-f]{6}$/i;

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const inRange = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const flag = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const unit = (value: unknown, fallback: number) =>
  inRange(value, 0, 1) ? (value as number) : fallback;

/** The stored record under `key` when it has the current version, else null. */
function readRecord(
  storage: PreferenceStorage | undefined,
  key: string,
): Fields | null {
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return null;
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && value.version === PREFERENCES_VERSION
      ? value
      : null;
  } catch {
    return null;
  }
}

/** Returns false when the record could not be stored (blocked or full storage). */
function writeRecord(
  storage: PreferenceStorage | undefined,
  key: string,
  fields: Fields,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      key,
      JSON.stringify({ version: PREFERENCES_VERSION, ...fields }),
    );
    return true;
  } catch {
    return false;
  }
}

function parseLight(value: unknown, fallback: LightSetting): LightSetting {
  const fields = isRecord(value) ? value : {};
  return {
    enabled: flag(fields.enabled, fallback.enabled),
    color:
      typeof fields.color === "string" && HEX.test(fields.color)
        ? fields.color.toLowerCase()
        : fallback.color,
    intensity: inRange(fields.intensity, 0, 100)
      ? Math.round(fields.intensity as number)
      : fallback.intensity,
  };
}

/** The stored lights and master, each field validated; fresh objects. */
export function loadLightPreferences(
  storage: PreferenceStorage | undefined,
): LightPreferences {
  const record = readRecord(storage, LIGHTS_STORAGE_KEY) ?? {};
  const stored = isRecord(record.lights) ? record.lights : {};
  const lights = Object.fromEntries(
    LIGHT_IDS.map((id) => [id, parseLight(stored[id], DEFAULT_LIGHTS[id])]),
  ) as Record<(typeof LIGHT_IDS)[number], LightSetting>;
  return {
    lights,
    power: flag(record.power, DEFAULT_LIGHT_PREFERENCES.power),
  };
}

export function saveLightPreferences(
  storage: PreferenceStorage | undefined,
  { lights, power }: LightPreferences,
): boolean {
  const known = Object.fromEntries(
    LIGHT_IDS.map((id) => {
      const { enabled, color, intensity } = lights[id];
      return [id, { enabled, color, intensity }];
    }),
  );
  return writeRecord(storage, LIGHTS_STORAGE_KEY, { lights: known, power });
}

/** The stored music settings, each field validated; a fresh object. */
export function loadMusicPreferences(
  storage: PreferenceStorage | undefined,
): MusicPreferences {
  const record = readRecord(storage, MUSIC_STORAGE_KEY) ?? {};
  const fallback = DEFAULT_MUSIC_PREFERENCES;
  return {
    volume: unit(record.volume, fallback.volume),
    range: unit(record.range, fallback.range),
    enabled: flag(record.enabled, fallback.enabled),
  };
}

export function saveMusicPreferences(
  storage: PreferenceStorage | undefined,
  { volume, range, enabled }: MusicPreferences,
): boolean {
  return writeRecord(storage, MUSIC_STORAGE_KEY, { volume, range, enabled });
}

/** The stored ambient switch, validated; a fresh object. */
export function loadAmbientPreferences(
  storage: PreferenceStorage | undefined,
): AmbientPreferences {
  const record = readRecord(storage, AMBIENT_STORAGE_KEY) ?? {};
  return {
    enabled: flag(record.enabled, DEFAULT_AMBIENT_PREFERENCES.enabled),
  };
}

export function saveAmbientPreferences(
  storage: PreferenceStorage | undefined,
  { enabled }: AmbientPreferences,
): boolean {
  return writeRecord(storage, AMBIENT_STORAGE_KEY, { enabled });
}
