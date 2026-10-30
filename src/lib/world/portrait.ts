// The left portrait monitor's page (T18, S31-S32): the official YouTube
// player looping the requested clip above the official NestJS Controllers
// docs, framed from docs.nestjs.com. The page
// is real DOM laid on the flat screen by drei's <Html transform>
// (PortraitScreen.tsx); these are its numbers: the embed URL, where the page
// and player sit, how big the player projects, and when the official
// iframe may mount. Ordinary orbit views keep the player far under
// YouTube's 200x200 minimum (L75), so it plays from a face-on close-up.

import { type Camera, Vector3 } from "three";
import { GUIDE, type Vec3 } from "./camera.ts";
import { CUTAWAY } from "./cutaway.ts";
import { HOUSE, HOUSE_FOCUS } from "./house.ts";
import { MONITOR_FOCUS } from "./monitor.ts";
import { SETUP_PROPS, type SetupPart, SIDE_MONITOR } from "./setup.ts";

/** The clip the user chose: its first ten seconds, looped by the player. */
export const PORTRAIT_VIDEO = { id: "NN6vlDRjg5Y", start: 0, end: 10 } as const;

export const PORTRAIT_LINKS = {
  video: `https://www.youtube.com/watch?v=${PORTRAIT_VIDEO.id}`,
  channel: "https://www.youtube.com/c/GentlemanProgramming",
  docs: "https://docs.nestjs.com/controllers",
} as const;

/** Only playback permissions; YouTube needs the referrer (error 153 without it). */
export const PORTRAIT_IFRAME = {
  allow: "autoplay; encrypted-media; picture-in-picture",
  referrerPolicy: "strict-origin-when-cross-origin",
  title: "Gentleman Programming on YouTube",
} as const;

/**
 * The official docs page, framed as published (S32): no proxy or copy. Its
 * headers allowed framing when checked (L77); that can change, so the page
 * always keeps a native link to it outside the frame.
 */
export const PORTRAIT_DOCS = {
  url: PORTRAIT_LINKS.docs,
  title: "NestJS official documentation",
  referrerPolicy: "strict-origin-when-cross-origin",
} as const;

/**
 * Official privacy-enhanced embed. `loop` needs `playlist` set to the same
 * id; `end` stops the loop at ten seconds (the player seeks `start` to the
 * nearest keyframe, so the loop is not frame exact). Muted, so browsers may
 * autoplay it inline; YouTube's own controls stay visible.
 */
export function portraitEmbedUrl(autoplay: boolean): string {
  const { id, start, end } = PORTRAIT_VIDEO;
  const params = new URLSearchParams({
    playlist: id,
    loop: "1",
    start: String(start),
    end: String(end),
    autoplay: autoplay ? "1" : "0",
    mute: "1",
    playsinline: "1",
    controls: "1",
    rel: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}

/** YouTube's minimum player viewport, in rendered pixels, both ways. */
export const PLAYER_MIN_PX = 200;

const [SCREEN_W, SCREEN_H] = SIDE_MONITOR.screen;
const PAGE_W = 480;
const { yaw } = SETUP_PROPS.sideScreen;

/**
 * The page in CSS pixels on the visible screen, 480 px across. drei maps
 * 1 px to distanceFactor / 400 m, so the page covers the screen exactly.
 * The player is 4:3 (YouTube letterboxes its 16:9 video), so it projects
 * tall enough for 200 px on a 0.27 m wide screen.
 */
export const PORTRAIT_PAGE = {
  width: PAGE_W,
  height: Math.round((PAGE_W * SCREEN_H) / SCREEN_W),
  distanceFactor: (400 * SCREEN_W) / PAGE_W,
  header: 64,
  player: { top: 64, width: PAGE_W, height: 360 },
  /** Metres: the visible screen. */
  size: SIDE_MONITOR.screen,
  center: SETUP_PROPS.sideScreen.center,
  /** A plane faces +z: this turns it onto the screen normal. */
  rotationY: Math.PI / 2 + yaw,
  normal: [Math.cos(yaw), 0, -Math.sin(yaw)] as Vec3,
} as const;

/** The portrait's old code lines (setup.ts): the page replaces them. */
export const isPortraitCodeGlow = (part: SetupPart) =>
  part.item === "portrait" && part.size[1] < SCREEN_H;

const METRE = SCREEN_W / PAGE_W;
const player = PORTRAIT_PAGE.player;
const PLAYER_TOP = (PORTRAIT_PAGE.height / 2 - player.top) * METRE;
const PLAYER_H = player.height * METRE;

/** A point on the page: `x` across (right as seen from the front), `y` up. */
function onPage(x: number, y: number): Vec3 {
  const [cx, cy, cz] = PORTRAIT_PAGE.center;
  const { rotationY } = PORTRAIT_PAGE;
  return [cx + x * Math.cos(rotationY), cy + y, cz - x * Math.sin(rotationY)];
}

/** The player's corners in world space: top left, top right, bottom right, bottom left. */
export function playerCorners(): Vec3[] {
  const half = SCREEN_W / 2;
  const bottom = PLAYER_TOP - PLAYER_H;
  return [
    onPage(-half, PLAYER_TOP),
    onPage(half, PLAYER_TOP),
    onPage(half, bottom),
    onPage(-half, bottom),
  ];
}

type Size = { width: number; height: number };
type Pixel = readonly [number, number];

/**
 * Rendered size of a projected quad (corners in playerCorners order),
 * conservative: corners clamped into the viewport, then the shorter of
 * each pair of opposite edges, so tilt and clipping only make it smaller.
 */
export function projectedSize(points: readonly Pixel[], viewport: Size): Size {
  const [a, b, c, d] = points.map(
    ([x, y]) =>
      [
        Math.min(Math.max(x, 0), viewport.width),
        Math.min(Math.max(y, 0), viewport.height),
      ] as const,
  );
  const edge = (p: Pixel, q: Pixel) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  return {
    width: Math.min(edge(a, b), edge(d, c)),
    height: Math.min(edge(a, d), edge(b, c)),
  };
}

const corner = new Vector3();
/** The player's rendered size through `camera`; zero if any corner is behind it. */
export function playerPixels(camera: Camera, viewport: Size): Size {
  const pixels: Pixel[] = [];
  for (const point of playerCorners()) {
    corner.set(...point).applyMatrix4(camera.matrixWorldInverse);
    if (corner.z >= 0) return { width: 0, height: 0 };
    corner.applyMatrix4(camera.projectionMatrix);
    pixels.push([
      ((corner.x + 1) / 2) * viewport.width,
      ((1 - corner.y) / 2) * viewport.height,
    ]);
  }
  return projectedSize(pixels, viewport);
}

const TAN_V = Math.tan((GUIDE.fov / 2) * (Math.PI / 180));
/** Share of the viewport the fitted page or player may fill. */
const FILL = 0.9;
const { minDistance } = MONITOR_FOCUS.limits;
const MAX_DISTANCE = 1.5;

/**
 * Face-on close-up of the portrait (L75), in the terminal's close-up limits.
 * The whole page when its player still renders at 200x200, else just the
 * player; `fits` is false when even that is too small for the viewport.
 */
export function portraitFocus(viewport: Size): {
  position: Vec3;
  target: Vec3;
  fits: boolean;
} {
  const { width, height } = viewport;
  if (!(width > 0 && height > 0))
    throw new RangeError("Viewport must have a positive size");
  const aspect = width / height;
  const distance = (halfHeight: number) =>
    Math.min(
      Math.max(
        halfHeight / (TAN_V * FILL),
        SCREEN_W / 2 / (TAN_V * aspect * FILL),
        minDistance,
      ),
      MAX_DISTANCE,
    );
  const plays = (d: number) =>
    (Math.min(SCREEN_W, PLAYER_H) * height) / (2 * TAN_V * d) >= PLAYER_MIN_PX;
  const page = distance((PORTRAIT_PAGE.height * METRE) / 2);
  const fitsPage = plays(page);
  const d = fitsPage ? page : distance(PLAYER_H / 2);
  const target = fitsPage
    ? PORTRAIT_PAGE.center
    : onPage(0, PLAYER_TOP - PLAYER_H / 2);
  const { normal } = PORTRAIT_PAGE;
  return {
    position: [target[0] + normal[0] * d, target[1], target[2] + normal[2] * d],
    target,
    fits: fitsPage || plays(d),
  };
}

export type PortraitMode = "off" | "idle" | "preview" | "player";

/** Cosine between the screen normal and the camera direction, at least. */
const FACING_MIN = 0.3;

/**
 * What the page shows: `off` with the night master off (dark screen), `idle`
 * (a still page, no input) during the terminal close-up or from behind, far
 * or under the floor, `player` (the official iframe) in the portrait
 * close-up at >= 200x200, otherwise `preview`: a still page with a native
 * watch link that enters the close-up when clicked.
 */
export function portraitMode({
  powered,
  terminal,
  focused,
  camera,
  pixels,
}: {
  powered: boolean;
  terminal: boolean;
  focused: boolean;
  camera: Vec3;
  pixels: Size;
}): PortraitMode {
  if (!powered) return "off";
  if (terminal || !camera.every(Number.isFinite)) return "idle";
  const { center, normal } = PORTRAIT_PAGE;
  const d = camera.map((c, i) => c - center[i]);
  const facing =
    (d[0] * normal[0] + d[2] * normal[2]) / (Math.hypot(...d) || 1);
  const near =
    Math.hypot(...camera.map((c, i) => c - HOUSE_FOCUS[i])) <=
    CUTAWAY.wall.gone;
  if (facing < FACING_MIN || !near || camera[1] < HOUSE.floorY) return "idle";
  return focused &&
    pixels.width >= PLAYER_MIN_PX &&
    pixels.height >= PLAYER_MIN_PX
    ? "player"
    : "preview";
}

/** The iframe's source, only while it plays; reduced motion never autoplays. */
export const portraitSrc = (mode: PortraitMode, reducedMotion: boolean) =>
  mode === "player" ? portraitEmbedUrl(!reducedMotion) : null;

/** The docs frame's source: only in the powered portrait close-up. */
export const portraitDocsSrc = (mode: PortraitMode, focused: boolean) =>
  focused && (mode === "player" || mode === "preview")
    ? PORTRAIT_DOCS.url
    : null;
