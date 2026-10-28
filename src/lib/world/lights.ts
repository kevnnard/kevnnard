// Night lights (T6b, S17): a TV backlight, a setup backlight behind the main
// monitor and two lamps. They may only shine on the simulated night, 18:00
// through 05:59; each has its own switch, color and intensity, edited in the
// scene settings panel. Since T12 (S24) the lamps are gamer lamps on the wall
// shelf aimed down at the desk, and the setup channel also drives the white
// monitor light bar and the keyboard's side lights. Pure numbers;
// NightLights.tsx turns them into five non-shadow spots (two wall-aimed
// backlights, S18; two lamps and the light bar aimed down), the lamp models
// and the emissive strips, slit and bulbs.

import type { Vec3 } from "./house.ts";
import { TV_PANEL } from "./living.ts";
import {
  DESK_TOP,
  KEYBOARD,
  LIGHTBAR,
  MAIN_MONITOR,
  MAIN_ROOM,
  MOUSE,
  SETUP_COLORS,
  type SetupPart,
  SHELF,
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
    where: "Behind the monitor, light bar and keyboard",
    zone: "desk",
  },
  lampLeft: { name: "Left shelf lamp", where: "Shelf, left end", zone: "desk" },
  lampRight: {
    name: "Right shelf lamp",
    where: "Shelf, right end",
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

/**
 * 0-1 output of a light at `hours`: zero by day, when disabled or when the
 * master `power` is off.
 */
export function lightLevel(
  setting: LightSetting,
  hours: number,
  power = true,
): number {
  if (!power || !setting.enabled || !nightLightsOn(hours)) return 0;
  return setting.intensity / 100;
}

/** Every light's 0-1 output; the settings themselves are never touched. */
export function lightOutputs(
  settings: LightSettings,
  hours: number,
  power = true,
): Record<LightId, number> {
  return Object.fromEntries(
    LIGHT_IDS.map((id) => [id, lightLevel(settings[id], hours, power)]),
  ) as Record<LightId, number>;
}

/**
 * The scene panel's master switch (Power off / Power on): it flips only at
 * night; by day the action is a no-op and the master keeps its state.
 */
export function togglePower(power: boolean, hours: number): boolean {
  return nightLightsOn(hours) ? !power : power;
}

/**
 * Scale for the screens, LEDs and glowing gadgets: 0 at night with the master
 * off, 1 otherwise, so the daytime scene never changes.
 */
export function glowPower(power: boolean, hours: number): number {
  return power || !nightLightsOn(hours) ? 1 : 0;
}

interface FixtureBase {
  /** Light position. */
  position: Vec3;
  /** Candela at 100 %: restrained, so the room never washes out. */
  intensity: number;
  /** Metres to zero, so no light reaches the island or the next room. */
  distance: number;
  decay: 2;
  castShadow: false;
  /** Where the fixture stands or hangs. */
  base: Vec3;
}

/** A bare bulb. */
export interface PointFixture extends FixtureBase {
  kind: "point";
}

/**
 * A finite spot. The backlights are LED strips approximated by one spot
 * aimed square at the wall from behind the middle of their panel (S18): the
 * hotspot hides behind the panel, the wide soft cone washes the wall around
 * it, and nothing in front of the panel is lit. Area lights would need
 * three's RectAreaLightUniformsLib, an examples import with large LTC
 * tables, so they are not used. The shelf lamps and the light bar aim
 * down at the desk (T12).
 */
export interface SpotFixture extends FixtureBase {
  kind: "spot";
  /** Point the spot faces. */
  target: Vec3;
  /** Cone half-angle, radians. */
  angle: number;
  penumbra: number;
}

export type LightFixture = PointFixture | SpotFixture;

/**
 * Articulated gamer lamp on the shelf (T12), base at the origin, `dx` metres
 * into the room: a weighted puck, a lower and an upper arm, and a head whose
 * shade opens straight down over the desk.
 */
export const LAMP = {
  /** Base puck, metres from the wall. */
  d: 0.22,
  /** The head reaches past the shelf's front edge. */
  head: { dx: 0.24 },
  elbow: { dx: 0.03, y: 0.2 },
  /** Lathe shade on the head, heights above the base; radii at its rim and crown. */
  shade: { y0: 0.07, y1: 0.125, bottom: 0.042, top: 0.018 },
  bulb: { y: 0.095, radius: 0.014 },
  colors: {
    foot: SETUP_COLORS.frame,
    cap: "#d26a3a",
    stem: SETUP_COLORS.frame,
    joint: "#8d9097",
    socket: SETUP_COLORS.bezel,
    shade: "#2b2a30",
    bulbOff: "#d9d4ce",
  },
} as const;

const lampBase = (z: number): Vec3 => [MAIN_ROOM.x0 + LAMP.d, SHELF.top, z];
const LAMP_BASES = {
  lampLeft: lampBase(SHELF.lamps.left),
  lampRight: lampBase(SHELF.lamps.right),
} as const;
const bulbAt = ([x, y, z]: Vec3): Vec3 => [
  x + LAMP.head.dx,
  y + LAMP.bulb.y,
  z,
];

const lift = ([x, y, z]: Vec3, dy: number): Vec3 => [x, y + dy, z];

const tvTop = TV_PANEL.center[1] + TV_PANEL.height / 2;
const monitorTop = MAIN_MONITOR.center[1] + MAIN_MONITOR.size[1] / 2;
/** Backlight cone: 72° half-angle, soft edge, so the wash runs past the panel. */
const WASH = { angle: 1.25, penumbra: 0.7 } as const;
/** Lamp cone: a soft pool on the desk under each lamp. */
const POOL = { angle: 0.6, penumbra: 0.6 } as const;

const tvSpot: Vec3 = [
  TV_PANEL.center[0],
  TV_PANEL.center[1],
  TV_PANEL.panelBack - 0.01,
];
const setupSpot: Vec3 = [
  MAIN_MONITOR.back - 0.01,
  MAIN_MONITOR.center[1],
  MAIN_MONITOR.center[2],
];

const lampSpot = (id: "lampLeft" | "lampRight"): SpotFixture => {
  const base = LAMP_BASES[id];
  const position = bulbAt(base);
  return {
    kind: "spot",
    position,
    target: [DESK_TOP.x0 + 0.47, DESK_TOP.y, position[2] - 0.04],
    ...POOL,
    intensity: 0.3,
    distance: 1.5,
    decay: 2,
    castShadow: false,
    base,
  };
};

export const LIGHT_FIXTURES: Record<LightId, LightFixture> = {
  // Behind the middle of the panel, aimed at the wall: a halo around the TV.
  tv: {
    kind: "spot",
    position: tvSpot,
    target: [tvSpot[0], tvSpot[1], MAIN_ROOM.z0],
    ...WASH,
    intensity: 0.6,
    distance: 1.6,
    decay: 2,
    castShadow: false,
    base: [TV_PANEL.center[0], tvTop, MAIN_ROOM.z0],
  },
  // Just behind the monitor's middle, aimed at the left wall.
  setup: {
    kind: "spot",
    position: setupSpot,
    target: [MAIN_ROOM.x0, setupSpot[1], setupSpot[2]],
    ...WASH,
    intensity: 0.25,
    distance: 1.4,
    decay: 2,
    castShadow: false,
    base: [MAIN_ROOM.x0, monitorTop, MAIN_MONITOR.center[2]],
  },
  lampLeft: lampSpot("lampLeft"),
  lampRight: lampSpot("lampRight"),
};

const lightbarSpot: Vec3 = lift(LIGHTBAR.slit.center, -0.006);

/**
 * The monitor light bar's downlight (T12): neutral white whatever the setup
 * colour, from just under its slit onto the mat between the keyboard and the
 * mouse, with a cone narrow enough that its upper edge still points down.
 * It follows the setup channel's switch, intensity, night gate and master.
 */
export const LIGHTBAR_FIXTURE: SpotFixture & {
  channel: "setup";
  color: string;
} = {
  kind: "spot",
  channel: "setup",
  color: "#ffffff",
  position: lightbarSpot,
  target: [
    (KEYBOARD.center[0] + MOUSE.center[0]) / 2,
    KEYBOARD.center[1] - KEYBOARD.size[1] / 2,
    (KEYBOARD.center[2] + MOUSE.center[2]) / 2 + 0.06,
  ],
  angle: 0.55,
  penumbra: 0.6,
  intensity: 0.35,
  distance: 1.2,
  decay: 2,
  castShadow: false,
  base: LIGHTBAR.center,
};

/** Every physical light inside the house: the four channels and the light bar. */
export const INTERIOR_FIXTURES: readonly LightFixture[] = [
  ...LIGHT_IDS.map((id) => LIGHT_FIXTURES[id]),
  LIGHTBAR_FIXTURE,
];

/** Keyboard side lights (T12): the setup colour, kept subtle. */
const SIDE_LIGHT = { min: 0.2, span: 0.3 } as const;

/**
 * The keyboard's side light bars: the setup channel's colour at a subtle
 * strength, zero by day, when the setup light is off or with the master off.
 */
export function sideLight(
  settings: LightSettings,
  hours: number,
  power = true,
): { level: number; color: string; strength: number } {
  const level = lightLevel(settings.setup, hours, power);
  return {
    level,
    color: settings.setup.color,
    strength: level > 0 ? SIDE_LIGHT.min + SIDE_LIGHT.span * level : 0,
  };
}

const round = (
  material: SetupPart["material"],
  base: Vec3,
  y: number,
  diameter: number,
  height: number,
  color: string,
  shade = 1,
  dx = 0,
): SetupPart => ({
  material,
  shape: "round",
  center: [base[0] + dx, base[1] + y, base[2]],
  size: [diameter, height, diameter],
  color,
  shade,
});

/** A rounded bar between two points in the lamp's x-y plane. */
function arm(
  base: Vec3,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
  thick: number,
  color: string,
): SetupPart {
  const [dx, dy] = [bx - ax, by - ay];
  const length = Math.hypot(dx, dy);
  return {
    material: "powder",
    shape: "rounded",
    radius: thick / 2 - 0.0005,
    center: [base[0] + (ax + bx) / 2, base[1] + (ay + by) / 2, base[2]],
    size: [length, thick, thick],
    rotation: [0, 0, Math.atan2(dy, dx)],
    color,
    shade: 1,
  };
}

/**
 * Solid parts of one shelf lamp, in the setup's materials: a weighted puck
 * with a copper ring, a shoulder joint, two arms meeting at an elbow and a
 * socket on the head. The shade and bulb are lathe and sphere meshes.
 */
export function lampParts(id: "lampLeft" | "lampRight"): SetupPart[] {
  const base = LAMP_BASES[id];
  const C = LAMP.colors;
  const { elbow, head, shade } = LAMP;
  const shoulder = [0, 0.03] as const;
  const socket = [head.dx, shade.y1 + 0.01] as const;
  const joint = (x: number, y: number): SetupPart => ({
    material: "powder",
    shape: "round",
    center: [base[0] + x, base[1] + y, base[2]],
    size: [0.022, 0.026, 0.022],
    color: C.joint,
    shade: 1,
    rotation: [Math.PI / 2, 0, 0],
  });
  return [
    round("powder", base, 0.007, 0.085, 0.014, C.foot),
    round("satin", base, 0.016, 0.07, 0.004, C.cap),
    round("powder", base, 0.024, 0.02, 0.012, C.stem),
    joint(...shoulder),
    arm(base, shoulder, [elbow.dx, elbow.y], 0.012, C.stem),
    joint(elbow.dx, elbow.y),
    arm(base, [elbow.dx, elbow.y], [head.dx, socket[1] + 0.01], 0.01, C.stem),
    round("satin", base, socket[1], 0.03, 0.02, C.socket, 1, head.dx),
  ];
}
