import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Source and stylesheet guards for the stacked phone HUD (mobile-hud S1).
// Node cannot render the TSX here, so the layout still needs a visual check
// in a browser at 390x844 (odd/tasks/mobile-hud.md).
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const app = read("src/components/world/WorldApp.tsx");
const panel = read("src/components/world/ScenePanel.tsx");
const css = read("src/components/world/scene-panel.css");
const clock = read("src/components/room/TimeController.tsx");

const QUERY = "(max-width: 700px)";

/** The body of the stacked phone media block in scene-panel.css. */
const stacked = () => {
  const start = css.indexOf(`@media ${QUERY} {`);
  assert.ok(start > 0, "missing the stacked media block");
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0)
      return css.slice(css.indexOf("{", start) + 1, i);
  }
  assert.fail("unclosed media block");
};

/** Declarations of one exact selector inside the stacked block. */
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stacked().match(new RegExp(`\\n\\s*${escaped} \\{([^}]*)\\}`));
  assert.ok(match, `missing stacked rule ${selector}`);
  return match[1];
};

const CLOCK = '.world-entry-revealed > section[aria-label="Time of day"]';
const SCENE = ".world-entry-revealed > section.scene-panel";

describe("stacked phone HUD (mobile-hud S1)", () => {
  it("uses one breakpoint in the app and the stylesheet", () => {
    assert.match(
      app,
      /const stacked = useMediaQuery\("\(max-width: 700px\)"\);/,
    );
    assert.ok(css.includes(`@media ${QUERY} {`));
  });

  it("measures one column: header, then Scene, then the clock", () => {
    assert.match(app, /function useHudStack\(/);
    assert.match(app, /"--hud-scene-top"/);
    assert.match(app, /"--hud-clock-top"/);
    // Re-measured in the same frame when a panel or the notice changes.
    assert.match(
      app,
      /useHudStack\(\s*root,\s*stacked,\s*ready\s*\?\s*\[controllerStyle, hudOpen\.scene, hudOpen\.clock, song\.error\]/,
    );
    assert.match(app, /className=\{`world-hud-header /);
    // The header's own rows share the stack gap and the full width.
    assert.match(rule(".world-hud-header"), /gap: 8px;/);
    assert.match(
      rule(".world-hud-header > .world-hud-trigger"),
      /width: 100%;/,
    );
  });

  it("puts Scene under the header at the shared 16px margins", () => {
    const scene = rule(SCENE);
    for (const declaration of [
      "top: var(--hud-scene-top, 120px);",
      "bottom: auto !important;",
      "left: 16px;",
      "right: 16px;",
      "width: auto;",
      "max-width: none;",
    ])
      assert.ok(scene.includes(declaration), `missing ${declaration}`);
    // Fits the screen and leaves the folded clock and bottom margin below it.
    assert.match(
      scene,
      /max-height: calc\(100% - var\(--hud-scene-top, 120px\) - 74px\);/,
    );
    // Opens downward: the header row first, the cards pushed below it.
    assert.match(rule(".scene-panel .sp-head"), /order: -1;/);
    assert.match(
      rule(".scene-panel .sp-body"),
      /border-top: 1px solid #27272a;/,
    );
    // No inline lift: the stylesheet owns the stacked position.
    assert.match(panel, /style=\{\s*stacked\s*\?\s*undefined/);
  });

  it("puts the clock under Scene and keeps it inside the viewport", () => {
    const box = rule(CLOCK);
    for (const declaration of [
      "top: var(--hud-clock-top, 172px);",
      "bottom: auto;",
      "left: 16px;",
      "right: 16px;",
      "max-height: calc(100% - var(--hud-clock-top, 172px) - 16px);",
      "overflow-y: auto;",
    ])
      assert.ok(box.includes(declaration), `missing ${declaration}`);
    // The compact console scrolls its body so the settings popover can open.
    assert.match(rule(`${CLOCK}.tc-compact`), /overflow: visible;/);
    assert.match(rule(".tc-compact .tc-body"), /overflow-y: auto;/);
    assert.match(clock, /"tc-compact"/);
    assert.match(clock, /className="tc-body /);
    assert.match(clock, /className="tc-settings /);
  });

  it("keeps one of Scene and the clock open at a time on phones", () => {
    assert.match(app, /useState<"scene" \| "clock" \| null>\(null\)/);
    assert.match(app, /folded=\{stacked && hudPanel === "clock"\}/);
    assert.match(app, /folded=\{stacked && hudPanel === "scene"\}/);
    for (const source of [panel, clock]) {
      assert.match(source, /if \(folded\) setOpen\(false\);/);
      assert.match(source, /onOpenChange\?\.\(open\);/);
    }
  });

  it("gives every phone touch target at least 44px", () => {
    assert.match(
      rule(".tc-settings > div > button"),
      /width: 44px;\s*height: 44px;/,
    );
    assert.match(
      rule(".tc-body button,\n  .tc-body fieldset label"),
      /min-height: 44px;/,
    );
    assert.match(rule(".scene-panel .sp-btn"), /min-height: 44px;/);
    assert.match(rule('.scene-panel input[type="color"]'), /height: 44px;/);
    assert.match(rule(".scene-panel .sp-switch::after"), /inset: -12px -4px;/);
  });

  it("leaves the desktop HUD as it was", () => {
    // Wide screens keep the bottom-right panel, its lift and the clock spot.
    const base = css.slice(0, css.indexOf(`@media ${QUERY} {`));
    assert.match(
      base,
      /\.scene-panel \{\n {2}position: absolute;\n {2}right: 16px;/,
    );
    assert.match(panel, /bottom: lift,/);
    assert.match(clock, /"bottom-4 left-4 w-\[21rem\]"/);
    assert.match(
      clock,
      /side=\{stacked \|\| style === "orbital" \? "bottom" : "top"\}/,
    );
  });
});
