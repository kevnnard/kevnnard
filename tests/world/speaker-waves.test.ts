// Speaker focus console (T4, S5-S6): the subtle sound waves beside the
// shelf speakers. Only real playback shows them; their arcs sit just in
// front of each cabinet's own face, inside the room, and stay bounded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { partBounds, setupMeshes } from "../../src/lib/world/setup.ts";
import { SPEAKER_BOXES, SPEAKER_PAIR } from "../../src/lib/world/speaker.ts";
import type { MusicState } from "../../src/lib/world/speaker-music.ts";
import {
  advancePhase,
  SPEAKER_WAVES,
  WAVE_ARCS,
  WAVE_VERTICES,
  waveAnchors,
  waveBuffers,
  waveRing,
  wavesActive,
  writeWaves,
} from "../../src/lib/world/speaker-waves.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const music = (patch: Partial<MusicState>): MusicState => ({
  status: "idle",
  playing: false,
  track: null,
  error: null,
  ...patch,
});
const shown = { hidden: false, reducedMotion: false };
const LEFT_GAP = SPEAKER_BOXES[1].min[2] - SPEAKER_BOXES[0].max[2];

describe("speaker waves: only real playback", () => {
  it("shows waves while the source actually plays", () => {
    assert.equal(
      wavesActive(music({ status: "playing", playing: true }), shown),
      true,
    );
  });

  it("stays off when idle, loading, paused or failed", () => {
    for (const state of [
      music({}),
      // Requested but not sounding yet: intent alone shows nothing.
      music({ status: "loading", playing: true }),
      music({ status: "paused", playing: false }),
      music({ status: "error", playing: false, error: "x" }),
      music({ status: "playing", playing: false }),
    ])
      assert.equal(wavesActive(state, shown), false, state.status);
  });

  it("stays off in a hidden tab and with reduced motion", () => {
    const playing = music({ status: "playing", playing: true });
    assert.equal(wavesActive(playing, { ...shown, hidden: true }), false);
    assert.equal(
      wavesActive(playing, { ...shown, reducedMotion: true }),
      false,
    );
  });
});

describe("speaker waves: phase and rings", () => {
  it("advances by real time over the period and wraps into [0, 1)", () => {
    const { period, maxStep } = SPEAKER_WAVES;
    const step = maxStep / 2;
    assert.ok(Math.abs(advancePhase(0.2, step) - (0.2 + step / period)) < 1e-9);
    const wrapped = advancePhase(1 - step / period / 2, step);
    assert.ok(Math.abs(wrapped - step / period / 2) < 1e-9);
  });

  it("caps long gaps and drops non-finite or backwards steps", () => {
    const step = SPEAKER_WAVES.maxStep / SPEAKER_WAVES.period;
    assert.ok(Math.abs(advancePhase(0, 3600) - step) < 1e-9);
    assert.equal(advancePhase(0.4, -2), 0.4);
    assert.equal(advancePhase(0.4, Number.NaN), 0.4);
    assert.equal(advancePhase(Number.POSITIVE_INFINITY, 0.1), 0);
  });

  it("keeps every ring's radius and opacity finite and bounded", () => {
    const { inner, spread, opacity } = SPEAKER_WAVES;
    for (const phase of [0, 0.13, 0.5, 0.99, -3.2, 7.75, Number.NaN])
      for (let k = 0; k < SPEAKER_WAVES.arcs; k++) {
        const ring = waveRing(phase, k);
        assert.ok(Number.isFinite(ring.radius) && Number.isFinite(ring.alpha));
        assert.ok(ring.radius >= inner && ring.radius <= inner + spread);
        assert.ok(ring.alpha >= 0 && ring.alpha <= opacity);
      }
  });

  it("fades rings in and out: invisible where they wrap", () => {
    assert.equal(waveRing(0, 0).alpha, 0);
    assert.ok(waveRing(0.5, 0).alpha > 0.99 * SPEAKER_WAVES.opacity);
    // Staggered like the artboard: never all at the same radius.
    const radii = [0, 1, 2].map((k) => waveRing(0.2, k).radius);
    assert.equal(new Set(radii).size, 3);
  });
});

describe("speaker waves: the original speakers", () => {
  it("keeps inner waves and mirrors them on the outer side of each cabinet", () => {
    const anchors = waveAnchors();
    assert.equal(anchors.length, SPEAKER_BOXES.length * 2);
    SPEAKER_BOXES.forEach((box, i) => {
      const inner = anchors[i * 2];
      const outer = anchors[i * 2 + 1];
      const direction = Math.sign(SPEAKER_PAIR.center[2] - box.center[2]);
      assert.equal(
        inner.inward,
        direction,
        "original inner direction retained",
      );
      assert.equal(outer.inward, -direction, "new outer direction mirrors it");
      for (const anchor of [inner, outer]) {
        assert.ok(anchor.origin[0] > box.max[0], "in front of the face");
        assert.ok(anchor.origin[0] - box.max[0] < 0.05, "just in front");
        assert.equal(anchor.origin[1], box.center[1]);
        assert.ok(
          Math.abs(
            Math.abs(anchor.origin[2] - box.center[2]) - box.size[2] / 2,
          ) < 1e-9,
        );
      }
      assert.ok(
        Math.abs(inner.origin[2] + outer.origin[2] - 2 * box.center[2]) < 1e-9,
      );
    });
    assert.deepEqual(SPEAKER_PAIR.normal, [1, 0, 0]);
  });

  it("uses few vertices: three arcs on each side of each cabinet, one draw", () => {
    assert.equal(SPEAKER_WAVES.arcs, 3);
    assert.equal(WAVE_ARCS, 2 * 2 * 3);
    assert.equal(WAVE_VERTICES, WAVE_ARCS * SPEAKER_WAVES.segments * 2);
    assert.ok(WAVE_VERTICES <= 512);
    const { positions, colors } = waveBuffers();
    assert.equal(positions.length, WAVE_VERTICES * 3);
    assert.equal(colors.length, WAVE_VERTICES * 4);
  });

  it("writes finite arcs beside each cabinet, inside its height", () => {
    const buffers = waveBuffers();
    const anchors = waveAnchors();
    const perSide = SPEAKER_WAVES.arcs * SPEAKER_WAVES.segments * 2;
    for (const phase of [0, 0.37, 0.81]) {
      writeWaves(phase, buffers);
      for (let v = 0; v < WAVE_VERTICES; v++) {
        const side = Math.floor(v / perSide);
        const c = Math.floor(side / 2);
        const box = SPEAKER_BOXES[c];
        const [x, y, z] = buffers.positions.subarray(v * 3, v * 3 + 3);
        assert.ok([x, y, z].every(Number.isFinite));
        assert.equal(x, Math.fround(anchors[side].origin[0]));
        assert.ok(y > box.min[1] && y < box.max[1], "within the cabinet");
        // Out from either side, clear of the cabinet itself.
        const out = (z - box.center[2]) * anchors[side].inward;
        assert.ok(out > box.size[2] / 2, "beside, not over, its cabinet");
        assert.ok(out < (LEFT_GAP + box.size[2]) / 2, "short of the middle");
        const alpha = buffers.colors[v * 4 + 3];
        assert.ok(alpha >= 0 && alpha <= SPEAKER_WAVES.opacity);
      }
    }
  });

  it("clears every other setup part: nothing cuts through the waves", () => {
    const buffers = waveBuffers();
    writeWaves(0.5, buffers);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < WAVE_VERTICES; v++)
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], buffers.positions[v * 3 + i]);
        hi[i] = Math.max(hi[i], buffers.positions[v * 3 + i]);
      }
    // The widest rings, at full radius.
    const { inner, spread } = SPEAKER_WAVES;
    for (const anchor of waveAnchors()) {
      const r = inner + spread;
      lo[1] = Math.min(lo[1], anchor.origin[1] - r);
      hi[1] = Math.max(hi[1], anchor.origin[1] + r);
    }
    for (const part of setupMeshes().solid) {
      if (part.item === "speaker") continue;
      const b = partBounds(part);
      const overlaps =
        b.x0 < hi[0] &&
        b.x1 > lo[0] &&
        b.y0 < hi[1] &&
        b.y1 > lo[1] &&
        b.z0 < hi[2] &&
        b.z1 > lo[2];
      assert.equal(overlaps, false, `${part.item} crosses the waves`);
    }
  });
});

describe("speaker waves: scene wiring (source supplement)", () => {
  const scene = read("src/components/world/WorldScene.tsx");
  const waves = read("src/components/world/SpeakerWaves.tsx");

  it("mounts once, at the canvas top level, only with speakers", () => {
    assert.equal(scene.match(/<SpeakerWaves\b/g)?.length, 1);
    assert.match(
      scene,
      /\{speakers && \(\s*<SpeakerWaves\s+music=\{speakers\.music\}\s+reducedMotion=\{reducedMotion\}/,
    );
    const mount = scene.indexOf("<SpeakerWaves");
    assert.ok(mount > scene.indexOf("</Suspense>\n      <NightLights"));
    assert.ok(mount < scene.indexOf("</Canvas>"));
  });

  it("keeps the demand loop, the clouds and the speakers' controls", () => {
    assert.match(scene, /frameloop="demand"/);
    assert.match(scene, /clouds\.current\.rotation\.y \+= delta \* 0\.01;/);
    assert.match(read("src/components/world/Setup.tsx"), /<SpeakerZone /);
  });

  it("follows the player and the tab, and cleans up", () => {
    assert.match(waves, /useSyncExternalStore\(\s*music\.subscribe/);
    assert.match(waves, /addEventListener\("visibilitychange"/);
    assert.match(waves, /removeEventListener\("visibilitychange"/);
    assert.match(waves, /clearInterval\(/);
    assert.match(waves, /geometry\.dispose\(\)/);
    assert.match(waves, /material\.dispose\(\)/);
    assert.match(waves, /raycast = \(\) => \{/);
    assert.doesNotMatch(
      waves,
      /requestAnimationFrame|useFrame|three\/examples/,
    );
    assert.doesNotMatch(waves, /shaderMaterial|ShaderMaterial|Points/);
  });
});
