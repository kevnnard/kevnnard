// T15 (S28): the two shelf plants grow from tiny sprouts into substantial
// broad-leaf plants, in place on the shelf and clear of everything near them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOUSE } from "../../src/lib/world/house.ts";
import { LAMP, LIGHT_FIXTURES, lampParts } from "../../src/lib/world/lights.ts";
import {
  partBounds,
  SETUP,
  type SetupItem,
  type SetupPart,
  SHELF,
  setupMeshes,
} from "../../src/lib/world/setup.ts";

const EPS = 1e-6;
const meshes = setupMeshes();
const all = [...meshes.solid, ...meshes.glow, ...meshes.glass];
const item = (id: SetupItem) => all.filter((part) => part.item === id);
type Box = ReturnType<typeof partBounds>;
const box = (parts: SetupPart[]): Box => {
  const b = parts.map(partBounds);
  return {
    x0: Math.min(...b.map((v) => v.x0)),
    x1: Math.max(...b.map((v) => v.x1)),
    y0: Math.min(...b.map((v) => v.y0)),
    y1: Math.max(...b.map((v) => v.y1)),
    z0: Math.min(...b.map((v) => v.z0)),
    z1: Math.max(...b.map((v) => v.z1)),
  };
};
const gap = (a: Box, b: Box) =>
  Math.hypot(
    Math.max(0, a.x0 - b.x1, b.x0 - a.x1),
    Math.max(0, a.y0 - b.y1, b.y0 - a.y1),
    Math.max(0, a.z0 - b.z1, b.z0 - a.z1),
  );
const minGap = (a: SetupPart[], b: Box[]) =>
  Math.min(...a.flatMap((p) => b.map((q) => gap(partBounds(p), q))));

const plants = item("plant");
const groups = [...new Set(plants.map((p) => p.group))].map((g) =>
  plants.filter((p) => p.group === g),
);
/** Blade area of a leaf: an elliptical disc, or a flat box before T15. */
const area = (p: SetupPart) =>
  (p.shape === "round" ? Math.PI / 4 : 1) * p.size[0] * p.size[2];
/** Triangles per part as mergeParts builds them (16-sided cylinders). */
const triangles = (p: SetupPart) =>
  p.shape === "round"
    ? 64
    : p.shape === "rounded"
      ? 12 * (2 * (p.segments ?? 2) + 1) ** 2
      : 12;

// The S24 sprouts, measured at 2ea6a1d: 0.0996 m tall, 0.085 m across, six
// 5 x 2.2 cm leaves (0.0066 m² of blade) and 1680 triangles for the pair.
const OLD = { height: 0.0996, span: 0.085, area: 0.0066, triangles: 1680 };

describe("T15 bigger shelf plants (S28)", () => {
  it("grows each plant taller and fuller than the S24 sprouts", () => {
    assert.equal(groups.length, 2, "two plants");
    const heights = groups.map((parts) => {
      const b = box(parts);
      const leaves = box(parts.filter((p) => p.leaf));
      const h = b.y1 - b.y0;
      assert.ok(h >= 0.22 && h >= 2 * OLD.height, `height ${h}`);
      for (const span of [leaves.x1 - leaves.x0, leaves.z1 - leaves.z0])
        assert.ok(span >= 0.2 && span >= 2 * OLD.span, `span ${span}`);
      const blade = parts
        .filter((p) => p.leaf)
        .reduce((s, p) => s + area(p), 0);
      assert.ok(blade >= 4 * OLD.area, `leaf area ${blade}`);
      return h;
    });
    assert.ok(Math.abs(heights[0] - heights[1]) >= 0.03, "asymmetric");
  });

  it("uses broad, varied, organic leaves attached to a stem", () => {
    for (const parts of groups) {
      const leaves = parts.filter((p) => p.leaf);
      assert.ok(leaves.length >= 5, `${leaves.length} leaves`);
      for (const leaf of leaves) {
        const [length, thick, width] = leaf.size;
        assert.equal(leaf.shape, "round", "elliptical blade, not a prism");
        assert.ok(thick <= 0.008, "thin");
        assert.ok(width / length >= 0.5 && width / length <= 0.9, "broad");
        assert.ok(length >= 0.09, `length ${length}`);
      }
      const lengths = new Set(leaves.map((p) => p.size[0].toFixed(3)));
      assert.ok(lengths.size >= 3, "varied sizes");
      const tilts = new Set(leaves.map((p) => p.rotation?.[2].toFixed(2)));
      assert.ok(tilts.size >= 3, "varied tilts");
      const stem = parts.filter((p) => !p.leaf);
      for (const leaf of leaves)
        assert.ok(minGap([leaf], stem.map(partBounds)) < 0.003, "attached");
    }
  });
});

describe("T15 keeps the plants in place and clear (S28)", () => {
  it("stands the pots where S24 put them, on the shelf", () => {
    const pots = groups.map(
      (parts) => parts.filter((p) => !p.leaf && p.shape === "round")[0],
    );
    for (const [k, z] of [-1.65, -1.05].entries()) {
      assert.ok(Math.abs(pots[k].center[0] - (SHELF.x0 + 0.17)) < EPS);
      assert.ok(Math.abs(pots[k].center[2] - z) < EPS);
      assert.ok(Math.abs(partBounds(pots[k]).y0 - SHELF.top) < EPS, "on it");
    }
    for (const leaf of plants.filter((p) => p.leaf))
      assert.ok(partBounds(leaf).y0 >= SHELF.top + 0.05, "leaf off the board");
  });

  it("clears the lamps, speakers, monitors, wall and eave", () => {
    const eave = HOUSE.floorY + HOUSE.main.height;
    const lamps = (["lampLeft", "lampRight"] as const).flatMap((id) => {
      const [x, y, z] = LIGHT_FIXTURES[id].base;
      const { head, shade } = LAMP;
      const shadeBox = {
        x0: x + head.dx - shade.bottom,
        x1: x + head.dx + shade.bottom,
        y0: y + shade.y0,
        y1: y + shade.y1,
        z0: z - shade.bottom,
        z1: z + shade.bottom,
      };
      return [...lampParts(id).map(partBounds), shadeBox];
    });
    const screens = box([
      ...item("monitor"),
      ...item("portrait"),
      ...item("lightbar"),
    ]);
    for (const parts of groups) {
      const b = box(parts);
      assert.ok(minGap(parts, lamps) >= 0.03, `lamps ${minGap(parts, lamps)}`);
      const speakers = item("speaker").map(partBounds);
      assert.ok(minGap(parts, speakers) >= 0.05, "speakers");
      assert.ok(b.y0 >= screens.y1, "above the monitors");
      assert.ok(b.x0 >= SHELF.x0 + 0.01, "off the wall");
      assert.ok(b.x1 <= SHELF.x1 + EPS, "inside the shelf's front edge");
      assert.ok(b.z0 >= SHELF.z0 && b.z1 <= SHELF.z1, "along the shelf");
      assert.ok(eave - b.y1 >= 0.08, `eave ${eave - b.y1}`);
    }
    assert.ok(gap(box(groups[0]), box(groups[1])) >= 0.1, "apart");
  });

  it("holds the budget: 297 parts, 11 draws, no more plant triangles", () => {
    assert.equal(all.length + meshes.hull.length, 297);
    assert.equal(SETUP.draws, 11);
    assert.ok(plants.every((p) => p.material === "base"));
    const tris = plants.reduce((s, p) => s + triangles(p), 0);
    assert.ok(tris <= OLD.triangles, `${tris} triangles`);
  });
});
