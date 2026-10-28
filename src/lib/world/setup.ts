// Original procedural gaming setup (T4d, S8), the main room's centerpiece:
// a white-top desk on a black frame with a cable tray, a wide and a side
// monitor, keyboard, mouse on a pad, a glass-sided PC with a subtle RGB
// strip, two speakers and a black and white gaming chair pulled out. It backs
// onto the main room's left wall, which has no openings and faces the home
// camera from inside. Pure numbers; Setup.tsx merges the solid parts into one
// mesh per material (T4g, S11), plus glow (screens and RGB) and glass.

import { HOUSE, type Part, type Rect, type Vec3, WALLS } from "./house.ts";
import type { NormalPattern } from "./normals.ts";
import { worldLight } from "./palette.ts";
import type { Surface } from "./textures.ts";

export const SETUP_COLORS = {
  deskTop: "#f7f3ee",
  frame: "#2b2a30",
  tray: "#3a3940",
  cable: "#4a4852",
  bezel: "#26252b",
  keys: "#f3eee8",
  pad: "#34323a",
  tower: "#2e2d34",
  inner: "#45434c",
  speaker: "#3a3840",
  cone: "#55535c",
  chair: "#2f2e35",
  chairWhite: "#f3eee8",
  trim: "#efe8de",
  grille: "#3a3942",
  glass: "#bcd3e6",
  screen: "#76c3f2",
  horizon: "#8fe0b8",
  sun: "#ffe1a1",
  hud: "#ffffff",
  side: "#c5b4f0",
  rgb: "#b48cff",
  rgbCool: "#7fd8ff",
  rgbWarm: "#ff9ad5",
} as const;

const M = HOUSE.main;
const W = HOUSE.wall;

/** Inside faces of the main room's walls. */
export const MAIN_ROOM: Rect = {
  x0: M.x0 + W,
  x1: M.x1 - W,
  z0: M.z0 + W,
  z1: M.z1 - W,
};

const door = WALLS.find((wall) => wall.id === "main-front")?.openings.find(
  (opening) => opening.kind === "door",
);
if (!door) throw new Error("main-front needs a door");

/** Floor area the front door sweeps as it swings inward. */
export const DOOR_SWING: Rect = {
  x0: door.u0,
  x1: door.u1,
  z0: MAIN_ROOM.z1 - (door.u1 - door.u0),
  z1: MAIN_ROOM.z1,
};

/** Top of the floor boards. */
const Y0 = HOUSE.floorY + 0.04;
/** Desk frame: `d` meters out from the left wall (world +x), `u` along it (world z). */
const IN = MAIN_ROOM.x0;
const w = (d: number, y: number, u: number): Vec3 => [IN + d, Y0 + y, u];

const DESK = { u0: -2.3, u1: -0.3, d0: 0.03, depth: 0.72, height: 0.76 };
const CHAIR = { d: 1.12, u: -1.42, yaw: 0.22, tilt: 0.14 };
const SIDE_YAW = 0.35;
const SPEAKERS = [-2.12, -0.4] as const;
const SPEAKER_Y = 0.1;
const KEY_ROWS = [0.505, 0.54, 0.575, 0.61] as const;
const KEYBOARD_U = -1.45;

const frac = (x: number) => x - Math.floor(x);
/** UV offset that centres one `tile` repeat on `at` (box UVs are metres). */
const centre = (
  tile: readonly [number, number],
  at: readonly [number, number],
) => [0.5 - frac(at[0] / tile[0]), 0.5 - frac(at[1] / tile[1])] as const;
// Fifteen cone-map repeats between the two speakers, so both cones (and their
// tweeters) sit on a ring centre. Front faces project to (z, y).
const CONE_TILE = (SPEAKERS[1] - SPEAKERS[0]) / 15;
// One keycap repeat per key: row pitch across x, key pitch along z. Up faces
// project to (x, -z).
const KEY_TILE = [KEY_ROWS[1] - KEY_ROWS[0], 0.019] as const;

export interface SetupMaterial {
  roughness: number;
  metalness: number;
  /** Clear lacquer layer (physical material) for the laminate top. */
  clearcoat?: number;
  /** StylizedTextures surface (color, normal, roughness, opacity maps). */
  surface?: Surface;
  /** Original procedural normal map (src/lib/world/normals.ts). */
  normal?: NormalPattern;
  normalScale?: number;
  /** Metres covered by one repeat of the procedural map, along u and v. */
  tile?: readonly [number, number];
  offset?: readonly [number, number];
}

/** PBR per setup material: one merged draw each. */
export const SETUP_MATERIALS = {
  /** White matte laminate desk top, lightly lacquered. */
  laminate: {
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.2,
    normal: "noise",
    normalScale: 0.04,
    tile: [0.6, 0.6],
  },
  /** Black powder-coated steel: desk frame, legs, tray, chair column. */
  powder: {
    roughness: 0.45,
    metalness: 0.35,
    normal: "noise",
    normalScale: 0.12,
    tile: [0.08, 0.08],
  },
  /** Satin plastic: monitor bezels, keyboard case, speaker cabinets, mouse. */
  satin: {
    roughness: 0.5,
    metalness: 0,
    normal: "noise",
    normalScale: 0.05,
    tile: [0.3, 0.3],
  },
  keycap: {
    roughness: 0.55,
    metalness: 0,
    normal: "keycap",
    normalScale: 0.9,
    tile: KEY_TILE,
    offset: centre(KEY_TILE, [IN + KEY_ROWS[0], -KEYBOARD_U]),
  },
  /** Speaker cones: concentric ripples centred on each driver. */
  cone: {
    roughness: 0.7,
    metalness: 0,
    normal: "radial",
    normalScale: 0.35,
    tile: [CONE_TILE, CONE_TILE],
    offset: centre(
      [CONE_TILE, CONE_TILE],
      [SPEAKERS[0], Y0 + DESK.height + SPEAKER_Y],
    ),
  },
  /** Mousepad cloth. */
  fabric: {
    roughness: 0.95,
    metalness: 0,
    normal: "weave",
    normalScale: 0.6,
    tile: [0.02, 0.02],
  },
  /** Matte plastic: chair star base, casters, armrests, feet, cables. */
  base: { roughness: 0.85, metalness: 0 },
  grille: { roughness: 0.5, metalness: 0.5, surface: "grille" },
  panel: { roughness: 0.55, metalness: 0.3, surface: "panel" },
  /** Chair upholstery, and its white trim (tinted vertex color). */
  leather: { roughness: 0.75, metalness: 0, surface: "leather" },
} as const satisfies Record<string, SetupMaterial>;

export type SetupMaterialId = keyof typeof SETUP_MATERIALS;
export type SetupPart = Part & {
  material: SetupMaterialId;
  /** Chair rig (T4i): "swivel" turns with the seat, "chair" is its fixed base. */
  rig?: "swivel" | "chair";
  /** Breathing LED phase index (T4i), glow parts only. */
  led?: number;
};

const part = (
  material: SetupMaterialId,
  shape: Part["shape"],
  center: Vec3,
  size: Vec3,
  color: string,
  rotation?: Vec3,
  shade = 1,
): SetupPart => ({
  material,
  shape,
  center,
  size,
  color,
  shade,
  ...(rotation && { rotation }),
});

/** Bevelled box with `radius` metre edges (T4h): softer silhouettes. */
const rounded = (
  material: SetupMaterialId,
  radius: number,
  center: Vec3,
  size: Vec3,
  color: string,
  rotation?: Vec3,
  shade = 1,
): SetupPart => ({
  ...part(material, "rounded", center, size, color, rotation, shade),
  radius,
});

/** Sides of the setup's cylinders: smooth knobs, casters and cones. */
export const SETUP_ROUND_SEGMENTS = 16;

/** Axis of a "round" part laid along world z. */
const ALONG_Z: Vec3 = [Math.PI / 2, 0, 0];
/** Axis of a "round" part laid along world x. */
const ALONG_X: Vec3 = [0, 0, Math.PI / 2];

export interface SetupMeshes {
  solid: SetupPart[];
  glow: SetupPart[];
  glass: SetupPart[];
}

function desk(solid: SetupPart[]) {
  const { u0, u1, d0, depth, height } = DESK;
  const C = SETUP_COLORS;
  const uc = (u0 + u1) / 2;
  const du = u1 - u0;
  const front = d0 + depth;
  const top = 0.05;
  solid.push(
    rounded(
      "laminate",
      0.015,
      w((d0 + front) / 2 - 0.0125, height - top / 2, uc),
      [depth - 0.025, top, du],
      C.deskTop,
    ),
    // Chunky rounded front edge, and a black lip under it.
    part(
      "laminate",
      "round",
      w(front - 0.025, height - top / 2, uc),
      [0.05, du, 0.05],
      C.deskTop,
      ALONG_Z,
      0.97,
    ),
    part(
      "powder",
      "box",
      w(front - 0.04, height - top - 0.015, uc),
      [0.04, 0.03, du - 0.1],
      C.frame,
    ),
    part(
      "powder",
      "box",
      w(0.2, height - top - 0.06, uc),
      [0.05, 0.06, du - 0.14],
      C.frame,
    ),
    // Cable tray with its lips and a bundle of cables.
    part("powder", "box", w(0.17, 0.6, uc), [0.18, 0.02, 1.4], C.tray),
    part("powder", "box", w(0.08, 0.63, uc), [0.02, 0.06, 1.4], C.tray),
    part("powder", "box", w(0.26, 0.63, uc), [0.02, 0.06, 1.4], C.tray),
    part(
      "base",
      "round",
      w(0.17, 0.625, uc),
      [0.03, 1.3, 0.03],
      C.cable,
      ALONG_Z,
    ),
  );
  for (const u of [u0 + 0.07, u1 - 0.07])
    solid.push(
      part("powder", "box", w(0.39, 0.035, u), [0.66, 0.06, 0.08], C.frame),
      part(
        "powder",
        "box",
        w(0.39, (0.06 + height - top) / 2, u),
        [0.08, height - top - 0.06, 0.08],
        C.frame,
      ),
      part(
        "powder",
        "box",
        w(0.39, height - top - 0.02, u),
        [0.62, 0.04, 0.06],
        C.frame,
      ),
      part(
        "base",
        "round",
        w(0.1, 0.012, u),
        [0.08, 0.024, 0.08],
        C.frame,
        undefined,
        0.85,
      ),
      part(
        "base",
        "round",
        w(0.68, 0.012, u),
        [0.08, 0.024, 0.08],
        C.frame,
        undefined,
        0.85,
      ),
    );
}

function monitors(solid: SetupPart[], glow: SetupPart[]) {
  const C = SETUP_COLORS;
  const top = DESK.height;
  // Wide main monitor, centered on the keyboard.
  const u = -1.45;
  solid.push(
    rounded("satin", 0.008, w(0.2, top + 0.01, u), [0.2, 0.02, 0.26], C.bezel),
    rounded(
      "satin",
      0.015,
      w(0.17, top + 0.19, u),
      [0.05, 0.36, 0.07],
      C.bezel,
    ),
    rounded("satin", 0.02, w(0.21, 1.08, u), [0.08, 0.08, 0.1], C.bezel),
    rounded(
      "satin",
      0.015,
      w(0.225, 1.1, u),
      [0.04, 0.24, 0.5],
      C.bezel,
      undefined,
      0.9,
    ),
    rounded("satin", 0.018, w(0.26, 1.11, u), [0.045, 0.4, 0.94], C.bezel),
  );
  glow.push(
    part("satin", "box", w(0.286, 1.115, u), [0.006, 0.35, 0.88], C.screen),
    part("satin", "box", w(0.2905, 1.03, u), [0.003, 0.1, 0.88], C.horizon),
    part("satin", "box", w(0.2905, 1.19, u - 0.22), [0.003, 0.07, 0.07], C.sun),
    part(
      "satin",
      "box",
      w(0.2905, 1.265, u + 0.25),
      [0.003, 0.022, 0.25],
      C.hud,
      undefined,
      0.95,
    ),
  );
  // Side monitor angled in toward the chair.
  const yaw = SIDE_YAW;
  const s = -0.74;
  const rot: Vec3 = [0, yaw, 0];
  const n: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const t: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const panel = w(0.27, 1.1, s);
  const on = (out: number, along: number, up: number): Vec3 => [
    panel[0] + n[0] * out + t[0] * along,
    panel[1] + up,
    panel[2] + n[2] * out + t[2] * along,
  ];
  solid.push(
    rounded(
      "satin",
      0.008,
      w(0.22, top + 0.01, s),
      [0.18, 0.02, 0.2],
      C.bezel,
      rot,
    ),
    rounded(
      "satin",
      0.015,
      w(0.21, top + 0.17, s),
      [0.04, 0.3, 0.06],
      C.bezel,
      rot,
    ),
    rounded("satin", 0.016, panel, [0.04, 0.32, 0.52], C.bezel, rot),
  );
  glow.push(
    part("satin", "box", on(0.024, 0, 0), [0.006, 0.28, 0.48], C.side, rot),
  );
  for (const [i, up] of [0.08, 0.035, -0.01, -0.055].entries())
    glow.push(
      part(
        "satin",
        "box",
        on(0.0285, -0.05 - i * 0.02, up),
        [0.003, 0.02, 0.3 - i * 0.04],
        C.hud,
        rot,
        0.92,
      ),
    );
}

function deskTop(solid: SetupPart[], glow: SetupPart[]) {
  const C = SETUP_COLORS;
  const top = DESK.height;
  // Keyboard: black case, white key rows, a thin RGB underglow.
  solid.push(
    rounded(
      "satin",
      0.008,
      w(0.56, top + 0.0125, KEYBOARD_U),
      [0.16, 0.025, 0.46],
      C.frame,
    ),
  );
  for (const [i, d] of KEY_ROWS.entries())
    solid.push(
      rounded(
        "keycap",
        0.004,
        w(d, top + 0.031, KEYBOARD_U + (i === 3 ? 0.02 : 0)),
        [0.028, 0.012, i === 3 ? 0.24 : 0.42],
        C.keys,
      ),
    );
  glow.push({
    ...part(
      "satin",
      "box",
      w(0.643, top + 0.006, KEYBOARD_U),
      [0.006, 0.008, 0.44],
      C.rgb,
    ),
    led: 0,
  });
  // Mouse on its pad.
  solid.push(
    part(
      "fabric",
      "box",
      w(0.52, top + 0.003, -0.95),
      [0.3, 0.006, 0.32],
      C.pad,
    ),
    part(
      "satin",
      "round",
      w(0.54, top + 0.021, -0.95),
      [0.1, 0.03, 0.065],
      C.keys,
    ),
    part(
      "base",
      "box",
      w(0.508, top + 0.038, -0.95),
      [0.02, 0.008, 0.012],
      C.frame,
    ),
  );
  // Speakers flanking the monitors: woofer, tweeter, white rings, and a
  // perforated mesh grille in front of them.
  for (const u of SPEAKERS)
    solid.push(
      rounded(
        "satin",
        0.004,
        w(0.2, top + 0.005, u),
        [0.18, 0.01, 0.14],
        C.frame,
      ),
      rounded(
        "satin",
        0.02,
        w(0.2, top + 0.15, u),
        [0.2, 0.28, 0.16],
        C.speaker,
      ),
      part(
        "satin",
        "round",
        w(0.301, top + SPEAKER_Y, u),
        [0.13, 0.008, 0.13],
        C.chairWhite,
        ALONG_X,
      ),
      part(
        "cone",
        "round",
        w(0.304, top + SPEAKER_Y, u),
        [0.11, 0.012, 0.11],
        C.cone,
        ALONG_X,
      ),
      part(
        "cone",
        "round",
        w(0.31, top + SPEAKER_Y, u),
        [0.04, 0.012, 0.04],
        C.cone,
        ALONG_X,
        1.25,
      ),
      part(
        "satin",
        "round",
        w(0.303, top + 0.225, u),
        [0.05, 0.01, 0.05],
        C.chairWhite,
        ALONG_X,
      ),
      part(
        "grille",
        "box",
        w(0.32, top + 0.15, u),
        [0.004, 0.26, 0.15],
        C.grille,
      ),
    );
}

function tower(solid: SetupPart[], glow: SetupPart[], glass: SetupPart[]) {
  const C = SETUP_COLORS;
  // On the floor under the desk's far end; the glass side faces +z.
  const u = -2.07;
  const face = u + 0.1;
  solid.push(
    rounded("panel", 0.02, w(0.33, 0.27, u), [0.44, 0.48, 0.2], C.tower),
    part("satin", "box", w(0.33, 0.3, face + 0.01), [0.3, 0.06, 0.02], C.inner),
    part(
      "satin",
      "round",
      w(0.4, 0.4, face + 0.008),
      [0.1, 0.016, 0.1],
      C.cone,
      ALONG_Z,
    ),
    part(
      "panel",
      "box",
      w(0.33, 0.502, face + 0.01),
      [0.44, 0.02, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
    part(
      "panel",
      "box",
      w(0.33, 0.04, face + 0.01),
      [0.44, 0.02, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
    part(
      "panel",
      "box",
      w(0.12, 0.27, face + 0.01),
      [0.02, 0.48, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
    part(
      "panel",
      "box",
      w(0.54, 0.27, face + 0.01),
      [0.02, 0.48, 0.02],
      C.tower,
      undefined,
      0.9,
    ),
  );
  for (const d of [0.14, 0.52])
    for (const z of [u - 0.07, u + 0.07])
      solid.push(
        part("base", "round", w(d, 0.0125, z), [0.04, 0.025, 0.04], C.frame),
      );
  glow.push(
    {
      ...part("satin", "box", w(0.553, 0.27, u), [0.006, 0.36, 0.025], C.rgb),
      led: 1,
    },
    {
      ...part(
        "satin",
        "box",
        w(0.33, 0.475, face + 0.004),
        [0.36, 0.012, 0.008],
        C.rgbCool,
      ),
      led: 2,
    },
    {
      ...part(
        "satin",
        "round",
        w(0.48, 0.2, face + 0.004),
        [0.08, 0.006, 0.08],
        C.rgbWarm,
        ALONG_Z,
      ),
      led: 3,
    },
  );
  glass.push(
    part(
      "satin",
      "box",
      w(0.33, 0.27, face + 0.022),
      [0.4, 0.44, 0.004],
      C.glass,
    ),
  );
}

function chair(solid: SetupPart[]) {
  const first = solid.length;
  const C = SETUP_COLORS;
  const { yaw, tilt } = CHAIR;
  const [px, , pz] = w(CHAIR.d, 0, CHAIR.u);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Chair frame: +x is behind the seat, away from the desk.
  const c = (lx: number, ly: number, lz: number): Vec3 => [
    px + lx * cos + lz * sin,
    Y0 + ly,
    pz - lx * sin + lz * cos,
  ];
  const turn: Vec3 = [0, yaw, 0];
  const side: Vec3 = [0, yaw + Math.PI / 2, Math.PI / 2];
  const lean: Vec3 = [0, yaw, -tilt];
  // A point on the reclined back: `h` up it, `o` out of its front face.
  const back = (h: number, o: number, lz: number) =>
    c(
      0.22 + h * Math.sin(tilt) - o * Math.cos(tilt),
      0.52 + h * Math.cos(tilt) + o * Math.sin(tilt),
      lz,
    );
  for (let k = 0; k < 5; k++) {
    const a = yaw + (k * 2 * Math.PI) / 5;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    solid.push(
      part(
        "base",
        "box",
        [px + 0.15 * dx, Y0 + 0.07, pz + 0.15 * dz],
        [0.3, 0.05, 0.06],
        C.chair,
        [0, -a, 0],
      ),
      part(
        "base",
        "round",
        [px + 0.29 * dx, Y0 + 0.03, pz + 0.29 * dz],
        [0.06, 0.04, 0.06],
        C.frame,
        ALONG_Z,
        0.8,
      ),
    );
  }
  solid.push(
    part("base", "round", c(0, 0.08, 0), [0.12, 0.06, 0.12], C.chair),
    part("powder", "round", c(0, 0.26, 0), [0.05, 0.3, 0.05], C.cone),
    part("base", "round", c(0, 0.18, 0), [0.07, 0.12, 0.07], C.chair),
  );
  // Star base and gas column stay; everything above swivels (T4i).
  const top = solid.length;
  solid.push(
    part("powder", "box", c(0, 0.42, 0), [0.3, 0.04, 0.3], C.frame, turn),
    rounded("leather", 0.045, c(0, 0.48, 0), [0.52, 0.1, 0.5], C.chair, turn),
    part(
      "leather",
      "round",
      c(-0.25, 0.49, 0),
      [0.1, 0.48, 0.1],
      C.chair,
      side,
      1.08,
    ),
    part("powder", "box", c(0.2, 0.5, 0), [0.06, 0.1, 0.18], C.frame, turn),
    rounded("leather", 0.045, back(0.4, 0, 0), [0.1, 0.8, 0.48], C.chair, lean),
    part(
      "leather",
      "box",
      back(0.4, 0.052, 0),
      [0.01, 0.5, 0.08],
      C.trim,
      lean,
    ),
    part(
      "leather",
      "round",
      back(0.68, 0.08, 0),
      [0.12, 0.3, 0.12],
      C.trim,
      side,
    ),
    part(
      "leather",
      "round",
      back(0.18, 0.07, 0),
      [0.1, 0.3, 0.1],
      C.chair,
      side,
      1.15,
    ),
  );
  for (const s of [1, -1])
    solid.push(
      rounded(
        "leather",
        0.035,
        c(0, 0.505, s * 0.22),
        [0.5, 0.08, 0.08],
        C.trim,
        turn,
      ),
      rounded(
        "leather",
        0.035,
        back(0.38, 0.04, s * 0.2),
        [0.1, 0.72, 0.08],
        C.trim,
        lean,
      ),
      part(
        "base",
        "box",
        c(0.02, 0.47, s * 0.27),
        [0.05, 0.04, 0.06],
        C.frame,
        turn,
      ),
      part(
        "base",
        "box",
        c(0.02, 0.6, s * 0.29),
        [0.05, 0.2, 0.05],
        C.chair,
        turn,
      ),
      rounded(
        "leather",
        0.018,
        c(-0.02, 0.715, s * 0.29),
        [0.26, 0.04, 0.09],
        C.chair,
        turn,
        1.1,
      ),
    );
  solid.slice(first).forEach((item, index) => {
    item.rig = first + index < top ? "chair" : "swivel";
  });
}

/** Column axis the seat swivels around (world x, z). */
export const CHAIR_PIVOT = [IN + CHAIR.d, CHAIR.u] as const;

/** A swivel part turned `angle` radians around the chair's column (+y, as Object3D.rotation.y). */
export function swivelPart(p: SetupPart, angle: number): SetupPart {
  const [a, b, c] = p.rotation ?? [0, 0, 0];
  if (a !== 0) throw new Error("swivel parts must not roll about x");
  const [px, pz] = CHAIR_PIVOT;
  const [x, y, z] = p.center;
  const [dx, dz] = [x - px, z - pz];
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return {
    ...p,
    center: [px + dx * cos + dz * sin, y, pz - dx * sin + dz * cos],
    // R = Ry(b) Rz(c) when a = 0, so a world turn adds to b.
    rotation: [0, b + angle, c],
  };
}

const SIDE_PANEL = w(0.27, 1.1, -0.74);

/** Desk props placed at runtime (T4i): the mug and the side screen's face. */
export const SETUP_PROPS = {
  /** Base centre on the desk top, between the mousepad and the right speaker. */
  mug: { center: w(0.6, DESK.height, -0.5), radius: 0.045, height: 0.1 },
  /** Just in front of the side monitor's screen, facing out along its normal. */
  sideScreen: {
    center: [
      SIDE_PANEL[0] + Math.cos(SIDE_YAW) * 0.03,
      SIDE_PANEL[1],
      SIDE_PANEL[2] - Math.sin(SIDE_YAW) * 0.03,
    ] as Vec3,
    yaw: SIDE_YAW,
  },
} as const;

/** Every setup part, by material. */
export function setupMeshes(): SetupMeshes {
  const meshes: SetupMeshes = { solid: [], glow: [], glass: [] };
  desk(meshes.solid);
  monitors(meshes.solid, meshes.glow);
  deskTop(meshes.solid, meshes.glow);
  tower(meshes.solid, meshes.glow, meshes.glass);
  chair(meshes.solid);
  return meshes;
}

/** Axis-aligned bounds of a part, rotation included (Euler XYZ). */
export function partBounds(p: Part) {
  const [a, b, c] = p.rotation ?? [0, 0, 0];
  const [ca, sa, cb, sb, cc, sc] = [
    Math.cos(a),
    Math.sin(a),
    Math.cos(b),
    Math.sin(b),
    Math.cos(c),
    Math.sin(c),
  ];
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const i of [-0.5, 0.5])
    for (const j of [-0.5, 0.5])
      for (const k of [-0.5, 0.5]) {
        // R = Rx(a) Ry(b) Rz(c): Rz first.
        let [x, y, z] = [i * p.size[0], j * p.size[1], k * p.size[2]];
        [x, y] = [x * cc - y * sc, x * sc + y * cc];
        [x, z] = [x * cb + z * sb, -x * sb + z * cb];
        [y, z] = [y * ca - z * sa, y * sa + z * ca];
        for (const [axis, value] of [x, y, z].entries()) {
          lo[axis] = Math.min(lo[axis], p.center[axis] + value);
          hi[axis] = Math.max(hi[axis], p.center[axis] + value);
        }
      }
  return { x0: lo[0], x1: hi[0], y0: lo[1], y1: hi[1], z0: lo[2], z1: hi[2] };
}

const solidParts = setupMeshes();
const chairBack = Math.max(
  ...[...solidParts.solid, ...solidParts.glow, ...solidParts.glass].map(
    (p) => partBounds(p).x1,
  ),
);

export const SETUP = {
  /** The wall the desk backs onto: no openings, never faded from home. */
  wall: "main-left",
  /** Screens look into the room, along +x. */
  facing: [1, 0, 0] as Vec3,
  chair: w(CHAIR.d, 0, CHAIR.u),
  /** Free floor kept behind the chair to roll it further out. */
  pullOut: 0.6,
  /** Farthest reach into the room: the chair's back and base. */
  chairBack,
  /** One mesh per solid material, plus glow and glass. */
  draws: new Set(solidParts.solid.map((p) => p.material)).size + 2,
} as const;

/** Desk, chair and pull-out room: kept clear of the door and the walkway. */
export const SETUP_ZONE: Rect = {
  x0: MAIN_ROOM.x0,
  x1: chairBack + SETUP.pullOut,
  z0: DESK.u0,
  z1: DESK.u1,
};

/**
 * Baked ambient occlusion per setup vertex (T4h): a 0.5..1 factor that
 * darkens surfaces near the floor, faces turned down and the knee space
 * under the desk top, so the setup sits on the floor instead of floating.
 */
export function setupOcclusion(
  [x, y, z]: readonly [number, number, number],
  [, ny]: readonly [number, number, number],
): number {
  const h = Math.max(0, y - Y0);
  let ao = h >= 0.5 ? 1 : 1 - 0.35 * (1 - h / 0.5) ** 2;
  if (ny < -0.5) ao *= 0.8;
  const underDesk =
    x < IN + DESK.d0 + DESK.depth &&
    z > DESK.u0 &&
    z < DESK.u1 &&
    y < Y0 + DESK.height - 0.05;
  if (underDesk) ao *= 0.85;
  return Math.max(ao, 0.5);
}

/** Screen and RGB brightness: soft by day, brighter at night. */
export function setupGlow(hours: number): number {
  return 0.75 + 0.45 * worldLight(hours).stars;
}
