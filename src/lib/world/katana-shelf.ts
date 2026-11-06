// Katana wall shelf (katana-wall-shelf T4): a floating, lacquered black
// board with a thin brass inlay along its front edge and two slim black
// brackets, on the interior face of the window wall (`main-right`), centred
// on the free stretch between the back corner (TV) and the window. On it
// rests Mitchell Bekke's "Blossom Katana" (Sketchfab, CC BY 4.0;
// scripts/prepare-wall-katana.mjs): a two-tier tabletop stand holding a
// drawn katana, a sheathed one and an empty scabbard, turned to face the
// room and fitted to the board's length. A slim picture light above the
// stand lights the katanas at night only, like the display cases (T14):
// always mounted, zero intensity when off; clicking the focused shelf
// toggles it. Pure numbers; KatanaShelf.tsx renders them.

import { HOUSE, type Vec3, WALLS } from "./house.ts";
import { nightLightsOn } from "./lights.ts";

const wall = WALLS.find((item) => item.id === "main-right");
if (!wall) throw new Error("the katana shelf needs the main-right wall");
const pane = wall.openings.find((opening) => opening.kind === "window");
if (!pane) throw new Error("the katana shelf needs the main-right window");

/** The wall's room-side face (x): the shelf's back. */
export const SHELF_INTERIOR_X = wall.at - (wall.side * HOUSE.wall) / 2;

/** Blossom Katana's own bounds (glTF axes, source units), measured in Blender. */
export const KATANA_SOURCE_BOX = {
  min: [-2.9646, 0, -0.581] as Vec3,
  max: [3.0142, 2.5054, 0.5518] as Vec3,
};

/** The shipped stand and how it sits on the board. */
export const KATANA_MODEL = {
  url: "/world/models/wall-katana.glb",
  /**
   * Turn about +y that brings the stand's front (+z in the source) to face
   * the room (-x); the hilts then point to the back corner, the tips to the
   * window, as in the author's front view.
   */
  frontYaw: -Math.PI / 2,
  /** Tip to pommel along the shelf, metres. */
  length: 1.2,
  /** Gap between the stand's back and the wall. */
  backGap: 0.02,
} as const;

const SOURCE_LENGTH = KATANA_SOURCE_BOX.max[0] - KATANA_SOURCE_BOX.min[0];
/** The fitted stand's height above the board. */
export const KATANA_HEIGHT =
  ((KATANA_SOURCE_BOX.max[1] - KATANA_SOURCE_BOX.min[1]) *
    KATANA_MODEL.length) /
  SOURCE_LENGTH;
const KATANA_DEPTH =
  ((KATANA_SOURCE_BOX.max[2] - KATANA_SOURCE_BOX.min[2]) *
    KATANA_MODEL.length) /
  SOURCE_LENGTH;

export const KATANA_SHELF = {
  wall: wall.id,
  /** Middle of the free stretch: back wall's inner face to the window. */
  centreZ: (wall.from + pane.u0) / 2,
  /** Board top, world y: 1.18 m above the floor, the katanas' middle a little under eye height (S4). */
  topY: HOUSE.floorY + 1.18,
  length: 1.3,
  depth: 0.28,
  thickness: 0.04,
  /** Brass inlay on the board's front edge. */
  inlay: { height: 0.006, depth: 0.003 },
  /**
   * Two black steel brackets, `inset` in from each end: a wall plate
   * reaching `height` below the board top and an arm under the board.
   */
  bracket: {
    inset: 0.2,
    height: 0.17,
    width: 0.028,
    plate: 0.01,
    arm: 0.012,
    armDepth: 0.22,
  },
  /** Slim picture light over the stand. */
  light: {
    /** Bar length along the wall and its radius. */
    barLength: 0.42,
    barRadius: 0.014,
    /** Bar this far out from the wall and above the katanas' middle. */
    out: 0.22,
    rise: 0.32,
    armRadius: 0.004,
    color: "#ffe6c2",
    /** Soft: ~19 lx at the katanas' middle, 0.33 m away. */
    intensity: 2,
    /** Wide enough to reach the hilts and the tips, softly. */
    angle: 1.1,
    penumbra: 0.8,
    distance: 1.4,
    decay: 2,
    emissive: 1.2,
    defaultEnabled: true,
    storageKey: "world:katana-light",
  },
  colors: {
    board: "#141214",
    brass: "#b89058",
    bracket: "#1a1a1d",
    housing: "#1f1f23",
    glowOff: "#d4ceb8",
    glowOn: "#fff3cc",
  },
  materials: {
    /** Lacquer: dark, with a soft sheen. */
    board: { roughness: 0.32, metalness: 0.05 },
    brass: { roughness: 0.3, metalness: 0.9 },
    bracket: { roughness: 0.5, metalness: 0.6 },
  },
} as const;

if (KATANA_DEPTH + KATANA_MODEL.backGap > KATANA_SHELF.depth)
  throw new Error("the katana stand must fit on the board");

/** The katanas' middle, world: the inspection camera's and the light's aim. */
export const KATANA_CENTRE: Vec3 = [
  SHELF_INTERIOR_X - KATANA_MODEL.backGap - KATANA_DEPTH / 2,
  KATANA_SHELF.topY + KATANA_HEIGHT / 2,
  KATANA_SHELF.centreZ,
];

/** World position of the picture light's spot. */
export const KATANA_LIGHT_POSITION: Vec3 = [
  SHELF_INTERIOR_X - KATANA_SHELF.light.out,
  KATANA_CENTRE[1] + KATANA_SHELF.light.rise,
  KATANA_SHELF.centreZ,
];

export const KATANA_LIGHT_AIM: Vec3 = KATANA_CENTRE;

/** Click target around the brackets, board, stand and light. */
export const KATANA_SHELF_HITBOX = (() => {
  const y0 = KATANA_SHELF.topY - KATANA_SHELF.bracket.height;
  const y1 = KATANA_LIGHT_POSITION[1] + KATANA_SHELF.light.barRadius;
  return {
    center: [
      SHELF_INTERIOR_X - KATANA_SHELF.depth / 2,
      (y0 + y1) / 2,
      KATANA_SHELF.centreZ,
    ] as Vec3,
    size: [KATANA_SHELF.depth, y1 - y0, KATANA_SHELF.length] as Vec3,
  };
})();

/**
 * One uniform scale and offset for the stand already turned by its
 * `frontYaw`, in the shelf's frame (origin on the wall face, at the board
 * top, mid-length): its length along the wall fits `KATANA_MODEL.length`,
 * it is centred along the shelf, its back sits `backGap` off the wall and
 * its lowest point rests on the board.
 */
export function katanaModelFit(box: { min: Vec3; max: Vec3 }): {
  scale: number;
  offset: Vec3;
} {
  const scale = KATANA_MODEL.length / (box.max[2] - box.min[2]);
  return {
    scale,
    offset: [
      -box.max[0] * scale - KATANA_MODEL.backGap,
      -box.min[1] * scale,
      (-(box.min[2] + box.max[2]) / 2) * scale,
    ],
  };
}

/**
 * 0-1 output of the picture light: full at night (the NightLights gate),
 * none by day, and zero when switched off or `power` is off.
 */
export function katanaLightLevel(
  enabled: boolean,
  hours: number,
  power = true,
): number {
  if (!enabled || !power) return 0;
  return nightLightsOn(hours) ? 1 : 0;
}

/**
 * The inspection eye, from the katanas' middle (katana-wall-shelf T5): in
 * the room, a little toward the sofa, level with the stand, far enough that
 * the whole stand fits left of the story card.
 */
export const KATANA_EYE_OFFSET: Vec3 = [-2.3, 0.04, 0.35];
