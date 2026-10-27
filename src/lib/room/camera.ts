// Pure camera framing for the room. Works on plain tuples so it can be unit
// tested without WebGL; the scene feeds it bounds measured from the loaded glTFs.

export type Vec3 = readonly [number, number, number];

export interface Bounds {
  min: readonly number[];
  max: readonly number[];
}

export interface CameraView {
  position: Vec3;
  target: Vec3;
}

export interface Screen {
  /** World-space center, taken from the original Blender scene. */
  position: Vec3;
  /** Euler rotation (radians); only Y is used to derive the facing normal. */
  rotation: Vec3;
  /** Approximate visible size in world units (width, height). */
  size: readonly [number, number];
}

// Sizes are estimates from the desk/TV meshes; verify visually in a browser.
export const SCREENS = {
  pc: {
    position: [3.096, 1.483, 0.552],
    rotation: [0, -1.53, 0],
    size: [0.56, 0.32],
  },
  tv: {
    position: [-1.365, 1.061, -2.683],
    rotation: [0, 0, 0],
    size: [1.1, 0.62],
  },
} as const satisfies Record<string, Screen>;

// The room is a cut-away: walls sit on +x and -z, so we look in from -x/+z.
const OVERVIEW_DIRECTION: Vec3 = normalize([-1, 0.7, 1]);
const FIT_MARGIN = 1.2;

function normalize([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function fovs(fovDegrees: number, aspect: number) {
  const vertical = (fovDegrees * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  return { vertical, horizontal };
}

export function overviewView(
  bounds: Bounds,
  fovDegrees: number,
  aspect: number,
): CameraView {
  const target: Vec3 = [0, 1, 2].map(
    (i) => (bounds.min[i] + bounds.max[i]) / 2,
  ) as unknown as Vec3;
  const radius =
    Math.hypot(...[0, 1, 2].map((i) => bounds.max[i] - bounds.min[i])) / 2;
  const { vertical, horizontal } = fovs(fovDegrees, aspect);
  // The bounding sphere over-estimates a box seen from a corner, so crop slightly.
  const distance =
    (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 0.8;
  const position = target.map(
    (v, i) => v + OVERVIEW_DIRECTION[i] * distance,
  ) as unknown as Vec3;
  return { position, target };
}

export function focusView(
  screen: Screen,
  fovDegrees: number,
  aspect: number,
): CameraView {
  const { vertical, horizontal } = fovs(fovDegrees, aspect);
  const [width, height] = screen.size;
  const distance = Math.max(
    (width * FIT_MARGIN) / 2 / Math.tan(horizontal / 2),
    (height * FIT_MARGIN) / 2 / Math.tan(vertical / 2),
  );
  const yaw = screen.rotation[1];
  const normal: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const position = screen.position.map(
    (v, i) => v + normal[i] * distance,
  ) as unknown as Vec3;
  return { position, target: screen.position };
}
