import { Html } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  CanvasTexture,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  Raycaster,
  SRGBColorSpace,
} from "three";
import { TV_SCREEN } from "@/lib/world/living.ts";
import { MONO } from "@/lib/world/terminal-layout.ts";
import type { CoverMotif, TvAppId } from "@/lib/world/tv-library.ts";
import {
  initialTvHome,
  TV_LAYOUT,
  TV_SCREEN_H,
  TV_SCREEN_W,
  type TvCoverItem,
  type TvRegion,
  type TvScreenLayout,
  tvHitAt,
  tvImageSources,
  tvScreenLayout,
  tvUvToCanvas,
} from "@/lib/world/tv-screen.ts";
import TvPlayer from "./TvPlayer";

/** Texture pixels per layout pixel: 2400 x 1344, crisp from the close-up. */
const RESOLUTION = 1.5;
/** Pointer travel past which a press is an orbit drag (screen px). */
const CLICK_SLOP = 6;
/**
 * The player's page (T8) in CSS pixels, scaled onto the glass: drei maps
 * 1 px to distanceFactor / 400 m, so the page covers the screen exactly.
 */
const PLAYER_PAGE = {
  width: 1280,
  height: Math.round((1280 * TV_SCREEN.height) / TV_SCREEN.width),
  distanceFactor: (400 * TV_SCREEN.width) / 1280,
  position: [
    TV_SCREEN.center[0],
    TV_SCREEN.center[1],
    TV_SCREEN.center[2] + 0.001,
  ] as [number, number, number],
};
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
// design/system.md dark tokens, as the artboard uses them.
const C = {
  bg: "#09090b",
  surface: "#18181b",
  panel: "#27272a",
  fg: "#fafafa",
  muted: "#a1a1aa",
  soft: "#d4d4d8",
  signal: "#10b981",
  line: "rgba(212, 212, 216, 0.2)",
  zinc: "#4b4b4b",
};

/** The dock's original line icons (24 x 24 SVG paths, stroked). */
const ICONS: Record<TvAppId, string> = {
  movies:
    "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 9h18M8 5v4M16 5v4",
  games:
    "M6 9h12a3 3 0 0 1 3 3v2a3 3 0 0 1-5 2l-1-1H9l-1 1a3 3 0 0 1-5-2v-2a3 3 0 0 1 3-3ZM8 11v3M6.5 12.5h3",
  videos:
    "M5 6h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm11 4 5-3v10l-5-3",
  channels:
    "M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm3-4 4 4 4-4M10 11v5l4-2.5Z",
  live: "M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8",
  anime: "M12 3 4 7v10l8 4 8-4V7ZM4 7l8 4 8-4M12 11v10",
  highlights:
    "M4.6 17.2c-1.6-2.3 1-6.6 5.8-9.6s9.4-3.4 11-1.1-1 6.6-5.8 9.6-9.4 3.4-11 1.1ZM9 15l6-6M10 11l3 3M12 9l3 3",
  radio:
    "M4 14v-2a8 8 0 0 1 16 0v2M4 14h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm14 0h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z",
};

/** The TV close-up as WorldApp hands it to the scene (tv-home-screen T3). */
export interface TvControl {
  /** The camera is on, or moving to, the TV. */
  focused: boolean;
  /** The camera arrived: the screen takes clicks and the remote's keys. */
  active: boolean;
  /** Clicking the TV from the room; unset while it cannot open. */
  onEnter?: () => void;
  /** The camera reached the TV. */
  onArrive?: () => void;
  layout: TvScreenLayout;
  /** A region on the screen was clicked or tapped. */
  onPress: (id: string) => void;
  /** The companion's muted <video>, drawn into the hero while it plays. */
  video: RefObject<HTMLVideoElement | null>;
  clipPlaying: boolean;
}

const IDLE = tvScreenLayout(initialTvHome(), {
  active: false,
  clock: "",
  music: { playing: false, track: null },
  clipPlaying: false,
});

type Ctx = CanvasRenderingContext2D;

/**
 * Decoded cover images by site path, loaded once for every TV screen: the
 * shipped covers and the clip's poster (tvImageSources), never a remote
 * URL. "failed" keeps the motif without retrying.
 */
const IMAGES = new Map<string, HTMLImageElement | "loading" | "failed">();
const LOADED = new Set<() => void>();

function loadImage(src: string) {
  if (IMAGES.has(src)) return;
  IMAGES.set(src, "loading");
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  image.decode().then(
    () => {
      IMAGES.set(src, image);
      for (const listener of LOADED) listener();
    },
    () => IMAGES.set(src, "failed"),
  );
}

const loadedImage = (src: string | null) => {
  const entry = src ? IMAGES.get(src) : undefined;
  return entry instanceof HTMLImageElement ? entry : null;
};

function box(ctx: Ctx, { x, y, w, h }: Omit<TvRegion, "id">, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** `text` cut with an ellipsis to fit `max` px in the current font. */
function fit(ctx: Ctx, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max)
    cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Word-wrapped lines, the last one ellipsised past `lines`. */
function wrap(ctx: Ctx, text: string, max: number, lines: number) {
  const out: string[] = [];
  let line = "";
  const words = text.split(" ");
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= max || !line) {
      line = next;
      continue;
    }
    if (out.length === lines - 1) {
      out.push(fit(ctx, [line, ...words.slice(i)].join(" "), max));
      return out;
    }
    out.push(line);
    line = words[i];
  }
  out.push(fit(ctx, line, max));
  return out;
}

function kbd(ctx: Ctx, label: string, x: number, mid: number, color: string) {
  ctx.font = `15px ${MONO}`;
  const w = ctx.measureText(label).width + 14;
  ctx.strokeStyle = color === C.bg ? "rgba(9, 9, 11, 0.35)" : C.line;
  ctx.lineWidth = 1.5;
  box(ctx, { x, y: mid - 13, w, h: 26 }, 5);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.fillText(label, x + 7, mid + 1);
  return w;
}

/** Drawn placeholder art, never poster art: the library's cover motifs. */
function motif(
  ctx: Ctx,
  kind: CoverMotif,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const linear = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    stops: [number, string][],
  ) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  };
  const disc = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const s = Math.min(w, h);
  ctx.save();
  ctx.translate(x, y);
  if (kind === "moon") {
    ctx.fillStyle = linear(0, 0, 0, h, [
      [0, C.panel],
      [1, C.bg],
    ]);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(16, 185, 129, 0.14)";
    ctx.lineWidth = 2;
    for (let i = -h; i < w; i += 11) {
      ctx.beginPath();
      ctx.moveTo(i, h);
      ctx.lineTo(i + h * 0.08, h * 0.55);
      ctx.stroke();
    }
    disc(w * 0.7, h * 0.28, s * 0.3, "rgba(16, 185, 129, 0.2)");
    disc(w * 0.7, h * 0.28, s * 0.2, C.signal);
  } else if (kind === "ring") {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    for (let r = 15; r < Math.max(w, h); r += 15) {
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.38, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    disc(w / 2, h * 0.38, s * 0.07, C.fg);
  } else if (kind === "dune") {
    ctx.fillStyle = linear(0, 0, 0, h, [
      [0, C.surface],
      [1, C.bg],
    ]);
    ctx.fillRect(0, 0, w, h);
    disc(w * 0.7, h * 0.25, s * 0.1, C.soft);
    ctx.fillStyle = C.panel;
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 1.1, w * 0.9, h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.zinc;
    ctx.beginPath();
    ctx.ellipse(w * 0.6, h * 1.05, w * 0.5, h * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "grid") {
    ctx.fillStyle = linear(0, 0, w, h, [
      [0, C.panel],
      [1, C.bg],
    ]);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
    for (let i = 0; i < w; i += 24) ctx.fillRect(i, 0, 1.5, h);
    for (let i = 0; i < h; i += 24) ctx.fillRect(0, i, w, 1.5);
  } else if (kind === "dots") {
    ctx.fillStyle = linear(0, 0, w, h, [
      [0, C.zinc],
      [0.7, C.bg],
    ]);
    ctx.fillRect(0, 0, w, h);
    for (let i = 5; i < w; i += 10)
      for (let j = 5; j < h; j += 10) disc(i, j, 2, "rgba(250, 250, 250, 0.3)");
  } else if (kind === "diag") {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.panel;
    ctx.lineWidth = 14;
    for (let i = -h; i < w + h; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  } else if (kind === "bars") {
    [C.bg, C.panel, C.zinc, C.panel, C.bg].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect((i * w) / 5, 0, w / 5 + 1, h);
    });
  } else if (kind === "split") {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.soft;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.48, 0);
    ctx.lineTo(w * 0.1, h);
    ctx.lineTo(0, h);
    ctx.fill();
  } else {
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, w, h * 0.55);
    ctx.fillStyle = C.panel;
    ctx.fillRect(0, h * 0.55, w, h * 0.01 + 1);
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, h * 0.56 + 1, w, h);
    const glow = ctx.createRadialGradient(
      w / 2,
      h * 0.55,
      0,
      w / 2,
      h * 0.55,
      s * 0.6,
    );
    glow.addColorStop(0, "rgba(16, 185, 129, 0.3)");
    glow.addColorStop(1, "rgba(16, 185, 129, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** Bottom shade under a cover's title, as on the artboard. */
function shade(
  ctx: Ctx,
  { x, y, w, h }: Omit<TvRegion, "id">,
  from: number,
  alpha: number,
) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(from, "rgba(9, 9, 11, 0)");
  g.addColorStop(1, `rgba(9, 9, 11, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** The video frame or image scaled to cover `area` (object-fit: cover). */
function cover(
  ctx: Ctx,
  image: CanvasImageSource,
  iw: number,
  ih: number,
  area: Omit<TvRegion, "id">,
) {
  const scale = Math.max(area.w / iw, area.h / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(
    image,
    area.x + (area.w - w) / 2,
    area.y + (area.h - h) / 2,
    w,
    h,
  );
}

function drawCover(
  ctx: Ctx,
  item: TvCoverItem,
  wide: boolean,
  lift: number,
  image: HTMLImageElement | null,
) {
  const area = { x: item.x, y: item.y - lift, w: item.w, h: item.h };
  ctx.save();
  box(ctx, area, 8);
  ctx.clip();
  if (item.kind === "back") {
    ctx.fillStyle = C.surface;
    ctx.fillRect(area.x, area.y, area.w, area.h);
    ctx.textAlign = "left";
    ctx.fillStyle = C.soft;
    ctx.font = `40px ${SANS}`;
    ctx.fillText("←", area.x + 14, area.y + area.h / 2 - 12);
    ctx.fillStyle = C.muted;
    ctx.font = `14px ${MONO}`;
    ctx.fillText(
      fit(ctx, item.line, area.w - 28),
      area.x + 14,
      area.y + area.h / 2 + 24,
    );
  } else {
    // The real cover once decoded, the drawn motif until then or without.
    if (image) cover(ctx, image, image.naturalWidth, image.naturalHeight, area);
    else motif(ctx, item.motif, area.x, area.y, area.w, area.h);
    shade(ctx, area, image ? 0.3 : 0.4, image ? 0.96 : 0.9);
    ctx.textAlign = "left";
    ctx.fillStyle = C.fg;
    ctx.font = `600 ${wide ? 19 : 18}px ${SANS}`;
    const lines = wrap(ctx, item.title, area.w - 22, wide ? 2 : 3);
    lines.forEach((line, i) => {
      ctx.fillText(
        line,
        area.x + 11,
        area.y + area.h - 34 - (lines.length - 1 - i) * 22,
      );
    });
    ctx.fillStyle = C.soft;
    ctx.font = `14px ${MONO}`;
    ctx.fillText(
      fit(ctx, item.line, area.w - 22),
      area.x + 11,
      area.y + area.h - 13,
    );
    if (item.favourite) {
      ctx.fillStyle = C.signal;
      box(ctx, { x: area.x + 8, y: area.y + 8, w: 40, h: 22 }, 4);
      ctx.fill();
      ctx.fillStyle = C.bg;
      ctx.font = `600 14px ${MONO}`;
      ctx.fillText("FAV", area.x + 15, area.y + 20);
    }
    if (item.collection) {
      // Two card edges peeking at the top right: a collection.
      if (image) {
        ctx.fillStyle = "rgba(9, 9, 11, 0.7)";
        box(ctx, { x: area.x + area.w - 44, y: area.y + 4, w: 38, h: 32 }, 6);
        ctx.fill();
      }
      ctx.strokeStyle = C.soft;
      ctx.lineWidth = 1.5;
      box(ctx, { x: area.x + area.w - 34, y: area.y + 9, w: 24, h: 17 }, 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(area.x + area.w - 38, area.y + 13);
      ctx.lineTo(area.x + area.w - 38, area.y + 30);
      ctx.lineTo(area.x + area.w - 14, area.y + 30);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = item.picked ? C.signal : C.line;
  ctx.lineWidth = item.picked ? 2.5 : 1.5;
  box(ctx, area, 8);
  ctx.stroke();
}

function rowHead(
  ctx: Ctx,
  y: number,
  heading: string,
  tag: string | null,
  note: string,
) {
  ctx.textAlign = "left";
  ctx.fillStyle = C.fg;
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText(heading, TV_LAYOUT.pad, y);
  let x = TV_LAYOUT.pad + ctx.measureText(heading).width + 16;
  ctx.font = `15px ${MONO}`;
  if (tag) {
    const w = ctx.measureText(tag).width + 18;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    box(ctx, { x, y: y - 13, w, h: 26 }, 6);
    ctx.stroke();
    ctx.fillStyle = C.soft;
    ctx.fillText(tag, x + 9, y + 1);
    x += w + 14;
  }
  ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, note, TV_SCREEN_W - TV_LAYOUT.pad - x), x, y + 1);
}

/**
 * The hero's cover: a dimmed, blurred fill of the art box behind the whole
 * cover, centred at its own 2:3 or 3:4 proportions.
 */
function heroCover(ctx: Ctx, image: HTMLImageElement, art: TvRegion) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  ctx.filter = "blur(16px)";
  cover(ctx, image, iw, ih, {
    x: art.x - 24,
    y: art.y - 24,
    w: art.w + 48,
    h: art.h + 48,
  });
  ctx.filter = "none";
  ctx.fillStyle = "rgba(9, 9, 11, 0.55)";
  ctx.fillRect(art.x, art.y, art.w, art.h);
  const h = art.h - 32;
  const w = (h * iw) / ih;
  const area = { x: art.x + (art.w - w) / 2, y: art.y + 16, w, h };
  ctx.save();
  box(ctx, area, 6);
  ctx.clip();
  ctx.drawImage(image, area.x, area.y, w, h);
  ctx.restore();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  box(ctx, area, 6);
  ctx.stroke();
}

/**
 * Paints Kevnnard TV onto the panel's canvas: top bar, app dock, hero
 * (the title's cover, or the clip's frame or poster when it is the owner's
 * video), the cover rows (real covers once decoded, motifs otherwise), the
 * key hints, the remote's ring (a static lift and outline) and the idle
 * hover outline.
 */
export function drawTvScreen(
  ctx: Ctx,
  layout: TvScreenLayout,
  {
    hover,
    frame,
    images,
  }: {
    hover: boolean;
    frame: { image: CanvasImageSource; width: number; height: number } | null;
    /** A decoded image by site path, or null while loading or missing. */
    images: (src: string) => HTMLImageElement | null;
  },
) {
  const { pad } = TV_LAYOUT;
  const image = (src: string | null) => (src ? images(src) : null);
  ctx.setTransform(RESOLUTION, 0, 0, RESOLUTION, 0, 0);
  ctx.textBaseline = "middle";
  const bg = ctx.createLinearGradient(0, 0, 0, TV_SCREEN_H);
  bg.addColorStop(0, "#121212");
  bg.addColorStop(0.6, C.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, TV_SCREEN_W, TV_SCREEN_H);
  const tint = ctx.createRadialGradient(
    TV_SCREEN_W * 0.8,
    0,
    0,
    TV_SCREEN_W * 0.8,
    0,
    TV_SCREEN_W * 0.6,
  );
  tint.addColorStop(0, "rgba(16, 185, 129, 0.08)");
  tint.addColorStop(1, "rgba(16, 185, 129, 0)");
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, TV_SCREEN_W, TV_SCREEN_H);

  const lift = (id: string) => (layout.ring === id ? 6 : 0);
  const ringAt = (area: Omit<TvRegion, "id">, r: number) => {
    ctx.strokeStyle = C.soft;
    ctx.lineWidth = 3.5;
    box(
      ctx,
      { x: area.x - 6, y: area.y - 6, w: area.w + 12, h: area.h + 12 },
      r + 4,
    );
    ctx.stroke();
  };

  // Top bar
  ctx.fillStyle = C.signal;
  ctx.beginPath();
  ctx.arc(pad + 6, TV_LAYOUT.brandY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = "left";
  ctx.letterSpacing = "2px";
  ctx.font = `600 18px ${MONO}`;
  ctx.fillStyle = C.fg;
  ctx.fillText("KEVNNARD TV", pad + 24, TV_LAYOUT.brandY);
  const brandW = ctx.measureText("KEVNNARD TV").width;
  ctx.font = `500 18px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(" · LIVING ROOM", pad + 24 + brandW, TV_LAYOUT.brandY);
  ctx.letterSpacing = "0px";
  const { back } = layout;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  box(ctx, back, 6);
  ctx.stroke();
  const mid = back.y + back.h / 2;
  const escW = kbd(ctx, "Esc", back.x + 14, mid, C.soft);
  ctx.font = `16px ${MONO}`;
  ctx.fillStyle = C.fg;
  ctx.fillText("Back to room", back.x + 24 + escW, mid);
  if (layout.ring === "back") ringAt(back, 6);
  ctx.textAlign = "right";
  ctx.font = `20px ${MONO}`;
  ctx.fillStyle = C.fg;
  ctx.fillText(layout.clock, back.x - 28, mid);
  const clockW = ctx.measureText(layout.clock).width;
  ctx.font = `15px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, layout.status, 520), back.x - 56 - clockW, mid);

  // Dock
  for (const app of layout.dock) {
    const area = { ...app, y: app.y - lift(app.id) };
    box(ctx, area, 12);
    ctx.fillStyle = app.current ? C.fg : "rgba(39, 39, 42, 0.5)";
    ctx.fill();
    ctx.strokeStyle = app.current ? C.fg : C.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.translate(area.x + 15, area.y + 13);
    ctx.scale(1.25, 1.25);
    ctx.strokeStyle = app.current ? C.bg : C.soft;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(new Path2D(ICONS[app.app]));
    ctx.restore();
    ctx.textAlign = "left";
    // Eight apps share the row (T8): 18 px keeps "Movies & Series" whole.
    ctx.font = `600 18px ${SANS}`;
    ctx.fillStyle = app.current ? C.bg : C.fg;
    ctx.fillText(fit(ctx, app.label, area.w - 30), area.x + 15, area.y + 64);
    ctx.font = `14px ${MONO}`;
    ctx.fillStyle = app.current ? C.panel : C.muted;
    ctx.fillText(fit(ctx, app.count, area.w - 30), area.x + 15, area.y + 85);
    if (layout.ring === app.id) ringAt(area, 12);
  }

  // Hero
  const { hero } = layout;
  const textW = hero.art.x - pad - 48;
  ctx.textAlign = "left";
  ctx.letterSpacing = "1.5px";
  ctx.font = `16px ${MONO}`;
  ctx.fillStyle = C.signal;
  ctx.fillText(
    fit(ctx, hero.kicker.toUpperCase(), textW),
    pad,
    TV_LAYOUT.heroKickerY,
  );
  ctx.letterSpacing = "0px";
  ctx.font = `600 50px ${SANS}`;
  ctx.fillStyle = C.fg;
  ctx.fillText(fit(ctx, hero.title, textW), pad, TV_LAYOUT.heroTitleY);
  ctx.font = `16px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(fit(ctx, hero.meta, textW), pad, TV_LAYOUT.heroMetaY);
  if (hero.note) {
    ctx.fillStyle = C.soft;
    ctx.font = `18px ${SANS}`;
    ctx.fillText(fit(ctx, hero.note.text, textW), pad, TV_LAYOUT.heroNoteY);
  }
  for (const action of layout.regions) {
    if (action.id !== "primary" && action.id !== "secondary") continue;
    const area = { ...action, y: action.y - lift(action.id) };
    const primary = action.id === "primary";
    box(ctx, area, 6);
    if (primary) {
      ctx.fillStyle = C.signal;
      ctx.fill();
    } else {
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const mid = area.y + area.h / 2;
    let x = area.x + 18;
    if (primary && hero.primary === "Open collection")
      x += kbd(ctx, "Enter", x, mid, C.bg) + 10;
    ctx.globalAlpha = primary || hero.secondaryReady ? 1 : 0.5;
    ctx.font = `${primary ? "600 " : ""}17px ${SANS}`;
    ctx.fillStyle = primary ? C.bg : C.fg;
    ctx.fillText(
      fit(
        ctx,
        (primary ? hero.primary : hero.secondary) ?? "",
        area.x + area.w - 18 - x,
      ),
      x,
      mid,
    );
    ctx.globalAlpha = 1;
    if (layout.ring === action.id) ringAt(area, 6);
  }
  ctx.save();
  box(ctx, hero.art, 12);
  ctx.clip();
  ctx.fillStyle = C.surface;
  ctx.fillRect(hero.art.x, hero.art.y, hero.art.w, hero.art.h);
  const heroImage = image(hero.cover);
  if (hero.video && frame)
    cover(ctx, frame.image, frame.width, frame.height, hero.art);
  else if (heroImage) heroCover(ctx, heroImage, hero.art);
  else motif(ctx, hero.motif, hero.art.x, hero.art.y, hero.art.w, hero.art.h);
  shade(ctx, hero.art, 0.6, 0.6);
  if (hero.video && hero.primary === "Play clip · muted") {
    const cx = hero.art.x + hero.art.w / 2;
    const cy = hero.art.y + hero.art.h / 2;
    ctx.fillStyle = "rgba(9, 9, 11, 0.6)";
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.fg;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 15);
    ctx.lineTo(cx + 16, cy);
    ctx.lineTo(cx - 10, cy + 15);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1.5;
  box(ctx, hero.art, 12);
  ctx.stroke();

  // Rows
  rowHead(
    ctx,
    TV_LAYOUT.coversHeadY,
    layout.coversHeading,
    layout.sampleTag,
    layout.coversNote,
  );
  for (const item of layout.covers) {
    if (!item.visible) continue;
    drawCover(ctx, item, false, lift(item.id), image(item.cover));
    if (layout.ring === item.id) ringAt({ ...item, y: item.y - 6 }, 8);
  }
  rowHead(
    ctx,
    TV_LAYOUT.continueHeadY,
    layout.continuedHeading,
    null,
    layout.continuedNote,
  );
  for (const item of layout.continued) {
    if (!item.visible) continue;
    drawCover(ctx, item, true, lift(item.id), image(item.cover));
    if (layout.ring === item.id) ringAt({ ...item, y: item.y - 6 }, 8);
  }

  ctx.textAlign = "left";
  ctx.font = `15px ${MONO}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(layout.hint, pad, TV_LAYOUT.hintY);

  if (hover) {
    ctx.strokeStyle = C.signal;
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, TV_SCREEN_W - 8, TV_SCREEN_H - 8);
  }
}

/**
 * The living-room TV's glass (tv-home-screen T3, S6), like the desk
 * monitor (MonitorScreen.tsx): Kevnnard TV drawn as a canvas texture,
 * idle in the room and live in the close-up, scaled by the hour's glow
 * until the camera holds it. It redraws only when what it shows changes,
 * and each frame only while the owner's muted clip plays. Idle, clicking
 * it from the room (nothing of the living room in the way) enters; active,
 * the ray's UV picks the drawn item (tvHitAt). A video or stream (T8)
 * plays in TvPlayer, framed on the same glass, only once a press opens it.
 */
export default function TvScreen({
  control,
  glow,
  occluders,
}: {
  control?: TvControl;
  glow: number;
  /** The living room's furniture, which can stand between camera and TV. */
  occluders: Object3D;
}) {
  const { gl, invalidate } = useThree();
  const [hovered, setHovered] = useState(false);
  const layout = control?.layout ?? IDLE;
  const active = Boolean(control?.active);
  const clipPlaying = Boolean(control?.clipPlaying);
  const canEnter = Boolean(control?.onEnter) && !control?.focused;
  const hover = hovered && canEnter;
  const video = control?.video;

  const { geometry, material, context } = useMemo(() => {
    const geometry = new PlaneGeometry(TV_SCREEN.width, TV_SCREEN.height);
    const canvas = document.createElement("canvas");
    canvas.width = TV_SCREEN_W * RESOLUTION;
    canvas.height = TV_SCREEN_H * RESOLUTION;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: texture });
    return { geometry, material, context: canvas.getContext("2d") };
  }, []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // The covers and the clip's poster this screen can show, each loaded and
  // decoded once; a decoded image redraws the screen, nothing else does.
  const [decoded, setDecoded] = useState(0);
  useEffect(() => {
    const listener = () => setDecoded((count) => count + 1);
    LOADED.add(listener);
    return () => {
      LOADED.delete(listener);
    };
  }, []);
  const sources = useMemo(() => tvImageSources(layout), [layout]);
  useEffect(() => {
    for (const src of sources) loadImage(src);
  }, [sources]);
  const poster = loadedImage(layout.hero.poster);

  const redraw = useCallback(() => {
    if (!context || !material.map) return;
    const element = video?.current;
    const frame =
      element &&
      element.readyState >= 2 &&
      (clipPlaying || element.currentTime > 0)
        ? {
            image: element,
            width: element.videoWidth,
            height: element.videoHeight,
          }
        : poster
          ? {
              image: poster,
              width: poster.naturalWidth,
              height: poster.naturalHeight,
            }
          : null;
    drawTvScreen(context, layout, { hover, frame, images: loadedImage });
    material.map.needsUpdate = true;
    invalidate();
    // `decoded` counts loaded images: each one repaints the screen once.
  }, [
    context,
    material,
    video,
    clipPlaying,
    poster,
    layout,
    hover,
    invalidate,
    decoded,
  ]);
  useEffect(redraw, [redraw]);

  // The started clip: one redraw per frame while it plays, none otherwise.
  useEffect(() => {
    if (!active || !clipPlaying) return;
    let frame = requestAnimationFrame(function tick() {
      redraw();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, clipPlaying, redraw]);

  useLayoutEffect(() => {
    material.color.setScalar(active ? Math.max(glow, 1) : glow);
    invalidate();
  }, [active, glow, material, invalidate]);

  const element = gl.domElement;
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );
  useEffect(() => {
    if (!active) element.style.cursor = hover ? "pointer" : "";
  }, [active, hover, element]);

  // The player's page takes the pointer while it plays; drei's blending
  // punches its hole in the canvas, which gets its events back after.
  const playing = active && Boolean(layout.player);
  useLayoutEffect(() => {
    if (!playing) return;
    element.style.pointerEvents = "none";
    return () => {
      element.style.pointerEvents = "";
    };
  }, [element, playing]);

  const raycaster = useMemo(() => new Raycaster(), []);
  const reachable = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!canEnter) return false;
    raycaster.set(event.ray.origin, event.ray.direction);
    raycaster.far = Math.max(0, event.distance - 0.005);
    return raycaster.intersectObject(occluders, true).length === 0;
  };
  const regionAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!event.uv) return null;
    const { x, y } = tvUvToCanvas(event.uv.x, event.uv.y);
    return tvHitAt(layout, x, y);
  };

  return (
    <>
      <mesh
        name="living-tv-screen"
        position={TV_SCREEN.center}
        geometry={geometry}
        material={material}
        onPointerOver={(event) => {
          if (!active) setHovered(reachable(event));
        }}
        onPointerMove={(event) => {
          if (!active) {
            setHovered(reachable(event));
            return;
          }
          const id = regionAt(event);
          element.style.cursor =
            id && (id !== "secondary" || layout.hero.secondaryReady)
              ? "pointer"
              : "";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (active) element.style.cursor = "";
        }}
        onClick={(event) => {
          if (control?.focused) {
            // The close-up owns the screen: clicks never reach the room.
            event.stopPropagation();
            if (!active || event.delta > CLICK_SLOP) return;
            const id = regionAt(event);
            if (id) control.onPress(id);
            return;
          }
          if (event.delta > CLICK_SLOP || !reachable(event)) return;
          event.stopPropagation();
          setHovered(false);
          control?.onEnter?.();
        }}
      />
      {active && layout.player && (
        <Html
          transform
          occlude="blending"
          geometry={
            <planeGeometry args={[TV_SCREEN.width, TV_SCREEN.height]} />
          }
          distanceFactor={PLAYER_PAGE.distanceFactor}
          position={PLAYER_PAGE.position}
          pointerEvents="auto"
        >
          <TvPlayer
            view={layout.player}
            width={PLAYER_PAGE.width}
            height={PLAYER_PAGE.height}
            onPress={(id) => control?.onPress(id)}
          />
        </Html>
      )}
    </>
  );
}
