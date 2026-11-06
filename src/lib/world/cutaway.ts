// Zoom-driven cutaway (T4c, S7): far away the house is whole; zooming in
// dissolves both roofs, then every wall whose outside faces the camera, so
// the empty interior shows from any side. Pure numbers; House.tsx turns each
// fade into a dithered discard and hides fully faded groups. The shadow
// shell (S21) is the one three.js piece: it keeps the faded walls and roofs
// casting, so the sun and moon still enter only through the windows.

import {
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  Object3D,
  type Side,
} from "three";
import {
  HOUSE,
  HOUSE_FOCUS,
  HOUSE_GROUPS,
  type HouseGroup,
  WALLS,
} from "./house.ts";

type Point = readonly [number, number, number];

export const CUTAWAY = {
  /** Camera-to-focus distances: fading starts at `start`, done at `gone`. */
  roof: { start: 14, gone: 8 },
  wall: { start: 11, gone: 6 },
  /** Cosine between the wall's outward normal and the camera direction. */
  facing: { start: 0.1, full: 0.3 },
} as const;

/** Fades above this stop the group casting shadows (no dotted shadows). */
const SHADOW_FADE = 0.02;

/**
 * Whether a fading group casts shadows: off as soon as it starts fading, back
 * on only once it is whole again.
 */
export const castsShadow = (fade: number, casting: boolean) =>
  casting ? fade <= SHADOW_FADE : fade === 0;

/**
 * A camera-invisible, always-casting copy of the opaque house solids (S21).
 * Each blocker reuses its solid's geometry (real window and door holes, no
 * glass) and renders with colorWrite and depthWrite off, so the camera sees
 * nothing; the shadow pass draws it through an explicit undithered depth
 * material. Kept outside the fading groups, so hiding a roof or wall never
 * lets the sun or moon into the room. The caller owns the shared geometry;
 * `materials` are the shell's own, to dispose once.
 */
export function shadowShell(
  solids: readonly Mesh[],
  shadowSide: Side | null = solids[0]
    ? (solids[0].material as Material).shadowSide
    : null,
): { shell: Object3D; materials: Material[] } {
  const camera = new MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    // The shadow pass takes its side from the mesh material.
    shadowSide,
  });
  const depth = new MeshDepthMaterial({ depthWrite: true });
  const shell = new Object3D();
  shell.name = "house-shadow";
  for (const solid of solids) {
    const blocker = new Mesh(solid.geometry, camera);
    blocker.name = `${solid.name || "solid"}-shadow`;
    blocker.position.copy(solid.position);
    blocker.quaternion.copy(solid.quaternion);
    blocker.scale.copy(solid.scale);
    blocker.updateMatrix();
    blocker.customDepthMaterial = depth;
    blocker.castShadow = true;
    blocker.receiveShadow = false;
    shell.add(blocker);
  }
  return { shell, materials: [camera, depth] };
}

const bayer2 = (x: number, y: number) => {
  const a = Math.floor(x);
  const b = Math.floor(y);
  const t = a / 2 + b * b * 0.75;
  return t - Math.floor(t);
};
const bayer4 = (x: number, y: number) =>
  bayer2(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);

/** 8x8 ordered-dither threshold in [0, 1); mirrors DITHER_GLSL. */
export const bayer8 = (x: number, y: number) =>
  bayer4(0.5 * x, 0.5 * y) * 0.25 + bayer2(x, y);

/** GLSL for `cutawayBayer8(gl_FragCoord.xy)`, the screen-door threshold. */
export const DITHER_GLSL = `
  float cutawayBayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2.0 + a.y * a.y * 0.75);
  }
  float cutawayBayer4(vec2 a) {
    return cutawayBayer2(0.5 * a) * 0.25 + cutawayBayer2(a);
  }
  float cutawayBayer8(vec2 a) {
    return cutawayBayer4(0.5 * a) * 0.25 + cutawayBayer2(a);
  }
`;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * Fade per house group: 0 intact, 1 gone. `reveal` dissolves its groups
 * whatever the camera: the dream truck's close-up opens the garage that way
 * (dream-truck T1). Throws a RangeError for non-finite input.
 */
export function cutaway(
  camera: Point,
  focus: Point = HOUSE_FOCUS,
  reveal: readonly HouseGroup[] = [],
): Record<HouseGroup, number> {
  const fades = facingFades(camera, focus);
  for (const group of reveal) fades[group] = 1;
  return fades;
}

function facingFades(camera: Point, focus: Point): Record<HouseGroup, number> {
  if (![...camera, ...focus].every(Number.isFinite))
    throw new RangeError("Camera position must be finite");
  const distance = Math.hypot(
    camera[0] - focus[0],
    camera[1] - focus[1],
    camera[2] - focus[2],
  );
  const fades = Object.fromEntries(
    HOUSE_GROUPS.map((group) => [group, 0]),
  ) as Record<HouseGroup, number>;
  const roof = smoothstep(CUTAWAY.roof.start, CUTAWAY.roof.gone, distance);
  fades["main-roof"] = roof;
  fades["garage-roof"] = roof;
  const close = smoothstep(CUTAWAY.wall.start, CUTAWAY.wall.gone, distance);
  if (close === 0) return fades;
  for (const wall of WALLS) {
    const u = (wall.from + wall.to) / 2;
    const y = HOUSE.floorY + wall.height / 2;
    const [x, z] = wall.axis === "x" ? [u, wall.at] : [wall.at, u];
    const dx = camera[0] - x;
    const dz = camera[2] - z;
    const length = Math.hypot(dx, camera[1] - y, dz) || 1;
    const dot = (wall.side * (wall.axis === "x" ? dz : dx)) / length;
    fades[wall.group] =
      close * smoothstep(CUTAWAY.facing.start, CUTAWAY.facing.full, dot);
  }
  return fades;
}
