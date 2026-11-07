#!/usr/bin/env node
// Derive public/world/models/patronus-lion.glb from Walter Araujo's
// "Lion run" (Sketchfab, CC BY 4.0,
// https://sketchfab.com/3d-models/lion-run-1e846f8989b44d26874e2482e0f90876;
// 19,154 triangles, a 37-joint rig and one in-place gallop, "rig|run"), the
// patronus's body (patronus T7, which replaced keh's "Lion").
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-patronus.mjs <source.glb>
//
// The owner downloaded it from Sketchfab (lion_run.glb, 5,350,248 bytes,
// asset extras: "Lion run" by Walter Araujo, CC-BY-4.0); copy it to a fresh
// cache directory first: downloads are untrusted. Nothing is downloaded and
// nothing is installed. PATRONUS.lion (src/lib/world/patronus.ts) names the
// result, credited in public/world/credits.json (and gallery_files in
// scripts/prepare-world.py).
//
// 1. Verify the source bytes.
// 2. With glTF Transform's core (beside the CLI): drop the texture, its
//    image, the UVs and the normals (the runtime draws the lion in the ghost
//    material, which needs no texture, and recomputes smooth normals for its
//    rim); without the flat normals the vertices weld, from about 56,000 to
//    a few thousand, so the mesh can be simplified. Written next to the
//    source as lion-ghost.glb.
//    The gallop only rotates bones (no root motion), so the lion stays on
//    the run's path with nothing pinned.
// 3. Optimize that with the CLI: meshopt geometry, the rig and its clip
//    kept, simplified to about half its triangles (a glowing ghost seen
//    across the room needs no more), no joining (the skinned mesh stays
//    whole), no GPU instancing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The owner's download (patronus T7). */
const SOURCE_SHA256 =
  "0f0d870212c30e79ca45fed40d4404a37416aee7937da1dc6c1925528c7f7c2d";
const TARGET = join(ROOT, "public/world/models/patronus-lion.glb");

if (!process.argv[2])
  throw new Error("usage: prepare-patronus.mjs <source.glb>");
const source = resolve(process.argv[2]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = sha256(readFileSync(source));
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

const { NodeIO } = await import(
  pathToFileURL(join(cliDir, "../core/dist/index.js")).href
);
const io = new NodeIO();
const document = await io.read(source);
const root = document.getRoot();
for (const material of root.listMaterials()) material.setBaseColorTexture(null);
for (const texture of root.listTextures()) texture.dispose();
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    for (const name of ["TEXCOORD_0", "NORMAL"]) {
      const attribute = primitive.getAttribute(name);
      primitive.setAttribute(name, null);
      if (attribute && attribute.listParents().length === 1)
        attribute.dispose();
    }
  }
const ghost = join(dirname(source), "lion-ghost.glb");
await io.write(ghost, document);

const cli = spawnSync(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    ghost,
    TARGET,
    ...["--compress", "meshopt", "--join", "false"],
    ...[
      "--simplify",
      "true",
      "--simplify-ratio",
      "0.5",
      "--simplify-error",
      "0.01",
    ],
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
