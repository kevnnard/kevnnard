// Public HTTP regression check for lazy-scene Vite dependency failures.
// Run with the dev server already listening: node scripts/check-room-dev.mjs [url]
import assert from "node:assert/strict";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:4321");
async function request(path) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `${path}: ${response.statusText}`);
  console.log(`PASS HTTP200 ${path}`);
  return response;
}
const scene = await (await request("/src/components/room/RoomScene.tsx")).text();
const dependencies = [...scene.matchAll(/from\s*["'](\/node_modules\/\.vite\/deps\/[^"']+)["']/g)].map((match) => match[1]);
assert.ok(dependencies.length >= 5, "Expected Vite's transformed scene dependencies");
for (const dependency of new Set(dependencies)) await request(dependency);
for (const path of ["/", "/world", ...["office", "desk", "chair", "lounge"].map((name) => `/models/room/${name}.glb`)]) {
  await request(path);
}
