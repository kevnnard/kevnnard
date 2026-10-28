// Guided camera for the floating island: a fixed three-quarter framing with a
// gentle, clamped orbit and zoom. Pure numbers so the limits are unit tested;
// WorldScene hands them to drei's CameraControls. No free walking (L2).

export type Vec3 = readonly [number, number, number];

/** Spherical pose around `GUIDE.target`, in camera-controls conventions. */
export interface GuidePose {
  /** Radians around +y, 0 looking from +z, positive toward +x. */
  azimuth: number;
  /** Radians from +y (0 = straight down). */
  polar: number;
  distance: number;
}

const HOME_AZIMUTH = Math.PI / 4;
const HOME_POLAR = 1.02;

export const GUIDE = {
  fov: 35,
  /** Slightly above the grass, so T4's house will sit in the middle. */
  target: [0, 0.8, 0] as Vec3,
  /** Island plus tree canopy, as a sphere that must stay in frame. */
  frameRadius: 7.5,
  limits: {
    minAzimuth: HOME_AZIMUTH - 0.6,
    maxAzimuth: HOME_AZIMUTH + 0.6,
    minPolar: 0.8,
    maxPolar: 1.3,
    minDistance: 22.5,
    maxDistance: 40,
  },
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

/** Clamps a pose into the guide limits. Throws a RangeError for non-finite input. */
export function clampPose(pose: GuidePose): GuidePose {
  if (![pose.azimuth, pose.polar, pose.distance].every(Number.isFinite))
    throw new RangeError("Camera pose must be finite");
  const { limits } = GUIDE;
  return {
    azimuth: clamp(pose.azimuth, limits.minAzimuth, limits.maxAzimuth),
    polar: clamp(pose.polar, limits.minPolar, limits.maxPolar),
    distance: clamp(pose.distance, limits.minDistance, limits.maxDistance),
  };
}

/** Home pose: the distance that fits the island sphere for this aspect ratio. */
export function guidePose(aspect: number): GuidePose {
  const halfV = ((GUIDE.fov / 2) * Math.PI) / 180;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const distance = GUIDE.frameRadius / Math.sin(Math.min(halfV, halfH));
  return clampPose({ azimuth: HOME_AZIMUTH, polar: HOME_POLAR, distance });
}

export function poseToPosition(pose: GuidePose): Vec3 {
  const [tx, ty, tz] = GUIDE.target;
  const ring = Math.sin(pose.polar) * pose.distance;
  return [
    tx + ring * Math.sin(pose.azimuth),
    ty + Math.cos(pose.polar) * pose.distance,
    tz + ring * Math.cos(pose.azimuth),
  ];
}

/** Smoothing and idle motion; reduced motion moves instantly and never drifts. */
export function guideMotion(reducedMotion: boolean) {
  return {
    smoothTime: reducedMotion ? 0 : 0.35,
    draggingSmoothTime: reducedMotion ? 0 : 0.15,
    azimuthRotateSpeed: 0.35,
    polarRotateSpeed: 0.3,
    dollySpeed: 0.3,
    drift: !reducedMotion,
  };
}
