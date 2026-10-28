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
]) {
  const source = await (await request(path)).text();
  const dependencies = [
    ...source.matchAll(
      /from\s*["'](\/node_modules\/\.vite\/deps\/[^"']+)["']/g,
    ),
  ].map((match) => match[1]);
  for (const dependency of new Set(dependencies)) await request(dependency);
}
const manifest = await (await request("/models/forest/manifest.json")).json();
for (const asset of manifest.assets)
  for (const file of asset.files) {
    const bytes = Buffer.from(
      await (await request(`/models/forest/${file.path}`)).arrayBuffer(),
    );
    assert.equal(bytes.length, file.bytes);
    assert.equal(bytes.toString("utf8", 0, 4), "glTF");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    process.stdout.write(`PASS integrity ${file.path}\n`);
  }
