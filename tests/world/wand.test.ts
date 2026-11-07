import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GUIDE,
  guidePose,
  poseToPosition,
  type Vec3,
} from "../../src/lib/world/camera.ts";
import { CINEMATIC, type ShotPose } from "../../src/lib/world/cinematic.ts";
import {
  type InspectItemId,
  isDeskItemId,
  isDisplayCaseId,
} from "../../src/lib/world/display-cases.ts";
import {
  galleryCaseFocus,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import { nightLightsOn } from "../../src/lib/world/lights.ts";
import {
  SHELF,
  SHELF_HITBOX,
  SHELF_TIERS,
  shelfParts,
  shelfWorldBounds,
} from "../../src/lib/world/shelf.ts";
import {
  WAND,
  WAND_HITBOX,
  WAND_STAND,
  WAND_STORY,
  WAND_TIP,
  wandAccentLevel,
  wandSpellAt,
  wandStandParts,
} from "../../src/lib/world/wand.ts";
import {
  WAND_SHOT,
  WAND_VIEW,
  wandLeaveAt,
  wandShotAt,
  wandShotProgress,
  wandShotShift,
} from "../../src/lib/world/wand-shot.ts";

const EPS = 1e-6;
const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

type Box = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
};
const boxOf = ({ center, size }: { center: Vec3; size: Vec3 }): Box => ({
  x0: center[0] - size[0] / 2,
  x1: center[0] + size[0] / 2,
  y0: center[1] - size[1] / 2,
  y1: center[1] + size[1] / 2,
  z0: center[2] - size[2] / 2,
  z1: center[2] + size[2] / 2,
});
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 &&
  b.x0 < a.x1 &&
  a.y0 < b.y1 &&
  b.y0 < a.y1 &&
  a.z0 < b.z1 &&
  b.z0 < a.z1;
const inside = (p: Vec3, b: Box, pad = 0) =>
  p[0] >= b.x0 - pad &&
  p[0] <= b.x1 + pad &&
  p[1] >= b.y0 - pad &&
  p[1] <= b.y1 + pad &&
  p[2] >= b.z0 - pad &&
  p[2] <= b.z1 + pad;

describe("Elder Wand on the collection shelf (patronus T1)", () => {
  it("lies at true scale on the eye-level board, in the right column", () => {
    assert.ok(WAND.length > 0.36 && WAND.length < 0.4, "about 38 cm");
    assert.equal(WAND.floor, SHELF_TIERS[3]);
    // Along the board's width, inside the right column, near the front.
    assert.ok(WAND.local[0] - WAND.length / 2 > SHELF.board / 2);
    assert.ok(WAND.local[0] + WAND.length / 2 < SHELF.width / 2 - SHELF.board);
    assert.ok(WAND.local[2] + WAND_STAND.depth / 2 < SHELF.depth / 2);
  });

  it("rests on a small dark wooden stand that clears every other item", () => {
    const parts = wandStandParts();
    assert.ok(parts.length >= 3, "a plate and two cradles");
    for (const p of parts) {
      assert.equal(p.material, "wood");
      assert.ok(p.color.toLowerCase() < "#5", `dark ${p.color}`);
    }
    const stand = parts.map((p) => shelfWorldBounds(p));
    const others = shelfParts().filter((p) => p.item !== "carcass");
    for (const other of others) {
      const b = shelfWorldBounds(other);
      for (const s of stand)
        assert.ok(!overlaps(s, b), `${other.group} under the stand`);
    }
  });

  it("is clicked through a box around the wand and stand only", () => {
    const hit = boxOf(WAND_HITBOX);
    assert.ok(inside(WAND_TIP, hit), "the tip inside");
    assert.ok(hit.y0 >= SHELF.base[1] + SHELF_TIERS[3] - EPS, "on the board");
    assert.ok(hit.y1 - hit.y0 < 0.12, "low");
    for (const other of shelfParts().filter((p) => p.item !== "carcass"))
      assert.ok(
        !overlaps(hit, shelfWorldBounds(other)),
        `${other.group} inside the box`,
      );
    // Its front pokes past the shelf's own box, so it takes the click first.
    const shelf = boxOf(SHELF_HITBOX);
    assert.ok(hit.x1 > shelf.x1 + 0.01);
  });

  it("has a night-only accent light, mounted at zero when off", () => {
    assert.equal(wandAccentLevel(13, true), 0);
    const night = [21, 22, 23, 1, 3].find((h) => nightLightsOn(h));
    assert.ok(night !== undefined);
    assert.ok(wandAccentLevel(night, true) > 0);
    assert.equal(wandAccentLevel(night, false), 0);
    const view = source("src/components/world/Wand.tsx");
    assert.match(view, /<spotLight|<pointLight/);
    assert.match(view, /intensity=\{[^}]*level/);
  });
});

describe("the spell (patronus T1)", () => {
  it("lights the tip on arrival, sparks, then shows the words briefly", () => {
    const rest = wandSpellAt(-1, false);
    assert.equal(rest.glow, 0);
    assert.equal(rest.sparks, 0);
    assert.equal(rest.words, 0);
    const peak = wandSpellAt(0.8, false);
    assert.ok(peak.glow > 0.8);
    assert.ok(peak.light > 0);
    assert.ok(peak.sparks > 0);
    assert.ok(peak.words > 0.5);
    const after = wandSpellAt(9, false);
    assert.equal(after.words, 0, "brief");
    assert.equal(after.sparks, 0);
    assert.ok(after.glow < peak.glow);
  });

  it("is a static glow without particles under reduced motion", () => {
    for (const t of [0, 0.5, 2, 9]) {
      const s = wandSpellAt(t, true);
      assert.equal(s.sparks, 0);
      assert.ok(s.glow > 0);
    }
  });

  it("reads Expecto Patronum and casts again from the card", () => {
    assert.deepEqual(WAND_STORY, {
      kicker: "COLLECTION · ELDER WAND",
      title: "Expecto Patronum",
      lines: [
        "Harry Potter has been part of my life since I was a kid.",
        "My patronus is a lion.",
      ],
      spell: "Expecto Patronum",
    });
    const card = source("src/components/world/WandCard.tsx");
    assert.match(card, /className="case-story wand-card"/);
    assert.match(card, /Cast again/);
    assert.match(card, /Back to room/);
    assert.match(card, /back\.current\?\.focus\(/);
    assert.match(card, /data-state=\{state\}/);
    assert.match(card, /inert=\{state === "leaving"\}/);
    assert.doesNotMatch(card, /<img\b/);
  });
});

describe("wand close-up (patronus T1)", () => {
  const home = (): ShotPose => ({
    eye: poseToPosition(guidePose(16 / 9)) as Vec3,
    target: GUIDE.target,
    fov: GUIDE.fov,
  });

  it("is a desk-style inspect id with the shared cinematic move", () => {
    const id: InspectItemId = "wand";
    assert.equal(isDeskItemId(id), true);
    assert.equal(isDisplayCaseId(id), false);
    assert.equal(WAND_SHOT.duration, CINEMATIC.duration);
    assert.equal(wandShotProgress(0, true), 1);
    const from = home();
    assert.deepEqual(wandShotAt(0, from, 0).eye, from.eye);
    assert.deepEqual(wandLeaveAt(1, from, 0), wandShotAt(0, from, 0));
    const focus = galleryCaseFocus(id);
    const end = wandShotAt(1, from, 0);
    assert.ok(focus.position.every((v, i) => Math.abs(v - end.eye[i]) < EPS));
    assert.deepEqual(WAND_VIEW.centre, WAND_SHOT.target);
  });

  it("looks from the room and puts the wand left of the card", () => {
    const end = wandShotAt(1, home(), wandShotShift(1440, 16 / 9));
    assert.ok(end.eye[0] > WAND_TIP[0] + 0.5, "from the room side");
    assert.ok(wandShotShift(1440, 16 / 9) > 0);
    assert.equal(wandShotShift(STORY_CARD.stackBelow, 0.6), 0);
    // The wand's middle projects left of the screen centre.
    const forward = end.target.map((v, i) => v - end.eye[i]);
    const right = [-forward[2], 0, forward[0]];
    const toWand = WAND_SHOT.target.map((v, i) => v - end.eye[i]);
    const side = toWand[0] * right[0] + toWand[2] * right[2];
    assert.ok(side < 0, "wand left of centre");
  });

  it("is wired into the scene and the app", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /wand: \{\s*shotAt: wandShotAt/);
    assert.match(scene, /<Wand\b/);
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(app, /galleryCase === "wand" \? "wand" : null/);
    assert.match(app, /<WandCard\b/);
  });
});
