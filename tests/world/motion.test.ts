import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANIMATION_DISTANCE,
  BOUNCE,
  bounceStep,
  CHAIR_SWAY,
  chairSway,
  googleLedOpacity,
  LED_MIN,
  LOUPEDECK,
  ledLevel,
  loupedeckButton,
  setupAnimates,
} from "../../src/lib/world/motion.ts";
import {
  partBounds,
  SETUP_PROPS,
  setupMeshes,
  swivelPart,
} from "../../src/lib/world/setup.ts";
import { normalizeWheel } from "../../src/lib/world/wheel.ts";

const meshes = setupMeshes();
const overlap = (
  a: ReturnType<typeof partBounds>,
  b: ReturnType<typeof partBounds>,
) =>
  a.x0 < b.x1 &&
  a.x1 > b.x0 &&
  a.y0 < b.y1 &&
  a.y1 > b.y0 &&
  a.z0 < b.z1 &&
  a.z1 > b.z0;

describe("setup animations (T4i, ported from Bruno Simon's my-room-in-3d)", () => {
  it("renders continuously only near the house and never with reduced motion", () => {
    assert.equal(setupAnimates({ reducedMotion: false, distance: 6 }), true);
    assert.equal(setupAnimates({ reducedMotion: true, distance: 6 }), false);
    assert.equal(
      setupAnimates({ reducedMotion: false, distance: ANIMATION_DISTANCE }),
      false,
    );
    assert.equal(setupAnimates({ reducedMotion: false, distance: 30 }), false);
    assert.ok(ANIMATION_DISTANCE <= 16);
  });

  it("sways the chair around its column, within ±0.25 rad", () => {
    assert.ok(CHAIR_SWAY <= 0.25);
    let max = 0;
    for (let t = 0; t < 20_000; t += 37)
      max = Math.max(max, Math.abs(chairSway(t)));
    assert.ok(max <= CHAIR_SWAY + 1e-9 && max > CHAIR_SWAY * 0.95, `${max}`);
    assert.equal(chairSway(0), 0, "centered at rest");
  });

  it("keeps the swaying chair clear of the desk, monitors, PC and props", () => {
    // Bruno's top chair (T4k) swivels as a hull of boxes around its mesh.
    const swivel = [
      ...meshes.solid.filter((part) => part.rig === "swivel"),
      ...meshes.hull,
    ];
    assert.ok(meshes.hull.length >= 6, "Bruno's seat, back and armrests");
    assert.ok(
      meshes.hull.every((part) => part.rig === "swivel"),
      "hull swivels",
    );
    const fixed = [...meshes.solid, ...meshes.glow, ...meshes.glass].filter(
      (part) => !part.rig,
    );
    const mug = SETUP_PROPS.mug;
    for (let k = -8; k <= 8; k++) {
      const angle = (CHAIR_SWAY * k) / 8;
      for (const part of swivel) {
        const b = partBounds(swivelPart(part, angle));
        for (const other of fixed)
          assert.ok(!overlap(b, partBounds(other)), `${angle} hits desk`);
        assert.ok(b.x0 > mug.center[0] + mug.radius, "clear of the mug");
      }
    }
  });

  it("breathes the LEDs with the wave, never below 40% of the hour's glow", () => {
    const base = 1.1;
    for (let t = 0; t < 10_000; t += 13)
      for (const index of [0, 1, 2, 3]) {
        const level = ledLevel(t, index, base);
        assert.ok(level >= LED_MIN * base - 1e-9 && level <= base + 1e-9);
      }
    assert.ok(
      Math.abs(ledLevel(0, 0, base) - base * (LED_MIN + (1 - LED_MIN) * 0.5)) <
        1e-9,
    );
    assert.notEqual(ledLevel(500, 0, base), ledLevel(500, 1, base), "phased");
    assert.ok(
      meshes.glow.filter((part) => part.led !== undefined).length >= 4,
      "keyboard underglow and PC strips",
    );
  });

  it("breathes the Google Home LEDs with Bruno's phased wave", () => {
    for (let t = 0; t < 10_000; t += 17)
      for (const index of [0, 1, 2, 3]) {
        const level = googleLedOpacity(t, index);
        assert.ok(level >= 0 && level <= 1);
        assert.ok(
          Math.abs(level - (Math.sin(t * 0.002 - index * 0.5) * 0.5 + 0.5)) <
            1e-12,
        );
      }
  });

  it("lights a seeded half of the Loupedeck buttons every 5 s, then fades them", () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      const start = cycle * LOUPEDECK.period;
      let lit = 0;
      for (let index = 0; index < LOUPEDECK.buttons; index++) {
        const held = loupedeckButton(start + 1500, index);
        assert.ok(held.opacity === 0 || held.opacity === 1, `${held.opacity}`);
        assert.ok(LOUPEDECK.colors.includes(held.color));
        if (held.opacity === 1) lit++;
        assert.equal(loupedeckButton(start + 4900, index).opacity, 0, "faded");
        assert.equal(
          loupedeckButton(start + 1500, index).opacity,
          held.opacity,
          "deterministic",
        );
      }
      assert.ok(lit > 0 && lit < LOUPEDECK.buttons, `${lit} lit`);
    }
  });

  it("bounces the logo inside the side screen", () => {
    let state = { ...BOUNCE.start };
    for (let i = 0; i < 5_000; i++) {
      state = bounceStep(state, 16.7);
      assert.ok(
        state.x >= BOUNCE.limits.x.min && state.x <= BOUNCE.limits.x.max,
      );
      assert.ok(
        state.y >= BOUNCE.limits.y.min && state.y <= BOUNCE.limits.y.max,
      );
    }
    const flipped = bounceStep(
      { ...BOUNCE.start, x: BOUNCE.limits.x.max },
      100,
    );
    assert.equal(flipped.x, BOUNCE.limits.x.max);
    assert.ok(flipped.vx < 0, "reverses at the edge");
  });
});

describe("normalizeWheel", () => {
  it("normalizes pixel, line and page deltas to pixels", () => {
    assert.equal(normalizeWheel({ deltaY: 100, deltaMode: 0 }).pixelY, 100);
    assert.equal(normalizeWheel({ deltaY: 3, deltaMode: 1 }).pixelY, 120);
    assert.equal(normalizeWheel({ deltaY: 1, deltaMode: 2 }).pixelY, 800);
    assert.equal(normalizeWheel({ deltaY: 100, deltaMode: 0 }).spinY, 1);
    assert.equal(normalizeWheel({ deltaY: -0.5, deltaMode: 0 }).spinY, -1);
  });

  it("reads legacy wheelDelta when there is no deltaY", () => {
    const wheel = normalizeWheel({ wheelDelta: -120 });
    assert.equal(wheel.spinY, 1);
    assert.equal(wheel.pixelY, 10);
  });
});
