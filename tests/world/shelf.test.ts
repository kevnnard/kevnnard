import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type Credits,
  creditProblems,
  ORIGINAL_LICENSE,
  type OriginalCredit,
} from "../../src/lib/world/credits.ts";
import { HOUSE, WALLS } from "../../src/lib/world/house.ts";
import {
  LIVING_MODELS,
  livingMeshes,
  modelBounds,
} from "../../src/lib/world/living.ts";
import {
  DOOR_SWING,
  MAIN_ROOM,
  partBounds,
  SETUP_ZONE,
  setupMeshes,
} from "../../src/lib/world/setup.ts";
import {
  BALL_SKIN,
  FOOTBALL,
  footballProfile,
  LABEL_ATLAS,
  SHELF,
  SHELF_ITEMS,
  SHELF_LABELS,
  SHELF_MATERIALS,
  shelfBudget,
  shelfParts,
  shelfWorldBounds,
} from "../../src/lib/world/shelf.ts";
import { PUBLIC } from "./glb.ts";

// S22: a white two-column display shelf left of the setup: the Nike football
// on top, photography and video, computer hardware with a keyboard, books.

const EPS = 1e-6;
type Box = ReturnType<typeof partBounds>;
const union = (boxes: Box[]): Box => ({
  x0: Math.min(...boxes.map((b) => b.x0)),
  x1: Math.max(...boxes.map((b) => b.x1)),
  y0: Math.min(...boxes.map((b) => b.y0)),
  y1: Math.max(...boxes.map((b) => b.y1)),
  z0: Math.min(...boxes.map((b) => b.z0)),
  z1: Math.max(...boxes.map((b) => b.z1)),
});
const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x0 < b.x1 + gap &&
  a.x1 > b.x0 - gap &&
  a.y0 < b.y1 + gap &&
  a.y1 > b.y0 - gap &&
  a.z0 < b.z1 + gap &&
  a.z1 > b.z0 - gap;

const parts = shelfParts();
const world = union(parts.map(shelfWorldBounds));
const local = (filter: (p: (typeof parts)[number]) => boolean) =>
  union(parts.filter(filter).map(partBounds));

describe("personal collection shelf: placement (T10, S22)", () => {
  it("stands left of the setup at the confirmed base, turned to face the room", () => {
    assert.deepEqual(SHELF.base, [-0.89, HOUSE.floorY + 0.04, 0.45]);
    assert.equal(SHELF.yaw, Math.PI / 2);
    assert.deepEqual(
      [SHELF.width, SHELF.depth, SHELF.height],
      [1.2, 0.32, 1.45],
    );
  });

  it("fits its footprint x -1.05..-0.73, z -0.15..1.05, top at most 1.72 m", () => {
    assert.ok(
      world.x0 >= -1.05 - EPS && world.x1 <= -0.73 + EPS,
      `x ${world.x0}..${world.x1}`,
    );
    assert.ok(
      world.z0 >= -0.15 - EPS && world.z1 <= 1.05 + EPS,
      `z ${world.z0}..${world.z1}`,
    );
    assert.ok(world.y0 >= SHELF.base[1] - EPS, "on the floor boards");
    assert.ok(world.y1 <= HOUSE.floorY + 1.72 + EPS, `top ${world.y1}`);
    assert.ok(world.y1 < HOUSE.floorY + HOUSE.main.height, "under the eave");
    const body = local((p) => p.item === "carcass");
    assert.ok(Math.abs(body.y1 - body.y0 - SHELF.height) < 1e-3);
    assert.ok(Math.abs(body.x1 - body.x0 - SHELF.width) < 1e-3);
    assert.ok(Math.abs(body.z1 - body.z0 - SHELF.depth) < 1e-3);
  });

  it("clears the left wall, the setup, the front wall, the door and the windows", () => {
    assert.ok(world.x0 - MAIN_ROOM.x0 >= 0.06 - EPS, "backing gap");
    assert.ok(world.z0 - SETUP_ZONE.z1 >= 0.15 - EPS, "setup gap");
    assert.ok(MAIN_ROOM.z1 - world.z1 >= 0.3, "front gap");
    assert.ok(DOOR_SWING.x0 - world.x1 >= 0.85, "door lateral gap");
    const setup = setupMeshes();
    for (const p of [
      ...setup.solid,
      ...setup.glow,
      ...setup.glass,
      ...setup.hull,
    ])
      assert.ok(
        !overlaps(world, partBounds(p), 0.1),
        "clear of the setup and chair",
      );
    for (const p of Object.values(livingMeshes()).flat())
      assert.ok(
        !overlaps(world, partBounds(p), 0.1),
        "clear of the living area",
      );
    for (const model of LIVING_MODELS) {
      const b = modelBounds(model);
      assert.ok(
        world.x1 < b.x0 || world.z1 < b.z0 || world.z0 > b.z1,
        model.kind,
      );
    }
    // No window behind or within 0.3 m in front of it.
    for (const wall of WALLS)
      for (const o of wall.openings.filter((item) => item.kind === "window")) {
        const inner = wall.at - (wall.side * HOUSE.wall) / 2;
        const lateral =
          wall.axis === "x"
            ? world.x1 > o.u0 && world.x0 < o.u1
            : world.z1 > o.u0 && world.z0 < o.u1;
        if (!lateral) continue;
        const gap =
          wall.axis === "x"
            ? Math.min(Math.abs(inner - world.z0), Math.abs(inner - world.z1))
            : Math.min(Math.abs(inner - world.x0), Math.abs(inner - world.x1));
        assert.ok(gap >= 0.3, `${wall.id} window ${gap}`);
      }
    assert.equal(WALLS.find((w) => w.id === "main-left")?.openings.length, 0);
  });
});

describe("personal collection shelf: carcass and contents", () => {
  it("builds a white satin two-column carcass from rounded boards, with wood detail", () => {
    const carcass = parts.filter((p) => p.item === "carcass");
    assert.ok(
      carcass.every((p) => p.shape === "rounded"),
      "no hard cubes",
    );
    const roles = new Set(carcass.map((p) => p.role));
    for (const role of ["side", "divider", "shelf", "top", "back", "plinth"])
      assert.ok(roles.has(role), role);
    assert.ok(carcass.filter((p) => p.role === "divider").length >= 1);
    assert.ok(carcass.filter((p) => p.role === "shelf").length >= 3);
    const paint = carcass.filter((p) => p.material === "paint");
    assert.ok(paint.length >= 8);
    assert.ok(
      SHELF_MATERIALS.paint.roughness >= 0.3 &&
        SHELF_MATERIALS.paint.roughness <= 0.6,
    );
    assert.equal(SHELF_MATERIALS.wood.surface, "planks");
    assert.ok(parts.some((p) => p.material === "wood"));
  });

  it("has every requested piece of the collection", () => {
    for (const item of [
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
    ] as const) {
      assert.ok(SHELF_ITEMS.includes(item), item);
      assert.ok(
        parts.some((p) => p.item === item),
        `${item} built`,
      );
    }
    const books = new Set(
      parts.filter((p) => p.item === "book").map((p) => p.group),
    );
    assert.ok(books.size >= 5, `${books.size} books`);
  });

  it("puts the football on top, cameras above the hardware, keyboard and books below", () => {
    const top = local((p) => p.item === "carcass" && p.role === "top").y1;
    const y = (item: (typeof SHELF_ITEMS)[number]) =>
      local((p) => p.item === item).y0;
    assert.ok(
      local((p) => p.item === "football").y0 > top - EPS,
      "football on top",
    );
    for (const camera of [
      "polaroid-camera",
      "zenit-camera",
      "samsung-camera",
    ] as const)
      assert.ok(y(camera) > y("psu-box"), camera);
    assert.ok(y("psu-box") > y("keyboard"));
    assert.ok(y("ryzen-box") > y("book"));
  });

  it("seats every item on a board and keeps it inside its compartment", () => {
    const boards = parts.filter(
      (p) =>
        p.item === "carcass" && ["shelf", "top", "bottom"].includes(p.role),
    );
    const solids = parts.filter(
      (p) =>
        p.item === "carcass" &&
        ["side", "divider", "back", "top", "shelf", "bottom"].includes(p.role),
    );
    const items = new Map<string, Box[]>();
    for (const p of parts.filter((q) => q.item !== "carcass")) {
      assert.ok(p.group, `${p.item} ${p.role} belongs to an object`);
      const key = `${p.item}:${p.group}`;
      items.set(key, [...(items.get(key) ?? []), partBounds(p)]);
    }
    // The ball rests in its stand; the stand and everything else on a board.
    items.delete("football:ball");
    for (const [key, boxes] of items) {
      const box = union(boxes);
      assert.ok(
        boards.some((b) => Math.abs(partBounds(b).y1 - box.y0) < 2e-3),
        `${key} rests on a board (bottom ${box.y0})`,
      );
      assert.ok(
        box.z1 <= SHELF.depth / 2 + EPS && box.x0 >= -SHELF.width / 2,
        key,
      );
      for (const solid of solids)
        assert.ok(
          !overlaps(box, partBounds(solid), -1e-4),
          `${key} cuts ${solid.role}`,
        );
      for (const [other, others] of items)
        if (other !== key)
          assert.ok(
            !overlaps(box, union(others), -1e-4),
            `${key} cuts ${other}`,
          );
    }
    const stand = local((p) => p.item === "football" && p.group === "stand");
    const bottom = FOOTBALL.center[1] - FOOTBALL.radius;
    assert.ok(
      bottom > stand.y0 && bottom < stand.y1,
      "ball cradled by the stand",
    );
    const plate = local((p) => p.item === "football" && p.role === "plate");
    assert.ok(bottom > plate.y1, "ball clear of the plate");
  });
});

describe("the Nike football (protagonist)", () => {
  it("has a pointed prolate profile of a real ball", () => {
    const profile = footballProfile(24);
    const radii = profile.map(([r]) => r);
    const ys = profile.map(([, y]) => y);
    const length = Math.max(...ys) - Math.min(...ys);
    const diameter = 2 * Math.max(...radii);
    assert.ok(Math.abs(length - FOOTBALL.length) < 1e-6);
    assert.ok(
      length / diameter > 1.55 && length / diameter < 1.8,
      `${length / diameter}`,
    );
    assert.ok(
      radii[0] < 0.004 && radii[radii.length - 1] < 0.004,
      "pointed tips",
    );
    // Tip quarter far narrower than an ellipse's.
    const near = profile.find(([, y]) => y >= FOOTBALL.length * 0.4) ?? [1, 0];
    assert.ok(near[0] < 0.4 * FOOTBALL.radius, `tip radius ${near[0]}`);
  });

  it("carries raised white laces on one seam, white end stripes and a Nike mark", () => {
    const laces = parts.filter(
      (p) => p.item === "football" && p.role === "lace",
    );
    assert.ok(laces.length >= 8, `${laces.length} laces`);
    assert.ok(laces.every((p) => p.color.toLowerCase() === "#fbf8f2"));
    assert.ok(
      parts.some((p) => p.item === "football" && p.role === "lace-seam"),
    );
    // Laces stand proud of the leather.
    for (const lace of laces) {
      const along = lace.center[0] - FOOTBALL.center[0];
      const dy = lace.center[1] - FOOTBALL.center[1];
      const dz = lace.center[2] - FOOTBALL.center[2];
      const radius =
        FOOTBALL.radius * (1 - (along / (FOOTBALL.length / 2)) ** 2);
      assert.ok(Math.hypot(dy, dz) > radius, "raised");
    }
    assert.equal(BALL_SKIN.stripes.length, 2);
    for (const s of BALL_SKIN.stripes)
      assert.ok(s.v1 - s.v0 > 0.02 && s.v1 - s.v0 < 0.08);
    assert.ok(
      BALL_SKIN.swoosh.width > 0 &&
        BALL_SKIN.swoosh.u > 0 &&
        BALL_SKIN.swoosh.u < 1,
    );
    assert.equal(BALL_SKIN.normal, "pebble");
    assert.ok(!BALL_SKIN.text, "no invented model text");
  });
});

describe("collection textures and budget", () => {
  it("labels boxes, cameras, books and keys from one modest original atlas", () => {
    assert.ok(LABEL_ATLAS.width <= 1024 && LABEL_ATLAS.height <= 1024);
    assert.ok(BALL_SKIN.width <= 1024 && BALL_SKIN.height <= 512);
    const ids = new Set(SHELF_LABELS.map((label) => label.id));
    assert.equal(ids.size, SHELF_LABELS.length);
    for (const id of [
      "psu",
      "ryzen",
      "gigabyte",
      "memory",
      "nvme",
      "carton",
      "keys",
      "zenit",
      "samsung",
    ])
      assert.ok(ids.has(id), id);
    assert.ok(
      SHELF_LABELS.filter((l) => l.item === "book").length >= 5,
      "spines",
    );
    for (const a of SHELF_LABELS) {
      const [x, y, w, h] = a.region;
      assert.ok(
        x >= 0 &&
          y >= 0 &&
          x + w <= LABEL_ATLAS.width &&
          y + h <= LABEL_ATLAS.height,
        a.id,
      );
      assert.ok(
        parts.some((p) => p.item === a.item),
        `${a.id} on its item`,
      );
      for (const b of SHELF_LABELS) {
        if (a === b) continue;
        const [bx, by, bw, bh] = b.region;
        assert.ok(
          x >= bx + bw || bx >= x + w || y >= by + bh || by >= y + h,
          `${a.id}/${b.id}`,
        );
      }
      // On the face of the part it labels, just proud of it.
      const anchors = parts.filter(
        (p) =>
          p.item === a.item &&
          p.role === a.anchor &&
          (a.group === undefined || p.group === a.group),
      );
      assert.ok(anchors.length > 0, `${a.id} anchor`);
      assert.ok(
        anchors.some((p) => {
          const b = partBounds(p);
          const [x, y, z] = a.center;
          const [w, h] = a.size;
          if (a.face === "top")
            return (
              y > b.y1 &&
              y < b.y1 + 0.004 &&
              x - w / 2 >= b.x0 - EPS &&
              x + w / 2 <= b.x1 + EPS &&
              z - h / 2 >= b.z0 - EPS &&
              z + h / 2 <= b.z1 + EPS
            );
          return (
            z > b.z1 &&
            z < b.z1 + 0.004 &&
            x - w / 2 >= b.x0 - EPS &&
            x + w / 2 <= b.x1 + EPS &&
            y - h / 2 >= b.y0 - EPS &&
            y + h / 2 <= b.y1 + EPS
          );
        }),
        `${a.id} on its ${a.anchor} face`,
      );
    }
  });

  it("keeps the shelf within a modest geometry and draw budget", () => {
    const budget = shelfBudget();
    assert.ok(budget.triangles < 16_000, `${budget.triangles} triangles`);
    assert.ok(budget.draws <= 9, `${budget.draws} draws`);
  });

  it("ships no reference photo: the personal pictures never reach public/", () => {
    const walk = (dir: URL): string[] =>
      readdirSync(dir).flatMap((name) => {
        const url = new URL(name, dir);
        return statSync(url).isDirectory()
          ? walk(new URL(`${name}/`, dir))
          : [name];
      });
    for (const name of walk(PUBLIC))
      assert.ok(!/IMG_\d+|bookshelf-reference|\.heic$/i.test(name), name);
  });

  it("mounts the shelf once in each WorldScene texture branch", () => {
    const source = readFileSync(
      new URL("../../src/components/world/WorldScene.tsx", import.meta.url),
      "utf8",
    );
    assert.equal(source.match(/<Shelf\b/g)?.length, 2);
  });

  it("credits the shelf as original work from photos supplied by Kevnnard, kept on regeneration", () => {
    const credits: Credits = JSON.parse(
      readFileSync(new URL("credits.json", PUBLIC), "utf8"),
    );
    const entry = credits.original?.find((item) => item.id === "shelf");
    assert.ok(entry);
    assert.equal(entry.license, ORIGINAL_LICENSE);
    assert.equal(entry.source, "src/lib/world/shelf.ts");
    assert.match(entry.asset, /photos supplied by Kevnnard/);
    assert.match(entry.asset, /no affiliation/i);
    assert.deepEqual(creditProblems(credits), []);
    const script = fileURLToPath(
      new URL("../../scripts/prepare-world.py", import.meta.url),
    );
    const run = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import ast, json, sys",
          "tree = ast.parse(open(sys.argv[1]).read())",
          "node = next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, 'id', None) == 'ORIGINAL' for t in n.targets))",
          "print(json.dumps(ast.literal_eval(node)))",
        ].join("\n"),
        script,
      ],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    const original: OriginalCredit[] = JSON.parse(run.stdout);
    assert.deepEqual(
      original.find((item) => item.id === "shelf"),
      entry,
    );
  });
});
