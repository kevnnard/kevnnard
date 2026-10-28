// Analytic lowland fog for forest scenery: a height and distance mask mixed
// toward a cool tint of the scene fog color after three.js applies its
// distant linear fog, which is retargeted to the same tint. The house, lawn
// and sky are never patched, so only environment materials (trees, terrain,
// debris) receive it. Pure config/math are tested in Node.
import type { Material, WebGLProgramParametersWithUniforms } from "three";
import { WORLD } from "./forest-layout.ts";

export interface LowFog {
  /** Full density up to this height above the ground plane. */
  base: number;
  /** No lowland fog at or above this height: upper mountains stay readable. */
  top: number;
  /** Camera distance where the lowland fog starts and where it saturates. */
  start: number;
  end: number;
  /** Horizontal radius from the house where the clearing exemption ends. */
  clearInner: number;
  clearOuter: number;
  /** Maximum mix toward the fog color. */
  density: number;
}

export const LOW_FOG: LowFog = {
  base: 3,
  top: 24,
  start: 18,
  end: 85,
  clearInner: 20,
  clearOuter: 34,
  density: 0.9,
};

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const luma = (color: readonly number[]) =>
  color.reduce((sum, value, i) => sum + value * LUMA[i], 0);
const COOL = [0.78, 1, 1.22];

/**
 * Blue-gray haze target: the clock's fog color pulled `amount` of the way
 * toward a cool gray of the same brightness (`cool` has unit luminance), so
 * a purple night horizon reads as cold mist while daylight barely changes.
 */
export const LOW_FOG_TINT = {
  cool: COOL.map((value) => value / luma(COOL)) as readonly number[],
  amount: 0.7,
} as const;

/** CPU mirror of the shader's `lowFogTint` for one linear RGB color. */
export function lowFogTint(color: readonly number[]): number[] {
  const gray = luma(color);
  return color.map(
    (value, i) =>
      value + (gray * LOW_FOG_TINT.cool[i] - value) * LOW_FOG_TINT.amount,
  );
}

const smooth = (a: number, b: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Point {
  x: number;
  y: number;
  z: number;
}

/** Lowland fog amount in [0, density] for a world point seen from `camera`. */
export function lowFogFactor(world: Point, camera: Point, fog = LOW_FOG) {
  const height = world.y - WORLD.groundY;
  const distance = Math.hypot(
    world.x - camera.x,
    world.y - camera.y,
    world.z - camera.z,
  );
  const clearing = Math.hypot(world.x, world.z);
  return (
    fog.density *
    (1 - smooth(fog.base, fog.top, height)) *
    smooth(fog.start, fog.end, distance) *
    smooth(fog.clearInner, fog.clearOuter, clearing)
  );
}

const float = (value: number) =>
  Number.isInteger(value) ? value.toFixed(1) : String(value);

const TINT_GLSL = [
  `vec3 lowFogTint = mix( fogColor, dot( fogColor, vec3( ${LUMA.join(", ")} ) )` +
    ` * vec3( ${LOW_FOG_TINT.cool.join(", ")} ), ${LOW_FOG_TINT.amount} );`,
  // fog_fragment mixed toward fogColor by fogFactor; move that to the tint.
  "gl_FragColor.rgb += fogFactor * ( lowFogTint - fogColor );",
].join("\n");

// GLSL subset shared with the Node evaluator in tests: float declarations,
// smoothstep/distance/length and swizzles only. Mirrors lowFogFactor.
export function lowFogFragment(fog = LOW_FOG) {
  return [
    `float lowFogHeight = vLowFogWorld.y - ${float(WORLD.groundY)};`,
    `float lowFogDistance = distance( vLowFogWorld, cameraPosition );`,
    `float lowFogClearing = length( vLowFogWorld.xz );`,
    `float lowFog = ${float(fog.density)}` +
      ` * ( 1.0 - smoothstep( ${float(fog.base)}, ${float(fog.top)}, lowFogHeight ) )` +
      ` * smoothstep( ${float(fog.start)}, ${float(fog.end)}, lowFogDistance )` +
      ` * smoothstep( ${float(fog.clearInner)}, ${float(fog.clearOuter)}, lowFogClearing );`,
  ].join("\n");
}

// Same world transform order as three's worldpos_vertex chunk, which is only
// compiled for shadows/env maps, so InstancedMesh instances are fogged where
// they stand rather than at the batch origin.
export const LOW_FOG_VERTEX = [
  "vec4 lowFogWorld = vec4( transformed, 1.0 );",
  "#ifdef USE_BATCHING",
  "lowFogWorld = batchingMatrix * lowFogWorld;",
  "#endif",
  "#ifdef USE_INSTANCING",
  "lowFogWorld = instanceMatrix * lowFogWorld;",
  "#endif",
  "lowFogWorld = modelMatrix * lowFogWorld;",
  "vLowFogWorld = lowFogWorld.xyz;",
].join("\n");

const PATCHES = {
  vertexShader: [
    ["#include <fog_pars_vertex>", "varying vec3 vLowFogWorld;"],
    ["#include <fog_vertex>", LOW_FOG_VERTEX],
  ],
  fragmentShader: [
    ["#include <fog_pars_fragment>", "varying vec3 vLowFogWorld;"],
    [
      "#include <fog_fragment>",
      `#ifdef USE_FOG\n${lowFogFragment()}\n${TINT_GLSL}\ngl_FragColor.rgb = mix( gl_FragColor.rgb, lowFogTint, lowFog );\n#endif`,
    ],
  ],
} as const;

/** Bump when the injected GLSL changes so cached programs are not reused. */
export const LOW_FOG_CACHE_KEY = `lowland-fog-2:${Object.values(LOW_FOG).join(",")}:${LOW_FOG_TINT.cool.join(",")},${LOW_FOG_TINT.amount}`;

type Shader = Pick<
  WebGLProgramParametersWithUniforms,
  "vertexShader" | "fragmentShader"
>;

/**
 * Inject the lowland fog after each expected three.js chunk. Throws instead
 * of silently shipping an unfogged shader when a chunk is missing.
 */
export function patchLowFogShader(shader: Shader) {
  for (const stage of ["vertexShader", "fragmentShader"] as const)
    for (const [chunk, code] of PATCHES[stage]) {
      const count = shader[stage].split(chunk).length - 1;
      if (count !== 1)
        throw new Error(
          `Lowland fog: expected one "${chunk}" in ${stage}, found ${count}`,
        );
      shader[stage] = shader[stage].replace(chunk, `${chunk}\n${code}`);
    }
}

/**
 * Add the lowland fog to a material the caller owns. Chains any existing
 * onBeforeCompile and shares one program cache key across patched materials.
 */
export function applyLowFog<T extends Material>(material: T): T {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    patchLowFogShader(shader);
  };
  material.customProgramCacheKey = () =>
    `${previousKey.call(material)}|${LOW_FOG_CACHE_KEY}`;
  material.needsUpdate = true;
  return material;
}
