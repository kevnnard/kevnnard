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

describe("world entry loader copy matches artboard 06 (S1)", () => {
  it("keeps the titleblock, the four milestones, the status and the entry", () => {
    for (const copy of [
      "Kevnnard · world entry · sheet 01",
      "Drawing the house",
      "Nature and sky",
      "Ground and surfaces",
      "Living interior",
      "First frame",
      "Ready to enter",
      "Not ready",
      "A small house in the forest.",
      "Enter world",
      "Back to portfolio",
    ]) {
      assert.ok(loader.includes(copy), `missing copy ${copy}`);
    }
    assert.match(loader, /href="\/"/);
    for (const old of [
      "World assembly",
      "KEVNNARD / WORLD",
      "Building a place",
    ]) {
      assert.ok(!loader.includes(old), `stale artboard 03 copy ${old}`);
    }
  });

  it("draws the house as a blueprint in ten sequential ink orders", () => {
    assert.match(loader, /<svg[\s\S]*className="world-entry-blueprint"/);
    assert.match(loader, /viewBox="0 0 720 440"/);
    const orders = new Set(
      [...loader.matchAll(/data-order="(\d+)"/g)].map((m) => Number(m[1])),
    );
    assert.deepEqual(
      [...orders].sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    for (const ink of loader.match(/<path[^>]*>/g) ?? []) {
      assert.match(ink, /className="world-entry-ink/);
      assert.match(ink, /pathLength=\{1\}/);
    }
    assert.match(loader, /className="world-entry-glow"/);
    assert.equal(loader.match(/className="world-entry-window"/g)?.length, 2);
    // Ink order comes from the real percentage, never from a clock.
    assert.match(loader, /const orderT = \(percent \/ 100\) \* 10;/);
    assert.match(loader, /"--world-entry-order-t": orderT,/);
  });

  it("lights the milestones from the real percentage", () => {
    assert.match(
      loader,
      /data-on=\{percent >= m\.threshold \? "true" : "false"\}/,
    );
    assert.equal(loader.match(/threshold: \d+/g)?.length, 4);
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
    assert.match(
      loader,
      /className="world-entry-pct" aria-hidden="true">\s*\{percent\}/,
    );
  });

  it("shows an alert, a retry and the portfolio link on error", () => {
    assert.match(
      loader,
      /\{failed && \(\s*<div className="world-entry-error" role="alert">/,
    );
    assert.match(loader, /onRetry && \(/);
    assert.match(loader, /Try again/);
  });

  it("is a labelled modal and moves focus only on entry or readiness", () => {
    assert.match(loader, /role="dialog"/);
    assert.match(loader, /aria-modal="true"/);
    assert.match(loader, /aria-labelledby=\{headingId\}/);
    assert.match(loader, /id=\{headingId\}/);
    // The page already owns <main>; the overlay must not nest another one.
    assert.doesNotMatch(loader, /<main/);
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

  it("inks each order from the real percentage with a stroke dash", () => {
    const ink = rule(".world-entry-ink");
    assert.match(ink, /stroke-dasharray: 1;/);
    assert.match(
      ink.replace(/\s+/g, " "),
      /stroke-dashoffset: calc\( 1 - clamp\(0, calc\(var\(--world-entry-order-t, 0\) - var\(--ink-order, 0\)\), 1\) \);/,
    );
    for (let order = 0; order <= 9; order++) {
      assert.match(
        rule(`.world-entry-ink[data-order="${order}"]`),
        new RegExp(`--ink-order: ${order};`),
        `missing ink order ${order}`,
      );
    }
  });

  it("lights the windows and the warm glow only at readiness", () => {
    assert.match(rule(".world-entry-glow"), /fill: rgba\(16, 185, 129, 0\);/);
    assert.match(
      rule(".world-entry-window"),
      /fill: rgba\(250, 250, 250, 0\);/,
    );
    assert.match(
      rule(".world-entry-ready .world-entry-glow"),
      /fill: rgba\(16, 185, 129, 0\.12\);/,
    );
    assert.match(
      rule(".world-entry-ready .world-entry-window"),
      /fill: rgba\(250, 250, 250, 0\.9\);/,
    );
    assert.match(
      loader,
      /world-entry-loader \$\{ready \? "world-entry-ready" : ""\}/,
    );
  });

  it("stacks on small viewports and stays static under reduced motion", () => {
    assert.match(css, /@container world-entry \(max-width: 720px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /\.world-entry-loader\[data-reduced-motion="true"\]/);
    const reduced = css.match(
      /(\.world-entry-loader\[data-reduced-motion="true"\] [^{]+)\{\s*transition: none;\s*animation: none;\s*\}/,
    );
    assert.ok(
      reduced,
      "reduced-motion prop must drop transitions and animations",
    );
    for (const part of [
      "world-entry-ink",
      "world-entry-glow",
      "world-entry-window",
      "world-entry-status-dot",
    ]) {
      assert.ok(reduced[1].includes(part), `reduced motion misses ${part}`);
    }
    assert.match(
      rule('.world-entry-loader[data-reduced-motion="true"] .world-entry-ink'),
      /stroke-dashoffset: 0;/,
    );
    const media = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    assert.match(media, /transition: none;\s*animation: none;/);
    assert.match(media, /\.world-entry-ink \{\s*stroke-dashoffset: 0;/);
  });
});
