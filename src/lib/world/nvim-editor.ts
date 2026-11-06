// The portrait screen's playable Neovim (portrait-neovim T2, S2): a small,
// pure modal editor. NORMAL, INSERT, V-LINE, the command line and a
// Telescope-like picker; the motions and edits a Vim user reaches for first;
// and commands that show things. Every easter egg only repeats what the site
// already says (the about copy, the collection's stories, the TV library,
// package.json); nothing is executed and nothing leaves the page.

import { CASE_STORIES } from "./case-stories.ts";
import { GALLERY_ORDER } from "./display-cases.ts";
import { NVIM_BRANCH, statusParts } from "./nvim-preview.ts";
import type { TerminalLink } from "./terminal-content.ts";
import { TV_COVERS } from "./tv-covers.ts";
import { GUIDE_SECTIONS } from "./world-guide.ts";

export type EditorMode = "normal" | "insert" | "visual" | "command" | "picker";
/** What the portrait page shows: the editor or one of its two old views. */
export type PortraitView = "editor" | "gentleman" | "nest";

export interface EditorPanel {
  title: string;
  lines: readonly string[];
}

export interface PickerItem {
  label: string;
  detail: string;
  lines: readonly string[];
}

export interface Picker {
  query: string;
  selected: number;
  results: readonly PickerItem[];
}

/** Everything the easter eggs show, from the site's own sources. */
export interface NvimContent {
  about: {
    name: string;
    summary: string;
    roles: readonly string[];
    links: readonly TerminalLink[];
  };
  places: readonly PickerItem[];
  hitman: readonly string[];
  tsushima: readonly string[];
}

interface Snapshot {
  lines: readonly string[];
  row: number;
  col: number;
}

export interface EditorState {
  content: NvimContent;
  file: string;
  lines: readonly string[];
  row: number;
  col: number;
  /** First buffer row on screen. */
  top: number;
  mode: EditorMode;
  /** V-LINE's starting row. */
  anchor: number;
  command: string;
  /** An operator or `g` waiting for its second key. */
  pending: string;
  /** The last yanked or deleted lines. */
  register: readonly string[] | null;
  undo: readonly Snapshot[];
  modified: boolean;
  message: string;
  error: boolean;
  panel: EditorPanel | null;
  picker: Picker | null;
  view: PortraitView;
}

/** Measured by the page, for :checkhealth. */
export interface EditorEnv {
  fps?: number;
}

/** Buffer rows the entered editor shows (nvim-screen.css). */
export const EDITOR_ROWS = 36;
const UNDO_LIMIT = 100;

/** Counted with `node --test tests/` when the editor was written. */
export const NVIM_HEALTH = { tests: 953 } as const;

/** The site's real stack, at package.json's versions. */
export const LAZY_PLUGINS = [
  { name: "astro", label: "Astro", version: "7.3.3" },
  { name: "@astrojs/react", label: "Astro React", version: "6.0.6" },
  { name: "react", label: "React", version: "19.3.0" },
  { name: "three", label: "Three.js", version: "0.186.1" },
  { name: "@react-three/fiber", label: "React Three Fiber", version: "9.8.2" },
  { name: "@react-three/drei", label: "drei", version: "10.7.9" },
  { name: "meshoptimizer", label: "meshoptimizer", version: "1.3.0" },
  { name: "@tailwindcss/vite", label: "Tailwind CSS", version: "4.3.3" },
  { name: "@biomejs/biome", label: "Biome", version: "2.5.14" },
  { name: "typescript", label: "TypeScript", version: "7.0.2" },
] as const;

const WELCOME = [
  "// Welcome to Kevnnard's Neovim. You are in NORMAL mode.",
  "// i to type, Esc to stop, :w to save, :help for commands.",
  "// Some commands are not in :help. Vim users know where to look.",
  "// Esc in NORMAL mode takes you back to the room.",
  "",
  'const visitor = "you";',
  "console.log(`hello, ${visitor}`);",
];

/** The easter eggs' material, gathered from the site's sources. */
export function nvimContent(about: NvimContent["about"]): NvimContent {
  const collection = GALLERY_ORDER.map((id): PickerItem => {
    const story = CASE_STORIES[id];
    if (!story)
      return {
        label: "Collection shelf",
        detail: "COLLECTION SHELF",
        lines: ["The collection shelf.", "Its story is not written yet."],
      };
    const body = "paragraphs" in story ? story.paragraphs : [story.lede];
    const subtitle = "subtitle" in story ? [story.subtitle] : [];
    return {
      label: story.title,
      detail: story.kicker,
      lines: [story.kicker, ...subtitle, "", ...body],
    };
  });
  const rooms = GUIDE_SECTIONS.filter((section) =>
    ["terminal", "video", "lofi"].includes(section.id),
  ).map((section) => ({
    label: section.title,
    detail: section.eyebrow,
    lines: [section.eyebrow, "", ...section.paragraphs],
  }));
  const hitman = [
    ...new Set(
      Object.values(TV_COVERS)
        .map((cover) => cover.title)
        .filter((title) => title.startsWith("Hitman")),
    ),
  ];
  return {
    about,
    places: [...collection, ...rooms],
    hitman,
    tsushima: CASE_STORIES.katana.paragraphs,
  };
}

export function createEditor(content: NvimContent): EditorState {
  return {
    content,
    file: "scratch.ts",
    lines: WELCOME,
    row: 5,
    col: 0,
    top: 0,
    mode: "normal",
    anchor: 0,
    command: "",
    pending: "",
    register: null,
    undo: [],
    modified: false,
    message: "",
    error: false,
    panel: null,
    picker: null,
    view: "editor",
  };
}

const MODE_LABEL: Record<EditorMode, string> = {
  normal: "NORMAL",
  insert: "INSERT",
  visual: "V-LINE",
  command: "COMMAND",
  picker: "INSERT",
};

/** The statusline's sections, as the idle preview draws them. */
export function editorStatus(state: EditorState) {
  return statusParts({
    mode: MODE_LABEL[state.mode],
    file: state.file,
    filetype: "typescript",
    cursor: { row: state.row, col: state.col },
  });
}

/** Only a plain NORMAL-mode Esc belongs to the room: it leaves the screen. */
export const leavesEditor = (state: EditorState) =>
  state.mode === "normal" && !state.pending && !state.panel && !state.picker;

const NAMED_KEYS = new Set([
  "Escape",
  "Enter",
  "Backspace",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

/** Keys the editor takes; Tab moves focus except while typing. */
export const isEditorKey = (state: EditorState, key: string) =>
  key.length === 1 ||
  NAMED_KEYS.has(key) ||
  (key === "Tab" && state.mode === "insert");

/** Switches the page's view; the editor keeps its buffer meanwhile. */
export const openView = (state: EditorState, view: PortraitView) => ({
  ...state,
  view,
});

type Patch = Partial<EditorState>;

const lastCol = (line: string) => Math.max(0, line.length - 1);
const clampRow = (state: EditorState, row: number) =>
  Math.min(Math.max(row, 0), state.lines.length - 1);

/** Applies a patch, then keeps the cursor on the text and on screen. */
function settle(state: EditorState, patch: Patch): EditorState {
  const next = { ...state, ...patch };
  const row = clampRow(next, next.row);
  const line = next.lines[row] ?? "";
  const max = next.mode === "insert" ? line.length : lastCol(line);
  const col = Math.min(Math.max(next.col, 0), max);
  let top = Math.min(next.top, row);
  if (row >= top + EDITOR_ROWS) top = row - EDITOR_ROWS + 1;
  return { ...next, row, col, top: Math.max(0, top) };
}

const snapshot = (state: EditorState): Snapshot => ({
  lines: state.lines,
  row: state.row,
  col: state.col,
});

/** Records the state before a change, for `u`. */
const remember = (state: EditorState): Patch => ({
  undo: [...state.undo, snapshot(state)].slice(-UNDO_LIMIT),
});

const isWord = (ch: string) => /\w/.test(ch);
const kind = (ch: string | undefined) =>
  ch === undefined || /\s/.test(ch) ? 0 : isWord(ch) ? 1 : 2;

/** `w`: the next word's start, across lines; an empty line is a word. */
function wordForward(lines: readonly string[], row: number, col: number) {
  let line = lines[row];
  let i = col;
  const start = kind(line[i]);
  if (start) while (i < line.length && kind(line[i]) === start) i++;
  for (;;) {
    while (i < line.length && kind(line[i]) === 0) i++;
    if (i < line.length) return { row, col: i };
    if (row >= lines.length - 1) return { row, col: lastCol(line) };
    row += 1;
    line = lines[row];
    i = 0;
    if (!line.length) return { row, col: 0 };
  }
}

/** `b`: the previous word's start, across lines. */
function wordBack(lines: readonly string[], row: number, col: number) {
  let line = lines[row];
  let i = col - 1;
  for (;;) {
    while (i >= 0 && kind(line[i]) === 0) i--;
    if (i >= 0) break;
    if (row === 0) return { row: 0, col: 0 };
    row -= 1;
    line = lines[row];
    i = line.length - 1;
    if (!line.length) return { row, col: 0 };
  }
  const k = kind(line[i]);
  while (i > 0 && kind(line[i - 1]) === k) i--;
  return { row, col: i };
}

const firstChar = (line: string) => Math.max(0, line.search(/\S|$/));

function vertical(state: EditorState, key: string): Patch | null {
  if (key === "j" || key === "ArrowDown") return { row: state.row + 1 };
  if (key === "k" || key === "ArrowUp") return { row: state.row - 1 };
  if (key === "G") {
    const row = state.lines.length - 1;
    return { row, col: firstChar(state.lines[row]) };
  }
  return null;
}

function motion(state: EditorState, key: string): Patch | null {
  const line = state.lines[state.row];
  if (key === "h" || key === "ArrowLeft") return { col: state.col - 1 };
  if (key === "l" || key === "ArrowRight") return { col: state.col + 1 };
  if (key === "0" || key === "Home") return { col: 0 };
  if (key === "$" || key === "End") return { col: lastCol(line) };
  if (key === "w") return wordForward(state.lines, state.row, state.col);
  if (key === "b") return wordBack(state.lines, state.row, state.col);
  return vertical(state, key);
}

const replaceLines = (
  lines: readonly string[],
  from: number,
  count: number,
  insert: readonly string[] = [],
) => [...lines.slice(0, from), ...insert, ...lines.slice(from + count)];

function deleteRows(state: EditorState, from: number, to: number): Patch {
  const removed = state.lines.slice(from, to + 1);
  const left = replaceLines(state.lines, from, removed.length);
  return {
    ...remember(state),
    lines: left.length ? left : [""],
    register: removed,
    row: from,
    col: 0,
    modified: true,
    message: removed.length > 2 ? `${removed.length} fewer lines` : "",
  };
}

const yanked = (count: number) => (count > 2 ? `${count} lines yanked` : "");

function normal(state: EditorState, key: string): Patch {
  const line = state.lines[state.row];
  const clear = { message: "", error: false };
  if (state.pending) {
    const pair = state.pending + key;
    if (pair === "gg")
      return { pending: "", row: 0, col: firstChar(state.lines[0]) };
    if (pair === "dd")
      return { pending: "", ...deleteRows(state, state.row, state.row) };
    if (pair === "yy")
      return {
        pending: "",
        register: [line],
        message: yanked(1),
      };
    return { pending: "" };
  }
  const moved = motion(state, key);
  if (moved) return { ...clear, ...moved };
  const insert = (patch: Patch): Patch => ({
    ...clear,
    ...remember(state),
    mode: "insert",
    ...patch,
  });
  switch (key) {
    case "i":
      return insert({});
    case "a":
      return insert({ col: state.col + (line.length ? 1 : 0) });
    case "I":
      return insert({ col: firstChar(line) });
    case "A":
      return insert({ col: line.length });
    case "o":
    case "O": {
      const at = key === "o" ? state.row + 1 : state.row;
      const indent = line.match(/^\s*/)?.[0] ?? "";
      return insert({
        lines: replaceLines(state.lines, at, 0, [indent]),
        row: at,
        col: indent.length,
        modified: true,
      });
    }
    case "x":
      if (!line.length) return {};
      return {
        ...remember(state),
        lines: replaceLines(state.lines, state.row, 1, [
          line.slice(0, state.col) + line.slice(state.col + 1),
        ]),
        modified: true,
      };
    case "d":
    case "y":
    case "g":
      return { pending: key };
    case "p":
    case "P": {
      if (!state.register)
        return { message: 'E353: Nothing in register "', error: true };
      const at = key === "p" ? state.row + 1 : state.row;
      return {
        ...clear,
        ...remember(state),
        lines: replaceLines(state.lines, at, 0, state.register),
        row: at,
        col: firstChar(state.register[0]),
        modified: true,
      };
    }
    case "u": {
      const last = state.undo.at(-1);
      if (!last) return { message: "Already at oldest change", error: false };
      return {
        ...last,
        undo: state.undo.slice(0, -1),
        modified: state.undo.length > 1,
        message: `1 change; before #${state.undo.length}`,
        error: false,
      };
    }
    case "V":
      return { ...clear, mode: "visual", anchor: state.row };
    case ":":
      return { ...clear, mode: "command", command: "" };
    case "Escape":
      return clear;
    default:
      return {};
  }
}

function insertMode(state: EditorState, key: string): Patch {
  const line = state.lines[state.row];
  const { row, col } = state;
  if (key === "Escape") return { mode: "normal", col: col - 1 };
  if (key === "Enter") {
    const indent = line.match(/^\s*/)?.[0] ?? "";
    return {
      lines: replaceLines(state.lines, row, 1, [
        line.slice(0, col),
        indent + line.slice(col).trimStart(),
      ]),
      row: row + 1,
      col: indent.length,
      modified: true,
    };
  }
  if (key === "Backspace") {
    if (col > 0)
      return {
        lines: replaceLines(state.lines, row, 1, [
          line.slice(0, col - 1) + line.slice(col),
        ]),
        col: col - 1,
        modified: true,
      };
    if (row === 0) return {};
    const above = state.lines[row - 1];
    return {
      lines: replaceLines(state.lines, row - 1, 2, [above + line]),
      row: row - 1,
      col: above.length,
      modified: true,
    };
  }
  if (key === "Home") return { col: 0 };
  if (key === "End") return { col: line.length };
  if (key.startsWith("Arrow")) return motion(state, key) ?? {};
  const text = key === "Tab" ? "  " : key.length === 1 ? key : "";
  if (!text) return {};
  return {
    lines: replaceLines(state.lines, row, 1, [
      line.slice(0, col) + text + line.slice(col),
    ]),
    col: col + text.length,
    modified: true,
  };
}

function visual(state: EditorState, key: string): Patch {
  const from = Math.min(state.anchor, state.row);
  const to = Math.max(state.anchor, state.row);
  if (key === "Escape" || key === "V") return { mode: "normal" };
  if (key === "d" || key === "x")
    return { mode: "normal", ...deleteRows(state, from, to) };
  if (key === "y") {
    const lines = state.lines.slice(from, to + 1);
    return {
      mode: "normal",
      register: lines,
      row: from,
      message: yanked(lines.length),
    };
  }
  if (state.pending === "g" && key === "g") return { pending: "", row: 0 };
  if (key === "g") return { pending: "g" };
  return vertical(state, key) ?? {};
}

/** Fuzzy match: the query's letters in order; a contiguous run ranks first. */
export function fuzzy(
  items: readonly PickerItem[],
  query: string,
): PickerItem[] {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return [...items];
  const score = (item: PickerItem) => {
    const text = `${item.label} ${item.detail}`.toLowerCase();
    const at = text.indexOf(q);
    if (at >= 0) return at;
    let i = 0;
    for (const ch of text) if (ch === q[i]) i++;
    return i === q.length ? 1000 : -1;
  };
  return items
    .map((item) => ({ item, s: score(item) }))
    .filter(({ s }) => s >= 0)
    .sort((a, b) => a.s - b.s)
    .map(({ item }) => item);
}

function pickerMode(state: EditorState, key: string): Patch {
  const picker = state.picker;
  if (!picker || key === "Escape")
    return { mode: "normal", picker: null, message: "" };
  if (key === "Enter") {
    const item = picker.results[picker.selected];
    return {
      mode: "normal",
      picker: null,
      panel: item ? { title: item.label, lines: item.lines } : null,
      message: item ? "" : "Telescope: no results",
    };
  }
  const move = (by: number) => ({
    picker: {
      ...picker,
      selected: Math.min(
        Math.max(picker.selected + by, 0),
        Math.max(0, picker.results.length - 1),
      ),
    },
  });
  if (key === "ArrowDown") return move(1);
  if (key === "ArrowUp") return move(-1);
  const query =
    key === "Backspace"
      ? picker.query.slice(0, -1)
      : key.length === 1
        ? picker.query + key
        : picker.query;
  return {
    picker: {
      query,
      selected: 0,
      results: fuzzy(state.content.places, query),
    },
  };
}

const HELP = [
  "Motions   h j k l  w b  0 $  gg G",
  "Insert    i a I A o O, then Esc",
  "Edit      x dd yy p P u, V then d or y",
  "",
  ":w            write the buffer",
  ":q            quit (try it)",
  ":{number}     go to that line",
  ":Kevnnard     who built this room (also :about)",
  ":Gentleman    the Gentleman Programming channel",
  ":Nest         the NestJS documentation",
  ":Lazy         the plugins behind this site",
  ":Telescope    find something in the room",
  ":checkhealth  is the world OK?",
  "",
  "Esc in NORMAL mode returns to the room.",
];

const SMILE = [
  "        .-''''''-.",
  "      .'          '.",
  "     /   O      O   \\",
  "    :                :",
  "    |                |",
  "    :   ',      ,'   :",
  "     \\    '----'    /",
  "      '.          .'",
  "        '-......-'",
  "",
  "You found :smile. Keep looking.",
];

const CANT_QUIT =
  "You can't quit Vim. Nobody can. Esc in NORMAL mode walks you back to the room.";

function written(state: EditorState) {
  const text = `${state.lines.join("\n")}\n`;
  const size = new TextEncoder().encode(text).length;
  return `"${state.file}" ${state.lines.length}L, ${size}B written`;
}

/** Runs a `:` command; unknown ones fail like Vim's E492. */
function execute(state: EditorState, input: string, env: EditorEnv): Patch {
  const command = input.trim();
  const done: Patch = { mode: "normal", command: "", error: false };
  const panel = (title: string, lines: readonly string[]): Patch => ({
    ...done,
    panel: { title, lines },
    message: "",
  });
  if (!command) return { ...done, message: "" };
  if (/^\d+$/.test(command))
    return { ...done, message: "", row: Number(command) - 1, col: 0 };
  const { content } = state;
  switch (command) {
    case "w":
    case "write":
      return {
        ...done,
        modified: false,
        message: `${written(state)} (kept until you leave the page)`,
      };
    case "q":
    case "quit":
      if (state.modified)
        return {
          ...done,
          error: true,
          message: "E37: No write since last change (add ! to override)",
        };
      return { ...done, message: CANT_QUIT };
    case "q!":
    case "quit!":
    case "qa":
    case "qa!":
      return {
        ...done,
        message: "Not even :q! can quit Vim here. Esc in NORMAL mode can.",
      };
    case "wq":
    case "x":
    case "wq!":
      return {
        ...done,
        modified: false,
        message: `${written(state)}, but you still can't quit Vim.`,
      };
    case "h":
    case "help":
      return panel("help.txt", HELP);
    case "Kevnnard":
    case "about":
      return panel("about.md", [
        content.about.name,
        "",
        content.about.summary,
        "",
        ...content.about.roles.map((role) => `• ${role}`),
        "",
        ...content.about.links.map((link) => `${link.label}: ${link.href}`),
      ]);
    case "Gentleman":
      return {
        ...done,
        view: "gentleman",
        message: "Gentleman Programming. Esc or the NVIM tab comes back.",
      };
    case "Nest":
    case "NestJS":
      return {
        ...done,
        view: "nest",
        message: "NestJS docs. Esc or the NVIM tab comes back.",
      };
    case "Lazy":
      return panel("lazy.nvim", [
        `Total: ${LAZY_PLUGINS.length} plugins   Loaded: ${LAZY_PLUGINS.length}`,
        "",
        ...LAZY_PLUGINS.map(
          (plugin) =>
            `● ${plugin.label.padEnd(18)} ${plugin.name}@${plugin.version}`,
        ),
      ]);
    case "Telescope":
      return {
        ...done,
        mode: "picker",
        message: "",
        picker: { query: "", selected: 0, results: content.places },
      };
    case "smile":
      return panel(":smile", SMILE);
    case "Hitman":
      return panel("Agent 47", [
        "Target acquired: the Hitman shelf of the TV library.",
        "",
        ...content.hitman.map((title) => `• ${title}`),
      ]);
    case "Tsushima":
      return panel("Ghost of Tsushima", [
        ...content.tsushima,
        "",
        "The katanas wait on the wall shelf.",
      ]);
    case "checkhealth": {
      const fps = env.fps ? `${Math.round(env.fps)} fps` : "not measured yet";
      return panel("health.txt", [
        'kevnnard-world: require("kevnnard.health").check()',
        "",
        `- OK tests: ${NVIM_HEALTH.tests} passing (node --test, when this was written)`,
        `- OK browser: ${fps}`,
        `- OK branch: ${NVIM_BRANCH}`,
        "- OK Neovim: you are inside it",
        "- WARNING :q does not work here. Esc in NORMAL mode does.",
      ]);
    }
    default:
      return {
        ...done,
        error: true,
        message: `E492: Not an editor command: ${command}`,
      };
  }
}

function commandMode(state: EditorState, key: string, env: EditorEnv): Patch {
  if (key === "Escape") return { mode: "normal", command: "" };
  if (key === "Enter") return execute(state, state.command, env);
  if (key === "Backspace")
    return state.command
      ? { command: state.command.slice(0, -1) }
      : { mode: "normal" };
  return key.length === 1 ? { command: state.command + key } : {};
}

/** One key, as KeyboardEvent.key names it. */
export function pressKey(
  state: EditorState,
  key: string,
  env: EditorEnv = {},
): EditorState {
  if (state.panel) {
    if (key === "Escape" || key === "q" || key === "Enter")
      return { ...state, panel: null };
    return state;
  }
  switch (state.mode) {
    case "insert":
      return settle(state, insertMode(state, key));
    case "visual":
      return settle(state, visual(state, key));
    case "command":
      return settle(state, commandMode(state, key, env));
    case "picker":
      return settle(state, pickerMode(state, key));
    default:
      return settle(state, normal(state, key));
  }
}
