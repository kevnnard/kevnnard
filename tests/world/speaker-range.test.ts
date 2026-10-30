// Speaker focus console (T3, S4): the listening range between the whole
// house and the initial view, measured from the real house footprint, the
// speaker pair and the guide's home pose. No metre value is invented.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GUIDE,
  guidePose,
  poseToPosition,
  type Vec3,
} from "../../src/lib/world/camera.ts";
import { HOUSE, HOUSE_FOOTPRINT } from "../../src/lib/world/house.ts";
import {
  SPEAKER_AUDIO,
  speakerDistance,
  speakerGain,
} from "../../src/lib/world/speaker.ts";
import {
  HOUSE_REACH,
  initialListener,
  LEGACY_REACH,
  listeningRange,
  rangeGain,
  rangeLabel,
  rangeReach,
} from "../../src/lib/world/speaker-range.ts";

const RIDGE = HOUSE.floorY + HOUSE.main.height + HOUSE.main.rise;
/** Every corner of the footprint (roof overhang, porch, driveway), ground to ridge. */
const HOUSE_POINTS: Vec3[] = HOUSE_FOOTPRINT.flatMap((r) =>
  [r.x0, r.x1].flatMap((x) =>
    [r.z0, r.z1].flatMap((z) =>
      [0, HOUSE.floorY, RIDGE].map((y) => [x, y, z] as Vec3),
    ),
  ),
);
const LAPTOP = 1440 / 900;
const PHONE = 375 / 812;

describe("listening range: the house (S4 minimum)", () => {
  it("reaches the farthest point of the house and its near exterior", () => {
    const farthest = Math.max(...HOUSE_POINTS.map(speakerDistance));
    assert.equal(HOUSE_REACH, farthest);
    // The legacy 6 m fade barely covers it: the far corners are near silent.
    assert.ok(HOUSE_REACH > 5 && HOUSE_REACH < SPEAKER_AUDIO.far);
  });

  it("is audible everywhere in the house at the minimum, silent far beyond", () => {
    for (const point of HOUSE_POINTS)
      assert.ok(
        rangeGain(speakerDistance(point), HOUSE_REACH) >= 0.5 - 1e-9,
        `audible at ${point.join(", ")}`,
      );
    assert.equal(rangeGain(HOUSE_REACH * 1.7, HOUSE_REACH), 0);
    assert.equal(rangeGain(0, HOUSE_REACH), 1);
  });
});

describe("listening range: the initial view (S4 maximum)", () => {
  for (const [name, aspect, orbit] of [
    ["laptop", LAPTOP, 28.27],
    ["phone", PHONE, 40],
  ] as const)
    it(`uses the guide's home pose on a ${name}, not the canvas default`, () => {
      const pose = guidePose(aspect);
      assert.ok(Math.abs(pose.distance - orbit) < 0.01);
      assert.deepEqual(initialListener(aspect), poseToPosition(pose));
      const range = listeningRange(initialListener(aspect));
      assert.equal(range.house, HOUSE_REACH);
      assert.equal(range.initial, speakerDistance(poseToPosition(pose)));
      assert.notEqual(range.initial, speakerDistance([20, 14, 20]));
      // The spawn point hears the music at the maximum, at half level.
      const spawn = speakerDistance(initialListener(aspect));
      const atMax = rangeGain(spawn, rangeReach(range, 1));
      assert.ok(Math.abs(atMax - 0.5) < 1e-9, `${atMax} at spawn`);
      // and not at the minimum.
      assert.equal(rangeGain(spawn, rangeReach(range, 0)), 0);
    });

  it("never falls below the house", () => {
    const inside: Vec3 = [...GUIDE.target] as unknown as Vec3;
    const range = listeningRange(inside);
    assert.equal(range.initial, HOUSE_REACH);
  });

  it("refuses a non-finite listener", () => {
    assert.throws(() => listeningRange([Number.NaN, 0, 0]), RangeError);
    assert.throws(() => initialListener(0), RangeError);
  });
});

describe("listening range: settings and the legacy fade", () => {
  const range = listeningRange(initialListener(LAPTOP));

  it("keeps speakerGain exactly at the legacy reach", () => {
    for (const d of [0, 1, 1.5, 2, 3.75, 5, 5.99, 6, 8, Number.NaN])
      assert.equal(rangeGain(d, LEGACY_REACH), speakerGain(d));
    assert.equal(LEGACY_REACH, (SPEAKER_AUDIO.near + SPEAKER_AUDIO.far) / 2);
  });

  it("interpolates the reach and clamps the setting", () => {
    assert.equal(rangeReach(range, 0), range.house);
    assert.equal(rangeReach(range, 1), range.initial);
    assert.equal(rangeReach(range, 0.5), (range.house + range.initial) / 2);
    assert.equal(rangeReach(range, -3), range.house);
    assert.equal(rangeReach(range, 7), range.initial);
    assert.equal(rangeReach(range, Number.NaN), range.house);
  });

  it("louder at a longer reach, never above full", () => {
    let previous = -1;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const gain = rangeGain(10, rangeReach(range, t));
      assert.ok(gain >= previous && gain <= 1);
      previous = gain;
    }
    assert.equal(rangeGain(5, Number.NaN), 0);
    assert.equal(rangeGain(5, 0), 0);
  });

  it("names the endpoints and shows only measured metres", () => {
    const house = rangeLabel(range, 0);
    assert.equal(house.name, "House");
    assert.equal(house.metres, `${range.house.toFixed(1)} m`);
    assert.equal(house.text, `House, ${range.house.toFixed(1)} m`);
    assert.equal(rangeLabel(range, 1).name, "Initial view");
    assert.equal(rangeLabel(range, 1).metres, `${range.initial.toFixed(1)} m`);
    const mid = rangeLabel(range, 0.5);
    assert.equal(mid.name, null);
    assert.equal(mid.text, `${rangeReach(range, 0.5).toFixed(1)} m`);
  });
});
