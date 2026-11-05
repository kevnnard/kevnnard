#!/usr/bin/env node
// Derive public/world/models/display-offroad-helmet.glb from
// senoaji's "Fox X Supreme Helmet" (Sketchfab, CC BY 4.0,
// https://sketchfab.com/3d-models/fox-x-supreme-helmet-ac680d32d02b4a9cb769d29f4f545609),
// textured from studio photos of the owner's helmet model, the Fox V1 "Sayak"
// 2018 in red (collection-display-models T15).
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-display-offroad-fox.mjs [source.zip] [--fit]
//
// Defaults: source node_modules/.cache/world/fox-x-supreme-original.zip;
// photos node_modules/.cache/world/fox-x-supreme/photos/sayak-1..5.jpg (or
// FOX_PHOTOS), copied there from the owner's downloads. Work files, the staged
// and preview GLBs and the renders go to node_modules/.cache/world/fox-x-supreme/;
// the optimized GLB ships to public/world/models/. Needs Blender
// 5.2 on PATH (or BLENDER) and unzip. Nothing is downloaded and nothing is
// installed: sharp and glTF Transform are resolved from the cached CLI package.
//
// 1. Verify the source bytes and the five photos' bytes, and unpack the
//    archive, and the OBJ archive inside it, into work/. The archive is data:
//    nothing in it is run.
// 2. Blender (dump): every textured shell triangle with its UVs and its
//    corners in the final helmet frame (metres, +x chin, +y up, +z the
//    wearer's right).
// 3. Bake a new 2048 px shell atlas by projecting the five product photos:
//    each photo has an orthographic camera fitted to its helmet silhouette
//    (--fit refits them; the values are pinned in CAMERAS). Each texel's 3D
//    point is projected into every photo where a depth buffer shows it
//    visible; views are weighted by facing and distance from the silhouette,
//    the best-facing view dominates, bright studio highlights are clamped
//    toward the local colour, and unseen texels fall back to red or black.
// 4. Blender (build): swap the shell texture, drop the goggles, give the
//    liner its own material, export the staged GLB centred, chin on +x, crown
//    up, 0.30 m tall.
// 5. Optimize with the CLI (meshopt, 2048 px WebP) into
//    display-offroad-helmet.preview.glb, and ship the same bytes.
// 6. Blender (render): the staged GLB through each fitted camera, a contact
//    sheet and photo/render pairs (compare-*.png).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "fa74e45ffc828a418163ba9c8ac3dc0ee1ca77a791c0ebffe1731107c4bd2935";
const OUT = join(ROOT, "node_modules/.cache/world/fox-x-supreme");
const TARGET = join(ROOT, "public/world/models/display-offroad-helmet.glb");
// sha256 of the five Sayak product photos the bake projects (CAMERAS order).
const PHOTO_SHA256 = {
  "sayak-1.jpg":
    "83c7477a20a75f8ab0cf162e54e1b1b851aa9974bbf4f618007fea7b160f3a38",
  "sayak-2.jpg":
    "744345bb25868c8d06cb7468296674e97bf8aee65157ad0cc4aef4a69e971249",
  "sayak-3.jpg":
    "b434d9cf1171d8ea83e73e72d7797696e3812582665544f6f8408aaa8e58700c",
  "sayak-4.jpg":
    "6f55f68aa97f548aa0767f274e0616d62c4448788a11e92f9e0f9cdf3af402db",
  "sayak-5.jpg":
    "f8e7ca60740b2fec9b53d41de4f6ae626fc61e1c09966aae0b79ed5c971ea530",
};
const WORK = join(OUT, "work");
const SCRIPT = join(ROOT, "scripts/prepare-display-offroad-fox.py");

const args = process.argv.slice(2);
const source = resolve(
  args.find((arg) => !arg.startsWith("--")) ??
    join(ROOT, "node_modules/.cache/world/fox-x-supreme-original.zip"),
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

function run(command, argv, label) {
  const result = spawnSync(command, argv, {
    encoding: "utf8",
    env: { ...process.env, BLENDERMCP_NO_UPDATE_CHECK: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${label} failed:\n${result.stdout?.slice(-2000)}\n${result.stderr?.slice(-2000)}`,
    );
  return result.stdout ?? "";
}
const blender = (mode, ...rest) => {
  const stdout = run(
    process.env.BLENDER ?? "blender",
    ["-b", "--factory-startup", "--python", SCRIPT, "--", mode, ...rest],
    `Blender ${mode}`,
  );
  const lines = stdout.split("\n").filter((l) => /^[A-Z]+ /.test(l));
  for (const line of lines.filter((l) =>
    /^(DUMPED|PREPARED|RENDERED) /.test(l),
  ))
    process.stdout.write(`${line}\n`);
  return lines;
};

// ---- 1. Unpack ---------------------------------------------------------------

mkdirSync(WORK, { recursive: true });
run("unzip", ["-o", "-q", source, "-d", WORK], "unzip");
run(
  "unzip",
  [
    "-o",
    "-q",
    join(WORK, "source/Fox X Supreme.zip"),
    "-d",
    join(WORK, "source"),
  ],
  "unzip",
);
const obj = join(WORK, "source/Fox X Supreme.obj");

// ---- 2. Surface ----------------------------------------------------------------

const surfaceJson = join(OUT, "surface.json");
blender("dump", obj, surfaceJson);
const { triangles } = JSON.parse(readFileSync(surfaceJson, "utf8"));

// Connected parts, welded by position: outer shell, liner, peak, crown vent.
const weld = new Map();
const parent = [];
const find = (i) => {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
};
const vertex = (p) => {
  const key = p.map((c) => c.toFixed(4)).join();
  if (!weld.has(key)) {
    weld.set(key, parent.length);
    parent.push(parent.length);
  }
  return weld.get(key);
};
const corners = triangles.map((t) => t.p.map(vertex));
for (const [a, b, c] of corners) {
  parent[find(a)] = find(b);
  parent[find(b)] = find(c);
}
const groups = new Map();
corners.forEach((c, t) => {
  const r = find(c[0]);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(t);
});
const bySize = [...groups.values()].sort((a, b) => b.length - a.length);
const sizes = bySize.map((g) => g.length).join();
if (sizes !== "1928,888,512,64") throw new Error(`unexpected parts ${sizes}`);
const PART_NAMES = ["shell", "liner", "peak", "crown-vent"];
const partOf = new Array(triangles.length);
bySize.forEach((g, k) => {
  for (const t of g) partOf[t] = PART_NAMES[k];
});

// ---- 3. Photo projection ---------------------------------------------------------

// Studio product photos of the owner's helmet model, the Fox V1 "Sayak" 2018
// in red (Motocard, 1400 px, white background). They are projected onto the
// shell as they are, marks included; the photos themselves are never shipped.
const PHOTO_DIR = resolve(process.env.FOX_PHOTOS ?? join(OUT, "photos"));
for (const [name, expected] of Object.entries(PHOTO_SHA256)) {
  const got = sha256(readFileSync(join(PHOTO_DIR, name)));
  if (got !== expected)
    throw new Error(`unexpected photo ${name}: sha256 ${got}`);
}
const PHOTO_SIZE = 1400;
// Orthographic cameras fitted to each photo's helmet silhouette (run with
// --fit to refit from these values): yaw from +x toward +z and pitch of the
// direction to the camera, roll of the image, pixels per metre, and the image
// position of the helmet frame's origin.
const CAMERAS = [
  // Silhouette IoU after the fit: 0.931, 0.930, 0.933, 0.968, 0.939.
  {
    name: "three-quarter",
    photo: "sayak-1.jpg",
    yaw: -49.17,
    pitch: 14.61,
    roll: -7.48,
    s: 3957.81,
    cx: 684.71,
    cy: 570.27,
  },
  {
    name: "front",
    photo: "sayak-2.jpg",
    yaw: 0.62,
    pitch: 21.42,
    roll: 0.68,
    s: 4153.68,
    cx: 699.33,
    cy: 567.43,
  },
  {
    name: "side",
    photo: "sayak-3.jpg",
    yaw: 62.51,
    pitch: 19.36,
    roll: 12.07,
    s: 3816.73,
    cx: 691.85,
    cy: 564.17,
  },
  {
    name: "back",
    photo: "sayak-4.jpg",
    yaw: 179.98,
    pitch: -4,
    roll: -0.31,
    s: 4688.91,
    cx: 698.02,
    cy: 665.93,
  },
  {
    name: "top",
    photo: "sayak-5.jpg",
    yaw: -9.62,
    pitch: 89.97,
    roll: -9.28,
    s: 3646.51,
    cx: 700.21,
    cy: 715.29,
  },
];
const fit = args.includes("--fit");

const unit = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((c) => c / l);
};
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Image basis of a camera: right, up, and the direction toward the camera. */
function basis({ yaw, pitch, roll }) {
  const [y, p, r] = [yaw, pitch, roll].map((d) => (d * Math.PI) / 180);
  const dir = [
    Math.cos(p) * Math.cos(y),
    Math.sin(p),
    Math.cos(p) * Math.sin(y),
  ];
  const f = dir.map((c) => -c);
  const right0 = unit(cross(f, [0, 1, 0]));
  const up0 = cross(right0, f);
  const right = right0.map((c, k) => c * Math.cos(r) + up0[k] * Math.sin(r));
  const up = up0.map((c, k) => c * Math.cos(r) - right0[k] * Math.sin(r));
  return { right, up, dir };
}

/** Helmet mask: near-white pixels flood-filled from the border are background. */
function segment(data, w, h) {
  const mask = new Uint8Array(w * h).fill(1);
  const white = (i) =>
    Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) > 236;
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (!mask[i] || !white(i)) continue;
    mask[i] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return mask;
}

/** Chamfer distance (pixels) from each helmet pixel to the background. */
function edgeDistance(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 1e6 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - w] + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y < h - 1) d[i] = Math.min(d[i], d[i + w] + 1);
    }
  return d;
}

/** Fill every triangle projected by `project` into a w x h raster. */
function rasterizeTriangles(project, w, h, visit) {
  for (const tri of triangles) {
    const q = tri.p.map(project);
    const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0])));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1])));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
    const area =
      (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) -
      (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
    if (Math.abs(area) < 1e-12) continue;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w1 =
          ((px - q[0][0]) * (q[2][1] - q[0][1]) -
            (q[2][0] - q[0][0]) * (py - q[0][1])) /
          area;
        const w2 =
          ((q[1][0] - q[0][0]) * (py - q[0][1]) -
            (px - q[0][0]) * (q[1][1] - q[0][1])) /
          area;
        const w0 = 1 - w1 - w2;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        visit(y * w + x, w0 * q[0][2] + w1 * q[1][2] + w2 * q[2][2]);
      }
  }
}

const projector = (cam, k = 1) => {
  const { right, up, dir } = basis(cam);
  return (p) => [
    (cam.cx + cam.s * dot(p, right)) / k,
    (cam.cy - cam.s * dot(p, up)) / k,
    dot(p, dir),
  ];
};

/** 1 - IoU of the shell's silhouette and the photo's helmet mask. */
function silhouetteLoss(cam, mask, w, k) {
  const sil = new Uint8Array(w * w);
  rasterizeTriangles(projector(cam, k), w, w, (i) => {
    sil[i] = 1;
  });
  let both = 0;
  let either = 0;
  for (let i = 0; i < w * w; i++) {
    both += sil[i] & mask[i];
    either += sil[i] | mask[i];
  }
  return 1 - both / either;
}

/** Nelder-Mead over yaw, pitch, roll, s, cx, cy. */
function fitCamera(cam, mask, w, k) {
  const keys = ["yaw", "pitch", "roll", "s", "cx", "cy"];
  const steps = [10, 8, 4, cam.s * 0.08, 30, 30];
  const toCam = (v) => ({
    ...cam,
    ...Object.fromEntries(keys.map((key, i) => [key, v[i]])),
  });
  const loss = (v) => silhouetteLoss(toCam(v), mask, w, k);
  let simplex = [keys.map((key) => cam[key])];
  for (let i = 0; i < keys.length; i++) {
    const v = [...simplex[0]];
    v[i] += steps[i];
    simplex.push(v);
  }
  let values = simplex.map(loss);
  for (let iter = 0; iter < 500; iter++) {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    const n = keys.length;
    const centroid = keys.map(
      (_, j) => simplex.slice(0, n).reduce((s, v) => s + v[j], 0) / n,
    );
    const along = (t) => centroid.map((c, j) => c + t * (simplex[n][j] - c));
    const reflected = along(-1);
    const fr = loss(reflected);
    if (fr < values[0]) {
      const expanded = along(-2);
      const fe = loss(expanded);
      [simplex[n], values[n]] = fe < fr ? [expanded, fe] : [reflected, fr];
    } else if (fr < values[n - 1]) {
      [simplex[n], values[n]] = [reflected, fr];
    } else {
      const contracted = along(0.5);
      const fc = loss(contracted);
      if (fc < values[n]) [simplex[n], values[n]] = [contracted, fc];
      else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map(
            (c, j) => simplex[0][j] + 0.5 * (c - simplex[0][j]),
          );
          values[i] = loss(simplex[i]);
        }
      }
    }
  }
  const best = toCam(simplex[0]);
  return { cam: best, iou: 1 - values[0] };
}

/** Centre the projection on the mask's bounding box and match its height. */
function matchBounds(cam, mask, w, k) {
  const { right, up } = basis(cam);
  const pts = triangles.flatMap((t) => t.p);
  const us = pts.map((p) => dot(p, right));
  const vs = pts.map((p) => dot(p, up));
  let [x0, x1, y0, y1] = [w, 0, w, 0];
  for (let i = 0; i < w * w; i++)
    if (mask[i]) {
      const x = i % w;
      const y = Math.floor(i / w);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  const [u0, u1, v0, v1] = [
    Math.min(...us),
    Math.max(...us),
    Math.min(...vs),
    Math.max(...vs),
  ];
  const s = (k * ((x1 - x0) / (u1 - u0) + (y1 - y0) / (v1 - v0))) / 2;
  return {
    ...cam,
    s,
    cx: (k * (x0 + x1)) / 2 - (s * (u0 + u1)) / 2,
    cy: (k * (y0 + y1)) / 2 + (s * (v0 + v1)) / 2,
  };
}

const photos = [];
for (const cam of CAMERAS) {
  const { data } = await sharp(join(PHOTO_DIR, cam.photo))
    .removeAlpha()
    .resize(PHOTO_SIZE, PHOTO_SIZE)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurred = await sharp(data, {
    raw: { width: PHOTO_SIZE, height: PHOTO_SIZE, channels: 3 },
  })
    .blur(10)
    .raw()
    .toBuffer();
  const mask = segment(data, PHOTO_SIZE, PHOTO_SIZE);
  photos.push({
    cam,
    data,
    blurred,
    mask,
    edge: edgeDistance(mask, PHOTO_SIZE, PHOTO_SIZE),
  });
}

if (fit) {
  const K = 4;
  const w = PHOTO_SIZE / K;
  for (const photo of photos) {
    const small = new Uint8Array(w * w);
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++)
        small[y * w + x] = photo.mask[(y * K + 2) * PHOTO_SIZE + x * K + 2];
    let { cam, iou } = fitCamera(
      matchBounds(photo.cam, small, w, K),
      small,
      w,
      K,
    );
    // Restart once from the result to escape a collapsed simplex.
    ({ cam, iou } = fitCamera(cam, small, w, K));
    const round = (v) => Math.round(v * 100) / 100;
    process.stdout.write(
      `FIT ${JSON.stringify({ ...cam, yaw: round(cam.yaw), pitch: round(cam.pitch), roll: round(cam.roll), s: round(cam.s), cx: round(cam.cx), cy: round(cam.cy) })} iou ${iou.toFixed(4)}\n`,
    );
  }
  process.exit(0);
}

// Depth buffers: the nearest shell surface along each camera's view.
const DEPTH_K = 2;
const DW = PHOTO_SIZE / DEPTH_K;
for (const photo of photos) {
  const depth = new Float32Array(DW * DW).fill(-Infinity);
  rasterizeTriangles(projector(photo.cam, DEPTH_K), DW, DW, (i, z) => {
    if (z > depth[i]) depth[i] = z;
  });
  photo.depth = depth;
  photo.project = projector(photo.cam);
  photo.dir = basis(photo.cam).dir;
}

const PALETTE = { red: [196, 22, 30], black: [22, 22, 24] };
const smoothstep = (a, b, t) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
function sample(img, x, y) {
  const x0 = Math.max(0, Math.min(PHOTO_SIZE - 2, Math.floor(x - 0.5)));
  const y0 = Math.max(0, Math.min(PHOTO_SIZE - 2, Math.floor(y - 0.5)));
  const fx = Math.max(0, Math.min(1, x - 0.5 - x0));
  const fy = Math.max(0, Math.min(1, y - 0.5 - y0));
  const out = [0, 0, 0];
  for (const [dx, dy, wt] of [
    [0, 0, (1 - fx) * (1 - fy)],
    [1, 0, fx * (1 - fy)],
    [0, 1, (1 - fx) * fy],
    [1, 1, fx * fy],
  ]) {
    const i = ((y0 + dy) * PHOTO_SIZE + x0 + dx) * 3;
    out[0] += img[i] * wt;
    out[1] += img[i + 1] * wt;
    out[2] += img[i + 2] * wt;
  }
  return out;
}

/** Photo colour at a shell point: a visibility-, facing- and edge-weighted blend. */
function bake(p, n) {
  const seen = [];
  let total = 0;
  for (const photo of photos) {
    const facing = Math.abs(dot(n, photo.dir));
    if (facing < 0.2) continue;
    const [x, y, z] = photo.project(p);
    if (x < 1 || y < 1 || x >= PHOTO_SIZE - 1 || y >= PHOTO_SIZE - 1) continue;
    const di = Math.floor(y / DEPTH_K) * DW + Math.floor(x / DEPTH_K);
    if (z < photo.depth[di] - 0.004) continue;
    const pi = Math.floor(y) * PHOTO_SIZE + Math.floor(x);
    // Feather near the silhouette, where halos and misfit live.
    const weight = facing ** 3 * smoothstep(3, 18, photo.edge[pi]);
    if (weight <= 0) continue;
    let c = sample(photo.data, x, y);
    // Clamp studio highlights toward the local colour.
    const local = sample(photo.blurred, x, y);
    const lum = Math.max(...c);
    const sat = lum ? 1 - Math.min(...c) / lum : 0;
    if (lum > 190 && sat < 0.3 && lum - Math.max(...local) > 30) c = local;
    seen.push([c, weight]);
    total += weight;
  }
  // The best-facing photo dominates: the others only soften its seams, so
  // misregistered views do not ghost over each other.
  const best = Math.max(0, ...seen.map(([, w]) => w));
  const sum = [0, 0, 0];
  let blend = 0;
  for (const [c, w] of seen) {
    const k = (w / best) ** 6 * w;
    sum[0] += c[0] * k;
    sum[1] += c[1] * k;
    sum[2] += c[2] * k;
    blend += k;
  }
  // Unseen surfaces (undersides, the inside of the eye port) fall back to
  // black facing down, red elsewhere.
  const fallback = n[1] < -0.3 ? PALETTE.black : PALETTE.red;
  const need = Math.max(0, 0.05 - total);
  if (!blend) return fallback;
  const scale = total / blend;
  return sum.map((c, k) => (c * scale + fallback[k] * need) / (total + need));
}

// The liner's UV island overlaps the back of the shell in the source atlas, so
// it is not painted here: Blender gives it its own plain material.
const PAINT = { shell: bake, peak: bake, "crown-vent": bake };

// ---- Atlas -----------------------------------------------------------------------

const AW = 2048;
const AH = 2048;
const SS = 1;
const pixels = Buffer.alloc(AW * AH * 4);
const painted = new Uint8Array(AW * AH);

triangles.forEach((tri, t) => {
  const paint = PAINT[partOf[t]];
  if (!paint) return;
  // UV v runs up; image rows run down.
  const q = tri.uv.map(([u, v]) => [u * AW, (1 - v) * AH]);
  const area =
    (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) -
    (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0])));
  const x1 = Math.min(AW - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
  const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1])));
  const y1 = Math.min(AH - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
  const n = unit(
    (() => {
      const [a, b, c] = tri.p;
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      return [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
    })(),
  );
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const sum = [0, 0, 0];
      let hits = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const w1 =
            ((px - q[0][0]) * (q[2][1] - q[0][1]) -
              (q[2][0] - q[0][0]) * (py - q[0][1])) /
            area;
          const w2 =
            ((q[1][0] - q[0][0]) * (py - q[0][1]) -
              (px - q[0][0]) * (q[1][1] - q[0][1])) /
            area;
          const w0 = 1 - w1 - w2;
          // Texels no sample reaches are filled by the bleed below.
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const p = [0, 1, 2].map(
            (k) => tri.p[0][k] * w0 + tri.p[1][k] * w1 + tri.p[2][k] * w2,
          );
          const c = paint(p, n);
          sum[0] += c[0];
          sum[1] += c[1];
          sum[2] += c[2];
          hits++;
        }
      if (!hits) continue;
      const i = y * AW + x;
      pixels[i * 4] = Math.round(sum[0] / hits);
      pixels[i * 4 + 1] = Math.round(sum[1] / hits);
      pixels[i * 4 + 2] = Math.round(sum[2] / hits);
      pixels[i * 4 + 3] = 255;
      painted[i] = 1;
    }
});
// Bleed the paint outward so filtering and mipmaps never reach empty texels.
for (let pass = 0; pass < 8; pass++) {
  const next = [];
  for (let i = 0; i < AW * AH; i++) {
    if (painted[i]) continue;
    const x = i % AW;
    for (const j of [i - 1, i + 1, i - AW, i + AW]) {
      if (j < 0 || j >= AW * AH || Math.abs((j % AW) - x) > 1 || !painted[j])
        continue;
      next.push([i, j]);
      break;
    }
  }
  for (const [i, j] of next) {
    pixels.copyWithin(i * 4, j * 4, j * 4 + 4);
    painted[i] = 1;
  }
}
for (let i = 0; i < AW * AH; i++)
  if (!painted[i]) pixels.set([...PALETTE.red, 255], i * 4);

const paintPng = join(OUT, "sayak-shell.png");
await sharp(pixels, { raw: { width: AW, height: AH, channels: 4 } })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(paintPng);
process.stdout.write(`wrote ${paintPng}\n`);

// ---- 4-6. Build, optimize, render --------------------------------------------------

const staged = join(OUT, "display-offroad-helmet.staged.glb");
blender("build", obj, paintPng, staged);

const preview = join(OUT, "display-offroad-helmet.preview.glb");
run(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    staged,
    preview,
    ...["--compress", "meshopt", "--texture-compress", "webp"],
    ...["--texture-size", "2048", "--simplify", "false", "--join", "false"],
    ...["--instance", "false", "--palette", "false"],
  ],
  "glTF Transform optimize",
);
const shipped = readFileSync(preview);
writeFileSync(TARGET, shipped);
process.stdout.write(
  `wrote ${TARGET} ${shipped.length} bytes sha256 ${sha256(shipped)}\n`,
);

// Render the staged GLB through the fitted cameras, so each preview lines up
// with its photo, then a contact sheet and photo/render pairs.
const prefix = join(OUT, "preview-");
const camerasJson = join(OUT, "cameras.json");
writeFileSync(
  camerasJson,
  JSON.stringify(
    photos.map(({ cam }) => {
      const { right, up, dir } = basis(cam);
      // The helmet-frame point under the image centre.
      const a = (PHOTO_SIZE / 2 - cam.cx) / cam.s;
      const b = (cam.cy - PHOTO_SIZE / 2) / cam.s;
      return {
        name: cam.name,
        right,
        up,
        dir,
        size: PHOTO_SIZE / cam.s,
        centre: right.map((c, k) => c * a + up[k] * b),
      };
    }),
  ),
);
blender("render", staged, prefix, camerasJson);
const TILE = 600;
const tiles = await Promise.all(
  photos.map(({ cam }) =>
    sharp(`${prefix}${cam.name}.png`).resize(TILE, TILE).png().toBuffer(),
  ),
);
const sheet = `${prefix}sheet.png`;
await sharp({
  create: {
    width: TILE * 3,
    height: TILE * 2,
    channels: 3,
    background: { r: 12, g: 12, b: 13 },
  },
})
  .composite(
    tiles.map((input, i) => ({
      input,
      left: (i % 3) * TILE,
      top: Math.floor(i / 3) * TILE,
    })),
  )
  .png()
  .toFile(sheet);
process.stdout.write(`wrote ${sheet}\n`);
for (const [i, { cam }] of photos.entries()) {
  const photo = await sharp(join(PHOTO_DIR, cam.photo))
    .resize(TILE, TILE)
    .png()
    .toBuffer();
  const pair = `${OUT}/compare-${cam.name}.png`;
  await sharp({
    create: { width: TILE * 2, height: TILE, channels: 3, background: "#fff" },
  })
    .composite([
      { input: photo, left: 0, top: 0 },
      { input: tiles[i], left: TILE, top: 0 },
    ])
    .png()
    .toFile(pair);
  process.stdout.write(`wrote ${pair}\n`);
}
