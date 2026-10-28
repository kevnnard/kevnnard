import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

export const PUBLIC = new URL("../../public/world/", import.meta.url);
export const MODELS = new URL("models/", PUBLIC);

export interface GlbInfo {
  bytes: number;
  triangles: number;
  primitives: number;
  materials: string[];
  extensions: string[];
}

/** Shipped model files, relative to public/world/ (e.g. "models/pine.glb"). */
export function shippedModels(): string[] {
  return readdirSync(MODELS)
    .filter((name) => name.endsWith(".glb"))
    .sort()
    .map((name) => `models/${name}`);
}

/** Reads the JSON chunk of a self-contained GLB; counts come from accessors. */
export function glbInfo(file: string): GlbInfo {
  const buffer = readFileSync(new URL(file, PUBLIC));
  assert.equal(buffer.toString("utf8", 0, 4), "glTF", `${file} is not a GLB`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${file} is truncated`);
  const json = JSON.parse(
    buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
  );
  assert.ok(
    (json.buffers ?? []).every((entry: { uri?: string }) => !entry.uri),
    `${file} must not reference external buffers`,
  );
  assert.ok(
    (json.images ?? []).every((image: { uri?: string }) => !image.uri),
    `${file} must embed its textures`,
  );
  let triangles = 0;
  let primitives = 0;
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) {
      primitives++;
      triangles += json.accessors[primitive.indices].count / 3;
    }
  return {
    bytes: buffer.length,
    triangles,
    primitives,
    materials: (json.materials ?? []).map(
      (material: { name?: string }) => material.name ?? "",
    ),
    extensions: json.extensionsUsed ?? [],
  };
}
