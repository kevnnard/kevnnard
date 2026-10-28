import assert from "node:assert/strict";
import { it } from "node:test";
import {
  debrisFootprint,
  forestDebris,
} from "../../src/lib/room/forest-debris.ts";
import {
  forestTrees,
  mountainHeight,
  WALK_DISC,
} from "../../src/lib/room/forest-layout.ts";
import { EYE_HEIGHT, VIEW_ZONE } from "../../src/lib/room/forest-view.ts";
import { LEVELS, ROOM_BOUNDS } from "../../src/lib/room/house-layout.ts";
import { WALK, WALK_AREA } from "../../src/lib/room/walk-camera.ts";

it("derives the walk area and forest clearance from one shared view zone", () => {
  assert.deepEqual([WALK_DISC.x, WALK_DISC.z], [...VIEW_ZONE.center]);
  assert.equal(WALK_DISC.radius, VIEW_ZONE.radius);
  assert.deepEqual(WALK_AREA.center, VIEW_ZONE.center);
  assert.equal(WALK_AREA.radius, VIEW_ZONE.radius);
  assert.deepEqual(WALK_AREA.spawn, VIEW_ZONE.home);
  assert.equal(WALK.eyeHeight, EYE_HEIGHT);
  assert.equal(WALK_AREA.eyeY, LEVELS.terrainTop + EYE_HEIGHT);
  // Terrain stays flat throughout the restricted movement area.
  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const x = WALK_AREA.center[0] + Math.cos(angle) * WALK_AREA.radius;
    const z = WALK_AREA.center[1] + Math.sin(angle) * WALK_AREA.radius;
    assert.equal(mountainHeight(x, z), 0);
  }
});

it("keeps the walk zone small, in front of the open cutaway and clear of the room", () => {
  const room = [0, 2].map((i) => (ROOM_BOUNDS.min[i] + ROOM_BOUNDS.max[i]) / 2);
  const [cx, cz] = VIEW_ZONE.center;
  const away = Math.hypot(cx - room[0], cz - room[1]);
  // A few steps of movement, not the whole plot.
  assert.ok(VIEW_ZONE.radius >= 2 && VIEW_ZONE.radius <= 4);
  // On the -x/+z diagonal the cutaway opens toward.
  const direction = Math.atan2(cz - room[1], cx - room[0]);
  assert.ok(Math.abs(direction - (Math.PI * 3) / 4) < 0.15);
  assert.ok(away - VIEW_ZONE.radius > 8, "safe distance from the house");
  for (const blocker of WALK_AREA.blockers) {
    const nx = Math.min(Math.max(cx, blocker.min[0]), blocker.max[0]);
    const nz = Math.min(Math.max(cz, blocker.min[1]), blocker.max[1]);
    assert.ok(Math.hypot(nx - cx, nz - cz) > VIEW_ZONE.radius);
  }
  const [hx, hz] = VIEW_ZONE.home;
  assert.ok(Math.hypot(hx - cx, hz - cz) < VIEW_ZONE.radius);
});

it("keeps complete debris footprints and tree bases outside the walk zone", () => {
  const distance = ({ x, z }: { x: number; z: number }) =>
    Math.hypot(x - WALK_AREA.center[0], z - WALK_AREA.center[1]);
  for (const piece of forestDebris()) {
    assert.ok(
      distance(piece) - debrisFootprint(piece) >
        WALK_AREA.radius + WALK.bodyRadius,
      `${piece.kind} must not overlap the camera's reachable area`,
    );
  }
  for (const tree of forestTrees()) {
    assert.ok(
      distance(tree) > WALK_AREA.radius + 1.2,
      "reserve trunk-base clearance rather than adding forest physics",
    );
  }
});
