import assert from "node:assert/strict";
import { it } from "node:test";
import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  ShaderChunk,
  ShaderLib,
  Vector3,
  type WebGLRenderer,
} from "three";
import {
  applyLowFog,
  LOW_FOG,
  LOW_FOG_CACHE_KEY,
  LOW_FOG_TINT,
  LOW_FOG_VERTEX,
  lowFogFactor,
  lowFogFragment,
  lowFogTint,
  patchLowFogShader,
} from "../../src/lib/room/forest-fog.ts";
import { mountainHeight, WORLD } from "../../src/lib/room/forest-layout.ts";

const ground = WORLD.groundY;
const walker = { x: 3, y: 1.8, z: 12 };

it("hides distant lowland strongly while sparing the clearing, high mountains and sky", () => {
  // Far forest floor and trunks dissolve into the fog color.
  assert.ok(lowFogFactor({ x: -20, y: ground, z: -110 }, walker) > 0.85);
  assert.ok(lowFogFactor({ x: 100, y: ground + 4, z: 0 }, walker) > 0.8);
  // Much stronger than the original distant fog alone at the same range.
  const linear = (110 - WORLD.fogStart) / (WORLD.fogEnd - WORLD.fogStart);
  assert.ok(lowFogFactor({ x: 0, y: ground, z: -110 }, walker) > linear * 4);
  // Upper mountain ridges stay readable above the fog layer.
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const x = Math.cos(angle) * 240;
    const z = Math.sin(angle) * 240;
    const y = ground + mountainHeight(x, z);
    if (y - ground >= LOW_FOG.top)
      assert.equal(lowFogFactor({ x, y, z }, walker), 0);
  }
  assert.equal(lowFogFactor({ x: 0, y: 300, z: -500 }, walker), 0);
  // The house clearing stays clear from any camera distance.
  for (const camera of [walker, { x: -60, y: 30, z: 60 }])
    for (const [x, z] of [
      [0, 0],
      [14, 8],
      [-12, -10],
    ])
      assert.equal(lowFogFactor({ x, y: ground, z }, camera), 0);
  // Close debris and the first trees remain visible from the walk area.
  assert.ok(lowFogFactor({ x: 28, y: ground, z: 0 }, walker) < 0.15);
});

// Executes the shipped fragment GLSL subset in JS. Rejects anything outside
// float declarations, swizzles and the three helper functions.
function evaluateFragment(
  source: string,
  world: { x: number; y: number; z: number },
  camera: { x: number; y: number; z: number },
) {
  assert.match(source, /^[\w\s.(),*+\-;=]+$/);
  const js = source.replaceAll(/\bfloat\b/g, "let");
  const smoothstep = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  type V = { x: number; y: number; z?: number };
  const length = (v: V) => Math.hypot(v.x, v.y, v.z ?? 0);
  const distance = (a: V, b: V) =>
    Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const vLowFogWorld = { ...world, xz: { x: world.x, y: world.z } };
  return new Function(
    "smoothstep",
    "length",
    "distance",
    "vLowFogWorld",
    "cameraPosition",
    `${js}\nreturn lowFog;`,
  )(smoothstep, length, distance, vLowFogWorld, camera) as number;
}

it("ships fragment GLSL that matches the tested fog math", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 200; i++) {
    const world = {
      x: (random() - 0.5) * 400,
      y: ground + random() * 40,
      z: (random() - 0.5) * 400,
    };
    const camera = { x: random() * 20, y: 1 + random() * 12, z: random() * 20 };
    const expected = lowFogFactor(world, camera);
    const actual = evaluateFragment(lowFogFragment(), world, camera);
    assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≠ ${expected}`);
  }
});

// Runs the injected vertex statements with real matrices, honoring #ifdef.
function evaluateVertex(
  source: string,
  defines: Set<string>,
  matrices: Record<string, Matrix4>,
  local: Vector3,
) {
  let world: Vector3 | undefined;
  let varying: Vector3 | undefined;
  const skip: boolean[] = [];
  for (const line of source.split("\n").map((value) => value.trim())) {
    const ifdef = line.match(/^#ifdef (\w+)$/);
    if (ifdef) skip.push(!defines.has(ifdef[1]));
    else if (line === "#endif") skip.pop();
    else if (skip.includes(true)) continue;
    else if (line === "vec4 lowFogWorld = vec4( transformed, 1.0 );")
      world = local.clone();
    else if (line === "vLowFogWorld = lowFogWorld.xyz;") varying = world;
    else {
      const multiply = line.match(/^lowFogWorld = (\w+) \* lowFogWorld;$/);
      assert.ok(multiply, `unsupported vertex statement: ${line}`);
      assert.ok(world && matrices[multiply[1]], `unknown ${multiply[1]}`);
      world.applyMatrix4(matrices[multiply[1]]);
    }
  }
  assert.ok(varying, "vLowFogWorld must be assigned");
  return varying;
}

it("fogs each InstancedMesh instance at its own world position", () => {
  const mesh = new InstancedMesh(new BoxGeometry(), undefined, 2);
  mesh.position.set(5, 0, -3);
  mesh.rotation.y = 0.7;
  mesh.updateMatrixWorld(true);
  const placed = new Matrix4().compose(
    new Vector3(80, 0, 40),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.3),
    new Vector3(2, 2, 2),
  );
  mesh.setMatrixAt(1, placed);
  const instance = new Matrix4();
  mesh.getMatrixAt(1, instance);
  const local = new Vector3(0.5, 1, -0.25);
  const expected = local
    .clone()
    .applyMatrix4(instance)
    .applyMatrix4(mesh.matrixWorld);
  const matrices = { instanceMatrix: instance, modelMatrix: mesh.matrixWorld };
  const actual = evaluateVertex(
    LOW_FOG_VERTEX,
    new Set(["USE_INSTANCING"]),
    matrices,
    local,
  );
  assert.ok(actual.distanceTo(expected) < 1e-9);
  // Without instancing the same statements reduce to the model transform.
  const plain = evaluateVertex(LOW_FOG_VERTEX, new Set(), matrices, local);
  assert.ok(
    plain.distanceTo(local.clone().applyMatrix4(mesh.matrixWorld)) < 1e-9,
  );
  assert.ok(actual.distanceTo(plain) > 10, "instance offset must matter");
  mesh.dispose();
});

const standard = () => ({
  vertexShader: ShaderLib.standard.vertexShader,
  fragmentShader: ShaderLib.standard.fragmentShader,
});

it("patches the installed three.js standard shader after its fog chunks", () => {
  const shader = standard();
  patchLowFogShader(shader);
  const vertex = shader.vertexShader;
  // `transformed` exists before fog_vertex, after which the world is computed.
  assert.ok(
    vertex.indexOf("#include <begin_vertex>") <
      vertex.indexOf("#include <fog_vertex>"),
  );
  assert.match(ShaderChunk.begin_vertex, /vec3 transformed/);
  assert.ok(
    vertex.indexOf(LOW_FOG_VERTEX) > vertex.indexOf("#include <fog_vertex>"),
  );
  assert.ok(
    vertex.indexOf("varying vec3 vLowFogWorld;") < vertex.indexOf("void main"),
  );
  const fragment = shader.fragmentShader;
  assert.ok(
    fragment.indexOf(lowFogFragment()) >
      fragment.indexOf("#include <fog_fragment>"),
  );
  assert.ok(
    fragment.indexOf("varying vec3 vLowFogWorld;") <
      fragment.indexOf("void main"),
  );
  // The haze target is derived from the scene fog uniform the day cycle
  // already updates, so it follows the clock instead of a fixed color.
  assert.match(ShaderChunk.fog_pars_fragment, /uniform vec3 fogColor;/);
  assert.match(ShaderChunk.fog_fragment, /float fogFactor = /g);
  assert.match(
    ShaderChunk.fog_fragment,
    /mix\( gl_FragColor\.rgb, fogColor, fogFactor \)/,
  );
  assert.match(fragment, /vec3 lowFogTint = mix\( fogColor, /);
  // Retargets three's distant fog to the tint, then adds the lowland haze.
  assert.match(
    fragment,
    /gl_FragColor\.rgb \+= fogFactor \* \( lowFogTint - fogColor \);\s*gl_FragColor\.rgb = mix\( gl_FragColor\.rgb, lowFogTint, lowFog \);/,
  );
  for (const value of [...LOW_FOG_TINT.cool, LOW_FOG_TINT.amount])
    assert.ok(fragment.includes(String(value)), `GLSL lacks ${value}`);
  // Instancing is compiled through this exact define in three.js programs.
  assert.match(ShaderChunk.project_vertex, /#ifdef USE_INSTANCING/);
});

it("cools the haze toward blue-gray while keeping the clock's brightness", () => {
  const luminance = ([r, g, b]: readonly number[]) =>
    0.2126 * r + 0.7152 * g + 0.0722 * b;
  // A purple night horizon becomes a blue-gray haze of the same brightness.
  const night = [0.2, 0.15, 0.32] as const;
  const haze = lowFogTint(night);
  assert.ok(Math.abs(luminance(haze) - luminance(night)) < 1e-9);
  assert.ok(haze[2] > haze[0] && haze[1] > haze[0], `${haze}`);
  assert.ok(haze[2] - haze[0] < night[2] - night[0] + 0.05);
  // Red, green and blue end closer together than in the purple source.
  const spread = (c: readonly number[]) => Math.max(...c) - Math.min(...c);
  assert.ok(Math.abs(haze[0] - haze[1]) < Math.abs(night[0] - night[1]));
  assert.ok(spread(haze) <= spread(night) + 1e-9);
  // Daylight stays close to the sky's own horizon color.
  const day = [0.62, 0.74, 0.86] as const;
  const tinted = lowFogTint(day);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(tinted[i] - day[i]) < 0.1);
  assert.ok(Math.abs(luminance(LOW_FOG_TINT.cool) - 1) < 1e-9);
});

it("fails loudly when an expected three.js fog chunk is missing", () => {
  for (const [stage, chunk] of [
    ["vertexShader", "#include <fog_vertex>"],
    ["vertexShader", "#include <fog_pars_vertex>"],
    ["fragmentShader", "#include <fog_fragment>"],
    ["fragmentShader", "#include <fog_pars_fragment>"],
  ] as const) {
    const shader = standard();
    shader[stage] = shader[stage].replace(chunk, "");
    assert.throws(() => patchLowFogShader(shader), new RegExp(chunk));
  }
});

it("chains material hooks and shares a distinct program cache key", () => {
  const plain = new MeshStandardMaterial();
  const calls: string[] = [];
  const first = new MeshStandardMaterial();
  first.onBeforeCompile = () => calls.push("previous");
  first.customProgramCacheKey = () => "ground";
  applyLowFog(first);
  const second = new MeshStandardMaterial();
  const unpatchedKey = second.customProgramCacheKey();
  applyLowFog(second);
  const shader = { ...standard(), uniforms: {} };
  first.onBeforeCompile(
    shader as Parameters<MeshStandardMaterial["onBeforeCompile"]>[0],
    {} as WebGLRenderer,
  );
  assert.deepEqual(calls, ["previous"]);
  assert.ok(shader.fragmentShader.includes(lowFogFragment()));
  assert.ok(first.customProgramCacheKey().includes(LOW_FOG_CACHE_KEY));
  assert.ok(first.customProgramCacheKey().startsWith("ground"));
  assert.notEqual(second.customProgramCacheKey(), unpatchedKey);
  assert.ok(second.customProgramCacheKey().endsWith(`|${LOW_FOG_CACHE_KEY}`));
  assert.equal(
    second.customProgramCacheKey(),
    applyLowFog(new MeshStandardMaterial()).customProgramCacheKey(),
  );
  assert.notEqual(
    second.customProgramCacheKey(),
    plain.customProgramCacheKey(),
  );
  for (const material of [plain, first, second]) material.dispose();
});
