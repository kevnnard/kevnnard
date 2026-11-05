import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Supplementary source guards, not mounted DOM or GPU verification.
const app = readFileSync(
  new URL("../../src/components/world/WorldApp.tsx", import.meta.url),
  "utf8",
);

describe("world entry gate", () => {
  it("starts closed, keeps the scene mounted, and accepts real scene progress", () => {
    assert.match(app, /const \[entered, setEntered\] = useState\(false\)/);
    assert.match(app, /onProgress=\{setLoading\}/);
    assert.match(app, /<WorldEntryLoader/);
    assert.doesNotMatch(app, /Loading the world…/);
  });
  it("unlocks music only from the ready entry gesture, then respects saved intent", () => {
    assert.match(
      app,
      /if \(!ready \|\| loading\.phase !== "ready" \|\| loading\.error\) return;/,
    );
    assert.match(
      app,
      /if \(musicEnabled\) music\.unlock\(\);\s*if \(ambientEnabled\) ambient\.unlock\(\);\s*setEntered\(true\);/,
    );
    assert.match(
      app,
      /if \(!entered \|\| !ready \|\| !limits \|\| !musicEnabled\) return;/,
    );
    assert.match(app, /\[music, entered, ready, limits, musicEnabled\]/);
  });
  it("keeps scene errors outside the entry overlay and offers a reload", () => {
    const start = app.indexOf("<SceneErrorBoundary>");
    const end = app.indexOf("</SceneErrorBoundary>", start);
    assert.ok(start >= 0 && app.indexOf("<WorldEntryLoader", start) < end);
    assert.match(app, /onRetry=\{reloadWorld\}/);
    assert.match(app, /Try again/);
  });
  it("blocks background pointer and keyboard controls before entry without resetting them", () => {
    assert.match(app, /inert=\{!entered\}/);
    assert.match(
      app,
      /inert=\{\s*!entered \|\| focus \|\| portrait \|\| speakers \|\| galleryCase !== null\s*\}/,
    );
    assert.match(app, /element\.inert = !entered/);
    assert.match(app, /!entered && "world-entry-pending"/);
    assert.match(app, /menuButton\.current\?\.focus\(\)/);
  });
});

it("waits for the visual reveal as well as real readiness and cancels stale animation frames", () => {
  assert.match(app, /state=\{presented\}/);
  assert.match(
    app,
    /if \(presented\.phase !== "ready" \|\| presented\.progress !== 100\) return;/,
  );
  assert.match(app, /if \(closed\) return;/);
  assert.match(app, /cancelAnimationFrame\(frame\)/);
});

it("crossfades the existing mounted scene and makes the exiting loader immediately inert", () => {
  const css = readFileSync(
    new URL("../../src/components/world/world-entry-gate.css", import.meta.url),
    "utf8",
  );
  assert.match(app, /entered && "world-entry-revealed"/);
  assert.match(
    app,
    /className="world-entry-veil"[\s\S]*?inert=\{entered\}[\s\S]*?aria-hidden=\{entered\}/,
  );
  assert.doesNotMatch(app, /!entered && \(\s*<WorldEntryLoader/);
  assert.match(css, /@keyframes world-entry-veil-out/);
  assert.match(css, /@keyframes world-entry-scene-in/);
  assert.match(css, /@keyframes world-entry-glow/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /visibility: hidden/);
  assert.doesNotMatch(css, /transform:|filter:/);
});
