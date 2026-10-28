// CPU composition checks with the real three.js camera at the home pose.
// They prove where scenery projects on screen, not how the GPU renders it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import {
  DEBRIS_MODELS,
  type DebrisPiece,
  forestDebris,
} from "../../src/lib/room/forest-debris.ts";
import { lowFogFactor } from "../../src/lib/room/forest-fog.ts";
import {
  type ForestTree,
  forestTrees,
  mountainHeight,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import { ROOM_BOUNDS } from "../../src/lib/room/house-layout.ts";
import {
  homePose,
  WALK_AREA,
  walkView,
} from "../../src/lib/room/walk-camera.ts";

const LANDSCAPE = [16 / 9, 4 / 3];
// Conservative tree silhouette from the shipped models: trunk radius about
// 5% of the height up to the lowest branches at 30%, canopy radius 25% above.
const TRUNK = 0.05;
const CANOPY = 0.25;
const BRANCHES = 0.3;

type P = readonly [number, number, number];

function homeCamera(aspect: number) {
  const { position, target } = walkView(
    WALK_AREA,
    homePose(WALK_AREA, 45, aspect),
  );
  const camera = new PerspectiveCamera(45, aspect, 0.05, WORLD.far);
  camera.position.fromArray(position);
  camera.lookAt(new Vector3().fromArray(target));
  camera.updateMatrixWorld();
  return camera;
}

const project = (camera: PerspectiveCamera, p: P) =>
  new Vector3(...p).project(camera);
const distance = (camera: PerspectiveCamera, p: P) =>
  camera.position.distanceTo(new Vector3(...p));

const ROOM_CORNERS: P[] = Array.from({ length: 8 }, (_, bits) => [
  bits & 1 ? ROOM_BOUNDS.max[0] : ROOM_BOUNDS.min[0],
  bits & 2 ? ROOM_BOUNDS.max[1] : ROOM_BOUNDS.min[1],
  bits & 4 ? ROOM_BOUNDS.max[2] : ROOM_BOUNDS.min[2],
]);

function roomRect(camera: PerspectiveCamera) {
  const ndc = ROOM_CORNERS.map((corner) => project(camera, corner));
  return {
    minX: Math.min(...ndc.map((p) => p.x)),
    maxX: Math.max(...ndc.map((p) => p.x)),
    minY: Math.min(...ndc.map((p) => p.y)),
    maxY: Math.max(...ndc.map((p) => p.y)),
    // The open front floor corner: the interior is seen above it.
    floorY: project(camera, [
      ROOM_BOUNDS.min[0],
      ROOM_BOUNDS.min[1],
      ROOM_BOUNDS.max[2],
    ]).y,
    far: Math.max(...ROOM_CORNERS.map((corner) => distance(camera, corner))),
  };
}

const ground = (x: number, z: number) => WORLD.groundY + mountainHeight(x, z);

function treePoints(tree: ForestTree): P[] {
  const points: P[] = [];
  const base = ground(tree.x, tree.z);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const radius = (t < BRANCHES ? TRUNK : CANOPY) * tree.height;
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      points.push([
        tree.x + Math.cos(angle) * radius,
        base + t * tree.height,
        tree.z + Math.sin(angle) * radius,
      ]);
    }
  }
  return points;
}

/** Corners of the placed, yawed, partly buried model box. */
function debrisPoints(piece: DebrisPiece): P[] {
  const [sx, sy, sz] = DEBRIS_MODELS[piece.kind][piece.variant].size;
  const bottom = piece.y - piece.burial * sy * piece.scale;
  const cos = Math.cos(piece.yaw);
  const sin = Math.sin(piece.yaw);
  const points: P[] = [];
  for (const dx of [-sx / 2, sx / 2])
    for (const dz of [-sz / 2, sz / 2])
      for (const y of [piece.y, bottom + sy * piece.scale]) {
        const lx = dx * piece.scale;
        const lz = dz * piece.scale;
        points.push([
          piece.x + lx * cos + lz * sin,
          y,
          piece.z - lx * sin + lz * cos,
        ]);
      }
  return points;
}

/** Fraction of the frame covered by the clipped NDC bounding box. */
function screenArea(camera: PerspectiveCamera, points: P[]) {
  const ndc = points.map((p) => project(camera, p));
  if (ndc.some((p) => p.z >= 1 || p.z <= -1)) return 0;
  const clip = (v: number) => Math.min(1, Math.max(-1, v));
  const w =
    clip(Math.max(...ndc.map((p) => p.x))) -
    clip(Math.min(...ndc.map((p) => p.x)));
  const h =
    clip(Math.max(...ndc.map((p) => p.y))) -
    clip(Math.min(...ndc.map((p) => p.y)));
  return (w * h) / 4;
}

describe("home composition", () => {
  it("frames the whole room right of center with forest beside it", () => {
    for (const aspect of LANDSCAPE) {
      const room = roomRect(homeCamera(aspect));
      const width = room.maxX - room.minX;
      assert.ok(room.minX >= -1 && room.maxX <= 1, `room clipped ${aspect}`);
      assert.ok(room.minY >= -1 && room.maxY <= 1, `room clipped ${aspect}`);
      // Readable, but leaves real screen space for the forest.
      assert.ok(width >= 0.6 && width <= 1.4, `room width ${width}`);
      assert.ok(room.minX + room.maxX > 0.1, "room sits right of center");
    }
  });

  it("puts large nearby trunks on the frame edges and never over the room", () => {
    for (const aspect of LANDSCAPE) {
      const camera = homeCamera(aspect);
      const room = roomRect(camera);
      const framing = forestTrees().filter((tree) => {
        const base = project(camera, [tree.x, ground(tree.x, tree.z), tree.z]);
        const top = project(camera, [
          tree.x,
          ground(tree.x, tree.z) + tree.height,
          tree.z,
        ]);
        // In front, trunk base inside the frame width, and the whole tree
        // taller than the frame (NDC height 2), so it reads as close.
        return (
          base.z < 1 &&
          Math.abs(base.x) <= 1.05 &&
          top.y - base.y >= 2.2 &&
          distance(camera, [tree.x, ground(tree.x, tree.z), tree.z]) < 20
        );
      });
      assert.ok(
        framing.length >= (aspect > 1.5 ? 3 : 2),
        `${framing.length} framing trees at ${aspect}`,
      );
      assert.ok(
        framing.filter((tree) => project(camera, [tree.x, 0, tree.z]).x < 0)
          .length >= 2,
        "the open left side is framed",
      );
      for (const tree of forestTrees())
        for (const point of treePoints(tree)) {
          if (distance(camera, point) > room.far) continue;
          const p = project(camera, point);
          assert.ok(
            p.z >= 1 ||
              p.x <= room.minX ||
              p.x >= room.maxX ||
              p.y <= room.minY ||
              p.y >= room.maxY,
            `tree at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)} covers the room`,
          );
        }
    }
  });

  it("grounds logs, stumps and rocks in the lower foreground without covering the room", () => {
    for (const aspect of LANDSCAPE) {
      const camera = homeCamera(aspect);
      const room = roomRect(camera);
      const near = forestDebris().filter((piece) => {
        const p = project(camera, [piece.x, piece.y, piece.z]);
        return (
          p.z < 1 &&
          Math.abs(p.x) < 1.1 &&
          distance(camera, [piece.x, piece.y, piece.z]) < 12
        );
      });
      assert.ok(
        near.length >= (aspect > 1.5 ? 4 : 2),
        `${near.length} foreground pieces at ${aspect}`,
      );
      assert.ok(near.some((piece) => piece.kind !== "rock"));
      const areas = near.map((piece) =>
        screenArea(camera, debrisPoints(piece)),
      );
      const total = areas.reduce((sum, area) => sum + area, 0);
      assert.ok(total >= 0.04, `foreground debris covers ${total} of frame`);
      for (const piece of near) {
        const center = project(camera, [piece.x, piece.y, piece.z]);
        assert.ok(center.y < -0.2, "foreground debris sits low in frame");
      }
      for (const piece of forestDebris())
        for (const point of debrisPoints(piece)) {
          if (distance(camera, point) > room.far) continue;
          const p = project(camera, point);
          const overRoom =
            p.z < 1 && p.x > room.minX && p.x < room.maxX && p.y < room.maxY;
          assert.ok(
            !overRoom || p.y <= room.floorY,
            `${piece.kind} rises over the room interior`,
          );
        }
    }
  });

  it("keeps the near frame clear of lowland fog and lets the midground recede", () => {
    const camera = homeCamera(16 / 9).position;
    const eye = { x: camera.x, y: camera.y, z: camera.z };
    for (const tree of forestTrees()) {
      const base = { x: tree.x, y: ground(tree.x, tree.z), z: tree.z };
      const d = Math.hypot(tree.x - eye.x, tree.z - eye.z);
      if (d < 20) assert.ok(lowFogFactor(base, eye) < 0.05, "near contrast");
      if (d > 60 && d < 110)
        assert.ok(lowFogFactor(base, eye) > 0.45, "midground recedes");
    }
  });

  it("stays within the tree and near-detail budgets", () => {
    const trees = forestTrees();
    const near = trees.filter((tree) => tree.lod === "near");
    assert.ok(trees.length <= 160, `${trees.length} trees`);
    assert.ok(near.length >= 6 && near.length <= 12, `${near.length} near`);
    // Near detail goes to the trees closest to the starting camera.
    const [hx, hz] = WALK_AREA.spawn;
    const from = (tree: ForestTree) => Math.hypot(tree.x - hx, tree.z - hz);
    const farthestNear = Math.max(...near.map(from));
    for (const tree of trees)
      if (tree.lod === "far") assert.ok(from(tree) >= farthestNear);
  });
});
