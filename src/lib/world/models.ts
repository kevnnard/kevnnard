// Shipped world models (written by scripts/prepare-world.py, credited in
// public/world/credits.json) and the render budget the tests enforce.

import { CLOUD_SHAPES } from "./clouds.ts";
import { KIND_SPECS, type NatureKind } from "./layout.ts";
import { LIVING_FILES } from "./living.ts";
import { BRUNO_FILES } from "./setup.ts";

export const MODEL_FILES = Object.fromEntries(
  Object.keys(KIND_SPECS).map((kind) => [kind, `/world/models/${kind}.glb`]),
) as Record<NatureKind, string>;

/**
 * Single props outside the island layout: steam (T4i), living area (T4j),
 * Bruno's chair and desk overlays (T4k).
 */
export const PROP_FILES = {
  coffeeSteam: "/world/models/coffee-steam.glb",
  ...LIVING_FILES,
  ...BRUNO_FILES,
} as const;

/**
 * Draws outside the instanced models: sky, stars, grass, rock and pad, plus
 * the procedural flowers (stems with centers, and petals) and one instanced
 * draw per procedural cloud shape.
 */
export const SCENE_DRAWS = 7 + CLOUD_SHAPES;

/** Triangles per frame (all instances), main-pass draw calls, model bytes. */
export const BUDGET = {
  triangles: 60_000,
  draws: 40,
  bytes: 700_000,
} as const;
