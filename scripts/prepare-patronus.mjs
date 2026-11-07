#!/usr/bin/env node
// Derive public/world/models/patronus-lion.glb from keh's "Lion"
// (Sketchfab, CC BY 4.0, https://sketchfab.com/3d-models/c14548c4ac994b9981dbd31eb049e5a7;
// 4,380 triangles, one animation), the patronus's body (patronus T1, S2).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-patronus.mjs <source.glb | source.gltf>
//
// The owner downloaded it from Sketchfab (lion.glb, 561,132 bytes, asset
// extras: "Lion" by keh, CC-BY-4.0, one skin, one clip "Take 001"); copy it
// to a fresh cache directory first: downloads are untrusted. Nothing is
// downloaded and nothing is installed. PATRONUS.lion
// (src/lib/world/patronus.ts) names the result, credited in
// public/world/credits.json (and gallery_files in scripts/prepare-world.py).
//
// 1. Verify the source bytes.
// 2. With glTF Transform's core (beside the CLI): drop the texture, its
//    image and the UVs (the runtime draws the lion in the ghost material,
//    which needs neither), and pin the hip's sideways and forward sway in
//    the clip to its first key, so the lion stays on the run's path and
//    only bobs; written next to the source as lion-ghost.glb.
// 3. Optimize that with the CLI: meshopt geometry, the rig and its clip
//    kept, no simplification, no joining (the skinned mesh stays whole), no
//    GPU instancing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The owner's download (patronus T2). */
const SOURCE_SHA256 =
  "6eefa46861f47435f4a23111e877be11ccffaab49b1be0c273d24ab8cc2be7d2";
const TARGET = join(ROOT, "public/world/models/patronus-lion.glb");

if (!process.argv[2])
  throw new Error("usage: prepare-patronus.mjs <source.glb | source.gltf>");
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
    const uv = primitive.getAttribute("TEXCOORD_0");
    primitive.setAttribute("TEXCOORD_0", null);
    if (uv && uv.listParents().length === 1) uv.dispose();
  }
// The hip's translation: local x is sideways and local y forward (the
// root bone turns it upright); local z, the height, keeps its bob.
let pinned = 0;
for (const animation of root.listAnimations())
  for (const channel of animation.listChannels()) {
    if (
      channel.getTargetNode()?.getName() !== "b_Hip_01" ||
      channel.getTargetPath() !== "translation"
    )
      continue;
    const output = channel.getSampler().getOutput();
    const values = output.getArray().slice();
    for (let i = 0; i < values.length; i += 3) {
      values[i] = values[0];
      values[i + 1] = values[1];
    }
    output.setArray(values);
    pinned++;
  }
if (pinned !== 1) throw new Error(`expected one hip track, got ${pinned}`);
const ghost = join(dirname(source), "lion-ghost.glb");
await io.write(ghost, document);

const cli = spawnSync(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    ghost,
    TARGET,
    ...["--compress", "meshopt", "--simplify", "false", "--join", "false"],
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
