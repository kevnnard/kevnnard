#!/usr/bin/env node
// Draw the desk keyboard's legend atlas once, at prepare time
// (keyboard-faithful T1): the NuPhy Air75 V2's printed legends from
// src/lib/world/keyboard-layout.ts, light grey on transparent, each cap's
// legend centred in its own cell (the board seen from above, 128 px a unit).
//
// Usage:
//   node scripts/prepare-keyboard-legends.mjs
//
// A prebaked WebP over a runtime CanvasTexture: the same pixels on every
// machine (the canvas would draw with whatever sans the browser has) and a
// file the tests can size-check. Needs `rsvg-convert` and ImageMagick 7
// (`magick`) with WebP support; the SVG and PNG are piped, never written.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keyCaps, LEGEND_ATLAS } from "../src/lib/world/keyboard-layout.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, LEGEND_ATLAS.file);
const U = LEGEND_ATLAS.unit;
const INK = "#e6e6e8";
// A clean grotesque close to NuPhy's legends; fontconfig falls back in order.
const FONT = "Inter, 'Noto Sans', 'Liberation Sans', sans-serif";

const escapeXml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const text = (x, y, size, value, weight = 500) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="middle" dominant-baseline="central">${escapeXml(value)}</text>`;

/** Stroked icons, centred on (x, y). */
function icon(name, x, y) {
  const s = 11;
  const chevron = {
    up: `M${x - s} ${y + s / 2} L${x} ${y - s / 2} L${x + s} ${y + s / 2}`,
    down: `M${x - s} ${y - s / 2} L${x} ${y + s / 2} L${x + s} ${y - s / 2}`,
    left: `M${x + s / 2} ${y - s} L${x - s / 2} ${y} L${x + s / 2} ${y + s}`,
    right: `M${x - s / 2} ${y - s} L${x + s / 2} ${y} L${x - s / 2} ${y + s}`,
  }[name];
  if (chevron) return `<path d="${chevron}"/>`;
  // Screenshot: four frame corners around a small dot.
  const r = 15;
  const c = 7;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
    .map(
      ([sx, sy]) =>
        `M${x + sx * r} ${y + sy * (r - c)} L${x + sx * r} ${y + sy * r} L${x + sx * (r - c)} ${y + sy * r}`,
    )
    .join(" ");
  return `<path d="${corners}"/><circle cx="${x}" cy="${y}" r="3" fill="${INK}" stroke="none"/>`;
}

function legend(cap) {
  const x = (cap.x + cap.units / 2) * U;
  const y = (cap.row + 0.5) * U;
  const { main, sub, icon: name } = cap.legend;
  if (name) return icon(name, x, y);
  if (sub) return text(x, y - 17, 28, sub) + text(x, y + 19, 28, main);
  if (main.length === 1) return text(x, y, 38, main);
  // Words (mods, F-keys): small caps-like labels, tracked out a little.
  const size = main.length > 6 ? 20 : main.length > 3 ? 22 : 24;
  return text(x, y, size, main, 600);
}

const caps = keyCaps().filter((cap) => cap.legend);
const drawn = (icons) =>
  caps
    .filter((cap) => Boolean(cap.legend.icon) === icons)
    .map(legend)
    .join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LEGEND_ATLAS.width}" height="${LEGEND_ATLAS.height}">
<g font-family="${FONT}" fill="${INK}" letter-spacing="0.5">
${drawn(false)}
</g>
<g fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
${drawn(true)}
</g>
</svg>`;

const run = (command, args, input) => {
  const result = spawnSync(command, args, { input, maxBuffer: 1 << 26 });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr?.toString()}`);
  return result.stdout;
};
const png = run("rsvg-convert", ["--format=png"], Buffer.from(svg));
run(
  "magick",
  ["png:-", "-strip", "-define", "webp:lossless=true", `webp:${OUT}`],
  png,
);
const bytes = statSync(OUT).size;
if (bytes > LEGEND_ATLAS.maxBytes)
  throw new Error(`${OUT} is ${bytes} bytes, over ${LEGEND_ATLAS.maxBytes}`);
process.stdout.write(
  `${LEGEND_ATLAS.file}: ${caps.length} legends, ${bytes} bytes\n`,
);
