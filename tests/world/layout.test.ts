import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ISLAND,
  insideIsland,
  islandRadiusAt,
  onPad,
  PAD,
  undersideMesh,
} from "../../src/lib/world/island.ts";
import {
  islandLayout,
  KIND_SPECS,
  type NatureKind,
} from "../../src/lib/world/layout.ts";

describe("island shape", () => {
  it("is a chunky rounded square: wider on the diagonals than a circle", () => {
    const axis = islandRadiusAt(0);
    const diagonal = islandRadiusAt(Math.PI / 4);
    assert.ok(Math.abs(axis - ISLAND.halfX) < 1e-9);
    assert.ok(diagonal > axis * Math.SQRT1_2 * 1.15);
  });

  it("keeps the building pad flat, empty and inside the island", () => {
    for (const [sx, sz] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ])
      assert.ok(
        insideIsland(
          PAD.center[0] + sx * PAD.halfX,
          PAD.center[1] + sz * PAD.halfZ,
          1,
        ),
      );
    assert.ok(onPad(PAD.center[0], PAD.center[1]));
    assert.ok(!onPad(PAD.center[0] + PAD.halfX + 0.01, PAD.center[1]));
  });

  it("builds a closed, seeded rocky underside that tapers below the grass", () => {
    const a = undersideMesh(ISLAND.seed);
    const b = undersideMesh(ISLAND.seed);
    assert.deepEqual(a.positions, b.positions);
    assert.notDeepEqual(undersideMesh(ISLAND.seed + 1).positions, a.positions);
    const count = a.positions.length / 3;
    let minY = 0;
    for (let i = 0; i < count; i++) {
      const y = a.positions[i * 3 + 1];
      assert.ok(y <= 0 + 1e-9);
      minY = Math.min(minY, y);
    }
    assert.ok(minY <= -ISLAND.depth * 0.9);
    for (const index of a.indices) assert.ok(index < count);
    assert.equal(a.indices.length % 3, 0);
  });
});

describe("islandLayout", () => {
  it("is deterministic for a seed and changes with the seed", () => {
    assert.deepEqual(islandLayout(ISLAND.seed), islandLayout(ISLAND.seed));
    assert.notDeepEqual(islandLayout(1), islandLayout(2));
  });

  const layout = islandLayout(ISLAND.seed);
  const ground = layout.filter((item) => !KIND_SPECS[item.kind].floating);

  it("never places anything on the building pad (the house is T4)", () => {
    for (const item of ground)
      assert.ok(
        !onPad(
          item.position[0],
          item.position[2],
          KIND_SPECS[item.kind].clearance,
        ),
        `${item.kind} at ${item.position}`,
      );
  });

  it("keeps ground items on the grass, inside the rim", () => {
    for (const item of ground)
      assert.ok(
        insideIsland(item.position[0], item.position[2], 0.25),
        `${item.kind} at ${item.position}`,
      );
  });

  it("spaces items by their footprint, so trees never interpenetrate", () => {
    for (let i = 0; i < ground.length; i++)
      for (let j = i + 1; j < ground.length; j++) {
        const a = ground[i];
        const b = ground[j];
        const gap = Math.hypot(
          a.position[0] - b.position[0],
          a.position[2] - b.position[2],
        );
        const need =
          (KIND_SPECS[a.kind].radius * a.scale +
            KIND_SPECS[b.kind].radius * b.scale) *
          0.7;
        assert.ok(gap >= need, `${a.kind} vs ${b.kind}: ${gap} < ${need}`);
      }
  });

  it("has a stylized mix: trees, pines, grass tufts, rocks, path stones and clouds", () => {
    const counts = new Map<NatureKind, number>();
    for (const item of layout)
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    const total = (prefix: string) =>
      [...counts].reduce(
        (sum, [kind, n]) => (kind.startsWith(prefix) ? sum + n : sum),
        0,
      );
    assert.ok(total("tree") >= 4);
    assert.ok(total("pine") >= 3);
    assert.ok(total("tuft") >= 12);
    assert.ok(total("rock") >= 4);
    assert.ok(total("stone") >= 4);
    assert.ok(total("cloud") >= 2);
    assert.ok(layout.length <= 120, "instance budget");
  });

  it("uses finite transforms with a positive scale", () => {
    for (const item of layout) {
      assert.ok(item.position.every(Number.isFinite));
      assert.ok(Number.isFinite(item.rotationY));
      assert.ok(item.scale > 0);
    }
  });
});
