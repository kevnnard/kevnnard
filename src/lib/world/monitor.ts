// The ultrawide as a terminal (T16, S29): its visible screen as one curved
// strip on the monitor's own arc, the temporary close-up the camera takes
// to read it, and which part of the screen that close-up shows. The terminal
// itself is drawn into the strip's texture (terminal-layout.ts). Pure numbers derived
// read-only from MAIN_MONITOR; the guide limits (camera.ts) never change.

import { GUIDE, type Vec3 } from "./camera.ts";
import { CUTAWAY } from "./cutaway.ts";
import { HOUSE_FOCUS } from "./house.ts";
import { MAIN_MONITOR, mainCurve, type SetupPart } from "./setup.ts";

const [DEPTH, PANEL_HEIGHT, PANEL_WIDTH] = MAIN_MONITOR.size;
const { radius: RADIUS, segments: SEGMENTS } = MAIN_MONITOR.curve;
/** Where the old screen's front was: 4 mm proud of the bezel face. */
const INSET = DEPTH / 2 + 0.004;
const HALF = Math.asin((PANEL_WIDTH / 2 - 0.02) / RADIUS);
const HEIGHT = PANEL_HEIGHT - 0.04;
const CENTER_Y = MAIN_MONITOR.center[1];
const ARC = 2 * HALF * (RADIUS - INSET);

export const MONITOR_SCREEN = {
  radius: RADIUS,
  inset: INSET,
  halfAngle: HALF,
  height: HEIGHT,
  segments: SEGMENTS,
  /** Middle of the screen's surface. */
  center: mainCurve(0, INSET, CENTER_Y),
  /** Arc length over height: the texture keeps this aspect. */
  aspect: ARC / HEIGHT,
} as const;

/** The ultrawide's old screen, horizon, sun and HUD (glow parts only). */
export const isMainScreenGlow = (part: SetupPart) => part.item === "monitor";

/** A point on the screen: `u` left to right as seen from the chair, `v` bottom to top. */
export function screenPoint(u: number, v: number): Vec3 {
  return mainCurve(HALF * (1 - 2 * u), INSET, CENTER_Y + (v - 0.5) * HEIGHT);
}

/**
 * One strip of `segments` facets on the arc. Joins share their vertices
 * and u is linear in angle, so the texture runs across them without seams.
 */
export function screenSurface(segments: number = SEGMENTS) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = HALF * (1 - 2 * u);
    for (const v of [0, 1]) {
      positions.push(...screenPoint(u, v));
      normals.push(Math.cos(theta), 0, -Math.sin(theta));
      uvs.push(u, v);
    }
    if (i < segments) {
      const [a, d, b, c] = [2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3];
      indices.push(a, b, c, a, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices,
  };
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/**
 * The close-up: face-on in plan, raised a little and looking down `pitch`
 * (intentional: the chair back, top 1.38 m, stands between a seated-height
 * camera and the screen). The distance fits the arc's width into `fill` of
 * the view, but never lets the screen's height drop under `heightShare` of
 * the view, so phones read the terminal on the screen itself; it stays
 * within the chair's clearance. Only this mode uses `limits`.
 */
export const MONITOR_FOCUS = {
  pitch: 0.2,
  minDistance: 1.0,
  maxDistance: 1.5,
  fill: 0.9,
  heightShare: { portrait: 0.6, landscape: 0.45 },
  limits: { minDistance: 0.3, maxDistance: 6, minPolar: 0.05, maxPolar: 3.09 },
} as const;

const TAN_V = Math.tan((GUIDE.fov / 2) * (Math.PI / 180));
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function monitorFocus(aspect: number): CameraPose {
  if (!Number.isFinite(aspect) || aspect <= 0)
    throw new RangeError("Aspect ratio must be a positive finite number");
  const { pitch, minDistance, maxDistance, fill, heightShare } = MONITOR_FOCUS;
  const r = RADIUS - INSET;
  // The arc's ends come forward by its sagitta and must fit too.
  const fitWidth =
    r * (1 - Math.cos(HALF)) + (r * Math.sin(HALF)) / (TAN_V * aspect * fill);
  const share = aspect < 1 ? heightShare.portrait : heightShare.landscape;
  const readable = HEIGHT / (2 * TAN_V * share);
  const d = clamp(Math.min(fitWidth, readable), minDistance, maxDistance);
  const [x, y, z] = MONITOR_SCREEN.center;
  return {
    position: [x + d * Math.cos(pitch), y + d * Math.sin(pitch), z],
    target: MONITOR_SCREEN.center,
  };
}

export interface Viewport {
  width: number;
  height: number;
}
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pixel position of `point` for a camera at `pose` (up +y, vertical `fov`). */
function project(
  point: Vec3,
  { position, target }: CameraPose,
  fov: number,
  { width, height }: Viewport,
) {
  const f = target.map((t, i) => t - position[i]);
  const fl = Math.hypot(...f);
  const fw = f.map((c) => c / fl);
  // right = forward × up, up' = right × forward.
  const rl = Math.hypot(fw[2], fw[0]);
  const right = [-fw[2] / rl, 0, fw[0] / rl];
  const up = [
    right[1] * fw[2] - right[2] * fw[1],
    right[2] * fw[0] - right[0] * fw[2],
    right[0] * fw[1] - right[1] * fw[0],
  ];
  const rel = point.map((p, i) => p - position[i]);
  const dot = (a: number[]) => a[0] * rel[0] + a[1] * rel[1] + a[2] * rel[2];
  const tanV = Math.tan((fov / 2) * (Math.PI / 180));
  const z = dot(fw);
  return {
    x: ((dot(right) / (z * tanV * (width / height)) + 1) / 2) * width,
    y: ((1 - dot(up) / (z * tanV)) / 2) * height,
  };
}

/**
 * The screen's projected bounds: "outer" encloses it, "inner" is the
 * largest axis-aligned rectangle inside its curved outline.
 */
export function screenRect(
  pose: CameraPose,
  fov: number,
  viewport: Viewport,
  kind: "outer" | "inner",
): Rect {
  const steps = SEGMENTS * 2;
  const at = (u: number, v: number) =>
    project(screenPoint(u, v), pose, fov, viewport);
  const edge = (fixed: "u" | "v", value: number) =>
    Array.from({ length: steps + 1 }, (_, i) =>
      fixed === "u" ? at(value, i / steps) : at(i / steps, value),
    );
  const [left, right, top, bottom] = [
    edge("u", 0),
    edge("u", 1),
    edge("v", 1),
    edge("v", 0),
  ];
  const xs = (list: { x: number }[]) => list.map((p) => p.x);
  const ys = (list: { y: number }[]) => list.map((p) => p.y);
  const box =
    kind === "outer"
      ? [
          Math.min(...xs(left)),
          Math.max(...xs(right)),
          Math.min(...ys(top)),
          Math.max(...ys(bottom)),
        ]
      : [
          Math.max(...xs(left)),
          Math.min(...xs(right)),
          Math.max(...ys(top)),
          Math.min(...ys(bottom)),
        ];
  return {
    left: box[0],
    top: box[2],
    width: box[1] - box[0],
    height: box[3] - box[2],
  };
}

/** Where screen point (u, v) lands in the viewport from the terminal close-up. */
export function projectScreen(u: number, v: number, viewport: Viewport) {
  const pose = monitorFocus(viewport.width / viewport.height);
  return project(screenPoint(u, v), pose, GUIDE.fov, viewport);
}

/**
 * The u range of the screen the close-up shows inside `margin` px of the
 * viewport edges: the whole screen on wide views, its middle on phones.
 */
export function visibleSpan(viewport: Viewport, margin = 8) {
  const x = (u: number) => projectScreen(u, 0.5, viewport).x;
  // x grows with u: bisect each edge.
  const edge = (inside: (u: number) => boolean, from: number, to: number) => {
    if (inside(from)) return from;
    let [a, b] = [from, to];
    for (let i = 0; i < 30; i++) {
      const mid = (a + b) / 2;
      if (inside(mid)) b = mid;
      else a = mid;
    }
    return b;
  };
  return {
    u0: edge((u) => x(u) >= margin, 0, 0.5),
    u1: edge((u) => x(u) <= viewport.width - margin, 1, 0.5),
  };
}

/**
 * Entry is offered from the room side of the screen, close enough that the
 * cutaway has dissolved the walls in between (CUTAWAY.wall.gone).
 */
export function canEnterMonitor(camera: Vec3): boolean {
  if (!camera.every(Number.isFinite)) return false;
  const front = camera[0] - MONITOR_SCREEN.center[0];
  const distance = Math.hypot(...camera.map((c, i) => c - HOUSE_FOCUS[i]));
  return front > 0.3 && distance <= CUTAWAY.wall.gone;
}
