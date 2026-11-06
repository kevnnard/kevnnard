// The garage grown for the owner's dream truck (dream-truck T1): its inside,
// its open door, and the ground it and its apron take from the yard, kept
// clear of nature. The garage itself is HOUSE.garage (house.ts); the truck
// parked in it is truck.ts. Pure numbers.

import {
  HOUSE,
  HOUSE_FOOTPRINT,
  type Opening,
  type Rect,
  WALLS,
} from "./house.ts";
import { KIND_SPECS, type NatureKind } from "./layout.ts";

const G = HOUSE.garage;
const W = HOUSE.wall;

/** Inside faces of the garage's walls, in world x and z. */
export const GARAGE_INTERIOR: Rect = {
  x0: G.x0 + W,
  x1: G.x1 - W,
  z0: G.z0 + W,
  z1: G.z1 - W,
};

/** The open door in the garage's front wall: world x along it, height above the floor. */
export const GARAGE_DOOR: Opening = (() => {
  const door = WALLS.find((wall) => wall.id === "garage-front")?.openings.find(
    (opening) => opening.kind === "garage",
  );
  if (!door) throw new Error("the garage has no door");
  return door;
})();

/** The garage under its roof and the apron before its door: no nature grows there. */
export const GARAGE_GROUNDS: readonly (Rect & { id: string })[] =
  HOUSE_FOOTPRINT.filter(
    (rect) => rect.id === "garage" || rect.id === "driveway",
  );

/** Free grass kept round the garage grounds, as round the rest of the house. */
const CLEARANCE = 0.2;

/**
 * `items` without those standing on or near the garage grounds: the grown
 * garage reaches past the pad, where the seeded layout put a few tufts,
 * flowers and a bush. Nature items reach out by their kind's footprint
 * (the share the garden uses); others by `radius`. The layout itself is
 * untouched, so nothing else moves.
 */
export function clearOfGarage<
  T extends {
    position: readonly [number, number, number];
    kind?: NatureKind;
    scale?: number;
  },
>(items: T[], radius = 0): T[] {
  return items.filter((item) => {
    const [x, , z] = item.position;
    const reach =
      (item.kind
        ? KIND_SPECS[item.kind].radius * (item.scale ?? 1) * 0.6
        : radius) + CLEARANCE;
    return GARAGE_GROUNDS.every(
      (rect) =>
        x < rect.x0 - reach ||
        x > rect.x1 + reach ||
        z < rect.z0 - reach ||
        z > rect.z1 + reach,
    );
  });
}
