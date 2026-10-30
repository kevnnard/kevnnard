import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Node cannot render the TSX here, so these guard the source and the scoped
// stylesheet. They do not mount a DOM: the loader's look, focus and screen
// reader output in a browser still need a visual and assistive check.
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const loader = read("src/components/world/WorldEntryLoader.tsx");
const css = read("src/components/world/world-entry-loader.css");

/** Declarations of one exact selector in the scoped stylesheet. */
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`));
  assert.ok(match, `missing rule ${selector}`);
  return match[1];
};

describe("world entry loader contract (S1, S4)", () => {
  it("is the default export and takes the shared WorldLoadState", () => {
    assert.match(loader, /export default function WorldEntryLoader\(/);
    assert.match(
      loader,
      /import type \{ WorldLoadState \} from "@\/lib\/world\/world-loading\.ts";/,
    );
    for (const prop of [
      "state: WorldLoadState",
      "onEnter: () => void",
      "onRetry?: () => void",
      "reducedMotion: boolean",
    ]) {
      assert.ok(loader.includes(prop), `missing prop ${prop}`);
    }
  });

  it("keeps the DOM loader free of 3D, audio and timers", () => {
    const imports = [...loader.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const source of imports) {
      assert.doesNotMatch(source, /three|@react-three|music|audio|speaker/);
    }
    for (const forbidden of [
      "setInterval",
      "setTimeout",
      "requestAnimationFrame",
      "Math.random",
      'type="range"',
      "Replay",
      "Simulated",
      "Preview only",
    ]) {
      assert.ok(!loader.includes(forbidden), `found ${forbidden}`);
    }
  });

  it("derives the percentage from the input: 1–99 while loading, 100 at ready", () => {
    assert.match(loader, /Math\.min\(99, Math\.max\(1, Math\.round\(/);
    assert.match(loader, /ready\s*\?\s*100\s*:/);
    assert.match(
      loader,
      /const ready = state\.phase === "ready" && state\.error === null;/,
    );
  });

  it("enables entry only when ready", () => {
    assert.match(loader, /disabled=\{!ready\}/);
    assert.match(loader, /onClick=\{ready \? onEnter : undefined\}/);
  });
});

describe("world entry loader copy matches artboard 03 (S1)", () => {
  it("keeps the heading, the three phases and the entry label", () => {
    for (const copy of [
      "World assembly",
      "Building a place",
      "to look around.",
      "Scene foundations",
      "Models & materials",
      "First frame",
      "Preparing your world…",
      "Enter world",
      "Back to portfolio",
      "KEVNNARD / WORLD",
      "Sound follows your saved preference.",
    ]) {
      assert.ok(loader.includes(copy), `missing copy ${copy}`);
    }
    assert.match(loader, /href="\/"/);
  });

  it("draws the house as an original stroked line drawing on the left", () => {
    assert.match(loader, /<svg[\s\S]*viewBox="0 0 440 360"/);
    assert.match(loader, /pathLength=\{1\}/);
    assert.ok(
      loader.indexOf("<svg") < loader.indexOf("<h2"),
      "drawing precedes the heading",
    );
  });
});

describe("world entry loader accessibility (S1, S4)", () => {
  it("exposes progress as a progressbar with a value text", () => {
    assert.match(loader, /role="progressbar"/);
    for (const attr of [
      "aria-valuemin={0}",
      "aria-valuemax={100}",
      "aria-valuenow={percent}",
      "aria-valuetext=",
    ]) {
      assert.ok(loader.includes(attr), `missing ${attr}`);
    }
  });

  it("announces only the phase politely, never every number", () => {
    assert.match(loader, /role="status"/);
    assert.equal(loader.match(/aria-live=/g)?.length ?? 0, 0);
    assert.match(loader, /aria-hidden="true">\s*\{count\}/);
  });

  it("shows an alert, a retry and the portfolio link on error", () => {
    assert.match(loader, /role="alert"/);
    assert.match(loader, /onRetry && \(/);
    assert.match(loader, /Try again/);
  });

  it("is a labelled modal and moves focus only on entry or readiness", () => {
    assert.match(loader, /role="dialog"/);
    assert.match(loader, /aria-modal="true"/);
    assert.match(loader, /aria-labelledby=\{headingId\}/);
    // Focus effects depend on readiness, never on the percentage.
    const deps = [...loader.matchAll(/\}, \[([^\]]*)\]\);/g)].map((m) => m[1]);
    assert.ok(deps.length >= 2, "expected mount and readiness effects");
    for (const list of deps) assert.doesNotMatch(list, /percent|progress/);
  });
});

describe("world entry loader stylesheet (S2)", () => {
  it("is an overlay over the world viewport, not page-global", () => {
    const root = rule(".world-entry-loader");
    assert.match(root, /position: absolute;/);
    assert.match(root, /inset: 0;/);
    assert.match(root, /z-index: \d+;/);
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/(^|\})\s*([^{}@]+)\{/g)
      ?.map((s) =>
        s
          .replace(/^\}?\s*/, "")
          .replace(/\{$/, "")
          .trim(),
      );
    assert.ok(selectors?.length);
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        const trimmed = part.trim();
        if (/^(from|to|\d+%)$/.test(trimmed)) continue;
        assert.match(trimmed, /^\.world-entry-/, `global selector ${trimmed}`);
      }
    }
  });

  it("uses only design/system.md colors", () => {
    const allowed = new Set([
      "#09090b",
      "#18181b",
      "#27272a",
      "#a1a1aa",
      "#d4d4d8",
      "#fafafa",
      "#10b981",
      "#7f1d1d",
    ]);
    for (const hex of css.match(/#[0-9a-f]{6}\b/gi) ?? []) {
      assert.ok(allowed.has(hex.toLowerCase()), `unexpected color ${hex}`);
    }
  });

  it("keeps 44px touch targets", () => {
    assert.match(rule(".world-entry-button"), /min-height: 44px;/);
    assert.match(rule(".world-entry-link"), /min-height: 44px;/);
  });

  it("draws the wire from the real percentage with a stroke dash", () => {
    const wire = rule(".world-entry-wire path");
    assert.match(wire, /stroke-dasharray: 1;/);
    assert.match(
      wire,
      /stroke-dashoffset: calc\(1 - var\(--world-entry-progress\)\);/,
    );
  });

  it("stacks on small viewports and stays static under reduced motion", () => {
    assert.match(css, /@container world-entry \(max-width: 650px\)/);
    assert.match(css, /grid-template-columns: 1fr;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.world-entry-loader\[data-reduced-motion="true"\]/);
    // Reduced motion completes the drawing in CSS; the bar keeps the value.
    assert.match(loader, /"--world-entry-progress": percent \/ 100,/);
    assert.doesNotMatch(css, /\.world-entry-bar-fill \{[^}]*transform: none/);
  });
});
