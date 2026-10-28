import assert from "node:assert/strict";
import { it } from "node:test";
import {
  fernFootprint,
  fernHeight,
} from "../../src/lib/room/forest-understory.ts";
import {
  BEDS,
  EDGING,
  GARDEN_LEVELS,
  GRAVEL,
  gardenBudget,
  gardenFerns,
  gardenStones,
  lampGlow,
  MAILBOX,
  PATH_LIGHTS,
  polygonDistance,
  STONE_BEVEL,
} from "../../src/lib/room/garden-layout.ts";
import {
  type Box,
  BUSHES,
  LEVELS,
  PARTS,
  PLOT,
} from "../../src/lib/room/house-layout.ts";

const part = (id: string) => {
  const found = PARTS.find((p) => p.id === id);
  assert.ok(found, id);
  return found;
};
const WALK = part("walk");
const PORCH = part("porch");
const DRIVEWAY = part("driveway");
/** Everything a solid garden footprint must stay off: walk, porch, driveway,
 * hedges and the house (foundation, walls, door, canopy, carport, patio). */
const SOLIDS = PARTS;

/** Distance from a ground point to a box footprint (0 inside). */
const boxDistance = (x: number, z: number, b: Box) =>
  Math.hypot(
    Math.max(b.min[0] - x, 0, x - b.max[0]),
    Math.max(b.min[2] - z, 0, z - b.max[2]),
  );
const boxesOverlap = (a: Box, b: Box) =>
  a.min[0] < b.max[0] &&
  b.min[0] < a.max[0] &&
  a.min[2] < b.max[2] &&
  b.min[2] < a.max[2];
const insideXZ = (x: number, z: number, b: Box, margin = 0) =>
  x >= b.min[0] + margin &&
  x <= b.max[0] - margin &&
  z >= b.min[2] + margin &&
  z <= b.max[2] - margin;
/** A circle footprint is clear of every house part, hedge and bush. */
function circleClear(x: number, z: number, radius: number) {
  for (const solid of SOLIDS)
    assert.ok(
      boxDistance(x, z, solid) > radius,
      `(${x.toFixed(2)}, ${z.toFixed(2)}) r${radius.toFixed(2)} hits ${solid.id}`,
    );
  for (const bush of BUSHES)
    assert.ok(
      Math.hypot(bush.x - x, bush.z - z) > bush.radius + radius,
      `(${x.toFixed(2)}, ${z.toFixed(2)}) hits a bush`,
    );
  assert.ok(insideXZ(x, z, PLOT, radius), "outside the plot");
}

it("lays irregular stepping stones inside the walk, non-overlapping and connected", () => {
  const stones = gardenStones();
  assert.ok(stones.length >= 6, `only ${stones.length} stones`);
  assert.deepEqual(gardenStones(), stones, "seeded: identical on every call");
  const bevel = STONE_BEVEL.size;
  const sides = new Set<number>();
  for (const stone of stones) {
    assert.ok(stone.points.length >= 6, "irregular polygon, not a box");
    sides.add(stone.points.length);
    for (const [x, z] of stone.points)
      assert.ok(insideXZ(x, z, WALK, bevel + 0.01), "stone leaves the walk");
  }
  assert.ok(sides.size > 1, "stones share one outline");
  const zs = (s: (typeof stones)[number]) => s.points.map(([, z]) => z);
  const first = Math.min(...zs(stones[0]));
  const last = Math.max(...zs(stones.at(-1) as (typeof stones)[number]));
  // Porch to the first stone and the last stone to the street are one step.
  assert.ok(first - bevel - PORCH.max[2] <= 0.25, "gap from the porch");
  assert.ok(WALK.max[2] - (last + bevel) <= 0.25, "gap to the street");
  for (let i = 0; i < stones.length; i++)
    for (let j = i + 1; j < stones.length; j++) {
      const gap =
        polygonDistance(stones[i].points, stones[j].points) - 2 * bevel;
      assert.ok(gap > 0.02, `stones ${i} and ${j} overlap (${gap})`);
      if (j === i + 1) assert.ok(gap <= 0.25, `stride gap ${i}: ${gap}`);
    }
  assert.ok(GARDEN_LEVELS.stoneTop > GARDEN_LEVELS.gravelTop);
  assert.ok(GARDEN_LEVELS.gravelTop > LEVELS.pavingTop);
  assert.ok(GARDEN_LEVELS.stoneTop <= 0, "stones stay below the room floor");
});

it("keeps the gravel over the walk only", () => {
  assert.ok(insideXZ(GRAVEL.min[0], GRAVEL.min[2], WALK));
  assert.ok(insideXZ(GRAVEL.max[0], GRAVEL.max[2], WALK));
  assert.equal(GRAVEL.max[1], GARDEN_LEVELS.gravelTop);
});

it("plants beds and edging beside the walk, clear of every house part", () => {
  assert.equal(BEDS.length, 2);
  for (const bed of [...BEDS, ...EDGING]) {
    for (const solid of SOLIDS)
      assert.ok(!boxesOverlap(bed, solid), `bed/edging overlaps ${solid.id}`);
    for (const bush of BUSHES)
      assert.ok(boxDistance(bush.x, bush.z, bed) > bush.radius, "bush");
    assert.ok(insideXZ(bed.min[0], bed.min[2], PLOT));
    assert.ok(insideXZ(bed.max[0], bed.max[2], PLOT));
    assert.ok(bed.max[1] <= 0, "low: never above the room floor");
  }
  for (const strip of EDGING)
    assert.ok(
      BEDS.some(
        (bed) =>
          insideXZ(strip.min[0], strip.min[2], bed) &&
          insideXZ(strip.max[0], strip.max[2], bed),
      ),
      "edging runs on a bed rim",
    );
  assert.ok(
    BEDS.some((bed) => bed.max[0] < WALK.min[0]),
    "a west bed",
  );
  assert.ok(
    BEDS.some((bed) => bed.min[0] > WALK.max[0]),
    "an east bed",
  );
});

it("plants seeded asymmetric fern clumps no taller than 0.7 m, clear of solids", () => {
  const ferns = gardenFerns();
  assert.deepEqual(gardenFerns(), ferns);
  const [west, east] = [
    ferns.filter((f) => f.x < WALK.min[0]),
    ferns.filter((f) => f.x > WALK.max[0]),
  ];
  assert.equal(west.length + east.length, ferns.length);
  assert.ok(west.length >= 6 && east.length >= 6, "both beds planted");
  assert.notEqual(west.length, east.length, "asymmetric beds");
  for (const fern of ferns) {
    const reach = fernFootprint(fern);
    assert.ok(fernHeight(fern) <= 0.7, `height ${fernHeight(fern)}`);
    assert.ok(
      BEDS.some((bed) => insideXZ(fern.x, fern.z, bed)),
      "in a bed",
    );
    circleClear(fern.x, fern.z, reach);
    assert.ok(boxDistance(fern.x, fern.z, MAILBOX.footprint) > reach);
    for (const light of PATH_LIGHTS)
      assert.ok(Math.hypot(light.x - fern.x, light.z - fern.z) > reach);
    assert.equal(fern.y, GARDEN_LEVELS.soilTop, "rooted in the bed soil");
  }
});

it("stands an original mailbox beside the walk, facing it", () => {
  const { footprint, x, z, height } = MAILBOX;
  assert.ok(insideXZ(x, z, footprint));
  for (const solid of SOLIDS)
    assert.ok(!boxesOverlap(footprint, solid), `mailbox hits ${solid.id}`);
  assert.ok(footprint.min[0] > WALK.max[0], "east of the walk");
  assert.ok(footprint.min[0] - WALK.max[0] < 0.3, "within reach of the walk");
  assert.ok(height > 0.9 && height < 1.4);
  assert.ok(insideXZ(footprint.min[0], footprint.min[2], PLOT));
  assert.equal(MAILBOX.facing, -1, "door toward the walk (-x)");
});

it("lines the walk with alternating bollards just outside its edges", () => {
  assert.ok(PATH_LIGHTS.length >= 3 && PATH_LIGHTS.length <= 4);
  PATH_LIGHTS.forEach((light, i) => {
    circleClear(light.x, light.z, light.radius);
    const side = light.x < WALK.min[0] ? -1 : 1;
    const edge = side < 0 ? WALK.min[0] - light.x : light.x - WALK.max[0];
    assert.ok(edge > light.radius && edge < 0.2, `light ${i} off the edge`);
    if (i > 0) {
      const previous = PATH_LIGHTS[i - 1];
      assert.notEqual(Math.sign(previous.x - 5.8), side, "alternating sides");
      assert.ok(light.z > previous.z);
    }
    assert.ok(boxDistance(light.x, light.z, MAILBOX.footprint) > light.radius);
    assert.ok(light.height < 0.6, "low bollard");
  });
  assert.ok(
    PATH_LIGHTS.every((light) => boxDistance(light.x, light.z, DRIVEWAY) > 1),
  );
});

it("glows the path lights from the hour: off by day, on at night, rising at dusk", () => {
  assert.ok(lampGlow(13) < 0.02, `day ${lampGlow(13)}`);
  assert.ok(lampGlow(11) < 0.02);
  assert.equal(lampGlow(23), 1);
  assert.equal(lampGlow(2), 1);
  let previous = lampGlow(15);
  for (let h = 15; h <= 21; h += 0.1) {
    const glow = lampGlow(h);
    assert.ok(glow >= previous - 1e-12, `not monotonic at ${h}`);
    assert.ok(glow >= 0 && glow <= 1);
    previous = glow;
  }
  assert.ok(lampGlow(18) > 0.2 && lampGlow(18) < 1, `dusk ${lampGlow(18)}`);
  assert.equal(lampGlow(Number.NaN), lampGlow(13), "non-finite: day preset");
  assert.equal(lampGlow(-1), lampGlow(23));
});

it("keeps the garden within its triangle budget and reports draw calls", () => {
  const budget = gardenBudget();
  assert.ok(budget.triangles > 0 && budget.triangles <= 150_000);
  assert.equal(budget.instances.ferns, gardenFerns().length);
  assert.equal(budget.instances.lights, PATH_LIGHTS.length);
  assert.ok(budget.draws > 0 && budget.draws <= 14, `${budget.draws} draws`);
  process.stdout.write(
    `# garden: ${budget.triangles} triangles, ${budget.draws} draw calls, ` +
      `${budget.instances.ferns} ferns, ${budget.instances.stones} stones, ` +
      `${budget.instances.lights} lights\n`,
  );
});
