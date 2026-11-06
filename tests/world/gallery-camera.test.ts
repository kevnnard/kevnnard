import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { guidePose, poseToPosition } from "../../src/lib/world/camera.ts";
import {
  DISPLAY_CASE,
  DISPLAY_CASES,
  DISPLAY_LIFT,
  ITEM_FLOOR_Y,
} from "../../src/lib/world/display-cases.ts";
import {
  galleryCaseFocus,
  galleryStoryShift,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import { LIVING_MODELS, modelBounds } from "../../src/lib/world/living.ts";

describe("gallery inspection camera", () => {
  it("keeps the original exterior home until a case is clicked", () => {
    const scene = readFileSync(
      new URL("../../src/components/world/WorldScene.tsx", import.meta.url),
      "utf8",
    );
    const home = poseToPosition(guidePose(16 / 9));
    assert.ok(home[2] > DISPLAY_CASES[1].base[2]);
    assert.match(scene, /poseToPosition\(guidePose\(aspect\)\)/);
    assert.match(
      scene,
      /onArrive=\{focus && closeUp === "terminal" \? onMonitorArrive : undefined\}/,
    );
  });
  it("enters inspection on first click without toggling the spot", () => {
    const cases = readFileSync(
      new URL("../../src/components/world/DisplayCases.tsx", import.meta.url),
      "utf8",
    );
    const app = readFileSync(
      new URL("../../src/components/world/WorldApp.tsx", import.meta.url),
      "utf8",
    );
    assert.match(
      cases,
      /if \(focused\) toggle\(\);\s*else onInspect\?\.\(item\.id\)/,
    );
    assert.match(
      app,
      /ready && entered && galleryCase && !focus && !portrait && !speakers/,
    );
  });
  it("targets each real case from inside the room", () => {
    for (const item of DISPLAY_CASES) {
      const { position, target } = galleryCaseFocus(item.id);
      assert.equal(target[0], item.base[0]);
      assert.ok(position[2] < item.base[2]);
    }
  });

  it("looks at each model from its own level, over the sofa (collection-display-models T8)", () => {
    const sofaModel = LIVING_MODELS.find((model) => model.kind === "sofa");
    assert.ok(sofaModel, "sofa");
    const sofa = modelBounds(sofaModel);
    for (const item of DISPLAY_CASES) {
      const { position, target } = galleryCaseFocus(item.id);
      // The lifted model's centre (T9): riser, half the fitted height, lift.
      const centre =
        item.base[1] +
        ITEM_FLOOR_Y +
        DISPLAY_CASE.itemFit.height / 2 +
        DISPLAY_LIFT.height;
      assert.ok(Math.abs(target[1] - centre) < 1e-9, `target ${target[1]}`);
      assert.ok(
        Math.abs(position[1] - target[1]) <= 0.08,
        `eye ${position[1]} vs model ${target[1]}`,
      );
      // The sight line still clears the sofa's backrest.
      const t = (sofa.z1 - position[2]) / (target[2] - position[2]);
      const sight = position[1] + (target[1] - position[1]) * t;
      assert.ok(
        sight > sofa.y1 + 0.1,
        `sight ${sight} over backrest ${sofa.y1}`,
      );
    }
  });

  it("hides the portfolio link and menu while a case is inspected (T8)", () => {
    const app = readFileSync(
      new URL("../../src/components/world/WorldApp.tsx", import.meta.url),
      "utf8",
    );
    assert.match(
      app,
      /inert=\{\s*!entered \|\| focus \|\| portrait \|\| speakers \|\| galleryCase !== null\s*\}/,
    );
    assert.match(
      app,
      /!entered \|\| focus \|\| portrait \|\| speakers \|\| galleryCase !== null \? " invisible"/,
    );
  });
});

describe("story framing (collection-display-models T12)", () => {
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
  const dot = (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i], 0);
  const len = (a: number[]) => Math.sqrt(dot(a, a));

  it("slides camera and target together, sideways, toward screen right", () => {
    for (const item of DISPLAY_CASES) {
      const base = galleryCaseFocus(item.id);
      const moved = galleryCaseFocus(item.id, 0.27);
      const shiftEye = sub(moved.position, base.position);
      const shiftAim = sub(moved.target, base.target);
      assert.deepEqual(
        shiftEye.map((v) => v.toFixed(9)),
        shiftAim.map((v) => v.toFixed(9)),
        "same slide for eye and aim",
      );
      assert.ok(Math.abs(len(shiftEye) - 0.27) < 1e-9, "by the shift");
      assert.equal(shiftEye[1], 0, "level");
      const view = sub(base.target, base.position);
      assert.ok(Math.abs(dot(shiftEye, view)) < 1e-9, "perpendicular to view");
      // Looking toward +z, screen right is world -x.
      assert.ok(shiftEye[0] < 0, "toward screen right");
      assert.deepEqual(galleryCaseFocus(item.id, 0), base);
    }
  });

  it("frames the model in the free space left of the story card", () => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [1024, 768],
    ]) {
      const aspect = width / height;
      const shift = galleryStoryShift(width, aspect);
      const card =
        width <= STORY_CARD.narrowBelow
          ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
          : STORY_CARD.width + STORY_CARD.inset;
      // The model lands at the centre of the uncovered left part.
      const { position, target } = galleryCaseFocus("football-helmet", shift);
      const distance = len(sub(target, position));
      const halfWidth =
        distance *
        Math.tan(
          ((galleryCaseFocus("football-helmet").fov / 2) * Math.PI) / 180,
        ) *
        aspect;
      const modelX = -shift / halfWidth;
      const freeCentre = 1 - card / width - 1;
      assert.ok(
        Math.abs(modelX - freeCentre) < 1e-9,
        `${width}x${height}: model ${modelX} vs free ${freeCentre}`,
      );
    }
    // Stacked above the model on narrow screens: no slide.
    assert.equal(galleryStoryShift(STORY_CARD.stackBelow, 0.5), 0);
  });

  it("keeps the card geometry in step with its stylesheet", () => {
    const css = readFileSync(
      new URL("../../src/components/world/case-story.css", import.meta.url),
      "utf8",
    );
    assert.match(css, new RegExp(`width: ${STORY_CARD.width}px`));
    assert.match(css, new RegExp(`right: ${STORY_CARD.inset}px`));
    assert.match(css, new RegExp(`width: ${STORY_CARD.narrowWidth}px`));
    assert.match(css, new RegExp(`right: ${STORY_CARD.narrowInset}px`));
    assert.match(css, new RegExp(`max-width: ${STORY_CARD.narrowBelow}px`));
    assert.match(css, new RegExp(`max-width: ${STORY_CARD.stackBelow}px`));
  });

  it("frames left only while the case's story card is open", () => {
    const app = readFileSync(
      new URL("../../src/components/world/WorldApp.tsx", import.meta.url),
      "utf8",
    );
    assert.match(app, /galleryStory=\{caseStory !== null && storyOpen\}/);
    assert.match(app, /open=\{storyOpen\}/);
    assert.match(app, /onOpenChange=\{setStoryOpen\}/);
    const scene = readFileSync(
      new URL("../../src/components/world/WorldScene.tsx", import.meta.url),
      "utf8",
    );
    // The viewport width, never the portrait close-up's local `width`,
    // which is 0 outside the portrait view and would cancel the slide.
    assert.match(
      scene,
      /const viewportWidth = useThree\(\(state\) => state\.size\.width\);/,
    );
    assert.match(
      scene,
      /galleryCaseFocus\(\s*galleryCase,\s*galleryStory\s*\?\s*galleryStoryShift\(viewportWidth, aspect, galleryCase\)\s*:\s*0,?\s*\)/,
    );
  });
});
