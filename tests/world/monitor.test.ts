import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE } from "../../src/lib/world/camera.ts";
import {
  canEnterMonitor,
  isMainScreenGlow,
  MONITOR_FOCUS,
  MONITOR_SCREEN,
  monitorFocus,
  screenPoint,
  screenRect,
  screenSurface,
} from "../../src/lib/world/monitor.ts";
import { CHAIR_SWAY } from "../../src/lib/world/motion.ts";
import {
  MAIN_MONITOR,
  MAIN_ROOM,
  partBounds,
  type SetupPart,
  setupMeshes,
  swivelPart,
} from "../../src/lib/world/setup.ts";

type V = readonly [number, number, number];
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Distance from a point to an axis-aligned box. */
function boxDistance(p: V, part: SetupPart) {
  const b = partBounds(part);
  const dx = Math.max(b.x0 - p[0], 0, p[0] - b.x1);
  const dy = Math.max(b.y0 - p[1], 0, p[1] - b.y1);
  const dz = Math.max(b.z0 - p[2], 0, p[2] - b.z1);
  return Math.hypot(dx, dy, dz);
}

/** Whether segment a-b crosses an axis-aligned box (slab test). */
function crosses(a: V, b: V, part: SetupPart) {
  const box = partBounds(part);
  const lo = [box.x0, box.y0, box.z0];
  const hi = [box.x1, box.y1, box.z1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < lo[i] || a[i] > hi[i]) return false;
      continue;
    }
    let near = (lo[i] - a[i]) / d;
    let far = (hi[i] - a[i]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

/** Open JSX elements around each component tag, scanning from the root element. */
function jsxAncestors(jsx: string) {
  const stack: string[] = [];
  const found: Record<string, string[]> = {};
  for (let i = 0; i < jsx.length; i++) {
    if (jsx[i] !== "<") continue;
    const close = jsx[i + 1] === "/";
    const name = /^[A-Za-z][\w.]*/.exec(jsx.slice(i + (close ? 2 : 1)))?.[0];
    if (!name) continue;
    if (close) {
      if (stack.at(-1) === name) stack.pop();
      if (stack.length === 0) break;
      continue;
    }
    // The opening tag ends at the first ">" outside braces.
    let depth = 0;
    let end = i;
    for (; end < jsx.length; end++) {
      if (jsx[end] === "{") depth++;
      else if (jsx[end] === "}") depth--;
      else if (jsx[end] === ">" && depth === 0) break;
    }
    if (/^[A-Z]/.test(name)) found[name] = [...stack];
    if (jsx[end - 1] !== "/") stack.push(name);
    i = end;
  }
  return found;
}

const ASPECTS = [
  320 / 568,
  375 / 812,
  768 / 1024,
  1440 / 900,
  16 / 9,
  2560 / 1080,
  3440 / 1440,
  5120 / 1440,
];
const meshes = setupMeshes();
const swayed = [
  -CHAIR_SWAY,
  -CHAIR_SWAY / 2,
  0,
  CHAIR_SWAY / 2,
  CHAIR_SWAY,
].flatMap((angle) =>
  [...meshes.hull, ...meshes.solid.filter((p) => p.rig === "swivel")].map((p) =>
    swivelPart(p, angle),
  ),
);
const fixed = meshes.solid.filter(
  (p) => p.rig !== "swivel" && p.item !== "monitor",
);

describe("main monitor screen surface (T16)", () => {
  it("follows the ultrawide's arc inside its bezel, in front of the bezel face", () => {
    const { radius, halfAngle } = MAIN_MONITOR.curve;
    assert.equal(MONITOR_SCREEN.radius, radius);
    assert.ok(MONITOR_SCREEN.halfAngle < halfAngle);
    assert.ok(MONITOR_SCREEN.height < MAIN_MONITOR.size[1]);
    assert.ok(
      MONITOR_SCREEN.inset > MAIN_MONITOR.size[0] / 2,
      "proud of the bezel",
    );
    assert.ok(
      MONITOR_SCREEN.inset < MAIN_MONITOR.size[0] / 2 + 0.008,
      "still on the panel",
    );
    // Chord width of the visible screen: ultrawide, about 1.1 x 0.38.
    const left = screenPoint(0, 0.5);
    const right = screenPoint(1, 0.5);
    const chord = Math.hypot(left[0] - right[0], left[2] - right[2]);
    assert.ok(chord > 1.05 && chord < MAIN_MONITOR.size[2]);
    assert.ok(MONITOR_SCREEN.aspect > 2.7 && MONITOR_SCREEN.aspect < 3.1);
  });

  it("maps u left to right as seen from the chair (-z) and v bottom to top", () => {
    const [l, r] = [screenPoint(0, 0.5), screenPoint(1, 0.5)];
    assert.ok(l[2] > r[2], "seated, your right is -z");
    assert.ok(screenPoint(0.5, 1)[1] > screenPoint(0.5, 0)[1]);
    // The arc is concave toward the chair: the ends come forward (+x).
    assert.ok(l[0] > screenPoint(0.5, 0.5)[0]);
  });

  it("is one continuous strip: shared join vertices, monotonic UVs, edges at 0 and 1", () => {
    const surface = screenSurface();
    const segments = MONITOR_SCREEN.segments;
    assert.equal(segments, 12);
    assert.equal(
      surface.positions.length / 3,
      (segments + 1) * 2,
      "no duplicated seam vertices",
    );
    assert.equal(surface.indices.length, segments * 6);
    const us = [];
    for (let i = 0; i < surface.uvs.length; i += 2) us.push(surface.uvs[i]);
    const columns = us.filter((_, i) => i % 2 === 0);
    assert.equal(columns[0], 0);
    assert.equal(columns.at(-1), 1);
    for (let i = 1; i < columns.length; i++)
      assert.ok(columns[i] > columns[i - 1]);
    // Even steps in u match even steps in angle: no stretched segment.
    const step = columns[1] - columns[0];
    for (let i = 1; i < columns.length; i++)
      assert.ok(
        Math.abs(columns[i] - columns[i - 1] - step) < 1e-6,
        "float32 UVs",
      );
    for (let i = 1; i < surface.uvs.length; i += 4) {
      assert.equal(surface.uvs[i], 0);
      assert.equal(surface.uvs[i + 2], 1);
    }
  });

  it("faces the chair: every triangle winds counter-clockwise toward +x", () => {
    const { positions, indices } = screenSurface();
    const at = (i: number): V => [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    ];
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [
        at(indices[t]),
        at(indices[t + 1]),
        at(indices[t + 2]),
      ];
      const n = cross(sub(b, a), sub(c, a));
      assert.ok(n[0] > 0, "front face toward the room");
    }
  });

  it("replaces only the ultrawide's glow parts (screen, horizon, sun, HUD)", () => {
    const hidden = meshes.glow.filter(isMainScreenGlow);
    assert.equal(hidden.length, 26);
    assert.ok(
      hidden.every((p) => p.curve !== undefined && p.led === undefined),
    );
    assert.ok(
      meshes.glow
        .filter((p) => p.item === "portrait")
        .every((p) => !isMainScreenGlow(p)),
    );
    assert.ok(
      meshes.glow
        .filter((p) => p.led !== undefined || p.channel)
        .every((p) => !isMainScreenGlow(p)),
    );
  });
});

describe("monitor focus pose (T16)", () => {
  it("is finite, aims at the screen centre from the room side, and stays in the room", () => {
    for (const aspect of ASPECTS) {
      const { position, target } = monitorFocus(aspect);
      assert.ok([...position, ...target].every(Number.isFinite));
      assert.deepEqual(target, MONITOR_SCREEN.center);
      assert.ok(position[0] > target[0] + MONITOR_FOCUS.minDistance * 0.9);
      assert.ok(position[0] < MAIN_ROOM.x1 - 0.3);
      assert.ok(
        Math.abs(position[2] - target[2]) < 1e-9,
        "face-on, not from the side",
      );
    }
    assert.throws(() => monitorFocus(Number.NaN), RangeError);
    assert.throws(() => monitorFocus(0), RangeError);
  });

  it("keeps clear of the chair through its whole sway and of the desk", () => {
    for (const aspect of ASPECTS) {
      const { position } = monitorFocus(aspect);
      for (const part of [...swayed, ...fixed])
        assert.ok(boxDistance(position, part) > 0.12, `${part.item} ${aspect}`);
    }
  });

  it("sees the whole screen: no setup part crosses a sight line", () => {
    for (const aspect of ASPECTS) {
      const { position } = monitorFocus(aspect);
      for (const u of [0.03, 0.25, 0.5, 0.75, 0.97])
        for (const v of [0.06, 0.5, 0.94]) {
          const point = screenPoint(u, v);
          for (const part of [...swayed, ...fixed].filter(
            (p) => p.item !== "lightbar" && p.item !== "monitor-arm",
          ))
            assert.ok(
              !crosses(position, point, part),
              `${part.item} hides ${u},${v} at ${aspect}`,
            );
        }
    }
  });

  it("frames the whole ultrawide with padding on wide viewports", () => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [2560, 1080],
      [3440, 1440],
      [5120, 1440],
    ]) {
      const pose = monitorFocus(width / height);
      const outer = screenRect(pose, GUIDE.fov, { width, height }, "outer");
      assert.ok(
        outer.left >= width * 0.03 && outer.left + outer.width <= width * 0.97,
        `${width}`,
      );
      assert.ok(
        outer.top >= height * 0.03 && outer.top + outer.height <= height * 0.97,
        `${height}`,
      );
      assert.ok(
        outer.width / outer.height > 2.3,
        "still reads as an ultrawide",
      );
    }
  });

  it("leaves the guided camera's limits untouched; its own limits only loosen", () => {
    assert.deepEqual(GUIDE.limits, {
      minPolar: 0.35,
      maxPolar: 1.35,
      minDistance: 4,
      maxDistance: 40,
    });
    assert.ok(MONITOR_FOCUS.limits.minDistance < MONITOR_FOCUS.minDistance);
    assert.ok(MONITOR_FOCUS.limits.maxDistance > MONITOR_FOCUS.maxDistance);
  });

  it("only offers entry from the room side once the walls have dissolved", () => {
    const { position } = monitorFocus(16 / 9);
    assert.equal(canEnterMonitor(position), true);
    assert.equal(
      canEnterMonitor([MONITOR_SCREEN.center[0] - 0.5, 1.3, -1.3]),
      false,
      "behind the wall",
    );
    assert.equal(
      canEnterMonitor([20, 14, 20]),
      false,
      "home framing, house whole",
    );
    assert.equal(canEnterMonitor([Number.NaN, 0, 0]), false);
  });
});

// L64/L66: the DOM rectangle placed over the projected inscribed screen was
// rejected by the user (a flat window pasted in the curved monitor), so its
// frame tests are gone; terminal-layout.test.ts covers the curved render.
describe("close-up framing (T16)", () => {
  it("leaves the bezel and the room visible above and below the screen", () => {
    for (const [width, height] of [
      [320, 568],
      [375, 812],
      [768, 1024],
      [1440, 900],
      [3440, 1440],
    ]) {
      const outer = screenRect(
        monitorFocus(width / height),
        GUIDE.fov,
        { width, height },
        "outer",
      );
      assert.ok(
        outer.top > 0 && outer.top + outer.height < height,
        `${width}x${height}`,
      );
    }
  });
});

describe("terminal wiring (T16)", () => {
  it("threads entry through both Setup branches of the scene", () => {
    const scene = read("src/components/world/WorldScene.tsx");
    const setups = scene.match(/<Setup\b[\s\S]*?\/>/g) ?? [];
    assert.equal(setups.length, 2);
    for (const setup of setups) assert.match(setup, /terminal=\{terminal\}/);
  });

  it("hides only the replaced glow in Setup and keeps the hour's glow on the new screen", () => {
    const setup = read("src/components/world/Setup.tsx");
    assert.match(setup, /!isMainScreenGlow\(part\)/);
    assert.match(setup, /<MonitorScreen[\s\S]*?glow=\{base\}/);
  });

  it("guards the wheel and locks orbit input while the monitor has focus", () => {
    const scene = read("src/components/world/WorldScene.tsx");
    assert.match(scene, /if \(focused\.current\) return;/);
    assert.match(scene, /enabled=\{!focus\}/);
  });

  it("draws the terminal only on the curved screen: no visible DOM editor (L64)", () => {
    const app = read("src/components/world/WorldApp.tsx");
    assert.doesNotMatch(app, /terminalFrame|frame=\{/);
    const companion = read("src/components/world/TerminalMonitor.tsx");
    assert.doesNotMatch(companion, /<dialog|showModal|style=\{\{\s*left/);
    assert.match(companion, /className="terminal-companion"/);
    const css = read("src/components/world/terminal-monitor.css");
    assert.doesNotMatch(css, /terminal-screen|position:\s*fixed|::backdrop/);
    // The companion is clipped to nothing: readable by assistive tech only.
    assert.match(css, /\.terminal-companion\s*\{[^}]*clip-path: inset\(50%\)/);
    const screen = read("src/components/world/MonitorScreen.tsx");
    assert.match(screen, /terminalLayout\(|drawTerminal\(/);
    assert.match(screen, /hitAt\(/);
    assert.match(screen, /event\.uv/);
    assert.match(screen, /"noopener,noreferrer"/);
    assert.match(screen, /safeExternalUrl\(/);
    assert.match(app, /Enter terminal/);
    assert.match(app, /Exit terminal/);
    assert.match(app, /menuButton\.current\?\.focus\(\)/);
  });

  it("keeps the clock and the lights panel direct children of the world container (L61)", () => {
    // ScenePanel lifts itself by measuring its parent element: any wrapper
    // (a display: contents one has a zero rect) pushes it off-screen.
    const source = read("src/components/world/WorldApp.tsx");
    const found = jsxAncestors(
      source.slice(source.indexOf("<div\n      ref={root}")),
    );
    for (const name of ["ScenePanel", "TimeController"]) {
      assert.deepEqual(
        found[name],
        ["div"],
        `${name} sits right in the root div`,
      );
    }
    assert.match(source, /<div\s+ref=\{root\}/);
    assert.doesNotMatch(source, /"contents"/);
  });

  it("hides the world controls only while the terminal is on, by visibility, with exact selectors (L61)", () => {
    const app = read("src/components/world/WorldApp.tsx");
    assert.match(app, /focus && "world-terminal-focus"/);
    const css = read("src/components/world/terminal-monitor.css");
    const rule = css.match(/([^{}]*)\{\s*visibility: hidden;\s*\}/);
    assert.ok(rule, "a visibility-only rule");
    const selectors = rule[1]
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((selector) => selector.trim());
    assert.deepEqual(selectors, [
      ".world-terminal-focus > .scene-panel",
      '.world-terminal-focus > section[aria-label="Time of day"]',
    ]);
    assert.doesNotMatch(css, /world-terminal-focus[^{]*\{[^}]*display:\s*none/);
  });
});
