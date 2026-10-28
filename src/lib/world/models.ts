// Shipped world models (written by scripts/prepare-world.py, credited in
// public/world/credits.json) and the render budget the tests enforce.

import { KIND_SPECS, type NatureKind } from "./layout.ts";

export const MODEL_FILES = Object.fromEntries(
  Object.keys(KIND_SPECS).map((kind) => [kind, `/world/models/${kind}.glb`]),
) as Record<NatureKind, string>;

/** Draws outside the instanced models: sky, stars, grass, rock and pad. */
export const SCENE_DRAWS = 5;

/** Triangles per frame (all instances), main-pass draw calls, model bytes. */
export const BUDGET = {
  triangles: 60_000,
  draws: 40,
  bytes: 700_000,
} as const;
