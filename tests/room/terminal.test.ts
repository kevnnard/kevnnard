import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  createTerminalSession,
  runTerminalCommand,
  safeExternalUrl,
  type TerminalData,
} from "../../src/lib/room/terminal.ts";
import experience from "../../src/utils/experience.json" with { type: "json" };
import projects from "../../src/utils/projects.json" with { type: "json" };

const data: TerminalData = { projects, experience };

const text = (lines: { text: string }[]) => lines.map((l) => l.text).join("\n");

describe("runTerminalCommand", () => {
  it("lists every allowlisted command for help", () => {
    const out = text(runTerminalCommand("help", data).lines);
    for (const cmd of ["help", "projects", "stack", "about", "clear", "open"]) {
      assert.match(out, new RegExp(`\\b${cmd}\\b`));
    }
  });

  it("lists every real project with its status, numbered from 1", () => {
    const out = text(runTerminalCommand("projects", data).lines);
    projects.forEach((project, index) => {
      assert.ok(out.includes(`${index + 1}. ${project.title}`), project.title);
    });
    assert.match(out, /released/);
  });

  it("derives stack from real project tags without duplicates", () => {
    const { lines } = runTerminalCommand("stack", data);
    const out = text(lines);
    assert.ok(out.includes("TypeScript"));
    assert.ok(out.includes("Supabase"));
    assert.equal(out.split("Turborepo").length - 1, 1);
  });

  it("summarizes real experience for about", () => {
    const out = text(runTerminalCommand("about", data).lines);
    for (const role of experience) assert.ok(out.includes(role.company));
  });

  it("signals clear without producing output", () => {
    const result = runTerminalCommand("  CLEAR  ", data);
    assert.equal(result.clear, true);
    assert.deepEqual(result.lines, []);
  });

  it("opens a project by number, title or slug with a validated https url", () => {
    const byIndex = runTerminalCommand("open 2", data);
    assert.equal(byIndex.open?.url, "https://app.threeelabs.com/");
    const byTitle = runTerminalCommand("open three trackr", data);
    assert.equal(byTitle.open?.title, "Three Trackr");
    const bySlug = runTerminalCommand("open smart-window", data);
    assert.equal(bySlug.open?.url, "https://github.com/kevnnard/smart-window");
  });

  it("rejects unknown commands without executing anything", () => {
    for (const input of [
      "rm -rf /",
      "eval(alert(1))",
      "ls",
      "$(whoami)",
      "help; projects",
      "constructor",
      "__proto__",
      "toString",
    ]) {
      const result = runTerminalCommand(input, data);
      assert.equal(result.lines[0]?.kind, "error", input);
      assert.equal(result.open, undefined);
      assert.equal(result.clear, undefined);
    }
  });

  it("reports unknown or missing open targets", () => {
    assert.equal(runTerminalCommand("open", data).lines[0]?.kind, "error");
    assert.equal(runTerminalCommand("open 99", data).lines[0]?.kind, "error");
    assert.equal(runTerminalCommand("open nope", data).open, undefined);
  });

  it("refuses to open projects whose url is not http(s)", () => {
    const unsafe: TerminalData = {
      experience: [],
      projects: [
        {
          ...projects[0],
          title: "Bad",
          url: [{ icon: "WEB", url: "javascript:alert(1)", isSolid: false }],
        },
      ],
    };
    const result = runTerminalCommand("open bad", unsafe);
    assert.equal(result.open, undefined);
    assert.equal(result.lines[0]?.kind, "error");
  });

  it("rejects overly long input", () => {
    const result = runTerminalCommand(`open ${"a".repeat(500)}`, data);
    assert.equal(result.lines[0]?.kind, "error");
  });
});

describe("safeExternalUrl", () => {
  it("accepts only absolute http(s) urls", () => {
    assert.equal(
      safeExternalUrl("https://kevnnard.com"),
      "https://kevnnard.com/",
    );
    assert.equal(safeExternalUrl("javascript:alert(1)"), null);
    assert.equal(safeExternalUrl("data:text/html,hi"), null);
    assert.equal(safeExternalUrl("/relative"), null);
    assert.equal(safeExternalUrl("not a url"), null);
  });
});

describe("createTerminalSession", () => {
  it("records input and output, keeps history on errors and empties on clear", () => {
    const session = createTerminalSession(data);
    const initial = session.history().length;
    session.submit("projects");
    const afterProjects = session.history().length;
    assert.ok(afterProjects > initial);
    assert.equal(session.history().at(-1 - projects.length - 1)?.kind, "input");

    session.submit("bogus");
    const afterError = session.history();
    assert.equal(afterError.length, afterProjects + 2);
    assert.equal(afterError.at(-1)?.kind, "error");

    session.submit("clear");
    assert.equal(session.history().length, 0);
  });

  it("ignores blank input and returns immutable snapshots", () => {
    const session = createTerminalSession(data);
    const before = session.history();
    session.submit("   ");
    assert.equal(session.history().length, before.length);
    assert.throws(() => (before as unknown as unknown[]).push({}));
  });
});

describe("static entry", () => {
  const index = readFileSync(
    new URL("../../src/pages/index.astro", import.meta.url),
    "utf8",
  );

  it("keeps every existing homepage section", () => {
    for (const section of [
      "<Main />",
      "<Experience />",
      "<Projects />",
      "<AboutMe />",
      "<Skills />",
    ]) {
      assert.ok(index.includes(section), section);
    }
  });

  it("links to /world without loading any 3d code", () => {
    assert.match(index, /href="\/world"/);
    assert.doesNotMatch(index, /three|@react-three|components\/room|\.glb/);
  });
});
