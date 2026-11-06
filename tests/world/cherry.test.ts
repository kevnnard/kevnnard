import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  GUIDE,
  guidePose,
  poseToPosition,
} from "../../src/lib/world/camera.ts";
import {
  CHERRY_FADE,
  CHERRY_HITBOX,
  CHERRY_HOURS,
  CHERRY_MODEL,
  CHERRY_REACH,
  CHERRY_SPOTS,
  CHERRY_STORY,
  type CherrySpot,
  cherryChest,
  cherryDayOf,
  cherryPlacement,
  cherryPresence,
  cherrySpotIndex,
  houseBlocks,
  isCherryHour,
  nextVisit,
  startVisit,
} from "../../src/lib/world/cherry.ts";
import {
  CHERRY_SHOT,
  cherryShot,
  cherryView,
} from "../../src/lib/world/cherry-shot.ts";
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
  GARDEN_FOOTPRINTS,
  groundY,
} from "../../src/lib/world/garden.ts";
import { HOUSE, HOUSE_FOOTPRINT, WALLS } from "../../src/lib/world/house.ts";
import { ISLAND, insideIsland, onPad } from "../../src/lib/world/island.ts";
import { islandLayout, KIND_SPECS } from "../../src/lib/world/layout.ts";
import { LIVING_MODELS } from "../../src/lib/world/living.ts";
import { glbInfo, PUBLIC } from "./glb.ts";

const FILE = "models/cherry.glb";

/** The GLB's JSON chunk and binary chunk. */
function glb(file: string) {
  const buffer = readFileSync(new URL(file, PUBLIC));
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: buffer.subarray(binStart) };
}

/** Width and height of a WebP image (VP8, VP8L or VP8X). */
function webpSize(bytes: Buffer): [number, number] {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  assert.equal(chunk, "VP8 ");
  return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
}

describe("Cherry's model (dog-rig T3)", () => {
  it("ships the rigged Min Pin with only the idle and run clips, no sleep and no morphs", () => {
    const { json } = glb(FILE);
    const clips = (json.animations ?? []).map(
      (clip: { name: string }) => clip.name,
    );
    assert.deepEqual([...clips].sort(), ["idle", "run"]);
    assert.equal(json.skins?.length, 1, "one skin");
    assert.equal(json.skins[0].joints.length, 32, "32 bones");
    for (const mesh of json.meshes)
      for (const primitive of mesh.primitives)
        assert.equal(primitive.targets, undefined, "no morph targets");
    for (const clip of json.animations)
      for (const channel of clip.channels)
        assert.notEqual(channel.target.path, "weights", clip.name);
  });

  it("is meshopt-compressed with WebP textures of at most 1024 px, decimated to ~12k triangles", () => {
    const info = glbInfo(FILE);
    assert.ok(info.extensions.includes("EXT_meshopt_compression"));
    assert.ok(info.extensions.includes("EXT_texture_webp"));
    assert.ok(
      info.triangles > 11000 && info.triangles < 13000,
      `${info.triangles}`,
    );
    assert.ok(info.bytes < 900_000, `${info.bytes} bytes`);
    const { json, bin } = glb(FILE);
    assert.ok(json.images.length > 0);
    for (const image of json.images) {
      assert.equal(image.mimeType, "image/webp");
      const view = json.bufferViews[image.bufferView];
      const bytes = bin.subarray(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      );
      const [width, height] = webpSize(Buffer.from(bytes));
      assert.ok(width <= 1024 && height <= 1024, `${width}x${height}`);
    }
  });

  it("is derived by the pinned prepare script, which drops the sleep clip by default", () => {
    const script = readFileSync(
      new URL("../../scripts/prepare-dog.mjs", import.meta.url),
      "utf8",
    );
    assert.match(script, /public\/world\/models\/cherry\.glb/);
    assert.match(
      script,
      /51c00e2139ae94cb1a208375f03ea78f1fb44c78f28b1b790c11a840c8fa277f/,
    );
    assert.match(script, /"--texture-size", "1024"/);
    const blender = readFileSync(
      new URL("../../scripts/prepare-dog.py", import.meta.url),
      "utf8",
    );
    assert.match(blender, /DOG_SLEEP/);
  });
});

type Vec3 = readonly [number, number, number];

/** A column-major 4x4 matrix from a glTF node's TRS (or its matrix). */
function nodeMatrix(node: {
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}): number[] {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
const multiply = (a: number[], b: number[]) =>
  Array.from({ length: 16 }, (_, i) => {
    const col = Math.floor(i / 4);
    const row = i % 4;
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
    return sum;
  });
const apply = (m: number[], [x, y, z]: number[]) =>
  [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);

/**
 * The shipped dog's bind-pose bounds in metres (three's frame: +x nose, +y
 * up): the quantized positions through a joint's world matrix and its
 * inverse bind matrix, which together undo the quantization.
 */
function bindBounds(): { min: number[]; max: number[] } {
  const { json, bin } = glb(FILE);
  const parents = new Map<number, number>();
  json.nodes.forEach((node: { children?: number[] }, index: number) => {
    for (const child of node.children ?? []) parents.set(child, index);
  });
  const world = (index: number): number[] => {
    const local = nodeMatrix(json.nodes[index]);
    const parent = parents.get(index);
    return parent === undefined ? local : multiply(world(parent), local);
  };
  const skin = json.skins[0];
  const ibmAccessor = json.accessors[skin.inverseBindMatrices];
  const view = json.bufferViews[ibmAccessor.bufferView];
  // The matrices are meshopt-compressed: decode the view first.
  const packed = view.extensions?.EXT_meshopt_compression;
  let data: Buffer = bin.subarray(view.byteOffset ?? 0);
  if (packed) {
    const target = new Uint8Array(packed.count * packed.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      target,
      packed.count,
      packed.byteStride,
      bin.subarray(packed.byteOffset, packed.byteOffset + packed.byteLength),
      packed.mode,
      packed.filter ?? "NONE",
    );
    data = Buffer.from(target);
  }
  const offset = ibmAccessor.byteOffset ?? 0;
  const ibm = Array.from({ length: 16 }, (_, i) =>
    data.readFloatLE(offset + i * 4),
  );
  const bind = multiply(world(skin.joints[0]), ibm);
  const position =
    json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  // Normalized shorts: -32767..32767 stand for -1..1.
  const unit = position.normalized ? 32767 : 1;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((bits) =>
    apply(
      bind,
      [0, 1, 2].map(
        (axis) =>
          ((bits >> axis) & 1 ? position.max[axis] : position.min[axis]) / unit,
      ),
    ),
  );
  return {
    min: [0, 1, 2].map((axis) => Math.min(...corners.map((c) => c[axis]))),
    max: [0, 1, 2].map((axis) => Math.max(...corners.map((c) => c[axis]))),
  };
}

const sofa = LIVING_MODELS.find((model) => model.kind === "sofa");
const table = LIVING_MODELS.find((model) => model.kind === "coffee-table");
const frontDoor = WALLS.find((wall) => wall.id === "main-front")?.openings.find(
  (opening) => opening.kind === "door",
);

describe("Cherry's true size (dog-rig T3, S8: a small dog)", () => {
  it("decodes the shipped model", async () => {
    await MeshoptDecoder.ready;
  });

  it("ships at 0.28 m at the withers: 0.45 m long, 0.41 m to the ear tips, feet on the floor", () => {
    const { min, max } = bindBounds();
    const height = max[1] - min[1];
    const length = max[0] - min[0];
    assert.ok(Math.abs(min[1]) < 0.005, `feet at ${min[1]}`);
    assert.ok(Math.abs(height - CHERRY_MODEL.height) < 0.01, `${height}`);
    assert.ok(Math.abs(length - CHERRY_MODEL.length) < 0.01, `${length}`);
    assert.equal(CHERRY_MODEL.withers, 0.28);
    // A Miniature Pinscher stands 25-32 cm at the withers.
    assert.ok(CHERRY_MODEL.withers >= 0.25 && CHERRY_MODEL.withers <= 0.32);
  });

  it("stays small against the house: under the coffee table, a fifth of the door", () => {
    assert.ok(sofa && table && frontDoor);
    assert.ok(
      CHERRY_MODEL.withers < table.size[1],
      "withers under the table top",
    );
    assert.ok(
      CHERRY_MODEL.height < sofa.size[1] * 0.6,
      "ears under the sofa back",
    );
    assert.ok(CHERRY_MODEL.withers / (frontDoor.v1 - frontDoor.v0) < 0.2);
    assert.ok(CHERRY_MODEL.withers / HOUSE.main.height < 0.15);
  });

  it("clicks on a box around the dog alone", () => {
    const { center, size } = CHERRY_HITBOX;
    assert.ok(size[0] >= CHERRY_MODEL.length && size[0] < 0.8);
    assert.ok(size[1] >= CHERRY_MODEL.height && size[1] < 0.6);
    assert.ok(size[2] >= CHERRY_MODEL.width && size[2] < 0.5);
    assert.ok(Math.abs(center[1] - size[1] / 2) < 1e-9, "from the ground up");
  });
});

describe("Cherry's mornings (dog-rig T3)", () => {
  it("is out from 06:00 through 11:59 only", () => {
    assert.deepEqual(CHERRY_HOURS, { from: 6, to: 12 });
    for (const hour of [6, 7.5, 9, 11.99, 30])
      assert.equal(isCherryHour(hour), true, `${hour}`);
    for (const hour of [0, 5.99, 12, 13, 18, 23.9, -1])
      assert.equal(isCherryHour(hour), false, `${hour}`);
  });

  it("counts a new day each time the morning starts, and holds it through the visit", () => {
    const start = startVisit(new Date(2026, 10, 6, 8, 0), 8);
    assert.equal(start.day, cherryDayOf(new Date(2026, 10, 6, 23, 59)));
    assert.equal(start.morning, true);
    // During the visit, and after it, nothing changes.
    assert.equal(nextVisit(start, 9), start);
    const afternoon = nextVisit(start, 14);
    assert.deepEqual(afternoon, { day: start.day, morning: false });
    assert.equal(nextVisit(afternoon, 23), afternoon);
    // The next morning is the next day.
    assert.deepEqual(nextVisit(afternoon, 6.01), {
      day: start.day + 1,
      morning: true,
    });
    // Loading in the afternoon: the first morning is still today's.
    const late = startVisit(new Date(2026, 10, 6, 15, 0), 15);
    assert.deepEqual(nextVisit(late, 6.5), {
      day: cherryDayOf(new Date(2026, 10, 7)),
      morning: true,
    });
    assert.equal(cherryDayOf(new Date(2026, 10, 7, 0, 1)) - start.day, 1);
  });

  it("picks one of the spots per day, deterministically, never the same two days running", () => {
    const seen = new Set<number>();
    for (let day = 20000; day < 20400; day++) {
      const index = cherrySpotIndex(day);
      assert.equal(index, cherrySpotIndex(day));
      assert.ok(index >= 0 && index < CHERRY_SPOTS.length);
      assert.notEqual(index, cherrySpotIndex(day + 1), `day ${day}`);
      seen.add(index);
    }
    assert.equal(seen.size, CHERRY_SPOTS.length);
    // Not a plain rotation: some stretch differs from the previous one.
    const order = (from: number) =>
      Array.from({ length: CHERRY_SPOTS.length }, (_, i) =>
        cherrySpotIndex(from + i),
      ).join();
    const n = CHERRY_SPOTS.length;
    assert.ok(
      Array.from({ length: 20 }, (_, k) => order(20000 + k * n)).some(
        (stretch, _, all) => stretch !== all[0],
      ),
    );
  });

  it("fades in and out over about a second, moving only once she is gone", () => {
    const [a, b] = CHERRY_SPOTS;
    assert.ok(CHERRY_FADE >= 0.8 && CHERRY_FADE <= 1.2);
    let state = { opacity: 0, spot: a };
    state = cherryPresence(state, true, a, CHERRY_FADE / 2, false);
    assert.ok(Math.abs(state.opacity - 0.5) < 1e-9);
    state = cherryPresence(state, true, a, CHERRY_FADE, false);
    assert.equal(state.opacity, 1);
    // A new spot while she shows: she fades out where she is first.
    state = cherryPresence(state, true, b, CHERRY_FADE / 2, false);
    assert.equal(state.spot, a);
    assert.ok(state.opacity < 1);
    state = cherryPresence(state, true, b, CHERRY_FADE, false);
    assert.equal(state.opacity, 0);
    state = cherryPresence(state, true, b, 0.01, false);
    assert.equal(state.spot, b);
    // Gone: she fades out and stays put.
    const gone = cherryPresence({ opacity: 1, spot: a }, false, a, 2, false);
    assert.deepEqual(gone, { opacity: 0, spot: a });
    // Reduced motion cuts.
    assert.deepEqual(
      cherryPresence({ opacity: 0, spot: a }, true, b, 0.016, true),
      {
        opacity: 1,
        spot: b,
      },
    );
    assert.deepEqual(
      cherryPresence({ opacity: 1, spot: a }, false, a, 0.016, true),
      {
        opacity: 0,
        spot: a,
      },
    );
  });
});

/** The house's covered rectangles (roof overhang, porch, driveway). */
const inHouse = (x: number, z: number, margin: number) =>
  HOUSE_FOOTPRINT.some(
    (rect) =>
      x > rect.x0 - margin &&
      x < rect.x1 + margin &&
      z > rect.z0 - margin &&
      z < rect.z1 + margin,
  );
const NATURE = clearOfGarden(islandLayout(ISLAND.seed));
const FLOWERS = clearOfGarden(flowerLayout(NATURE, ISLAND.seed), 0.06);
/** The nearest thing in the yard to (x, z): its gap past `reach`. */
const yardGap = (x: number, z: number, reach: number) =>
  Math.min(
    ...GARDEN_FOOTPRINTS.map(
      (f) => Math.hypot(x - f.x, z - f.z) - f.radius - reach,
    ),
    ...NATURE.map(
      (item) =>
        Math.hypot(x - item.position[0], z - item.position[2]) -
        KIND_SPECS[item.kind].radius * item.scale -
        reach,
    ),
    ...FLOWERS.map(
      (flower) =>
        Math.hypot(x - flower.position[0], z - flower.position[2]) -
        0.06 -
        reach,
    ),
  );

describe("Cherry's spots in the front yard (dog-rig T3)", () => {
  it("has three or four spots, a metre or more apart", () => {
    assert.ok(CHERRY_SPOTS.length >= 3 && CHERRY_SPOTS.length <= 4);
    assert.equal(
      new Set(CHERRY_SPOTS.map((spot) => spot.id)).size,
      CHERRY_SPOTS.length,
    );
    for (const a of CHERRY_SPOTS)
      for (const b of CHERRY_SPOTS)
        if (a !== b)
          assert.ok(
            Math.hypot(
              a.position[0] - b.position[0],
              a.position[1] - b.position[1],
            ) >= 1,
          );
  });

  it("stands each on open grass in front of the house: off the pad, the paths, the props, plants and flowers", () => {
    assert.ok(CHERRY_REACH >= CHERRY_MODEL.length / 2);
    for (const spot of CHERRY_SPOTS) {
      const [x, z] = spot.position;
      assert.ok(z > HOUSE.main.z1 + 0.6, `${spot.id} in front of the house`);
      assert.equal(onPad(x, z, CHERRY_REACH), false, `${spot.id} on the pad`);
      assert.equal(
        inHouse(x, z, CHERRY_REACH),
        false,
        `${spot.id} in the house`,
      );
      assert.ok(insideIsland(x, z, 0.8), `${spot.id} near the rim`);
      assert.ok(yardGap(x, z, CHERRY_REACH) > 0.08, `${spot.id} crowded`);
      // Her feet on the grass.
      const { position } = cherryPlacement(spot);
      assert.equal(position[1], groundY(x, z));
      assert.equal(position[1], 0);
    }
  });

  it("is in sight from the home view: the house never hides her", () => {
    const eye = poseToPosition(guidePose(16 / 9));
    for (const spot of CHERRY_SPOTS)
      assert.equal(houseBlocks(eye, cherryChest(spot)), false, spot.id);
    // From behind the house she is hidden, so she is not clickable there.
    for (const spot of CHERRY_SPOTS)
      assert.equal(houseBlocks([0.5, 3, -9], cherryChest(spot)), true, spot.id);
  });

  it("faces the yard and the home view, never the house wall", () => {
    const eye = poseToPosition(guidePose(16 / 9));
    for (const spot of CHERRY_SPOTS) {
      const nose = [Math.cos(spot.rotationY), -Math.sin(spot.rotationY)];
      const [x, z] = spot.position;
      const toEye = [eye[0] - x, eye[2] - z];
      const length = Math.hypot(toEye[0], toEye[1]);
      // At least a three-quarter view from home: nose not turned away.
      assert.ok(
        (nose[0] * toEye[0] + nose[1] * toEye[1]) / length > -0.2,
        spot.id,
      );
    }
  });
});

/** Screen position (-1..1 both ways) of `point` from a pose. */
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
/** The dog's world bounding-box corners at a spot. */
function corners(spot: CherrySpot): number[][] {
  const { position, rotationY } = cherryPlacement(spot);
  const half = [CHERRY_MODEL.length / 2, CHERRY_MODEL.width / 2];
  const out: number[][] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      for (const y of [0, CHERRY_MODEL.height]) {
        const lx = sx * half[0];
        const lz = sz * half[1];
        out.push([
          position[0] + lx * Math.cos(rotationY) + lz * Math.sin(rotationY),
          y,
          position[2] - lx * Math.sin(rotationY) + lz * Math.cos(rotationY),
        ]);
      }
  return out;
}

describe("Cherry's cinematic shot (dog-rig T3)", () => {
  const aspect = 1440 / 900;
  const home = (): { eye: Vec3; target: Vec3; fov: number } => ({
    eye: poseToPosition(guidePose(aspect)) as Vec3,
    target: GUIDE.target,
    fov: GUIDE.fov,
  });

  it("times like the coffee and keyboard shots; reduced motion cuts", () => {
    assert.equal(CHERRY_SHOT.duration, 2.5);
    const shot = cherryShot(CHERRY_SPOTS[0]);
    assert.equal(shot.progress(0, true), 1);
    assert.equal(shot.progress(0, true, true), 1);
    assert.equal(shot.progress(CHERRY_SHOT.duration / 2, false), 0.5);
    assert.equal(shot.progress(CHERRY_SHOT.duration, false), 1);
    assert.equal(shot.progress(CHERRY_SHOT.leaveDuration, false, true), 1);
    assert.ok(CHERRY_SHOT.leaveDuration < CHERRY_SHOT.duration);
  });

  it("ends low, at her eye level, in front of her, with a narrower lens", () => {
    for (const spot of CHERRY_SPOTS) {
      const end = cherryShot(spot).shotAt(1, home(), 0);
      const view = cherryView(spot);
      const eye = view.centre.map((v, i) => v + view.offset[i]);
      assert.ok(end.eye.every((v, i) => Math.abs(v - eye[i]) < 1e-9));
      assert.equal(end.fov, CHERRY_SHOT.fov);
      assert.ok(CHERRY_SHOT.fov < GUIDE.fov);
      // Her eyes are 0.33 m up: the lens sits within a hand of them.
      assert.ok(
        end.eye[1] > 0.22 && end.eye[1] < 0.45,
        `${spot.id} ${end.eye[1]}`,
      );
      const nose = [Math.cos(spot.rotationY), -Math.sin(spot.rotationY)];
      const { position } = cherryPlacement(spot);
      const out = [end.eye[0] - position[0], end.eye[2] - position[2]];
      const cos = (nose[0] * out[0] + nose[1] * out[1]) / Math.hypot(...out);
      // A front three-quarter view: her face to the lens.
      assert.ok(cos > 0.4 && cos < 0.95, `${spot.id} ${cos}`);
    }
  });

  it("puts Cherry in the left third and the whole dog clear of the card on the right", () => {
    for (const spot of CHERRY_SPOTS) {
      const shot = cherryShot(spot);
      const shift = shot.shift(1440, aspect);
      assert.ok(shift > 0);
      const end = shot.shotAt(1, home(), shift);
      const xs = corners(spot).map((c) => project(end, c, aspect));
      const cardLeft = 1 - (2 * (STORY_CARD.width + STORY_CARD.inset)) / 1440;
      for (const p of xs) {
        assert.ok(p.depth > 0.3);
        assert.ok(p.x < cardLeft - 0.02, `${spot.id} under the card: ${p.x}`);
        assert.ok(
          p.x > -0.98 && Math.abs(p.y) < 0.98,
          `${spot.id} out of frame`,
        );
      }
      const centre =
        (Math.min(...xs.map((p) => p.x)) + Math.max(...xs.map((p) => p.x))) / 2;
      // Screen x from 0 (left) to 1: the left third's middle is 1/6..1/2.
      const screen = (centre + 1) / 2;
      assert.ok(screen > 0.2 && screen < 0.45, `${spot.id} at ${screen}`);
      // Big in frame: at least two fifths of the height.
      const tall =
        Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y));
      assert.ok(tall / 2 > 0.4, `${spot.id} ${tall / 2}`);
      // The card stacks over her on narrow screens: no slide.
      assert.equal(shot.shift(600, 0.6), 0);
    }
  });

  it("keeps the lens in the open yard: clear of the house, plants, props and the rim", () => {
    for (const spot of CHERRY_SPOTS) {
      const shot = cherryShot(spot);
      for (const shift of [
        0,
        shot.shift(1100, 1100 / 800),
        shot.shift(1440, aspect),
        shot.shift(2560, 2560 / 1080),
      ]) {
        const { eye } = shot.shotAt(1, home(), shift);
        assert.equal(
          inHouse(eye[0], eye[2], 0.3),
          false,
          `${spot.id} in the house`,
        );
        assert.ok(insideIsland(eye[0], eye[2], 0.3), `${spot.id} past the rim`);
        assert.ok(yardGap(eye[0], eye[2], 0.08) > 0, `${spot.id} in a bush`);
        // Nothing stands between the lens and her.
        assert.equal(houseBlocks(eye, cherryChest(spot)), false);
      }
    }
  });

  it("dollies in on an eased arc from the room and back out the same way, never through the ground", () => {
    for (const spot of CHERRY_SPOTS) {
      const shot = cherryShot(spot);
      const from = home();
      const start = shot.shotAt(0, from, 0);
      assert.deepEqual(start.eye, from.eye);
      assert.deepEqual(start.target, from.target);
      assert.equal(start.fov, from.fov);
      const end = shot.shotAt(1, from, 0);
      // Eased: slow at both ends.
      const early = shot.shotAt(0.05, from, 0);
      const step = Math.hypot(...early.eye.map((v, i) => v - start.eye[i]));
      const total = Math.hypot(...end.eye.map((v, i) => v - start.eye[i]));
      assert.ok(step < total * 0.01);
      // Bowed sideways at mid-move.
      const mid = shot.shotAt(0.5, from, 0);
      const line = start.eye.map((v, i) => (v + end.eye[i]) / 2);
      assert.ok(Math.hypot(mid.eye[0] - line[0], mid.eye[2] - line[2]) > 0.05);
      for (let t = 0; t <= 1; t += 0.05)
        assert.ok(shot.shotAt(t, from, 0).eye[1] > 0.2, `${spot.id} at ${t}`);
      // Leaving is the same path backwards.
      assert.deepEqual(shot.leaveAt(0, from, 0), end);
      assert.deepEqual(shot.leaveAt(1, from, 0), start);
    }
  });
});

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Cherry's card (dog-rig T3)", () => {
  it("tells her story in the owner's words, with an empty media slot for now", () => {
    assert.equal(CHERRY_STORY.name, "Cherry");
    assert.equal(CHERRY_STORY.kicker, "COMPANION · MINIATURE PINSCHER");
    assert.deepEqual(CHERRY_STORY.stats, [
      { label: "With me", value: "19+ years" },
      { label: "Breed", value: "Miniature Pinscher" },
      { label: "Size", value: "Small, big heart" },
    ]);
    assert.deepEqual(CHERRY_STORY.story, [
      "Cherry has been by my side my whole life: more than nineteen years.",
      "Someday she will rest, and she will live on in my thoughts. I wish she never had to go, so I put her here, to keep her with me forever and never forget her.",
    ]);
    // The owner's photos and videos come later.
    assert.equal(CHERRY_STORY.media, null);
  });

  it("is inspected like the desk things: off the collection rail, not a glass case", () => {
    assert.equal(isDeskItemId("cherry"), true);
    assert.equal(isDisplayCaseId("cherry"), false);
    assert.ok(!(GALLERY_ORDER as readonly string[]).includes("cherry"));
    // Without the day's spot, the inspection view is the first spot's shot.
    const focus = galleryCaseFocus("cherry");
    const end = cherryShot(CHERRY_SPOTS[0]).shotAt(1, {
      eye: [0, 10, 10],
      target: [0, 0, 0],
      fov: GUIDE.fov,
    });
    assert.ok(focus.position.every((v, i) => Math.abs(v - end.eye[i]) < 1e-9));
    assert.ok(focus.target.every((v, i) => Math.abs(v - end.target[i]) < 1e-9));
    assert.equal(focus.fov, CHERRY_SHOT.fov);
  });

  it("renders an iconic name, a drawn glyph, the stats, her story and Back to room, and no media yet", () => {
    const card = source("src/components/world/CherryCard.tsx");
    assert.match(card, /className="case-story cherry-card"/);
    assert.match(card, /case-story-kicker/);
    assert.match(card, /className="cherry-card-name"/);
    assert.match(card, /<svg[\s\S]*?className="cherry-card-glyph"/);
    assert.match(card, /<dl className="cherry-card-stats"/);
    assert.match(card, /story\.story\.map/);
    // No photos yet: nothing renders for the empty media slot, and no
    // external images.
    assert.doesNotMatch(card, /<img|<video|https?:\/\//);
    assert.match(card, /Back to room/);
    assert.match(card, /back\.current\?\.focus\(/);
    assert.match(card, /data-state=\{state\}/);
    assert.match(card, /inert=\{state === "leaving"\}/);
    assert.match(card, /onAnimationEnd=\{onMotionEnd\}/);
    assert.match(
      card,
      /import type \{ CardState \} from "@\/lib\/world\/card-motion\.ts";/,
    );
    const css = source("src/components/world/cherry-card.css");
    assert.match(css, /\.cherry-card-name\s*\{[^}]*letter-spacing/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /@media \(max-width: 700px\)/);
  });
});

describe("Cherry's wiring (dog-rig T3)", () => {
  it("renders her in the yard on her own Suspense, with the day's spot and the inspect control", () => {
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(scene, /<Suspense fallback=\{null\}>\s*<Cherry\b/);
    assert.match(scene, /useCherrySpot\(hours, galleryCase === "cherry"\)/);
    assert.match(
      scene,
      /cherry: cherryShot\(cherrySpot\)|cherryShot\(cherrySpot\)/,
    );
    assert.match(scene, /cherrySpot=\{cherrySpot\}/);
  });

  it("idles with an AnimationMixer, fades by the hour, and is clickable only in plain sight", () => {
    const dog = source("src/components/world/Cherry.tsx");
    assert.match(dog, /new AnimationMixer\(/);
    assert.match(dog, /clipAction\(/);
    assert.match(dog, /CHERRY_MODEL\.clip/);
    assert.match(dog, /isCherryHour\(hours\)/);
    assert.match(dog, /cherryPresence\(/);
    assert.match(dog, /houseBlocks\(/);
    assert.match(dog, /cursor = "pointer"/);
    assert.match(dog, /event\.stopPropagation\(\)/);
    assert.match(dog, /onInspect\?\.\("cherry"\)/);
    assert.match(dog, /nextVisit\(/);
    assert.match(dog, /startVisit\(/);
  });

  it("opens her card in WorldApp with the shared card motion, framed left of it", () => {
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && galleryCase === "cherry" \? "cherry" : null,\s*CHERRY_STORY,\s*reducedMotion,?\s*\)/,
    );
    assert.match(
      app,
      /cherryCards\.map\(\(card\) => \(\s*<CherryCard\s+key=\{card\.key\}[\s\S]*?state=\{card\.state\}\s*onMotionEnd=\{card\.onMotionEnd\}/,
    );
    assert.match(app, /galleryCase === "cherry" \|\|/);
  });
});
