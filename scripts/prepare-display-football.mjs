#!/usr/bin/env node
// Write public/world/models/display-football-helmet.glb from the original
// SpeedFlex-inspired builder in src/lib/world/football-helmet-asset.ts
// (collection-display-models T5). The builder owns the geometry, the UVs and
// the livery atlas; this wrapper only attaches them to a glTF document and
// optimizes it.
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-display-football.mjs
//
// Nothing is downloaded and nothing is installed: glTF Transform and sharp
// are resolved from the cached CLI package (the `pnpm dlx` cache). Work files
// and an inspectable copy of the flat livery atlas go to
// node_modules/.cache/world/speedflex/. Two runs produce the same bytes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILDER = join(ROOT, "src/lib/world/football-helmet-asset.ts");
const TARGET = join(ROOT, "public/world/models/display-football-helmet.glb");
const WORK = join(ROOT, "node_modules/.cache/world/speedflex");

const cliDir = process.env.GLTF_TRANSFORM_CLI;
if (!cliDir)
  throw new Error("set GLTF_TRANSFORM_CLI to the cached CLI package");
const cliPackage = JSON.parse(
  readFileSync(join(cliDir, "package.json"), "utf8"),
);
if (cliPackage.version !== "4.5.1")
  throw new Error(`need @gltf-transform/cli 4.5.1, got ${cliPackage.version}`);
const require = createRequire(join(cliDir, "package.json"));
const { Document, NodeIO } = require("@gltf-transform/core");
const sharp = require("sharp");

const { buildFootballHelmet, HELMET_MATERIALS } = await import(
  pathToFileURL(BUILDER).href
);
const helmet = buildFootballHelmet("full");

const png = ({ width, height, data }) =>
  sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

const doc = new Document();
doc.getRoot().getAsset().generator = "scripts/prepare-display-football.mjs";
const buffer = doc.createBuffer();
const atlas = doc
  .createTexture("football-livery")
  .setImage(await png(helmet.atlas))
  .setMimeType("image/png");
const surface = doc
  .createTexture("football-livery-surface")
  .setImage(await png(helmet.surface))
  .setMimeType("image/png");

const materials = new Map();
for (const [name, spec] of Object.entries(HELMET_MATERIALS)) {
  const material = doc
    .createMaterial(name)
    .setBaseColorFactor(spec.color)
    .setRoughnessFactor(spec.roughness)
    .setMetallicFactor(spec.metalness)
    .setDoubleSided(Boolean(spec.doubleSided));
  if (spec.textured)
    material.setBaseColorTexture(atlas).setMetallicRoughnessTexture(surface);
  if (spec.blend) material.setAlphaMode("BLEND");
  materials.set(name, material);
}

const accessor = (type, array) =>
  doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const root = doc.createNode("football-helmet");
doc.createScene("football-helmet").addChild(root);
for (const part of helmet.parts) {
  const indices =
    part.positions.length / 3 <= 65535
      ? Uint16Array.from(part.indices)
      : part.indices;
  const primitive = doc
    .createPrimitive()
    .setMaterial(materials.get(part.material))
    .setIndices(accessor("SCALAR", indices))
    .setAttribute("POSITION", accessor("VEC3", part.positions))
    .setAttribute("NORMAL", accessor("VEC3", part.normals));
  if (part.uvs)
    primitive.setAttribute("TEXCOORD_0", accessor("VEC2", part.uvs));
  root.addChild(
    doc
      .createNode(part.name)
      .setMesh(doc.createMesh(part.name).addPrimitive(primitive)),
  );
}

mkdirSync(WORK, { recursive: true });
const staged = join(WORK, "display-football-helmet.glb");
await new NodeIO().write(staged, doc);
// The flat livery atlas, for inspection: exactly what the shell's UVs map.
const flat = join(WORK, "football-livery.webp");
writeFileSync(
  flat,
  await sharp(Buffer.from(helmet.atlas.data), {
    raw: {
      width: helmet.atlas.width,
      height: helmet.atlas.height,
      channels: 4,
    },
  })
    .removeAlpha()
    .webp({ lossless: true })
    .toBuffer(),
);
process.stdout.write(`wrote ${staged}\nwrote ${flat}\n`);

const cli = spawnSync(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    staged,
    TARGET,
    ...["--compress", "meshopt", "--texture-compress", "webp"],
    ...["--texture-size", "2048", "--simplify", "false", "--join", "false"],
    ...["--instance", "false", "--palette", "false"],
  ],
  { stdio: "inherit" },
);
if (cli.status !== 0) throw new Error("glTF Transform optimize failed");
const shipped = readFileSync(TARGET);
process.stdout.write(
  `wrote ${TARGET} ${shipped.length} bytes sha256 ${createHash("sha256").update(shipped).digest("hex")}\n`,
);
