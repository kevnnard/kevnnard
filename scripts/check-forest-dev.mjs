// With dev server running: node scripts/check-forest-dev.mjs [url]
// Public HTTP and asset integrity checks, not a browser/GPU render check.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:4321");
async function request(path) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `${path}: ${response.statusText}`);
  process.stdout.write(`PASS HTTP200 ${path}\n`);
  return response;
}
for (const path of [
  "/src/components/room/ForestEnvironment.tsx",
  "/src/lib/room/forest-layout.ts",
  "/src/lib/room/forest-model.ts",
  "/src/components/room/ForestDebris.tsx",
  "/src/lib/room/forest-debris.ts",
  "/src/lib/room/forest-fog.ts",
  "/src/components/room/ForestUnderstory.tsx",
  "/src/lib/room/forest-understory.ts",
  "/src/components/room/ForestGarden.tsx",
  "/src/lib/room/garden-layout.ts",
]) {
  const source = await (await request(path)).text();
  const dependencies = [
    ...source.matchAll(
      /from\s*["'](\/node_modules\/\.vite\/deps\/[^"']+)["']/g,
    ),
  ].map((match) => match[1]);
  for (const dependency of new Set(dependencies)) await request(dependency);
}
async function integrity(path, file) {
  const bytes = Buffer.from(await (await request(path)).arrayBuffer());
  assert.equal(bytes.length, file.bytes);
  assert.equal(bytes.toString("utf8", 0, 4), "glTF");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  process.stdout.write(`PASS integrity ${path}\n`);
  return bytes;
}
const manifest = await (await request("/models/forest/manifest.json")).json();
for (const asset of manifest.assets)
  for (const file of asset.files)
    await integrity(`/models/forest/${file.path}`, file);
// Forest-floor debris, at the cache-busting URLs the runtime requests.
const debris = await (
  await request("/models/forest-debris/manifest.json")
).json();
for (const asset of debris.assets)
  await integrity(
    `/models/forest-debris/${asset.file.path}?v=debris-1`,
    asset.file,
  );
// Forest-floor ferns: served bytes, plus the alpha-tested double-sided leaves.
const understory = await (
  await request("/models/forest-understory/manifest.json")
).json();
for (const asset of understory.assets) {
  const bytes = await integrity(
    `/models/forest-understory/${asset.file.path}?v=understory-1`,
    asset.file,
  );
  const json = JSON.parse(
    bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
  );
  const nodes = json.nodes.filter((node) => "mesh" in node).map((n) => n.name);
  assert.deepEqual(nodes.sort(), asset.meshes.map((mesh) => mesh.node).sort());
  for (const material of json.materials) {
    assert.equal(material.alphaMode, "MASK");
    assert.equal(material.doubleSided, true);
  }
  process.stdout.write(`PASS fern meshes and leaf cutout ${asset.file.path}\n`);
}
// Garden stone and gravel maps: served bytes match the manifest.
const garden = await (await request("/textures/garden/manifest.json")).json();
for (const material of garden.materials)
  for (const map of Object.values(material.maps)) {
    const path = `/textures/garden/${map.path}`;
    const bytes = Buffer.from(await (await request(path)).arrayBuffer());
    assert.equal(bytes.length, map.bytes);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), map.sha256);
    process.stdout.write(`PASS integrity ${path}\n`);
  }
