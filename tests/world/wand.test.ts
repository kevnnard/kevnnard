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
import { CUTAWAY } from "../../src/lib/world/cutaway.ts";
import {
  type InspectItemId,
  isDeskItemId,
  isDisplayCaseId,
} from "../../src/lib/world/display-cases.ts";
import {
  galleryCaseFocus,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import { HOUSE, HOUSE_FOCUS } from "../../src/lib/world/house.ts";
import { nightLightsOn } from "../../src/lib/world/lights.ts";
import {
  PATRONUS,
  PATRONUS_BOUNDS,
  patronusAt,
} from "../../src/lib/world/patronus.ts";
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
  chaseWideView,
  WAND_CHASE,
  WAND_SHOT,
  WAND_START,
  WAND_VIEW,
  wandChaseAt,
  wandChaseCard,
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

  it("tells why this corner exists, lists the films and casts again from the card", () => {
    assert.deepEqual(WAND_STORY, {
      kicker: "COLLECTION · ELDER WAND",
      title: "Expecto Patronum",
      lines: [
        "Harry Potter has been part of my life since I was a kid: the books, the films, the music. I'm a big fan.",
        "So this corner of my open world recreates one of its most iconic moments: the Elder Wand casting the Patronus Charm. My patronus is a lion.",
      ],
      filmsLabel: "The eight films",
      films: [
        { title: "Philosopher's Stone", year: 2001 },
        { title: "Chamber of Secrets", year: 2002 },
        { title: "Prisoner of Azkaban", year: 2004 },
        { title: "Goblet of Fire", year: 2005 },
        { title: "Order of the Phoenix", year: 2007 },
        { title: "Half-Blood Prince", year: 2009 },
        { title: "Deathly Hallows – Part 1", year: 2010 },
        { title: "Deathly Hallows – Part 2", year: 2011 },
      ],
      lore: [
        {
          term: "The wand",
          text: "The Elder Wand, the most powerful of the three Deathly Hallows.",
        },
        {
          term: "The charm",
          text: "Expecto Patronum conjures a guardian of silver light. Harry first casts a full one in Prisoner of Azkaban.",
        },
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
    // The films and the lore render from the story, not hard-coded copy.
    assert.match(card, /story\.films\.map\(/);
    assert.match(card, /story\.lore\.map\(/);
    assert.match(card, /className="wand-card-films"/);
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

describe("patronus chase camera (patronus T2, S3)", () => {
  const from = wandShotAt(1, WAND_START, 0);
  const back = from;
  const wide = chaseWideView(PATRONUS_BOUNDS, 16 / 9);
  const sub = (a: Vec3, b: Vec3): Vec3 => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
  ];
  const unit = (v: Vec3): Vec3 => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const near = (a: Vec3, b: Vec3, eps = 1e-4) => Math.hypot(...sub(a, b)) < eps;
  const at = (t: number, reducedMotion = false) =>
    wandChaseAt(t, { from, back, reducedMotion, aspect: 16 / 9 });

  it("frames the whole run from an elevated, cut-away room view", () => {
    const forward = unit(sub(wide.target, wide.eye));
    const right = unit([-forward[2], 0, forward[0]]);
    const up: Vec3 = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const tan = Math.tan(((wide.fov / 2) * Math.PI) / 180);
    for (let k = 0; k <= 60; k++) {
      const p = patronusAt(PATRONUS.start + (PATRONUS.duration * k) / 60);
      assert.ok(p);
      const d = sub(p.position, wide.eye);
      const z = d[0] * forward[0] + d[1] * forward[1] + d[2] * forward[2];
      const x = d[0] * right[0] + d[1] * right[1] + d[2] * right[2];
      const y = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
      assert.ok(Math.abs(y / z) < tan * 0.95, `in frame vertically at ${k}`);
      assert.ok(
        Math.abs(x / z) < tan * (16 / 9) * 0.95,
        `in frame across at ${k}`,
      );
    }
    assert.ok(wide.eye[1] > HOUSE.floorY + 2, "elevated");
    const { x0, x1, z0, z1 } = HOUSE.main;
    for (const aspect of [16 / 9, 1, 0.5]) {
      const [x, , z] = chaseWideView(PATRONUS_BOUNDS, aspect).eye;
      assert.ok(x > x0 && x < x1 && z > z0 && z < z1, "inside the room");
    }
    assert.ok(
      Math.hypot(...sub(wide.eye, HOUSE_FOCUS)) < CUTAWAY.wall.gone,
      "close enough that the near walls and roof are cut away",
    );
    // A pure function of the path's bounds.
    assert.deepEqual(chaseWideView(PATRONUS_BOUNDS, 16 / 9), wide);
  });

  it("leaves the close-up after the words, tracks the run, then returns", () => {
    const { leave, out, returnAt, back: backSeconds } = WAND_CHASE;
    assert.ok(leave >= 0.6 && leave <= 1, "after the tip glow and words");
    assert.ok(out >= 1 && out <= 1.5);
    assert.ok(backSeconds >= 1.3 && backSeconds <= 1.8);
    assert.equal(returnAt, PATRONUS.start + PATRONUS.duration);
    assert.equal(at(leave - 0.01), null);
    assert.ok(near(at(leave)!.eye, from.eye));
    const tracked = at(leave + out)!;
    assert.ok(Math.abs(tracked.fov - wide.fov) < 1e-6);
    assert.ok(Math.hypot(...sub(tracked.eye, wide.eye)) < 0.6);
    // The aim follows the patronus across the room.
    const early = at(leave + out + 0.1)!;
    const late = at(returnAt - 0.3)!;
    const run = patronusAt(returnAt - 0.3)!;
    assert.ok(late.target[0] > early.target[0] + 0.8, "aim moves with it");
    assert.ok(
      Math.hypot(...sub(late.target, run.position)) <
        Math.hypot(...sub(early.target, run.position)),
    );
    const end = at(returnAt + backSeconds)!;
    assert.ok(near(end.eye, back.eye) && near(end.target, back.target));
    assert.equal(end.fov, back.fov);
    assert.equal(at(returnAt + backSeconds + 0.01), null);
  });

  it("moves calmly: no fast swings of the view", () => {
    const { leave, returnAt, back: backSeconds } = WAND_CHASE;
    const dt = 1 / 60;
    let prev = at(leave)!;
    let maxTurn = 0;
    for (let t = leave + dt; t <= returnAt + backSeconds; t += dt) {
      const pose = at(t)!;
      const a = unit(sub(prev.target, prev.eye));
      const b = unit(sub(pose.target, pose.eye));
      const turn = Math.acos(
        Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
      );
      maxTurn = Math.max(maxTurn, turn / dt);
      prev = pose;
    }
    assert.ok(maxTurn < 1.6, `turns at most ${maxTurn.toFixed(2)} rad/s`);
    // The eye only drifts while it tracks.
    const a = at(WAND_CHASE.leave + WAND_CHASE.out)!;
    const b = at(returnAt)!;
    assert.ok(Math.hypot(...sub(a.eye, b.eye)) < 0.8);
  });

  it("cuts to a still wide view and back under reduced motion", () => {
    const { leave, returnAt } = WAND_CHASE;
    assert.equal(at(leave - 0.01, true), null);
    for (const t of [leave, 2, 3, returnAt - 0.01]) {
      const pose = at(t, true)!;
      assert.ok(near(pose.eye, wide.eye) && near(pose.target, wide.target));
    }
    const end = at(returnAt, true)!;
    assert.ok(near(end.eye, back.eye));
    assert.equal(at(returnAt + 0.01, true), null);
  });

  it("hides the card during the chase", () => {
    assert.deepEqual(wandChaseCard(), {
      hide: WAND_CHASE.leave,
      show: WAND_CHASE.returnAt,
    });
  });

  it("is wired into the camera and the card", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /wandChaseAt\(/);
    assert.match(scene, /<GuidedCamera[\s\S]*?wandCast=\{wandCast\}/);
    const card = source("src/components/world/WandCard.tsx");
    assert.match(card, /data-chase/);
    assert.match(source("src/components/world/wand-card.css"), /data-chase/);
  });
});
