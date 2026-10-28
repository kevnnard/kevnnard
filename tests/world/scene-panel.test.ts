import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Node cannot render the TSX here, so these guard the source and the scoped
// stylesheet: the panel's look in a browser still needs a visual check.
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const panel = read("src/components/world/ScenePanel.tsx");
const css = read("src/components/world/scene-panel.css");
const app = read("src/components/world/WorldApp.tsx");
const globals = read("src/styles/globals.css");

/** Declarations of one exact selector in the scoped stylesheet. */
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`));
  assert.ok(match, `missing rule ${selector}`);
  return match[1];
};

describe("scene panel (T6b UI fix)", () => {
  it("drops the night gate card and every duplicate of the time", () => {
    for (const gone of [
      "Night gate",
      "NIGHT_GATE",
      "clockMinute",
      "PREVIEWS",
      "Preview the night boundary",
      "simulated time from the day controller",
      "New scene",
    ])
      assert.ok(!panel.includes(gone), `still has ${gone}`);
    // No clock text at all: the day controller is the only time display.
    assert.doesNotMatch(panel, /\b\d{2}:\d{2}\b/, "hard-coded hour");
    assert.doesNotMatch(panel, /Turns on at|On until/, "per-light hour hint");
  });

  it("is no longer a time editor: onPreview is gone from panel and app", () => {
    assert.ok(!panel.includes("onPreview"));
    assert.ok(!app.includes("onPreview"));
    assert.ok(!panel.includes("setHours"));
  });

  it("keeps the light controls, zone cards and one reset action", () => {
    for (const kept of [
      'role="switch"',
      'type="color"',
      'type="range"',
      "TV wall",
      "Desk setup",
      'className="sp-card"',
    ])
      assert.ok(panel.includes(kept), `missing ${kept}`);
    assert.equal(panel.split("Reset lights").length - 1, 1);
  });

  it("is styled by its scoped stylesheet, not theme or utility classes", () => {
    // Root cause: tokens are triplets like "240 10% 3.9%", mapped without
    // hsl() in @theme, so bg-background and friends compute to invalid colors.
    assert.match(globals, /--background: 240 10% 3\.9%;/);
    assert.match(globals, /--color-background: var\(--background\);/);
    assert.match(panel, /import "\.\/scene-panel\.css";/);
    assert.doesNotMatch(css, /var\(--/, "no theme variables");
    // Every className in the panel is one of the scoped sp-* classes.
    for (const [, names] of panel.matchAll(/className="([^"]+)"/g))
      for (const name of names.split(" "))
        assert.match(name, /^(?:scene-panel|sp-[a-z-]+)$/, name);
    assert.doesNotMatch(panel, /className=\{/, "no computed utility classes");
    const root = rule(".scene-panel");
    assert.match(root, /background: rgba\(9, 9, 11, 0\.9\);/, "dark");
    assert.match(root, /color: #fafafa;/, "readable text");
    assert.match(rule(".scene-panel .sp-card"), /background: #09090b;/);
  });

  it("is one column console, bottom right, 320px max, opening upward", () => {
    const root = rule(".scene-panel");
    assert.match(root, /position: absolute;/);
    assert.match(root, /right: 16px;/);
    assert.match(root, /display: flex;\n\s*flex-direction: column;/);
    assert.match(root, /width: 320px;\n\s*max-width: calc\(100% - 32px\);/);
    assert.doesNotMatch(css, /flex-direction: row-reverse|column-reverse/);
    const body = rule(".scene-panel .sp-body");
    assert.match(body, /flex-direction: column;/);
    assert.match(body, /min-height: 0;/);
    assert.match(body, /overflow-y: auto;/);
    assert.match(rule(".scene-panel .sp-head"), /flex: none;/);
    // Content renders before the header row, so it sits above the trigger.
    assert.ok(
      panel.indexOf('className="sp-body"') <
        panel.indexOf('className="sp-head"'),
    );
    assert.match(panel, /useState\(false\)/, "starts folded");
    assert.match(panel, /bottom: lift,/);
    assert.match(panel, /maxHeight: `calc\(100% - 5rem - \$\{lift\}px\)`/);
    assert.match(app, /controllerStyle=\{controllerStyle\}/);
  });
});
