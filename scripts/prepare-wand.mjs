#!/usr/bin/env node
// Derive public/world/models/elder-wand.glb from Heniqueish's "Elder Wand"
// (Sketchfab, CC BY 4.0), downloaded as GLB (patronus T1, L1).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-wand.mjs [source.glb]
//
// Defaults: source node_modules/.cache/world/elder-wand-original.glb.
// Nothing is downloaded and nothing is installed; no Blender step: the
// model is one wand, 2 units along x with the tip at -x, so it ships as
// authored. The runtime scales it to 38 cm and lays it on its stand on the
// collection shelf (src/lib/world/wand.ts).
//
// 1. Verify the source bytes.
// 2. Optimize with the CLI: meshopt geometry, the three textures re-encoded
//    as WebP at 1024 px at most, no simplification, no GPU instancing.
//
// Harry Potter, the Elder Wand and Expecto Patronum belong to Warner Bros.
// and J.K. Rowling; fan tribute, no affiliation.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "0c1fc4f8e5ea652fe60207cf4ba1f3c35a522727b9bdd0e3d355951902671c0f";
const TARGET = join(ROOT, "public/world/models/elder-wand.glb");

const source = resolve(
  process.argv[2] ??
    join(ROOT, "node_modules/.cache/world/elder-wand-original.glb"),
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
