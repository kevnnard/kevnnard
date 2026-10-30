// The terminal as drawn on the ultrawide's curved screen (T16, L64-L66):
// one canvas in the screen's own UV space, laid out here in canvas pixels.
// MonitorScreen.tsx paints these texts, rules and regions into the strip's
// texture, and a pointer ray's UV hits the same regions, so every button
// and link sits exactly where it is drawn on the curve. Pure numbers; the
// layout follows design/terminal-monitor/01-dashboard.html: Ghostty bar,
// Neovim tabs, buffer, command line and status line, edge to edge.

import { MONITOR_SCREEN } from "./monitor.ts";
import {
  ASCII_COLUMNS,
  BUFFERS,
  type BufferId,
  type BufferKey,
  bufferFile,
  KEVNNARD_ASCII,
  type PortfolioBuffers,
  type TerminalLink,
} from "./terminal-content.ts";

/** Canvas size in layout pixels: the screen's own aspect, no stretch. */
export const SCREEN_W = 2048;
export const SCREEN_H = Math.round(SCREEN_W / MONITOR_SCREEN.aspect);

const CHROME = 52;
const TABS = 44;
const COMMAND = 36;
const STATUS = 40;
/** The scrolling buffer between the tab bar and the command line. */
export const BODY = {
  y: CHROME + TABS,
  h: SCREEN_H - CHROME - TABS - COMMAND - STATUS,
} as const;
export const COMMAND_Y = BODY.y + BODY.h;
export const STATUS_Y = COMMAND_Y + COMMAND;

/** Font sizes in layout pixels; body text is the readability floor. */
export const FONT = {
  text: 30,
  line: 42,
  small: 28,
  heading: 38,
  title: 34,
  ascii: 24,
} as const;
/** The canvas font stack (MonitorScreen.tsx draws with it). */
export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
/** Text width in layout pixels at `size`; the renderer passes canvas metrics. */
export type Measure = (text: string, size: number, bold?: boolean) => number;
/** Fallback without a canvas (tests, SSR): a generous 0.62 em monospace. */
export const monoMeasure: Measure = (text, size) =>
  [...text].length * size * 0.62;

/** Measures with the canvas's own font (L68), cached; mono fallback. */
export function canvasMeasure(): Measure {
  const ctx =
    typeof document === "undefined"
      ? null
      : document.createElement("canvas").getContext("2d");
  if (!ctx) return monoMeasure;
  const cache = new Map<string, number>();
  return (text, size, bold) => {
    const key = `${bold ? 1 : 0}|${text}`;
    let unit = cache.get(key);
    if (unit === undefined) {
      ctx.font = `${bold ? "bold " : ""}100px ${MONO}`;
      unit = ctx.measureText(text).width / 100;
      cache.set(key, unit);
    }
    return unit * size;
  };
}

/** Dashboard entry geometry, shared with the renderer. */
export const ENTRY = { label: 74, fileRight: 16, h: 52 } as const;
/** The dashboard's ASCII name never takes more than this share of the screen. */
export const ASCII_SHARE = 0.25;
const PAD = 24;
/** Readable line length for buffers on the full ultrawide. */
const MEASURE = 1400;

export type Color = "fg" | "muted" | "green" | "bg";
export interface ScreenText {
  x: number;
  y: number;
  text: string;
  size: number;
  color: Color;
  bold?: boolean;
  align: "left" | "center" | "right";
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type ScreenHit =
  | { type: "open"; buffer: BufferId }
  | { type: "link"; href: string }
  | { type: "exit" };
export interface ScreenRegion extends Box {
  /** Matches the off-screen companion control (TerminalMonitor.tsx). */
  id: string;
  hit: ScreenHit;
  label: string;
  kind: "entry" | "link" | "button" | "tab";
  size: number;
  key?: BufferKey;
  file?: string;
  current?: boolean;
}
export interface Column {
  x0: number;
  x1: number;
}

export interface TerminalLayout {
  buffer: BufferId;
  active: boolean;
  column: Column;
  /** Fixed parts: window bar, tabs, command and status lines. */
  chrome: { texts: ScreenText[]; regions: ScreenRegion[] };
  /** Buffer contents, y from the top of the buffer before scrolling. */
  texts: ScreenText[];
  rules: { x0: number; x1: number; y: number }[];
  regions: ScreenRegion[];
  contentHeight: number;
  maxScroll: number;
}

export const FULL_COLUMN: Column = { x0: 0, x1: SCREEN_W };

/** Greedy word wrap to `width` by measured text; overlong words are cut. */
export function wrap(
  text: string,
  width: number,
  size: number,
  measure: Measure = monoMeasure,
): string[] {
  const fits = (t: string) => measure(t, size) <= width;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (!fits(rest)) {
      const chars = [...rest];
      let n = chars.length - 1;
      while (n > 1 && !fits(chars.slice(0, n).join(""))) n--;
      if (line) lines.push(line);
      line = "";
      lines.push(chars.slice(0, n).join(""));
      rest = chars.slice(n).join("");
    }
    if (!rest) continue;
    const next = line ? `${line} ${rest}` : rest;
    if (!fits(next)) {
      lines.push(line);
      line = rest;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** `text` cut with an ellipsis to fit `width`. */
function fitLine(text: string, width: number, size: number, measure: Measure) {
  if (measure(text, size) <= width) return text;
  const chars = [...text];
  let n = chars.length - 1;
  while (n > 1 && measure(`${chars.slice(0, n).join("")}…`, size) > width) n--;
  return `${chars.slice(0, n).join("")}…`;
}

/** Builds one buffer top to bottom: a cursor over texts, rules and regions. */
function writer(x0: number, width: number, measure: Measure) {
  const texts: ScreenText[] = [];
  const rules: TerminalLayout["rules"] = [];
  const regions: ScreenRegion[] = [];
  let y = PAD;
  const center = x0 + width / 2;
  return {
    texts,
    rules,
    regions,
    get y() {
      return y;
    },
    gap(h: number) {
      y += h;
    },
    text(
      text: string,
      size: number,
      color: Color,
      options: { bold?: boolean; centered?: boolean; lineHeight?: number } = {},
    ) {
      const line = options.lineHeight ?? Math.round(size * 1.42);
      for (const row of wrap(text, width, size, measure)) {
        texts.push({
          x: options.centered ? center : x0,
          y: y + line / 2,
          text: row,
          size,
          color,
          bold: options.bold,
          align: options.centered ? "center" : "left",
        });
        y += line;
      }
    },
    rule() {
      rules.push({ x0, x1: x0 + width, y: y + 8 });
      y += 16;
    },
    /** Links (or buttons) in a row, wrapping onto new rows. */
    controls(items: Omit<ScreenRegion, keyof Box | "size">[]) {
      const size = FONT.text;
      const h = 44;
      let x = x0;
      for (const item of items) {
        const pad = item.kind === "button" ? 32 : 4;
        const label = fitLine(item.label, width - pad, size, measure);
        const w = measure(label, size) + pad;
        if (x > x0 && x + w > x0 + width) {
          x = x0;
          y += h + 8;
        }
        regions.push({ ...item, label, size, x, y, w, h });
        x += w + 28;
      }
      if (items.length) y += h + 12;
    },
  };
}

const linkItems = (links: readonly TerminalLink[]) =>
  links.map((link) => ({
    id: `link:${link.href}`,
    hit: { type: "link" as const, href: link.href },
    label: `${link.label} ↗`,
    kind: "link" as const,
  }));

function dashboard(column: Column, active: boolean, measure: Measure) {
  const width = column.x1 - column.x0 - 2 * PAD;
  const x0 = column.x0 + PAD;
  const out = writer(x0, width, measure);
  // The name: as large as fits, never past a quarter of the screen.
  const ascii = Math.min(
    FONT.ascii,
    Math.floor(
      (width /
        Math.max(...KEVNNARD_ASCII.map((row) => measure(row, 1, true)))) *
        10,
    ) / 10,
    Math.floor(
      ((SCREEN_H * ASCII_SHARE) / (KEVNNARD_ASCII.length * 1.2)) * 10,
    ) / 10,
  );
  for (const row of KEVNNARD_ASCII) {
    out.texts.push({
      x: x0 + width / 2,
      y: out.y + (ascii * 1.2) / 2,
      text: row,
      size: ascii,
      color: "green",
      bold: true,
      align: "center",
    });
    out.gap(ascii * 1.2);
  }
  out.gap(20);
  out.text("Software Engineer · TypeScript full-stack", FONT.text, "fg", {
    centered: true,
  });
  if (width >= 700)
    out.text("Web · Mobile · Cloud", FONT.text, "muted", { centered: true });
  out.gap(12);
  // a/p/e/c (L68): label and file name at least 1 em apart by measured
  // width; file names drop before anything is squeezed.
  const keys = Object.keys(BUFFERS) as BufferKey[];
  const gap = 16;
  const longest = (texts: string[], size: number) =>
    Math.max(...texts.map((t) => measure(t, size)));
  const bare =
    ENTRY.label +
    longest(
      keys.map((k) => BUFFERS[k].label),
      FONT.text,
    ) +
    ENTRY.fileRight;
  const withFile =
    bare +
    FONT.text +
    longest(
      keys.map((k) => BUFFERS[k].file),
      FONT.small,
    );
  const across = (n: number) => (width - (n - 1) * gap) / n;
  // Fewer rows beat file names: a column only on a phone's narrow view.
  const choice = [
    { n: 4, file: true },
    { n: 2, file: true },
    { n: 4, file: false },
    { n: 2, file: false },
    { n: 1, file: true },
  ].find(({ n, file }) => across(n) >= (file ? withFile : bare)) ?? {
    n: 1,
    file: false,
  };
  const columns = choice.n;
  const w = Math.min(
    across(columns),
    Math.max(440, (choice.file ? withFile : bare) + 32),
  );
  const h = ENTRY.h;
  const left = x0 + (width - (columns * w + (columns - 1) * gap)) / 2;
  keys.forEach((key, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    out.regions.push({
      id: `open:${key}`,
      hit: { type: "open", buffer: key },
      label: BUFFERS[key].label,
      kind: "entry",
      size: FONT.text,
      key,
      file: choice.file ? BUFFERS[key].file : undefined,
      x: left + col * (w + gap),
      y: out.y + row * (h + 10),
      w,
      h,
    });
  });
  out.gap(Math.ceil(keys.length / columns) * (h + 10) + 6);
  // A phone's narrow view keeps the four entries clear of scrolling; the
  // command line still lists the keys.
  if (width >= 700 || !active)
    out.text(
      active
        ? "Choose a buffer. Click or press its letter."
        : "Click the screen to enter.",
      FONT.small,
      "muted",
      { centered: true },
    );
  return out;
}

function buffer(
  content: PortfolioBuffers,
  id: BufferKey,
  column: Column,
  measure: Measure,
) {
  const span = column.x1 - column.x0 - 2 * PAD;
  const width = Math.min(MEASURE, span);
  const out = writer(column.x0 + PAD + (span - width) / 2, width, measure);
  const header = (path: string, title: string) => {
    out.text(`~/portfolio/${path}`, FONT.small, "green");
    out.text(title, FONT.heading, "fg", { bold: true });
    out.rule();
  };
  if (id === "a") {
    const { about } = content;
    header("about.md", about.name);
    out.text(about.summary, FONT.text, "muted", { lineHeight: FONT.line });
    out.gap(8);
    for (const role of about.roles)
      out.text(`• ${role}`, FONT.text, "fg", { lineHeight: FONT.line });
    out.gap(8);
    out.controls([
      ...linkItems(about.links),
      {
        id: "open:p",
        hit: { type: "open", buffer: "p" },
        label: "[p] Explore projects",
        kind: "button",
      },
    ]);
  } else if (id === "p") {
    header("projects/", "Projects");
    content.projects.forEach((project, i) => {
      out.text(
        `PROJECT / ${String(i + 1).padStart(2, "0")} · ${project.status}`.toUpperCase(),
        FONT.small,
        "green",
      );
      out.text(project.title, FONT.title, "fg", { bold: true });
      out.text(project.description, FONT.text, "muted", {
        lineHeight: FONT.line,
      });
      out.text(project.tags.join(" · "), FONT.small, "muted");
      out.gap(4);
      out.controls(linkItems(project.links));
      out.rule();
    });
  } else if (id === "e") {
    header("experience.md", "Experience");
    for (const entry of content.experience) {
      out.text(entry.company.toUpperCase(), FONT.small, "green");
      out.text(entry.title, FONT.title, "fg", { bold: true });
      out.text(
        [entry.duration, entry.location].filter(Boolean).join(" · "),
        FONT.small,
        "muted",
      );
      out.text(entry.description, FONT.text, "muted", {
        lineHeight: FONT.line,
      });
      out.gap(4);
      if (entry.link)
        out.controls(linkItems([{ label: entry.company, href: entry.link }]));
      out.rule();
    }
  } else {
    header("contact.md", "Contact");
    out.text("Find me on these profiles.", FONT.text, "muted");
    out.gap(8);
    out.controls(linkItems(content.contact));
  }
  return out;
}

/** Window bar, tabs, command and status lines, laid into the visible column. */
function chrome(
  id: BufferId,
  column: Column,
  active: boolean,
  measure: Measure,
) {
  const texts: ScreenText[] = [];
  const regions: ScreenRegion[] = [];
  const x0 = column.x0 + PAD;
  const x1 = column.x1 - PAD;
  const width = x1 - x0;
  const exitW = 140;
  texts.push({
    x: (x0 + 90 + (active ? x1 - exitW - 16 : x1)) / 2,
    y: CHROME / 2,
    text: fitLine(
      "Ghostty — nvim ~/portfolio",
      width - 90 - exitW - 32,
      FONT.small,
      measure,
    ),
    size: FONT.small,
    color: "muted",
    align: "center",
  });
  if (active)
    regions.push({
      id: "exit",
      hit: { type: "exit" },
      label: "Exit ↗",
      kind: "button",
      size: FONT.small,
      x: x1 - exitW,
      y: 8,
      w: exitW,
      h: CHROME - 16,
    });
  const tab = (tabId: string, label: string, open: BufferId, x: number) => {
    const w = measure(label, FONT.small) + 40;
    regions.push({
      id: tabId,
      hit: { type: "open", buffer: open },
      label,
      kind: "tab",
      size: FONT.small,
      current: open === id,
      x,
      y: CHROME,
      w,
      h: TABS,
    });
    return x + w;
  };
  const after = tab("tab:home", "⌂ dashboard", "home", column.x0);
  if (id !== "home") tab(`tab:${id}`, bufferFile(id), id, after);
  const full = `: a about · p projects · e experience · c contact · j/k scroll · Esc ${id === "home" ? "exit" : "dashboard"}`;
  const command =
    measure(full, FONT.small) <= width
      ? full
      : `: a p e c · j/k · Esc ${id === "home" ? "exit" : "back"}`;
  texts.push({
    x: x0,
    y: COMMAND_Y + COMMAND / 2,
    text: fitLine(command, width, FONT.small, measure),
    size: FONT.small,
    color: "muted",
    align: "left",
  });
  texts.push({
    x: column.x0 + 16,
    y: STATUS_Y + STATUS / 2,
    text: "NORMAL",
    size: FONT.small,
    color: "bg",
    bold: true,
    align: "left",
  });
  texts.push({
    x: column.x0 + 150,
    y: STATUS_Y + STATUS / 2,
    text: bufferFile(id),
    size: FONT.small,
    color: "fg",
    align: "left",
  });
  const status = "main · utf-8 · 100%";
  if (
    150 +
      measure(bufferFile(id), FONT.small) +
      48 +
      measure(status, FONT.small) <=
    column.x1 - column.x0 - PAD
  )
    texts.push({
      x: x1,
      y: STATUS_Y + STATUS / 2,
      text: status,
      size: FONT.small,
      color: "muted",
      align: "right",
    });
  return { texts, regions };
}

/**
 * The whole screen for `buffer`, laid out inside `column` (the part of the
 * screen the camera shows). `active` once the camera holds the terminal:
 * Exit appears and the hint changes; idle shows the same dashboard.
 */
export function terminalLayout(
  content: PortfolioBuffers,
  id: BufferId,
  column: Column = FULL_COLUMN,
  active = false,
  measure: Measure = monoMeasure,
): TerminalLayout {
  const body =
    id === "home"
      ? dashboard(column, active, measure)
      : buffer(content, id, column, measure);
  const contentHeight = body.y + PAD;
  return {
    buffer: id,
    active,
    column,
    chrome: chrome(id, column, active, measure),
    texts: body.texts,
    rules: body.rules,
    regions: body.regions,
    contentHeight,
    maxScroll: Math.max(0, Math.ceil(contentHeight - BODY.h)),
  };
}

export const clampScroll = (layout: TerminalLayout, scroll: number) =>
  Math.min(Math.max(Number.isFinite(scroll) ? scroll : 0, 0), layout.maxScroll);

/** Layout pixel of a texture UV (v up, canvas y down). */
export const uvToCanvas = (u: number, v: number) => ({
  x: u * SCREEN_W,
  y: (1 - v) * SCREEN_H,
});

const inside = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;

/**
 * The region under layout pixel (x, y) with the buffer scrolled by `scroll`.
 * Buffer regions only count inside the buffer's visible band, so content
 * scrolled under the bars is never hit.
 */
export function hitAt(
  layout: TerminalLayout,
  scroll: number,
  x: number,
  y: number,
): ScreenRegion | null {
  if (y < BODY.y || y >= BODY.y + BODY.h)
    return layout.chrome.regions.find((r) => inside(r, x, y)) ?? null;
  const cy = y - BODY.y + clampScroll(layout, scroll);
  return layout.regions.find((r) => inside(r, x, cy)) ?? null;
}

/** The scroll that brings region `id` fully into view (keyboard focus). */
export function revealScroll(
  layout: TerminalLayout,
  scroll: number,
  id: string,
): number {
  const region = layout.regions.find((r) => r.id === id);
  if (!region) return clampScroll(layout, scroll);
  if (region.y < scroll) return clampScroll(layout, region.y - 12);
  if (region.y + region.h > scroll + BODY.h)
    return clampScroll(layout, region.y + region.h - BODY.h + 12);
  return clampScroll(layout, scroll);
}

/** The layout column for the visible u range of the screen. */
export const spanColumn = ({ u0, u1 }: { u0: number; u1: number }): Column => ({
  x0: Math.max(0, Math.floor(u0 * SCREEN_W)),
  x1: Math.min(SCREEN_W, Math.ceil(u1 * SCREEN_W)),
});
