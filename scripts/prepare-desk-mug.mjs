#!/usr/bin/env node
// Derive public/world/models/desk-mug.glb from AoBlue_Moon's "Jack
// Skellington cup" (Sketchfab, CC BY 4.0), downloaded as GLB (coffee-card
// T3).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-desk-mug.mjs [source.glb]
//
// Defaults: source node_modules/.cache/world/jack-skellington-cup.glb.
// Nothing is downloaded and nothing is installed; no Blender step: the
// model is one hollow cup with its handle, so it ships as authored. The
// runtime stands it on the desk's coaster, scales it to a real mug and pours
// the coffee into it (src/lib/world/setup.ts SETUP_PROPS.mug, Setup.tsx).
//
// 1. Verify the source bytes.
// 2. Optimize with the CLI: meshopt geometry, the three 1024 px textures
//    re-encoded as WebP at no more than 1024 px, no simplification, no GPU
//    instancing. Same source, same CLI: the same bytes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "da2bed61e78406817431f3f7453e442ae08d918ea87c27fe90d95a7dd0a598e9";
const TARGET = join(ROOT, "public/world/models/desk-mug.glb");

const source = resolve(
  process.argv[2] ??
    join(ROOT, "node_modules/.cache/world/jack-skellington-cup.glb"),
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
    ...["--texture-size", "1024", "--simplify", "false", "--join", "true"],
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
