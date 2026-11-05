// Football helmet for the left display case (collection-display-models T5,
// S12): an original, SpeedFlex-inspired model authored in code, painted with
// the owner's gold and black Rams-style horn livery. Nothing is downloaded:
// the shell, flex panel, vents, bumpers, padding, facemask, clips and eye
// shield are modelled here from Riddell's official SpeedFlex varsity product
// photos (front, side, back and inside views), and the livery is redrawn from
// the owner's photos of their own helmet (a Schutt, so only its paint is
// transferred, not its shape). It is not Riddell's CAD and not an exact
// replica: proportions, vents and the cage pattern are approximations, and no
// Riddell or Schutt marks are reproduced. Riddell and SpeedFlex belong to
// their owner; no affiliation.
//
// Pure: importing this module computes nothing. `buildFootballHelmet` returns
// the parts and the livery atlas; scripts/prepare-display-football.mjs writes
// them to public/world/models/display-football-helmet.glb.
//
// Helmet frame: metres, +x the facemask (front), +y up, +z the wearer's right.

import { CatmullRomCurve3, SphereGeometry, TubeGeometry, Vector3 } from "three";

type V2 = [number, number];
type V3 = [number, number, number];

const DEG = Math.PI / 180;

/** Semantic parts, in export order. */
export const HELMET_PARTS = [
  "shell",
  "shell-edge",
  "flex-panel",
  "front-bumper",
  "rear-bumper",
  "padding",
  "facemask",
  "facemask-clips",
  "hardware",
  "eye-shield",
] as const;
export type HelmetPartName = (typeof HELMET_PARTS)[number];

export type HelmetMaterialName =
  | "livery"
  | "shell-edge"
  | "bumper"
  | "padding"
  | "facemask"
  | "clip"
  | "hardware"
  | "eye-shield";

export interface HelmetMaterial {
  /** Linear RGBA factor; multiplied by the atlas where there is one. */
  color: [number, number, number, number];
  roughness: number;
  metalness: number;
  /** Samples the livery atlas and its surface map through TEXCOORD_0. */
  textured?: boolean;
  /** Alpha blended (the tinted eye shield). */
  blend?: boolean;
  doubleSided?: boolean;
}

const srgb = (hex: string, alpha = 1): [number, number, number, number] => {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return [c[0], c[1], c[2], alpha];
};

export const HELMET_MATERIALS: Record<HelmetMaterialName, HelmetMaterial> = {
  // The atlas carries color; its surface map carries roughness and metalness.
  livery: {
    color: [1, 1, 1, 1],
    roughness: 1,
    metalness: 1,
    textured: true,
  },
  "shell-edge": { color: srgb("#232326"), roughness: 0.55, metalness: 0 },
  bumper: { color: srgb("#121214"), roughness: 0.7, metalness: 0 },
  padding: {
    color: srgb("#1e1f23"),
    roughness: 0.95,
    metalness: 0,
    doubleSided: true,
  },
  facemask: { color: srgb("#0b0b0d"), roughness: 0.42, metalness: 0.1 },
  clip: { color: srgb("#141518"), roughness: 0.3, metalness: 0 },
  hardware: { color: srgb("#b8bcc0"), roughness: 0.32, metalness: 1 },
  // Glossy black tint, still see-through, so it casts no solid shadow.
  "eye-shield": {
    color: srgb("#07080a", 0.85),
    roughness: 0.04,
    metalness: 0.15,
    blend: true,
    doubleSided: true,
  },
};

const PART_MATERIAL: Record<HelmetPartName, HelmetMaterialName> = {
  shell: "livery",
  "shell-edge": "shell-edge",
  "flex-panel": "livery",
  "front-bumper": "bumper",
  "rear-bumper": "bumper",
  padding: "padding",
  facemask: "facemask",
  "facemask-clips": "clip",
  hardware: "hardware",
  "eye-shield": "eye-shield",
};

export interface HelmetPart {
  name: HelmetPartName;
  material: HelmetMaterialName;
  positions: Float32Array;
  normals: Float32Array;
  /** Livery atlas coordinates (shell and flex panel only). */
  uvs?: Float32Array;
  indices: Uint32Array;
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface HelmetAsset {
  parts: HelmetPart[];
  /** Base color atlas: u wraps the azimuth (front at the centre), v the elevation (crown on top). */
  atlas: RgbaImage;
  /** glTF metallic-roughness map for the same UVs: G roughness, B metalness. */
  surface: RgbaImage;
}

// ---- Shell surface -------------------------------------------------------

/** Lowest elevation the atlas covers, below the jaw. */
export const ATLAS_EL_MIN = -72 * DEG;
/** Painted shell thickness at its openings. */
export const SHELL_THICKNESS = 0.005;

const SHELL = {
  front: 0.157,
  back: 0.154,
  side: 0.131,
  top: 0.132,
  bottom: 0.158,
  /** Rounder dome above the equator, squarer jaw and neck below it. */
  upper: 2.15,
  lower: 2.6,
};

const gauss = (x: number, mu: number, sigma: number) =>
  Math.exp(-(((x - mu) / sigma) ** 2));
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Signed angle difference wrapped into [-pi, pi]. */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

const direction = (az: number, el: number): V3 => [
  Math.cos(el) * Math.cos(az),
  Math.sin(el),
  Math.cos(el) * Math.sin(az),
];

/**
 * Outer shell radius along a direction, before the flex-panel relief: a
 * superellipsoid, deeper below the equator, with the SpeedFlex's forward jaw,
 * flatter cheeks, brow ridge and flared occipital bumper area.
 */
export function shellRadius(az: number, el: number): number {
  const [cx, cy, cz] = direction(az, el);
  const p = cy >= 0 ? SHELL.upper : SHELL.lower;
  const a = cx >= 0 ? SHELL.front : SHELL.back;
  const c = cy >= 0 ? SHELL.top : SHELL.bottom;
  let r =
    1 /
    ((Math.abs(cx) / a) ** p +
      (Math.abs(cy) / c) ** p +
      (Math.abs(cz) / SHELL.side) ** p) **
      (1 / p);
  const side = Math.abs(az);
  // Jaw: the side shell runs forward and down toward the chin.
  r += 0.012 * gauss(side, 48 * DEG, 22 * DEG) * gauss(el, -42 * DEG, 20 * DEG);
  // Cheeks: barely flatter between ear and jaw.
  r -= 0.003 * gauss(side, 85 * DEG, 25 * DEG) * gauss(el, -30 * DEG, 18 * DEG);
  // A long forehead slope, the crown peaking behind the middle.
  r -= 0.006 * gauss(side, 0, 55 * DEG) * gauss(el, 50 * DEG, 16 * DEG);
  r += 0.004 * gauss(side, 180 * DEG, 70 * DEG) * gauss(el, 50 * DEG, 20 * DEG);
  // Brow ridge over the face opening.
  r += 0.004 * gauss(side, 0, 40 * DEG) * gauss(el, 24 * DEG, 7 * DEG);
  // Occipital flare over the rear bumper.
  r +=
    0.006 *
    gauss(wrap(az - Math.PI), 0, 40 * DEG) *
    gauss(el, -28 * DEG, 13 * DEG);
  return r;
}

/** Point on the shell at an offset along its radius (negative: inward). */
export function shellPoint(az: number, el: number, offset = 0): V3 {
  const r = shellRadius(az, el) + offset;
  const d = direction(az, el);
  return [d[0] * r, d[1] * r, d[2] * r];
}

// ---- Outline, flex panel and vents, in (azimuth, elevation) -------------

/** Catmull-Rom through points, `steps` samples per span, ends kept. */
function smoothChain(points: V2[], steps: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        [0, 1].map(
          (k) =>
            0.5 *
            (2 * p1[k] +
              (-p0[k] + p2[k]) * t +
              (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
              (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3),
        ) as V2,
      );
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Lower edge of the right half of the shell, front centre to back centre, in
 * degrees: the brow over the face opening, the temple, the cheek running down
 * and forward to the jaw, the jaw's lower edge and the rear bumper line.
 */
const OUTLINE_RIGHT: V2[] = [
  [0, 20],
  [14, 20],
  [28, 19.3],
  [40, 17.5],
  [50, 14.5],
  [58, 10.5],
  [64, 5.5],
  [68.5, -1],
  [71, -8],
  [71, -15],
  [67.5, -22],
  [61, -28.5],
  [54, -34],
  [47.5, -39.5],
  [42, -45.5],
  [38.5, -51.5],
  [37.5, -56.5],
  [40, -60.5],
  [48, -62.5],
  [60, -63],
  [74, -62],
  [89, -60],
  [104, -59.5],
  [119, -60],
  [134, -60.5],
  [149, -61],
  [164, -61],
  [180, -61],
];

/** Flex panel: a tongue on the forehead, cut free on three sides by a U seam. */
const PANEL = { halfAz: 21, bottom: 33, top: 58, corner: 6 };
const PANEL_SEAM_RIGHT: V2[] = [
  [0, PANEL.bottom],
  [PANEL.halfAz - PANEL.corner, PANEL.bottom],
  [PANEL.halfAz - 1.2, PANEL.bottom + 1.6],
  [PANEL.halfAz, PANEL.bottom + PANEL.corner],
  [PANEL.halfAz, PANEL.top],
];

interface Vent {
  /** Centre line, degrees (az, el), right side unless `centre`. */
  path: V2[];
  /** Slot width, metres. */
  width: number;
  /** One vent on the centre line, not mirrored. */
  centre?: boolean;
}

/** Through-slots in the shell, after the official SpeedFlex photos. */
const VENTS: Vent[] = [
  // Across the top of the flex panel, where it hinges.
  {
    path: [
      [-17, 62],
      [17, 62],
    ],
    width: 0.0072,
    centre: true,
  },
  // Front-side slots, raked back from the brow.
  {
    path: [
      [33, 39.5],
      [46, 31],
    ],
    width: 0.0072,
  },
  // Crown-side slots running front to back.
  {
    path: [
      [58, 57],
      [86, 60],
    ],
    width: 0.0078,
  },
  // Upper rear-side slots.
  {
    path: [
      [116, 37],
      [127, 51],
    ],
    width: 0.0078,
  },
  // Rear diagonal slots.
  {
    path: [
      [147, 51],
      [158, 36],
    ],
    width: 0.0078,
  },
  // Small rear slots over the bumper.
  {
    path: [
      [146, -16],
      [156, -17],
    ],
    width: 0.006,
  },
  // Ear hole: a horizontal slot behind the jaw.
  {
    path: [
      [96, -24],
      [116, -24],
    ],
    width: 0.011,
  },
];

const mirror = (points: V2[]): V2[] => points.map(([a, e]) => [-a, e] as V2);
const toRad = (points: V2[]): V2[] =>
  points.map(([a, e]) => [a * DEG, e * DEG] as V2);

/** Nominal radius turning angles into metres for distances on the shell. */
const R0 = 0.14;

/** Local metric offset (metres) from (az0, el0) to (az, el). */
const local = (az: number, el: number, az0: number, el0: number): V2 => [
  wrap(az - az0) * Math.cos((el + el0) / 2) * R0,
  (el - el0) * R0,
];

/**
 * A segment's ends in the local metric about (az, el), the second end taken
 * from the first the short way round, so no segment wraps across the back.
 */
function segmentAround(p0: V2, p1: V2, az: number, el: number): [V2, V2] {
  const a = local(p0[0], p0[1], az, el);
  const d = local(p1[0], p1[1], p0[0], p0[1]);
  return [a, [a[0] + d[0], a[1] + d[1]]];
}

function segmentDistance(p: V2, a: V2, b: V2): number {
  const ab: V2 = [b[0] - a[0], b[1] - a[1]];
  const len = ab[0] ** 2 + ab[1] ** 2;
  const t =
    len === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len),
        );
  return Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]);
}

/** Distance (metres) from (az, el) to a polyline given in radians. */
function polylineDistance(az: number, el: number, line: V2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length - 1; i++) {
    const [a, b] = segmentAround(line[i], line[i + 1], az, el);
    best = Math.min(best, segmentDistance([0, 0], a, b));
  }
  return best;
}

function insidePolygon(p: V2, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}

interface ShellLayout {
  /** Lower edge across the whole shell, az -180 to 180, radians. */
  edge: V2[];
  /** Closed domain polygon: the edge, closed over the crown. */
  domain: V2[];
  /** Vent centre lines and outlines, radians. */
  vents: { line: V2[]; width: number; outline: V2[] }[];
  /** U seam of the flex panel and the panel polygon, radians. */
  seam: V2[];
  panel: V2[];
}

let layoutMemo: ShellLayout | undefined;

function shellLayout(): ShellLayout {
  if (layoutMemo) return layoutMemo;
  const right = smoothChain(OUTLINE_RIGHT, 8);
  const edgeDeg = [...mirror(right).reverse(), ...right.slice(1)];
  const edge = toRad(edgeDeg);
  const domain: V2[] = [
    ...edge,
    [Math.PI, Math.PI / 2 + 0.01],
    [-Math.PI, Math.PI / 2 + 0.01],
  ];
  const vents: ShellLayout["vents"] = [];
  for (const vent of VENTS)
    for (const path of vent.centre
      ? [vent.path]
      : [vent.path, mirror(vent.path)]) {
      const line = toRad(path);
      // Outline sampled around the capsule in the local metric.
      const [az0, el0] = line[0];
      const [az1, el1] = line[1];
      const a = local(az0, el0, az0, el0);
      const b = local(az1, el1, az0, el0);
      const dir = [b[0] - a[0], b[1] - a[1]];
      const len = Math.hypot(dir[0], dir[1]);
      const ux = dir[0] / len;
      const uy = dir[1] / len;
      const h = vent.width / 2;
      const outline: V2[] = [];
      for (const [end, from] of [
        [b, -Math.PI / 2],
        [a, Math.PI / 2],
      ] as const)
        for (let k = 0; k <= 14; k++) {
          const t = from + (k / 14) * Math.PI;
          const c = Math.cos(t);
          const s = Math.sin(t);
          const ox = end[0] + h * (c * ux - s * uy);
          const oy = end[1] + h * (s * ux + c * uy);
          const el = el0 + oy / R0;
          outline.push([az0 + ox / (R0 * Math.cos((el + el0) / 2)), el]);
        }
      vents.push({ line, width: vent.width, outline });
    }
  const seamRight = smoothChain(PANEL_SEAM_RIGHT, 6);
  const seamDeg = [...mirror(seamRight).reverse(), ...seamRight.slice(1)];
  const seam = toRad(seamDeg);
  const panel = [...seam, [PANEL.halfAz * DEG, (PANEL.top + 0.01) * DEG] as V2];
  layoutMemo = { edge, domain, vents, seam, panel };
  return layoutMemo;
}

const inVent = (az: number, el: number, layout: ShellLayout) =>
  layout.vents.some(
    (vent) => polylineDistance(az, el, vent.line) < vent.width / 2,
  );

/** On the shell surface: inside the outline and not in a vent. */
export function onShell(az: number, el: number): boolean {
  const layout = shellLayout();
  return (
    insidePolygon([wrap(az), el], layout.domain) && !inVent(az, el, layout)
  );
}

/** Elevations where the outline crosses a meridian, low to high. */
function edgeCrossings(az: number): number[] {
  const { edge } = shellLayout();
  const out: number[] = [];
  for (let i = 0; i < edge.length - 1; i++) {
    const [a0, e0] = edge[i];
    const [a1, e1] = edge[i + 1];
    if ((a0 <= az && az <= a1) || (a1 <= az && az <= a0)) {
      const t = a1 === a0 ? 0 : (az - a0) / (a1 - a0);
      out.push(e0 + t * (e1 - e0));
    }
  }
  return out.sort((x, y) => x - y);
}

/**
 * Relief: the flex panel stands proud of the shell with its seam sunk in, and
 * the back steps out into a shelf over the rear bumper.
 */
function relief(az: number, el: number): number {
  const back = Math.abs(wrap(az - Math.PI));
  const shelf =
    0.0035 *
      (1 - smoothstep(-19 * DEG, -13 * DEG, el)) *
      gauss(back, 0, 48 * DEG) +
    // A raised spine down the back, between the rear vents.
    0.002 *
      (1 - smoothstep(11 * DEG, 15 * DEG, back)) *
      smoothstep(-12 * DEG, -6 * DEG, el) *
      (1 - smoothstep(66 * DEG, 76 * DEG, el));
  if (Math.abs(az) > 32 * DEG || el < 24 * DEG || el > 68 * DEG) return shelf;
  const layout = shellLayout();
  const seam = polylineDistance(az, el, layout.seam);
  const inside = insidePolygon([az, el], layout.panel);
  const raise = inside ? 0.0012 * smoothstep(0.0008, 0.004, seam) : 0;
  return raise - 0.0018 * gauss(seam, 0, 0.0016);
}

const outerPoint = (az: number, el: number): V3 =>
  shellPoint(az, el, relief(az, el));

function outerNormal(az: number, el: number): V3 {
  if (el > Math.PI / 2 - 1e-6) return [0, 1, 0];
  const h = 2e-4;
  const a0 = outerPoint(az - h, el);
  const a1 = outerPoint(az + h, el);
  const e0 = outerPoint(az, el - h);
  const e1 = outerPoint(az, el + h);
  const da = sub(a1, a0);
  const de = sub(e1, e0);
  return normalize(cross(de, da));
}

// ---- Livery --------------------------------------------------------------

export type LiveryPaint = "gold" | "horn" | "seam" | "number" | "number-light";

/** Paint colors (sRGB) and their surface: metallic gold, satin-matte decals. */
export const LIVERY: Record<
  LiveryPaint,
  { color: [number, number, number]; roughness: number; metalness: number }
> = {
  gold: { color: [206, 170, 92], roughness: 0.32, metalness: 0.45 },
  horn: { color: [14, 15, 18], roughness: 0.55, metalness: 0.05 },
  seam: { color: [26, 24, 22], roughness: 0.9, metalness: 0 },
  number: { color: [17, 18, 22], roughness: 0.5, metalness: 0.05 },
  "number-light": { color: [214, 214, 208], roughness: 0.5, metalness: 0 },
};

/**
 * The horn: one continuous, tapering ram's-horn spiral a side, after the
 * Rams' helmet and the owner's gold-and-black paint. Laid out on the shell
 * itself, in (azimuth, elevation) degrees with a half width in metres, so it
 * wraps the forehead and crown without projection: from the brow beside the
 * flex panel, over the temple, back and down behind the ear hole, forward
 * under it along the jaw, then curling up and back in front of the ear to a
 * point. The inner curl stays on the shell, whose front edge runs at about
 * az 70 deg between the temple and the jaw.
 */
const HORN: [number, number, number][] = [
  [8, 22, 0.008],
  [14, 27.5, 0.011],
  [22, 33, 0.015],
  [36, 39, 0.018],
  [50, 42, 0.02],
  [66, 41.5, 0.02],
  [82, 37, 0.02],
  [96, 29, 0.02],
  [108, 19, 0.02],
  [120, 7, 0.02],
  [128, -6, 0.02],
  [130, -26, 0.019],
  [122, -38, 0.018],
  [108, -44.5, 0.017],
  [90, -45, 0.016],
  [77, -40, 0.014],
  [71, -31, 0.012],
  [73, -19, 0.009],
  [80, -10.5, 0.0065],
  [89, -8, 0.0045],
  [96, -9.5, 0.0025],
];

interface HornSegment {
  a: V2;
  b: V2;
  /** Half widths at the ends, metres. */
  w0: number;
  w1: number;
  /** Bounds in (|az|, el), radians, widened by the half width. */
  box: [number, number, number, number];
}
let hornMemo: HornSegment[] | undefined;

/** The horn's centre line, smoothed, as tapered segments. */
function hornSegments(): HornSegment[] {
  if (hornMemo) return hornMemo;
  const line = toRad(
    smoothChain(
      HORN.map(([az, el]) => [az, el] as V2),
      10,
    ),
  );
  // The same spline through the widths keeps them in step with the line.
  const widths = smoothChain(
    HORN.map(([, , w]) => [w, 0] as V2),
    10,
  ).map(([w]) => w);
  hornMemo = line.slice(1).map((b, i) => {
    const a = line[i];
    const w0 = widths[i];
    const w1 = widths[i + 1];
    // Generous: an azimuth step shrinks by cos(el) toward the crown.
    const m = (Math.max(w0, w1) / R0) * 2;
    return {
      a,
      b,
      w0,
      w1,
      box: [
        Math.min(a[0], b[0]) - m,
        Math.max(a[0], b[0]) + m,
        Math.min(a[1], b[1]) - m / 2,
        Math.max(a[1], b[1]) + m / 2,
      ],
    };
  });
  return hornMemo;
}

/** Whether a shell direction is on a horn: mirrored, off the flex panel. */
function inHorn(az: number, el: number): boolean {
  const side = Math.abs(az);
  for (const { a, b, w0, w1, box } of hornSegments()) {
    if (side < box[0] || side > box[1] || el < box[2] || el > box[3]) continue;
    const [p0, p1] = segmentAround(a, b, side, el);
    const ab: V2 = [p1[0] - p0[0], p1[1] - p0[1]];
    const len = ab[0] ** 2 + ab[1] ** 2;
    const t =
      len === 0
        ? 0
        : Math.max(0, Math.min(1, -(p0[0] * ab[0] + p0[1] * ab[1]) / len));
    const d = Math.hypot(p0[0] + t * ab[0], p0[1] + t * ab[1]);
    if (d <= w0 + (w1 - w0) * t)
      return !insidePolygon([az, el], shellLayout().panel);
  }
  return false;
}

/** Block numerals as strokes in a unit box (x right, y down). */
const DIGITS: Record<string, V2[][]> = {
  "1": [
    [
      [0.25, 0.18],
      [0.55, 0],
      [0.55, 1],
    ],
  ],
  "2": [
    [
      [0, 0.12],
      [0.18, 0],
      [0.82, 0],
      [1, 0.15],
      [1, 0.38],
      [0, 1],
      [1, 1],
    ],
  ],
  "3": [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    [
      [0.3, 0.5],
      [1, 0.5],
    ],
  ],
  "8": [
    [
      [0.05, 0],
      [0.95, 0],
      [0.95, 1],
      [0.05, 1],
      [0.05, 0],
    ],
    [
      [0.05, 0.5],
      [0.95, 0.5],
    ],
  ],
};

/** Whether (x, y) in a numeral's unit box falls on its strokes. */
function onNumeral(text: string, x: number, y: number, stroke: number) {
  const n = text.length;
  const gap = 0.28;
  const cell = 1 + gap;
  const span = n * cell - gap;
  for (let i = 0; i < n; i++) {
    const lx = x * span - i * cell;
    if (lx < -stroke || lx > 1 + stroke) continue;
    for (const line of DIGITS[text[i]])
      if (
        line.some(
          (_, k) =>
            k + 1 < line.length &&
            segmentDistance([lx, y], line[k], line[k + 1]) < stroke,
        )
      )
        return true;
  }
  return false;
}

/** The owner's back decals: #32 centred, the 18 disc low on the left. */
const NUMBER_32 = { width: 0.078, height: 0.044, y: 0.006, stroke: 0.1 };
const DISC_18 = { az: -168 * DEG, el: -27 * DEG, radius: 0.018 };

function backPaint(az: number, el: number, p: V3): LiveryPaint | null {
  if (p[0] < 0) {
    const x = (p[2] + NUMBER_32.width / 2) / NUMBER_32.width;
    const y = (NUMBER_32.y + NUMBER_32.height / 2 - p[1]) / NUMBER_32.height;
    if (x >= -0.1 && x <= 1.1 && y >= -0.1 && y <= 1.1) {
      // Seen from behind, +z is on the viewer's right.
      if (onNumeral("32", x, y, NUMBER_32.stroke)) return "number";
    }
  }
  const [dx, dy] = local(az, el, DISC_18.az, DISC_18.el);
  const d = Math.hypot(dx, dy);
  if (d < DISC_18.radius) {
    const s = DISC_18.radius * 1.1;
    const x = (-dx / s + 0.62) / 1.24;
    const y = (DISC_18.radius * 0.55 - dy) / (DISC_18.radius * 1.1);
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1 && onNumeral("18", x, y, 0.11))
      return "number-light";
    return "number";
  }
  return null;
}

/** Paint at a direction of the shell: horns, panel seam, numbers or gold. */
export function liveryAt(az: number, el: number): LiveryPaint {
  az = wrap(az);
  if (Math.abs(az) < 30 * DEG && el > 28 * DEG && el < 64 * DEG) {
    if (polylineDistance(az, el, shellLayout().seam) < 0.0011) return "seam";
  }
  const p = shellPoint(az, el);
  const back = backPaint(az, el, p);
  if (back) return back;
  return inHorn(az, el) ? "horn" : "gold";
}

/** Atlas texel (column, row) centre to shell direction. */
export const atlasDirection = (u: number, v: number): V2 => [
  (u - 0.5) * 2 * Math.PI,
  Math.PI / 2 - v * (Math.PI / 2 - ATLAS_EL_MIN),
];

const atlasUv = (az: number, el: number): V2 => [
  Math.min(1, Math.max(0, 0.5 + az / (2 * Math.PI))),
  Math.min(1, Math.max(0, (Math.PI / 2 - el) / (Math.PI / 2 - ATLAS_EL_MIN))),
];

function paintAtlas(width: number, samples: number): [RgbaImage, RgbaImage] {
  const height = width / 2;
  const atlas = new Uint8Array(width * height * 4);
  const sw = width / 2;
  const sh = height / 2;
  const surface = new Uint8Array(sw * sh * 4);
  const rough = new Float64Array(sw * sh);
  const metal = new Float64Array(sw * sh);
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let ro = 0;
      let me = 0;
      for (let sy = 0; sy < samples; sy++)
        for (let sx = 0; sx < samples; sx++) {
          const [az, el] = atlasDirection(
            (col + (sx + 0.5) / samples) / width,
            (row + (sy + 0.5) / samples) / height,
          );
          const paint = LIVERY[liveryAt(az, el)];
          r += paint.color[0];
          g += paint.color[1];
          b += paint.color[2];
          ro += paint.roughness;
          me += paint.metalness;
        }
      const n = samples * samples;
      const k = (row * width + col) * 4;
      atlas[k] = Math.round(r / n);
      atlas[k + 1] = Math.round(g / n);
      atlas[k + 2] = Math.round(b / n);
      atlas[k + 3] = 255;
      const s = (row >> 1) * sw + (col >> 1);
      rough[s] += ro / n / 4;
      metal[s] += me / n / 4;
    }
  for (let s = 0; s < sw * sh; s++) {
    surface[s * 4] = 255;
    surface[s * 4 + 1] = Math.round(rough[s] * 255);
    surface[s * 4 + 2] = Math.round(metal[s] * 255);
    surface[s * 4 + 3] = 255;
  }
  return [
    { width, height, data: atlas },
    { width: sw, height: sh, data: surface },
  ];
}

// ---- Mesh helpers --------------------------------------------------------

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l === 0 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
}
const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const mirrorZ = ([x, y, z]: V3): V3 => [x, y, -z];

/** Growing mesh: positions, normals, optional UVs, triangles. */
class MeshBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  get count() {
    return this.positions.length / 3;
  }
  vertex(p: V3, n: V3, uv?: V2): number {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    if (uv) this.uvs.push(uv[0], uv[1]);
    return this.count - 1;
  }
  triangle(a: number, b: number, c: number) {
    this.indices.push(a, b, c);
  }
  /** Append three.js geometry arrays. */
  geometry(geometry: {
    getAttribute(name: string): { array: ArrayLike<number> };
    getIndex(): { array: ArrayLike<number> } | null;
  }) {
    const base = this.count;
    const p = geometry.getAttribute("position").array;
    const n = geometry.getAttribute("normal").array;
    for (let i = 0; i < p.length; i++) {
      this.positions.push(p[i]);
      this.normals.push(n[i]);
    }
    const index = geometry.getIndex();
    if (index)
      for (const i of Array.from(index.array)) this.indices.push(base + i);
  }
  /** Append another mesh's vertices and triangles. */
  append(other: MeshBuilder) {
    const base = this.count;
    this.positions.push(...other.positions);
    this.normals.push(...other.normals);
    this.uvs.push(...other.uvs);
    for (const i of other.indices) this.indices.push(base + i);
  }
  /** Smooth per-vertex normals from the triangles (area weighted). */
  smoothNormals() {
    const n = new Array(this.positions.length).fill(0);
    for (let t = 0; t < this.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => this.indices[t + k]);
      const pa = this.point(a);
      const f = cross(sub(this.point(b), pa), sub(this.point(c), pa));
      for (const v of [a, b, c])
        for (let k = 0; k < 3; k++) n[v * 3 + k] += f[k];
    }
    for (let v = 0; v < this.count; v++) {
      const u = normalize([n[v * 3], n[v * 3 + 1], n[v * 3 + 2]]);
      this.normals.splice(v * 3, 3, ...u);
    }
  }
  point(i: number): V3 {
    return [
      this.positions[i * 3],
      this.positions[i * 3 + 1],
      this.positions[i * 3 + 2],
    ];
  }
  part(name: HelmetPartName): HelmetPart {
    return {
      name,
      material: PART_MATERIAL[name],
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: this.uvs.length ? Float32Array.from(this.uvs) : undefined,
      indices: Uint32Array.from(this.indices),
    };
  }
}

/**
 * A regular (az, el) grid over the shell, trimmed to a domain: vertices near
 * an edge are snapped onto it, so the openings are clean curves, and
 * triangles whose centre falls outside are dropped.
 */
interface TrimmedGrid {
  nu: number;
  nv: number;
  az: Float64Array;
  el: Float64Array;
  /** Distance (metres) from each vertex to the nearest trimmed edge. */
  edgeDistance: Float64Array;
  /** Kept triangles, outward winding, grid vertex ids. */
  triangles: number[];
  /** Grid id to topological id: seam columns and the pole are welded. */
  canon: Int32Array;
}

function trimmedGrid(
  nu: number,
  nv: number,
  keep: (az: number, el: number) => boolean,
  edges: V2[][],
): TrimmedGrid {
  const cols = nu + 1;
  const count = cols * (nv + 1);
  const az = new Float64Array(count);
  const el = new Float64Array(count);
  const edgeDistance = new Float64Array(count);
  const canon = new Int32Array(count);
  const dEl = (Math.PI / 2 - ATLAS_EL_MIN) / nv;
  const dAz = (2 * Math.PI) / nu;
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const id = j * cols + i;
      let a = -Math.PI + i * dAz;
      let e = ATLAS_EL_MIN + j * dEl;
      canon[id] = j === nv ? nv * cols : i === nu ? j * cols : id;
      // Nearest edge point in the local metric.
      let best = Number.POSITIVE_INFINITY;
      let snap: V2 | null = null;
      if (j < nv)
        for (const line of edges)
          for (let k = 0; k < line.length - 1; k++) {
            const [p0, p1] = segmentAround(line[k], line[k + 1], a, e);
            if (
              Math.min(Math.abs(p0[0]), Math.abs(p1[0])) > best &&
              Math.sign(p0[0]) === Math.sign(p1[0])
            )
              continue;
            const ab: V2 = [p1[0] - p0[0], p1[1] - p0[1]];
            const len = ab[0] ** 2 + ab[1] ** 2;
            const t =
              len === 0
                ? 0
                : Math.max(
                    0,
                    Math.min(1, -(p0[0] * ab[0] + p0[1] * ab[1]) / len),
                  );
            const q: V2 = [p0[0] + t * ab[0], p0[1] + t * ab[1]];
            const d = Math.hypot(q[0], q[1]);
            if (d < best) {
              best = d;
              snap = q;
            }
          }
      edgeDistance[id] = best;
      const cell = Math.max(dAz * Math.cos(e) * R0, dEl * R0);
      if (snap && best < 0.72 * cell) {
        const de = snap[1] / R0;
        // Seam columns only slide along their meridian.
        const da =
          i === 0 || i === nu ? 0 : snap[0] / (R0 * Math.cos(e + de / 2));
        if (i === 0 || i === nu) {
          const crossing = edgeCrossings(Math.PI).find(
            (x) => Math.abs(x - e) < 0.72 * dEl,
          );
          if (crossing !== undefined) e = crossing;
        } else {
          a += da;
          e += de;
        }
        edgeDistance[id] = 0;
      }
      az[id] = a;
      el[id] = e;
    }
  const triangles: number[] = [];
  const metric = (id: number): V2 => [az[id] * Math.cos(el[id]), el[id]];
  const tryTriangle = (a: number, b: number, c: number) => {
    if (canon[a] === canon[b] || canon[b] === canon[c] || canon[a] === canon[c])
      return;
    const [pa, pb, pc] = [a, b, c].map(metric);
    // Outward winding is clockwise in (az, el); a snap must not flip it.
    const area =
      (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
    if (area > -1e-9) return;
    const ca = (az[a] + az[b] + az[c]) / 3;
    const ce = (el[a] + el[b] + el[c]) / 3;
    if (keep(ca, ce)) triangles.push(a, b, c);
  };
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const d = a + cols;
      const c = d + 1;
      // Mirrored diagonals keep the two halves symmetric.
      if (i < nu / 2) {
        tryTriangle(a, c, b);
        tryTriangle(a, d, c);
      } else {
        tryTriangle(a, d, b);
        tryTriangle(b, d, c);
      }
    }
  return { nu, nv, az, el, edgeDistance, triangles, canon };
}

/** Directed edges used by exactly one triangle, in triangle winding. */
function boundaryEdges(grid: TrimmedGrid): [number, number][] {
  const count = new Map<string, number>();
  const key = (a: number, b: number) => {
    const [x, y] = [grid.canon[a], grid.canon[b]];
    return x < y ? `${x},${y}` : `${y},${x}`;
  };
  const t = grid.triangles;
  for (let k = 0; k < t.length; k += 3)
    for (const [a, b] of [
      [t[k], t[k + 1]],
      [t[k + 1], t[k + 2]],
      [t[k + 2], t[k]],
    ])
      count.set(key(a, b), (count.get(key(a, b)) ?? 0) + 1);
  const out: [number, number][] = [];
  for (let k = 0; k < t.length; k += 3)
    for (const [a, b] of [
      [t[k], t[k + 1]],
      [t[k + 1], t[k + 2]],
      [t[k + 2], t[k]],
    ])
      if (count.get(key(a, b)) === 1) out.push([a, b]);
  return out;
}

// ---- Parts ---------------------------------------------------------------

const DETAIL = {
  full: {
    nu: 320,
    nv: 132,
    liner: [200, 84],
    atlas: 2048,
    samples: 2,
    tube: 0.0045,
  },
  preview: {
    nu: 96,
    nv: 40,
    liner: [64, 26],
    atlas: 256,
    samples: 1,
    tube: 0.012,
  },
} as const;
export type HelmetDetail = keyof typeof DETAIL;

function shellParts(nu: number, nv: number): HelmetPart[] {
  const layout = shellLayout();
  const grid = trimmedGrid(nu, nv, onShell, [
    layout.edge,
    ...layout.vents.map((vent) => [...vent.outline, vent.outline[0]]),
  ]);
  const shell = new MeshBuilder();
  const panel = new MeshBuilder();
  const remap = [new Map<number, number>(), new Map<number, number>()];
  const outerVertex = (
    target: MeshBuilder,
    map: Map<number, number>,
    id: number,
  ) => {
    let v = map.get(id);
    if (v === undefined) {
      const a = grid.az[id];
      const e = grid.el[id];
      v = target.vertex(outerPoint(a, e), outerNormal(a, e), atlasUv(a, e));
      map.set(id, v);
    }
    return v;
  };
  const t = grid.triangles;
  for (let k = 0; k < t.length; k += 3) {
    const ca = (grid.az[t[k]] + grid.az[t[k + 1]] + grid.az[t[k + 2]]) / 3;
    const ce = (grid.el[t[k]] + grid.el[t[k + 1]] + grid.el[t[k + 2]]) / 3;
    const onPanel = insidePolygon([ca, ce], layout.panel);
    const target = onPanel ? panel : shell;
    const map = remap[onPanel ? 1 : 0];
    target.triangle(
      outerVertex(target, map, t[k]),
      outerVertex(target, map, t[k + 1]),
      outerVertex(target, map, t[k + 2]),
    );
  }

  // Edge: the unpainted inner lip near every opening, and the rim joining it
  // to the painted outer face.
  const edge = new MeshBuilder();
  const inner = new Map<number, number>();
  const innerPoint = (id: number) =>
    shellPoint(grid.az[id], grid.el[id], -SHELL_THICKNESS);
  const innerVertex = (id: number) => {
    let v = inner.get(id);
    if (v === undefined) {
      v = edge.vertex(
        innerPoint(id),
        scale(outerNormal(grid.az[id], grid.el[id]), -1),
      );
      inner.set(id, v);
    }
    return v;
  };
  const LIP = 0.012;
  for (let k = 0; k < t.length; k += 3) {
    const near = Math.min(
      grid.edgeDistance[t[k]],
      grid.edgeDistance[t[k + 1]],
      grid.edgeDistance[t[k + 2]],
    );
    if (near > LIP) continue;
    edge.triangle(
      innerVertex(t[k]),
      innerVertex(t[k + 2]),
      innerVertex(t[k + 1]),
    );
  }
  // Rim vertices are shared along each opening, so its normals run smooth.
  const rim = new MeshBuilder();
  const rimIds = new Map<string, number>();
  const rimVertex = (id: number, outer: boolean) => {
    const key = `${outer ? "o" : "i"}${grid.canon[id]}`;
    let v = rimIds.get(key);
    if (v === undefined) {
      v = rim.vertex(
        outer ? outerPoint(grid.az[id], grid.el[id]) : innerPoint(id),
        [0, 0, 0],
      );
      rimIds.set(key, v);
    }
    return v;
  };
  for (const [a, b] of boundaryEdges(grid)) {
    const [ao, bo, ai, bi] = [
      rimVertex(a, true),
      rimVertex(b, true),
      rimVertex(a, false),
      rimVertex(b, false),
    ];
    rim.triangle(ao, bi, bo);
    rim.triangle(ao, ai, bi);
  }
  rim.smoothNormals();
  edge.append(rim);
  return [
    shell.part("shell"),
    edge.part("shell-edge"),
    panel.part("flex-panel"),
  ];
}

/** A band hugging the shell along its edge, wrapping over the rim. */
function bumper(
  name: HelmetPartName,
  az0: number,
  az1: number,
  edgeEl: (az: number) => number,
  height: number,
  segments: number,
): HelmetPart {
  const mesh = new MeshBuilder();
  const rows = 7;
  const thick = 0.0048;
  const cols = segments;
  const grid: number[][] = [];
  for (let i = 0; i <= cols; i++) {
    const s = i / cols;
    const az = az0 + (az1 - az0) * s;
    const ends = smoothstep(0, 0.06, s) * smoothstep(1, 0.94, s);
    const e0 = edgeEl(az);
    const column: number[] = [];
    // Skirt under the rim, then the face rising away from the edge.
    const skirt = shellPoint(az, e0, -SHELL_THICKNESS - 0.0008);
    column.push(mesh.vertex(skirt, [0, 0, 0]));
    for (let k = 0; k <= rows; k++) {
      const t = k / rows;
      const el = e0 + height * t;
      const off =
        thick * (0.35 + 0.65 * ends) * Math.sqrt(Math.max(0, 1 - t ** 6));
      column.push(mesh.vertex(shellPoint(az, el, off), [0, 0, 0]));
    }
    grid.push(column);
  }
  for (let i = 0; i < cols; i++)
    for (let k = 0; k < rows + 1; k++) {
      const a = grid[i][k];
      const b = grid[i + 1][k];
      const c = grid[i + 1][k + 1];
      const d = grid[i][k + 1];
      mesh.triangle(a, b, c);
      mesh.triangle(a, c, d);
    }
  mesh.smoothNormals();
  orientOutward(mesh);
  return mesh.part(name);
}

/** Flip a part's winding if its normals point toward the head centre. */
function orientOutward(mesh: MeshBuilder, inward = false) {
  let score = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.point(mesh.indices[t + k]));
    const f = cross(sub(b, a), sub(c, a));
    score += dot(f, add(a, add(b, c)));
  }
  if (score < 0 !== inward) {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const swap = mesh.indices[t + 1];
      mesh.indices[t + 1] = mesh.indices[t + 2];
      mesh.indices[t + 2] = swap;
    }
    for (let i = 0; i < mesh.normals.length; i++) mesh.normals[i] *= -1;
  }
}

/** Padded liner: pillowed pads following the shell, thicker at the jaw. */
function padding(nu: number, nv: number): HelmetPart {
  const layout = shellLayout();
  const grid = trimmedGrid(
    nu,
    nv,
    (az, el) => insidePolygon([wrap(az), el], layout.domain),
    [layout.edge],
  );
  const depth = (az: number, el: number, edgeDistance: number) => {
    const side = Math.abs(az);
    // Channels between pads, every 26 degrees around and at set heights.
    const m = side % (26 * DEG);
    const channelAz = gauss(Math.min(m, 26 * DEG - m), 0, 2.4 * DEG);
    const channelEl = Math.max(
      ...[-32, -4, 26, 54].map((c) => gauss(el, c * DEG, 2.6 * DEG)),
    );
    let pad = 0.013 - 0.004 * Math.max(channelAz, channelEl);
    pad +=
      0.008 * gauss(side, 62 * DEG, 24 * DEG) * gauss(el, -45 * DEG, 16 * DEG);
    const taper = smoothstep(0.001, 0.016, edgeDistance);
    return SHELL_THICKNESS + 0.0012 + pad * taper;
  };
  const mesh = new MeshBuilder();
  const map = new Map<number, number>();
  const vertex = (id: number) => {
    let v = map.get(id);
    if (v === undefined) {
      const a = grid.az[id];
      const e = grid.el[id];
      v = mesh.vertex(
        shellPoint(a, e, -depth(a, e, grid.edgeDistance[id])),
        [0, 0, 0],
      );
      map.set(id, v);
    }
    return v;
  };
  const t = grid.triangles;
  // Weld the seam and the pole so normals stay smooth across them.
  const canonVertex = (id: number) => vertex(grid.canon[id]);
  for (let k = 0; k < t.length; k += 3)
    mesh.triangle(
      canonVertex(t[k]),
      canonVertex(t[k + 2]),
      canonVertex(t[k + 1]),
    );
  mesh.smoothNormals();
  orientOutward(mesh, true);
  return mesh.part("padding");
}

/** Where a facemask clip sits on the shell, and its frame. */
interface Anchor {
  point: V3;
  normal: V3;
}
function anchor(azDeg: number, elDeg: number, lift: number): Anchor {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const normal = outerNormal(az, el);
  return { point: add(outerPoint(az, el), scale(normal, lift)), normal };
}
const CLIP_LIFT = 0.0085;
const UPPER_CLIP = { az: 76, el: -6 };
const LOWER_CLIP = { az: 50, el: -41 };

/**
 * Facemask bars, right half (+z) and centre line, as curves through control
 * points laid out after the official front and side photos: a top bar under
 * the brow bumper, an eye bar across the nose bridge, so the eyes look
 * through an open window between the two (the SpeedFlex's open-eye cages),
 * evenly spaced nose and mouth bars, a chin bar, and verticals below the eye
 * bar tying them together. Rows are placed from the brow and the clip
 * anchors, so the cage follows the shell.
 */
function cageBars(): { points: V3[]; mirrored: boolean }[] {
  const up = anchor(UPPER_CLIP.az, UPPER_CLIP.el, CLIP_LIFT).point;
  const low = anchor(LOWER_CLIP.az, LOWER_CLIP.el, CLIP_LIFT).point;
  const [bx, by] = shellPoint(0, 20 * DEG);
  const mid = lerp3(up, low, 0.5);
  /** A row from the centre line out to its side end: s^1.8 sweeps it back. */
  const row = (y: number, xc: number, xSide: number, zSide: number): V3[] =>
    [0, 0.24, 0.5, 0.78, 1].map((s) => [
      xc - (xc - xSide) * s ** 1.8,
      y,
      zSide * s,
    ]);
  const eyeY = up[1] - 0.002;
  const chinY = low[1] - 0.03;
  const step = (chinY - eyeY) / 3;
  const top = row(by - 0.009, bx + 0.013, up[0] + 0.04, up[2] * 0.9);
  const eye = row(eyeY, bx + 0.042, up[0] + 0.044, up[2] * 0.93);
  const nose = row(eyeY + step, bx + 0.047, mid[0] + 0.04, mid[2] * 0.97);
  const mouth = row(eyeY + 2 * step, bx + 0.041, low[0] + 0.036, low[2] * 0.96);
  const chin = row(chinY, bx + 0.022, low[0] + 0.02, low[2] * 0.78);
  const full = (points: V3[]) => [
    ...points.map(mirrorZ).reverse(),
    ...points.slice(1),
  ];
  return [
    { points: full([...top, up]), mirrored: false },
    { points: full([...eye, up]), mirrored: false },
    { points: full(nose), mirrored: false },
    { points: full([...mouth, low]), mirrored: false },
    { points: full(chin), mirrored: false },
    // Centre vertical, eye bar to chin: nothing crosses the eye window.
    { points: [eye[0], nose[0], mouth[0], chin[0]], mirrored: false },
    // Inner verticals down to the nose bar, then a V to the chin's centre.
    { points: [eye[1], nose[1]], mirrored: true },
    {
      points: [nose[1], lerp3(mouth[0], mouth[1], 0.5), chin[0]],
      mirrored: true,
    },
    // Middle and outer verticals.
    { points: [eye[2], nose[2], mouth[2], chin[2]], mirrored: true },
    { points: [eye[4], nose[4], mouth[4], chin[4]], mirrored: true },
    // Temple connector at the window's outer edge, top bar to eye bar.
    { points: [top[4], eye[4]], mirrored: true },
    // Lower side bar from the chin bar's end back to the jaw clip.
    { points: [chin[4], low], mirrored: true },
  ];
}

function facemask(detail: HelmetDetail): HelmetPart {
  const mesh = new MeshBuilder();
  const radius = 0.0034;
  const step = DETAIL[detail].tube;
  const radial = detail === "full" ? 10 : 6;
  const joints: V3[] = [];
  for (const bar of cageBars())
    for (const points of bar.mirrored
      ? [bar.points, bar.points.map(mirrorZ)]
      : [bar.points]) {
      const curve = new CatmullRomCurve3(
        points.map((p) => new Vector3(...p)),
        false,
        "centripetal",
      );
      const segments = Math.max(4, Math.ceil(curve.getLength() / step));
      mesh.geometry(new TubeGeometry(curve, segments, radius, radial, false));
      joints.push(...points);
    }
  // Welds at every joint and rounded bar ends.
  const seen = new Set<string>();
  for (const p of joints) {
    const key = p.map((c) => c.toFixed(4)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const sphere = new SphereGeometry(
      radius * 1.12,
      radial,
      Math.max(4, radial / 2),
    );
    sphere.translate(p[0], p[1], p[2]);
    mesh.geometry(sphere);
  }
  return mesh.part("facemask");
}

/** A rounded box (superellipsoid) on a frame. */
function roundedBox(
  mesh: MeshBuilder,
  center: V3,
  axes: [V3, V3, V3],
  half: V3,
  roundness: number,
  segments: number,
) {
  const base = mesh.count;
  const f = (w: number, e: number) => Math.sign(w) * Math.abs(w) ** e;
  const rings = segments / 2;
  for (let j = 0; j <= rings; j++) {
    const v = -Math.PI / 2 + (j / rings) * Math.PI;
    for (let i = 0; i <= segments; i++) {
      const u = -Math.PI + (i / segments) * 2 * Math.PI;
      const local: V3 = [
        half[0] * f(Math.cos(v), roundness) * f(Math.cos(u), roundness),
        half[1] * f(Math.cos(v), roundness) * f(Math.sin(u), roundness),
        half[2] * f(Math.sin(v), roundness),
      ];
      const p = add(
        center,
        add(
          scale(axes[0], local[0]),
          add(scale(axes[1], local[1]), scale(axes[2], local[2])),
        ),
      );
      mesh.vertex(p, [0, 0, 0]);
    }
  }
  const cols = segments + 1;
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const a = base + j * cols + i;
      mesh.triangle(a, a + 1, a + cols + 1);
      mesh.triangle(a, a + cols + 1, a + cols);
    }
}

function frameAt(a: Anchor, along: V3): [V3, V3, V3] {
  const n = a.normal;
  const t = normalize(sub(along, scale(n, dot(along, n))));
  return [t, normalize(cross(n, t)), n];
}

function clipsAndHardware(): [HelmetPart, HelmetPart] {
  const clips = new MeshBuilder();
  const hardware = new MeshBuilder();
  const screw = (center: V3, axes: [V3, V3, V3]) =>
    roundedBox(hardware, center, axes, [0.0043, 0.0043, 0.0016], 0.6, 16);
  const bars = cageBars();
  const placements: [Anchor, V3][] = [];
  for (const [clip, bar] of [
    [UPPER_CLIP, bars[1].points],
    [LOWER_CLIP, bars[3].points],
  ] as const) {
    const right = anchor(clip.az, clip.el, 0);
    const end = bar[bar.length - 1];
    const before = bar[bar.length - 2];
    placements.push([right, sub(end, before)]);
    placements.push([
      { point: mirrorZ(right.point), normal: mirrorZ(right.normal) },
      mirrorZ(sub(end, before)),
    ]);
  }
  for (const [a, along] of placements) {
    const axes = frameAt(a, along);
    const center = add(a.point, scale(a.normal, 0.0072));
    roundedBox(clips, center, axes, [0.016, 0.0085, 0.0072], 0.3, 20);
    screw(add(a.point, scale(a.normal, 0.0148)), axes);
  }
  // Bumper screws: two on the front bumper, two on the rear.
  for (const [az, el] of [
    [16, 23.5],
    [-16, 23.5],
    [162, -57.5],
    [-162, -57.5],
  ]) {
    const a = anchor(az, el, 0.0036);
    screw(a.point, frameAt(a, [0, 1, 0]));
  }
  clips.smoothNormals();
  hardware.smoothNormals();
  orientOutward(clips);
  orientOutward(hardware);
  return [clips.part("facemask-clips"), hardware.part("hardware")];
}

/**
 * Tinted black eye shield filling the eye window behind the top and eye bars:
 * one curved front sheet, so a blended material has no back sheet to sort
 * against.
 */
function eyeShield(detail: HelmetDetail): HelmetPart {
  const bars = cageBars();
  const top = new CatmullRomCurve3(
    bars[0].points.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  const eye = new CatmullRomCurve3(
    bars[1].points.map((p) => new Vector3(...p)),
    false,
    "centripetal",
  );
  const cols = detail === "full" ? 80 : 20;
  const rows = detail === "full" ? 20 : 6;
  const inset = 0.0065;
  const mesh = new MeshBuilder();
  const ids: number[][] = [];
  for (let i = 0; i <= cols; i++) {
    const s = i / cols;
    // The bars' span inside the temple connectors.
    const u = 0.11 + 0.78 * s;
    const a = top.getPoint(u).toArray() as V3;
    const b = eye.getPoint(u).toArray() as V3;
    const column: number[] = [];
    for (let k = 0; k <= rows; k++) {
      // Past both bars so the edges tuck behind them, rounded toward the
      // temple clips.
      const t = k / rows;
      const edge = Math.abs(2 * s - 1);
      const shrink = 0.2 * smoothstep(0.84, 1, edge) ** 2;
      const tt = -0.06 + shrink + (1.12 - 2 * shrink) * t;
      const p = lerp3(a, b, tt);
      const back = normalize([p[0] - 0.02, 0, p[2]]);
      column.push(mesh.vertex(add(p, scale(back, -inset)), [0, 0, 0]));
    }
    ids.push(column);
  }
  for (let i = 0; i < cols; i++)
    for (let k = 0; k < rows; k++) {
      const [a, b, c, d] = [
        ids[i][k],
        ids[i + 1][k],
        ids[i + 1][k + 1],
        ids[i][k + 1],
      ];
      mesh.triangle(a, b, c);
      mesh.triangle(a, c, d);
    }
  mesh.smoothNormals();
  orientOutward(mesh);
  return mesh.part("eye-shield");
}

/**
 * Every part of the helmet and its livery atlas. Deterministic: the same
 * detail always gives the same bytes. "preview" is a coarse build for tests.
 */
export function buildFootballHelmet(
  detail: HelmetDetail = "full",
): HelmetAsset {
  const d = DETAIL[detail];
  const [shell, edge, panel] = shellParts(d.nu, d.nv);
  const brow = (az: number) => {
    const crossings = edgeCrossings(az).filter((e) => e > 0);
    return crossings[crossings.length - 1];
  };
  const rearEdge = (az: number) => edgeCrossings(wrap(az))[0];
  const front = bumper(
    "front-bumper",
    -25 * DEG,
    25 * DEG,
    brow,
    6.5 * DEG,
    detail === "full" ? 64 : 16,
  );
  const rear = bumper(
    "rear-bumper",
    138 * DEG,
    222 * DEG,
    rearEdge,
    16 * DEG,
    detail === "full" ? 96 : 20,
  );
  const pads = padding(d.liner[0], d.liner[1]);
  const [clips, hardware] = clipsAndHardware();
  const parts: Record<HelmetPartName, HelmetPart> = {
    shell,
    "shell-edge": edge,
    "flex-panel": panel,
    "front-bumper": front,
    "rear-bumper": rear,
    padding: pads,
    facemask: facemask(detail),
    "facemask-clips": clips,
    hardware,
    "eye-shield": eyeShield(detail),
  };
  const [atlas, surface] = paintAtlas(d.atlas, d.samples);
  return { parts: HELMET_PARTS.map((name) => parts[name]), atlas, surface };
}
