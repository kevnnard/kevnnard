// portrait-neovim T1-T2 (S1, S2): the portrait screen's Neovim. From the
// room it types real excerpts of this repository in a loop (nvim-preview.ts);
// entered, a small modal editor with easter-egg commands (nvim-editor.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASE_STORIES } from "../../src/lib/world/case-stories.ts";
import {
  createEditor,
  EDITOR_ROWS,
  type EditorState,
  editorStatus,
  LAZY_PLUGINS,
  leavesEditor,
  NVIM_HEALTH,
  type NvimContent,
  nvimContent,
  pressKey,
} from "../../src/lib/world/nvim-editor.ts";
import {
  highlight,
  NVIM_BRANCH,
  PREVIEW_CYCLE_MS,
  PREVIEW_EXCERPTS,
  PREVIEW_ROWS,
  previewFrame,
  previewStill,
  previewTop,
  statusParts,
} from "../../src/lib/world/nvim-preview.ts";
import { portfolioBuffers } from "../../src/lib/world/terminal-content.ts";
import { TV_COVERS } from "../../src/lib/world/tv-covers.ts";
import experience from "../../src/utils/experience.json" with { type: "json" };
import projects from "../../src/utils/projects.json" with { type: "json" };

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("T1 idle preview: Neovim typing this repository's own code", () => {
  it("types verbatim excerpts of real files, attributed by path", () => {
    assert.ok(PREVIEW_EXCERPTS.length >= 3);
    for (const excerpt of PREVIEW_EXCERPTS) {
      assert.match(excerpt.file, /^src\/lib\/world\/[\w-]+\.ts$/);
      assert.equal(excerpt.filetype, "typescript");
      const source = read(excerpt.file);
      assert.ok(
        source.includes(excerpt.lines.join("\n")),
        `${excerpt.file} no longer contains its excerpt`,
      );
      // Short enough to stay on screen without scrolling past the top.
      assert.ok(excerpt.lines.length <= PREVIEW_ROWS, excerpt.file);
    }
  });

  it("opens empty, types in INSERT, saves with :w, then loops to the next file", () => {
    const start = previewFrame(0);
    assert.equal(start.excerpt, 0);
    assert.equal(start.mode, "NORMAL");
    assert.deepEqual(start.lines, [""]);
    assert.match(start.message, /\[New\]/);
    // Somewhere in the cycle: typing, the :w command and its message.
    const modes = new Set<string>();
    let written = "";
    let command = "";
    let last = -1;
    const seen = new Set<number>();
    for (let t = 0; t < PREVIEW_CYCLE_MS; t += 50) {
      const frame = previewFrame(t);
      modes.add(frame.mode);
      seen.add(frame.excerpt);
      if (frame.command) command = frame.command;
      if (/written$/.test(frame.message)) written = frame.message;
      // The text only grows within a file.
      if (frame.excerpt === 0) {
        const chars = frame.lines.join("\n").length;
        assert.ok(chars >= last, `typing went backwards at ${t}`);
        last = chars;
      }
    }
    assert.deepEqual([...modes].sort(), ["COMMAND", "INSERT", "NORMAL"]);
    assert.equal(command, ":w");
    assert.match(written, /^"src\/lib\/world\/[\w-]+\.ts" \d+L, \d+B written$/);
    assert.equal(seen.size, PREVIEW_EXCERPTS.length);
    // A whole cycle later, the same frame: it loops.
    assert.deepEqual(previewFrame(PREVIEW_CYCLE_MS + 1234), previewFrame(1234));
  });

  it("types the full excerpt before saving, at a natural, uneven pace", () => {
    const typed = new Map<number, number>();
    for (let t = 0; t < PREVIEW_CYCLE_MS; t += 10) {
      const frame = previewFrame(t);
      if (frame.excerpt !== 0) break;
      typed.set(t, frame.lines.join("\n").length);
      if (frame.mode === "COMMAND")
        assert.deepEqual(frame.lines, [...PREVIEW_EXCERPTS[0].lines]);
    }
    // Not one character per tick: pauses and bursts.
    const gaps: number[] = [];
    let previous = 0;
    let at = 0;
    for (const [t, chars] of typed) {
      if (chars !== previous) {
        if (at) gaps.push(t - at);
        at = t;
        previous = chars;
      }
    }
    assert.ok(Math.max(...gaps) > 3 * Math.min(...gaps), "uneven typing");
    // A file takes tens of seconds: readable, never minutes per file.
    const perFile = PREVIEW_CYCLE_MS / PREVIEW_EXCERPTS.length;
    assert.ok(perFile > 10_000 && perFile < 120_000, `${perFile}`);
  });

  it("keeps the cursor on screen and reports it as line:col", () => {
    for (let t = 0; t < PREVIEW_CYCLE_MS; t += 997) {
      const frame = previewFrame(t);
      const top = previewTop(frame);
      assert.ok(
        frame.cursor.row >= top && frame.cursor.row < top + PREVIEW_ROWS,
      );
    }
    const still = previewStill();
    assert.equal(still.mode, "NORMAL");
    assert.ok(still.lines.length > 1, "the still shows code");
    const parts = statusParts(still);
    assert.equal(parts.branch, NVIM_BRANCH);
    assert.equal(NVIM_BRANCH, "feat/interactive-room");
    assert.equal(parts.mode, "NORMAL");
    assert.equal(parts.filetype, "typescript");
    assert.match(parts.position, /^\d+:\d+$/);
    assert.equal(parts.file, PREVIEW_EXCERPTS[still.excerpt].file);
  });

  it("highlights keywords, strings, comments, numbers and types without losing text", () => {
    const line = '  const t = Number.isFinite(x) ? "a" : 0; // note';
    const spans = highlight(line);
    assert.equal(spans.map((s) => s.text).join(""), line);
    const kind = (text: string) => spans.find((s) => s.text === text)?.kind;
    assert.equal(kind("const"), "keyword");
    assert.equal(kind('"a"'), "string");
    assert.equal(kind("0"), "number");
    assert.equal(kind("Number"), "type");
    assert.equal(kind("isFinite"), "function");
    assert.equal(kind("// note"), "comment");
    for (const excerpt of PREVIEW_EXCERPTS)
      for (const source of excerpt.lines)
        assert.equal(
          highlight(source)
            .map((s) => s.text)
            .join(""),
          source,
        );
    assert.equal(highlight("/** Doc. */")[0].kind, "comment");
    assert.equal(highlight("   * more doc")[0].kind, "comment");
  });
});

const content = (): NvimContent =>
  nvimContent(portfolioBuffers({ projects, experience }).about);
const type = (state: EditorState, keys: readonly string[], fps = 60) =>
  keys.reduce((s, key) => pressKey(s, key, { fps }), state);
const chars = (text: string) => [...text];
const run = (state: EditorState, command: string) =>
  type(state, [":", ...chars(command), "Enter"]);
const blank = () => {
  const state = createEditor(content());
  return { ...state, lines: [""], row: 0, col: 0 };
};

describe("T2 entered: a small modal editor", () => {
  it("starts in NORMAL on a welcome buffer that hints at :help", () => {
    const state = createEditor(content());
    assert.equal(state.mode, "normal");
    assert.equal(state.view, "editor");
    assert.ok(state.lines.some((line) => line.includes(":help")));
    assert.equal(editorStatus(state).mode, "NORMAL");
    assert.equal(editorStatus(state).branch, NVIM_BRANCH);
  });

  it("inserts with i, a, o and O, and Esc returns to NORMAL", () => {
    let s = type(blank(), ["i", ...chars("hello"), "Escape"]);
    assert.deepEqual(s.lines, ["hello"]);
    assert.equal(s.mode, "normal");
    assert.equal(s.col, 4, "Esc steps back one, as in Vim");
    s = type(s, ["a", "!", "Escape"]);
    assert.deepEqual(s.lines, ["hello!"]);
    s = type(s, [
      "o",
      ...chars("below"),
      "Escape",
      "O",
      ...chars("mid"),
      "Escape",
    ]);
    assert.deepEqual(s.lines, ["hello!", "mid", "below"]);
    s = type(blank(), ["i", "a", "b", "Backspace", "Enter", "c", "Escape"]);
    assert.deepEqual(s.lines, ["a", "c"]);
    s = type(s, ["i", "Backspace", "Escape"]);
    assert.deepEqual(s.lines, ["ac"], "Backspace at column 0 joins lines");
  });

  it("moves with h j k l w b 0 $ gg G, clamped to the text", () => {
    let s = blank();
    s = { ...s, lines: ["const answer = 42;", "", "let x"] };
    s = type(s, ["$"]);
    assert.equal(s.col, 17);
    s = type(s, ["0", "w"]);
    assert.equal(s.col, 6);
    s = type(s, ["w", "w"]);
    assert.equal(s.col, 15);
    s = type(s, ["b"]);
    assert.equal(s.col, 13);
    s = type(s, ["G"]);
    assert.equal(s.row, 2);
    assert.ok(s.col <= 4);
    s = type(s, ["g", "g"]);
    assert.equal(s.row, 0);
    s = type(s, ["j", "l"]);
    assert.deepEqual([s.row, s.col], [1, 0], "an empty line holds column 0");
    s = type(s, ["k", "k", "h", "h"]);
    assert.equal(s.row, 0);
    assert.ok(s.col >= 0);
  });

  it("edits with x, dd, yy, p and undoes with u", () => {
    let s = { ...blank(), lines: ["one", "two", "three"] };
    s = type(s, ["x"]);
    assert.deepEqual(s.lines, ["ne", "two", "three"]);
    s = type(s, ["j", "d", "d"]);
    assert.deepEqual(s.lines, ["ne", "three"]);
    s = type(s, ["p"]);
    assert.deepEqual(s.lines, ["ne", "three", "two"]);
    s = type(s, ["g", "g", "y", "y", "G", "p"]);
    assert.deepEqual(s.lines, ["ne", "three", "two", "ne"]);
    s = type(s, ["u", "u", "u", "u"]);
    assert.deepEqual(s.lines, ["one", "two", "three"]);
    s = type(s, ["u"]);
    assert.match(s.message, /oldest change/);
    // One undo per insert session.
    s = type(s, ["A", ...chars(" more"), "Escape", "u"]);
    assert.deepEqual(s.lines, ["one", "two", "three"]);
  });

  it("selects whole lines with V and deletes or yanks them", () => {
    let s = { ...blank(), lines: ["a", "b", "c", "d"] };
    s = type(s, ["j", "V", "j"]);
    assert.equal(editorStatus(s).mode, "V-LINE");
    s = type(s, ["d"]);
    assert.deepEqual(s.lines, ["a", "d"]);
    assert.equal(s.mode, "normal");
    s = type(s, ["g", "g", "V", "y", "G", "p"]);
    assert.deepEqual(s.lines, ["a", "d", "a"]);
  });

  it("answers :w, :q, :wq and :q! playfully, never quitting", () => {
    let s = type(blank(), ["i", "x", "Escape"]);
    s = run(s, "q");
    assert.match(s.message, /E37: No write since last change/);
    assert.equal(s.error, true);
    s = run(s, "w");
    assert.match(s.message, /^"scratch\.ts" 1L, 2B written/);
    s = run(s, "q");
    assert.match(s.message, /can't quit Vim/i);
    for (const command of ["wq", "q!", "x", "qa!"]) {
      const out = run(s, command);
      assert.match(out.message, /quit/i, command);
      assert.equal(out.view, "editor");
    }
    s = run(s, "nope");
    assert.equal(s.message, "E492: Not an editor command: nope");
    assert.equal(s.error, true);
    s = run({ ...s, lines: ["a", "b", "c"] }, "2");
    assert.equal(s.row, 1, ":{line} jumps");
  });

  it("lists every command in :help, and every documented command exists", () => {
    const s = run(blank(), "help");
    assert.ok(s.panel);
    const help = s.panel.lines.join("\n");
    for (const command of [
      ":w",
      ":q",
      ":Kevnnard",
      ":Gentleman",
      ":Nest",
      ":Lazy",
      ":Telescope",
      ":checkhealth",
    ])
      assert.ok(help.includes(command), command);
    // Esc or q closes a panel.
    assert.equal(type(s, ["Escape"]).panel, null);
    assert.equal(type(s, ["q"]).panel, null);
    const docs = read("docs/world-portrait-neovim.md");
    for (const command of [
      ":help",
      ":Kevnnard",
      ":about",
      ":Gentleman",
      ":Nest",
      ":Lazy",
      ":Telescope",
      ":smile",
      ":Hitman",
      ":Tsushima",
      ":checkhealth",
      ":q",
    ]) {
      assert.ok(docs.includes(`\`${command}\``), `docs: ${command}`);
      const out = run(blank(), command.slice(1));
      assert.equal(out.error, false, command);
    }
  });
});

describe("T2 easter eggs: only the site's own facts", () => {
  it(":Kevnnard and :about show the site's existing bio", () => {
    const about = portfolioBuffers({ projects, experience }).about;
    for (const command of ["Kevnnard", "about"]) {
      const s = run(blank(), command);
      assert.ok(s.panel);
      const text = s.panel.lines.join("\n");
      assert.ok(text.includes(about.name));
      assert.ok(text.includes(about.summary));
      for (const role of about.roles) assert.ok(text.includes(role));
    }
  });

  it(":Gentleman and :Nest open the existing channel and docs views", () => {
    assert.equal(run(blank(), "Gentleman").view, "gentleman");
    assert.equal(run(blank(), "Nest").view, "nest");
    assert.equal(run(blank(), "NestJS").view, "nest");
  });

  it(":Lazy lists the site's real stack at its installed versions", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of [
      "astro",
      "react",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@biomejs/biome",
    ])
      assert.ok(
        LAZY_PLUGINS.some((p) => p.name === name),
        name,
      );
    for (const plugin of LAZY_PLUGINS)
      assert.equal(deps[plugin.name], plugin.version, plugin.name);
    const s = run(blank(), "Lazy");
    assert.ok(s.panel?.lines.some((line) => line.includes("Three.js")));
  });

  it(":Telescope fuzzy-finds the collection and the room's places", () => {
    let s = run(blank(), "Telescope");
    assert.equal(s.mode, "picker");
    const all = s.picker?.results.length ?? 0;
    assert.ok(all >= 5);
    s = type(s, chars("kat"));
    assert.equal(s.picker?.results[0].label, CASE_STORIES.katana.title);
    s = type(s, ["Enter"]);
    assert.equal(s.mode, "normal");
    assert.ok(s.panel?.lines.join(" ").includes(CASE_STORIES.katana.kicker));
    s = run(blank(), "Telescope");
    s = type(s, chars("zzzz"));
    assert.equal(s.picker?.results.length, 0);
    s = type(s, ["Escape"]);
    assert.equal(s.mode, "normal");
  });

  it(":Hitman and :Tsushima come from the TV library and the katana story", () => {
    const hitman = run(blank(), "Hitman");
    const titles = Object.values(TV_COVERS)
      .map((cover) => cover.title)
      .filter((title) => title.startsWith("Hitman"));
    assert.ok(titles.length > 0);
    for (const title of titles)
      assert.ok(hitman.panel?.lines.some((line) => line.includes(title)));
    const tsushima = run(blank(), "Tsushima");
    assert.ok(
      tsushima.panel?.lines
        .join(" ")
        .includes("Ghost of Tsushima is my favorite game."),
    );
  });

  it(":checkhealth reports a static test count and the measured fps", () => {
    const s = type(blank(), [":", ...chars("checkhealth"), "Enter"], 57);
    const text = s.panel?.lines.join("\n") ?? "";
    assert.ok(text.includes(`${NVIM_HEALTH.tests} passing`));
    assert.match(text, /57 fps/);
    assert.ok(Number.isInteger(NVIM_HEALTH.tests) && NVIM_HEALTH.tests > 0);
    assert.ok(run(blank(), "smile").panel);
  });
});

describe("T2 keys and focus: the editor keeps its keys, normal Esc leaves", () => {
  it("lets only a plain NORMAL-mode Esc through to the room", () => {
    const s = blank();
    assert.equal(leavesEditor(s), true);
    assert.equal(leavesEditor(type(s, ["i"])), false);
    assert.equal(leavesEditor(type(s, [":"])), false);
    assert.equal(leavesEditor(type(s, ["V"])), false);
    assert.equal(leavesEditor(type(s, ["d"])), false, "pending operator");
    assert.equal(leavesEditor(run(s, "help")), false, "open panel");
    assert.equal(leavesEditor(run(s, "Telescope")), false);
  });

  it("scrolls the buffer to keep the cursor in its rows", () => {
    let s = blank();
    s = { ...s, lines: Array.from({ length: 100 }, (_, i) => `${i}`) };
    s = type(s, ["G"]);
    assert.ok(s.top <= s.row && s.row < s.top + EDITOR_ROWS);
    s = type(s, ["g", "g"]);
    assert.equal(s.top, 0);
  });
});

describe("T1-T2 wiring on the portrait screen", () => {
  const page = read("src/components/world/PortraitScreen.tsx");
  const nvim = read("src/components/world/NvimScreen.tsx");

  it("draws the preview as a throttled canvas texture that rests when it should", () => {
    assert.match(nvim, /CanvasTexture/);
    assert.match(nvim, /previewFrame\(/);
    assert.match(nvim, /previewStill\(\)/);
    assert.match(nvim, /setInterval\(/);
    assert.match(nvim, /PREVIEW_TICK_MS/);
    assert.match(nvim, /document\.hidden/);
    assert.match(nvim, /visibilitychange/);
    // Only redraws (and re-uploads) when the frame changed.
    assert.match(nvim, /needsUpdate = true/);
    assert.match(page, /<NvimPreview\b/);
    // Rests unless the room view faces the screen; reduced motion is still.
    assert.match(page, /mode === "preview"/);
    assert.match(page, /reducedMotion/);
  });

  it("mounts the DOM page only in the close-up, with Neovim, Gentleman and NestJS tabs", () => {
    assert.match(page, /const mounted = focused && mode !== "off"/);
    assert.match(page, /<NvimEditor\b/);
    for (const tab of ["NVIM", "Gentleman", "NestJS"])
      assert.ok(page.includes(`"${tab}"`), tab);
    // Each iframe loads only in its own view.
    assert.match(page, /view === "gentleman"/);
    assert.match(page, /view === "nest"/);
  });

  it("keeps keyboard focus in the editor and announces mode and output", () => {
    assert.match(nvim, /aria-live="polite"/);
    assert.match(nvim, /preventScroll: true/);
    assert.match(nvim, /stopPropagation\(\)/);
    assert.match(nvim, /leavesEditor\(/);
    assert.match(nvim, /onKeyDown/);
    assert.doesNotMatch(nvim, /position:\s*fixed/);
    const css = read("src/components/world/nvim-screen.css");
    assert.doesNotMatch(css, /position:\s*fixed|100vw|100vh/);
  });
});
