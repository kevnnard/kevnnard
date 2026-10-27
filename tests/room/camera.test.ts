import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { focusView, overviewView, SCREENS } from "../../src/lib/room/camera.ts";

const room = { min: [-3.46, 0, -3.06], max: [3.47, 4.74, 3.0] } as const;
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("overviewView", () => {
  it("looks at the bounds center from the open (-x, +z) side, outside the room", () => {
    const view = overviewView(room, 45, 16 / 9);
    assert.deepEqual(
      view.target.map((v) => +v.toFixed(3)),
      [0.005, 2.37, -0.03],
    );
    assert.ok(view.position[0] < room.min[0]);
    assert.ok(view.position[2] > room.max[2]);
    assert.ok(view.position[1] > view.target[1]);
  });

  it("backs off further on portrait viewports so the room still fits", () => {
    const wide = overviewView(room, 45, 16 / 9);
    const tall = overviewView(room, 45, 9 / 16);
    assert.ok(
      dist(tall.position, tall.target) > dist(wide.position, wide.target),
    );
  });
});

describe("focusView", () => {
  it("places the camera in front of the PC screen along its facing normal", () => {
    const { position, target } = focusView(SCREENS.pc, 45, 16 / 9);
    assert.deepEqual(target, SCREENS.pc.position);
    // rotation y -1.53 faces -x, so the camera sits at smaller x, same height.
    assert.ok(position[0] < SCREENS.pc.position[0]);
    assert.ok(Math.abs(position[1] - SCREENS.pc.position[1]) < 1e-9);
    assert.ok(dist(position, target) > 0.3 && dist(position, target) < 2);
  });

  it("places the camera in front of the TV (+z) and further away on narrow screens", () => {
    const wide = focusView(SCREENS.tv, 45, 16 / 9);
    const narrow = focusView(SCREENS.tv, 45, 9 / 19);
    assert.ok(wide.position[2] > SCREENS.tv.position[2]);
    assert.ok(
      dist(narrow.position, narrow.target) > dist(wide.position, wide.target),
    );
  });
});
