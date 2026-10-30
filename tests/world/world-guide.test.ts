// World game guide (world-game-menu T1, S2/S3/S5): every key the guide
// documents must do what it says in the current source, and nothing is
// borrowed from another world's controls.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ConsoleTargets,
  consoleKeydown,
} from "../../src/lib/world/speaker-console.ts";
import {
  CONTACT_LINKS,
  terminalKey,
} from "../../src/lib/world/terminal-content.ts";
import {
  GUIDE_SECTIONS,
  type GuideSectionId,
  guideSection,
} from "../../src/lib/world/world-guide.ts";

const section = (id: GuideSectionId) => guideSection(id);
const keysOf = (id: GuideSectionId) =>
  section(id).keys.flatMap((entry) => entry.keys);

const BODY = { kind: "body" };
const world: ConsoleTargets = {
  owns: () => true,
  editable: () => false,
  activates: () => false,
};
const consoleAction = (key: string) =>
  consoleKeydown(
    {
      key,
      target: BODY,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      defaultPrevented: false,
    },
    world,
  );
const terminalAction = (key: string, active: "home" | "a" = "home") =>
  terminalKey(
    { key, altKey: false, ctrlKey: false, metaKey: false, editable: false },
    active,
  );

describe("world game guide sections", () => {
  it("has the requested tabs in order: Home, Controls, Terminal, Video, Lo-fi, Credits", () => {
    assert.deepEqual(
      GUIDE_SECTIONS.map((entry) => entry.id),
      ["home", "controls", "terminal", "video", "lofi", "credits"],
    );
    assert.equal(section("home").title, "Kevnnard Home");
    assert.equal(section("lofi").tab, "Kevnnard Lo-fi");
    for (const entry of GUIDE_SECTIONS) {
      assert.ok(entry.tab.trim(), entry.id);
      assert.ok(entry.eyebrow.trim(), entry.id);
      assert.ok(entry.illustration.trim(), `${entry.id} has an image label`);
    }
  });

  it("introduces the 3D portfolio without inventing an employer or biography", () => {
    const text = section("home").paragraphs.join(" ");
    for (const word of ["portfolio", "3D", "work", "technologies"])
      assert.ok(text.includes(word), word);
    assert.doesNotMatch(text, /\b(years|CEO|founder|employed|born)\b/i);
  });

  it("links home to the static portfolio and the real contact profiles only", () => {
    const links = section("home").links;
    assert.deepEqual(links[0], { label: "Static portfolio", href: "/" });
    assert.deepEqual(links.slice(1), CONTACT_LINKS);
  });

  it("launches only the actions the world already has", () => {
    const actions = GUIDE_SECTIONS.flatMap((entry) => entry.actions);
    for (const id of ["terminal", "video", "music", "speakers", "recenter"])
      assert.ok(actions.includes(id as (typeof actions)[number]), id);
    assert.deepEqual(section("terminal").actions, ["terminal"]);
    assert.deepEqual(section("video").actions, ["video"]);
    assert.deepEqual(section("lofi").actions, ["music", "speakers"]);
    assert.ok(section("controls").actions.includes("recenter"));
  });
});

describe("documented keys match the current source", () => {
  it("lo-fi: Space, N, P, + and − in speaker focus, Esc leaves (not Backspace)", () => {
    const keys = keysOf("lofi");
    assert.deepEqual(keys, ["Space", "N", "P", "+", "−", "Esc"]);
    assert.equal(consoleAction(" "), "toggle");
    assert.equal(consoleAction("n"), "next");
    assert.equal(consoleAction("p"), "previous");
    assert.equal(consoleAction("+"), "louder");
    assert.equal(consoleAction("-"), "quieter");
    assert.equal(consoleAction("Escape"), "exit");
    assert.equal(consoleAction("Backspace"), null);
    assert.ok(!keys.includes("Backspace"));
    const scope = section("lofi")
      .keys.map((entry) => entry.action)
      .join(" ");
    assert.match(scope, /speaker focus/i, "keys are scoped to the close-up");
  });

  it("terminal: A, P, E, C open buffers; J, K scroll; Esc goes back, then leaves", () => {
    assert.deepEqual(keysOf("terminal"), ["A", "P", "E", "C", "J", "K", "Esc"]);
    for (const letter of ["a", "p", "e", "c"])
      assert.deepEqual(terminalAction(letter), {
        type: "open",
        buffer: letter,
      });
    assert.deepEqual(terminalAction("j"), { type: "scroll", lines: 1 });
    assert.deepEqual(terminalAction("k"), { type: "scroll", lines: -1 });
    assert.deepEqual(terminalAction("Escape", "a"), {
      type: "open",
      buffer: "home",
    });
    assert.deepEqual(terminalAction("Escape"), { type: "exit" });
  });

  it("controls: pointer orbit and zoom only, no panning, driving or gamepad", () => {
    const text = JSON.stringify(section("controls"));
    assert.match(text, /Drag/);
    assert.match(text, /Scroll/);
    assert.match(text, /Pinch/);
    const all = JSON.stringify(GUIDE_SECTIONS);
    assert.doesNotMatch(all, /WASD|gamepad|joystick|jump|drive|car\b|Shift/i);
    assert.doesNotMatch(all, /\bpan\b/i);
    assert.doesNotMatch(all, /Backspace/);
  });

  it("video: the player's own controls, Esc returns", () => {
    assert.deepEqual(keysOf("video"), ["Esc"]);
  });
});
