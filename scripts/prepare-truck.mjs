#!/usr/bin/env node
// Derive public/world/models/dream-truck.glb, the owner's dream truck parked
// in the garage (dream-truck T1), from "Ford F150 Raptor" by Outlaw Games™
// (Sketchfab, CC BY-NC 4.0,
// https://sketchfab.com/3d-models/ford-f150-raptor-5bde9684bf6d40e0902ee8e482ad1063),
// downloaded as GLB. Ford and Raptor are trademarks of Ford Motor Company;
// no affiliation.
//
// Usage:
//   GLTF_TRANSFORM_CLI=<cached @gltf-transform/cli 4.5.1 package dir> \
//     node scripts/prepare-truck.mjs [source.glb]
//
// Default source: node_modules/.cache/world/dream-truck-source/
// ford-f150-raptor-original.glb, copied there from the owner's downloads.
// The file is data: it is parsed, never run. Nothing is downloaded and
// nothing is installed: glTF Transform, meshoptimizer and sharp are resolved
// from the cached CLI package. No Blender step.
//
// 1. Verify the source bytes.
// 2. Drop what never shows or is not the owner's truck: the police gear
//    (radar, dash camera and console, siren, roof lightbar decals), the
//    invisible decal sheets (alpha 0), the dash dials, the four door
//    speaker grilles (16k triangles each, inside the door cards) and, once
//    framed (6), the radio whip antenna.
// 3. Straighten the steered front wheels: the truck is parked.
// 4. One UV set, no vertex colours or tangents; the glass loses its
//    second-UV roughness map. Untextured materials merge by look into a few
//    shared ones (body paint, black trim, chrome, rubber, glass...).
// 5. Join meshes per material, weld, and simplify with meshoptimizer to a
//    few millimetres of error (about 40k triangles), so the silhouette,
//    wheels, grille and lights keep their shape.
// 6. Nose on +z, wheels on y 0, centred on x and z, scaled to the real
//    truck's 5.9 m length; the runtime scales it to the garage
//    (src/lib/world/truck.ts).
// 7. WebP textures at most 1024 px, meshopt geometry; written once.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_SHA256 =
  "a0a16985fe6490ec9cd05f5fed49fa5659d3302a6e7fc9a66751d1f3c06f72f5";
const TARGET = join(ROOT, "public/world/models/dream-truck.glb");
/** The real truck's length (2021+ F-150 Raptor, 5.9 m bumper to bumper). */
const LENGTH = 5.9;

const source = resolve(
  process.argv[2] ??
    join(
      ROOT,
      "node_modules/.cache/world/dream-truck-source/ford-f150-raptor-original.glb",
    ),
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
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { NodeIO, getBounds } = await load("@gltf-transform/core");
const { ALL_EXTENSIONS } = await load("@gltf-transform/extensions");
const {
  dedup,
  flatten,
  join: joinMeshes,
  meshopt,
  prune,
  textureCompress,
  transformMesh,
  clearNodeTransform,
  compactPrimitive,
  weld,
} = await load("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptSimplifier } = await load("meshoptimizer");
const sharp = require("sharp");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = readFileSync(source);
if (sha256(bytes) !== SOURCE_SHA256)
  throw new Error(`unexpected source ${source}: sha256 ${sha256(bytes)}`);

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.readBinary(new Uint8Array(bytes));
const root = doc.getRoot();

const triangles = () => {
  let count = 0;
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives())
      count += (primitive.getIndices()?.getCount() ?? 0) / 3;
  return count;
};
const log = (line) => process.stdout.write(`${line}\n`);
log(`source ${bytes.length} bytes, ${triangles()} triangles`);

// ---- 2. Drop -----------------------------------------------------------------

const DROP_NODES = [
  // Police gear: radar, dash camera, console, mic; the siren lens.
  /^radar_/,
  /^siren_glass/,
  // Livery and lightbar decals: alpha 0 sheets, invisible as authored.
  /^extra_/,
  // Dash dials, unseen behind the windscreen.
  /^dials_/,
];
const disposeTree = (node) => {
  for (const child of node.listChildren()) disposeTree(child);
  node.dispose();
};
for (const node of root.listNodes())
  if (!node.isDisposed() && DROP_NODES.some((re) => re.test(node.getName())))
    disposeTree(node);
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    const name = primitive.getMaterial()?.getName() ?? "";
    const count = (primitive.getIndices()?.getCount() ?? 0) / 3;
    // Door speaker grilles: 15.9k triangles each, hidden in the door cards.
    if (/^goma/.test(name) && count > 10000) primitive.dispose();
  }

// ---- 3. Straighten the front wheels ------------------------------------------

const STEERED = ["Object_407_19", "Object_404_22"];
for (const name of STEERED) {
  const node = root.listNodes().find((n) => n.getName() === name);
  if (!node) throw new Error(`no steered wheel node ${name}`);
  node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

// The frame (step 6) is measured bumper to bumper: the tow hitch sticks out.
const underHitch = (node) => {
  for (let n = node; n; n = n.getParentNode())
    if (/^tow_hitch/.test(n.getName())) return true;
  return false;
};
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const node of root.listNodes())
  if (node.getMesh() && !underHitch(node)) {
    const b = getBounds(node);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
  }

// ---- 4. Attributes and materials ---------------------------------------------

// Plain metal/rough materials, like every other world model: the specular
// tints and the (dropped) decals' clearcoat go.
for (const extension of root.listExtensionsUsed())
  if (/^KHR_materials_(specular|clearcoat)$/.test(extension.extensionName))
    extension.dispose();
for (const material of root.listMaterials()) {
  // Every texture reads the first UV set; the glass's roughness map read
  // the second, so it goes and the glass gets a plain smooth finish.
  if (material.getMetallicRoughnessTexture()) {
    material.setMetallicRoughnessTexture(null);
    material.setRoughnessFactor(0.15);
    material.setMetallicFactor(0);
  }
}
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives())
    for (const semantic of primitive.listSemantics())
      if (/^(COLOR_|TANGENT|TEXCOORD_[1-9])/.test(semantic))
        primitive.setAttribute(semantic, null);

/**
 * Untextured source materials by look; textured ones stay as they are. The
 * body paint and trims are black in the source and stay black.
 */
const MERGE = {
  paint: {
    names: [
      /^vehicle_generic_smallspecmap__PAINT_1_/,
      /^Black$/,
      /^Matte_Black$/,
    ],
    color: [0.012, 0.012, 0.014, 1],
    metallic: 0.8,
    roughness: 0.38,
  },
  trim: {
    names: [
      /^dinghyblack/,
      /^b55/,
      /^teker/,
      /^bw00a/,
      /^plastics_topdash/,
      /^blank_normal/,
      /^magnetic_mic/,
      /^blackish/,
      /^vehicle_generic_tyrewallblack__PAINT_2_/,
    ],
    color: [0.018, 0.018, 0.02, 1],
    metallic: 0.2,
    roughness: 0.62,
  },
  chrome: {
    names: [/^crome/, /^chrome$/, /^screw/],
    color: [0.8, 0.8, 0.82, 1],
    metallic: 1,
    roughness: 0.18,
  },
  lamp: {
    names: [/^vehicle_generic_smallspecmap(\.001)?$/],
    color: [0.7059, 0.7059, 0.7059, 1],
    metallic: 0,
    roughness: 0.3,
  },
};
const merged = Object.fromEntries(
  Object.entries(MERGE).map(([name, look]) => [
    name,
    doc
      .createMaterial(name)
      .setBaseColorFactor(look.color)
      .setMetallicFactor(look.metallic)
      .setRoughnessFactor(look.roughness)
      .setDoubleSided(true),
  ]),
);
// One tyre look for all four (the source textures one front tyre apart),
// without the sidewall normal map: plain rubber simplifies cleanly.
const tyres = root
  .listMaterials()
  .filter((m) => /^vehicle_generic_tyrewallblack\.00[12]$/.test(m.getName()));
const rubber = doc
  .createMaterial("tyre")
  .setBaseColorFactor([0.02, 0.02, 0.021, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.85);
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives())
    if (tyres.includes(primitive.getMaterial())) primitive.setMaterial(rubber);
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    if (!material || material.getBaseColorTexture()) continue;
    const name = material.getName();
    const target = Object.entries(MERGE).find(([, look]) =>
      look.names.some((re) => re.test(name)),
    );
    if (target) primitive.setMaterial(merged[target[0]]);
  }

// ---- 5. Join, weld, simplify -------------------------------------------------

await doc.transform(prune(), flatten());
for (const node of root.listNodes())
  if (node.getMesh()) clearNodeTransform(node);
// The mirrored driver's door skin winds its triangles against its normals,
// so it would render inside out: wind every such primitive the other way.
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute("POSITION");
    const normal = primitive.getAttribute("NORMAL");
    const indices = primitive.getIndices();
    if (!normal || !indices) continue;
    const list = indices.getArray();
    const [a, b, c, n] = [[], [], [], []];
    let facing = 0;
    for (let t = 0; t < list.length; t += 3) {
      position.getElement(list[t], a);
      position.getElement(list[t + 1], b);
      position.getElement(list[t + 2], c);
      normal.getElement(list[t], n);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const face = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      facing += Math.sign(face[0] * n[0] + face[1] * n[1] + face[2] * n[2]);
    }
    if (facing >= 0) continue;
    const flipped = list.slice();
    for (let t = 0; t < list.length; t += 3) {
      flipped[t + 1] = list[t + 2];
      flipped[t + 2] = list[t + 1];
    }
    indices.setArray(flipped);
    log(`rewound ${mesh.getName()} (${list.length / 3} triangles)`);
  }
await doc.transform(
  joinMeshes({ keepNamed: false, keepMeshes: false }),
  weld(),
);
// Error-bounded, in metres: what stays is within 6 mm of the source (1 cm
// on the knobbly tyres). Untextured materials may collapse across their
// (invisible) UV seams; textured ones keep them; small loose parts below
// the error prune away.
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    const textured = Boolean(
      material?.getBaseColorTexture() || material?.getNormalTexture(),
    );
    const positions = new Float32Array(
      primitive.getAttribute("POSITION").getArray(),
    );
    const indices = new Uint32Array(primitive.getIndices().getArray());
    const [kept] = MeshoptSimplifier.simplify(
      indices,
      positions,
      3,
      0,
      material === rubber ? 0.025 : 0.01,
      ["ErrorAbsolute", "Prune", ...(textured ? [] : ["Permissive"])],
    );
    if (kept.length === 0) {
      primitive.dispose();
      continue;
    }
    primitive.getIndices().setArray(kept);
    compactPrimitive(primitive);
  }
await doc.transform(prune());

// ---- 6. Frame ------------------------------------------------------------------

const scene = root.listScenes()[0];
const k = LENGTH / (max[2] - min[2]);
const cx = (min[0] + max[0]) / 2;
const cz = (min[2] + max[2]) / 2;
// Turn 180 degrees about y (the source nose looks down -z), then scale.
const frame = [
  -k,
  0,
  0,
  0,
  0,
  k,
  0,
  0,
  0,
  0,
  -k,
  0,
  k * cx,
  -k * min[1],
  k * cz,
  1,
];
for (const mesh of root.listMeshes()) transformMesh(mesh, frame);
// The police radio whip on the front fender (two slivers reaching 2.21 m,
// above the 1.98 m roof) goes too: it would poke through the garage door.
const ROOF = 2;
for (const mesh of root.listMeshes())
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute("POSITION");
    const list = primitive.getIndices().getArray();
    const kept = [];
    const p = [];
    for (let t = 0; t < list.length; t += 3) {
      const top = Math.max(
        ...[0, 1, 2].map((k) => position.getElement(list[t + k], p)[1]),
      );
      if (top <= ROOF) kept.push(list[t], list[t + 1], list[t + 2]);
    }
    if (kept.length === list.length) continue;
    log(`dropped ${(list.length - kept.length) / 3} antenna triangles`);
    primitive.getIndices().setArray(new Uint32Array(kept));
    compactPrimitive(primitive);
  }

// ---- 7. Compress and write -------------------------------------------------------

await doc.transform(
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [1024, 1024],
  }),
  dedup(),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
const out = await io.writeBinary(doc);
writeFileSync(TARGET, out);
const bounds = getBounds(scene);
log(
  `size ${bounds.max.map((v, i) => (v - bounds.min[i]).toFixed(3)).join(" x ")} m`,
);
log(
  `wrote ${TARGET} ${out.length} bytes sha256 ${sha256(out)} triangles ${triangles()}`,
);
