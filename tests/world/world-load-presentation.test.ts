import assert from "node:assert/strict";
import { it } from "node:test";
import {
  presentWorldLoad,
  WORLD_REVEAL_MS,
} from "../../src/lib/world/world-load-presentation.ts";

const ready = { progress: 100, phase: "ready" as const, error: null };
it("reveals cached readiness over 2.5 seconds rather than skipping the drawing", () => {
  assert.equal(WORLD_REVEAL_MS, 2500);
  assert.deepEqual(presentWorldLoad(ready, 0), {
    progress: 1,
    phase: "frame",
    error: null,
  });
  assert.equal(presentWorldLoad(ready, 1250).progress, 50);
  assert.equal(presentWorldLoad(ready, 2499).progress, 99);
  assert.deepEqual(presentWorldLoad(ready, 2500), ready);
});
it("never overtakes actual preparation, even after the visual duration", () => {
  const pending = { progress: 34, phase: "assets" as const, error: null };
  assert.deepEqual(presentWorldLoad(pending, 5000), pending);
  assert.ok(presentWorldLoad(pending, 100).progress <= 34);
  const frame = { progress: 99, phase: "frame" as const, error: null };
  assert.deepEqual(presentWorldLoad(frame, 99999), frame);
});
it("surfaces failures immediately without a presentation delay", () => {
  const failed = {
    progress: 53,
    phase: "assets" as const,
    error: "Context lost",
  };
  assert.deepEqual(presentWorldLoad(failed, 0), failed);
});
