// Pure layout for the house diorama around the original room. Everything is an
// axis-aligned box or a point on the ground so tests can check the rules
// (finite plot, clear cutaway, connected entrance, parking) without WebGL.

export type Vec3 = readonly [number, number, number];

export interface Box {
  min: Vec3;
  max: Vec3;
}

export type Role =
  | "foundation"
  | "wall"
  | "facade"
  | "roof"
  | "post"
  | "paving"
  | "furniture"
  | "hedge";

export type Finish =
  | "concrete"
  | "plaster"
  | "trim"
  | "glass"
  | "door"
  | "roof"
  | "paving"
  | "deck"
  | "wood"
  | "hedge";

export interface Part extends Box {
  id: string;
  role: Role;
  finish: Finish;
}

export interface ParkingSpace extends Box {
  id: string;
  label: string;
}

export interface Plant {
  x: number;
  z: number;
  /** Footprint radius of the canopy. */
  radius: number;
  height: number;
  kind: "round" | "cone" | "bush";
}

/** The original room as measured from its glTFs; the cutaway opens to -x/+z. */
export const ROOM_BOUNDS: Box = {
  min: [-3.46, 0, -3.06],
  max: [3.47, 4.74, 3.0],
};

// Distinct levels so no two horizontal faces are coplanar.
export const LEVELS = {
  roomFloor: 0,
  foundationTop: -0.005,
  pavingTop: -0.08,
  terrainTop: -0.15,
  terrainBottom: -0.95,
} as const;

const { foundationTop, pavingTop, terrainTop } = LEVELS;
const WALL_TOP = ROOM_BOUNDS.max[1];
const FRONT = ROOM_BOUNDS.max[2];
const BACK = ROOM_BOUNDS.min[2];
const WALL = 0.2;
/** Slabs and hedges start below the grass so their bottoms never show. */
const EMBED = terrainTop - 0.05;

export const PLOT: Box = {
  min: [-8.4, LEVELS.terrainBottom, -5.4],
  max: [14.8, terrainTop, 8.6],
};

// The closed wing sits just past the room's +x wall; the carport continues east.
const WING = { x0: 3.48, x1: 9.0 };
const CARPORT = { x0: WING.x1, x1: 13.8 };

const box = (
  id: string,
  role: Role,
  finish: Finish,
  [x0, x1]: readonly [number, number],
  [y0, y1]: readonly [number, number],
  [z0, z1]: readonly [number, number],
): Part => ({ id, role, finish, min: [x0, y0, z0], max: [x1, y1, z1] });

const walls = (y: readonly [number, number] = [foundationTop, WALL_TOP]) => [
  box("wing-west", "wall", "plaster", [WING.x0, WING.x0 + WALL], y, [
    BACK,
    FRONT,
  ]),
  box("wing-back", "wall", "plaster", [WING.x0, WING.x1], y, [
    BACK,
    BACK + WALL,
  ]),
  box("wing-east", "wall", "plaster", [WING.x1 - WALL, WING.x1], y, [
    BACK,
    FRONT,
  ]),
  box("wing-front", "wall", "plaster", [WING.x0, WING.x1], y, [
    FRONT - WALL,
    FRONT,
  ]),
];

const front = [FRONT - 0.01, FRONT + 0.04] as const;
const plotEdge = PLOT.max[2];

export const PARTS: readonly Part[] = [
  box(
    "foundation",
    "foundation",
    "concrete",
    [-3.5, WING.x1],
    [-0.3, foundationTop],
    [BACK - 0.04, FRONT + 0.05],
  ),
  ...walls(),
  box("door", "facade", "door", [5.2, 6.4], [foundationTop, 2.6], front),
  box("window-west", "facade", "glass", [3.9, 4.9], [1.2, 3.0], front),
  box("window-east", "facade", "glass", [7.0, 8.4], [1.2, 3.0], front),
  box(
    "door-canopy",
    "roof",
    "trim",
    [4.9, 6.7],
    [2.85, 3.0],
    [FRONT, FRONT + 1],
  ),
  box(
    "porch",
    "paving",
    "paving",
    [4.8, 6.8],
    [EMBED, pavingTop],
    [FRONT, FRONT + 1.4],
  ),
  box(
    "walk",
    "paving",
    "paving",
    [5.3, 6.3],
    [EMBED, pavingTop],
    [FRONT + 1.4, plotEdge],
  ),
  box(
    "carport-floor",
    "paving",
    "concrete",
    [CARPORT.x0, CARPORT.x1],
    [EMBED, pavingTop],
    [BACK, FRONT],
  ),
  box(
    "carport-roof",
    "roof",
    "trim",
    [CARPORT.x0, CARPORT.x1 + 0.2],
    [3.0, 3.18],
    [BACK - 0.2, FRONT + 0.3],
  ),
  box(
    "carport-post-back",
    "post",
    "wood",
    [13.6, 13.8],
    [pavingTop - 0.02, 3.0],
    [BACK + 0.06, BACK + 0.26],
  ),
  box(
    "carport-post-front",
    "post",
    "wood",
    [13.6, 13.8],
    [pavingTop - 0.02, 3.0],
    [FRONT - 0.2, FRONT],
  ),
  box(
    "driveway",
    "paving",
    "concrete",
    [9.4, 13.4],
    [EMBED, pavingTop],
    [FRONT, plotEdge],
  ),
  // The patio meets the room's open -x side, one step below its floor.
  box("patio", "paving", "deck", [-7.0, -3.5], [EMBED, pavingTop], [-2.9, 1.4]),
  box(
    "patio-bench",
    "furniture",
    "wood",
    [-6.8, -6.4],
    [pavingTop, 0.45],
    [-2.4, 0.6],
  ),
  box(
    "patio-table",
    "furniture",
    "wood",
    [-5.6, -4.6],
    [pavingTop, 0.72],
    [-1.4, -0.4],
  ),
  // Low hedge on the plot edge, open where the walk and driveway reach the street.
  box(
    "hedge-back",
    "hedge",
    "hedge",
    [-8.1, 14.5],
    [EMBED, 0.55],
    [-5.1, -4.7],
  ),
  box("hedge-west", "hedge", "hedge", [-8.1, -7.7], [EMBED, 0.55], [-4.7, 8.3]),
  box("hedge-east", "hedge", "hedge", [14.1, 14.5], [EMBED, 0.55], [-4.7, 8.3]),
  box(
    "hedge-front-west",
    "hedge",
    "hedge",
    [-7.7, 5.0],
    [EMBED, 0.55],
    [7.9, 8.3],
  ),
  box(
    "hedge-front-mid",
    "hedge",
    "hedge",
    [6.6, 9.1],
    [EMBED, 0.55],
    [7.9, 8.3],
  ),
  box(
    "hedge-front-east",
    "hedge",
    "hedge",
    [13.7, 14.1],
    [EMBED, 0.55],
    [7.9, 8.3],
  ),
];

export const HEDGES = PARTS.filter((part) => part.role === "hedge");

/** Gable roof over the wing only; the ridge runs along x. */
export const ROOF = {
  x: [WING.x0, WING.x1 + 0.15],
  z: [BACK - 0.3, FRONT + 0.3],
  eave: WALL_TOP,
  ridge: WALL_TOP + 1.56,
} as const;

/** Front door, then the slabs that lead from it to the street, in order. */
export const ENTRANCE = { door: "door", path: ["porch", "walk"] } as const;

// Reserved bays only: the user's actual car and motorcycle are unspecified.
export const PARKING: readonly ParkingSpace[] = [
  {
    id: "car",
    label: "Car",
    min: [9.5, pavingTop, -2.6],
    max: [12.0, pavingTop, 2.6],
  },
  {
    id: "motorcycle",
    label: "Motorcycle",
    min: [12.3, pavingTop, -1.2],
    max: [13.4, pavingTop, 1.4],
  },
];

export const TREES: readonly Plant[] = [
  { x: -6.6, z: -4.1, radius: 1.1, height: 4.4, kind: "round" },
  { x: 1.0, z: -4.3, radius: 1.0, height: 5.2, kind: "round" },
  { x: -2.2, z: -4.6, radius: 0.7, height: 3.4, kind: "cone" },
  { x: 12.2, z: -4.4, radius: 0.95, height: 4.6, kind: "round" },
  { x: -6.6, z: 6.2, radius: 0.9, height: 4.0, kind: "cone" },
  { x: 7.9, z: 6.4, radius: 0.9, height: 3.6, kind: "cone" },
];

export const BUSHES: readonly Plant[] = [
  [4.3, 3.8, 0.45],
  [7.6, 3.8, 0.45],
  [8.5, 3.85, 0.4],
  [2.6, 4.0, 0.45],
  [-4.2, 3.9, 0.5],
  [-7.6, 2.2, 0.45],
  [6.5, -4.0, 0.5],
  [-4.6, -4.4, 0.45],
].map(([x, z, radius]) => ({
  x,
  z,
  radius,
  height: radius * 1.6,
  kind: "bush",
}));

export function unionBounds(
  boxes: readonly { min: readonly number[]; max: readonly number[] }[],
): Box {
  const pick = (side: "min" | "max", i: number) =>
    (side === "min" ? Math.min : Math.max)(...boxes.map((b) => b[side][i]));
  return {
    min: [pick("min", 0), pick("min", 1), pick("min", 2)],
    max: [pick("max", 0), pick("max", 1), pick("max", 2)],
  };
}

const ROOF_BOX: Box = {
  min: [ROOF.x[0], ROOF.eave, ROOF.z[0]],
  max: [ROOF.x[1], ROOF.ridge, ROOF.z[1]],
};

/** Room, shell and paving: what casts or receives meaningful shadows. */
export const HOUSE_BOUNDS = unionBounds([
  ROOM_BOUNDS,
  ROOF_BOX,
  ...PARTS.filter((part) => part.role !== "hedge"),
]);

/** Everything visible, used to frame the overview. */
export const SCENE_BOUNDS = unionBounds([HOUSE_BOUNDS, PLOT, ...HEDGES]);

/**
 * Where the orbit target may be panned. Its +x face stops short of the wing
 * so, with cameras kept on the open -x/+z side, no camera enters the shell.
 */
export const TARGET_BOUNDS: Box = {
  min: [-6, 0.5, BACK + 0.26],
  max: [WING.x0 - 0.18, 3, FRONT + 2.5],
};

/** Orthographic shadow box for the key light, centered on the house. */
export function shadowFrustum(bounds: Box) {
  const center = [0, 1, 2].map(
    (i) => (bounds.min[i] + bounds.max[i]) / 2,
  ) as unknown as Vec3;
  const halfSize =
    Math.hypot(...[0, 1, 2].map((i) => bounds.max[i] - bounds.min[i])) / 2;
  const distance = halfSize * 1.5;
  return {
    center,
    halfSize,
    distance,
    near: 0.5,
    far: distance + halfSize + 1,
  };
}
