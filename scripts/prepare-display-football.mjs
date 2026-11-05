#!/usr/bin/env node
// Derive public/world/models/display-football-helmet.glb from Exodusks'
// "Buffalo Bills Helmet", a Riddell SpeedFlex (Sketchfab, CC BY 4.0), downloaded
// signed-in as GLB (collection-display-models T7).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-display-football.mjs [source.glb]
//
// Defaults: source node_modules/.cache/world/speedflex-bills-original.glb; work
// files go to node_modules/.cache/world/speedflex/. Needs Blender 5.2 on PATH
// (or BLENDER). Nothing is downloaded and nothing is installed: glTF Transform
// and sharp are resolved from the cached CLI package.
//
// 1. Verify the source bytes.
// 2. Paint the livery atlas in (azimuth, elevation): metallic gold with a wide
//    black Rams-style horn a side (pointed at the forehead, over the crown, down
//    the back, under and around the ear hole) and a small block #32 low on the
//    back above the bumper, as NFL helmets carry it. The horn path is redrawn
//    after a photo of a Rams helmet (Wikimedia Commons "File:LA RAMS Helmet.jpg"),
//    in the owner's colors; no team logo is shipped.
// 3. Run scripts/prepare-display-football.py in Blender: drop the Bills decals,
//    project the atlas onto the shell, paint the cage and trim black, add the
//    smoked eye shield, decimate the padding and export six named parts.
// 4. Optimize with the CLI (meshopt, 2048 px WebP).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "064297188d088fdcdcbdd2081ab367b48268e82abc281aab1f06918b08a0bccc";
const TARGET = join(ROOT, "public/world/models/display-football-helmet.glb");
const WORK = join(ROOT, "node_modules/.cache/world/speedflex");

const source = resolve(
  process.argv[2] ??
    join(ROOT, "node_modules/.cache/world/speedflex-bills-original.glb"),
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

// ---- Livery atlas ----------------------------------------------------------

const DEG = Math.PI / 180;
const EL_MIN = -72 * DEG;
const W = 2048;
const H = 1024;
const GOLD = { color: [206, 170, 92], roughness: 0.22, metalness: 0.95 };
const BLACK = { color: [12, 12, 14], roughness: 0.4, metalness: 0 };

/** Right horn's centre line: azimuth, elevation and full width, degrees. */
const HORN = [
  [16, 12, 1],
  [27, 24, 6],
  [40, 37, 13],
  [62, 49, 23],
  [98, 52, 32],
  [130, 40, 34],
  [144, 18, 28],
  [146, -6, 27],
  [139, -27, 24],
  [128, -38, 22],
  [106, -42, 19],
  [86, -36, 16],
  [78, -20, 14],
  [84, -4, 12],
  [100, 4, 10],
  [118, 0, 8],
  [124, -14, 6],
  [118, -24, 2],
];

const unit = (az, el) => [
  Math.cos(el) * Math.cos(az),
  Math.sin(el),
  Math.cos(el) * Math.sin(az),
];
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

/** Catmull-Rom through the control points, `steps` per span. */
function smooth(points, steps) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push(
        p1.map(
          (_, k) =>
            0.5 *
            (2 * p1[k] +
              (p2[k] - p0[k]) * t +
              (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
              (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t),
        ),
      );
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const line = smooth(HORN, 10);
const segments = [];
for (const sign of [1, -1])
  for (let i = 0; i < line.length - 1; i++) {
    const [az0, el0, w0] = line[i];
    const [az1, el1, w1] = line[i + 1];
    const a = unit(sign * az0 * DEG, el0 * DEG);
    const b = unit(sign * az1 * DEG, el1 * DEG);
    const r0 = (w0 / 2) * DEG;
    const r1 = (w1 / 2) * DEG;
    // Chord-space bounds, widened by the larger half width, to skip far segments.
    const pad = Math.max(r0, r1);
    segments.push({
      a,
      b,
      r0,
      r1,
      lo: a.map((c, k) => Math.min(c, b[k]) - pad),
      hi: a.map((c, k) => Math.max(c, b[k]) + pad),
    });
  }

/** Whether a unit direction lies on a horn. */
function onHorn(p) {
  for (const { a, b, r0, r1, lo, hi } of segments) {
    if (
      p[0] < lo[0] ||
      p[0] > hi[0] ||
      p[1] < lo[1] ||
      p[1] > hi[1] ||
      p[2] < lo[2] ||
      p[2] > hi[2]
    )
      continue;
    const ab = sub(b, a);
    const len = dot(ab, ab);
    const t =
      len === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len));
    const d = sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
    if (Math.sqrt(dot(d, d)) <= r0 + (r1 - r0) * t) return true;
  }
  return false;
}

// Player number: block digits centred low on the back, above the bumper.
const NUMBER = "32";
const NUM_TOP = -5 * DEG;
const NUM_HEIGHT = 15 * DEG;
const NUM_WIDTH = 24 * DEG;
const MW = 480;
const MH = 300;
const numberMask = await sharp(
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MW}" height="${MH}"><rect width="100%" height="100%" fill="black"/><text x="50%" y="88%" text-anchor="middle" font-family="Nimbus Sans Narrow" font-weight="bold" font-size="${MH * 1.12}" fill="white">${NUMBER}</text></svg>`,
  ),
)
  .greyscale()
  .raw()
  .toBuffer();

function onNumber(az, el) {
  const back = az - Math.PI * Math.sign(az || 1);
  const x = 0.5 - (back * Math.cos(el)) / NUM_WIDTH;
  const y = (NUM_TOP - el) / NUM_HEIGHT;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  return numberMask[Math.floor(y * MH) * MW + Math.floor(x * MW)] > 127;
}

const atlas = Buffer.alloc(W * H * 3);
const SW = W / 2;
const SH = H / 2;
const rough = new Float64Array(SW * SH);
const metal = new Float64Array(SW * SH);
const SS = 2;
for (let row = 0; row < H; row++)
  for (let col = 0; col < W; col++) {
    const sum = [0, 0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const az = ((col + (sx + 0.5) / SS) / W - 0.5) * 2 * Math.PI;
        const el =
          Math.PI / 2 - ((row + (sy + 0.5) / SS) / H) * (Math.PI / 2 - EL_MIN);
        const paint = onNumber(az, el) || onHorn(unit(az, el)) ? BLACK : GOLD;
        sum[0] += paint.color[0];
        sum[1] += paint.color[1];
        sum[2] += paint.color[2];
        sum[3] += paint.roughness;
        sum[4] += paint.metalness;
      }
    const n = SS * SS;
    const i = (row * W + col) * 3;
    atlas[i] = Math.round(sum[0] / n);
    atlas[i + 1] = Math.round(sum[1] / n);
    atlas[i + 2] = Math.round(sum[2] / n);
    const si = (row >> 1) * SW + (col >> 1);
    rough[si] += sum[3] / n / 4;
    metal[si] += sum[4] / n / 4;
  }
const surface = Buffer.alloc(SW * SH * 3);
for (let i = 0; i < SW * SH; i++) {
  surface[i * 3 + 1] = Math.round(rough[i] * 255);
  surface[i * 3 + 2] = Math.round(metal[i] * 255);
}

mkdirSync(WORK, { recursive: true });
const liveryPng = join(WORK, "football-livery.png");
const surfacePng = join(WORK, "football-livery-surface.png");
await sharp(atlas, { raw: { width: W, height: H, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile(liveryPng);
await sharp(surface, { raw: { width: SW, height: SH, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toFile(surfacePng);
process.stdout.write(`wrote ${liveryPng}\nwrote ${surfacePng}\n`);

// ---- Blender, then the CLI -------------------------------------------------

const staged = join(WORK, "display-football-helmet.glb");
const blender = spawnSync(
  process.env.BLENDER ?? "blender",
  [
    "-b",
    "--factory-startup",
    "--python",
    join(ROOT, "scripts/prepare-display-football.py"),
    "--",
    source,
    liveryPng,
    surfacePng,
    staged,
  ],
  {
    encoding: "utf8",
    env: { ...process.env, BLENDERMCP_NO_UPDATE_CHECK: "1" },
  },
);
const prepared = /PREPARED .*/.exec(blender.stdout ?? "");
if (blender.status !== 0 || !prepared)
  throw new Error(
    `Blender failed:\n${blender.stdout?.slice(-2000)}\n${blender.stderr?.slice(-2000)}`,
  );
process.stdout.write(`${prepared[0]}\n`);

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
  `wrote ${TARGET} ${shipped.length} bytes sha256 ${sha256(shipped)}\n`,
);
