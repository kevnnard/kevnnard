// Forest garden at the front entrance: gravel and stepping stones over the
// existing walk, two planted beds beside it, a mailbox and low path lights.
// Positions are pure and seeded so tests check the rules without WebGL; the
// small local meshes are built here too so their triangles can be counted.
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  Vector2,
} from "three";
import { dayCycle, PRESETS, wrapHours } from "./day-cycle.ts";
import { seeded } from "./forest-layout.ts";
import { FERN_MODELS, type Fern, fernFootprint } from "./forest-understory.ts";
import { type Box, BUSHES, LEVELS, PARTS, PLOT } from "./house-layout.ts";

export type GardenLayer = "stone" | "gravel";
export type XZ = readonly [number, number];

/** Captured surface size in metres (Poly Haven `/info` dimensions, manifest). */
export const GARDEN_SIZE: Record<GardenLayer, number> = {
  stone: 1.95,
  gravel: 2,
};

export const gardenUrls = (layer: GardenLayer) =>
  (["color", "normal", "roughness"] as const).map(
    (kind) => `/textures/garden/${layer}-${kind}.webp`,
  );

// Distinct levels above the walk slab and the lawn: no coplanar faces.
export const GARDEN_LEVELS = {
  gravelTop: -0.07,
  stoneTop: -0.03,
  stoneBottom: -0.075,
  soilTop: -0.13,
  edgingTop: -0.06,
} as const;

const partBox = (id: string): Box => {
  const part = PARTS.find((p) => p.id === id);
  if (!part) throw new Error(`Garden: missing house part ${id}`);
  return part;
};
const WALK = partBox("walk");
const WALK_X = (WALK.min[0] + WALK.max[0]) / 2;

const box = (
  [x0, x1]: readonly [number, number],
  [y0, y1]: readonly [number, number],
  [z0, z1]: readonly [number, number],
): Box => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

/** Loose gravel over the walk slab, a hair inside its rim. */
export const GRAVEL = box(
  [WALK.min[0] + 0.02, WALK.max[0] - 0.02],
  [LEVELS.pavingTop, GARDEN_LEVELS.gravelTop],
  [WALK.min[2], WALK.max[2]],
);

/** Rounded stone edges: ExtrudeGeometry grows the outline by `size`. */
export const STONE_BEVEL = { size: 0.012, thickness: 0.008, segments: 2 };

export interface Stone {
  /** World outline before the bevel, counter-clockwise seen from above. */
  points: XZ[];
}

/**
 * Seeded stepping stones from the porch to the street. Each is an irregular
 * 6–9 sided outline, slightly turned and offset; lengths and joints are drawn
 * then scaled together so the run fills the walk end to end.
 */
export function gardenStones(): Stone[] {
  const random = seeded(2903);
  const margin = 0.06;
  const start = WALK.min[2] + margin;
  const length = WALK.max[2] - margin - start;
  const count = 8;
  const sizes = Array.from({ length: count }, () => 0.36 + random() * 0.14);
  const joints = Array.from(
    { length: count - 1 },
    () => 0.08 + random() * 0.07,
  );
  const fit =
    length /
    (sizes.reduce((a, b) => a + b, 0) + joints.reduce((a, b) => a + b, 0));
  const inset = STONE_BEVEL.size + 0.025;
  const stones: Stone[] = [];
  let z = start;
  for (let i = 0; i < count; i++) {
    const sides = 6 + Math.floor(random() * 4);
    const yaw = (random() - 0.5) * 0.5;
    const offset = (random() - 0.5) * 0.12;
    const local: [number, number][] = [];
    for (let k = 0; k < sides; k++) {
      const angle = ((k + (random() - 0.5) * 0.5) / sides) * Math.PI * 2;
      const r = 0.8 + random() * 0.2;
      const [x, y] = [0.4 * r * Math.cos(angle), 0.25 * r * Math.sin(angle)];
      local.push([
        x * Math.cos(yaw) - y * Math.sin(yaw),
        x * Math.sin(yaw) + y * Math.cos(yaw),
      ]);
    }
    // Scale to the drawn length along the walk and to its free width.
    const zs = local.map(([, lz]) => lz);
    const xs = local.map(([lx]) => lx);
    const sz = (sizes[i] * fit) / (Math.max(...zs) - Math.min(...zs));
    const half = (WALK.max[0] - WALK.min[0]) / 2 - inset - Math.abs(offset);
    const sx = Math.min(1, half / Math.max(...xs.map(Math.abs)));
    const z0 = Math.min(...zs) * sz;
    stones.push({
      points: local.map(([lx, lz]) => [
        WALK_X + offset + lx * sx,
        z + lz * sz - z0,
      ]),
    });
    z += sizes[i] * fit + (joints[i] ?? 0) * fit;
  }
  return stones;
}

const segmentDistance = ([px, pz]: XZ, [ax, az]: XZ, [bx, bz]: XZ) => {
  const [dx, dz] = [bx - ax, bz - az];
  const t = Math.min(
    1,
    Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const contains = (polygon: readonly XZ[], [x, z]: XZ) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
};

/** Shortest distance between two simple polygons; 0 when they touch or overlap. */
export function polygonDistance(a: readonly XZ[], b: readonly XZ[]) {
  if (a.some((p) => contains(b, p)) || b.some((p) => contains(a, p))) return 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ])
    for (const point of from)
      for (let i = 0; i < to.length; i++)
        distance = Math.min(
          distance,
          segmentDistance(point, to[i], to[(i + 1) % to.length]),
        );
  return distance;
}

/** Forest-soil beds either side of the walk, a step clear of it and the porch. */
export const BEDS: readonly Box[] = [
  box([4.0, 5.2], [LEVELS.terrainTop, GARDEN_LEVELS.soilTop], [4.6, 7.75]),
  box([6.4, 8.8], [LEVELS.terrainTop, GARDEN_LEVELS.soilTop], [4.6, 7.75]),
];

/** Low stone kerbs on each bed's walk, porch and street sides. */
export const EDGING: readonly Box[] = BEDS.flatMap((bed) => {
  const west = bed.max[0] < WALK.min[0];
  const w = 0.07;
  const y = [LEVELS.terrainTop - 0.02, GARDEN_LEVELS.edgingTop] as const;
  const [x0, x1] = [bed.min[0], bed.max[0]];
  const [z0, z1] = [bed.min[2], bed.max[2]];
  const [inner, rest] = west
    ? [[x1 - w, x1] as const, [x0, x1 - w] as const]
    : [[x0, x0 + w] as const, [x0 + w, x1] as const];
  return [
    box(inner, y, [z0, z1]),
    box(rest, y, [z0, z0 + w]),
    box(rest, y, [z1 - w, z1]),
  ];
});

/** Post-mounted mailbox in the east bed; its door faces the walk (-x). */
export const MAILBOX = {
  x: 6.62,
  z: 7.5,
  /** Door side along x. */
  facing: -1,
  post: { size: 0.07, height: 0.9 },
  body: { length: 0.44, width: 0.17, wall: 0.11 },
  height: 0.9 + 0.11 + 0.085,
  footprint: box([6.38, 6.86], [LEVELS.terrainTop, 1.1], [7.4, 7.62]),
} as const;

export interface PathLight {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Bollards between the walk and the bed kerbs, alternating sides. */
export const PATH_LIGHTS: readonly PathLight[] = [
  [WALK.min[0] - 0.05, 5.0],
  [WALK.max[0] + 0.05, 6.0],
  [WALK.min[0] - 0.05, 7.0],
].map(([x, z]) => ({ x, z, radius: 0.042, height: 0.42 }));

/** Fern clumps per bed: the wider east bed carries the denser planting. */
const PLANTING = [
  { bed: 0, clumps: 18, anchors: [0.3, 0.75] },
  { bed: 1, clumps: 30, anchors: [0.15, 0.5, 0.85] },
];
const FERN_TRIANGLES = 120_000;
const MAX_HEIGHT = 0.68;

const boxDistance = (x: number, z: number, b: Box) =>
  Math.hypot(
    Math.max(b.min[0] - x, 0, x - b.max[0]),
    Math.max(b.min[2] - z, 0, z - b.max[2]),
  );

/**
 * Seeded fern clumps of the existing scanned `fern_02` set: patches gathered
 * along each bed, broad clumps at the patch heart and small ones at its edge.
 * Every footprint stays clear of the walk, porch, house parts, hedges,
 * bushes, mailbox and lights; heights stay below 0.7 m.
 */
export function gardenFerns(): Fern[] {
  const random = seeded(4721);
  const ferns: Fern[] = [];
  let triangles = 0;
  const fits = (fern: Fern) => {
    const reach = fernFootprint(fern);
    const { x, z } = fern;
    return (
      x - reach > PLOT.min[0] &&
      x + reach < PLOT.max[0] &&
      z - reach > PLOT.min[2] &&
      z + reach < PLOT.max[2] &&
      PARTS.every((part) => boxDistance(x, z, part) > reach + 0.02) &&
      BUSHES.every(
        (bush) => Math.hypot(bush.x - x, bush.z - z) > bush.radius + reach,
      ) &&
      boxDistance(x, z, MAILBOX.footprint) > reach + 0.02 &&
      PATH_LIGHTS.every(
        (light) => Math.hypot(light.x - x, light.z - z) > light.radius + reach,
      ) &&
      ferns.every(
        (other) =>
          Math.hypot(other.x - x, other.z - z) >
          (reach + fernFootprint(other)) * 0.45,
      )
    );
  };
  for (const { bed: index, clumps, anchors } of PLANTING) {
    const bed = BEDS[index];
    const [x0, x1, z0, z1] = [bed.min[0], bed.max[0], bed.min[2], bed.max[2]];
    for (let clump = 0; clump < clumps; clump++) {
      const anchor = anchors[clump % anchors.length];
      const inner = clump < anchors.length * 2;
      const variant = inner
        ? Math.floor(random() * 2)
        : Math.floor(random() * 4);
      const { size, triangles: cost } = FERN_MODELS[variant];
      if (triangles + cost > FERN_TRIANGLES) return ferns;
      const target = inner ? 0.42 + random() * 0.24 : 0.22 + random() * 0.26;
      for (let attempt = 0; attempt < 30; attempt++) {
        // Smaller clumps on retries, so tight corners still fill.
        const scale = Math.min(
          MAX_HEIGHT / size[1],
          Math.max(0.55, (target * (1 - attempt * 0.02)) / size[1]),
        );
        const x = x0 + 0.1 + random() * (x1 - x0 - 0.2);
        const z =
          z0 + 0.1 + (z1 - z0 - 0.2) * (anchor + (random() - 0.5) * 0.45);
        if (z < z0 + 0.1 || z > z1 - 0.1) continue;
        const fern: Fern = {
          variant,
          x,
          y: GARDEN_LEVELS.soilTop,
          z,
          yaw: random() * Math.PI * 2,
          scale,
          burial: 0.04 + random() * 0.05,
          tilt: [0, 0],
        };
        if (fits(fern)) {
          ferns.push(fern);
          triangles += cost;
          break;
        }
      }
    }
  }
  return ferns;
}

const smooth = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Path-light glow in [0, 1] from the hour: off while the sun is up, rising
 * as it sets and full once it is below the horizon. Non-finite hours fall
 * back to the day preset, like the atmosphere.
 */
export function lampGlow(hours: number) {
  const h = wrapHours(Number.isFinite(hours) ? hours : PRESETS.day);
  return 1 - smooth(-0.1, 0.2, dayCycle(h).sun.direction[1]);
}

/** Every stone as one extruded geometry in world space, rising along +y. */
export function stonesGeometry(stones: readonly Stone[] = gardenStones()) {
  const { stoneTop, stoneBottom } = GARDEN_LEVELS;
  const { size, thickness, segments } = STONE_BEVEL;
  // Shape (x, y) = world (x, -z): rotating -90° about x lays it flat.
  const shapes = stones.map(
    ({ points }) => new Shape(points.map(([x, z]) => new Vector2(x, -z))),
  );
  return new ExtrudeGeometry(shapes, {
    depth: stoneTop - stoneBottom - 2 * thickness,
    bevelEnabled: true,
    bevelSize: size,
    bevelThickness: thickness,
    bevelSegments: segments,
  })
    .rotateX(-Math.PI / 2)
    .translate(0, stoneBottom + thickness, 0);
}

/**
 * Original mailbox in its local frame (post base at the origin, door toward
 * -x): one merged post and arched body, and a separate flag.
 */
export function mailboxGeometry() {
  const { post, body } = MAILBOX;
  const half = body.width / 2;
  // Flat floor, straight walls, round arch on top: the classic profile.
  const profile = new Shape()
    .moveTo(-half, 0)
    .lineTo(half, 0)
    .lineTo(half, body.wall)
    .absarc(0, body.wall, half, 0, Math.PI, false)
    .lineTo(-half, 0);
  const shell = new ExtrudeGeometry(profile, {
    depth: body.length - 0.02,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.01,
    bevelSegments: 2,
    curveSegments: 10,
  })
    // Extrusion along +z becomes +x; the profile's x becomes world z.
    .rotateY(Math.PI / 2)
    .translate(-body.length / 2 + 0.01, post.height, 0);
  const stand = new CylinderGeometry(
    post.size / 2,
    post.size / 2,
    post.height,
    4,
  )
    .rotateY(Math.PI / 4)
    .translate(0, post.height / 2, 0);
  const merged = mergeFlat([shell, stand]);
  shell.dispose();
  stand.dispose();
  // Raised flag on the street side: an arm and its blade.
  const flag = new ExtrudeGeometry(
    new Shape()
      .moveTo(0, 0)
      .lineTo(0.012, 0)
      .lineTo(0.012, 0.16)
      .lineTo(0.09, 0.16)
      .lineTo(0.09, 0.22)
      .lineTo(0, 0.22)
      .lineTo(0, 0),
    { depth: 0.006, bevelEnabled: false },
  ).translate(0.08, post.height + 0.02, half + 0.008);
  return { body: merged, flag };
}

/**
 * One non-indexed geometry with the positions and normals of `geometries`,
 * which stay owned by the caller. Local on purpose: the examples'
 * BufferGeometryUtils would add a prebundled dependency for a few small meshes.
 */
export function mergeFlat(geometries: readonly BufferGeometry[]) {
  const flat = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = new BufferGeometry();
  for (const name of ["position", "normal"]) {
    const arrays = flat.map((g) => g.getAttribute(name).array);
    const data = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const array of arrays) {
      data.set(array, offset);
      offset += array.length;
    }
    merged.setAttribute(name, new Float32BufferAttribute(data, 3));
  }
  for (const g of flat) if (!geometries.includes(g)) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** World-space boxes (bed soil or edging) as one geometry. */
export function boxesGeometry(boxes: readonly Box[]) {
  const parts = boxes.map(({ min, max }) =>
    new BoxGeometry(
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2],
    ).translate(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ),
  );
  const merged = mergeFlat(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** Bollard post and its glowing head, both standing on the lawn at y = 0. */
export function bollardGeometry() {
  const { radius, height } = PATH_LIGHTS[0];
  const head = 0.07;
  return {
    post: new CylinderGeometry(
      radius * 0.85,
      radius,
      height - head,
      12,
    ).translate(0, (height - head) / 2, 0),
    lamp: new CylinderGeometry(radius, radius, head, 12).translate(
      0,
      height - head / 2,
      0,
    ),
  };
}

const trianglesOf = (geometry: BufferGeometry) =>
  (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;

/**
 * Triangles before culling and draw calls of the rendered garden: gravel,
 * stones, merged bed soil and edging, mailbox body and flag, bollard posts
 * and heads, and one instanced draw per fern variant in use.
 */
export function gardenBudget() {
  const ferns = gardenFerns();
  const stones = gardenStones();
  const stone = stonesGeometry(stones);
  const mailbox = mailboxGeometry();
  const bollard = bollardGeometry();
  const soil = boxesGeometry(BEDS);
  const edging = boxesGeometry(EDGING);
  const variants = new Set(ferns.map((fern) => fern.variant));
  const triangles =
    2 +
    trianglesOf(stone) +
    trianglesOf(soil) +
    trianglesOf(edging) +
    trianglesOf(mailbox.body) +
    trianglesOf(mailbox.flag) +
    PATH_LIGHTS.length *
      (trianglesOf(bollard.post) + trianglesOf(bollard.lamp)) +
    ferns.reduce((sum, fern) => sum + FERN_MODELS[fern.variant].triangles, 0);
  for (const geometry of [
    stone,
    soil,
    edging,
    mailbox.body,
    mailbox.flag,
    bollard.post,
    bollard.lamp,
  ])
    geometry.dispose();
  return {
    triangles,
    // gravel, stones, soil, edging, mailbox body, flag, posts, heads, ferns.
    draws: 8 + variants.size,
    instances: {
      ferns: ferns.length,
      stones: stones.length,
      lights: PATH_LIGHTS.length,
    },
  };
}
