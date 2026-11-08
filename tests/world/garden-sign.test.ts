import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  GUIDE,
  guidePose,
  poseToPosition,
  type Vec3,
} from "../../src/lib/world/camera.ts";
import { CINEMATIC } from "../../src/lib/world/cinematic.ts";
import {
  GALLERY_ORDER,
  isDeskItemId,
  isDisplayCaseId,
} from "../../src/lib/world/display-cases.ts";
import { flowerLayout } from "../../src/lib/world/flowers.ts";
import {
  galleryCaseFocus,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import {
  clearOfGarden,
  GARDEN_PROPS,
  GARDEN_SIGN,
  SIGN_LANTERN,
  SIGN_PANEL,
  signParts,
} from "../../src/lib/world/garden.ts";
import {
  fitLine,
  SIGN_FACE,
  SIGN_FLIP,
  SIGN_HITBOX,
  SIGN_MESSAGES,
  SIGN_PROFILE,
  SIGN_TILE_PANEL,
  signCopy,
  signLanternGlow,
  signTile,
  signTileWake,
  signWorld,
} from "../../src/lib/world/garden-sign.ts";
import { HOUSE_FOOTPRINT } from "../../src/lib/world/house.ts";
import { ISLAND, insideIsland } from "../../src/lib/world/island.ts";
import { islandLayout, KIND_SPECS } from "../../src/lib/world/layout.ts";
import {
  SIGN_SHOT,
  SIGN_START,
  SIGN_VIEW,
  signLeaveAt,
  signShotAt,
  signShotProgress,
  signShotShift,
} from "../../src/lib/world/sign-shot.ts";
import {
  CONTACT_LINKS,
  portfolioBuffers,
} from "../../src/lib/world/terminal-content.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const EPS = 1e-9;

/** WCAG relative luminance of an sRGB hex. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("garden sign status (garden-sign T2)", () => {
  it("is one typed constant the owner flips, open by default", () => {
    assert.equal(GARDEN_SIGN.status, "open");
    assert.ok(!("text" in GARDEN_SIGN), "no free text: the status drives it");
    const garden = source("src/lib/world/garden.ts");
    assert.match(garden, /export type SignStatus = "open" \| "busy";/);
    assert.match(garden, /status: SignStatus;/);
  });

  it("paints OPEN TO WORK when open and BACK SOON when busy, in the card's words too", () => {
    assert.deepEqual(signCopy("open"), {
      headline: "OPEN TO WORK",
      kicker: "OPEN TO WORK",
      availability: "Available for projects",
      lantern: "#10b981",
    });
    assert.deepEqual(signCopy("busy"), {
      headline: "BACK SOON",
      kicker: "BUSY",
      availability: "Busy · not taking new projects",
      lantern: "#ffc27a",
    });
  });

  it("keeps ink on cream and the tiles' paint on ink at AAA contrast", () => {
    assert.ok(contrast(GARDEN_SIGN.board, GARDEN_SIGN.ink) >= 7);
    assert.ok(contrast(SIGN_FACE.tiles.ink, SIGN_FACE.tiles.paint) >= 7);
  });
});

describe("garden sign flip tiles", () => {
  it("rotates four messages from the site copy, ending with the city", () => {
    assert.deepEqual(SIGN_MESSAGES, [
      "TypeScript full-stack",
      "Building Three Labs",
      "React · Next.js · NestJS",
      "Based in Bogotá",
    ]);
  });

  it("holds each line 3 s and flips it briefly at the end", () => {
    assert.equal(SIGN_FLIP.hold, 3);
    assert.ok(SIGN_FLIP.flip > 0.1 && SIGN_FLIP.flip <= 0.4);
    assert.deepEqual(signTile(0, false), { index: 0, scale: 1 });
    assert.deepEqual(signTile(1.5, false), { index: 0, scale: 1 });
    assert.deepEqual(signTile(3, false), { index: 1, scale: 1 });
    assert.deepEqual(signTile(6.2, false), { index: 2, scale: 1 });
    assert.equal(signTile(9.1, false).index, 3);
    // Wraps back to the first.
    assert.equal(signTile(12.1, false).index, 0);
    // The flip folds the old line shut, then opens the next one.
    const start = SIGN_FLIP.hold - SIGN_FLIP.flip;
    const closing = signTile(start + SIGN_FLIP.flip * 0.25, false);
    assert.equal(closing.index, 0);
    assert.ok(closing.scale > 0 && closing.scale < 1);
    const shut = signTile(start + SIGN_FLIP.flip / 2, false);
    assert.ok(shut.scale < 1e-6);
    const opening = signTile(start + SIGN_FLIP.flip * 0.75, false);
    assert.equal(opening.index, 1);
    assert.ok(opening.scale > 0 && opening.scale < 1);
    for (let t = 0; t < 12; t += 0.01) {
      const tile = signTile(t, false);
      assert.ok(tile.scale >= 0 && tile.scale <= 1);
      assert.ok(tile.index >= 0 && tile.index < SIGN_MESSAGES.length);
    }
  });

  it("never animates under reduced motion and changes the line slowly", () => {
    assert.ok(SIGN_FLIP.reducedHold >= 2 * SIGN_FLIP.hold);
    for (let t = 0; t < 40; t += 0.05) assert.equal(signTile(t, true).scale, 1);
    assert.equal(signTile(SIGN_FLIP.reducedHold - 0.01, true).index, 0);
    assert.equal(signTile(SIGN_FLIP.reducedHold, true).index, 1);
  });

  it("wakes the demand frameloop only for the flips", () => {
    // Resting: the next flip is the wake-up.
    assert.ok(
      Math.abs(signTileWake(0, false) - (SIGN_FLIP.hold - SIGN_FLIP.flip)) <
        EPS,
    );
    // Flipping: every frame.
    assert.equal(signTileWake(SIGN_FLIP.hold - SIGN_FLIP.flip / 2, false), 0);
    // Reduced motion: only when the line changes.
    assert.ok(
      Math.abs(signTileWake(1, true) - (SIGN_FLIP.reducedHold - 1)) < EPS,
    );
  });
});

describe("garden sign face", () => {
  // A stand-in for canvas measureText: 0.6 em per character.
  const measure = (line: string, size: number) => line.length * size * 0.6;

  it("is drawn on a canvas sharp enough for the close-up, in the panel's shape", () => {
    const [w, h] = SIGN_FACE.canvas;
    assert.ok(w >= 2048, "crisp at the close-up");
    assert.ok(Math.abs(w / h - SIGN_PANEL.width / SIGN_PANEL.height) < 0.02);
  });

  it("stacks the headline, the name line and the tile strip inside the rule", () => {
    const [w, h] = SIGN_FACE.canvas;
    const { rule, headline, who, tiles } = SIGN_FACE;
    assert.ok(rule.inset > 0 && rule.inset < 0.05 * w);
    assert.ok(headline.y < who.y && who.y < tiles.y);
    assert.ok(tiles.y + tiles.height < h - rule.inset);
    assert.ok(headline.y - headline.maxSize / 2 > rule.inset);
    for (const region of [headline, who])
      assert.ok(region.width <= w - 2 * rule.inset);
    assert.ok(tiles.x > rule.inset && tiles.x + tiles.width < w - rule.inset);
    assert.equal(
      SIGN_FACE.who.text,
      `${SIGN_PROFILE.name} · ${SIGN_PROFILE.role}`,
    );
  });

  it("fits each headline on one big line and shrinks only what overflows", () => {
    const { headline } = SIGN_FACE;
    for (const status of ["open", "busy"] as const) {
      const text = signCopy(status).headline;
      const size = fitLine(text, measure, headline.width, headline.maxSize);
      assert.ok(size >= 0.8 * headline.maxSize, `${status} ${size}`);
      assert.ok(measure(text, size) <= headline.width);
    }
    const long = "x".repeat(200);
    const small = fitLine(long, measure, 600, 100, 20);
    assert.equal(small, 20, "never below the minimum");
    assert.equal(fitLine("ok", measure, 600, 100), 100);
  });

  it("puts the moving tile line exactly over the strip painted on the face", () => {
    const [w, h] = SIGN_FACE.canvas;
    const { tiles } = SIGN_FACE;
    const px = SIGN_PANEL.width / w;
    assert.ok(Math.abs(SIGN_TILE_PANEL.width - tiles.width * px) < 1e-6);
    assert.ok(Math.abs(SIGN_TILE_PANEL.height - tiles.height * px) < 1e-6);
    const [x, y, z] = SIGN_TILE_PANEL.center;
    const [cx, cy, cz] = SIGN_PANEL.center;
    assert.ok(
      Math.abs(x - (cx + (tiles.x + tiles.width / 2 - w / 2) * px)) < 1e-6,
    );
    assert.ok(
      Math.abs(y - (cy - (tiles.y + tiles.height / 2 - h / 2) * px)) < 1e-6,
    );
    // In front of the face, close enough to read as painted on it.
    assert.ok(z > cz && z - cz < 0.003);
  });
});

describe("garden sign lantern", () => {
  it("hangs on a bracket from the right post, inside the sign's footprint", () => {
    const parts = signParts();
    assert.ok(parts.some((p) => p.role === "lantern-bracket"));
    assert.ok(parts.some((p) => p.role === "lantern-frame"));
    const right = parts.find((p) => p.role === "post" && p.center[0] > 0);
    assert.ok(right);
    const [x, y] = SIGN_LANTERN.glass.center;
    assert.ok(x > right.center[0], "right of the right post");
    // Below the board's bottom rail, above the grass.
    assert.ok(y < 0.41 && y - SIGN_LANTERN.glass.size[1] / 2 > 0.1);
    assert.ok(
      x + SIGN_LANTERN.body.size[0] / 2 < GARDEN_PROPS.sign.radius,
      "inside the prop radius that clears the nature",
    );
  });

  it("glows by status, softly at night only, behind the scene's master power", () => {
    for (const status of ["open", "busy"] as const) {
      const day = signLanternGlow(13, true, status);
      const night = signLanternGlow(23, true, status);
      const off = signLanternGlow(23, false, status);
      assert.equal(day.color, signCopy(status).lantern);
      // Mounted at zero by day and with the power off.
      assert.equal(day.intensity, 0);
      assert.equal(off.intensity, 0);
      assert.equal(night.intensity, SIGN_LANTERN.light.intensity);
      // Soft: under the wall lanterns' 1.7 cd and a short reach.
      assert.ok(SIGN_LANTERN.light.intensity <= 0.8);
      assert.ok(SIGN_LANTERN.light.distance <= 2);
      // The glass reads its status colour by day, brighter at night.
      assert.ok(day.emissive > 0 && night.emissive > day.emissive);
    }
    // The 18:00 night gate, like the other lights.
    assert.equal(signLanternGlow(17.99, true, "open").intensity, 0);
    assert.ok(signLanternGlow(18, true, "open").intensity > 0);
    assert.ok(signLanternGlow(5.5, true, "open").intensity > 0);
  });
});

describe("garden sign card content (no invented facts)", () => {
  const about = portfolioBuffers({ projects: [], experience: [] }).about;

  it("names the owner and role from the site copy", () => {
    assert.equal(SIGN_PROFILE.name, "Kevin Londoño");
    assert.equal(SIGN_PROFILE.handle, "KEVNNARD");
    assert.equal(SIGN_PROFILE.role, "Software Engineer");
    assert.equal(SIGN_PROFILE.summary, about.summary);
    const aboutMe = source("src/components/page/AboutMe.astro");
    assert.match(aboutMe, /Kevin Londoño/);
    assert.match(aboutMe, /KEVNNARD/);
  });

  it("chips only the core stack the Skills section lists", () => {
    const skills = source("src/components/page/Skills.astro");
    const core = [
      ...skills.matchAll(/name: "([^"]+)",[^}]*level: "core"/g),
    ].map((m) => m[1]);
    assert.ok(
      SIGN_PROFILE.stack.length >= 6 && SIGN_PROFILE.stack.length <= 10,
    );
    for (const chip of SIGN_PROFILE.stack)
      assert.ok(core.includes(chip), `${chip} is not a core skill`);
  });

  it("links LinkedIn, GitHub and both CVs from the site, https only", () => {
    const byLabel = (label: string) =>
      CONTACT_LINKS.find((link) => link.label === label)?.href;
    assert.deepEqual(
      SIGN_PROFILE.links.map((link) => link.label),
      ["LinkedIn", "GitHub", "CV English", "CV Español"],
    );
    assert.equal(SIGN_PROFILE.links[0].href, byLabel("LinkedIn"));
    assert.equal(SIGN_PROFILE.links[1].href, byLabel("GitHub"));
    assert.deepEqual(SIGN_PROFILE.links.slice(2), about.links);
    for (const link of SIGN_PROFILE.links)
      assert.match(link.href, /^https:\/\//);
  });

  it("shows the owner's email and city", () => {
    assert.equal(SIGN_PROFILE.email, "kevnnard.labs@gmail.com");
    assert.equal(SIGN_PROFILE.city, "Bogotá, Colombia");
    assert.ok(!("roles" in SIGN_PROFILE), "no Now block");
  });
});

/* ------------------------------------------------------------------ */
/* The close-up                                                        */
/* ------------------------------------------------------------------ */

function project(
  pose: { eye: Vec3; target: Vec3; fov: number },
  point: readonly number[],
  aspect: number,
) {
  const forward = pose.target.map((v, i) => v - pose.eye[i]);
  const f = Math.hypot(...forward);
  const fwd = forward.map((v) => v / f);
  const rightRaw = [-fwd[2], 0, fwd[0]];
  const r = Math.hypot(...rightRaw);
  const right = rightRaw.map((v) => v / r);
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const d = point.map((v, i) => v - pose.eye[i]);
  const depth = d.reduce((sum, v, i) => sum + v * fwd[i], 0);
  const tan = Math.tan(((pose.fov / 2) * Math.PI) / 180);
  return {
    x: d.reduce((sum, v, i) => sum + v * right[i], 0) / (depth * tan * aspect),
    y: d.reduce((sum, v, i) => sum + v * up[i], 0) / (depth * tan),
    depth,
  };
}

/** The sign's silhouette in world space: cap, posts, board, lantern. */
const SIGN_OUTLINE: Vec3[] = (
  [
    [-0.42, 0.925, 0.055],
    [0.42, 0.925, 0.055],
    [-0.34, 0, 0],
    [0.34, 0, 0],
    [-0.38, 0.43, 0.03],
    [0.38, 0.43, 0.03],
    [
      SIGN_LANTERN.body.center[0] + SIGN_LANTERN.body.size[0] / 2,
      SIGN_LANTERN.body.center[1] - SIGN_LANTERN.body.size[1] / 2,
      0,
    ],
  ] as Vec3[]
).map(signWorld);

/** The face's corners and the lantern glass: what the lens must see. */
const SIGHTS: Vec3[] = (
  [
    [-0.33, 0.77, 0.022],
    [0.33, 0.77, 0.022],
    [-0.33, 0.47, 0.022],
    [0.33, 0.47, 0.022],
    SIGN_LANTERN.glass.center,
  ] as Vec3[]
).map(signWorld);

const NATURE = clearOfGarden(islandLayout(ISLAND.seed));
const FLOWERS = clearOfGarden(flowerLayout(NATURE, ISLAND.seed), 0.06);

describe("garden sign close-up (sign-shot.ts)", () => {
  const aspect = 1440 / 900;
  const home = () => ({
    eye: poseToPosition(guidePose(aspect)) as Vec3,
    target: GUIDE.target,
    fov: GUIDE.fov,
  });

  it("times like the other cinematic shots; reduced motion cuts", () => {
    assert.equal(SIGN_SHOT.duration, CINEMATIC.duration);
    assert.equal(SIGN_SHOT.leaveDuration, CINEMATIC.leaveDuration);
    assert.ok(SIGN_SHOT.leaveDuration < SIGN_SHOT.duration);
    assert.equal(signShotProgress(0, true), 1);
    assert.equal(signShotProgress(0, true, true), 1);
    assert.equal(signShotProgress(SIGN_SHOT.duration / 2, false), 0.5);
    assert.equal(signShotProgress(SIGN_SHOT.leaveDuration, false, true), 1);
  });

  it("frames the whole sign in the free space left of the card, big enough to read", () => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1920, 1080],
      [1100, 800],
    ]) {
      const ratio = width / height;
      const shift = signShotShift(width, ratio);
      assert.ok(shift > 0);
      const end = signShotAt(1, home(), shift);
      const points = SIGN_OUTLINE.map((p) => project(end, p, ratio));
      const card =
        width <= STORY_CARD.narrowBelow
          ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
          : STORY_CARD.width + STORY_CARD.inset;
      const cardLeft = 1 - (2 * card) / width;
      for (const p of points) {
        assert.ok(p.depth > 0.5);
        assert.ok(p.x < cardLeft - 0.03, `${width}: under the card ${p.x}`);
        assert.ok(p.x > -0.97 && Math.abs(p.y) < 0.97, `${width}: cut off`);
      }
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
      const free = (-1 + cardLeft) / 2;
      assert.ok(Math.abs(centre - free) < 0.12, `${width}: off centre`);
      // The sign stands at least half the frame's height.
      assert.ok((Math.max(...ys) - Math.min(...ys)) / 2 > 0.5, `${width}`);
    }
    // The card stacks above the sign on narrow screens: no slide.
    assert.equal(signShotShift(STORY_CARD.stackBelow, 0.6), 0);
  });

  it("ends in front of the sign, slightly off its face, with a narrower lens", () => {
    const end = signShotAt(1, home(), 0);
    assert.equal(end.fov, SIGN_SHOT.fov);
    assert.ok(SIGN_SHOT.fov < GUIDE.fov);
    const [sx, , sz] = signWorld([0, 0, 0]);
    const out = [end.eye[0] - sx, end.eye[2] - sz];
    // The face looks along +z: the lens is in front, from the lantern side.
    assert.ok(out[1] > 0 && out[0] > 0);
    const cos = out[1] / Math.hypot(...out);
    assert.ok(cos > 0.75 && cos < 0.99, `${cos}`);
    assert.ok(end.eye[1] > 0.6 && end.eye[1] < 1.4, `${end.eye[1]}`);
  });

  it("keeps the lens in the open yard with a clear view of the face and lantern", () => {
    for (const [width, height] of [
      [1440, 900],
      [1100, 800],
      [2560, 1080],
      [600, 900],
    ]) {
      const shift = signShotShift(width, width / height);
      const { eye } = signShotAt(1, home(), shift);
      assert.ok(insideIsland(eye[0], eye[2], 0.3), "past the rim");
      for (const rect of HOUSE_FOOTPRINT)
        assert.ok(
          !(
            eye[0] > rect.x0 - 0.3 &&
            eye[0] < rect.x1 + 0.3 &&
            eye[2] > rect.z0 - 0.3 &&
            eye[2] < rect.z1 + 0.3
          ),
          `in ${rect.id}`,
        );
      for (const item of NATURE) {
        const reach = KIND_SPECS[item.kind].radius * item.scale;
        const tall = KIND_SPECS[item.kind].height * item.scale;
        const gap =
          Math.hypot(eye[0] - item.position[0], eye[2] - item.position[2]) -
          reach;
        if (tall > 0.15) assert.ok(gap > 0.05, `${width}: in a ${item.kind}`);
        // Nothing taller than the line of sight stands on it.
        for (const sight of SIGHTS)
          for (let s = 0.02; s < 1; s += 0.02) {
            const p = eye.map((v, i) => v + (sight[i] - v) * s);
            if (p[1] > tall) continue;
            const d = Math.hypot(
              p[0] - item.position[0],
              p[2] - item.position[2],
            );
            assert.ok(d > reach * 0.85, `${width}: a ${item.kind} in the way`);
          }
      }
      for (const flower of FLOWERS)
        assert.ok(
          Math.hypot(eye[0] - flower.position[0], eye[2] - flower.position[2]) >
            0.1,
        );
    }
  });

  it("dollies in on an eased arc and leaves the same way, never through the ground", () => {
    const from = home();
    const start = signShotAt(0, from, 0);
    assert.deepEqual(start.eye, from.eye);
    assert.deepEqual(start.target, from.target);
    const end = signShotAt(1, from, 0);
    const early = signShotAt(0.05, from, 0);
    const step = Math.hypot(...early.eye.map((v, i) => v - start.eye[i]));
    const total = Math.hypot(...end.eye.map((v, i) => v - start.eye[i]));
    assert.ok(step < total * 0.01);
    const mid = signShotAt(0.5, from, 0);
    const line = start.eye.map((v, i) => (v + end.eye[i]) / 2);
    assert.ok(Math.hypot(mid.eye[0] - line[0], mid.eye[2] - line[2]) > 0.05);
    for (let t = 0; t <= 1; t += 0.05)
      assert.ok(signShotAt(t, from, 0).eye[1] > 0.4);
    assert.deepEqual(signLeaveAt(0, from, 0), end);
    assert.deepEqual(signLeaveAt(1, from, 0), start);
    // Without a live pose it starts from a front-garden view.
    assert.deepEqual(signShotAt(0).eye, SIGN_START.eye);
  });

  it("is inspected like the desk things and Cherry, with the same end pose", () => {
    assert.equal(isDeskItemId("sign"), true);
    assert.equal(isDisplayCaseId("sign"), false);
    assert.ok(!(GALLERY_ORDER as readonly string[]).includes("sign"));
    const focus = galleryCaseFocus("sign");
    const end = signShotAt(1, SIGN_START, 0);
    assert.ok(focus.position.every((v, i) => Math.abs(v - end.eye[i]) < EPS));
    assert.ok(focus.target.every((v, i) => Math.abs(v - end.target[i]) < EPS));
    assert.equal(focus.fov, SIGN_SHOT.fov);
    assert.deepEqual(SIGN_VIEW.centre, SIGN_SHOT.target);
  });

  it("clicks on a box around the board, posts and lantern", () => {
    const [x, y, z] = SIGN_HITBOX.center;
    const [w, h, d] = SIGN_HITBOX.size;
    const inside = ([px, py, pz]: Vec3) =>
      Math.abs(px - x) <= w / 2 &&
      Math.abs(py - y) <= h / 2 &&
      Math.abs(pz - z) <= d / 2;
    assert.ok(inside([0, 0.62, 0.02]), "board");
    assert.ok(inside(SIGN_LANTERN.glass.center), "lantern");
    assert.ok(inside([-0.42, 0.92, 0]), "cap");
    assert.ok(w < 1.1 && h < 1.1, "just the sign");
  });
});

describe("garden sign wiring", () => {
  it("draws the board and the lantern in GardenSign, mounted from the garden", () => {
    const garden = source("src/components/world/Garden.tsx");
    assert.match(garden, /<GardenSign\b/);
    const sign = source("src/components/world/GardenSign.tsx");
    assert.match(sign, /new CanvasTexture\(/);
    assert.match(sign, /signTile\(/);
    assert.match(sign, /signTileWake\(/);
    assert.match(sign, /signLanternGlow\(/);
    assert.match(sign, /new PointLight\(/);
    assert.match(sign, /GARDEN_SIGN\.status/);
    // Clickable only in plain sight, like Cherry.
    assert.match(sign, /houseBlocks\(/);
    assert.match(sign, /cursor = "pointer"/);
    assert.match(sign, /onInspect\?\.\("sign"\)/);
    assert.match(sign, /event\.stopPropagation\(\)/);
  });

  it("plays the sign's cinematic shot from the scene's shot map", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(
      scene,
      /sign: \{\s*shotAt: signShotAt,\s*leaveAt: signLeaveAt,\s*progress: signShotProgress,\s*shift: signShotShift,?\s*\}/,
    );
    assert.match(scene, /reducedMotion=\{reducedMotion\}[\s\S]*?desk=\{desk\}/);
  });

  it("opens the compact card with the shared motion, framed left of it", () => {
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && galleryCase === "sign" \? "sign" : null,\s*SIGN_PROFILE,\s*reducedMotion,?\s*\)/,
    );
    assert.match(
      app,
      /signCards\.map\(\(card\) => \(\s*<SignCard\s+key=\{card\.key\}[\s\S]*?onPortfolio=\{enter\}[\s\S]*?state=\{card\.state\}\s*onMotionEnd=\{card\.onMotionEnd\}/,
    );
    assert.match(app, /galleryCase === "sign" \|\|/);
  });

  it("renders the compact card: status, role, pill, summary, chips, links, portfolio and back", () => {
    const card = source("src/components/world/SignCard.tsx");
    assert.match(card, /className="case-story sign-card"/);
    assert.match(card, /GARDEN SIGN/);
    assert.match(card, /signCopy\(status\)/);
    assert.match(card, /profile\.summary/);
    assert.match(card, /profile\.stack\.map/);
    assert.match(card, /profile\.links\.map/);
    assert.match(card, /target="_blank"/);
    assert.match(card, /rel="noopener noreferrer"/);
    assert.match(card, /See my portfolio/);
    assert.match(card, /Back to garden/);
    assert.match(card, /back\.current\?\.focus\(/);
    assert.match(card, /data-state=\{state\}/);
    assert.match(card, /inert=\{state === "leaving"\}/);
    assert.match(card, /onAnimationEnd=\{onMotionEnd\}/);
    // Compact: no Now block; email and city render only when set.
    assert.doesNotMatch(card, />\s*Now\s*</i);
    assert.match(card, /profile\.email &&/);
    assert.match(card, /profile\.city &&/);
    const css = source("src/components/world/sign-card.css");
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /@media \(max-width: 700px\)/);
  });
});
