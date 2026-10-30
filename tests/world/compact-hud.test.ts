import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Source and stylesheet guards for the compact HUD (S1). Node cannot render
// the TSX here, so the look still needs a visual check in a browser.
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const panel = read("src/components/world/ScenePanel.tsx");
const css = read("src/components/world/scene-panel.css");
const hud = read("src/components/world/world-hud.css");
const clock = read("src/components/room/TimeController.tsx");

/** Declarations of one exact selector in a stylesheet. */
const rule = (source: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`));
  assert.ok(match, `missing rule ${selector}`);
  return match[1];
};

/** The header row: from its heading to the closing tag. */
const head = () => {
  const start = panel.indexOf('<h2 className="sp-head"');
  assert.ok(start > 0, "header heading");
  return panel.slice(start, panel.indexOf("</h2>", start));
};

describe("compact HUD trigger (S1)", () => {
  it("shares the compact time card surface in world-hud.css", () => {
    // The compact console the trigger copies, as declared today.
    assert.match(clock, /rounded-xl border border-zinc-800 bg-zinc-950\/90/);
    assert.match(clock, /font-mono text-xs text-zinc-50 backdrop-blur/);
    const trigger = rule(hud, ".world-hud-trigger");
    for (const declaration of [
      "border: 1px solid #27272a;",
      "border-radius: 12px;",
      "background: rgba(9, 9, 11, 0.9);",
      "backdrop-filter: blur(8px);",
      "box-shadow: none;",
      "color: #fafafa;",
      "font-size: 12px;",
      "line-height: 16px;",
      "min-height: 44px;",
      "width: 21rem;",
      "max-width: 100%;",
      "cursor: pointer;",
    ])
      assert.ok(trigger.includes(declaration), `missing ${declaration}`);
    assert.match(trigger, /font-family: ui-monospace,/);
    assert.match(
      rule(hud, ".world-hud-trigger:focus-visible"),
      /outline: 2px solid #d4d4d8;/,
    );
    assert.match(
      rule(hud, ".world-hud-trigger::-webkit-details-marker"),
      /display: none;/,
    );
    // Only the shared class: no menu, overlay or panel selectors here.
    for (const [, selector] of hud
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/([^{}]+)\{/g))
      for (const part of selector.split(","))
        assert.match(part.trim(), /^\.world-hud-trigger(?:[:\w-]*)$/, part);
    assert.doesNotMatch(hud, /var\(--/, "no theme variables");
  });

  it("makes the whole lighting header one native disclosure button", () => {
    assert.match(panel, /import "\.\/world-hud\.css";/);
    const row = head();
    assert.equal(row.split("<button").length - 1, 1, "one button, none nested");
    assert.match(row, /type="button"/);
    assert.match(row, /aria-expanded=\{open\}/);
    assert.match(row, /aria-controls=\{`\$\{uid\}-cards`\}/);
    assert.match(row, /onClick=\{\(\) => setOpen\(\(value\) => !value\)\}/);
    assert.match(row, /className="world-hud-trigger sp-trigger"/);
    // Title, state and a decorative chevron; no separate Show/Hide button.
    assert.match(row, /id=\{`\$\{uid\}-title`\}/);
    assert.match(row, /lights on/);
    assert.match(row, /aria-hidden="true" className="sp-chevron"/);
    assert.doesNotMatch(panel, /"Hide" : "Show"|>\s*Expand\s*</);
    // The section is never the click target.
    assert.doesNotMatch(panel, /<section[^>]*onClick/);
    assert.doesNotMatch(panel, /<div[^>]*onClick/);
  });

  it("sits flush inside the panel and matches the clock width whether closed or open", () => {
    const inner = rule(css, ".scene-panel .world-hud-trigger");
    assert.match(inner, /width: 100%;/);
    assert.match(inner, /border: 0;/);
    assert.match(inner, /background: transparent;/);
    assert.match(rule(css, ".scene-panel"), /width: 21rem;/);
    assert.match(rule(css, '.scene-panel[data-open="true"]'), /width: 21rem;/);
    assert.match(panel, /data-open=\{open\}/);
    assert.match(
      rule(css, '.scene-panel[data-open="true"] .sp-chevron'),
      /rotate\(180deg\)/,
    );
    assert.doesNotMatch(css, /box-shadow/);
  });

  it("keeps the measured lift above the day controller", () => {
    assert.match(panel, /rootRef\.current\?\.parentElement/);
    assert.match(panel, /'section\[aria-label="Time of day"\]'/);
    assert.match(
      panel,
      /const width = Math\.min\(WIDTH, box\.width - 2 \* EDGE\);/,
    );
    assert.match(panel, /bottom: lift,/);
  });
});
