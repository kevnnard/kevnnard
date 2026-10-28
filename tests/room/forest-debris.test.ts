import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import {
  DEBRIS_MODELS,
  type DebrisPiece,
  debrisFootprint,
  footprintGround,
  forestDebris,
} from "../../src/lib/room/forest-debris.ts";
import { lowFogFactor } from "../../src/lib/room/forest-fog.ts";
import {
  forestTrees,
  terrainHeight,
  WALK_DISC,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import { hidesRoom, VIEW_ZONE } from "../../src/lib/room/forest-view.ts";
import { PLOT } from "../../src/lib/room/house-layout.ts";

const count = (pieces: DebrisPiece[], kind: DebrisPiece["kind"]) =>
  pieces.filter((piece) => piece.kind === kind).length;

it("matches the debris footprints to the shipped model sizes", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        "../../public/models/forest-debris/manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const asset of manifest.assets as {
    name: "log" | "stump" | "rocks";
    meshes: { node: string; sourceSizeMeters: number[] }[];
  }[]) {
    const models = DEBRIS_MODELS[asset.name === "rocks" ? "rock" : asset.name];
    assert.deepEqual(
      models.map((model) => model.node),
      asset.meshes.map((mesh) => mesh.node),
    );
    asset.meshes.forEach((mesh, i) => {
      assert.deepEqual(models[i].size, mesh.sourceSizeMeters);
    });
  }
});

it("scatters a seeded, bounded set of individual logs, stumps and rocks", () => {
  const pieces = forestDebris();
  assert.deepEqual(pieces, forestDebris());
  assert.ok(count(pieces, "log") >= 3 && count(pieces, "log") <= 5);
  assert.ok(count(pieces, "stump") >= 2 && count(pieces, "stump") <= 3);
  assert.ok(count(pieces, "rock") >= 12 && count(pieces, "rock") <= 20);
  // Rocks are individual meshes from the set, never the whole six-rock set.
  const variants = new Set(
    pieces
      .filter((piece) => piece.kind === "rock")
      .map((piece) => piece.variant),
  );
  assert.ok(variants.size >= 5);
  for (const piece of pieces) {
    assert.ok(
      piece.variant >= 0 && piece.variant < DEBRIS_MODELS[piece.kind].length,
    );
    assert.ok(
      Number.isFinite(
        piece.x + piece.z + piece.yaw + piece.scale + piece.burial,
      ),
    );
    assert.ok(piece.scale > 0.2 && piece.scale <= 1.2);
    // Partly buried, never floating and never fully sunk.
    assert.ok(piece.burial >= 0.05 && piece.burial <= 0.5);
    // Rests on the lowest rendered ground under its whole footprint: never
    // floating on a slope, and the uphill side is buried by a bounded amount.
    const height = DEBRIS_MODELS[piece.kind][piece.variant].size[1];
    const reach = debrisFootprint(piece);
    let high = -Infinity;
    for (let i = 0; i < 24; i++)
      for (const r of [0, reach / 2, reach]) {
        const angle = (i / 24) * Math.PI * 2;
        const ground =
          WORLD.groundY +
          terrainHeight(
            piece.x + Math.cos(angle) * r,
            piece.z + Math.sin(angle) * r,
          );
        assert.ok(piece.y <= ground + 0.02, `${piece.kind} floats`);
        high = Math.max(high, ground);
      }
    assert.equal(piece.y, footprintGround(piece).low);
    assert.ok(high - piece.y <= height * piece.scale * 0.4, "not swallowed");
  }
});

const top = (piece: DebrisPiece) => {
  const height = DEBRIS_MODELS[piece.kind][piece.variant].size[1] * piece.scale;
  return piece.y + height * (1 - piece.burial);
};

it("keeps every whole piece clear of the walk area, house, room view, trees and each other", () => {
  const pieces = forestDebris();
  const trees = forestTrees();
  const [hx, hz] = VIEW_ZONE.home;
  for (const [i, piece] of pieces.entries()) {
    const reach = debrisFootprint(piece);
    const away = Math.hypot(piece.x - hx, piece.z - hz);
    assert.ok(away <= 40, `near the viewing zone, ${away}`);
    assert.ok(
      Math.hypot(piece.x - WALK_DISC.x, piece.z - WALK_DISC.z) - reach >
        WALK_DISC.radius,
      "the whole footprint stays outside the walk area",
    );
    assert.ok(
      piece.x + reach < PLOT.min[0] ||
        piece.x - reach > PLOT.max[0] ||
        piece.z + reach < PLOT.min[2] ||
        piece.z - reach > PLOT.max[2],
    );
    // Low pieces may sit in the corridor only below the sight line to the
    // room floor; nothing rises over the interior.
    assert.ok(!hidesRoom(piece.x, piece.z, reach, top(piece)));
    for (const tree of trees)
      assert.ok(Math.hypot(tree.x - piece.x, tree.z - piece.z) > reach + 1);
    for (const other of pieces.slice(i + 1))
      assert.ok(
        Math.hypot(other.x - piece.x, other.z - piece.z) >
          reach + debrisFootprint(other),
      );
  }
});

it("groups debris in natural clumps that stay visible through the lowland fog", () => {
  const pieces = forestDebris();
  const clumped = pieces.filter((a) =>
    pieces.some((b) => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 7),
  );
  assert.ok(clumped.length >= pieces.length * 0.8);
  // Several clumps across the view, not one pile.
  const [hx, hz] = VIEW_ZONE.home;
  const bearings = new Set(
    pieces.map((piece) =>
      Math.floor(
        ((Math.atan2(piece.z - hz, piece.x - hx) + Math.PI) / (Math.PI * 2)) *
          16,
      ),
    ),
  );
  assert.ok(bearings.size >= 4);
  const camera = { x: hx, y: 1.85, z: hz };
  for (const piece of pieces)
    assert.ok(
      lowFogFactor({ x: piece.x, y: piece.y, z: piece.z }, camera) < 0.3,
    );
});
