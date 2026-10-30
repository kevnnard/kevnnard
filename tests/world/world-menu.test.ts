// Structural checks for the game-style world guide (world-game-menu T1);
// actual pointer/focus and visual acceptance need a browser. No DOM runner is
// installed in this project.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("world game guide modal", () => {
  it("is a native modal dialog opened by a button and closed by Esc or outside", () => {
    const menu = read("src/components/world/WorldMenu.tsx");
    assert.match(menu, /<dialog/);
    assert.match(menu, /showModal\(\)/);
    assert.match(menu, /aria-haspopup="dialog"/);
    assert.match(menu, /aria-expanded=/);
    assert.match(menu, /aria-labelledby=/);
    // Esc is the dialog's native cancel; the backdrop is the dialog itself.
    assert.match(menu, /onClose=/);
    assert.match(menu, /event\.target === dialog/);
    assert.match(menu, /triggerRef\.current\?\.focus\(\)/);
    assert.doesNotMatch(menu, /<details|<summary/);
    // No document-level key handlers: terminal, console and sliders keep theirs.
    assert.doesNotMatch(menu, /document\.addEventListener/);
  });

  it("has a real tablist with roving focus, arrows, Home and End", () => {
    const menu = read("src/components/world/WorldMenu.tsx");
    for (const pattern of [
      /role="tablist"/,
      /role="tab"/,
      /role="tabpanel"/,
      /aria-selected=/,
      /aria-controls=/,
      /tabIndex=\{selected \? 0 : -1\}/,
      /\bArrowRight:/,
      /\bArrowLeft:/,
      /\bHome: 0/,
      /\bEnd: GUIDE_SECTIONS\.length - 1/,
    ])
      assert.match(menu, pattern);
  });

  it("closes the modal before running an existing action", () => {
    const menu = read("src/components/world/WorldMenu.tsx");
    const run = menu.slice(menu.indexOf("const run ="));
    assert.ok(
      run.indexOf("close()") < run.indexOf("action.run()"),
      "close, then act",
    );
  });

  it("keeps every action, the portfolio link and the shared HUD trigger class", () => {
    const app = read("src/components/world/WorldApp.tsx");
    const menu = read("src/components/world/WorldMenu.tsx");
    assert.match(app, /<WorldMenu/);
    assert.match(app, /triggerRef=\{menuButton\}/);
    for (const label of [
      "Enter terminal",
      "Watch video",
      "Pause music",
      "Play music",
      "Focus speakers",
      "Recenter view",
    ])
      assert.ok(app.includes(label), label);
    for (const action of [
      'terminal: { label: "Enter terminal", run: enter }',
      'video: { label: "Watch video", run: enterPortrait }',
      "run: playMusic,",
      "pressed: song.playing",
      'speakers: { label: "Focus speakers", run: enterSpeakers }',
    ])
      assert.ok(app.includes(action), action);
    assert.match(app, /\.\.\.\(ready && \{/, "close-ups wait for the world");
    assert.match(menu, /aria-pressed=\{action\.pressed\}/);
    assert.match(app, /setHome\(\(count\) => count \+ 1\)/);
    assert.equal(
      (app.match(/menuButton\.current\?\.focus\(\)/g) ?? []).length,
      3,
    );
    assert.match(
      app,
      /href="\/"\s+className="world-portfolio-link world-hud-trigger pointer-events-auto"/,
    );
    assert.match(app, /Back to portfolio/);
    assert.match(
      menu,
      /className="world-menu-trigger world-hud-trigger pointer-events-auto"/,
    );
    // Credits is a tab inside the guide, not a second modal.
    assert.match(menu, /<CreditsList/);
    assert.doesNotMatch(app, /<CreditsDialog/);
  });

  it("leaves the shared trigger style to world-hud.css and scopes its own styles", () => {
    const css = read("src/components/world/world-menu.css");
    assert.doesNotMatch(css, /\.world-menu-trigger|\.world-portfolio-link/);
    assert.match(css, /\.world-guide::backdrop/);
    assert.match(css, /pointer-events:\s*auto/);
    assert.match(css, /overflow-y:\s*auto/);
    assert.match(css, /max-height:/);
    assert.match(css, /@media \(max-width:/);
    assert.match(css, /prefers-reduced-motion/);
    assert.doesNotMatch(css, /(^|\n)\s*(body|html|:root|\*)\s*[{,]/);
  });

  it("gives every section its own original inline illustration", () => {
    const art = read("src/components/world/WorldGuideIllustration.tsx");
    for (const id of ["home", "controls", "terminal", "video", "lofi"])
      assert.match(art, new RegExp(`${id}: `));
    assert.match(art, /credits: /);
    assert.match(art, /role="img"/);
    assert.doesNotMatch(art, /<image|href=|src=|\.png|\.jpe?g|\.webp/);
  });
});
