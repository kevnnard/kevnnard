import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { patronusFxAt, streamPoint } from "../../src/lib/world/patronus-fx.ts";
import { WAND_TIP } from "../../src/lib/world/wand.ts";

it("forms from a continuous light stream, holds, and dissolves gently", () => {
  assert.equal(patronusFxAt(-1).stream, 0);
  assert.ok(patronusFxAt(0.7).stream > 0);
  assert.equal(patronusFxAt(2).stream, 0);
  assert.ok(patronusFxAt(1).formation < patronusFxAt(1.5).formation);
  assert.equal(patronusFxAt(2).formation, 1);
  assert.ok(patronusFxAt(4.3).dissolve > 0);
  assert.equal(patronusFxAt(6).mist, 0);
  const calm = patronusFxAt(2, true);
  assert.equal(calm.stream, 0);
  assert.equal(calm.mist, 0);
  assert.ok(calm.formation > 0);
});
it("replays the clip from the spell clock rather than accumulating prior casts", () => {
  const source = readFileSync(
    new URL("../../src/components/world/Patronus.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /mixer\.setTime\(state\.time\)/);
  assert.doesNotMatch(source, /mixer\.update\(delta\)/);
});

it("anchors the stream at the actual tip and tapers into its destination", () => {
  const end = [0, 0.8, 0.7] as const;
  assert.deepEqual(streamPoint(0, end, 0), [...WAND_TIP]);
  assert.deepEqual(streamPoint(1, end, 0), [...end]);
  for (let i = 0; i <= 100; i++)
    assert.ok(streamPoint(i / 100, end, 0.6).every(Number.isFinite));
});
