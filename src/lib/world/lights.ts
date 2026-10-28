// Night lights (T6b, S17): a TV backlight, a setup backlight behind the main
// monitor and two desk lamps on the desk ends. They may only shine on the
// simulated night, 18:00 through 05:59; each has its own switch, color and
// intensity, edited in the scene settings panel. Pure numbers; NightLights.tsx
// turns them into four non-shadow point lights, the lamp models and the
// emissive strips and bulbs.

import type { Vec3 } from "./house.ts";
import { TV_PANEL } from "./living.ts";
import {
  DESK_TOP,
  MAIN_MONITOR,
  MAIN_ROOM,
  SETUP_COLORS,
  type SetupPart,
} from "./setup.ts";

export const LIGHT_IDS = ["tv", "setup", "lampLeft", "lampRight"] as const;
export type LightId = (typeof LIGHT_IDS)[number];

export interface LightSetting {
  enabled: boolean;
  /** Lowercase `#rrggbb`. */
  color: string;
  /** Percent, 0-100. */
  intensity: number;
}

export type LightSettings = Readonly<Record<LightId, LightSetting>>;

/** Panel labels and the card (zone) each light belongs to. */
export const LIGHT_INFO: Record<
  LightId,
  { name: string; where: string; zone: "tv" | "desk" }
> = {
  tv: { name: "TV backlight", where: "Behind the TV", zone: "tv" },
  setup: {
    name: "Setup backlight",
    where: "Behind the monitor",
    zone: "desk",
  },
  lampLeft: { name: "Left desk lamp", where: "Desk, left end", zone: "desk" },
  lampRight: {
    name: "Right desk lamp",
    where: "Desk, right end",
    zone: "desk",
  },
};

/** The chosen design's swatches (design/world-lighting/03-grouped-cards.html). */
export const DEFAULT_LIGHTS: LightSettings = {
  tv: { enabled: true, color: "#7c6cff", intensity: 70 },
  setup: { enabled: true, color: "#22d3ee", intensity: 60 },
  lampLeft: { enabled: true, color: "#ffb36b", intensity: 80 },
  lampRight: { enabled: true, color: "#ffb36b", intensity: 80 },
};

/** Night gate in simulated minutes: on at 18:00, off at 06:00. */
export const NIGHT_GATE = { on: 18 * 60, off: 6 * 60 } as const;

const DAY_MINUTES = 24 * 60;

/** The clock's minute, floored as the day controller shows it, in one day. */
export function clockMinute(hours: number): number {
  const minute = Math.floor(hours * 60);
  return ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** True from 18:00 through 05:59 of the simulated clock, never by day. */
export function nightLightsOn(hours: number): boolean {
  const minute = clockMinute(hours);
  return minute >= NIGHT_GATE.on || minute < NIGHT_GATE.off;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** `settings` with `patch` applied to one light: clamped, never mutated. */
export function updateLight(
  settings: LightSettings,
  id: LightId,
  patch: Partial<LightSetting>,
): LightSettings {
  const current = settings[id];
  const next: LightSetting = { ...current };
  if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
  if (typeof patch.color === "string" && HEX.test(patch.color))
    next.color = patch.color.toLowerCase();
  if (typeof patch.intensity === "number" && Number.isFinite(patch.intensity))
    next.intensity = Math.round(Math.min(Math.max(patch.intensity, 0), 100));
  return { ...settings, [id]: next };
}

/** 0-1 output of a light at `hours`: zero by day or when disabled. */
export function lightLevel(setting: LightSetting, hours: number): number {
  if (!setting.enabled || !nightLightsOn(hours)) return 0;
  return setting.intensity / 100;
}

export interface LightFixture {
  /** Point light position. */
  position: Vec3;
  /** Candela at 100 %: restrained, so the room never washes out. */
  intensity: number;
  /** Metres to zero, so no light reaches the island or the next room. */
  distance: number;
  decay: 2;
  castShadow: false;
  /** Where the lamp's base stands on the desk (lamps only). */
  base: Vec3;
}

/** Desk lamp, base at the origin: a bell shade over a round bulb. */
export const LAMP = {
  /** Lathe bell, heights above the base; radii at its rim and crown. */
  shade: { y0: 0.22, y1: 0.335, bottom: 0.065, top: 0.035 },
  bulb: { y: 0.275, radius: 0.022 },
  colors: {
    foot: SETUP_COLORS.frame,
    cap: SETUP_COLORS.trim,
    stem: "#c9a46a",
    socket: SETUP_COLORS.bezel,
    shade: "#f6efe4",
    bulbOff: "#d9d4ce",
  },
} as const;

// Seated at the desk you face the left wall (-x): your left is +z.
const LAMP_D = 0.56;
const LAMP_INSET = 0.07;
const lampBase = (z: number): Vec3 => [DESK_TOP.x0 + LAMP_D, DESK_TOP.y, z];
const LAMP_BASES = {
  lampLeft: lampBase(DESK_TOP.z1 - LAMP_INSET),
  lampRight: lampBase(DESK_TOP.z0 + LAMP_INSET),
} as const;

const lift = ([x, y, z]: Vec3, dy: number): Vec3 => [x, y + dy, z];

const tvTop = TV_PANEL.center[1] + TV_PANEL.height / 2;
const monitorBack = MAIN_MONITOR.center[0] - MAIN_MONITOR.size[0] / 2;
const monitorTop = MAIN_MONITOR.center[1] + MAIN_MONITOR.size[1] / 2;

export const LIGHT_FIXTURES: Record<LightId, LightFixture> = {
  // Behind the panel, near its top: the wall glows above and around the TV.
  tv: {
    position: [TV_PANEL.center[0], tvTop - 0.08, TV_PANEL.panelBack - 0.02],
    intensity: 0.6,
    distance: 1.6,
    decay: 2,
    castShadow: false,
    base: [TV_PANEL.center[0], tvTop, MAIN_ROOM.z0],
  },
  // Between the monitor's back and the wall, near its top edge.
  setup: {
    position: [
      (MAIN_ROOM.x0 + monitorBack) / 2,
      monitorTop - 0.06,
      MAIN_MONITOR.center[2],
    ],
    intensity: 0.25,
    distance: 1.4,
    decay: 2,
    castShadow: false,
    base: [MAIN_ROOM.x0, monitorTop, MAIN_MONITOR.center[2]],
  },
  lampLeft: {
    position: lift(LAMP_BASES.lampLeft, LAMP.bulb.y),
    intensity: 0.22,
    distance: 1.2,
    decay: 2,
    castShadow: false,
    base: LAMP_BASES.lampLeft,
  },
  lampRight: {
    position: lift(LAMP_BASES.lampRight, LAMP.bulb.y),
    intensity: 0.22,
    distance: 1.2,
    decay: 2,
    castShadow: false,
    base: LAMP_BASES.lampRight,
  },
};

const round = (
  material: SetupPart["material"],
  base: Vec3,
  y: number,
  diameter: number,
  height: number,
  color: string,
  shade = 1,
): SetupPart => ({
  material,
  shape: "round",
  center: lift(base, y),
  size: [diameter, height, diameter],
  color,
  shade,
});

/**
 * Solid parts of one desk lamp, in the setup's materials: a weighted foot
 * with a cream cap, brass stem with collar and joint, and the socket under
 * the shade's crown. The shade and bulb are lathe and sphere meshes.
 */
export function lampParts(id: "lampLeft" | "lampRight"): SetupPart[] {
  const base = LAMP_BASES[id];
  const C = LAMP.colors;
  const { y0, y1 } = LAMP.shade;
  const stemTop = y1 - 0.035;
  return [
    round("powder", base, 0.007, 0.11, 0.014, C.foot),
    round("satin", base, 0.019, 0.085, 0.01, C.cap),
    round("powder", base, 0.033, 0.026, 0.018, C.stem, 0.9),
    round(
      "powder",
      base,
      (0.024 + stemTop) / 2,
      0.012,
      stemTop - 0.024,
      C.stem,
    ),
    round("powder", base, (0.024 + y0) / 2 + 0.02, 0.02, 0.014, C.stem, 0.9),
    round("satin", base, stemTop + 0.0175, 0.032, 0.035, C.socket),
    round("powder", base, y1 + 0.006, 0.016, 0.012, C.stem),
  ];
}
