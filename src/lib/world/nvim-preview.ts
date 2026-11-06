// The portrait screen's idle Neovim (portrait-neovim T1, S1-S2): seen from
// the room, Neovim types excerpts of this repository's own code in a loop,
// saves each with :w and opens the next. Everything here is pure: the
// excerpts (copied verbatim, tests/world/nvim.test.ts checks them against
// their files), a small TypeScript highlighter, the typing timeline and the
// canvas layout. NvimScreen.tsx paints a frame into the screen's texture.

import { PORTRAIT_PAGE } from "./portrait.ts";
import { seededRandom } from "./random.ts";

export const NVIM_BRANCH = "feat/interactive-room";

export interface PreviewExcerpt {
  /** Repository path the lines were copied from, unchanged. */
  file: string;
  filetype: "typescript";
  lines: readonly string[];
}

export const PREVIEW_EXCERPTS: readonly PreviewExcerpt[] = [
  {
    file: "src/lib/world/random.ts",
    filetype: "typescript",
    lines: [
      "/** Small seeded PRNG (mulberry32): same seed, same island, in every browser. */",
      "export function seededRandom(seed: number): () => number {",
      "  let state = seed >>> 0;",
      "  return () => {",
      "    state = (state + 0x6d2b79f5) >>> 0;",
      "    let t = state;",
      "    t = Math.imul(t ^ (t >>> 15), t | 1);",
      "    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);",
      "    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;",
      "  };",
      "}",
    ],
  },
  {
    file: "src/lib/world/gallery-camera.ts",
    filetype: "typescript",
    lines: [
      "/** The inspected model's centre, the eye's offset from it and the lens. */",
      "function galleryView(id: GalleryItemId): {",
      "  centre: Vec3;",
      "  offset: Vec3;",
      "  fov: number;",
      "} {",
      "  // The katanas on the wall shelf (katana-wall-shelf T5): static, framed",
      "  // from the room at their own level.",
      '  if (id === "katana")',
      "    return { centre: KATANA_CENTRE, offset: KATANA_EYE_OFFSET, fov: GUIDE.fov };",
      "  // The collection shelf (T15): static, the whole shelf from the room, with",
      "  // a wider lens so the eye stays clear of the sofa and the cases.",
      '  if (id === "collection-shelf") return SHELF_VIEW;',
      "  const item = DISPLAY_CASES.find((caseItem) => caseItem.id === id);",
      '  if (!item) throw new RangeError("Unknown display case");',
      "  const [x, y, z] = item.base;",
      "  const centre =",
      "    y + ITEM_FLOOR_Y + DISPLAY_CASE.itemFit.height / 2 + DISPLAY_LIFT.height;",
      "  return { centre: [x, centre, z], offset: EYE_OFFSET, fov: GUIDE.fov };",
      "}",
    ],
  },
  {
    file: "src/lib/world/speaker-range.ts",
    filetype: "typescript",
    lines: [
      "/** The reach for a setting from 0 (house) to 1 (initial view), clamped. */",
      "export function rangeReach(range: ListeningRange, setting: number): number {",
      "  const t = Number.isFinite(setting) ? Math.min(Math.max(setting, 0), 1) : 0;",
      "  return range.house + (range.initial - range.house) * t;",
      "}",
      "",
      "/** Music level at `distance` for a reach: half at the reach, silent past 1.6 times it. */",
      "export function rangeGain(distance: number, reach: number): number {",
      "  if (!Number.isFinite(reach) || reach <= 0) return 0;",
      "  return speakerGain((distance * LEGACY_REACH) / reach);",
      "}",
    ],
  },
  {
    file: "src/lib/world/wheel.ts",
    filetype: "typescript",
    lines: [
      "export function normalizeWheel(event: WheelInput): NormalizedWheel {",
      "  let sX = 0;",
      "  let sY = 0;",
      "  if (event.detail !== undefined) sY = event.detail;",
      "  if (event.wheelDelta !== undefined) sY = -event.wheelDelta / 120;",
      "  if (event.wheelDeltaY !== undefined) sY = -event.wheelDeltaY / 120;",
      "  if (event.wheelDeltaX !== undefined) sX = -event.wheelDeltaX / 120;",
      "  // Old Firefox reports horizontal scroll on the vertical field.",
      "  if (",
      "    event.axis !== undefined &&",
      "    event.HORIZONTAL_AXIS !== undefined &&",
      "    event.axis === event.HORIZONTAL_AXIS",
      "  ) {",
      "    sX = sY;",
      "    sY = 0;",
      "  }",
      "  let pX = sX * PIXEL_STEP;",
      "  let pY = sY * PIXEL_STEP;",
      "  if (event.deltaY !== undefined) pY = event.deltaY;",
      "  if (event.deltaX !== undefined) pX = event.deltaX;",
      "  if ((pX || pY) && event.deltaMode) {",
      "    const unit = event.deltaMode === 1 ? LINE_HEIGHT : PAGE_HEIGHT;",
      "    pX *= unit;",
      "    pY *= unit;",
      "  }",
      "  if (pX && !sX) sX = pX < 1 ? -1 : 1;",
      "  if (pY && !sY) sY = pY < 1 ? -1 : 1;",
      "  return { spinX: sX, spinY: sY, pixelX: pX, pixelY: pY };",
      "}",
    ],
  },
];

export type TokenKind =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "type"
  | "function"
  | "punct"
  | "plain";

export interface Token {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set(
  "as async await break case class const continue default else export extends false for from function if import in interface let new null of return switch this throw true type typeof undefined var while".split(
    " ",
  ),
);

/** One line's spans, in order; their texts join back into the line. */
export function highlight(line: string): Token[] {
  // A JSDoc or block comment line, as it reads mid-comment.
  if (/^\s*(\/\*|\*)/.test(line)) return [{ text: line, kind: "comment" }];
  const tokens: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    const last = tokens.at(-1);
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else tokens.push({ text, kind });
  };
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    const ch = line[i];
    if (rest.startsWith("//")) {
      push(rest, "comment");
      break;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let end = i + 1;
      while (end < line.length && line[end] !== ch)
        end += line[end] === "\\" ? 2 : 1;
      const text = line.slice(i, end + 1);
      push(text, "string");
      i += text.length;
      continue;
    }
    const space = rest.match(/^\s+/);
    const number = space ? null : rest.match(/^\d[\w.]*/);
    const word = space || number ? null : rest.match(/^[A-Za-z_$][\w$]*/);
    const match = space ?? number ?? word;
    if (!match) {
      push(ch, "punct");
      i += 1;
      continue;
    }
    if (space) push(match[0], "plain");
    else if (number) push(match[0], "number");
    else {
      const name = match[0];
      const after = line.slice(i + name.length);
      push(
        name,
        KEYWORDS.has(name)
          ? "keyword"
          : /^[A-Z]/.test(name)
            ? "type"
            : /^\s*\(/.test(after)
              ? "function"
              : "plain",
      );
    }
    i += match[0].length;
  }
  return tokens;
}

export type PreviewMode = "NORMAL" | "INSERT" | "COMMAND";

export interface PreviewFrame {
  /** Index into PREVIEW_EXCERPTS. */
  excerpt: number;
  file: string;
  filetype: string;
  lines: string[];
  cursor: { row: number; col: number };
  mode: PreviewMode;
  /** The command line while typing a command, else empty. */
  command: string;
  /** The message area: `[New]`, `written`, or empty. */
  message: string;
}

/** One moment of the timeline: everything else follows from it. */
interface Key {
  at: number;
  excerpt: number;
  typed: number;
  mode: PreviewMode;
  command: string;
  message: string;
}

const OPEN_MS = 900;
const SAVE_HOLD_MS = 2200;

const bytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * The loop: each file opens empty, INSERT types it at a human pace (uneven
 * keys, a breath after a line or a brace, now and then a longer think;
 * the new line's indent arrives with Enter, as autoindent does), Esc, `:w`,
 * the write message, then the next file. Seeded: the same in every browser.
 */
function timeline(): { keys: Key[]; cycle: number } {
  const keys: Key[] = [];
  let at = 0;
  PREVIEW_EXCERPTS.forEach(({ file, lines }, excerpt) => {
    const text = lines.join("\n");
    const random = seededRandom(excerpt + 1);
    const key = (
      typed: number,
      mode: PreviewMode,
      command = "",
      message = "",
    ) => keys.push({ at, excerpt, typed, mode, command, message });
    key(0, "NORMAL", "", `"${file}" [New]`);
    at += OPEN_MS;
    key(0, "INSERT");
    at += 300;
    let typed = 0;
    while (typed < text.length) {
      const ch = text[typed];
      typed += 1;
      if (ch === "\n") {
        const indent = text.slice(typed).match(/^ */)?.[0].length ?? 0;
        typed += indent;
      }
      key(typed, "INSERT");
      let delay = 45 + random() * 70;
      if (ch === "\n") delay += 160 + random() * 240;
      else if (";{},(".includes(ch)) delay += 90;
      if (random() < 0.025) delay += 450 + random() * 400;
      at += delay;
    }
    at += 600;
    key(typed, "NORMAL");
    at += 650;
    key(typed, "COMMAND", ":");
    at += 180;
    key(typed, "COMMAND", ":w");
    at += 320;
    key(
      typed,
      "NORMAL",
      "",
      `"${file}" ${lines.length}L, ${bytes(`${text}\n`)}B written`,
    );
    at += SAVE_HOLD_MS;
  });
  return { keys, cycle: at };
}

const TIMELINE = timeline();
/** One whole loop through every excerpt, in milliseconds. */
export const PREVIEW_CYCLE_MS = TIMELINE.cycle;
/** The screen's redraw clock: frames only change on these ticks. */
export const PREVIEW_TICK_MS = 120;

function frameOf(key: Key): PreviewFrame {
  const { file, filetype, lines } = PREVIEW_EXCERPTS[key.excerpt];
  const shown = lines.join("\n").slice(0, key.typed).split("\n");
  const row = shown.length - 1;
  const length = shown[row].length;
  return {
    excerpt: key.excerpt,
    file,
    filetype,
    lines: shown,
    cursor: {
      row,
      col: key.mode === "INSERT" ? length : Math.max(0, length - 1),
    },
    mode: key.mode,
    command: key.command,
    message: key.message,
  };
}

/** The frame at `ms` since the loop started; it repeats every cycle. */
export function previewFrame(ms: number): PreviewFrame {
  const t = ((ms % PREVIEW_CYCLE_MS) + PREVIEW_CYCLE_MS) % PREVIEW_CYCLE_MS;
  const { keys } = TIMELINE;
  let lo = 0;
  let hi = keys.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].at <= t) lo = mid;
    else hi = mid - 1;
  }
  return frameOf(keys[lo]);
}

/** Reduced motion: the first file typed out, at rest in NORMAL. */
export function previewStill(): PreviewFrame {
  const first = TIMELINE.keys.find((key) => key.command === ":w");
  if (!first) throw new Error("The timeline never saves");
  return { ...frameOf(first), mode: "NORMAL", command: "", message: "" };
}

/** A frame's identity: the canvas redraws only when it changes. */
export const previewKey = (frame: PreviewFrame) =>
  `${frame.excerpt}|${frame.lines.join("\n").length}|${frame.mode}|${frame.command}|${frame.message}`;

/** The lualine sections, shared with the entered editor. */
export function statusParts({
  mode,
  file,
  filetype,
  cursor,
}: {
  mode: string;
  file: string;
  filetype: string;
  cursor: { row: number; col: number };
}) {
  return {
    mode,
    branch: NVIM_BRANCH,
    file,
    filetype,
    position: `${cursor.row + 1}:${cursor.col + 1}`,
  };
}

/**
 * The canvas, in CSS pixels of the portrait page (480 across): bufferline,
 * buffer, statusline and command line, as Neovim stacks them.
 */
export const PREVIEW_LAYOUT = {
  width: PORTRAIT_PAGE.width,
  height: PORTRAIT_PAGE.height,
  tabline: 30,
  status: 26,
  command: 24,
  font: 12,
  lineHeight: 18,
  gutter: 44,
} as const;

/** Buffer rows the canvas shows. */
export const PREVIEW_ROWS = Math.floor(
  (PREVIEW_LAYOUT.height -
    PREVIEW_LAYOUT.tabline -
    PREVIEW_LAYOUT.status -
    PREVIEW_LAYOUT.command) /
    PREVIEW_LAYOUT.lineHeight,
);

/** First buffer row on screen: the cursor's row stays visible. */
export const previewTop = (frame: PreviewFrame) =>
  Math.max(0, frame.cursor.row - PREVIEW_ROWS + 1);

/**
 * design/system.md's dark tokens: zinc and the one emerald accent; the
 * comment grey is the light theme's muted foreground.
 */
export const NVIM_COLORS: Record<
  TokenKind | "bg" | "panel" | "line" | "fg" | "muted" | "accent",
  string
> = {
  bg: "#09090b",
  panel: "#18181b",
  line: "#27272a",
  fg: "#fafafa",
  muted: "#a1a1aa",
  accent: "#10b981",
  keyword: "#10b981",
  string: "#e4e4e7",
  comment: "#71717a",
  number: "#10b981",
  type: "#fafafa",
  function: "#fafafa",
  punct: "#a1a1aa",
  plain: "#d4d4d8",
};
