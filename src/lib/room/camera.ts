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

/** Lowest the orbit camera may get above the ground, in world units. */
export const MIN_EYE_HEIGHT = 1;
const MIN_DISTANCE = 4;
const MIN_POLAR = 0.2;
const MAX_POLAR = 1.35;
const MIN_FAR = 100;
// Cameras stay on the open cutaway quadrant: from +z (azimuth 0) round to a
// little past -x. sin(azimuth) <= 0 keeps every camera at or west of its target.
const OVERVIEW_AZIMUTH = Math.atan2(
  OVERVIEW_DIRECTION[0],
  OVERVIEW_DIRECTION[2],
);
const AZIMUTH_RANGE = [OVERVIEW_AZIMUTH - Math.PI / 4 - 0.35, 0] as const;

const center = (bounds: Bounds) =>
  [0, 1, 2].map((i) => (bounds.min[i] + bounds.max[i]) / 2) as unknown as Vec3;
const corners = (bounds: Bounds) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((bits) =>
    [0, 1, 2].map((i) => ((bits >> i) & 1 ? bounds.max[i] : bounds.min[i])),
  );
const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Closest camera along `direction` that keeps every corner of `bounds` inside
 * the frustum, plus `margin`. Tighter than `overviewView` for wide, flat plots.
 */
export function fitView(
  bounds: Bounds,
  fovDegrees: number,
  aspect: number,
  direction: Vec3 = OVERVIEW_DIRECTION,
  margin = 1.05,
): CameraView {
  const target = center(bounds);
  const forward = direction.map((v) => -v);
  const flat = Math.hypot(forward[0], forward[2]);
  const right = [-forward[2] / flat, 0, forward[0] / flat];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const { vertical, horizontal } = fovs(fovDegrees, aspect);
  const tanH = Math.tan(horizontal / 2);
  const tanV = Math.tan(vertical / 2);
  let distance = 0;
  for (const corner of corners(bounds)) {
    const offset = corner.map((v, i) => v - target[i]);
    // Depth of the corner is distance + offset·forward; solve for distance.
    distance = Math.max(
      distance,
      (Math.abs(dot(offset, right)) * margin) / tanH - dot(offset, forward),
      (Math.abs(dot(offset, up)) * margin) / tanV - dot(offset, forward),
    );
  }
  const position = target.map(
    (v, i) => v + direction[i] * distance,
  ) as unknown as Vec3;
  return { position, target };
}

export interface OrbitLimits {
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  /** Box the orbit target is clamped to while panning. */
  boundary: Bounds;
  /** Camera far plane that still reaches the whole scene at maxDistance. */
  far: number;
}

/**
 * User orbit limits for a finite plot. They only clamp user input: scripted
 * `setLookAt` focus moves (PC/TV) are not limited by them.
 */
export function orbitLimits({
  overview,
  scene,
  boundary,
  groundY,
}: {
  overview: CameraView;
  scene: Bounds;
  boundary: Bounds;
  groundY: number;
}): OrbitLimits {
  const distance = Math.hypot(
    ...overview.position.map((v, i) => v - overview.target[i]),
  );
  // Lowest camera: lowest target at minDistance and maxPolar.
  const lowest = (groundY + MIN_EYE_HEIGHT - boundary.min[1]) / MIN_DISTANCE;
  const maxPolarAngle = Math.min(
    MAX_POLAR,
    Math.acos(Math.min(1, Math.max(-1, lowest))),
  );
  const maxDistance = distance * 1.2;
  let reach = 0;
  for (const a of corners(boundary))
    for (const b of corners(scene))
      reach = Math.max(reach, Math.hypot(...a.map((v, i) => v - b[i])));
  return {
    minDistance: MIN_DISTANCE,
    maxDistance,
    minPolarAngle: MIN_POLAR,
    maxPolarAngle,
    minAzimuthAngle: AZIMUTH_RANGE[0],
    maxAzimuthAngle: AZIMUTH_RANGE[1],
    boundary,
    far: Math.max(MIN_FAR, Math.ceil(maxDistance + reach + 1)),
  };
}
