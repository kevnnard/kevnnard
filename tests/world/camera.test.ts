import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampPose,
  GUIDE,
  guideMotion,
  guidePose,
  poseToPosition,
} from "../../src/lib/world/camera.ts";

describe("guided island camera", () => {
  it("starts on a three-quarter view: front-right, looking down at the island", () => {
    const home = guidePose(16 / 9);
    assert.ok(home.azimuth > 0.5 && home.azimuth < 1.1, "front-right quarter");
    assert.ok(home.polar > 0.8 && home.polar < 1.25, "above the horizon");
    const [x, y, z] = poseToPosition(home);
    assert.ok(x > 0 && z > 0 && y > GUIDE.target[1]);
  });

  it("keeps orbit and zoom gentle: small arcs around the home pose", () => {
    const { limits } = GUIDE;
    assert.ok(limits.maxAzimuth - limits.minAzimuth <= Math.PI / 2);
    assert.ok(limits.maxPolar - limits.minPolar <= 0.6);
    assert.ok(limits.maxPolar < Math.PI / 2, "never below the island rim");
    assert.ok(limits.maxDistance / limits.minDistance <= 1.8);
  });

  it("clamps every axis into its limits", () => {
    const { limits } = GUIDE;
    const wild = clampPose({ azimuth: 9, polar: 3, distance: 500 });
    assert.equal(wild.azimuth, limits.maxAzimuth);
    assert.equal(wild.polar, limits.maxPolar);
    assert.equal(wild.distance, limits.maxDistance);
    const low = clampPose({ azimuth: -9, polar: 0, distance: 0 });
    assert.equal(low.azimuth, limits.minAzimuth);
    assert.equal(low.polar, limits.minPolar);
    assert.equal(low.distance, limits.minDistance);
  });

  it("backs off on portrait screens but stays inside the zoom range", () => {
    const wide = guidePose(16 / 9);
    const tall = guidePose(9 / 16);
    assert.ok(tall.distance > wide.distance);
    for (const pose of [wide, tall, guidePose(0.2), guidePose(5)])
      assert.deepEqual(pose, clampPose(pose));
  });

  it("respects reduced motion: no smoothing, no idle drift", () => {
    const calm = guideMotion(true);
    assert.equal(calm.smoothTime, 0);
    assert.equal(calm.draggingSmoothTime, 0);
    assert.equal(calm.drift, false);
    const lively = guideMotion(false);
    assert.ok(lively.smoothTime > 0);
    assert.equal(lively.drift, true);
  });

  it("rejects non-finite poses", () => {
    assert.throws(
      () => clampPose({ azimuth: Number.NaN, polar: 1, distance: 10 }),
      RangeError,
    );
  });
});
