import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Credits } from "../../src/lib/world/credits.ts";
import { HOUSE, WALLS } from "../../src/lib/world/house.ts";
import {
  LIVING,
  LIVING_FILES,
  LIVING_MODELS,
  LIVING_ZONE,
  livingGlow,
  livingMeshes,
  modelBounds,
} from "../../src/lib/world/living.ts";
import { PROP_FILES } from "../../src/lib/world/models.ts";
import {
  DOOR_SWING,
  MAIN_ROOM,
  partBounds,
  SETUP_ZONE,
} from "../../src/lib/world/setup.ts";
import { PUBLIC } from "./glb.ts";

const EPS = 1e-6;
const meshes = livingMeshes();
const parts = [...meshes.solid, ...meshes.glow];
type Box = ReturnType<typeof partBounds>;
const apart = (
  a: { x0: number; x1: number; z0: number; z1: number },
  b: { x0: number; x1: number; z0: number; z1: number },
) =>
  a.x1 <= b.x0 + EPS ||
  a.x0 >= b.x1 - EPS ||
  a.z1 <= b.z0 + EPS ||
  a.z0 >= b.z1 - EPS;
const boxes: { name: string; box: Box }[] = [
  ...parts.map((part) => ({ name: part.item, box: partBounds(part) })),
  ...LIVING_MODELS.map((model) => ({
    name: model.kind,
    box: modelBounds(model),
  })),
];
const floorItems = LIVING_MODELS.filter(
  (model) => model.onFloor && model.kind !== "rug",
);

describe("living area (T4j, S14)", () => {
  it("builds the TV, a DualSense controller, game cases and leafy potted plants", () => {
    const items = new Set(parts.map((part) => part.item));
    for (const item of ["tv", "controller", "game-case", "plant"])
      assert.ok(items.has(item), item);
    const plants = new Set(
      parts.filter((p) => p.item === "plant").map((p) => p.group),
    );
    assert.ok(plants.size >= 2 && plants.size <= 3, `${plants.size} plants`);
    for (const plant of plants) {
      const leaves = parts.filter(
        (p) => p.group === plant && p.role === "leaf",
      );
      assert.ok(leaves.length >= 8 && leaves.length <= 14, `${plant} leaves`);
    }
    const cases = new Set(
      parts.filter((p) => p.item === "game-case").map((p) => p.group),
    );
    assert.ok(cases.size >= 3 && cases.size <= 4, `${cases.size} cases`);
    for (const kind of ["sofa", "coffee-table", "tv-stand", "rug"])
      assert.ok(
        LIVING_MODELS.some((model) => model.kind === kind),
        kind,
      );
  });

  it("has no Nintendo Switch anywhere", () => {
    const names = [
      ...parts.flatMap((part) => [
        part.item,
        part.group ?? "",
        part.role ?? "",
      ]),
      ...LIVING_MODELS.map((model) => model.kind),
      ...Object.values(LIVING_FILES),
    ];
    for (const name of names)
      assert.doesNotMatch(name, /switch|nintendo|joy-?con/i);
  });

  it("rounds every original piece: no plain boxes", () => {
    for (const part of parts) assert.notEqual(part.shape, "box", part.item);
  });

  it("fits inside the main room, on the floor and under the eaves", () => {
    for (const { name, box } of boxes) {
      assert.ok(
        box.x0 >= MAIN_ROOM.x0 - EPS && box.x1 <= MAIN_ROOM.x1 + EPS,
        `${name} x`,
      );
      assert.ok(
        box.z0 >= MAIN_ROOM.z0 - EPS && box.z1 <= MAIN_ROOM.z1 + EPS,
        `${name} z`,
      );
      assert.ok(box.y0 >= HOUSE.floorY - EPS, `${name} above the floor`);
      assert.ok(
        box.y1 < HOUSE.floorY + HOUSE.main.height,
        `${name} below the eaves`,
      );
    }
  });

  it("keeps clear of the setup zone (chair sway included), the door swing and every door", () => {
    for (const { name, box } of boxes) {
      assert.ok(apart(box, SETUP_ZONE), `${name} in the setup zone`);
      assert.ok(apart(box, DOOR_SWING), `${name} in the door swing`);
    }
  });

  it("keeps windows clear: anything near one stays under its sill", () => {
    const reach = 0.35;
    for (const wall of WALLS.filter((w) => w.id.startsWith("main-")))
      for (const opening of wall.openings) {
        const [n0, n1] =
          wall.side > 0
            ? [wall.at - reach, wall.at]
            : [wall.at, wall.at + reach];
        const [u0, u1] = [opening.u0 - 0.1, opening.u1 + 0.1];
        const near =
          wall.axis === "x"
            ? { x0: u0, x1: u1, z0: n0, z1: n1 }
            : { x0: n0, x1: n1, z0: u0, z1: u1 };
        for (const { name, box } of boxes) {
          if (apart(box, near)) continue;
          assert.equal(
            opening.kind,
            "window",
            `${name} blocks a ${opening.kind}`,
          );
          assert.ok(
            box.y1 < HOUSE.floorY + opening.v0 - 0.02,
            `${name} under the ${wall.id} sill`,
          );
        }
      }
  });

  it("leaves 0.6 m walkways: from the door past the setup, and behind the sofa", () => {
    assert.ok(
      LIVING_ZONE.x0 - SETUP_ZONE.x1 >= 0.6 - EPS,
      "corridor from the door",
    );
    assert.ok(LIVING_ZONE.x0 >= DOOR_SWING.x1, "door opens onto the corridor");
    const sofa = LIVING_MODELS.find((model) => model.kind === "sofa");
    assert.ok(sofa);
    assert.ok(
      MAIN_ROOM.z1 - modelBounds(sofa).z1 >= 0.6 - EPS,
      "behind the sofa",
    );
    for (const [i, a] of floorItems.entries())
      for (const b of floorItems.slice(i + 1))
        assert.ok(
          apart(modelBounds(a), modelBounds(b)),
          `${a.kind} overlaps ${b.kind}`,
        );
  });

  it("points the TV at the sofa and the sofa at the TV", () => {
    const [dx, , dz] = [0, 1, 2].map(
      (k) => LIVING.sofa.center[k] - LIVING.tv.center[k],
    );
    const length = Math.hypot(dx, dz);
    const toSofa = [dx / length, dz / length];
    assert.ok(
      toSofa[0] * LIVING.tv.facing[0] + toSofa[1] * LIVING.tv.facing[2] > 0.95,
    );
    assert.ok(
      -toSofa[0] * LIVING.sofa.facing[0] - toSofa[1] * LIVING.sofa.facing[2] >
        0.95,
    );
    assert.ok(length >= 1.5, "comfortable viewing distance");
  });

  it("glows brighter at night than by day", () => {
    assert.ok(livingGlow(0) > livingGlow(12));
  });

  it("stays within a small budget: few parts, one draw per material", () => {
    assert.ok(parts.length < 400, `${parts.length} parts`);
    const draws =
      new Set(meshes.solid.map((p) => p.material)).size +
      1 +
      LIVING_MODELS.length;
    assert.ok(draws <= 14, `${draws} draws`);
  });

  it("credits every new model to its pack and the procedural pieces as original", () => {
    const credits: Credits = JSON.parse(
      readFileSync(new URL("credits.json", PUBLIC), "utf8"),
    );
    for (const url of Object.values(LIVING_FILES)) {
      assert.ok(
        Object.values(PROP_FILES).includes(url),
        `${url} loaded as a prop`,
      );
      const entry = credits.assets.find(
        (item) => `/world/${item.file}` === url,
      );
      assert.ok(entry, `${url} credited`);
      assert.equal(entry.pack, "kaykit-furniture-bits");
      assert.equal(entry.author, "Kay Lousberg");
    }
    const original = (credits.original ?? []).find(
      (item) => item.id === "living",
    );
    assert.ok(original, "living credited as original work");
    assert.equal(original.source, "src/lib/world/living.ts");
  });
});
