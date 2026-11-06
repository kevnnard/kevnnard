// The garage's roller door (dream-truck T2), down for good now that nothing
// is parked inside (T4, S5): the detailing-bay LEDs and the close-up's
// showroom lights are gone with the truck. Its "Coming soon" sign is
// truck.ts. Pure numbers; House rolls the door.

/** The roller door's motion: seconds from open to closed. */
export const GARAGE_DOOR_MOTION = { duration: 1.5 } as const;

/** The garage door is down (1) at every hour, its close-up included. */
export function garageDoorClosed(): number {
  return 1;
}

/**
 * `current` moved toward `target` by `dt` seconds at a steady rate that
 * covers 0 to 1 in `duration`; reduced motion lands at once.
 */
export function easeToward(
  current: number,
  target: number,
  dt: number,
  duration: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return target;
  const step = dt / duration;
  return current < target
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
}
