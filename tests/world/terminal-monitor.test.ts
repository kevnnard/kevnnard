import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { safeExternalUrl } from "../../src/lib/room/terminal.ts";
import {
  ASCII_COLUMNS,
  BUFFERS,
  type BufferId,
  KEVNNARD_ASCII,
  portfolioBuffers,
  terminalKey,
  terminalKeydown,
} from "../../src/lib/world/terminal-content.ts";
import experience from "../../src/utils/experience.json" with { type: "json" };
import projects from "../../src/utils/projects.json" with { type: "json" };

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const key = (
  k: string,
  extra: Partial<Parameters<typeof terminalKey>[0]> = {},
) => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  editable: false,
  ...extra,
});
const data = { projects, experience };

describe("terminal navigation (T16)", () => {
  it("opens the same a/p/e/c buffers the dashboard buttons list", () => {
    assert.deepEqual(Object.keys(BUFFERS), ["a", "p", "e", "c"]);
    assert.deepEqual(
      Object.values(BUFFERS).map((b) => b.label),
      ["About", "Projects", "Experience", "Contact"],
    );
    for (const id of ["a", "p", "e", "c"] as const) {
      assert.deepEqual(terminalKey(key(id), "home"), {
        type: "open",
        buffer: id,
      });
      assert.deepEqual(terminalKey(key(id.toUpperCase()), "p"), {
        type: "open",
        buffer: id,
      });
    }
  });

  it("Esc goes buffer -> dashboard, then dashboard -> exit", () => {
    assert.deepEqual(terminalKey(key("Escape"), "e"), {
      type: "open",
      buffer: "home",
    });
    assert.deepEqual(terminalKey(key("Escape"), "home"), { type: "exit" });
  });

  it("j/k scroll the buffer, as in Neovim, unless modified", () => {
    assert.deepEqual(terminalKey(key("j"), "p"), { type: "scroll", lines: 1 });
    assert.deepEqual(terminalKey(key("k"), "p"), { type: "scroll", lines: -1 });
    assert.equal(terminalKey(key("j", { metaKey: true }), "p"), null);
  });

  it("never takes modified keys, form fields or native Space/Tab/Enter", () => {
    assert.equal(terminalKey(key("a", { metaKey: true }), "home"), null);
    assert.equal(terminalKey(key("p", { ctrlKey: true }), "home"), null);
    assert.equal(terminalKey(key("e", { altKey: true }), "home"), null);
    assert.equal(terminalKey(key("c", { editable: true }), "home"), null);
    for (const native of [" ", "Tab", "Enter", "x", "ArrowDown"])
      assert.equal(terminalKey(key(native), "home"), null, native);
  });
});

describe("portfolio buffers (T16)", () => {
  const buffers = portfolioBuffers(data);

  it("lists every real project with its safe public links", () => {
    assert.deepEqual(
      buffers.projects.map((p) => p.title),
      projects.map((p) => p.title),
    );
    for (const [i, project] of buffers.projects.entries()) {
      assert.equal(project.description, projects[i].description);
      assert.deepEqual(
        project.links.map((l) => l.href),
        projects[i].url.map((u) => safeExternalUrl(u.url)).filter(Boolean),
      );
      assert.ok(project.links.length > 0);
      assert.ok(project.tags.length > 0);
    }
  });

  it("drops unsafe link protocols through the room's validator", () => {
    const unsafe = portfolioBuffers({
      projects: [
        {
          ...projects[0],
          url: [
            { icon: "WEB", url: "javascript:alert(1)", isSolid: false },
            { icon: "WEB", url: "data:text/html,x", isSolid: false },
            {
              icon: "GITHUB",
              url: "https://github.com/kevnnard/dots",
              isSolid: true,
            },
          ],
        },
      ],
      experience: [{ ...experience[0], link: "javascript:void 0" }],
    });
    assert.deepEqual(
      unsafe.projects[0].links.map((l) => l.href),
      ["https://github.com/kevnnard/dots"],
    );
    assert.equal(unsafe.experience[0].link, null);
  });

  it("keeps the experience entries verbatim, without invented dates", () => {
    assert.deepEqual(
      buffers.experience.map((e) => [e.company, e.title, e.duration]),
      experience.map((e) => [e.company, e.title, e.duration.trim()]),
    );
    for (const [i, entry] of buffers.experience.entries())
      assert.equal(entry.link, safeExternalUrl(experience[i].link ?? ""));
  });

  it("contacts are the homepage footer's profiles; no email is invented", () => {
    const footer = read("src/components/page/Footer.astro");
    assert.deepEqual(
      buffers.contact.map((l) => l.label),
      ["GitHub", "LinkedIn", "X"],
    );
    for (const link of buffers.contact) {
      assert.ok(
        footer.includes(`url: "${link.href.replace(/\/$/, "")}"`),
        link.href,
      );
      assert.equal(safeExternalUrl(link.href), link.href);
    }
    const text = JSON.stringify(buffers);
    assert.doesNotMatch(text, /mailto:|@[a-z]+\.[a-z]/i);
  });

  it("about uses the portfolio's own facts and CV links", () => {
    const about = read("src/components/page/AboutMe.astro");
    for (const link of buffers.about.links)
      assert.ok(about.includes(link.href), link.href);
    assert.deepEqual(
      buffers.about.roles,
      experience
        .filter((e) => e.isCurrent)
        .map((e) => `${e.title} @ ${e.company}`),
    );
  });
});

describe("dashboard header (T16)", () => {
  it("spells KEVNNARD in six rows that never exceed the measured width", () => {
    assert.equal(KEVNNARD_ASCII.length, 6);
    assert.equal(ASCII_COLUMNS, 69);
    for (const row of KEVNNARD_ASCII)
      assert.ok([...row].length <= ASCII_COLUMNS);
    assert.equal(
      Math.max(...KEVNNARD_ASCII.map((r) => [...r].length)),
      ASCII_COLUMNS,
    );
  });

  // L68: keys are routed once by WorldApp (terminalKeydown), not here.
  it("the companion renders text and native new-tab links, not HTML", () => {
    const terminal = read("src/components/world/TerminalMonitor.tsx");
    assert.match(terminal, /target="_blank"/);
    assert.doesNotMatch(terminal, /innerHTML/);
  });
});

describe("terminal keys while open (T16, L68)", () => {
  const body = { id: "body" };
  const link = { id: "companion-link" };
  const field = { id: "input" };
  const outside = { id: "exit-pill" };
  const owned = new Set<object>([body, link, field]);
  const fire = (
    k: string,
    target: object,
    active: BufferId = "home",
    extra = {},
  ) => {
    let prevented = false;
    const action = terminalKeydown(
      {
        ...key(k),
        isComposing: false,
        defaultPrevented: false,
        target,
        preventDefault: () => {
          prevented = true;
        },
        ...extra,
      },
      { active, owns: (t) => owned.has(t), editable: (t) => t === field },
    );
    return { action, prevented };
  };

  it("works right after a screen click (focus on the page body), no hidden focus needed", () => {
    for (const k of ["a", "p", "e", "c"]) {
      const { action, prevented } = fire(k, body);
      assert.deepEqual(action, { type: "open", buffer: k });
      assert.equal(prevented, true);
    }
    assert.deepEqual(fire("j", body, "p").action, { type: "scroll", lines: 1 });
    assert.deepEqual(fire("k", link, "p").action, {
      type: "scroll",
      lines: -1,
    });
    assert.deepEqual(fire("Escape", body, "e").action, {
      type: "open",
      buffer: "home",
    });
    assert.deepEqual(fire("Escape", link, "home").action, { type: "exit" });
  });

  it("leaves other focus, fields, composition, modifiers and native keys alone", () => {
    for (const [k, target, extra] of [
      ["a", outside, {}],
      ["p", field, {}],
      ["e", body, { isComposing: true }],
      ["c", body, { defaultPrevented: true }],
      ["a", body, { metaKey: true }],
      ["Enter", link, {}],
      ["Tab", body, {}],
      [" ", link, {}],
    ] as const) {
      const { action, prevented } = fire(k, target, "home", extra);
      assert.equal(action, null, `${k}`);
      assert.equal(prevented, false);
    }
  });

  it("reads browser-style inherited event properties, including Escape and modifiers", () => {
    for (const shortcut of ["a", "p", "e", "c", "j", "k", "Escape"]) {
      for (const control of [false, true]) {
        class BrowserKey extends Event {
          get key() {
            return shortcut;
          }
          get altKey() {
            return false;
          }
          get ctrlKey() {
            return control;
          }
          get metaKey() {
            return false;
          }
          get isComposing() {
            return false;
          }
        }
        const event = new BrowserKey("keydown", { cancelable: true });
        assert.equal(Object.hasOwn(event, "key"), false);
        const action = terminalKeydown(event, {
          active: "home",
          owns: () => true,
          editable: () => false,
        });
        const expected = control
          ? null
          : terminalKey({ ...key(shortcut) }, "home");
        assert.deepEqual(action, expected, `${shortcut}, ctrl=${control}`);
        assert.equal(event.defaultPrevented, expected !== null);
      }
    }
  });

  it("one document listener while the terminal is open; the companion no longer routes keys", () => {
    const app = read("src/components/world/WorldApp.tsx");
    assert.match(app, /document\.addEventListener\("keydown", onKey\)/);
    assert.match(app, /document\.removeEventListener\("keydown", onKey\)/);
    assert.match(app, /terminalKeydown\(/);
    const companion = read("src/components/world/TerminalMonitor.tsx");
    assert.doesNotMatch(companion, /onKeyDown/);
  });
});
