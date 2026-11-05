import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { guidePose, poseToPosition } from "../../src/lib/world/camera.ts";
import { DISPLAY_CASES } from "../../src/lib/world/display-cases.ts";
import { galleryCaseFocus } from "../../src/lib/world/gallery-camera.ts";

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
      assert.ok(position[1] > target[1]);
      assert.ok(position[2] < item.base[2]);
    }
  });
});
