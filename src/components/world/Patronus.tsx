import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { type RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  AnimationMixer,
  Box3,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  type Object3D,
  type PointLight,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SkinnedMesh,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  PATRONUS,
  type PatronusState,
  patronusAt,
} from "@/lib/world/patronus.ts";
import { patronusFxAt } from "@/lib/world/patronus-fx.ts";

/**
 * What the ghost effect drives (patronus T1): an object facing +z with its
 * feet at y 0, PATRONUS.lionHeight tall, every mesh wearing the ghost
 * material; `update` animates it (a gait, an AnimationMixer); `sample`
 * picks a point on its body (world) for the wisps. The prepared lion
 * implements it.
 */
export interface PatronusModel {
  object: Object3D;
  update: (delta: number, state: PatronusState) => void;
  sample: (out: Vector3) => Vector3;
  dispose: () => void;
}

const GHOST_VERTEX = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uModelScale;
varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec3 vLocal;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vNormalView = normalize(transformedNormal);
  vViewDir = normalize(-mvPosition.xyz);
  vLocal = transformed * uModelScale;
}
`;

const GHOST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform float uOpacity;
uniform float uDissolve;
uniform float uTime;
uniform float uFormation;
varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec3 vLocal;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
void main() {
  // Metre-scale flowing light: avoid centimetre-scale glitter and strobe.
  float n = noise(vLocal * 2.6 - vec3(uTime * 0.18, uTime * 0.3, 0.0));
  float threads = pow(0.5 + 0.5 * sin(vLocal.y * 13.0 + vLocal.z * 6.0 + n * 5.0 - uTime * 1.8), 6.0);
  float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.7);
  float form = smoothstep(n - 0.18, n + 0.18, uFormation);
  float dissolve = 1.0 - smoothstep(n - 0.18, n + 0.18, uDissolve);
  vec3 color = mix(uColor * 0.45, uRim * 1.15, fresnel) + threads * uColor * 0.28;
  float alpha = (0.11 + 0.65 * fresnel + 0.1 * threads) * uOpacity * form * dissolve;
  gl_FragColor = vec4(color, alpha);
}
`;

/** The ghost: additive, translucent, a fresnel rim, dissolving by noise. */
function ghostMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: GHOST_VERTEX,
    fragmentShader: GHOST_FRAGMENT,
    uniforms: {
      uColor: { value: new Color(PATRONUS.color) },
      uRim: { value: new Color(PATRONUS.rim) },
      uOpacity: { value: 0 },
      uDissolve: { value: 0 },
      uTime: { value: 0 },
      uFormation: { value: 0 },
      uModelScale: { value: 0.01 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
}

const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

/**
 * The prepared lion (scripts/prepare-patronus.mjs): every mesh in the
 * ghost material, its run (or walk, or only) clip played by an
 * AnimationMixer, scaled to PATRONUS.lionHeight tall (about 1 m at the
 * shoulder) and stood on y 0, facing +z as authored.
 */
function useLionModel(url: string, material: ShaderMaterial): PatronusModel {
  const gltf = useLoader(GLTFLoader, url, loaderOptions);
  return useMemo(() => {
    const lion = cloneSkinned(gltf.scene);
    const meshes: Mesh[] = [];
    lion.traverse((node) => {
      if ((node as Mesh).isMesh) {
        const mesh = node as Mesh;
        mesh.material = material;
        mesh.frustumCulled = false;
        // The prepared lion ships without its flat normals (they kept its
        // vertices from welding); smooth ones give the ghost a soft rim.
        if (!mesh.geometry.getAttribute("normal"))
          mesh.geometry.computeVertexNormals();
        meshes.push(mesh);
      }
    });
    const box = new Box3().setFromObject(lion);
    const size = box.getSize(new Vector3());
    const scale = PATRONUS.lionHeight / Math.max(size.y, 1e-6);
    material.uniforms.uModelScale.value = scale;
    const root = new Group();
    root.name = "patronus-lion";
    lion.scale.setScalar(scale);
    lion.position.set(
      -((box.min.x + box.max.x) / 2) * scale,
      -box.min.y * scale,
      -((box.min.z + box.max.z) / 2) * scale,
    );
    root.add(lion);
    const mixer = new AnimationMixer(lion);
    const clip =
      gltf.animations.find((c) => /run/i.test(c.name)) ??
      gltf.animations.find((c) => /walk/i.test(c.name)) ??
      gltf.animations[0];
    if (clip) mixer.clipAction(clip).play();
    const point = new Vector3();
    return {
      object: root,
      // The gallop loops at PATRONUS.gait, replayed from the spell clock so
      // every cast starts on the same stride.
      update: (_delta, state) =>
        mixer.setTime(
          (state.time * PATRONUS.gait) % Math.max(clip?.duration ?? 1, 1e-3),
        ),
      sample: (out) => {
        const mesh = meshes[Math.floor(Math.random() * meshes.length)];
        const position = mesh?.geometry.getAttribute("position");
        if (!mesh || !position) return out.copy(root.getWorldPosition(point));
        const i = Math.floor(Math.random() * position.count);
        point.fromBufferAttribute(position, i);
        if (mesh instanceof SkinnedMesh) mesh.applyBoneTransform(i, point);
        return out.copy(mesh.localToWorld(point));
      },
      dispose: () => mixer.stopAllAction(),
    };
  }, [gltf, material]);
}

/** A soft round dot for the additive particles. */
export function dotTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.5)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/**
 * Silver-blue additive particles on the CPU: a small ring buffer, each one
 * fading by darkening its color (additive, so dark is clear). The wand's
 * spark trail and the patronus's wisps share it.
 */
export class GhostParticles {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocity: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private next = 0;
  private alive = 0;
  private readonly tint: Color;
  private readonly texture: CanvasTexture | null;

  constructor(count: number, size: number, color: string) {
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.life = new Float32Array(count).fill(1);
    this.tint = new Color(color);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new BufferAttribute(this.colors, 3));
    this.texture = dotTexture();
    const material = new PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      ...(this.texture && { map: this.texture }),
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
  }

  /** One particle at `at`, moving at `velocity` (m/s), for `life` seconds. */
  emit(at: Vector3, velocity: Vector3, life: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.age.length;
    this.positions.set([at.x, at.y, at.z], i * 3);
    this.velocity.set([velocity.x, velocity.y, velocity.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
  }

  /** Moves and fades every particle; returns whether any is still alive. */
  update(delta: number, lift = 0.15): boolean {
    let alive = 0;
    for (let i = 0; i < this.age.length; i++) {
      const k = i * 3;
      if (this.age[i] >= 1) {
        this.colors[k] = this.colors[k + 1] = this.colors[k + 2] = 0;
        continue;
      }
      this.age[i] = Math.min(1, this.age[i] + delta / this.life[i]);
      const drag = 1 - Math.min(1, delta * 1.8);
      this.velocity[k] *= drag;
      this.velocity[k + 1] = this.velocity[k + 1] * drag + lift * delta;
      this.velocity[k + 2] *= drag;
      this.positions[k] += this.velocity[k] * delta;
      this.positions[k + 1] += this.velocity[k + 1] * delta;
      this.positions[k + 2] += this.velocity[k + 2] * delta;
      const fade = (1 - this.age[i]) ** 1.5;
      this.colors[k] = this.tint.r * fade;
      this.colors[k + 1] = this.tint.g * fade;
      this.colors[k + 2] = this.tint.b * fade;
      if (this.age[i] < 1) alive++;
    }
    this.alive = alive;
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    return alive > 0;
  }

  get active(): boolean {
    return this.alive > 0;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    this.texture?.dispose();
  }
}

/**
 * Drives one model through the run: placed, turned and sized from
 * patronusAt each frame, the ghost's opacity and dissolve, a slight
 * flicker, wisps trailing and a burst of particles as it dissolves, and a
 * faint light on the floor. Frames are requested only while it runs.
 */
function PatronusRun({
  model,
  material,
  castAt,
}: {
  model: PatronusModel;
  material: ShaderMaterial;
  /** When the spell began (performance.now() seconds); null: not cast. */
  castAt: RefObject<number | null>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const wisps = useMemo(() => new GhostParticles(400, 0.03, PATRONUS.rim), []);
  const mist = useMemo(() => new GhostParticles(80, 0.22, "#22344d"), []);
  const carry = useRef(0);
  const mistCarry = useRef(0);
  const light = useRef<PointLight>(null);
  const tmp = useMemo(() => new Vector3(), []);
  const drift = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      wisps.dispose();
      mist.dispose();
      model.dispose();
    },
    [wisps, mist, model],
  );
  useEffect(() => invalidate(), [invalidate]);
  useFrame((frame, delta) => {
    const start = castAt.current;
    const now = performance.now() / 1000;
    const state = start === null ? null : patronusAt(now - start);
    const root = model.object;
    if (state) {
      root.visible = true;
      root.position.set(...state.position);
      root.rotation.y = state.heading;
      root.scale.setScalar(state.scale);
      model.update(delta, state);
      root.updateMatrixWorld(true);
      const envelope = patronusFxAt(now - (start ?? now));
      material.uniforms.uOpacity.value = state.opacity;
      material.uniforms.uFormation.value = envelope.formation;
      material.uniforms.uDissolve.value = state.dissolve;
      material.uniforms.uTime.value = now;
      // Wisps trail off the body; a burst as it dissolves.
      carry.current += (50 + 200 * state.dissolve) * Math.min(delta, 0.05);
      while (carry.current >= 1) {
        carry.current--;
        model.sample(tmp);
        drift.set(
          (Math.random() - 0.5) * 0.18,
          0.12 + state.dissolve * 0.45,
          (Math.random() - 0.5) * 0.18,
        );
        wisps.emit(tmp, drift, 1 + Math.random() * 0.8);
      }
      mistCarry.current += 25 * envelope.mist * Math.min(delta, 0.05);
      while (mistCarry.current >= 1) {
        mistCarry.current--;
        model.sample(tmp);
        drift.set(
          -Math.sin(state.heading) * 0.12,
          0.08,
          -Math.cos(state.heading) * 0.12,
        );
        mist.emit(tmp, drift, 1.1);
      }
      if (light.current) {
        light.current.position.set(
          state.position[0],
          state.position[1] + PATRONUS.lionHeight * 0.6,
          state.position[2],
        );
        light.current.intensity = 0.7 * state.opacity;
      }
    } else {
      root.visible = false;
      if (light.current) light.current.intensity = 0;
    }
    const particles = wisps.update(Math.min(delta, 0.05));
    const fog = mist.update(Math.min(delta, 0.05), 0.08);
    if (state || particles || fog) frame.invalidate();
  });
  return (
    <>
      <primitive object={model.object} />
      <primitive object={wisps.points} />
      <primitive object={mist.points} />
      {/* Always mounted, zero when it is not out: no shader recompiles. */}
      <pointLight
        ref={light}
        color={PATRONUS.color}
        intensity={0}
        distance={1.6}
        decay={2}
      />
    </>
  );
}

function Lion({
  url,
  castAt,
}: {
  url: string;
  castAt: RefObject<number | null>;
}) {
  const material = useMemo(() => ghostMaterial(), []);
  const model = useLionModel(url, material);
  useEffect(() => () => material.dispose(), [material]);
  return <PatronusRun model={model} material={material} castAt={castAt} />;
}

/**
 * The patronus (patronus T1, T2): Walter Araujo's galloping lion (PATRONUS.lion), nothing
 * while it loads. Off under reduced motion.
 */
export default function Patronus({
  castAt,
  reducedMotion,
}: {
  castAt: RefObject<number | null>;
  reducedMotion: boolean;
}) {
  if (reducedMotion) return null;
  return (
    <Suspense fallback={null}>
      <Lion url={PATRONUS.lion} castAt={castAt} />
    </Suspense>
  );
}
