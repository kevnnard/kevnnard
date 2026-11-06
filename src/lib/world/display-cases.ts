// Glass display cases: a row of three museum pedestals behind the living-room
// sofa, between its backrest and the front wall. Each dark matte plinth with a
// brass reveal carries a five-sided glass case lit by a warm micro-spot under
// its lid. Each case holds a mesh (collection-display-models T2, T7, T15):
// Exodusks' Riddell SpeedFlex repainted with the owner's gold and black
// Rams-style horn livery (scripts/prepare-display-football.mjs and .py),
// senoaji's Fox X Supreme helmet textured with a projection bake of Fox V1
// Sayak product photos (scripts/prepare-display-offroad-fox.mjs and .py),
// and makoto's Air Jordan 1 High pair
// with its own black and sail textures. They are recognizable stand-ins, not
// the owner's exact helmets or shoes. Brand names and marks belong to their
// owners; no affiliation. Night only, like
// the other night lights, each case is lit like a museum case (T14): a key
// spot from the front of the lid aimed at the item, a weak warm uplight and
// an LED line on the riser's front edge, and case-local reflections on the
// item; each case toggles them on click with the shared lamp switch click.
// Pure numbers; DisplayCases.tsx renders them.

import type { Vec3 } from "./house.ts";
import { nightLightsOn } from "./lights.ts";
import { LIVING_MODELS, modelBounds } from "./living.ts";
import { environmentIntensity } from "./palette.ts";

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
  /**
   * Key spot (T14), 0.26 m from the item centre: ~23 lx there, 1.7x the old
   * lid point's 14, and ~43 at the item's top, under that point's hot 47.
   */
  spotIntensity: 1.6,
  /**
   * Half-angle: the item's radius needs 0.57 rad; the soft edge needs more,
   * and the cone already reaches past the glass on the plinth top.
   */
  spotAngle: 0.8,
  /** Soft edge: the item's rim still gets about a third of the centre. */
  spotPenumbra: 0.8,
  /** Range past the plinth top, so its window barely dims the item. */
  spotDistance: 0.7,
  /** Spot head: this far under the lid and behind the front glass. */
  spotDrop: 0.025,
  spotInset: 0.035,
  /** Warm fill from the riser's front edge: ~11% of the key at the centre. */
  upIntensity: 0.12,
  upDistance: 0.45,
  /** Uplight this far in front of the riser face, at its mid-height. */
  upInset: 0.02,
  lightDecay: 2,
  puckEmissive: 0.8,
  /** LED line on the riser's front edge and its glow at full level. */
  strip: { height: 0.004, depth: 0.004 },
  stripEmissive: 1.2,
  /**
   * Reflection strength on a lit case's item at night: the scene's
   * environment is nearly off then (0.01), which leaves metals black.
   */
  envBoost: 0.5,
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

/**
 * Everything the gallery inspects: the three cases, the katanas on the
 * wall shelf (katana-wall-shelf T5, src/lib/world/katana-shelf.ts) and the
 * personal collection shelf (T15, src/lib/world/shelf.ts).
 */
export type GalleryItemId = DisplayItemId | "katana" | "collection-shelf";

/**
 * The collection rail's order and numbering (katana-wall-shelf T14): the
 * room's order, from the katanas on the window wall through the cases (as
 * seen from the room, right to left in world x) to the collection shelf.
 */
export const GALLERY_ORDER: readonly GalleryItemId[] = [
  "katana",
  "jordan-1",
  "moto-helmet",
  "football-helmet",
  "collection-shelf",
];

/**
 * Things outside the collection the inspection camera frames too, so never
 * on its rail: the desk things (keyboard-card T1), Cherry in the yard
 * (dog-rig T3) and the garden sign (garden-sign T2).
 */
export type DeskItemId = "keyboard" | "coffee" | "cherry" | "sign";

/** Anything the inspection camera can frame: the gallery or the desk. */
export type InspectItemId = GalleryItemId | DeskItemId;

/** Whether an inspected item is one of the desk things, Cherry or the sign. */
export function isDeskItemId(id: InspectItemId): id is DeskItemId {
  return (
    id === "keyboard" || id === "coffee" || id === "cherry" || id === "sign"
  );
}

/** Whether an inspected item is one of the glass cases. */
export function isDisplayCaseId(id: InspectItemId): id is DisplayItemId {
  return id !== "katana" && id !== "collection-shelf" && !isDeskItemId(id);
}

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
      // Facemask on the derived +x.
      frontYaw: HALF_PI,
      // Painted in its own UV atlas; no runtime tint.
    },
    note: "Exodusks' Riddell SpeedFlex (Sketchfab, CC BY 4.0) repainted for this site in the owner's colors: a metallic gold shell with wide black Rams-style horns, a small #32 on the back, a black facemask and a separate smoked black eye shield; not the owner's exact helmet, and no NFL or team logo.",
  },
  "moto-helmet": {
    model: {
      url: "/world/models/display-offroad-helmet.glb",
      // Chin bar on the derived +x.
      frontYaw: HALF_PI,
      // Painted in its own UV atlas; no runtime tint.
    },
    note: "senoaji's \"Fox X Supreme Helmet\" (Sketchfab, CC BY 4.0) without its goggles, textured for this site with a projection bake of five Fox V1 Sayak (2018, red) product photos, Fox marks included by the owner's choice; the mesh is not Fox's V1 shell, so it is not the owner's exact helmet. Fox and V1 belong to Fox Racing; no affiliation.",
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
 * Turntable while a case is inspected (collection-display-models T8): one
 * steady turn per `period` seconds about the case axis; once inspection ends,
 * the mesh eases back to the front at `settle` per second.
 */
export const DISPLAY_TURN = { period: 20, settle: 3 } as const;

const FULL_TURN = 2 * Math.PI;

/**
 * The next yaw after `dt` seconds, in [0, 2pi): advancing while `turning`,
 * otherwise settling on the nearer front (0 or a full turn) and snapping to
 * exactly 0 once within a milliradian, so the frame loop can stop.
 */
export function displayTurnStep(
  yaw: number,
  dt: number,
  turning: boolean,
): number {
  if (turning)
    return (yaw + (FULL_TURN * dt) / DISPLAY_TURN.period) % FULL_TURN;
  const front = yaw > Math.PI ? FULL_TURN : 0;
  const next = front + (yaw - front) * Math.exp(-DISPLAY_TURN.settle * dt);
  return Math.abs(next - front) < 1e-3 ? 0 : next;
}

/**
 * Lift while a case is inspected (T9): the mesh rises `height` metres off the
 * riser, easing at `rate` per second, and settles back down afterwards.
 */
export const DISPLAY_LIFT = { height: 0.05, rate: 4 } as const;

/**
 * The next lift after `dt` seconds, easing toward `height` while `lifted`
 * and toward 0 otherwise, snapping onto the rest height within half a
 * millimetre so the frame loop can stop.
 */
export function displayLiftStep(
  lift: number,
  dt: number,
  lifted: boolean,
): number {
  const target = lifted ? DISPLAY_LIFT.height : 0;
  const next = target + (lift - target) * Math.exp(-DISPLAY_LIFT.rate * dt);
  return Math.abs(next - target) < 5e-4 ? target : next;
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

/** Lid fixture's puck above the floor: just under the housing, in the glass. */
export const DISPLAY_CASE_LIGHT_Y =
  DISPLAY_CASE.plinth.height +
  DISPLAY_CASE.glass.height -
  DISPLAY_CASE.glass.thickness -
  DISPLAY_CASE.housing.height -
  0.01;

/** World position of a case's lid fixture. */
export function displayCaseLightPosition(item: DisplayCasePlacement): Vec3 {
  return displayCasePoint(item, DISPLAY_CASE_LIGHT_Y);
}

/**
 * Case-local point the key spot aims at: the item centre, halfway between
 * its rest on the riser and its inspection lift.
 */
export const DISPLAY_CASE_AIM: Vec3 = [
  0,
  ITEM_FLOOR_Y + DISPLAY_CASE.itemFit.height / 2 + DISPLAY_LIFT.height / 2,
  0,
];

/**
 * Case-local key spot: under the lid, behind the front glass (front is -z,
 * toward the room and the inspection camera), so it lights the item's face.
 */
export const DISPLAY_CASE_SPOT_POSITION: Vec3 = [
  0,
  DISPLAY_CASE.plinth.height +
    DISPLAY_CASE.glass.height -
    DISPLAY_CASE.glass.thickness -
    DISPLAY_CASE.spotDrop,
  -(
    DISPLAY_CASE.glass.depth / 2 -
    DISPLAY_CASE.glass.thickness -
    DISPLAY_CASE.spotInset
  ),
];

/** Case-local fill uplight: in front of the riser, below the item. */
export const DISPLAY_CASE_UPLIGHT_POSITION: Vec3 = [
  0,
  DISPLAY_CASE.plinth.height + DISPLAY_CASE.riser.height / 2,
  -(DISPLAY_CASE.riser.depth / 2 + DISPLAY_CASE.upInset),
];

/**
 * Reflection strength for a case's item: the scene's own by day, so nothing
 * changes; at night a lit case keeps `level * envBoost` of it, never below
 * the scene's.
 */
export function displayCaseEnvIntensity(level: number, hours: number): number {
  const scene = environmentIntensity(hours);
  if (!nightLightsOn(hours)) return scene;
  return Math.min(1, Math.max(scene, level * DISPLAY_CASE.envBoost));
}

/**
 * 0-1 output of one case's lights: full at night (the NightLights gate,
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
