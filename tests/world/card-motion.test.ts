import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CARD_ENTER_EASE,
  CARD_ENTER_MS,
  CARD_EXIT_EASE,
  CARD_EXIT_MS,
  CARD_STAGGER_MS,
  type CardEntry,
  cardFallbackMs,
  endCard,
  isOwnMotion,
  showCard,
} from "../../src/lib/world/card-motion.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const keyframes = (css: string, name: string) =>
  css.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("card motion timing (card-motion T1)", () => {
  const gate = source("src/components/world/world-entry-gate.css");
  const css = source("src/components/world/case-story.css");

  it("enters with the clock and scene panel's return fade", () => {
    // The panel and clock replay world-entry-hud-in when the gallery's
    // display: none lifts on the way back to the room.
    const [, ms, ease] =
      gate.match(
        /> \.scene-panel,[\s\S]*?animation: world-entry-hud-in (\d+)ms ([a-z-]+) both;/,
      ) ?? [];
    assert.equal(CARD_ENTER_MS, Number(ms));
    assert.equal(CARD_ENTER_EASE, ease);
    // Opacity only, like the reference: no offset, scale or blur.
    const reference = keyframes(gate, "world-entry-hud-in");
    assert.match(reference, /opacity: 0/);
    assert.doesNotMatch(reference, /transform|filter/);
    const enter = keyframes(css, "card-motion-in");
    assert.match(enter, /from \{\s*opacity: 0;\s*\}/);
    assert.match(enter, /to \{\s*opacity: 1;\s*\}/);
    assert.doesNotMatch(enter, /transform|filter/);
  });

  it("leaves in reverse, a little faster", () => {
    assert.ok(CARD_EXIT_MS < CARD_ENTER_MS);
    assert.ok(CARD_EXIT_MS >= CARD_ENTER_MS * 0.6);
    assert.equal(CARD_EXIT_EASE, "ease-in");
    const leave = keyframes(css, "card-motion-out");
    assert.match(leave, /from \{\s*opacity: 1;\s*\}/);
    assert.match(leave, /to \{\s*opacity: 0;\s*\}/);
  });

  it("styles the shared states with those constants", () => {
    assert.match(
      css,
      new RegExp(
        `\\[data-state="entering"\\] \\{\\s*animation: card-motion-in ${CARD_ENTER_MS}ms ${CARD_ENTER_EASE} both;`,
      ),
    );
    assert.match(
      css,
      new RegExp(
        `\\[data-state="leaving"\\] \\{\\s*pointer-events: none;\\s*animation: card-motion-out ${CARD_EXIT_MS}ms ${CARD_EXIT_EASE} both;`,
      ),
    );
    // Every root the three cards render: the story, its fold, the wall card.
    for (const root of [
      ".case-story",
      ".case-story-reopen",
      ".katana-story",
      ".katana-story-reopen",
    ])
      assert.ok(css.includes(root), root);
  });

  it("staggers the inner sections subtly, finishing with the card", () => {
    assert.ok(CARD_STAGGER_MS > 0 && CARD_STAGGER_MS <= 80);
    const delays = [...css.matchAll(/animation-delay: (\d+)ms/g)].map((m) =>
      Number(m[1]),
    );
    assert.ok(delays.length >= 4);
    for (const [index, delay] of delays.entries())
      assert.equal(delay, (index + 1) * CARD_STAGGER_MS);
    const section = css.match(
      /animation: card-motion-section (\d+)ms ease-out both;/,
    );
    assert.ok(section, "section animation");
    assert.ok(Number(section[1]) + Math.max(...delays) <= CARD_ENTER_MS);
    const rise = keyframes(css, "card-motion-section");
    assert.match(rise, /translateY\(4px\)/);
  });

  it("keeps reduced motion still", () => {
    const reduced = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g,
    );
    assert.ok(
      reduced?.some((rule) =>
        /\[data-state\][\s\S]*animation: none;/.test(rule),
      ),
    );
  });

  it("waits a little longer than each animation before its fallback", () => {
    assert.ok(cardFallbackMs("entering") > CARD_ENTER_MS);
    assert.ok(cardFallbackMs("leaving") > CARD_EXIT_MS);
    assert.ok(cardFallbackMs("leaving") < CARD_ENTER_MS + 500);
  });
});

describe("card presence (card-motion T1)", () => {
  const none: readonly CardEntry<string>[] = [];

  it("enters, opens on its animation's end, leaves, then unmounts", () => {
    const shown = showCard(none, "coffee", "Chiroso", false);
    assert.deepEqual(shown, [
      { key: "coffee", value: "Chiroso", state: "entering" },
    ]);
    const open = endCard(shown, "coffee", "entering");
    assert.equal(open[0].state, "open");
    // Unchanged props keep the same list, so React bails out.
    assert.equal(showCard(open, "coffee", "Chiroso", false), open);
    const leaving = showCard(open, null, null, false);
    assert.deepEqual(leaving, [
      { key: "coffee", value: "Chiroso", state: "leaving" },
    ]);
    // Still mounted while it fades; gone once the out animation ends.
    assert.equal(leaving.length, 1);
    assert.deepEqual(endCard(leaving, "coffee", "leaving"), []);
  });

  it("cross-fades a switch: the old card leaves while the new one enters", () => {
    const mug = endCard(
      showCard(none, "coffee", "mug", false),
      "coffee",
      "entering",
    );
    const both = showCard(mug, "keyboard", "board", false);
    assert.deepEqual(both, [
      { key: "coffee", value: "mug", state: "leaving" },
      { key: "keyboard", value: "board", state: "entering" },
    ]);
    const settled = endCard(
      endCard(both, "coffee", "leaving"),
      "keyboard",
      "entering",
    );
    assert.deepEqual(settled, [
      { key: "keyboard", value: "board", state: "open" },
    ]);
  });

  it("brings a leaving card back instead of stacking a copy", () => {
    const leaving = showCard(
      showCard(none, "football-helmet", "story", false),
      null,
      null,
      false,
    );
    const back = showCard(leaving, "football-helmet", "story", false);
    assert.deepEqual(back, [
      { key: "football-helmet", value: "story", state: "entering" },
    ]);
  });

  it("ignores an end from a state the card already left", () => {
    const leaving = showCard(
      showCard(none, "coffee", "mug", false),
      null,
      null,
      false,
    );
    // The enter animation's late end must not cancel the exit.
    assert.equal(endCard(leaving, "coffee", "entering"), leaving);
    assert.equal(endCard(leaving, "keyboard", "leaving"), leaving);
  });

  it("switches instantly under reduced motion", () => {
    const open = showCard(none, "coffee", "mug", true);
    assert.deepEqual(open, [{ key: "coffee", value: "mug", state: "open" }]);
    assert.deepEqual(showCard(open, "keyboard", "board", true), [
      { key: "keyboard", value: "board", state: "open" },
    ]);
    assert.deepEqual(showCard(open, null, null, true), []);
    assert.equal(showCard(open, "coffee", "mug", true), open);
  });

  it("only counts the card's own animation, not a section's or a tab note's", () => {
    const card = {};
    assert.equal(isOwnMotion({ target: card, currentTarget: card }), true);
    assert.equal(isOwnMotion({ target: {}, currentTarget: card }), false);
  });
});

describe("card presence wiring (card-motion T1)", () => {
  const hook = source("src/components/world/useCardPresence.ts");
  const app = source("src/components/world/WorldApp.tsx");

  it("keeps a card mounted through its exit with a timeout fallback", () => {
    assert.match(hook, /export function useCardPresence/);
    assert.match(hook, /useLayoutEffect/);
    assert.match(hook, /showCard\(/);
    assert.match(hook, /endCard\(/);
    assert.match(hook, /setTimeout\([\s\S]*?cardFallbackMs\(/);
    assert.match(hook, /clearTimeout/);
    assert.match(hook, /isOwnMotion\(event\)/);
  });

  it("drives the three cards from WorldApp's show conditions", () => {
    assert.match(
      app,
      /const cardsShown =\s*ready && entered && !focus && !portrait && !speakers;/,
    );
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && galleryCase && caseStory \? galleryCase : null,\s*caseStory,\s*reducedMotion,?\s*\)/,
    );
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && deskProduct \? "keyboard" : null,\s*deskProduct,\s*reducedMotion,?\s*\)/,
    );
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && deskStory \? "coffee" : null,\s*deskStory,\s*reducedMotion,?\s*\)/,
    );
    for (const [list, tag] of [
      ["caseCards", "CaseStory"],
      ["productCards", "ProductCard"],
      ["coffeeCards", "CoffeeCard"],
    ])
      assert.match(
        app,
        new RegExp(
          `${list}\\.map\\(\\(card\\) => \\(\\s*<${tag}\\s+key=\\{card\\.key\\}[\\s\\S]*?state=\\{card\\.state\\}\\s*onMotionEnd=\\{card\\.onMotionEnd\\}`,
        ),
      );
  });

  it("marks each card's root with its state and lets go of focus as it leaves", () => {
    for (const path of [
      "src/components/world/CaseStory.tsx",
      "src/components/world/CoffeeCard.tsx",
      "src/components/world/ProductCard.tsx",
    ]) {
      const card = source(path);
      assert.match(card, /data-state=\{/, path);
      assert.match(card, /inert=\{[\w.]*state === "leaving"\}/, path);
      assert.match(card, /onAnimationEnd=\{/, path);
      assert.match(
        card,
        /import type \{ CardState \} from "@\/lib\/world\/card-motion\.ts";/,
        path,
      );
    }
  });

  it("fades the helmet story's Hide/Show fold too, holding it while leaving", () => {
    const card = source("src/components/world/CaseStory.tsx");
    assert.match(card, /useCardPresence\(/);
    assert.match(card, /open \? "story" : "fold"/);
    assert.match(card, /state === "leaving" \? "leaving" : fold\.state/);
  });
});
