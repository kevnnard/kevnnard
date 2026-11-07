#!/usr/bin/env node
// Derive public/world/models/patronus-lion.glb from keh's "Lion"
// (Sketchfab, CC BY 4.0, https://sketchfab.com/3d-models/c14548c4ac994b9981dbd31eb049e5a7;
// 4,380 triangles, one animation), the patronus's body (patronus T1, S2).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-patronus.mjs <source.glb | source.gltf>
//
// The owner downloads it from Sketchfab (it needs a login); copy it, or the
// extracted archive, to a fresh cache directory first: downloads are
// untrusted. Nothing is downloaded and nothing is installed. Until the
// source bytes are pinned below the script only prints their sha256 and
// stops; pin it, run again, then set PATRONUS.lion
// (src/lib/world/patronus.ts) to "/world/models/patronus-lion.glb" and
// credit the file in public/world/credits.json (and gallery_files in
// scripts/prepare-world.py).
//
// 1. Verify the source bytes.
// 2. Optimize with the CLI: meshopt geometry, the rig and its clip kept,
//    textures (unused: the runtime draws it in the ghost material) shrunk
//    to 256 px WebP, no simplification, no joining (the skinned mesh stays
//    whole), no GPU instancing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Pinned once the owner's download is here; null until then. */
const SOURCE_SHA256 = null;
const TARGET = join(ROOT, "public/world/models/patronus-lion.glb");

if (!process.argv[2])
  throw new Error("usage: prepare-patronus.mjs <source.glb | source.gltf>");
const source = resolve(process.argv[2]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = sha256(readFileSync(source));
if (SOURCE_SHA256 === null) {
  process.stdout.write(
    `source ${source} sha256 ${digest}: pin it as SOURCE_SHA256, then run again\n`,
  );
  process.exit(2);
}
if (digest !== SOURCE_SHA256)
  throw new Error(`unexpected source ${source}: sha256 ${digest}`);

const cliDir = process.env.GLTF_TRANSFORM_CLI;
if (!cliDir)
  throw new Error("set GLTF_TRANSFORM_CLI to the cached CLI package");
const cliPackage = JSON.parse(
  readFileSync(join(cliDir, "package.json"), "utf8"),
);
if (cliPackage.version !== "4.5.1")
  throw new Error(`need @gltf-transform/cli 4.5.1, got ${cliPackage.version}`);

const cli = spawnSync(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    source,
    TARGET,
    ...["--compress", "meshopt", "--texture-compress", "webp"],
    ...["--texture-size", "256", "--simplify", "false", "--join", "false"],
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
const clips = (json.animations ?? []).map((clip) => clip.name).join(", ");
process.stdout.write(
  `wrote ${TARGET} ${shipped.length} bytes sha256 ${sha256(shipped)} triangles ${triangles} clips ${clips}\n`,
);
