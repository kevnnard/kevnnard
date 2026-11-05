// Sofa floor lamps: a pair of tall floor lamps flanking the living-room sofa,
// one past each arm, set a little toward the sofa's back. Slim dark poles on
// weighted round bases carry white fabric drum shades that match the pale
// sofa. Night only, like the other night lights, and off by default so the
// TV stays the living room's main light at night; each one toggles on click
// with the same soft switch click as the shelf lamp. Pure numbers;
// SofaLamps.tsx renders them.

import type { Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
import { LIVING_MODELS, modelBounds } from "./living.ts";

const sofaModel = LIVING_MODELS.find((model) => model.kind === "sofa");
if (!sofaModel) throw new Error("the sofa lamps need the living-room sofa");
const SOFA = modelBounds(sofaModel);

/** Gap from each sofa arm to its lamp's pole. */
const ARM_GAP = 0.14;
/** Toward the sofa's back (+z): lamps sit beside the backrest, not the seat. */
const BACK_OFFSET = 0.12;
const LAMP_Z = sofaModel.center[2] + BACK_OFFSET;

export type SofaLampId = "left" | "right";

export interface SofaLampPlacement {
  id: SofaLampId;
  /** Centre of the base, on the floor. */
  base: Vec3;
  /** localStorage key of its on/off switch. */
  storageKey: string;
}

/** Both lamps, symmetric about the sofa's centre line. */
export const SOFA_LAMPS: readonly SofaLampPlacement[] = [
  {
    id: "left",
    base: [SOFA.x0 - ARM_GAP, SOFA.y0, LAMP_Z],
    storageKey: "world:sofa-lamp-left",
  },
  {
    id: "right",
    base: [SOFA.x1 + ARM_GAP, SOFA.y0, LAMP_Z],
    storageKey: "world:sofa-lamp-right",
  },
];

/** Shared shape, light and colors of the two lamps (local to the base). */
export const SOFA_LAMP = {
  base: { radius: 0.1, height: 0.022 },
  poleRadius: 0.009,
  /** Pole top, where the shade's harp sits. */
  poleHeight: 1.22,
  /** Drum shade: open top and bottom, wider at the mouth. */
  shade: { top: 0.1, bottom: 0.12, height: 0.24 },
  /** Shade centre above the floor; the pole runs up into it. */
  shadeY: 1.26,
  bulbRadius: 0.028,
  /** Bulb centre above the floor, inside the shade. */
  bulbY: 1.22,
  /** Warm white, softer than the shelf lamp's amber. */
  lightColor: "#ffe2b4",
  /** One soft glow per lamp over the sofa arm and the floor around it. */
  pointIntensity: 0.9,
  pointDistance: 2.4,
  lightDecay: 2,
  /** Fabric glow when lit: the shade reads lit without blowing out. */
  shadeEmissive: 0.35,
  bulbEmissive: 0.7,
  /** Output by day: none, the lamps only light at night. */
  dayLevel: 0,
  /** Off until clicked: the TV keeps priority at night. */
  defaultEnabled: false,
  /** Click target: a column around the pole and the shade. */
  hitbox: { radius: 0.14, height: 1.4 },
  colors: {
    base: "#1f1e23",
    pole: "#27272a",
    brass: "#b89058",
    shade: "#f5f1e8",
    shadeInner: "#fbf6ea",
    bulbOff: "#d4ceb8",
    bulbOn: "#fff3cc",
  },
} as const;

/** World position `y` metres above a lamp's base. */
export function sofaLampPoint(lamp: SofaLampPlacement, y: number): Vec3 {
  const [x, y0, z] = lamp.base;
  return [x, y0 + y, z];
}

/** Bulb centre: the lamp's light source, inside the shade. */
export function sofaLampBulbPosition(lamp: SofaLampPlacement): Vec3 {
  return sofaLampPoint(lamp, SOFA_LAMP.bulbY);
}

/**
 * 0-1 output of one lamp: full at night (the NightLights gate, 18:00-05:59),
 * off by day (`dayLevel`), and zero when switched off or `power` is off.
 */
export function sofaLampLevel(
  enabled: boolean,
  hours: number,
  power = true,
): number {
  if (!enabled || !power) return 0;
  return nightLightsOn(hours) ? 1 : SOFA_LAMP.dayLevel;
}

/** Stored switch state, falling back to the off default. */
export function sofaLampStoredEnabled(value: string | null): boolean {
  return value === null ? SOFA_LAMP.defaultEnabled : value === "true";
}
