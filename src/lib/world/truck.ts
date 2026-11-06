// The garage, kept closed with a "Coming soon" sign on its roller door
// (dream-truck T4, S5): the dream truck is gone, the grown garage stays.
// The door's outer face, the small painted sign on it, its soft glow at
// night under the garage lantern, the click box over the door and the
// card's copy. Pure numbers; House.tsx paints the sign, Truck.tsx takes
// the click, TruckCard shows the card.

import type { Vec3 } from "./camera.ts";
import { GARAGE_DOOR } from "./garage.ts";
import { HOUSE, WALLS } from "./house.ts";
import { nightLightsOn } from "./lights.ts";

const FRONT = (() => {
  const wall = WALLS.find((w) => w.id === "garage-front");
  if (!wall) throw new Error("the garage has no front wall");
  return wall;
})();

/** The closed roller door's outer face (house.ts garageDoorCurtain). */
export const GARAGE_DOOR_FACE = {
  center: [
    (GARAGE_DOOR.u0 + GARAGE_DOOR.u1) / 2,
    HOUSE.floorY + GARAGE_DOOR.v1 / 2,
    FRONT.at + 0.015,
  ] as Vec3,
  width: GARAGE_DOOR.u1 - GARAGE_DOOR.u0,
  height: GARAGE_DOOR.v1,
} as const;

/**
 * A small dark plate painted on the door at eye height, in the site's
 * tokens (design/system.md): background, foreground and the emerald accent
 * as a hairline. `canvas` is the texture size, the plate's proportions.
 */
export const COMING_SOON_SIGN = {
  text: "COMING SOON",
  center: [
    GARAGE_DOOR_FACE.center[0],
    HOUSE.floorY + 1.2,
    GARAGE_DOOR_FACE.center[2] + 0.006,
  ] as Vec3,
  size: [0.9, 0.24] as const,
  canvas: [900, 240] as const,
  plate: "#09090b",
  ink: "#fafafa",
  accent: "#10b981",
  /** Emissive strength of the lettering at night. */
  glow: 0.45,
} as const;

/** The sign's glow: soft at night with the lantern, off by day or power off. */
export function comingSoonGlow(hours: number, power: boolean): number {
  return power && nightLightsOn(hours) ? COMING_SOON_SIGN.glow : 0;
}

/** A thin transparent box over the closed door takes the click. */
export const GARAGE_DOOR_HITBOX: { center: Vec3; size: Vec3 } = {
  center: [
    GARAGE_DOOR_FACE.center[0],
    GARAGE_DOOR_FACE.center[1],
    GARAGE_DOOR_FACE.center[2] + 0.04,
  ],
  size: [GARAGE_DOOR_FACE.width, GARAGE_DOOR_FACE.height, 0.1],
};

/** The door only takes clicks from in front of the garage. */
export function garageDoorInSight([, , z]: Vec3): boolean {
  return z > HOUSE.garage.z1;
}

export interface GarageStory {
  kicker: string;
  title: string;
  line: string;
}

export const GARAGE_STORY: GarageStory = {
  kicker: "GARAGE",
  title: "Coming soon",
  line: "Something special will park here soon.",
};
