#!/usr/bin/env node
// Derive public/world/models/display-offroad-helmet.glb from Pieter Ferreira's
// "off road helmet" (Sketchfab, CC BY 4.0), downloaded signed-in as the 2k GLB.
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-display-offroad.mjs [source.glb] [--debug-parts]
//
// Defaults: source node_modules/.cache/world/off-road-helmet-original.glb;
// work files go to node_modules/.cache/world/t4-texture/. Nothing is
// downloaded and nothing is installed: glTF Transform and sharp are resolved
// from the cached CLI package (the `pnpm dlx` cache).
//
// 1. Verify the source bytes.
// 2. Split its single mesh into its nine connected parts, keeping POSITION,
//    NORMAL, TANGENT and TEXCOORD_0, so the source UVs and normal map still
//    apply.
// 3. Paint the shell, peak and peak screws into the source's own 2048 px base
//    color atlas: a red, black and gray graphic recreated from a photo of the
//    front of a Fox V1 F-A18 (eBay listing 157680317522). The photo only
//    shows the front; the sides, back and crown are an approximation in the
//    same palette. The photo itself is never shipped, and no Fox logo is
//    reproduced: a plain outlined badge stands in for the chin emblem.
// 4. Stretch the peak's overhang forward (x > 9 only) so its tip clears the
//    chin, leaving its rear mounted on the shell.
// 5. Keep the liner, goggles, strap and mouth vent texels, and the source
//    normal map; drop the metallic-roughness and transmission maps for plain,
//    less glossy factors.
// 6. Optimize with the CLI (meshopt, 1024 px WebP).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "72662d520218577c66c6ec5e4679b502200c65789a0e453a5e50cf7f8952c1f6";
const TARGET = join(ROOT, "public/world/models/display-offroad-helmet.glb");
const WORK = join(ROOT, "node_modules/.cache/world/t4-texture");

const args = process.argv.slice(2);
const debugParts = args.includes("--debug-parts");
const source = resolve(
  args.find((arg) => !arg.startsWith("--")) ??
    join(ROOT, "node_modules/.cache/world/off-road-helmet-original.glb"),
);
const cliDir = process.env.GLTF_TRANSFORM_CLI;
if (!cliDir)
  throw new Error("set GLTF_TRANSFORM_CLI to the cached CLI package");
const cliPackage = JSON.parse(
  readFileSync(join(cliDir, "package.json"), "utf8"),
);
if (cliPackage.version !== "4.5.1")
  throw new Error(`need @gltf-transform/cli 4.5.1, got ${cliPackage.version}`);
const require = createRequire(join(cliDir, "package.json"));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune } = require("@gltf-transform/functions");
const sharp = require("sharp");

const bytes = readFileSync(source);
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== SOURCE_SHA256) throw new Error(`unexpected source ${hash}`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(source);
const root = doc.getRoot();
const sourceNode = root.listNodes().find((node) => node.getMesh());
const sourcePrim = sourceNode.getMesh().listPrimitives()[0];
const sourceMaterial = sourcePrim.getMaterial();
const matrix = sourceNode.getWorldMatrix();
const ATTRIBUTES = ["POSITION", "NORMAL", "TANGENT", "TEXCOORD_0"];
const attr = Object.fromEntries(
  ATTRIBUTES.map((name) => [name, sourcePrim.getAttribute(name)]),
);
const index = sourcePrim.getIndices().getArray();

// Helmet frame: +x front (chin), +y up, +z the wearer's right, source units.
const transform = ([x, y, z], w) => [
  matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
  matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
  matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
];
const P = [];
const N = [];
const UV = [];
for (let i = 0; i < attr.POSITION.getCount(); i++) {
  P.push(transform(attr.POSITION.getElement(i, []), 1));
  N.push(transform(attr.NORMAL.getElement(i, []), 0));
  UV.push(attr.TEXCOORD_0.getElement(i, []));
}

// Connected parts, with vertices welded by position (UV seams split them).
const weld = new Map();
const canon = P.map((p, i) => {
  const key = p.map((c) => c.toFixed(3)).join();
  if (!weld.has(key)) weld.set(key, i);
  return weld.get(key);
});
const parent = P.map((_, i) => i);
const find = (i) => {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
};
for (let i = 0; i < canon.length; i++) parent[find(i)] = find(canon[i]);
for (let t = 0; t < index.length; t += 3) {
  parent[find(index[t])] = find(index[t + 1]);
  parent[find(index[t + 1])] = find(index[t + 2]);
}
const groups = new Map();
for (let t = 0; t < index.length; t += 3) {
  const r = find(index[t]);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(t);
}
const bySize = [...groups.values()].sort((a, b) => b.length - a.length);
const sizes = bySize.map((tris) => tris.length).join();
if (sizes !== "1006,908,800,212,144,144,124,44,4")
  throw new Error(`unexpected parts ${sizes}`);
const PARTS = {
  shell: bySize[0],
  liner: bySize[1],
  "goggle-frame": bySize[2],
  visor: bySize[3],
  "visor-screws": [...bySize[4], ...bySize[5]],
  "goggle-lens": bySize[6],
  "goggle-strap": bySize[7],
  "mouth-vent": bySize[8],
};

// ---- Graphic -------------------------------------------------------------

const PALETTE = {
  red: [200, 20, 28],
  black: [20, 20, 22],
  gray: [143, 154, 152],
  charcoal: [62, 65, 70],
  light: [196, 202, 198],
  dark: [52, 55, 58],
  white: [232, 234, 230],
};

/** Shell boundary edges, as segments: the eye port and the neck opening. */
function boundarySegments(tris) {
  const edges = new Map();
  for (const t of tris)
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      const [u, v] = [canon[index[t + a]], canon[index[t + b]]].sort(
        (p, q) => p - q,
      );
      const key = `${u},${v}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  return [...edges]
    .filter(([, n]) => n === 1)
    .map(([key]) => key.split(",").map((i) => P[Number(i)]));
}
const shellEdges = boundarySegments(PARTS.shell);
const eyePort = shellEdges.filter(([a, b]) => a[1] > 163 && b[1] > 163);
const neck = shellEdges.filter(
  ([a, b]) => a[1] < 161 && b[1] < 161 && a[0] < 18.5,
);
function distance(p, segments) {
  let best = Infinity;
  for (const [a, b] of segments) {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    const t = Math.max(
      0,
      Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len),
    );
    best = Math.min(
      best,
      Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]),
    );
  }
  return best;
}

/** A planar decal: an SVG drawn over a rectangle of the helmet frame. */
async function decal(svg, center, right, up, width, height) {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (p) => {
    const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    const u =
      (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / width + 0.5;
    const v = 0.5 - (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / height;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
    const k =
      (Math.floor(v * info.height) * info.width + Math.floor(u * info.width)) *
      4;
    return data[k + 3] < 128 ? null : [data[k], data[k + 1], data[k + 2]];
  };
}
const unit = (v) => {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
};
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

// "F-A18" on the peak's left (-z), reading outward from the centre and rising
// toward the outer edge, as the photo shows it from the front: "F-A" red,
// "18" light gray, a dashed light bar below, on a charcoal panel.
const textRight = unit([-1.1, 0, -1]);
const textUp = unit([-1, 0, 1.1]);
const TEXT = { center: [9.4, 0, -5.4], width: 6.4, height: 2.1 };
const dashes = Array.from(
  { length: 9 },
  (_, i) => `<rect x="${250 + i * 26}" y="178" width="14" height="14"/>`,
).join("");
const fa18 = await decal(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="210">
     <text x="320" y="150" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
       font-weight="800" font-size="150" letter-spacing="4"><tspan fill="${hex(PALETTE.red)}"
       >F-A</tspan><tspan fill="${hex(PALETTE.light)}">18</tspan></text>
     <g fill="${hex(PALETTE.light)}">${dashes}<rect x="490" y="178" width="60" height="14"/></g>
   </svg>`,
  TEXT.center,
  textRight,
  textUp,
  TEXT.width,
  TEXT.height,
);
// Charcoal panel under the lettering, mirrored to the right side of the peak.
const plate = (p) => {
  const q = [p[0], 0, -Math.abs(p[2])];
  const d = [q[0] - TEXT.center[0], 0, q[2] - TEXT.center[2]];
  const u = d[0] * textRight[0] + d[2] * textRight[2];
  const v = d[0] * textUp[0] + d[2] * textUp[2];
  return (
    Math.abs(u) < TEXT.width / 2 + 0.5 && Math.abs(v) < TEXT.height / 2 + 0.45
  );
};
// Plain outlined badge on the chin, where the photo shows the Fox head.
const badge = await decal(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
     <path d="M100 18 L172 52 L160 132 L100 182 L40 132 L28 52 Z" fill="none"
       stroke="${hex(PALETTE.red)}" stroke-width="16" stroke-linejoin="miter"/>
   </svg>`,
  [19, 156.9, 0],
  [0, 0, -1],
  [0, 1, 0],
  2.6,
  2.6,
);

function paintVisor(p, n) {
  if (n[1] < -0.15) return PALETTE.black;
  const text = fa18(p);
  if (text) return text;
  if (plate(p)) return PALETTE.charcoal;
  const az = Math.abs(p[2]);
  const edge = az + 0.3 * p[0];
  if (edge > 9.4) return PALETTE.black;
  if (p[0] > 16.5) return PALETTE.red;
  if (edge > 5.6 && edge < 7.0 && p[0] > 4) return PALETTE.charcoal;
  if (p[0] - 1.1 * az > 9.5 && p[0] - 1.1 * az < 12) return PALETTE.charcoal;
  if (edge > 2.2 && edge < 3.4 && p[0] < 8) return PALETTE.gray;
  return PALETTE.red;
}

function paintShell(p, n) {
  const [x, y] = p;
  const az = Math.abs(p[2]);
  if (distance(p, eyePort) < 1.0) return PALETTE.black;
  if (distance(p, neck) < 1.2) return PALETTE.black;
  // Chin bar: black centre with the badge, red frames around dark side
  // vents, red outside them.
  if (x > 13.5 && y < 164.5) {
    if (az < 3.4) return badge(p) ?? PALETTE.black;
    const s = az - 0.35 * (y - 158.4);
    if (y > 158.4 && y < 161.8 && s > 3.9 && s < 5.5) return PALETTE.dark;
    return PALETTE.red;
  }
  // Two angular vent surrounds over the eye port.
  if (x > 9 && y > 172.4 && y < 174.6 && n[0] > 0.2) {
    const s = az - 0.6 * (y - 172.4);
    if (s > 2.2 && s < 4.8) return PALETTE.black;
  }
  // White angular blocks down the jaw, alternating with black.
  if (x > 7 && x < 16.5 && y > 156.4 && y < 163.2 && az > 4) {
    const col = Math.floor((x - 0.5 * (y - 156.4) - 7.6) / 1.7);
    const row = Math.floor((y - 156.4) / 2.27);
    if (col >= 0 && col <= 1)
      return (col + row) % 2 === 0 ? PALETTE.white : PALETTE.black;
  }
  // Sides and back (not in the photo): a black sweep with a gray panel below.
  const sweep = y - 0.62 * x;
  if (x < 7.5 && sweep > 167.2 && sweep < 170.2) return PALETTE.black;
  if (x < 4 && sweep > 163.6 && sweep < 167.2 && az > 3) return PALETTE.gray;
  // Crown: black spine under the peak.
  if (y > 177 && az < 1.1) return PALETTE.black;
  return PALETTE.red;
}

const DEBUG_COLORS = {
  shell: [204, 26, 26],
  liner: [51, 179, 51],
  "goggle-frame": [51, 77, 230],
  visor: [230, 204, 26],
  "visor-screws": [230, 51, 230],
  "goggle-lens": [26, 230, 230],
  "goggle-strap": [128, 77, 26],
  "mouth-vent": [255, 255, 255],
};
const PAINT = debugParts
  ? Object.fromEntries(
      Object.entries(DEBUG_COLORS).map(([name, color]) => [name, () => color]),
    )
  : {
      shell: paintShell,
      visor: paintVisor,
      "visor-screws": () => PALETTE.dark,
    };

// ---- Atlas ---------------------------------------------------------------

const baseTexture = sourceMaterial.getBaseColorTexture();
const atlas = await sharp(Buffer.from(baseTexture.getImage()))
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width: AW, height: AH } = atlas.info;
const pixels = atlas.data;
const covered = new Uint8Array(AW * AH);
const painted = new Uint8Array(AW * AH);

function rasterize(t, visit) {
  const v = [index[t], index[t + 1], index[t + 2]];
  const q = v.map((i) => [UV[i][0] * AW, UV[i][1] * AH]);
  const area =
    (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) -
    (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0])));
  const x1 = Math.min(AW - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
  const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1])));
  const y1 = Math.min(AH - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      const w1 =
        ((px - q[0][0]) * (q[2][1] - q[0][1]) -
          (q[2][0] - q[0][0]) * (py - q[0][1])) /
        area;
      const w2 =
        ((q[1][0] - q[0][0]) * (py - q[0][1]) -
          (px - q[0][0]) * (q[1][1] - q[0][1])) /
        area;
      const w0 = 1 - w1 - w2;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      visit(y * AW + x, [w0, w1, w2], v);
    }
}
const lerp = (arr, w, v) =>
  [0, 1, 2].map(
    (k) => arr[v[0]][k] * w[0] + arr[v[1]][k] * w[1] + arr[v[2]][k] * w[2],
  );

for (const [name, tris] of Object.entries(PARTS))
  for (const t of tris)
    rasterize(t, (i, w, v) => {
      covered[i] = 1;
      const paint = PAINT[name];
      if (!paint) return;
      const color = paint(lerp(P, w, v), unit(lerp(N, w, v)), name);
      pixels.set([...color, 255], i * 4);
      painted[i] = 1;
    });
// Bleed the paint into empty texels so filtering never reaches the old gray.
for (let pass = 0; pass < 6; pass++) {
  const next = [];
  for (let i = 0; i < AW * AH; i++) {
    if (covered[i] || painted[i]) continue;
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
// One RGBA atlas: opaque materials ignore its alpha, the lens blends with it.
const paintedPng = await sharp(pixels, {
  raw: { width: AW, height: AH, channels: 4 },
})
  .png()
  .toBuffer();

// ---- Materials and nodes -------------------------------------------------

const normalTexture = sourceMaterial.getNormalTexture();
const normalScale = sourceMaterial.getNormalScale();
const paintedTexture = doc
  .createTexture("fa18-base-color")
  .setImage(paintedPng)
  .setMimeType("image/png");
const sourceFactor = sourceMaterial.getBaseColorFactor();
const material = (
  name,
  { factor = [1, 1, 1, 1], roughness, blend = false },
) => {
  const m = doc
    .createMaterial(name)
    .setBaseColorTexture(paintedTexture)
    .setBaseColorFactor(factor)
    .setNormalTexture(normalTexture)
    .setNormalScale(normalScale)
    .setRoughnessFactor(roughness)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  if (blend) m.setAlphaMode("BLEND");
  return m;
};
// Satin paint, not the plastic gloss of the runtime tint it replaces.
const paintMaterial = material("fa18-paint", { roughness: 0.42 });
// Liner, goggle frame, strap and mouth vent keep their source texels and tone.
const sourceMaterialKept = material("source-soft", {
  factor: sourceFactor,
  roughness: 0.75,
});
const lensMaterial = material("goggle-lens", {
  factor: sourceFactor,
  roughness: 0.1,
  blend: true,
});
const MATERIAL = {
  shell: paintMaterial,
  visor: paintMaterial,
  "visor-screws": paintMaterial,
  liner: sourceMaterialKept,
  "goggle-frame": sourceMaterialKept,
  "goggle-strap": sourceMaterialKept,
  "mouth-vent": sourceMaterialKept,
  "goggle-lens": lensMaterial,
};

// Peak: the source peak ends 0.13 short of the chin, so it reads as tucked
// back. Stretch only its overhang forward along +x, from where it leaves the
// shell (x 9), so the rear stays mounted on the shell and its screws. The
// tip moves from x 19.2 to 22.5; the paint follows through the unchanged UVs.
const PEAK = { from: 9, stretch: (22.5 - 9) / (19.22 - 9) };
// The source node matrix is a pure rotation: its transpose is its inverse.
const untransform = ([x, y, z]) => [
  matrix[0] * x + matrix[1] * y + matrix[2] * z,
  matrix[4] * x + matrix[5] * y + matrix[6] * z,
  matrix[8] * x + matrix[9] * y + matrix[10] * z,
];
for (const i of [12, 13, 14])
  if (Math.abs(matrix[i]) > 1e-9) throw new Error("source node is translated");
function extendPeak(v, values) {
  const s = P[v][0] > PEAK.from ? PEAK.stretch : 1;
  if (s === 1) return values;
  const [x, y, z] = P[v];
  // Positions stretch by J = diag(s, 1, 1); normals by its inverse
  // transpose, tangents by J itself.
  const [nx, ny, nz] = N[v];
  const [tx, ty, tz] = transform(values.TANGENT, 0);
  return {
    ...values,
    POSITION: untransform([PEAK.from + (x - PEAK.from) * s, y, z]),
    NORMAL: untransform(unit([nx / s, ny, nz])),
    TANGENT: [...untransform(unit([tx * s, ty, tz])), values.TANGENT[3]],
  };
}

const out = sourceNode.getParentNode();
const buffer = root.listBuffers()[0];
for (const [name, tris] of Object.entries(PARTS)) {
  const remap = new Map();
  const arrays = Object.fromEntries(ATTRIBUTES.map((a) => [a, []]));
  const indices = [];
  for (const t of tris)
    for (const v of [index[t], index[t + 1], index[t + 2]]) {
      if (!remap.has(v)) {
        remap.set(v, remap.size);
        let values = Object.fromEntries(
          ATTRIBUTES.map((a) => [a, attr[a].getElement(v, [])]),
        );
        if (name === "visor") values = extendPeak(v, values);
        for (const a of ATTRIBUTES) arrays[a].push(...values[a]);
      }
      indices.push(remap.get(v));
    }
  const prim = doc
    .createPrimitive()
    .setMaterial(MATERIAL[name])
    .setIndices(
      doc
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array(indices))
        .setBuffer(buffer),
    );
  for (const a of ATTRIBUTES)
    prim.setAttribute(
      a,
      doc
        .createAccessor()
        .setType(attr[a].getType())
        .setArray(new Float32Array(arrays[a]))
        .setBuffer(buffer),
    );
  out.addChild(
    doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)),
  );
}
sourceNode.getMesh().dispose();
sourceNode.dispose();
sourceMaterial.dispose();
await doc.transform(prune());
for (const extension of root.listExtensionsUsed()) extension.dispose();

mkdirSync(WORK, { recursive: true });
const staged = join(
  WORK,
  debugParts ? "parts-debug.glb" : "display-offroad-helmet.glb",
);
await io.write(staged, doc);
process.stdout.write(`wrote ${staged}\n`);
if (debugParts) process.exit(0);

const cli = spawnSync(
  process.execPath,
  [
    join(cliDir, "bin/cli.js"),
    "optimize",
    staged,
    TARGET,
    ...["--compress", "meshopt", "--texture-compress", "webp"],
    ...["--texture-size", "1024", "--simplify", "false", "--join", "false"],
    ...["--instance", "false", "--palette", "false"],
  ],
  { stdio: "inherit" },
);
if (cli.status !== 0) throw new Error("glTF Transform optimize failed");
const shipped = readFileSync(TARGET);
process.stdout.write(
  `wrote ${TARGET} ${shipped.length} bytes sha256 ${createHash("sha256").update(shipped).digest("hex")}\n`,
);
