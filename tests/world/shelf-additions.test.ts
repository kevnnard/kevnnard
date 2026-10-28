import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "node:test";
import { partBounds } from "../../src/lib/world/setup.ts";
import {
  SHELF,
  SHELF_TIERS,
  shelfBudget,
  shelfParts,
} from "../../src/lib/world/shelf.ts";

it("preserves all 78 original parts, positions and materials exactly", () => {
  const original = shelfParts().filter(
    (p) =>
      !["trophy", "medal", "film-roll", "lens", "photo-print"].includes(
        p.item,
      ) && !p.group.startsWith("extra-"),
  );
  assert.equal(original.length, 78);
  assert.equal(
    createHash("sha256").update(JSON.stringify(original)).digest("hex"),
    "9c9fffb7bcdd137d08383612d14f6335bfd8451a7857c2fc8371a26b059ccc6b",
  );
});

it("adds reference trophies and medals while preserving the original collection", () => {
  const parts = shelfParts();
  for (const item of ["trophy", "medal", "film-roll", "lens", "photo-print"])
    assert.ok(
      parts.some((p) => p.item === item),
      item,
    );
  for (const group of [
    "polaroid",
    "zenit",
    "samsung",
    "psu",
    "ryzen",
    "keyboard",
    "gigabyte",
  ])
    assert.ok(
      parts.some((p) => p.group === group),
      group,
    );
  assert.equal(
    new Set(parts.filter((p) => p.item === "trophy").map((p) => p.group)).size,
    2,
  );
  assert.equal(
    new Set(parts.filter((p) => p.item === "medal").map((p) => p.group)).size,
    3,
  );
  assert.ok(parts.filter((p) => p.item === "book").length >= 17);
  assert.ok(parts.some((p) => p.item === "trophy" && p.color === "#159768"));
});

it("keeps added displays inside the unchanged shelf with supported bases", () => {
  const parts = shelfParts();
  const original = new Set([
    "carcass",
    "football",
    "polaroid-camera",
    "zenit-camera",
    "samsung-camera",
    "polaroid-carton",
    "psu-box",
    "ryzen-box",
    "gigabyte-box",
    "memory",
    "nvme",
    "keyboard",
    "book",
  ]);
  const groups = new Map<string, ReturnType<typeof partBounds>[]>();
  for (const p of parts.filter((p) => !original.has(p.item))) {
    const b = partBounds(p);
    assert.ok(b.x0 >= -SHELF.width / 2 && b.x1 <= SHELF.width / 2, p.group);
    assert.ok(b.z0 >= -SHELF.depth / 2 && b.z1 <= SHELF.depth / 2, p.group);
    assert.ok(b.y1 <= 1.68, p.group);
    groups.set(p.group, [...(groups.get(p.group) ?? []), b]);
  }
  assert.ok(groups.size >= 10);
  for (const [name, bounds] of groups) {
    const bottom = Math.min(...bounds.map((b) => b.y0));
    assert.ok(
      [...SHELF_TIERS, SHELF.height].some((y) => Math.abs(bottom - y) < 0.002),
      `${name}: ${bottom}`,
    );
  }
  assert.ok(shelfBudget().draws <= 9);
  assert.ok(shelfBudget().triangles < 22000);
});
