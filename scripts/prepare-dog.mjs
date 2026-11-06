#!/usr/bin/env node
// Derive Cherry, the owner's Miniature Pinscher, rigged and animated, for
// /world: public/world/models/cherry.glb (dog-rig T1 rig, T3 ships it).
//
// Source: "Dog (Miniature Pinscher 小鹿犬)" by 3D Creator (Sketchfab, CC BY 4.0);
// see CREDIT, verified through the Sketchfab API (dog-rig L5).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-dog.mjs [source.zip]
//
// Default source: node_modules/.cache/world/dog-miniature-pinscher.zip, copied
// there from the owner's downloads. Ships public/world/models/cherry.glb
// (meshopt, WebP 1024 px; the "idle" and "run" clips); the working files go to
// node_modules/.cache/world/dog/: dog.staged.glb (plain glTF, loads in any
// Blender), dog.blend (rig + actions) and sheet-<clip>.png contact sheets.
// DOG_SLEEP=1 keys the dropped "sleep" clip again for a Blender preview and
// writes dog.preview.glb instead of the shipped file (dog-rig S8).
// Needs Blender 5.2 on PATH (or BLENDER) and unzip. Nothing is downloaded or
// installed: sharp and glTF Transform are resolved from the cached CLI package.
//
// 1. Verify the archive's bytes and unpack it into a fresh temporary directory.
//    The archive is data: nothing in it is run.
// 2. Blender (build): weld, orient (+x nose), 0.28 m at the withers, decimate to
//    ~12k triangles, 32-bone skeleton with automatic weights, the "run" and
//    "idle" clips; export the staged GLB and the .blend.
// 3. Optimize the staged GLB with the CLI (meshopt, WebP) into cherry.glb.
// 4. Blender (render): frames of each clip from the staged GLB, then one contact
//    sheet per clip (three-quarter row over a side row).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "51c00e2139ae94cb1a208375f03ea78f1fb44c78f28b1b790c11a840c8fa277f";
// Attribution the site shows (public/world/credits.json, dog-rig T3).
export const CREDIT = {
  title: "Dog (Miniature Pinscher 小鹿犬)",
  author: "3D Creator",
  authorUrl: "https://sketchfab.com/3DChuang-Ke-Ji",
  sourceUrl: "https://sketchfab.com/3d-models/5db9e974fb344f39b9d1baafbdbe264c",
  license: "CC BY 4.0",
};
const OUT = join(ROOT, "node_modules/.cache/world/dog");
const SCRIPT = join(ROOT, "scripts/prepare-dog.py");
// Frames rendered per clip (30 fps; each clip's last frame repeats its first).
// Views per clip: one sheet row each (default three-quarter over side).
const SLEEP = Boolean(process.env.DOG_SLEEP);
const SHEET_FRAMES = {
  ...(SLEEP && { sleep: [0, 30, 60, 90] }),
  run: [0, 3, 5, 8, 10, 13],
  idle: [0, 8, 15, 30, 45],
};
const VIEWS = { sleep: ["top", "side", "close", "face"] };
const viewsOf = (clip) => VIEWS[clip] ?? ["three-quarter", "side"];

const source = resolve(
  process.argv[2] ??
    join(ROOT, "node_modules/.cache/world/dog-miniature-pinscher.zip"),
);
const cliDir = process.env.GLTF_TRANSFORM_CLI;
if (!cliDir)
  throw new Error("set GLTF_TRANSFORM_CLI to the cached CLI package");
const cliPackage = JSON.parse(
  readFileSync(join(cliDir, "package.json"), "utf8"),
);
if (cliPackage.version !== "4.5.1")
  throw new Error(`need @gltf-transform/cli 4.5.1, got ${cliPackage.version}`);
const sharp = createRequire(join(cliDir, "package.json"))("sharp");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digest = sha256(readFileSync(source));
if (digest !== SOURCE_SHA256)
  throw new Error(`unexpected source ${source}: sha256 ${digest}`);

function run(command, argv, label, env = {}) {
  const result = spawnSync(command, argv, {
    encoding: "utf8",
    env: { ...process.env, BLENDERMCP_NO_UPDATE_CHECK: "1", ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${label} failed:\n${result.stdout?.slice(-2000)}\n${result.stderr?.slice(-2000)}`,
    );
  return result.stdout ?? "";
}
const blender = (mode, rest, env) => {
  const stdout = run(
    process.env.BLENDER ?? "blender",
    ["-b", "--factory-startup", "--python", SCRIPT, "--", mode, ...rest],
    `Blender ${mode}`,
    env,
  );
  for (const line of stdout.split("\n"))
    if (
      /^(PREPARED|CLIP|GROUND|WORST|CONTACT|MORPH|EYE|SETTLE|JOINTS|PAW|INTERSECT|RUMP) /.test(
        line,
      )
    )
      process.stdout.write(`${line}\n`);
};

// ---- 1. Unpack -------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "dog-"));
run("unzip", ["-o", "-q", source, "-d", work], "unzip");
const glb = join(work, "source/Miniature Pinscher.glb");

// ---- 2. Build --------------------------------------------------------------------

const staged = join(OUT, "dog.staged.glb");
blender("build", [glb, staged, join(OUT, "dog.blend")]);
const stagedBytes = readFileSync(staged);
process.stdout.write(
  `wrote ${staged} ${stagedBytes.length} bytes sha256 ${sha256(stagedBytes)}\n`,
);

// ---- 3. Optimize --------------------------------------------------------------------

const target = SLEEP
  ? join(OUT, "dog.preview.glb")
  : join(ROOT, "public/world/models/cherry.glb");
run(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    staged,
    target,
    ...["--compress", "meshopt", "--texture-compress", "webp"],
    ...["--texture-size", "1024", "--simplify", "false", "--join", "false"],
    ...["--instance", "false", "--palette", "false"],
  ],
  "glTF Transform optimize",
);
const shipped = readFileSync(target);
const json = JSON.parse(
  shipped.toString("utf8", 20, 20 + shipped.readUInt32LE(12)),
);
let triangles = 0;
for (const mesh of json.meshes)
  for (const primitive of mesh.primitives)
    triangles += json.accessors[primitive.indices].count / 3;
process.stdout.write(
  `wrote ${target} ${shipped.length} bytes sha256 ${sha256(shipped)} triangles ${triangles} clips ${json.animations.map((clip) => clip.name).join(",")}\n`,
);

// ---- 4. Contact sheets ---------------------------------------------------------------

const frames = join(work, "frames-");
blender(
  "render",
  [
    staged,
    frames,
    ...Object.entries(SHEET_FRAMES).map(
      ([c, f]) => `${c}:${f.join(",")}@${viewsOf(c).join(",")}`,
    ),
  ],
  { DOG_RENDER_SIZE: "640" },
);
const TILE = 320;
for (const [clip, list] of Object.entries(SHEET_FRAMES)) {
  const tiles = [];
  for (const [row, view] of viewsOf(clip).entries())
    for (const [col, frame] of list.entries())
      tiles.push({
        input: await sharp(
          `${frames}${clip}-${view}-${String(frame).padStart(3, "0")}.png`,
        )
          .resize(TILE, TILE)
          .png()
          .toBuffer(),
        left: col * TILE,
        top: row * TILE,
      });
  const sheet = join(OUT, `sheet-${clip}.png`);
  await sharp({
    create: {
      width: TILE * list.length,
      height: TILE * viewsOf(clip).length,
      channels: 3,
      background: { r: 12, g: 12, b: 13 },
    },
  })
    .composite(tiles)
    .png()
    .toFile(sheet);
  process.stdout.write(
    `wrote ${sheet} frames ${list.join(",")} views ${viewsOf(clip).join(",")}\n`,
  );
}
