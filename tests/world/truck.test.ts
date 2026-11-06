import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GUIDE,
  guidePose,
  poseToPosition,
} from "../../src/lib/world/camera.ts";
import { CHERRY_SPOTS } from "../../src/lib/world/cherry.ts";
import { CINEMATIC } from "../../src/lib/world/cinematic.ts";
import {
  type InspectItemId,
  isDeskItemId,
  isDisplayCaseId,
} from "../../src/lib/world/display-cases.ts";
import { flowerLayout } from "../../src/lib/world/flowers.ts";
import {
  galleryCaseFocus,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import {
  clearOfGarage,
  GARAGE_DOOR,
  GARAGE_GROUNDS,
} from "../../src/lib/world/garage.ts";
import {
  clearOfGarden,
  GARDEN_PROPS,
  LANTERN_FIXTURES,
  PATH_STONES,
} from "../../src/lib/world/garden.ts";
import {
  GARAGE_SIDE,
  gablePanel,
  HOUSE,
  HOUSE_FOOTPRINT,
  houseMeshes,
  WALLS,
} from "../../src/lib/world/house.ts";
import { ISLAND } from "../../src/lib/world/island.ts";
import { islandLayout, KIND_SPECS } from "../../src/lib/world/layout.ts";
import { nightLightsOn } from "../../src/lib/world/lights.ts";
import * as truckModule from "../../src/lib/world/truck.ts";
import {
  COMING_SOON_SIGN,
  comingSoonGlow,
  GARAGE_DOOR_FACE,
  GARAGE_DOOR_HITBOX,
  GARAGE_STORY,
  garageDoorInSight,
} from "../../src/lib/world/truck.ts";
import * as shotModule from "../../src/lib/world/truck-shot.ts";
import {
  TRUCK_SHOT,
  TRUCK_START,
  TRUCK_VIEW,
  truckLeaveAt,
  truckShotAt,
  truckShotProgress,
  truckShotShift,
} from "../../src/lib/world/truck-shot.ts";

type Vec3 = [number, number, number];
const EPS = 1e-6;
const G = HOUSE.garage;
const W = HOUSE.wall;
const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** The scene's nature, cleared as WorldScene clears it. */
const NATURE = clearOfGarden(islandLayout(ISLAND.seed));
const LAYOUT = clearOfGarage(NATURE);
const FLOWERS = clearOfGarage(
  clearOfGarden(flowerLayout(NATURE, ISLAND.seed), 0.06),
  0.06,
);

describe("grown garage (dream-truck T1, kept in T4)", () => {
  it("grows toward true scale, no taller than the main house", () => {
    assert.deepEqual(
      { x0: G.x0, x1: G.x1, z0: G.z0, z1: G.z1, height: G.height },
      { x0: -3.8, x1: -1.25, z0: -2.75, z1: 2.85, height: 1.95 },
    );
    assert.ok(G.height <= HOUSE.main.height);
    assert.equal(G.z0, HOUSE.main.z0, "back flush with the house");
  });

  it("keeps its door opening wide and high; the roller door is its own mesh", () => {
    const front = WALLS.find((wall) => wall.id === "garage-front");
    const door = front?.openings.find((o) => o.kind === "garage");
    assert.ok(door);
    assert.deepEqual(GARAGE_DOOR, door);
    assert.ok(door.u1 - door.u0 > 2, "wide");
    assert.ok(door.v1 >= 1.75, "high");
    const um = (door.u0 + door.u1) / 2;
    for (const part of houseMeshes()["garage-front"].wood) {
      const [x, y, z] = part.center;
      const inOpening =
        Math.abs(x - um) < 0.5 &&
        y > HOUSE.floorY + 0.1 &&
        y < HOUSE.floorY + door.v1 - 0.1 &&
        Math.abs(z - front.at) < 0.3;
      assert.ok(!inOpening, `a part fills the door at ${part.center}`);
    }
  });

  it("closes its side past the main house's front, gable clipped to the roof", () => {
    assert.equal(GARAGE_SIDE.group, "garage-front");
    assert.equal(GARAGE_SIDE.axis, "z");
    assert.equal(GARAGE_SIDE.from, HOUSE.main.z1);
    assert.equal(GARAGE_SIDE.to, G.z1 - W);
    assert.ok(Math.abs(GARAGE_SIDE.at - (G.x1 - W / 2)) < EPS);
    const outline = gablePanel(GARAGE_SIDE);
    assert.ok(outline);
    // No apex: the ridge lies behind this short wall.
    assert.equal(outline.length, 4);
    for (const [u] of outline)
      assert.ok(u >= GARAGE_SIDE.from - EPS && u <= GARAGE_SIDE.to + EPS);
    const side = houseMeshes()["garage-front"].wood.filter(
      (p) =>
        Math.abs(p.center[0] - GARAGE_SIDE.at) < 0.1 &&
        p.center[2] > HOUSE.main.z1,
    );
    assert.ok(side.length > 5, "planked");
  });

  it("dissolves its front-left post with the front wall and lantern", () => {
    const meshes = houseMeshes();
    const post = (parts: typeof meshes.base.wood) =>
      parts.some(
        (p) =>
          p.shape === "round" &&
          Math.abs(p.center[0] - (G.x0 + W / 2)) < EPS &&
          Math.abs(p.center[2] - (G.z1 - W / 2)) < EPS,
      );
    assert.ok(post(meshes["garage-front"].wood));
    assert.ok(!post(meshes.base.wood));
  });

  it("keeps nature off the garage and its apron, and every tree", () => {
    const trees = (items: typeof NATURE) =>
      items.filter((item) => /^(tree|pine)/.test(item.kind)).length;
    assert.equal(trees(LAYOUT), trees(NATURE));
    assert.ok(LAYOUT.length < NATURE.length, "the tufts under it go");
    for (const [x, , z] of [
      ...LAYOUT.map((item) => item.position),
      ...FLOWERS.map((item) => item.position),
    ])
      for (const rect of GARAGE_GROUNDS)
        assert.ok(
          x < rect.x0 - 0.2 ||
            x > rect.x1 + 0.2 ||
            z < rect.z0 - 0.2 ||
            z > rect.z1 + 0.2,
          `${x},${z} inside ${rect.id}`,
        );
  });

  it("leaves Cherry's spots, the mailbox, sign and path clear", () => {
    const outside = ([x, z]: readonly [number, number], margin: number) =>
      HOUSE_FOOTPRINT.every(
        (r) =>
          x < r.x0 - margin ||
          x > r.x1 + margin ||
          z < r.z0 - margin ||
          z > r.z1 + margin,
      );
    for (const spot of CHERRY_SPOTS)
      assert.ok(outside(spot.position, 0.4), spot.id);
    for (const [id, prop] of Object.entries(GARDEN_PROPS))
      assert.ok(outside(prop.position, prop.radius), id);
    for (const stone of PATH_STONES) assert.ok(outside(stone.center, 0.2));
  });

  it("aims the garage lantern at the apron in front of the door", () => {
    const driveway = HOUSE_FOOTPRINT.find((r) => r.id === "driveway");
    assert.ok(driveway);
    assert.equal(driveway.z0, G.z1);
    const [x, , z] = LANTERN_FIXTURES.lanternGarage.target;
    assert.ok(x > driveway.x0 && x < driveway.x1);
    assert.ok(z > driveway.z0 && z < driveway.z1);
  });
});

/** NDC x, y and depth of `p` seen from `pose` at `aspect`. */
function project(
  pose: { eye: Vec3; target: Vec3; fov: number },
  p: Vec3,
  aspect: number,
) {
  const f = pose.target.map((v, i) => v - pose.eye[i]);
  const fl = Math.hypot(...f);
  const fwd = f.map((v) => v / fl);
  const right = [-fwd[2], 0, fwd[0]];
  const rl = Math.hypot(...right);
  const r = right.map((v) => v / rl);
  const up = [
    r[1] * fwd[2] - r[2] * fwd[1],
    r[2] * fwd[0] - r[0] * fwd[2],
    r[0] * fwd[1] - r[1] * fwd[0],
  ];
  const d = p.map((v, i) => v - pose.eye[i]);
  const depth = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
  const t = Math.tan(((pose.fov / 2) * Math.PI) / 180);
  return {
    x: (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / depth / (t * aspect),
    y: (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / depth / t,
    depth,
  };
}

describe("no truck in the garage (dream-truck T4)", () => {
  it("loads no dream-truck model anywhere and ships none", () => {
    assert.equal("TRUCK_MODEL" in truckModule, false);
    assert.equal("truckBox" in truckModule, false);
    const files = (dir: string): string[] =>
      readdirSync(new URL(`../../${dir}`, import.meta.url), {
        recursive: true,
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .map((entry) => `${entry.parentPath}/${entry.name}`);
    for (const file of files("src"))
      assert.doesNotMatch(readFileSync(file, "utf8"), /dream-truck\.glb/, file);
    assert.doesNotMatch(source("scripts/prepare-world.py"), /dream-truck/);
    assert.doesNotMatch(source("public/world/credits.json"), /dream-truck/);
    assert.equal(
      existsSync(
        new URL("../../public/world/models/dream-truck.glb", import.meta.url),
      ),
      false,
    );
  });

  it("draws no truck from the scene: the door takes the click", () => {
    const truck = source("src/components/world/Truck.tsx");
    assert.doesNotMatch(truck, /useLoader|GLTFLoader|<primitive/);
    assert.match(truck, /GARAGE_DOOR_HITBOX/);
    assert.match(truck, /onInspect\?\.\("truck"\)/);
    assert.match(truck, /event\.stopPropagation\(\)/);
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /<Truck\b/);
    assert.match(
      scene,
      /truck: \{\s*shotAt: truckShotAt,\s*leaveAt: truckLeaveAt,\s*progress: truckShotProgress,\s*shift: truckShotShift,?\s*\}/,
    );
    assert.match(scene, /clearOfGarage\(/);
  });
});

describe("coming soon on the closed garage door (dream-truck T4)", () => {
  const front = WALLS.find((wall) => wall.id === "garage-front");

  it("faces the yard on the door's outer face", () => {
    assert.ok(front);
    const [x, y, z] = GARAGE_DOOR_FACE.center;
    assert.ok(Math.abs(x - (GARAGE_DOOR.u0 + GARAGE_DOOR.u1) / 2) < EPS);
    assert.ok(Math.abs(y - (HOUSE.floorY + GARAGE_DOOR.v1 / 2)) < EPS);
    assert.ok(z > front.at && z < front.at + W, "just proud of the slats");
    assert.ok(
      Math.abs(GARAGE_DOOR_FACE.width - (GARAGE_DOOR.u1 - GARAGE_DOOR.u0)) <
        EPS,
    );
    assert.ok(Math.abs(GARAGE_DOOR_FACE.height - GARAGE_DOOR.v1) < EPS);
  });

  it("paints a small COMING SOON sign on it, in the site's tokens", () => {
    assert.equal(COMING_SOON_SIGN.text, "COMING SOON");
    const [w, h] = COMING_SOON_SIGN.size;
    assert.ok(w < GARAGE_DOOR_FACE.width * 0.6 && w > 0.6, `small: ${w}`);
    assert.ok(h < 0.4 && h > 0.15);
    const [cx, cy, cz] = COMING_SOON_SIGN.center;
    const [dx] = GARAGE_DOOR_FACE.center;
    assert.ok(Math.abs(cx - dx) < EPS, "centred on the door");
    assert.ok(
      cy - h / 2 > HOUSE.floorY + 0.5 &&
        cy + h / 2 < HOUSE.floorY + GARAGE_DOOR.v1,
    );
    assert.ok(cz > GARAGE_DOOR_FACE.center[2], "over the slats");
    const [px, py] = COMING_SOON_SIGN.canvas;
    assert.ok(Math.abs(px / py - w / h) < 0.01, "canvas matches the plate");
    // design/system.md: background, foreground and the emerald accent.
    assert.equal(COMING_SOON_SIGN.plate, "#09090b");
    assert.equal(COMING_SOON_SIGN.ink, "#fafafa");
    assert.equal(COMING_SOON_SIGN.accent, "#10b981");
  });

  it("glows softly at night, under the garage lantern, and not by day", () => {
    for (let hours = 0; hours < 24; hours += 0.5) {
      const glow = comingSoonGlow(hours, true);
      if (nightLightsOn(hours)) assert.ok(glow > 0 && glow <= 0.6, `${hours}`);
      else assert.equal(glow, 0, `${hours}`);
      assert.equal(comingSoonGlow(hours, false), 0, "master power off");
    }
    const [x, , z] = LANTERN_FIXTURES.lanternGarage.position;
    assert.ok(
      Math.abs(z - COMING_SOON_SIGN.center[2]) < 0.4,
      "the lantern is by the door",
    );
    assert.ok(x < GARAGE_DOOR.u0 + 0.5);
  });

  it("is drawn with the door, in the garage front's cutaway group", () => {
    const house = source("src/components/world/House.tsx");
    assert.match(house, /COMING_SOON_SIGN/);
    assert.match(house, /CanvasTexture/);
    assert.match(house, /emissiveIntensity = glow/);
    assert.match(house, /front\?\.object\.add\(sign\)/);
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /comingSoonGlow\(hours, power\)/);
    assert.equal(scene.match(/glow=\{doorGlow\}/g)?.length, 2, "both houses");
  });

  it("takes the click on the closed door, seen from the front", () => {
    const [x, y, z] = GARAGE_DOOR_HITBOX.center;
    const [w, h, d] = GARAGE_DOOR_HITBOX.size;
    assert.ok(Math.abs(x - GARAGE_DOOR_FACE.center[0]) < EPS);
    assert.ok(Math.abs(y - GARAGE_DOOR_FACE.center[1]) < EPS);
    assert.ok(Math.abs(w - GARAGE_DOOR_FACE.width) < EPS);
    assert.ok(Math.abs(h - GARAGE_DOOR_FACE.height) < EPS);
    assert.ok(d > 0 && d < 0.3);
    assert.ok(z - d / 2 < GARAGE_DOOR_FACE.center[2]);
    assert.equal(garageDoorInSight([-2.5, 1.5, 7]), true, "the front yard");
    assert.equal(garageDoorInSight([-2.5, 1.5, -6]), false, "behind the house");
  });
});

describe("garage close-up (truck-shot.ts, dream-truck T4)", () => {
  const { x0, x1 } = { x0: GARAGE_DOOR.u0, x1: GARAGE_DOOR.u1 };
  const zFace = GARAGE_DOOR_FACE.center[2];
  const corners: Vec3[] = [];
  for (const x of [x0, x1])
    for (const y of [HOUSE.floorY, HOUSE.floorY + GARAGE_DOOR.v1])
      corners.push([x, y, zFace]);
  const aspect = 1440 / 900;
  const home = () => ({
    eye: poseToPosition(guidePose(aspect)) as Vec3,
    target: GUIDE.target,
    fov: GUIDE.fov,
  });

  it("times like the other cinematic shots; reduced motion cuts", () => {
    assert.equal(TRUCK_SHOT.duration, CINEMATIC.duration);
    assert.equal(TRUCK_SHOT.leaveDuration, CINEMATIC.leaveDuration);
    assert.equal(truckShotProgress(0, true), 1);
    assert.equal(truckShotProgress(0, true, true), 1);
    assert.equal(truckShotProgress(TRUCK_SHOT.duration / 2, false), 0.5);
  });

  it("aims at the closed door from the front yard, a little off its left", () => {
    assert.deepEqual(TRUCK_SHOT.target, GARAGE_DOOR_FACE.center);
    const end = truckShotAt(1, home(), 0);
    const out = [end.eye[0] - TRUCK_SHOT.target[0], end.eye[2] - zFace];
    assert.ok(out[1] > 3, "out in the yard");
    const angle = (Math.atan2(-out[0], out[1]) * 180) / Math.PI;
    assert.ok(angle >= 0 && angle < 30, `${angle} degrees off the door`);
    const height = end.eye[1] - HOUSE.floorY;
    assert.ok(height > 0.8 && height < 2, `${height} m up`);
  });

  it("dissolves nothing: no wall reveal for a closed door", () => {
    assert.equal("TRUCK_REVEAL" in shotModule, false);
  });

  it("frames the whole door left of the card", () => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1920, 1080],
      [1100, 800],
    ]) {
      const ratio = width / height;
      const shift = truckShotShift(width, ratio);
      assert.ok(shift > 0);
      const end = truckShotAt(1, home(), shift);
      const card =
        width <= STORY_CARD.narrowBelow
          ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
          : STORY_CARD.width + STORY_CARD.inset;
      const cardLeft = 1 - (2 * card) / width;
      const points = corners.map((p) => project(end, p, ratio));
      for (const p of points) {
        assert.ok(p.depth > 0.5);
        assert.ok(p.x < cardLeft, `${width}: under the card ${p.x}`);
        assert.ok(p.x > -1 && Math.abs(p.y) < 1, `${width}: cut off`);
      }
      const ys = points.map((p) => p.y);
      assert.ok((Math.max(...ys) - Math.min(...ys)) / 2 > 0.3, `${width}`);
    }
    assert.equal(truckShotShift(STORY_CARD.stackBelow, 0.6), 0);
  });

  it("sees the door past every tree, bush and rock left standing", () => {
    const end = truckShotAt(1, home(), truckShotShift(1440, aspect));
    for (const item of LAYOUT) {
      const reach = KIND_SPECS[item.kind].radius * item.scale;
      const tall = KIND_SPECS[item.kind].height * item.scale;
      for (const sight of [TRUCK_SHOT.target, ...corners])
        for (let s = 0.02; s < 1; s += 0.02) {
          const p = end.eye.map((v, i) => v + (sight[i] - v) * s);
          if (p[1] > tall) continue;
          const d = Math.hypot(
            p[0] - item.position[0],
            p[2] - item.position[2],
          );
          assert.ok(d > reach * 0.85, `a ${item.kind} in the way`);
        }
    }
  });

  it("starts from the live pose on an eased arc and leaves the same way", () => {
    const from = home();
    const start = truckShotAt(0, from, 0);
    assert.deepEqual(start.eye, from.eye);
    const end = truckShotAt(1, from, 0);
    assert.deepEqual(truckLeaveAt(0, from, 0), end);
    assert.deepEqual(truckLeaveAt(1, from, 0), start);
    assert.deepEqual(truckShotAt(0).eye, TRUCK_START.eye);
  });

  it("is inspected like the desk things, with the same end pose", () => {
    const id: InspectItemId = "truck";
    assert.equal(isDeskItemId(id), true);
    assert.equal(isDisplayCaseId(id), false);
    const focus = galleryCaseFocus(id);
    const end = truckShotAt(1, TRUCK_START, 0);
    assert.ok(focus.position.every((v, i) => Math.abs(v - end.eye[i]) < EPS));
    assert.ok(focus.target.every((v, i) => Math.abs(v - end.target[i]) < EPS));
    assert.equal(focus.fov, TRUCK_SHOT.fov);
    assert.deepEqual(TRUCK_VIEW.centre, TRUCK_SHOT.target);
  });
});

describe("garage card (dream-truck T4)", () => {
  it("says coming soon, in English, nothing else", () => {
    assert.deepEqual(GARAGE_STORY, {
      kicker: "GARAGE",
      title: "Coming soon",
      line: "Something special will park here soon.",
    });
  });

  it("renders in the card family, Back to room focused, no truck copy", () => {
    const card = source("src/components/world/TruckCard.tsx");
    assert.match(card, /className="case-story garage-card"/);
    assert.match(card, /story\.kicker/);
    assert.match(card, /story\.title/);
    assert.match(card, /story\.line/);
    assert.match(card, /Back to room/);
    assert.match(card, /back\.current\?\.focus\(/);
    assert.match(card, /data-state=\{state\}/);
    assert.match(card, /inert=\{state === "leaving"\}/);
    assert.match(card, /onAnimationEnd=\{onMotionEnd\}/);
    assert.doesNotMatch(card, /<img\b|stats|(className|id)="[^"]*truck/);
    assert.doesNotMatch(
      source("src/components/world/truck-card.css"),
      /\.truck-/,
    );
  });

  it("opens with the shared motion, framed left of it", () => {
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && galleryCase === "truck" \? "truck" : null,\s*GARAGE_STORY,\s*reducedMotion,?\s*\)/,
    );
    assert.match(app, /<TruckCard\s+key=\{card\.key\}/);
    assert.doesNotMatch(app, /TRUCK_STORY/);
  });
});
