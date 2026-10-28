// With dev server running: node scripts/check-ground-dev.mjs [url]
// Public HTTP and texture integrity checks, not browser/GPU rendering proof.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:4321");
const seen = new Set();
async function request(path) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `${path}: ${response.statusText}`);
  process.stdout.write(`PASS HTTP200 ${path}\n`);
  return response;
}
for (const path of [
  "/src/components/room/GroundSurface.tsx",
  "/src/lib/room/ground-materials.ts",
  "/src/components/room/ForestEnvironment.tsx",
  "/src/components/room/HouseDiorama.tsx",
]) {
  const source = await (await request(path)).text();
  for (const match of source.matchAll(
    /from\s*["'](\/node_modules\/\.vite\/deps\/[^"']+)["']/g,
  )) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      await request(match[1]);
    }
  }
}
const manifest = await (await request("/textures/ground/manifest.json")).json();
for (const material of manifest.materials)
  for (const map of Object.values(material.maps)) {
    const bytes = Buffer.from(
      await (await request(`/textures/ground/${map.path}`)).arrayBuffer(),
    );
    assert.equal(bytes.length, map.bytes);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), map.sha256);
    process.stdout.write(`PASS integrity ${map.path}\n`);
  }
