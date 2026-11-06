// World game guide (world-game-menu T1, S2/S3/S5): every key the guide
// documents must do what it says in the current source, and nothing is
// borrowed from another world's controls.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHERRY_FADE,
  CHERRY_MEET_HOUR,
  CHERRY_STORY,
  cherryMeeting,
  isCherryHour,
} from "../../src/lib/world/cherry.ts";
import {
  type ConsoleTargets,
  consoleKeydown,
} from "../../src/lib/world/speaker-console.ts";
import {
  CONTACT_LINKS,
  terminalKey,
} from "../../src/lib/world/terminal-content.ts";
import {
  initialTvHome,
  tvHomeAction,
  tvMove,
  tvRegionId,
} from "../../src/lib/world/tv-screen.ts";
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
  it("has the requested tabs in order, grouped by place, Credits last", () => {
    // The desk (terminal, video), the living room (TV, lo-fi), the
    // collection, the yard (Cherry), then Credits (guide-menu-new T1).
    assert.deepEqual(
      GUIDE_SECTIONS.map((entry) => entry.id),
      [
        "home",
        "controls",
        "terminal",
        "video",
        "tv",
        "lofi",
        "collection",
        "cherry",
        "credits",
      ],
    );
    assert.deepEqual(
      GUIDE_SECTIONS.map((entry) => entry.tab),
      [
        "Kevnnard Home",
        "Controls",
        "Terminal",
        "Video",
        "TV",
        "Kevnnard Lo-fi",
        "Collection",
        "Cherry",
        "Credits",
      ],
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
    for (const id of [
      "terminal",
      "video",
      "music",
      "speakers",
      "ambient",
      "recenter",
      "tv",
      "collection",
      "desk",
      "cherry",
    ])
      assert.ok(actions.includes(id as (typeof actions)[number]), id);
    assert.deepEqual(section("tv").actions, ["tv"]);
    assert.deepEqual(section("collection").actions, ["collection", "desk"]);
    assert.deepEqual(section("cherry").actions, ["cherry"]);
    assert.deepEqual(section("terminal").actions, ["terminal"]);
    assert.deepEqual(section("video").actions, ["video"]);
    assert.deepEqual(section("lofi").actions, ["music", "speakers", "ambient"]);
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

describe("the TV, the collection and Cherry (guide-menu-new T1)", () => {
  it("tv: arrows move the remote, Enter selects, Esc closes the player then leaves", () => {
    assert.deepEqual(keysOf("tv"), ["Arrows", "Enter", "Esc"]);
    const home = initialTvHome();
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])
      assert.ok(tvMove(home, key), key);
    assert.equal(tvMove(home, "Enter"), null, "only the arrows move");
    // Enter presses the remote's region, as TvHome.tsx does.
    const next = tvMove(home, "ArrowRight");
    assert.ok(next);
    const picked = tvHomeAction(next, tvRegionId(next.pos));
    assert.notDeepEqual(picked.state.hero, home.hero, "Enter selects");
    const playing = tvHomeAction(home, "secondary").state;
    assert.ok(playing.player, "a trailer plays");
    const closed = tvHomeAction(playing, "escape");
    assert.equal(closed.state.player, null, "Esc closes the player first");
    assert.equal(closed.effect, null);
    assert.equal(tvHomeAction(closed.state, "escape").effect, "exit");
    const text = section("tv").paragraphs.join(" ");
    for (const word of ["Kevnnard TV", "YouTube", "Twitch", "Trailers"])
      assert.ok(text.includes(word), word);
  });

  it("collection: the cases, katanas and shelf, then the desk's keyboard and coffee cup", () => {
    const text = section("collection").paragraphs.join(" ");
    for (const word of [
      "case",
      "katanas",
      "collection shelf",
      "keyboard",
      "coffee cup",
    ])
      assert.ok(text.includes(word), word);
    // The rail's own keys (CollectionRail.tsx) and the gallery's Esc.
    assert.deepEqual(keysOf("collection"), ["←", "→", "Esc"]);
  });

  it("cherry: one short line, only what her card already says", () => {
    const entry = section("cherry");
    assert.equal(entry.tab, "Cherry");
    const text = entry.paragraphs.join(" ");
    assert.match(text, /Miniature Pinscher/);
    assert.match(text, /nineteen years/);
    assert.match(text, /front yard/);
    assert.match(text, /morning/);
    assert.ok(CHERRY_STORY.stats.some((stat) => stat.value === "19+ years"));
    assert.ok(entry.paragraphs.length <= 2, "short");
    assert.deepEqual(keysOf("cherry"), ["Esc"]);
  });

  it("meet cherry: inspects her in her hours, else moves the clock to 08:00 and waits for her fade", () => {
    assert.equal(CHERRY_MEET_HOUR, 8);
    assert.ok(isCherryHour(CHERRY_MEET_HOUR));
    assert.deepEqual(cherryMeeting(9.5, false), {
      label: "Meet Cherry",
      hours: null,
      waitMs: 0,
    });
    for (const hours of [0, 5.99, 12, 18.25, 23.9])
      assert.deepEqual(
        cherryMeeting(hours, false),
        {
          label: "Meet Cherry · morning",
          hours: CHERRY_MEET_HOUR,
          waitMs: CHERRY_FADE * 1000,
        },
        String(hours),
      );
    // Reduced motion cuts her fade, so nothing to wait for.
    assert.equal(cherryMeeting(20, true).waitMs, 0);
    assert.equal(cherryMeeting(20, true).hours, CHERRY_MEET_HOUR);
    assert.equal(cherryMeeting(Number.NaN, false).hours, CHERRY_MEET_HOUR);
  });
});
