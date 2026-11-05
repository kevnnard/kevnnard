// Glass display cases: a row of three museum pedestals behind the living-room
// sofa, between its backrest and the front wall. Each dark matte plinth with a
// brass reveal carries a five-sided glass case lit by a warm micro-spot under
// its lid. Each case holds a mesh (collection-display-models T2, T4, T5): an
// original SpeedFlex-inspired football helmet built in code and painted with
// the owner's gold and black horn livery (src/lib/world/football-helmet-asset.ts,
// scripts/prepare-display-football.mjs), Pieter Ferreira's off-road helmet
// painted with a recreated Fox V1 F-A18 graphic
// (scripts/prepare-display-offroad.mjs), and makoto's Air Jordan 1 High pair
// with its own black and sail textures. They are recognizable stand-ins, not
// the owner's exact helmets or shoes. Brand names and marks belong to their
// owners; no affiliation. Night only, like
// the other night lights; each case toggles its spot on click with the shared
// lamp switch click. Pure numbers; DisplayCases.tsx renders them.

import type { Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
import { LIVING_MODELS, modelBounds } from "./living.ts";

const sofaModel = LIVING_MODELS.find((model) => model.kind === "sofa");
if (!sofaModel) throw new Error("the display cases need the living-room sofa");
const SOFA = modelBounds(sofaModel);
const SOFA_X = (SOFA.x0 + SOFA.x1) / 2;

/** Row line behind the sofa: ~0.6 m past its back, ~0.5 m off the wall. */
const ROW_Z = 0.86;
/** Centre-to-centre spacing along the sofa. */
const SPACING = 0.625;

/** Plinth, glass case, riser and light shared by every pedestal. */
export const DISPLAY_CASE = {
  plinth: { width: 0.42, depth: 0.42, height: 0.8 },
  /** Recessed toe kick so the plinth reads as floating. */
  plinthKick: { inset: 0.025, height: 0.04 },
  /** Brass reveal band just under the plinth top. */
  rim: { height: 0.014, overhang: 0.004, drop: 0.03 },
  /** Five-sided glass: four walls and a lid, open onto the plinth top. */
  glass: { width: 0.38, depth: 0.38, height: 0.42, thickness: 0.006 },
  /** Small display riser the item stands on. */
  riser: { width: 0.22, depth: 0.22, height: 0.035 },
  /** Light housing under the lid and its emissive puck. */
  housing: { width: 0.12, depth: 0.12, height: 0.016 },
  puck: { radius: 0.022, height: 0.004 },
  /** Warm museum white. */
  lightColor: "#ffe6c2",
  /** Soft, controlled spill: the item and the plinth top, not the room. */
  pointIntensity: 0.6,
  pointDistance: 0.9,
  lightDecay: 2,
  puckEmissive: 0.8,
  /** Output by day: none, the cases only light at night. */
  dayLevel: 0,
  /** On until clicked off: a lit gallery at night. */
  defaultEnabled: true,
  /**
   * Room a mesh may fill: its turned footprint stays inside this radius about
   * the case axis (clear of the glass at any yaw), and under this height.
   */
  itemFit: { radius: 0.165, height: 0.24 },
  colors: {
    plinth: "#2a2a2e",
    kick: "#16161a",
    brass: "#b89058",
    glass: "#eef6f8",
    riser: "#1c1c20",
    housing: "#1f1f23",
    puckOff: "#d4ceb8",
    puckOn: "#fff3cc",
  },
  materials: {
    plinth: { roughness: 0.85, metalness: 0.05 },
    brass: { roughness: 0.3, metalness: 0.9 },
    glass: { roughness: 0.05, metalness: 0.1, opacity: 0.22 },
  },
} as const;

export type DisplayItemId = "football-helmet" | "moto-helmet" | "jordan-1";

export type ItemFinish =
  | "gloss"
  | "metallic"
  | "matte"
  | "rubber"
  | "mirror"
  | "fabric";

export interface DisplayCasePlacement {
  id: DisplayItemId;
  /** Centre of the plinth, on the floor. */
  base: Vec3;
  /** Turn of the item about the vertical, toward the room's centre. */
  itemYaw: number;
  /** localStorage key of its spot switch. */
  storageKey: string;
}

/** The three pedestals, left to right, centred on the sofa. */
export const DISPLAY_CASES: readonly DisplayCasePlacement[] = [
  {
    id: "football-helmet",
    base: [SOFA_X - SPACING, SOFA.y0, ROW_Z],
    itemYaw: 0.35,
    storageKey: "world:display-case-football-helmet",
  },
  {
    id: "moto-helmet",
    base: [SOFA_X, SOFA.y0, ROW_Z],
    itemYaw: 0,
    storageKey: "world:display-case-moto-helmet",
  },
  {
    id: "jordan-1",
    base: [SOFA_X + SPACING, SOFA.y0, ROW_Z],
    itemYaw: -0.7,
    storageKey: "world:display-case-jordan-1",
  },
];

/** PBR per item finish. */
export const ITEM_FINISHES: Record<
  ItemFinish,
  { roughness: number; metalness: number }
> = {
  gloss: { roughness: 0.18, metalness: 0.05 },
  metallic: { roughness: 0.3, metalness: 0.75 },
  matte: { roughness: 0.7, metalness: 0 },
  rubber: { roughness: 0.85, metalness: 0 },
  mirror: { roughness: 0.08, metalness: 0.9 },
  fabric: { roughness: 0.95, metalness: 0 },
};

const HALF_PI = Math.PI / 2;

/** A shipped mesh and how it sits on the riser. */
export interface DisplayModel {
  /** Meshopt GLB under /world/models/. */
  url: string;
  /** Turn about the vertical that brings the mesh's front to -z. */
  frontYaw: number;
  /** Material overrides by mesh node name; untinted meshes keep their own. */
  tint?: Record<string, { color: string; finish: ItemFinish }>;
}

export interface DisplayItem {
  model: DisplayModel;
  note: string;
}

/** What each case shows. */
export const DISPLAY_ITEMS: Record<DisplayItemId, DisplayItem> = {
  "football-helmet": {
    model: {
      url: "/world/models/display-football-helmet.glb",
      // Facemask on the built +x.
      frontYaw: HALF_PI,
      // Painted in its own UV atlas; no runtime tint.
    },
    note: "Original SpeedFlex-inspired helmet built for this site, with a separate tinted black eye shield, a black open-eye facemask and the owner's gold and black horn livery redrawn from their photos; not an exact Riddell SpeedFlex replica and not the owner's exact Schutt, and without its eagle decal.",
  },
  "moto-helmet": {
    model: {
      url: "/world/models/display-offroad-helmet.glb",
      // Chin guard on the source +x.
      frontYaw: HALF_PI,
      // Painted in its own UV atlas; no runtime tint.
    },
    note: "Credited off-road helmet mesh painted with a recreated Fox V1 F-A18 graphic in red, black and gray; not the owner's exact Fox V1, and the sides and back are approximated.",
  },
  "jordan-1": {
    model: {
      url: "/world/models/display-jordan-1.glb",
      // Toes on the source +z.
      frontYaw: Math.PI,
    },
    note: "Air Jordan 1 High pair in black and sail; not the owner's exact Black Toe colorway.",
  },
};

/** Meshes the cases load, in case order. */
export const DISPLAY_MODEL_FILES: readonly string[] = DISPLAY_CASES.map(
  ({ id }) => DISPLAY_ITEMS[id].model.url,
);

/**
 * One uniform scale and offset for a mesh already turned by its `frontYaw`,
 * from its axis-aligned bounds: the footprint diagonal fits `itemFit.radius`
 * (so any case yaw stays clear of the glass), the height fits
 * `itemFit.height`, the footprint is centred on the case axis and the lowest
 * point rests on the riser. Never stretched per axis.
 */
export function displayModelFit(box: { min: Vec3; max: Vec3 }): {
  scale: number;
  offset: Vec3;
} {
  const { radius, height } = DISPLAY_CASE.itemFit;
  const [w, h, d] = [0, 1, 2].map((axis) => box.max[axis] - box.min[axis]);
  const scale = Math.min((2 * radius) / Math.hypot(w, d), height / h);
  return {
    scale,
    offset: [
      (-(box.min[0] + box.max[0]) / 2) * scale,
      -box.min[1] * scale,
      (-(box.min[2] + box.max[2]) / 2) * scale,
    ],
  };
}

/**
 * Whether a shipped mesh casts a shadow, from its material: a see-through
 * part (the football helmet's tinted eye shield) would cast a solid shadow,
 * so it does not. Opaque parts and blended parts with no factor alpha (the
 * textured goggle lens) still do.
 */
export function displayMeshCastsShadow(material: {
  transparent: boolean;
  opacity: number;
}): boolean {
  return !(material.transparent && material.opacity < 0.9);
}

/** World position `y` metres above a case's plinth base. */
export function displayCasePoint(item: DisplayCasePlacement, y: number): Vec3 {
  const [x, y0, z] = item.base;
  return [x, y0 + y, z];
}

/** Height of the riser top (the item's origin) above the floor. */
export const ITEM_FLOOR_Y =
  DISPLAY_CASE.plinth.height + DISPLAY_CASE.riser.height;

/** Light centre above the floor: just under the lid housing, in the glass. */
export const DISPLAY_CASE_LIGHT_Y =
  DISPLAY_CASE.plinth.height +
  DISPLAY_CASE.glass.height -
  DISPLAY_CASE.glass.thickness -
  DISPLAY_CASE.housing.height -
  0.01;

/** World position of a case's light. */
export function displayCaseLightPosition(item: DisplayCasePlacement): Vec3 {
  return displayCasePoint(item, DISPLAY_CASE_LIGHT_Y);
}

/**
 * 0-1 output of one case's spot: full at night (the NightLights gate,
 * 18:00-05:59), off by day (`dayLevel`), and zero when switched off or
 * `power` is off.
 */
export function displayCaseLevel(
  enabled: boolean,
  hours: number,
  power = true,
): number {
  if (!enabled || !power) return 0;
  return nightLightsOn(hours) ? 1 : DISPLAY_CASE.dayLevel;
}

/** Stored switch state, falling back to the on default. */
export function displayCaseStoredEnabled(value: string | null): boolean {
  return value === null ? DISPLAY_CASE.defaultEnabled : value === "true";
}
