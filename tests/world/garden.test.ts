import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type Credits,
  creditProblems,
  ORIGINAL_LICENSE,
  type OriginalCredit,
} from "../../src/lib/world/credits.ts";
import { flowerLayout } from "../../src/lib/world/flowers.ts";
import {
  clearOfGarden,
  GARDEN_FOOTPRINTS,
  GARDEN_PROPS,
  gardenParts,
  groundY,
  LANTERN_FIXTURES,
  LANTERN_IDS,
  LANTERN_MOUNTS,
  lanternGlass,
  lanternLevel,
  lanternParts,
  mailboxParts,
  PATH_STONES,
  pathMesh,
  STONE,
  signParts,
  stoneOutline,
} from "../../src/lib/world/garden.ts";
import {
  HOUSE,
  HOUSE_FOOTPRINT,
  houseMeshes,
  WALLS,
} from "../../src/lib/world/house.ts";
import { insideIsland, onPad, PAD } from "../../src/lib/world/island.ts";
import { islandLayout, KIND_SPECS } from "../../src/lib/world/layout.ts";
import { nightLightsOn } from "../../src/lib/world/lights.ts";
import { partBounds } from "../../src/lib/world/setup.ts";

type Bounds = ReturnType<typeof partBounds>;

const EPS = 1e-6;
const at = (h: number, m: number) => h + m / 60;
const inRect = (
  x: number,
  z: number,
  r: { x0: number; x1: number; z0: number; z1: number },
  margin = 0,
) =>
  x >= r.x0 - margin &&
  x <= r.x1 + margin &&
  z >= r.z0 - margin &&
  z <= r.z1 + margin;

describe("entrance lanterns (night gate reused from S17)", () => {
  it("switch at exactly 18:00 and 06:00 like the night lights", () => {
    assert.equal(lanternLevel(at(17, 59)), 0, "17:59 off");
    assert.equal(lanternLevel(at(18, 0)), 1, "18:00 on");
    assert.equal(lanternLevel(at(5, 59)), 1, "05:59 on");
    assert.equal(lanternLevel(at(6, 0)), 0, "06:00 off");
    assert.equal(lanternLevel(12), 0, "noon off");
    assert.equal(lanternLevel(0), 1, "midnight on");
  });

  it("follow nightLightsOn for every minute of the day, with no settings", () => {
    for (let minute = 0; minute < 24 * 60; minute++) {
      const hours = minute / 60;
      assert.equal(lanternLevel(hours), nightLightsOn(hours) ? 1 : 0);
    }
    assert.equal(lanternLevel.length, 1, "takes only the hour");
  });

  it("are four finite, non-shadow lights, twice the first brightness", () => {
    assert.deepEqual(
      [...LANTERN_IDS],
      ["lanternLeft", "lanternRight", "lanternGarage", "lanternBack"],
    );
    for (const id of LANTERN_IDS) {
      const fixture = LANTERN_FIXTURES[id];
      assert.equal(fixture.castShadow, false);
      assert.equal(fixture.decay, 2);
      assert.ok(fixture.distance > 0 && fixture.distance <= 3.2);
      // T7 shipped 0.85 cd; the follow-up doubles it.
      assert.equal(fixture.intensity, 1.7);
      assert.ok(fixture.angle > 0 && fixture.angle < Math.PI / 2);
    }
  });

  it("go dark at night when the master power is off", () => {
    assert.equal(lanternLevel(at(22, 0), false), 0);
    assert.equal(lanternLevel(at(22, 0), true), 1);
    assert.equal(lanternLevel(at(12, 0), true), 0, "never by day");
  });

  it("hang on their own walls: two at the door, one at the garage, one at the back", () => {
    assert.deepEqual(
      LANTERN_IDS.map((id) => LANTERN_MOUNTS[id].wall),
      ["main-front", "main-front", "garage-front", "main-back"],
    );
  });

  it("flank the front door on the front wall, symmetric", () => {
    const front = WALLS.find((wall) => wall.id === "main-front");
    assert.ok(front);
    const door = front.openings.find((o) => o.kind === "door");
    assert.ok(door);
    const doorMid = (door.u0 + door.u1) / 2;
    const left = LANTERN_FIXTURES.lanternLeft;
    const right = LANTERN_FIXTURES.lanternRight;
    assert.ok(left.position[0] < door.u0 - 0.07, "left of the door frame");
    assert.ok(right.position[0] > door.u1 + 0.07, "right of the door frame");
    assert.ok(
      Math.abs(doorMid - left.position[0] - (right.position[0] - doorMid)) <
        0.05,
      "symmetric about the door",
    );
  });

  it("sit on their wall or post face, clear of trim, aimed outward", () => {
    for (const id of LANTERN_IDS) {
      const mount = LANTERN_MOUNTS[id];
      const wall = WALLS.find((w) => w.id === mount.wall);
      assert.ok(wall && wall.axis === "x");
      // The plank face, plus a corner post's protrusion when mounted on one.
      const face = wall.at + wall.side * (HOUSE.wall / 2 + mount.out);
      const parts = lanternParts(id);
      const xs = parts.flatMap((p) => [
        p.center[0] - p.size[0] / 2,
        p.center[0] + p.size[0] / 2,
      ]);
      const outs = parts.map(
        (p) => wall.side * (p.center[2] - face) - p.size[2] / 2,
      );
      // Mounted: the backplate touches its face, nothing sinks in.
      assert.ok(Math.min(...outs) >= -EPS, `${id} inside its mount`);
      assert.ok(Math.min(...outs) <= 0.02, `${id} floats off its mount`);
      for (const opening of wall.openings)
        assert.ok(
          Math.max(...xs) < opening.u0 - 0.07 ||
            Math.min(...xs) > opening.u1 + 0.07,
          `${id} overlaps a ${opening.kind} frame`,
        );
      // Light aims out of its wall and down, never into the house.
      const fixture = LANTERN_FIXTURES[id];
      assert.ok(wall.side * (fixture.target[2] - fixture.position[2]) > 0.5);
      if (!mount.aim)
        assert.equal(fixture.target[0], fixture.position[0], "square out");
      assert.ok(fixture.target[1] < fixture.position[1]);
      assert.ok(wall.side * (fixture.position[2] - face) > 0.1 * mount.scale);
      // The bulb is inside its glass.
      const glass = lanternGlass(id);
      for (const k of [0, 1, 2])
        assert.ok(
          Math.abs(fixture.position[k] - glass.center[k]) < glass.size[k] / 2,
          `${id} bulb outside its glass`,
        );
    }
  });

  it("never intersect the real house parts: posts, trim, planks, roofs", () => {
    // Every part's axis-aligned bounds (rotation included, so the sloped
    // roof slabs and eave boards are conservative) against every lantern
    // part's bounds. The plank faces only touch, so they keep 1 mm slack.
    const house = Object.values(houseMeshes()).flatMap((m) => [
      ...m.wood,
      ...m.glass,
    ]);
    const boxes = house.map(partBounds);
    const gap = (a: Bounds, b: Bounds) =>
      Math.max(
        a.x0 - b.x1,
        b.x0 - a.x1,
        a.y0 - b.y1,
        b.y0 - a.y1,
        a.z0 - b.z1,
        b.z0 - a.z1,
      );
    for (const id of LANTERN_IDS) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const part of lanternParts(id)) {
        const own = partBounds(part);
        for (const box of boxes) nearest = Math.min(nearest, gap(own, box));
      }
      assert.ok(nearest >= -0.001, `${id} intersects the house by ${-nearest}`);
    }
  });

  it("light the garage driveway and the back of the house", () => {
    const garage = LANTERN_FIXTURES.lanternGarage;
    const { driveway } = HOUSE;
    assert.ok(garage.target[0] > driveway.x0 && garage.target[0] < driveway.x1);
    assert.ok(garage.target[2] > driveway.z0 && garage.target[2] < driveway.z1);
    // Mounted on the garage's outer front corner post, its cutaway group.
    assert.equal(LANTERN_MOUNTS.lanternGarage.wall, "garage-front");
    assert.equal(
      garage.position[0],
      HOUSE.garage.x0 + HOUSE.wall / 2,
      "on the corner post's axis",
    );
    const back = LANTERN_FIXTURES.lanternBack;
    assert.ok(back.target[2] < HOUSE.main.z0 - 1);
  });

  it("share one detailed body, only moved and scaled onto each mount", () => {
    const shape = (id: (typeof LANTERN_IDS)[number]) =>
      lanternParts(id).map((p) =>
        [
          p.role,
          p.shape,
          p.size.map((v) => (v / LANTERN_MOUNTS[id].scale).toFixed(6)).join(),
        ].join(),
      );
    for (const id of LANTERN_IDS)
      assert.deepEqual(shape(id), shape("lanternLeft"), id);
  });

  it("are detailed: rounded frame, hood, glass and a bulb", () => {
    const parts = lanternParts("lanternLeft");
    assert.ok(parts.length >= 12, `${parts.length} parts`);
    assert.ok(parts.some((p) => p.shape === "rounded"));
    assert.ok(parts.some((p) => p.shape === "round"));
    assert.ok(
      parts.every((p) => p.shape !== "box"),
      "no hard boxes",
    );
  });
});

describe("entrance stepping path", () => {
  const porch = HOUSE.porch;

  it("has 5-7 irregular stones from the porch step into the front garden", () => {
    assert.ok(PATH_STONES.length >= 5 && PATH_STONES.length <= 7);
    const first = PATH_STONES[0];
    assert.ok(first.center[0] > porch.x0 && first.center[0] < porch.x1);
    const firstNear = Math.min(...stoneOutline(first).map(([, z]) => z));
    assert.ok(firstNear - porch.z1 > 0.02, "clear of the porch step");
    assert.ok(firstNear - porch.z1 < 0.2, "starts at the porch step");
    const last = PATH_STONES[PATH_STONES.length - 1];
    assert.ok(last.center[1] - porch.z1 > 2, "reaches into the garden");
    const shapes = new Set(PATH_STONES.map((s) => s.size.join()));
    assert.ok(shapes.size >= 4, "stones vary in size");
  });

  it("spaces the stones as steps, never overlapping", () => {
    for (let i = 1; i < PATH_STONES.length; i++) {
      const a = PATH_STONES[i - 1];
      const b = PATH_STONES[i];
      const gap =
        Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) -
        Math.max(...a.size) -
        Math.max(...b.size) -
        2 * STONE.bevel;
      assert.ok(gap > 0.02 && gap < 0.4, `gap ${i}: ${gap}`);
    }
  });

  it("sits each stone wholly on the pad or wholly on the grass, at that height", () => {
    for (const stone of PATH_STONES) {
      const outline = stoneOutline(stone);
      assert.ok(outline.length >= 8, "irregular outline");
      const onThePad = outline.map(([x, z]) => onPad(x, z, STONE.bevel));
      const offThePad = outline.map(([x, z]) => !onPad(x, z, STONE.bevel));
      assert.ok(
        onThePad.every(Boolean) || offThePad.every(Boolean),
        `stone at ${stone.center} straddles the pad edge`,
      );
      const ground = groundY(...stone.center);
      assert.equal(ground, onThePad[0] ? PAD.height : 0);
      for (const [x, z] of outline) {
        assert.ok(insideIsland(x, z, 0.4));
        assert.ok(!inRect(x, z, porch, STONE.bevel), "stone on the porch");
        for (const rect of HOUSE_FOOTPRINT.filter((r) => r.id !== "porch"))
          assert.ok(!inRect(x, z, rect), `stone under ${rect.id}`);
      }
      // Seated: slightly sunk, top a few centimetres above the ground.
      assert.ok(stone.y < ground && stone.y > ground - 0.02);
      assert.ok(stone.y + STONE.height > ground + 0.025);
    }
  });

  it("builds beveled, outward-facing stones within their footprint", () => {
    const mesh = pathMesh();
    const count = mesh.positions.length / 3;
    assert.equal(mesh.stone.length, count);
    assert.equal(mesh.indices.length % 3, 0);
    for (const index of mesh.indices) assert.ok(index < count);
    const p = (i: number) => mesh.positions.slice(i * 3, i * 3 + 3);
    for (let i = 0; i < count; i++) {
      const stone = PATH_STONES[mesh.stone[i]];
      const [x, y, z] = p(i);
      assert.ok(y >= stone.y - EPS && y <= stone.y + STONE.height + EPS);
      const reach = Math.hypot(x - stone.center[0], z - stone.center[1]);
      assert.ok(reach <= Math.max(...stone.size) + STONE.bevel + EPS);
    }
    // Every face points away from its stone's vertical axis or up.
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => p(mesh.indices[t + k]));
      const u = [0, 1, 2].map((k) => b[k] - a[k]);
      const v = [0, 1, 2].map((k) => c[k] - a[k]);
      const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const stone = PATH_STONES[mesh.stone[mesh.indices[t]]];
      const mid = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
      const out =
        n[0] * (mid[0] - stone.center[0]) + n[2] * (mid[2] - stone.center[1]);
      assert.ok(out > 0 || n[1] > 0, `face ${t / 3} faces inward`);
    }
  });
});

describe("garden props", () => {
  it("has a decorative mailbox with post, rounded hood, slot, flag and support", () => {
    const parts = mailboxParts();
    for (const role of ["post", "hood", "slot", "flag", "support"])
      assert.ok(
        parts.some((p) => p.role === role),
        `mailbox ${role}`,
      );
    assert.ok(
      parts.every((p) => p.shape !== "box"),
      "no hard boxes",
    );
    const post = parts.find((p) => p.role === "post");
    assert.ok(post && post.center[1] - post.size[1] / 2 < 0, "post planted");
  });

  it("stands the mailbox and sign square to the front facade, untilted", () => {
    // The front wall faces +z: both props face it straight, so the sign
    // reads level from the path instead of angled toward one camera.
    for (const prop of Object.values(GARDEN_PROPS))
      assert.equal(prop.rotationY, 0);
    for (const part of [...mailboxParts(), ...signParts()]) {
      const [x = 0, y = 0, z = 0] = part.rotation ?? [];
      // Only quarter turns that lay cylinders along an axis, and the
      // mailbox's two braces; nothing leans the post, board or text.
      if (part.role === "support" && x !== 0) continue;
      for (const angle of [x, y, z])
        assert.ok(
          Math.abs(Math.sin(2 * angle)) < EPS,
          `${part.role} tilted by ${angle}`,
        );
    }
  });

  it("has a framed sign on two planted posts", () => {
    const parts = signParts();
    assert.equal(parts.filter((p) => p.role === "post").length, 2);
    for (const post of parts.filter((p) => p.role === "post"))
      assert.ok(post.center[1] - post.size[1] / 2 < 0, "post planted");
    assert.ok(parts.some((p) => p.role === "board"));
    assert.ok(parts.filter((p) => p.role === "frame").length >= 4);
  });

  it("keeps props on the grass near the path, clear of each other and the house", () => {
    const { mailbox, sign } = GARDEN_PROPS;
    for (const prop of [mailbox, sign]) {
      const [x, z] = prop.position;
      assert.ok(!onPad(x, z, prop.radius), "props stand on the grass");
      assert.ok(insideIsland(x, z, 0.6));
      for (const rect of HOUSE_FOOTPRINT)
        assert.ok(!inRect(x, z, rect, prop.radius), `prop in ${rect.id}`);
      const nearest = Math.min(
        ...PATH_STONES.map((s) => Math.hypot(x - s.center[0], z - s.center[1])),
      );
      assert.ok(nearest < 1.1, "beside the path");
      for (const stone of PATH_STONES)
        assert.ok(
          Math.hypot(x - stone.center[0], z - stone.center[1]) >
            prop.radius + Math.max(...stone.size) + STONE.bevel + 0.05,
          "prop on a stone",
        );
    }
    assert.ok(
      Math.hypot(
        mailbox.position[0] - sign.position[0],
        mailbox.position[1] - sign.position[1],
      ) >
        mailbox.radius + sign.radius + 0.2,
    );
  });

  it("clears only the nature and flowers that conflict with the entrance", () => {
    const layout = islandLayout();
    const kept = clearOfGarden(layout);
    const removed = layout.filter((item) => !kept.includes(item));
    assert.ok(removed.length > 0 && removed.length <= 8, `${removed.length}`);
    const conflicts = (x: number, z: number, r: number) =>
      GARDEN_FOOTPRINTS.some(
        (f) => Math.hypot(x - f.x, z - f.z) < f.radius + r + 0.05,
      );
    for (const item of removed)
      assert.ok(
        conflicts(
          item.position[0],
          item.position[2],
          KIND_SPECS[item.kind].radius * item.scale * 0.6,
        ),
        `${item.kind} removed without a conflict`,
      );
    for (const item of kept)
      assert.ok(
        !conflicts(
          item.position[0],
          item.position[2],
          KIND_SPECS[item.kind].radius * item.scale * 0.6,
        ),
        `${item.kind} at ${item.position} conflicts`,
      );
    const flowers = flowerLayout(kept);
    const keptFlowers = clearOfGarden(flowers, 0.06);
    for (const flower of keptFlowers)
      assert.ok(!conflicts(flower.position[0], flower.position[2], 0.06));
    assert.ok(keptFlowers.length >= flowers.length - 8);
  });

  it("is credited as original procedural work, with no download", () => {
    const credits = JSON.parse(
      readFileSync(
        new URL("../../public/world/credits.json", import.meta.url),
        "utf8",
      ),
    ) as Credits;
    const entry = credits.original?.find((item) => item.id === "garden");
    assert.ok(entry);
    assert.equal(entry.license, ORIGINAL_LICENSE);
    assert.equal(entry.source, "src/lib/world/garden.ts");
    assert.deepEqual(creditProblems(credits), []);
  });

  it("keeps the garden credit when scripts/prepare-world.py regenerates it", () => {
    // Reads ORIGINAL statically (ast.literal_eval): no import, no downloads.
    const script = fileURLToPath(
      new URL("../../scripts/prepare-world.py", import.meta.url),
    );
    const read = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import ast, json, sys",
          "tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())",
          "node = next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, 'id', None) == 'ORIGINAL' for t in n.targets))",
          "print(json.dumps(ast.literal_eval(node)))",
        ].join("\n"),
        script,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(read.status, 0, read.stderr);
    const generated = JSON.parse(read.stdout) as OriginalCredit[];
    const shipped = JSON.parse(
      readFileSync(
        new URL("../../public/world/credits.json", import.meta.url),
        "utf8",
      ),
    ) as Credits;
    assert.deepEqual(
      generated.find((item) => item.id === "garden"),
      shipped.original?.find((item) => item.id === "garden"),
    );
  });

  it("merges every part into a few materials", () => {
    const parts = gardenParts();
    const materials = new Set(parts.map((p) => p.material));
    assert.ok(materials.size <= 6, [...materials].join());
  });
});
