// The TV close-up (tv-home-screen T2, T3): the camera's straight-on framing
// of the living-room panel, and the remote's arrow-key focus over the home
// screen's rows. Pure numbers for WorldScene.tsx and tv-screen.ts.

import { GUIDE, type Vec3 } from "./camera.ts";
import { TV_PANEL } from "./living.ts";

export const TV_FOCUS = {
  /** Share of the view's width and height the panel may take. */
  fill: 0.85,
  /** Metres from the panel's centre: close enough to read, never past the sofa. */
  minDistance: 0.7,
  maxDistance: 1.5,
} as const;

const TAN_V = Math.tan((GUIDE.fov / 2) * (Math.PI / 180));

/**
 * Eye level with the panel's centre, out along its facing (+z), at the
 * distance that fits the whole panel; phones stop at `maxDistance`, in front
 * of the sofa, and see the middle of the screen.
 */
export function tvCameraFocus(aspect: number): {
  position: Vec3;
  target: Vec3;
  fov: number;
} {
  if (!Number.isFinite(aspect) || aspect <= 0)
    throw new RangeError("Aspect ratio must be a positive finite number");
  const { fill, minDistance, maxDistance } = TV_FOCUS;
  const fit = Math.max(
    TV_PANEL.width / 2 / (TAN_V * aspect * fill),
    TV_PANEL.height / 2 / (TAN_V * fill),
  );
  const d = Math.min(Math.max(fit, minDistance), maxDistance);
  const [x, y, z] = TV_PANEL.center;
  return { position: [x, y, z + d], target: TV_PANEL.center, fov: GUIDE.fov };
}

export interface RemotePosition {
  row: number;
  col: number;
}

/**
 * One arrow press on the remote: left and right within a row, stopping at
 * its ends; up and down to the nearest non-empty row, keeping the column
 * where that row is long enough. Null for any other key.
 */
export function moveRemote(
  { row, col }: RemotePosition,
  key: string,
  lengths: readonly number[],
): RemotePosition | null {
  if (key === "ArrowLeft") return { row, col: Math.max(col - 1, 0) };
  if (key === "ArrowRight")
    return { row, col: Math.min(col + 1, Math.max(lengths[row] - 1, 0)) };
  const step = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
  if (!step) return null;
  for (let next = row + step; next >= 0 && next < lengths.length; next += step)
    if (lengths[next] > 0)
      return { row: next, col: Math.min(col, lengths[next] - 1) };
  return { row, col };
}
