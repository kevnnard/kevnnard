import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  MeshBasicMaterial,
  type Object3D,
  Raycaster,
  SRGBColorSpace,
} from "three";
import { safeExternalUrl } from "@/lib/room/terminal.ts";
import { canEnterMonitor, screenSurface } from "@/lib/world/monitor.ts";
import {
  BODY,
  COMMAND_Y,
  type Color,
  canvasMeasure,
  clampScroll,
  ENTRY,
  FONT,
  FULL_COLUMN,
  hitAt,
  MONO,
  SCREEN_H,
  SCREEN_W,
  type ScreenHit,
  type ScreenRegion,
  type ScreenText,
  STATUS_Y,
  type TerminalLayout,
  terminalLayout,
  uvToCanvas,
} from "@/lib/world/terminal-layout.ts";
import { normalizeWheel } from "@/lib/world/wheel.ts";

/** Texture pixels per layout pixel: crisp text, 4096 x 1400 at most. */
const RESOLUTION = 2;
// design/system.md dark tokens, as hex for the canvas.
const C: Record<Color | "panel" | "line" | "ring", string> = {
  bg: "#09090b",
  panel: "#18181b",
  line: "#27272a",
  fg: "#fafafa",
  muted: "#a1a1aa",
  green: "#10b981",
  ring: "#d4d4d8",
};
/** Pointer travel past which a press is a drag (screen px / layout px). */
const CLICK_SLOP = 6;

/** What the screen shows and does; held by WorldApp (T16, L66). */
export interface MonitorTerminal {
  layout: TerminalLayout;
  scroll: number;
  /** Screen region of the keyboard-focused companion control. */
  ring: string | null;
  /** The camera is on, or moving to, the close-up. */
  focused: boolean;
  /** The close-up has arrived: the screen takes clicks, wheel and drags. */
  active: boolean;
  onEnter?: () => void;
  onHit: (hit: ScreenHit) => void;
  onScroll: (scroll: number) => void;
}

function text(ctx: CanvasRenderingContext2D, t: ScreenText, maxWidth?: number) {
  ctx.font = `${t.bold ? "bold " : ""}${t.size}px ${MONO}`;
  ctx.textAlign = t.align;
  ctx.fillStyle = C[t.color];
  ctx.fillText(t.text, t.x, t.y, maxWidth);
}

function region(ctx: CanvasRenderingContext2D, r: ScreenRegion) {
  const mid = r.y + r.h / 2;
  ctx.font = `${r.size}px ${MONO}`;
  ctx.textAlign = "left";
  if (r.kind === "tab") {
    if (r.current) {
      ctx.fillStyle = C.bg;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = C.green;
      ctx.fillRect(r.x, r.y, r.w, 3);
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(r.x + r.w - 2, r.y, 2, r.h);
    ctx.fillStyle = r.current ? C.fg : C.muted;
    ctx.fillText(r.label, r.x + 20, mid);
  } else if (r.kind === "entry") {
    ctx.fillStyle = C.panel;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 14, r.y + 8, 40, r.h - 16);
    ctx.fillStyle = C.green;
    ctx.textAlign = "center";
    ctx.fillText(r.key ?? "", r.x + 34, mid);
    ctx.textAlign = "left";
    ctx.fillStyle = C.fg;
    ctx.fillText(r.label, r.x + ENTRY.label, mid);
    if (r.file) {
      ctx.font = `${FONT.small}px ${MONO}`;
      ctx.textAlign = "right";
      ctx.fillStyle = C.muted;
      ctx.fillText(r.file, r.x + r.w - ENTRY.fileRight, mid);
    }
  } else if (r.kind === "link") {
    ctx.fillStyle = C.green;
    ctx.fillText(r.label, r.x, mid);
    ctx.fillRect(r.x, mid + r.size * 0.55, r.w - 4, 2);
  } else {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = C.fg;
    ctx.textAlign = "center";
    ctx.fillText(r.label, r.x + r.w / 2, mid);
  }
}

/**
 * Paints the whole terminal into the screen's canvas, edge to edge: Ghostty
 * bar, Neovim tabs, the scrolled buffer clipped between them and the
 * command line, the status line; a focus ring, and the idle hover outline.
 */
export function drawTerminal(
  ctx: CanvasRenderingContext2D,
  layout: TerminalLayout,
  scroll: number,
  { ring, hover }: { ring: string | null; hover: boolean },
) {
  const { column } = layout;
  ctx.setTransform(RESOLUTION, 0, 0, RESOLUTION, 0, 0);
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  // Bars span the whole screen; their contents keep to the visible column.
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, SCREEN_W, BODY.y);
  ctx.fillRect(0, STATUS_Y, SCREEN_W, SCREEN_H - STATUS_Y);
  ctx.fillStyle = C.line;
  ctx.fillRect(0, BODY.y - 2, SCREEN_W, 2);
  ctx.fillRect(0, COMMAND_Y, SCREEN_W, 2);
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 2;
  for (const i of [0, 1, 2]) {
    ctx.beginPath();
    ctx.arc(column.x0 + 34 + i * 26, 26, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = C.green;
  ctx.fillRect(column.x0, STATUS_Y, 130, SCREEN_H - STATUS_Y);
  for (const t of layout.chrome.texts) text(ctx, t);
  for (const r of layout.chrome.regions) region(ctx, r);

  const offset = clampScroll(layout, scroll);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, BODY.y, SCREEN_W, BODY.h);
  ctx.clip();
  ctx.translate(0, BODY.y - offset);
  ctx.fillStyle = C.line;
  for (const rule of layout.rules)
    ctx.fillRect(rule.x0, rule.y, rule.x1 - rule.x0, 2);
  const span = column.x1 - column.x0 - 48;
  for (const t of layout.texts) text(ctx, t, span);
  for (const r of layout.regions) region(ctx, r);
  ctx.restore();

  const focused =
    ring &&
    [
      ...layout.chrome.regions.map((r) => ({ r, dy: 0 })),
      ...layout.regions.map((r) => ({ r, dy: BODY.y - offset })),
    ].find(({ r }) => r.id === ring);
  if (focused) {
    ctx.strokeStyle = C.ring;
    ctx.lineWidth = 3;
    const { r, dy } = focused;
    ctx.strokeRect(r.x - 4, r.y + dy - 4, r.w + 8, r.h + 8);
  }
  if (hover) {
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, SCREEN_W - 6, SCREEN_H - 6);
  }
}

const IDLE = terminalLayout(
  {
    about: { name: "", summary: "", roles: [], links: [] },
    projects: [],
    experience: [],
    contact: [],
  },
  "home",
  FULL_COLUMN,
  false,
  canvasMeasure(),
);

/**
 * The ultrawide's screen (T16): one curved strip on its arc (monitor.ts)
 * carrying the terminal as a canvas texture, idle and active alike, scaled
 * by the hour's glow like every screen. It redraws only when what it shows
 * changes. Idle, clicking its front face from the room side (nothing of the
 * setup in the way) enters; active, the ray's UV picks the drawn control
 * (hitAt), the wheel and a drag scroll the buffer, and links open in a new
 * tab from the click.
 */
export default function MonitorScreen({
  glow,
  occluders,
  terminal,
}: {
  glow: number;
  /** Setup parts that can stand between the camera and the screen. */
  occluders: Object3D;
  terminal?: MonitorTerminal;
}) {
  const { gl, invalidate } = useThree();
  const [hovered, setHovered] = useState(false);
  const layout = terminal?.layout ?? IDLE;
  const scroll = terminal?.scroll ?? 0;
  const active = Boolean(terminal?.active);
  const canEnter = Boolean(terminal?.onEnter) && !terminal?.focused;
  const drag = useRef<{ y: number; scroll: number; moved: boolean } | null>(
    null,
  );

  const { geometry, material, context } = useMemo(() => {
    const surface = screenSurface();
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(surface.positions, 3),
    );
    geometry.setAttribute("normal", new BufferAttribute(surface.normals, 3));
    geometry.setAttribute("uv", new BufferAttribute(surface.uvs, 2));
    geometry.setIndex(surface.indices);
    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W * RESOLUTION;
    canvas.height = SCREEN_H * RESOLUTION;
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

  const ring = terminal?.ring ?? null;
  const hover = hovered && canEnter;
  useEffect(() => {
    if (!context || !material.map) return;
    drawTerminal(context, layout, scroll, { ring, hover });
    material.map.needsUpdate = true;
    invalidate();
  }, [context, material, layout, scroll, ring, hover, invalidate]);

  useLayoutEffect(() => {
    material.color.setScalar(glow);
    invalidate();
  }, [glow, material, invalidate]);

  // The canvas cursor is ours only while it points at the screen.
  const element = gl.domElement;
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );
  useEffect(() => {
    element.style.cursor = hover ? "pointer" : "";
  }, [hover, element]);

  const raycaster = useMemo(() => new Raycaster(), []);
  const reachable = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!canEnter) return false;
    const { x, y, z } = event.camera.position;
    if (!canEnterMonitor([x, y, z])) return false;
    raycaster.set(event.ray.origin, event.ray.direction);
    raycaster.far = Math.max(0, event.distance - 0.005);
    return raycaster.intersectObject(occluders, true).length === 0;
  };
  const canvasPoint = (
    event: ThreeEvent<PointerEvent | MouseEvent | WheelEvent>,
  ) => (event.uv ? uvToCanvas(event.uv.x, event.uv.y) : null);
  const regionAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const point = canvasPoint(event);
    return point ? hitAt(layout, scroll, point.x, point.y) : null;
  };

  const press = (hit: ScreenHit) => {
    if (hit.type === "link") {
      // Only validated https/http, in a new tab, from this click.
      const url = safeExternalUrl(hit.href);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }
    terminal?.onHit(hit);
  };

  return (
    <mesh
      name="setup-terminal-screen"
      geometry={geometry}
      material={material}
      onPointerOver={(event) => {
        if (!active) setHovered(reachable(event));
      }}
      onPointerMove={(event) => {
        if (!active) return;
        const point = canvasPoint(event);
        const start = drag.current;
        if (start && point) {
          const dy = start.y - point.y;
          if (Math.abs(dy) > CLICK_SLOP) start.moved = true;
          if (start.moved)
            terminal?.onScroll(clampScroll(layout, start.scroll + dy));
        }
        element.style.cursor =
          regionAt(event) && !start?.moved ? "pointer" : "";
      }}
      onPointerOut={() => {
        setHovered(false);
        drag.current = null;
        if (active) element.style.cursor = "";
      }}
      onPointerDown={(event) => {
        if (!active) return;
        event.stopPropagation();
        const point = canvasPoint(event);
        drag.current = point ? { y: point.y, scroll, moved: false } : null;
      }}
      onPointerUp={() => {
        // A drag's click still follows; `moved` is read there, then cleared.
        setTimeout(() => {
          drag.current = null;
        });
      }}
      onWheel={(event) => {
        if (!active) return;
        event.stopPropagation();
        const { pixelY } = normalizeWheel(event.nativeEvent);
        terminal?.onScroll(clampScroll(layout, scroll + pixelY));
      }}
      onClick={(event) => {
        if (active) {
          event.stopPropagation();
          if (drag.current?.moved || event.delta > CLICK_SLOP) return;
          const found = regionAt(event);
          if (found) press(found.hit);
          return;
        }
        if (event.delta > CLICK_SLOP || !reachable(event)) return;
        event.stopPropagation();
        terminal?.onEnter?.();
      }}
    />
  );
}
