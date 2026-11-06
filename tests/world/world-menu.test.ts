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
      "Watch TV",
      "Open collection",
      "See the desk",
    ])
      assert.ok(app.includes(label), label);
    for (const action of [
      'terminal: { label: "Enter terminal", run: enter }',
      'video: { label: "Watch video", run: enterPortrait }',
      "run: playMusic,",
      "pressed: song.playing",
      'speakers: { label: "Focus speakers", run: enterSpeakers }',
      'tv: { label: "Watch TV", run: enterTv }',
    ])
      assert.ok(app.includes(action), action);
    assert.match(app, /\.\.\.\(ready && \{/, "close-ups wait for the world");
    assert.match(menu, /aria-pressed=\{action\.pressed\}/);
    assert.match(app, /setHome\(\(count\) => count \+ 1\)/);
    assert.equal(
      (app.match(/menuButton\.current\?\.focus\(\)/g) ?? []).length,
      5, // Four close-up exits (incl. the TV) plus the world-entry transition.
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
    for (const id of [
      "home",
      "controls",
      "terminal",
      "video",
      "tv",
      "lofi",
      "collection",
      "cherry",
    ])
      assert.match(art, new RegExp(`${id}: `));
    assert.match(art, /credits: /);
    assert.match(art, /role="img"/);
    assert.doesNotMatch(art, /<image|href=|src=|\.png|\.jpe?g|\.webp/);
  });
});

describe("the guide's TV, collection and Cherry actions (guide-menu-new T1)", () => {
  const app = read("src/components/world/WorldApp.tsx");
  const actions = app.slice(app.indexOf("const menuActions"));
  const block = actions.slice(0, actions.indexOf("const screen ="));

  it("opens the collection's first item and the desk's keyboard as a click does", () => {
    assert.match(
      block,
      /collection: \{\s*label: "Open collection",\s*run: \(\) => setGalleryCase\(GALLERY_ORDER\[0\]\),?\s*\}/,
    );
    assert.match(
      block,
      /desk: \{\s*label: "See the desk",\s*run: \(\) => setGalleryCase\("keyboard"\),?\s*\}/,
    );
    // Offered only once the world is ready, like the other close-ups.
    const ready = block.indexOf("...(ready && {");
    assert.ok(ready > 0 && ready < block.indexOf("collection: {"));
    assert.ok(ready < block.indexOf("cherry: {"));
  });

  it("meets Cherry: inspects her in her hours, else sets the shared clock and waits", () => {
    assert.match(app, /cherryMeeting\(clock\.hours, reducedMotion\)/);
    assert.match(block, /cherry: \{ label: meeting\.label, run: meetCherry \}/);
    assert.match(app, /setClockHours\(meeting\.hours\)/);
    assert.match(app, /const setClockHours = clock\.setHours/);
    // The wait is cancelled by any close-up and cleared on unmount.
    const wait = app.slice(app.indexOf("const [meetWait, setMeetWait]"));
    assert.match(wait, /clearTimeout/);
    assert.match(wait, /setGalleryCase\("cherry"\)/);
    assert.match(wait, /focus \|\| portrait \|\| speakers \|\| tv/);
    // The guide's one new focus path is none: still five returns.
    assert.equal(
      (app.match(/menuButton\.current\?\.focus\(\)/g) ?? []).length,
      5,
    );
  });

  it("gives each new tab its own icon", () => {
    const menu = read("src/components/world/WorldMenu.tsx");
    const icons = menu.slice(menu.indexOf("const TAB_ICONS"));
    for (const id of ["tv", "collection", "cherry"])
      assert.match(icons.slice(0, icons.indexOf("};")), new RegExp(`${id}: "`));
  });
});

describe("the nine-tab bar stays tidy (guide-menu-new T1)", () => {
  const css = read("src/components/world/world-menu.css");
  const rule = (selector: string, from = css) => {
    const start = from.indexOf(`${selector} {`);
    assert.ok(start >= 0, selector);
    return from.slice(start, from.indexOf("}", start));
  };
  it("puts the tabs on their own row, one line that scrolls when narrower", () => {
    const tabs = rule(".world-guide-tabs");
    assert.match(tabs, /order: 3/);
    assert.match(tabs, /flex-basis: 100%/);
    assert.match(tabs, /overflow-x: auto/);
    assert.doesNotMatch(tabs, /flex-wrap/);
    assert.match(rule(".world-guide-bar"), /flex-wrap: wrap/);
  });

  it("fits all nine tabs on one row of the 62rem guide (1440 and 1100 px)", async () => {
    const { GUIDE_SECTIONS } = await import(
      "../../src/lib/world/world-guide.ts"
    );
    // Monospace 12px: 0.6em advance. Icon pinned to 1em, a 6px gap, 12px
    // side padding, 1px borders, 4px between tabs.
    const button = rule(".world-guide-tabs button");
    assert.match(button, /padding: 0\.5rem 0\.75rem/);
    assert.match(button, /gap: 0\.375rem/);
    assert.match(rule(".world-guide-tabs button > span"), /width: 1em/);
    const width = GUIDE_SECTIONS.reduce(
      (sum, section) => sum + 2 + 24 + 12 + 6 + section.tab.length * 7.2,
      (GUIDE_SECTIONS.length - 1) * 4,
    );
    assert.equal(GUIDE_SECTIONS.length, 9);
    assert.ok(width <= 62 * 16 - 24, `${width}px on a 992px row`);
    // Below about 1000 px and on phones: one scrolling row, as before.
    assert.ok(width > 700 - 16);
  });
});
