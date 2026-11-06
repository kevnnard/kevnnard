// The owner's dream truck, a Ford F-150 Raptor, parked nose out in the
// grown garage (dream-truck T1): the model, the scale it is shown at, where
// it stands, its click box and its card. Pure numbers; Truck.tsx draws it.
// Ford and Raptor are trademarks of Ford Motor Company; no affiliation.

import type { Vec3 } from "./camera.ts";
import { CUTAWAY } from "./cutaway.ts";
import { GARAGE_DOOR, GARAGE_INTERIOR } from "./garage.ts";
import { HOUSE, HOUSE_FOCUS } from "./house.ts";

/**
 * Derived by scripts/prepare-truck.mjs at true scale: nose on +z, wheels on
 * y 0, centred on x; `size` is width (mirrors included), height and length
 * (tow hitch included) in metres, `rear` and `nose` the model's z ends.
 */
export const TRUCK_MODEL = {
  url: "/world/models/dream-truck.glb",
  size: [2.403, 1.975, 5.996] as const,
  /** Bumper to bumper, as the real truck. */
  body: 5.9,
  rear: -3.049,
  nose: 2.947,
} as const;

/**
 * True scale does not fit a house whose walls are 1.95 m: the garage grew
 * as far as the yard allows (house.ts), and the truck is shown at the
 * largest scale it takes, 0.82: 4.9 m long, 1.62 m tall and 1.97 m wide at
 * the mirrors, which clear the 2.08 m door by 5 cm a side; 0.25 m before
 * the door, 0.16 m under its head.
 */
const SCALE = 0.82;

export const TRUCK = {
  scale: SCALE,
  /** Wheels on the garage floor, centred on the door, 0.15 m off the back wall. */
  position: [
    (GARAGE_DOOR.u0 + GARAGE_DOOR.u1) / 2,
    HOUSE.floorY,
    GARAGE_INTERIOR.z0 + 0.15 - TRUCK_MODEL.rear * SCALE,
  ] as Vec3,
  /** The model's nose already looks down +z, out of the door. */
  rotationY: 0,
} as const;

/** The parked truck's world bounds. */
export function truckBox() {
  const [x, y, z] = TRUCK.position;
  const [width, height] = TRUCK_MODEL.size;
  const s = TRUCK.scale;
  return {
    x0: x - (width / 2) * s,
    x1: x + (width / 2) * s,
    y0: y,
    y1: y + height * s,
    z0: z + TRUCK_MODEL.rear * s,
    z1: z + TRUCK_MODEL.nose * s,
  };
}

/** A transparent box round the whole truck takes the click. */
export const TRUCK_HITBOX: { center: Vec3; size: Vec3 } = (() => {
  const box = truckBox();
  return {
    center: [
      (box.x0 + box.x1) / 2,
      (box.y0 + box.y1) / 2,
      (box.z0 + box.z1) / 2,
    ],
    size: [box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0],
  };
})();

/**
 * Whether the truck shows from `camera`: through the open door from the
 * front, or from anywhere once the zoom has lifted the roofs off. Clicks
 * through the closed walls are ignored.
 */
export function truckInSight([x, y, z]: Vec3): boolean {
  if (z > HOUSE.garage.z1) return true;
  const [fx, fy, fz] = HOUSE_FOCUS;
  return Math.hypot(x - fx, y - fy, z - fz) < CUTAWAY.roof.gone;
}

export interface TruckStory {
  kicker: string;
  title: string;
  stats: readonly { label: string; value: string }[];
  /** The owner's words. */
  story: readonly string[];
}

export const TRUCK_STORY: TruckStory = {
  kicker: "GARAGE · DREAM TRUCK",
  title: "Ford F-150 Raptor",
  // Source: Ford, all-new 2021 F-150 Raptor announcement and ford.com
  // specifications of the current (third) generation: a 3.5-litre
  // high-output EcoBoost twin-turbo V6 rated 450 hp and 510 lb-ft.
  stats: [
    { label: "Engine", value: "3.5 L twin-turbo V6" },
    { label: "Power", value: "450 hp" },
    { label: "Torque", value: "510 lb-ft" },
  ],
  story: [
    "This is my dream truck. One day it will be parked in my real garage; for now it lives here, in the world I built.",
  ],
};
