import { useLoader } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PROP_FILES } from "@/lib/world/models.ts";
import { LOGO } from "@/lib/world/motion.ts";
import { SETUP_PROPS } from "@/lib/world/setup.ts";

// Desk effects ported from Bruno Simon's my-room-in-3d at 5d00b3f8 (T4i),
// used with the author's permission and credited in public/world/credits.json:
// the coffee steam shaders keep his math, with the perlin2d partial inlined
// instead of glslify. The mug and the logo are original.

/** Bruno's perlin2d partial (shaders/partials/perlin2d.glsl). */
const PERLIN_2D = /* glsl */ `
  vec2 fade(vec2 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}

  float perlin2d(vec2 P){
    vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
    vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
    Pi = mod(Pi, 289.0);
    vec4 ix = Pi.xzxz;
    vec4 iy = Pi.yyww;
    vec4 fx = Pf.xzxz;
    vec4 fy = Pf.yyww;
    vec4 i = permute(permute(ix) + iy);
    vec4 gx = 2.0 * fract(i * 0.0243902439) - 1.0;
    vec4 gy = abs(gx) - 0.5;
    vec4 tx = floor(gx + 0.5);
    gx = gx - tx;
    vec2 g00 = vec2(gx.x,gy.x);
    vec2 g10 = vec2(gx.y,gy.y);
    vec2 g01 = vec2(gx.z,gy.z);
    vec2 g11 = vec2(gx.w,gy.w);
    vec4 norm = 1.79284291400159 - 0.85373472095314 *
      vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
    g00 *= norm.x;
    g01 *= norm.y;
    g10 *= norm.z;
    g11 *= norm.w;
    float n00 = dot(g00, vec2(fx.x, fy.x));
    float n10 = dot(g10, vec2(fx.y, fy.y));
    float n01 = dot(g01, vec2(fx.z, fy.z));
    float n11 = dot(g11, vec2(fx.w, fy.w));
    vec2 fade_xy = fade(Pf.xy);
    vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
    float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
    return 2.3 * n_xy;
  }
`;

/** shaders/coffeeSteam/vertex.glsl */
const STEAM_VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  ${PERLIN_2D}
  void main() {
    vec3 newPosition = position;
    vec2 displacementUv = uv;
    displacementUv *= 5.0;
    displacementUv.y -= uTime * 0.0002;

    float displacementStrength = pow(uv.y * 3.0, 2.0);
    float perlin = perlin2d(displacementUv) * displacementStrength;

    newPosition.y += perlin * 0.1;

    vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    vUv = uv;
  }
`;

/** shaders/coffeeSteam/fragment.glsl, plus the output color space. */
const STEAM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uTimeFrequency;
  uniform vec2 uUvFrequency;
  uniform vec3 uColor;
  varying vec2 vUv;
  ${PERLIN_2D}
  void main() {
    vec2 uv = vUv * uUvFrequency;
    uv.y -= uTime * uTimeFrequency;

    float borderAlpha = min(vUv.x * 4.0, (1.0 - vUv.x) * 4.0);
    borderAlpha = borderAlpha * (1.0 - vUv.y);

    float perlin = perlin2d(uv);
    perlin *= borderAlpha;
    perlin *= 0.6;
    perlin = min(perlin, 1.0);

    gl_FragColor = vec4(uColor, perlin);
    #include <colorspace_fragment>
  }
`;

/** CoffeeSteam.js material; `uTime` is in milliseconds, as in the original. */
export function steamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Seen from any side of the orbit, unlike the original's fixed view.
    side: DoubleSide,
    vertexShader: STEAM_VERTEX,
    fragmentShader: STEAM_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uTimeFrequency: { value: 0.0004 },
      uUvFrequency: { value: new Vector2(4, 5) },
      uColor: { value: new Color("#d2958a") },
    },
  });
}

// The source node's transform in his room (coffeeSteamModel.glb). Undoing it
// returns the plane to his local space, where +y is its normal and the
// shader's `newPosition.y` wobble applies, whatever quantization added.
const SOURCE_ROTATION = new Quaternion(-0.5, 0.5, 0.5, 0.5).normalize();
const SOURCE_NODE = new Matrix4().compose(
  new Vector3(-1.3955568, 2.655597, -3.415476),
  SOURCE_ROTATION,
  new Vector3(1, 1, 1),
);
/** His steam is 1.3 units tall; ours rises about 0.26 m above the mug. */
const STEAM_SCALE = 0.2;

function steamGeometry(scene: Object3D): BufferGeometry {
  scene.updateMatrixWorld(true);
  let source: Mesh | undefined;
  scene.traverse((object) => {
    if (!source && (object as Mesh).isMesh) source = object as Mesh;
  });
  if (!source) throw new Error("coffee steam model has no mesh");
  const toLocal = SOURCE_NODE.clone().invert().multiply(source.matrixWorld);
  const from = source.geometry;
  const position = from.getAttribute("position");
  const uv = from.getAttribute("uv");
  const positions = new Float32Array(position.count * 3);
  const uvs = new Float32Array(uv.count * 2);
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(toLocal);
    positions.set([vertex.x, vertex.y, vertex.z], i * 3);
    uvs.set([uv.getX(i), uv.getY(i)], i * 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  if (from.index) geometry.setIndex(Array.from(from.index.array));
  return geometry;
}

/** Meshopt-compressed GLBs (scripts/prepare-world.py): no Draco decoder. */
export const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/** Steam rising from the mug, its face turned into the room (+x). */
export function CoffeeSteam({
  material,
  visible,
  onPrepared,
}: {
  material: ShaderMaterial;
  visible: boolean;
  /** Called once the loaded steam has committed (world entry loader). */
  onPrepared?: () => void;
}) {
  const gltf = useLoader(GLTFLoader, PROP_FILES.coffeeSteam, extendLoader);
  const { geometry, position, quaternion } = useMemo(() => {
    const geometry = steamGeometry(gltf.scene);
    const normal = new Vector3(0, 1, 0).applyQuaternion(SOURCE_ROTATION);
    const turn = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 2 - Math.atan2(normal.x, normal.z),
    );
    const quaternion = turn.multiply(SOURCE_ROTATION);
    const placed = geometry.clone();
    placed
      .applyQuaternion(quaternion)
      .scale(STEAM_SCALE, STEAM_SCALE, STEAM_SCALE);
    placed.computeBoundingBox();
    const box = placed.boundingBox;
    placed.dispose();
    const { center, height } = SETUP_PROPS.mug;
    const position = new Vector3(
      center[0] - ((box?.min.x ?? 0) + (box?.max.x ?? 0)) / 2,
      center[1] + height * 0.9 - (box?.min.y ?? 0),
      center[2] - ((box?.min.z ?? 0) + (box?.max.z ?? 0)) / 2,
    );
    return { geometry, position, quaternion };
  }, [gltf]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => onPrepared?.(), [onPrepared]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      quaternion={quaternion}
      scale={STEAM_SCALE}
      renderOrder={2}
      visible={visible}
    />
  );
}

const MUG_COLOR = "#f3eee8";
const COFFEE_COLOR = "#4a2c22";
/** Lathe profile (radius, height) up the outside, over the rim, down to the coffee. */
const MUG_PROFILE: readonly [number, number][] = [
  [0, 0],
  [0.03, 0],
  [0.037, 0.002],
  [0.04, 0.008],
  [0.042, 0.088],
  [0.0418, 0.096],
  [0.0395, 0.1],
  [0.037, 0.097],
  [0.0365, 0.086],
  [0.036, 0.084],
  [0, 0.084],
];
/** Profile points from here on are the coffee's surface. */
const COFFEE_FROM = MUG_PROFILE.length - 2;

/** Original rounded mug with a handle, one vertex-colored geometry. */
export function mugGeometry(): BufferGeometry {
  const body = new LatheGeometry(
    MUG_PROFILE.map(([r, y]) => new Vector2(r, y)),
    28,
  );
  const handle = new TorusGeometry(0.024, 0.0065, 8, 16, Math.PI);
  handle.rotateZ(-Math.PI / 2);
  handle.translate(0.04, 0.05, 0);
  const mug = new Color(MUG_COLOR);
  const coffee = new Color(COFFEE_COLOR);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const [part, geometry] of [body, handle].entries()) {
    const offset = positions.length / 3;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      const isCoffee = part === 0 && i % MUG_PROFILE.length >= COFFEE_FROM;
      const color = isCoffee ? coffee : mug;
      colors.push(color.r, color.g, color.b);
    }
    for (const index of geometry.index?.array ?? [])
      indices.push(index + offset);
    geometry.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(normals), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.setIndex(indices);
  return geometry;
}

/** The site's "KV" initials (header avatar) as a small emerald badge. */
export function logoMesh(): {
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  group: Object3D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = Math.round((256 * LOGO.height) / LOGO.width);
  const context = canvas.getContext("2d");
  if (context) {
    const { width, height } = canvas;
    const radius = height * 0.3;
    context.fillStyle = "#10b981";
    context.beginPath();
    context.roundRect(4, 4, width - 8, height - 8, radius);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `700 ${Math.round(height * 0.62)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("KV", width / 2, height / 2 + height * 0.03);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const group = new Object3D();
  const { center, yaw, logo } = SETUP_PROPS.sideScreen;
  group.position.set(...center);
  // A plane faces +z; turn it onto the screen's normal (cos yaw, 0, -sin yaw).
  group.rotation.y = Math.PI / 2 + yaw;
  // The portrait screen is narrower than Bruno's travel (T12): Setup.tsx
  // swaps the bounce axes, and the badge and its travel shrink together.
  group.scale.setScalar(logo.scale);
  const mesh = new Mesh(new PlaneGeometry(LOGO.width, LOGO.height), material);
  mesh.position.z = 0.002;
  mesh.renderOrder = 2;
  group.add(mesh);
  return { mesh, group };
}
