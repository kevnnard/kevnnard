// The speakers' listening range (speaker-focus-console T3, S4): from the
// whole house to the initial view. Both ends are measured, never typed in:
// the house end is the farthest point of the house footprint (roof
// overhang, porch and driveway, the near exterior) from the pair, ground to
// ridge; the initial-view end is the guide's home pose for the first
// viewport. The fade is speaker.ts's own curve stretched so the reach sits
// where the legacy fade is at half level: everything inside the reach
// hears at least half, silence comes past 1.6 times the reach.

import { guidePose, poseToPosition, type Vec3 } from "./camera.ts";
import { HOUSE, HOUSE_FOOTPRINT } from "./house.ts";
import { SPEAKER_AUDIO, speakerDistance, speakerGain } from "./speaker.ts";

/** The legacy fade's half-level distance: speakerGain itself. */
export const LEGACY_REACH = (SPEAKER_AUDIO.near + SPEAKER_AUDIO.far) / 2;

const RIDGE = HOUSE.floorY + HOUSE.main.height + HOUSE.main.rise;

/** Farthest footprint corner from the pair, ground to ridge (a box's farthest point is a corner). */
export const HOUSE_REACH = Math.max(
  ...HOUSE_FOOTPRINT.flatMap((r) =>
    [r.x0, r.x1].flatMap((x) =>
      [r.z0, r.z1].flatMap((z) =>
        [0, HOUSE.floorY, RIDGE].map((y) => speakerDistance([x, y, z])),
      ),
    ),
  ),
);

/** The two ends of the range, in metres from the pair. */
export interface ListeningRange {
  house: number;
  initial: number;
}

/** Where the camera starts for this aspect: the guide's home pose, not the canvas default. */
export function initialListener(aspect: number): Vec3 {
  if (!Number.isFinite(aspect) || aspect <= 0)
    throw new RangeError("Aspect ratio must be a positive finite number");
  return poseToPosition(guidePose(aspect));
}

/** The range for the listener's initial position; never shorter than the house. */
export function listeningRange(initial: Vec3): ListeningRange {
  if (!initial.every(Number.isFinite))
    throw new RangeError("The initial listener must be finite");
  return {
    house: HOUSE_REACH,
    initial: Math.max(HOUSE_REACH, speakerDistance(initial)),
  };
}

/** The reach for a setting from 0 (house) to 1 (initial view), clamped. */
export function rangeReach(range: ListeningRange, setting: number): number {
  const t = Number.isFinite(setting) ? Math.min(Math.max(setting, 0), 1) : 0;
  return range.house + (range.initial - range.house) * t;
}

/** Music level at `distance` for a reach: half at the reach, silent past 1.6 times it. */
export function rangeGain(distance: number, reach: number): number {
  if (!Number.isFinite(reach) || reach <= 0) return 0;
  return speakerGain((distance * LEGACY_REACH) / reach);
}

/** The setting as text: the endpoints by name, metres as measured. */
export function rangeLabel(
  range: ListeningRange,
  setting: number,
): { name: "House" | "Initial view" | null; metres: string; text: string } {
  const reach = rangeReach(range, setting);
  const metres = `${reach.toFixed(1)} m`;
  const name =
    reach === range.house
      ? "House"
      : reach === range.initial
        ? "Initial view"
        : null;
  return { name, metres, text: name ? `${name}, ${metres}` : metres };
}
