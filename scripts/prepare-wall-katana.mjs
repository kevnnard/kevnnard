#!/usr/bin/env node
// Derive public/world/models/wall-katana.glb from Mitchell Bekke's "Blossom
// Katana" (Sketchfab, CC BY 4.0), downloaded as GLB (katana-wall-shelf T3).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-wall-katana.mjs [source.glb]
//
// Defaults: source node_modules/.cache/world/blossom-katana-original.glb.
// Nothing is downloaded and nothing is installed; no Blender step: the
// model is already one tabletop katana stand (two katanas, one drawn, one
// sheathed, and an empty scabbard), so it ships as authored. The runtime
// turns it to face the room and fits it to the shelf
// (src/lib/world/katana-shelf.ts).
//
// 1. Verify the source bytes.
// 2. Optimize with the CLI: meshopt geometry, the 1024 px textures re-encoded
//    as WebP at their own size (capped at 2048 px), meshes sharing a material
//    joined, no simplification, no GPU instancing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "9197c171c39c29c4bc8a676f439860e49d5c5457e6dffcc30f9530949bf99a60";
const TARGET = join(ROOT, "public/world/models/wall-katana.glb");

const source = resolve(
  process.argv[2] ??
    join(ROOT, "node_modules/.cache/world/blossom-katana-original.glb"),
);
const cliDir = process.env.GLTF_TRANSFORM_CLI;
if (!cliDir)
  throw new Error("set GLTF_TRANSFORM_CLI to the cached CLI package");
const cliPackage = JSON.parse(
  readFileSync(join(cliDir, "package.json"), "utf8"),
);
if (cliPackage.version !== "4.5.1")
  throw new Error(`need @gltf-transform/cli 4.5.1, got ${cliPackage.version}`);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = sha256(readFileSync(source));
if (digest !== SOURCE_SHA256)
  throw new Error(`unexpected source ${source}: sha256 ${digest}`);

const cli = spawnSync(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    source,
    TARGET,
    ...["--compress", "meshopt", "--texture-compress", "webp"],
    ...["--texture-size", "2048", "--simplify", "false", "--join", "true"],
    ...["--instance", "false", "--palette", "false"],
  ],
  { stdio: "inherit" },
);
if (cli.status !== 0) throw new Error("glTF Transform optimize failed");

const shipped = readFileSync(TARGET);
const json = JSON.parse(
  shipped.toString("utf8", 20, 20 + shipped.readUInt32LE(12)),
);
let triangles = 0;
for (const mesh of json.meshes)
  for (const primitive of mesh.primitives)
    triangles += json.accessors[primitive.indices].count / 3;
process.stdout.write(
  `wrote ${TARGET} ${shipped.length} bytes sha256 ${sha256(shipped)} triangles ${triangles}\n`,
);
