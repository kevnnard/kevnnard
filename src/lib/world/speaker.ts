// The shelf speakers as the world's music source (world-speaker-music T2,
// S1-S5): their hit boxes from the merged setup parts, how loud they sound
// from the camera, the click rule (one click plays or pauses, two focus)
// and the speaker close-up with its temporary lens. Pure numbers derived
// read-only from setup.ts; the guide (camera.ts) never changes.

import { GUIDE, type Vec3 } from "./camera.ts";
import { CUTAWAY } from "./cutaway.ts";
import { HOUSE_FOCUS } from "./house.ts";
import { MAIN_ROOM, partBounds, SETUP, setupMeshes } from "./setup.ts";

export interface SpeakerBox {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
}

/** Union of each speaker's parts (base, cabinet, rings, cones, grille), along z. */
function speakerBoxes(): SpeakerBox[] {
  const boxes = new Map<number, { min: number[]; max: number[] }>();
  for (const part of setupMeshes().solid) {
    if (part.item !== "speaker") continue;
    const key = Math.round(part.center[2] * 100);
    const b = partBounds(part);
    const box = boxes.get(key) ?? {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    [b.x0, b.y0, b.z0].forEach((v, i) => {
      box.min[i] = Math.min(box.min[i], v);
    });
    [b.x1, b.y1, b.z1].forEach((v, i) => {
      box.max[i] = Math.max(box.max[i], v);
    });
    boxes.set(key, box);
  }
  return [...boxes.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, { min, max }]) => ({
      min: min as unknown as Vec3,
      max: max as unknown as Vec3,
      center: min.map((v, i) => (v + max[i]) / 2) as unknown as Vec3,
      size: min.map((v, i) => max[i] - v) as unknown as Vec3,
    }));
}

/** The two speakers, right (-z) then left as seen from the chair. */
export const SPEAKER_BOXES = speakerBoxes();
if (SPEAKER_BOXES.length !== 2) throw new Error("the setup needs two speakers");

const [RIGHT, LEFT] = SPEAKER_BOXES;
const lo = RIGHT.min.map((v, i) => Math.min(v, LEFT.min[i]));
const hi = RIGHT.max.map((v, i) => Math.max(v, LEFT.max[i]));

/** The pair: one music source at its middle, facing into the room. */
export const SPEAKER_PAIR = {
  center: lo.map((v, i) => (v + hi[i]) / 2) as unknown as Vec3,
  normal: SETUP.facing,
  /** World x of the grilles: the pair's front plane. */
  front: hi[0],
} as const;

/**
 * Clicks count from the room side of the speakers, close enough that the
 * cutaway has dissolved the walls in between (the terminal's rule).
 */
export function canReachSpeakers(camera: Vec3): boolean {
  if (!camera.every(Number.isFinite)) return false;
  const distance = Math.hypot(...camera.map((c, i) => c - HOUSE_FOCUS[i]));
  return camera[0] - SPEAKER_PAIR.front > 0.3 && distance <= CUTAWAY.wall.gone;
}

/**
 * Music level by distance: full within `near`, a smooth fade to silence at
 * `far`. The panner only pans (rolloff 0), so this is the one attenuation.
 * `smoothing` is the gain's time constant in seconds: no clicks.
 */
export const SPEAKER_AUDIO = { near: 1.5, far: 6, smoothing: 0.08 } as const;

/** Distance from `point` to the nearest point between the two cabinets. */
export function speakerDistance(point: Vec3): number {
  const a = RIGHT.center;
  const ab = LEFT.center.map((v, i) => v - a[i]);
  const ap = point.map((v, i) => v - a[i]);
  const t = Math.min(
    Math.max(
      (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) /
        (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2),
      0,
    ),
    1,
  );
  return Math.hypot(...ap.map((v, i) => v - t * ab[i]));
}

export function speakerGain(distance: number): number {
  if (!Number.isFinite(distance)) return 0;
  const { near, far } = SPEAKER_AUDIO;
  const t = Math.min(Math.max((far - distance) / (far - near), 0), 1);
  return t * t * (3 - 2 * t);
}

/** One click waits this long (ms) for a second one before it plays or pauses. */
export const CLICK_DELAY = 280;

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/**
 * One click plays or pauses after CLICK_DELAY; a second click (or the
 * browser's dblclick) inside it cancels that and focuses once. Clicks right
 * after a double are swallowed, so a double click never also toggles.
 */
export function clickArbiter(
  { single, double }: { single: () => void; double: () => void },
  timers: Timers,
  delay = CLICK_DELAY,
) {
  let mode: "idle" | "pending" | "quiet" = "idle";
  let timer: unknown = null;
  const wait = (next: "pending" | "quiet", then?: () => void) => {
    if (timer !== null) timers.clear(timer);
    mode = next;
    timer = timers.set(() => {
      timer = null;
      mode = "idle";
      then?.();
    }, delay);
  };
  const focus = () => {
    wait("quiet");
    double();
  };
  return {
    click() {
      if (mode === "idle") wait("pending", single);
      else if (mode === "pending") focus();
      else wait("quiet");
    },
    dblclick() {
      if (mode !== "quiet") focus();
    },
    cancel() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      mode = "idle";
    },
  };
}

/**
 * The speaker close-up: face-on at the pair's height, both cabinets inside
 * `fill` of the view. Desktop views fit at the guide's lens; on narrow
 * views the camera backs up to `maxDistance` (the music stays audible
 * there) and only then widens the lens, as little as needed and at most
 * `maxFov`, then backs up further, never past the room's far wall. The
 * house and the speakers never move: a phone sees them through a wider
 * lens. `margin` keeps the camera off the walls.
 */
export const SPEAKER_FOCUS = {
  fill: 0.9,
  minDistance: 1.6,
  maxDistance: 3.5,
  margin: 0.3,
  maxFov: 68,
} as const;

const CORNERS = SPEAKER_BOXES.flatMap(({ min, max }) =>
  [min[0], max[0]].flatMap((x) =>
    [min[1], max[1]].flatMap((y) =>
      [min[2], max[2]].map((z) => [x, y, z] as const),
    ),
  ),
);
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Vertical fov (deg) that fits every cabinet corner from `distance` off the grilles. */
function fovAt(distance: number, aspect: number) {
  const [, cy, cz] = SPEAKER_PAIR.center;
  const eye = SPEAKER_PAIR.front + distance;
  let tan = 0;
  for (const [x, y, z] of CORNERS) {
    const depth = (eye - x) * SPEAKER_FOCUS.fill;
    tan = Math.max(
      tan,
      Math.abs(y - cy) / depth,
      Math.abs(z - cz) / depth / aspect,
    );
  }
  return toDegrees(2 * Math.atan(tan));
}

/** Smallest distance in [from, to] whose fitting fov is at most `fov`, else `to`. */
function distanceFor(fov: number, aspect: number, from: number, to: number) {
  if (fovAt(from, aspect) <= fov) return from;
  if (fovAt(to, aspect) > fov) return to;
  let [a, b] = [from, to];
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2;
    if (fovAt(mid, aspect) <= fov) b = mid;
    else a = mid;
  }
  return b;
}

export function speakerFocus(aspect: number): {
  position: Vec3;
  target: Vec3;
  fov: number;
} {
  if (!Number.isFinite(aspect) || aspect <= 0)
    throw new RangeError("Aspect ratio must be a positive finite number");
  const { minDistance, maxDistance, margin, maxFov } = SPEAKER_FOCUS;
  const room = MAIN_ROOM.x1 - margin - SPEAKER_PAIR.front;
  let d = distanceFor(GUIDE.fov, aspect, minDistance, maxDistance);
  let fov: number = GUIDE.fov;
  if (fovAt(d, aspect) > GUIDE.fov) {
    fov = fovAt(d, aspect);
    if (fov > maxFov) {
      d = distanceFor(maxFov, aspect, maxDistance, room);
      fov = Math.min(fovAt(d, aspect), maxFov);
    }
  }
  const [x, y, z] = SPEAKER_PAIR.center;
  return {
    position: [SPEAKER_PAIR.front + d, y, z],
    target: [x, y, z],
    fov,
  };
}

interface Lens {
  fov: number;
  updateProjectionMatrix(): void;
}

/**
 * Holds the camera's lens across close-ups: the first focus saves the lens
 * the camera had; `focus(fov)` sets the speakers' lens, `focus(null)` the
 * saved one (the terminal and portrait math assume it); `release` restores
 * it exactly. Changes are synchronous, so no late transition overwrites it.
 */
export function lensKeeper(camera: Lens, invalidate: () => void) {
  let saved: number | null = null;
  const set = (fov: number) => {
    if (camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    invalidate();
  };
  return {
    focus(fov: number | null) {
      saved ??= camera.fov;
      set(fov ?? saved);
    },
    release() {
      if (saved === null) return;
      set(saved);
      saved = null;
    },
  };
}
