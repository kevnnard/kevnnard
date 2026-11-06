import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  GARAGE_INTERIOR,
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
import {
  TRUCK,
  TRUCK_HITBOX,
  TRUCK_MODEL,
  TRUCK_STORY,
  truckBox,
} from "../../src/lib/world/truck.ts";
import {
  TRUCK_REVEAL,
  TRUCK_SHOT,
  TRUCK_START,
  TRUCK_VIEW,
  truckLeaveAt,
  truckShotAt,
  truckShotProgress,
  truckShotShift,
} from "../../src/lib/world/truck-shot.ts";
import { glbInfo } from "./glb.ts";

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

describe("dream truck model (dream-truck T1)", () => {
  it("ships one meshopt GLB under 5 MB with 30-50k triangles", () => {
    const info = glbInfo(TRUCK_MODEL.url.replace("/world/", ""));
    assert.ok(info.bytes <= 5_000_000, `${info.bytes} bytes`);
    assert.ok(info.triangles >= 30_000 && info.triangles <= 50_000);
    assert.ok(info.extensions.includes("EXT_meshopt_compression"));
    assert.ok(info.primitives <= 32, `${info.primitives} draws`);
  });

  it("is authored at true scale: 5.9 m bumper to bumper, about 2 m tall", () => {
    const [width, height, length] = TRUCK_MODEL.size;
    assert.ok(Math.abs(TRUCK_MODEL.body - 5.9) < 0.01);
    assert.ok(length > 5.9 && length < 6.1, "plus the tow hitch");
    assert.ok(height > 1.9 && height < 2.05);
    assert.ok(width > 2.2 && width < 2.5, "mirrors included");
  });
});

describe("grown garage (dream-truck T1)", () => {
  it("grows toward true scale, no taller than the main house", () => {
    assert.deepEqual(
      { x0: G.x0, x1: G.x1, z0: G.z0, z1: G.z1, height: G.height },
      { x0: -3.8, x1: -1.25, z0: -2.75, z1: 2.85, height: 1.95 },
    );
    assert.ok(G.height <= HOUSE.main.height);
    assert.equal(G.z0, HOUSE.main.z0, "back flush with the house");
  });

  it("opens its door wide and high: no panel fills the opening", () => {
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

describe("the truck parked in the garage", () => {
  const box = truckBox();

  it("is scaled to the largest size the grown garage takes", () => {
    assert.equal(TRUCK.scale, 0.82);
    const [width, height, length] = TRUCK_MODEL.size;
    const door = GARAGE_DOOR.u1 - GARAGE_DOOR.u0;
    const depth = GARAGE_INTERIOR.z1 - GARAGE_INTERIOR.z0;
    const fits = (s: number) =>
      height * s < GARAGE_DOOR.v1 - 0.1 &&
      width * s < door - 0.08 &&
      length * s < depth - 0.3;
    assert.ok(fits(TRUCK.scale));
    // A step bigger would not fit through the door or before it.
    assert.ok(!fits(TRUCK.scale + 0.02));
  });

  it("stands inside, wheels on the floor, nose out to the open door", () => {
    assert.equal(TRUCK.rotationY, 0, "the model's nose looks down +z");
    assert.ok(Math.abs(box.y0 - HOUSE.floorY) < 0.01);
    assert.ok(box.x0 > GARAGE_INTERIOR.x0 + 0.1, "left");
    assert.ok(box.x1 < GARAGE_INTERIOR.x1 - 0.1, "right");
    assert.ok(box.z0 > GARAGE_INTERIOR.z0 + 0.1, "back");
    assert.ok(box.z1 < GARAGE_INTERIOR.z1 - 0.2, "front");
    assert.ok(box.z1 > GARAGE_INTERIOR.z1 - 0.4, "nose by the door");
  });

  it("drives straight out through the door", () => {
    const mid = (GARAGE_DOOR.u0 + GARAGE_DOOR.u1) / 2;
    assert.ok(Math.abs((box.x0 + box.x1) / 2 - mid) < 0.01);
    assert.ok(box.x0 > GARAGE_DOOR.u0 && box.x1 < GARAGE_DOOR.u1);
  });

  it("clicks on a box around the whole truck", () => {
    const [x, y, z] = TRUCK_HITBOX.center;
    const [w, h, d] = TRUCK_HITBOX.size;
    assert.ok(Math.abs(x - (box.x0 + box.x1) / 2) < 0.01);
    assert.ok(Math.abs(y - (box.y0 + box.y1) / 2) < 0.01);
    assert.ok(Math.abs(z - (box.z0 + box.z1) / 2) < 0.01);
    assert.ok(Math.abs(w - (box.x1 - box.x0)) < 0.01);
    assert.ok(Math.abs(h - (box.y1 - box.y0)) < 0.01);
    assert.ok(Math.abs(d - (box.z1 - box.z0)) < 0.01);
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

describe("dream truck close-up (truck-shot.ts)", () => {
  const box = truckBox();
  const corners: Vec3[] = [];
  for (const x of [box.x0, box.x1])
    for (const y of [box.y0, box.y1])
      for (const z of [box.z0, box.z1]) corners.push([x, y, z]);
  const aspect = 1440 / 900;
  const home = () => ({
    eye: poseToPosition(guidePose(aspect)) as Vec3,
    target: GUIDE.target,
    fov: GUIDE.fov,
  });

  it("times like the other cinematic shots; reduced motion cuts", () => {
    assert.equal(TRUCK_SHOT.duration, CINEMATIC.duration);
    assert.equal(TRUCK_SHOT.leaveDuration, CINEMATIC.leaveDuration);
    assert.ok(TRUCK_SHOT.leaveDuration < TRUCK_SHOT.duration);
    assert.equal(truckShotProgress(0, true), 1);
    assert.equal(truckShotProgress(0, true, true), 1);
    assert.equal(truckShotProgress(TRUCK_SHOT.duration / 2, false), 0.5);
  });

  it("ends low, three-quarters off the nose, from the open front-left yard", () => {
    const end = truckShotAt(1, home(), 0);
    const [cx, , cz] = TRUCK_SHOT.target;
    const out = [end.eye[0] - cx, end.eye[2] - cz];
    // The nose looks down +z; the lens stands in front, on the -x side.
    assert.ok(out[0] < 0 && out[1] > 0);
    const angle = (Math.atan2(-out[0], out[1]) * 180) / Math.PI;
    assert.ok(angle > 20 && angle < 35, `${angle} degrees off the nose`);
    const height = end.eye[1] - HOUSE.floorY;
    assert.ok(height > 0.8 && height < 1.4, `low: ${height} m`);
    assert.ok(end.eye[1] < box.y1, "below the roof line");
    assert.equal(end.fov, TRUCK_SHOT.fov);
    assert.ok(end.eye[2] > G.z1 + 1, "outside, in front of the garage");
  });

  it("frames the whole truck left of the card", () => {
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
      const points = corners.map((p) => project(end, p, ratio));
      const card =
        width <= STORY_CARD.narrowBelow
          ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
          : STORY_CARD.width + STORY_CARD.inset;
      const cardLeft = 1 - (2 * card) / width;
      for (const p of points) {
        assert.ok(p.depth > 0.5);
        assert.ok(p.x < cardLeft, `${width}: under the card ${p.x}`);
        assert.ok(p.x > -1 && Math.abs(p.y) < 1, `${width}: cut off`);
      }
      const ys = points.map((p) => p.y);
      assert.ok((Math.max(...ys) - Math.min(...ys)) / 2 > 0.4, `${width}`);
    }
    assert.equal(truckShotShift(STORY_CARD.stackBelow, 0.6), 0);
  });

  it("sees the truck past every tree, bush and rock left standing", () => {
    const end = truckShotAt(1, home(), truckShotShift(1440, aspect));
    const sights: Vec3[] = [TRUCK_SHOT.target, ...corners];
    for (const item of LAYOUT) {
      const reach = KIND_SPECS[item.kind].radius * item.scale;
      const tall = KIND_SPECS[item.kind].height * item.scale;
      for (const sight of sights)
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

  it("dissolves the garage's front, left wall and roof while it plays", () => {
    assert.deepEqual([...TRUCK_REVEAL].sort(), [
      "garage-front",
      "garage-left",
      "garage-roof",
    ]);
  });

  it("dollies in on an eased arc and leaves the same way", () => {
    const from = home();
    const start = truckShotAt(0, from, 0);
    assert.deepEqual(start.eye, from.eye);
    const end = truckShotAt(1, from, 0);
    const mid = truckShotAt(0.5, from, 0);
    const line = start.eye.map((v, i) => (v + end.eye[i]) / 2);
    assert.ok(Math.hypot(mid.eye[0] - line[0], mid.eye[2] - line[2]) > 0.05);
    for (let t = 0; t <= 1; t += 0.05)
      assert.ok(truckShotAt(t, from, 0).eye[1] > 0.4);
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

describe("dream truck card", () => {
  it("tells the owner's story in English, with sourced stats only", () => {
    assert.equal(TRUCK_STORY.kicker, "GARAGE · DREAM TRUCK");
    assert.equal(TRUCK_STORY.title, "Ford F-150 Raptor");
    assert.deepEqual(TRUCK_STORY.story, [
      "This is my dream truck. One day it will be parked in my real garage; for now it lives here, in the world I built.",
    ]);
    assert.ok(TRUCK_STORY.stats.length >= 2 && TRUCK_STORY.stats.length <= 3);
    for (const stat of TRUCK_STORY.stats)
      assert.ok(stat.label.trim() && stat.value.trim());
    // The stats' source is cited where they are written.
    assert.match(source("src/lib/world/truck.ts"), /Source: Ford/);
  });

  it("renders in the card family, Back to room focused, no images", () => {
    const card = source("src/components/world/TruckCard.tsx");
    assert.match(card, /className="case-story truck-card"/);
    assert.match(card, /story\.kicker/);
    assert.match(card, /story\.stats\.map/);
    assert.match(card, /Back to room/);
    assert.match(card, /back\.current\?\.focus\(/);
    assert.match(card, /data-state=\{state\}/);
    assert.match(card, /inert=\{state === "leaving"\}/);
    assert.match(card, /onAnimationEnd=\{onMotionEnd\}/);
    assert.doesNotMatch(card, /<img\b/);
    const css = source("src/components/world/truck-card.css");
    assert.match(css, /@media \(max-width: 700px\)/);
  });
});

describe("dream truck wiring", () => {
  it("parks the truck from the scene, clickable, with the garage revealed", () => {
    const truck = source("src/components/world/Truck.tsx");
    assert.match(truck, /TRUCK_MODEL\.url/);
    assert.match(truck, /setMeshoptDecoder/);
    assert.match(truck, /onInspect\?\.\("truck"\)/);
    assert.match(truck, /event\.stopPropagation\(\)/);
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /<Truck\b/);
    assert.match(
      scene,
      /truck: \{\s*shotAt: truckShotAt,\s*leaveAt: truckLeaveAt,\s*progress: truckShotProgress,\s*shift: truckShotShift,?\s*\}/,
    );
    assert.match(scene, /clearOfGarage\(/);
    assert.match(scene, /TRUCK_REVEAL/);
  });

  it("opens the card with the shared motion, framed left of it", () => {
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && galleryCase === "truck" \? "truck" : null,\s*TRUCK_STORY,\s*reducedMotion,?\s*\)/,
    );
    assert.match(
      app,
      /truckCards\.map\(\(card\) => \(\s*<TruckCard\s+key=\{card\.key\}[\s\S]*?state=\{card\.state\}\s*onMotionEnd=\{card\.onMotionEnd\}/,
    );
    assert.match(app, /galleryCase === "truck" \|\|/);
  });
});
