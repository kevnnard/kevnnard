import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  type DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  type Group,
  type HemisphereLight,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  type Points,
  type PointsMaterial,
  Quaternion,
  Shape,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import House from "@/components/world/House";
import Setup from "@/components/world/Setup";
import type { RGB } from "@/lib/room/day-cycle.ts";
import {
  GUIDE,
  guideMotion,
  guidePose,
  poseToPosition,
} from "@/lib/world/camera.ts";
import { cloudLayout, cloudShapes } from "@/lib/world/clouds.ts";
import {
  FLOWER_COLORS,
  flowerLayout,
  flowerMesh,
} from "@/lib/world/flowers.ts";
import {
  ISLAND,
  islandOutline,
  PAD,
  undersideMesh,
} from "@/lib/world/island.ts";
import {
  islandLayout,
  KIND_SPECS,
  type NatureKind,
  type Placement,
} from "@/lib/world/layout.ts";
import { MODEL_FILES } from "@/lib/world/models.ts";
import { cloudShade, PALETTE, worldLight } from "@/lib/world/palette.ts";
import { seededRandom } from "@/lib/world/random.ts";

const KINDS = Object.keys(MODEL_FILES) as NatureKind[];
const URLS = KINDS.map((kind) => MODEL_FILES[kind]);
const LAYOUT = islandLayout(ISLAND.seed);
const FLOWERS = flowerLayout(LAYOUT, ISLAND.seed);
const SKY_RADIUS = 90;
const STAR_COUNT = 260;
const SHADOW_EXTENT = 9;

const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder);
};

const setColor = (color: Color, [r, g, b]: RGB) =>
  color.setRGB(r, g, b, SRGBColorSpace);

interface WorldSceneProps {
  /** Hour of the day (0-24) from the shared room clock. */
  hours: number;
  reducedMotion: boolean;
  /** Incremented by "Recenter view" to return to the home framing. */
  home: number;
  onReady: () => void;
}

export default function WorldScene({
  hours,
  reducedMotion,
  home,
  onReady,
}: WorldSceneProps) {
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.5]}
      camera={{ fov: GUIDE.fov, near: 0.1, far: 200, position: [20, 14, 20] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Stylized floating island with a wooden house. Drag to orbit, scroll to zoom in and see inside."
      role="img"
    >
      <WorldLighting hours={hours} />
      <GuidedCamera reducedMotion={reducedMotion} home={home} />
      <Island />
      <House reducedMotion={reducedMotion} />
      <Setup hours={hours} />
      <Flowers />
      <Clouds hours={hours} reducedMotion={reducedMotion} />
      <Nature onReady={onReady} />
    </Canvas>
  );
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  varying vec3 vDirection;
  void main() {
    float y = vDirection.y;
    vec3 color = y >= 0.0
      ? mix(horizon, zenith, pow(smoothstep(0.0, 1.0, y), 0.7))
      : mix(horizon, ground, smoothstep(0.0, 0.4, -y));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Pastel sky, stars, sun/moon key light and soft fill, all from the hour. */
function WorldLighting({ hours }: { hours: number }) {
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const stars = useRef<Points>(null);
  const { gl, scene, invalidate } = useThree();

  const uniforms = useMemo(
    () => ({
      zenith: { value: new Color() },
      horizon: { value: new Color() },
      ground: { value: new Color() },
    }),
    [],
  );

  const starGeometry = useMemo(() => {
    const random = seededRandom(ISLAND.seed * 31);
    const positions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = random() * Math.PI * 2;
      const y = 0.15 + random() * 0.85;
      const ring = Math.sqrt(1 - y * y);
      const r = SKY_RADIUS * 0.9;
      positions.set(
        [Math.cos(theta) * ring * r, y * r, Math.sin(theta) * ring * r],
        i * 3,
      );
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    return geometry;
  }, []);
  useEffect(() => () => starGeometry.dispose(), [starGeometry]);

  useLayoutEffect(() => {
    const light = worldLight(hours);
    setColor(uniforms.zenith.value, light.sky.zenith);
    setColor(uniforms.horizon.value, light.sky.horizon);
    setColor(uniforms.ground.value, light.sky.ground);
    if (key.current) {
      const [x, y, z] = light.key.position;
      key.current.position.set(x * 1.6, y * 1.6, z * 1.6);
      setColor(key.current.color, light.key.color);
      key.current.intensity = light.key.intensity;
    }
    if (fill.current) {
      setColor(fill.current.color, light.ambient.sky);
      setColor(fill.current.groundColor, light.ambient.ground);
      fill.current.intensity = light.ambient.intensity;
    }
    if (stars.current) {
      const material = stars.current.material as PointsMaterial;
      material.opacity = light.stars;
      stars.current.visible = light.stars > 0.01;
    }
    if (scene.fog) setColor(scene.fog.color, light.fog);
    gl.toneMappingExposure = light.exposure;
    invalidate();
  }, [hours, uniforms, gl, scene, invalidate]);

  return (
    <>
      <fog attach="fog" args={["#f4e9e0", 45, 110]} />
      <mesh renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          fog={false}
          uniforms={uniforms}
          vertexShader={SKY_VERTEX}
          fragmentShader={SKY_FRAGMENT}
        />
      </mesh>
      <points ref={stars} geometry={starGeometry} frustumCulled={false}>
        <pointsMaterial
          color="#fff7e8"
          size={1.4}
          sizeAttenuation={false}
          transparent
          depthWrite={false}
          fog={false}
        />
      </points>
      <hemisphereLight ref={fill} />
      <directionalLight
        ref={key}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-radius={4}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
    </>
  );
}

const { ACTION } = CameraControlsImpl;

/** Three-quarter home framing, 360° orbit around the house and close zoom; no panning. */
function GuidedCamera({
  reducedMotion,
  home,
}: {
  reducedMotion: boolean;
  home: number;
}) {
  const controls = useRef<CameraControls>(null);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const motion = guideMotion(reducedMotion);
  const { limits } = GUIDE;
  const first = useRef(true);

  useEffect(() => {
    const current = controls.current;
    if (!current) return;
    const [x, y, z] = poseToPosition(guidePose(aspect));
    const [tx, ty, tz] = GUIDE.target;
    current.setLookAt(x, y, z, tx, ty, tz, !reducedMotion && !first.current);
    first.current = false;
  }, [aspect, home, reducedMotion]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={limits.minDistance}
      maxDistance={limits.maxDistance}
      minPolarAngle={limits.minPolar}
      maxPolarAngle={limits.maxPolar}
      smoothTime={motion.smoothTime}
      draggingSmoothTime={motion.draggingSmoothTime}
      azimuthRotateSpeed={motion.azimuthRotateSpeed}
      polarRotateSpeed={motion.polarRotateSpeed}
      dollySpeed={motion.dollySpeed}
      truckSpeed={0}
      mouseButtons={{
        left: ACTION.ROTATE,
        middle: ACTION.DOLLY,
        right: ACTION.NONE,
        wheel: ACTION.DOLLY,
      }}
      touches={{
        one: ACTION.TOUCH_ROTATE,
        two: ACTION.TOUCH_DOLLY,
        three: ACTION.NONE,
      }}
    />
  );
}

/** Rounded grass slab, rocky underside and the building pad (T4). */
function Island() {
  const grass = useMemo(() => {
    const outline = islandOutline(72);
    // Shape is drawn in x/-z, then the extrusion is turned to grow upward.
    const shape = new Shape(outline.map(([x, z]) => new Vector2(x, -z)));
    const depth = Math.max(0.01, ISLAND.grassThickness - 2 * ISLAND.bevel);
    const geometry = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: ISLAND.bevel,
      bevelSize: ISLAND.bevel,
      bevelSegments: 4,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -(depth + ISLAND.bevel), 0);
    return geometry;
  }, []);

  const rock = useMemo(() => {
    const { positions, indices } = undersideMesh(ISLAND.seed);
    const indexed = new BufferGeometry();
    indexed.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(positions), 3),
    );
    indexed.setIndex(indices);
    // Faceted rock: every face gets its own normal.
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    geometry.computeVertexNormals();
    geometry.translate(0, -ISLAND.grassThickness + 0.08, 0);
    return geometry;
  }, []);

  useEffect(
    () => () => {
      grass.dispose();
      rock.dispose();
    },
    [grass, rock],
  );

  return (
    <group>
      <mesh geometry={grass} receiveShadow castShadow>
        <meshStandardMaterial color={PALETTE.grass} roughness={1} />
      </mesh>
      <mesh geometry={rock} receiveShadow>
        <meshStandardMaterial color={PALETTE.rock} roughness={1} flatShading />
      </mesh>
      {/* Flat pad the house (T4a) stands on. */}
      <mesh
        position={[PAD.center[0], PAD.height / 2, PAD.center[1]]}
        receiveShadow
      >
        <boxGeometry args={[PAD.halfX * 2, PAD.height, PAD.halfZ * 2]} />
        <meshStandardMaterial color={PALETTE.pad} roughness={1} />
      </mesh>
    </group>
  );
}

// Owned material tints: atlas colors are multiplied, then lifted toward cream.
const TINTS: Record<NatureKind, string> = {
  tree: PALETTE.foliage,
  pine: PALETTE.foliage,
  pines: PALETTE.foliage,
  "pines-b": PALETTE.foliage,
  "rock-a": PALETTE.stone,
  "rock-b": PALETTE.stone,
  stone: PALETTE.stone,
  tuft: PALETTE.foliage,
  "tuft-small": PALETTE.foliage,
  bush: PALETTE.foliage,
};
const PASTEL_LIFT = 0.22;

function pastelMaterial(source: Material, tint: string): Material {
  const material = (source as MeshStandardMaterial).clone();
  material.color.set(tint);
  material.roughness = 1;
  material.metalness = 0;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.92), ${PASTEL_LIFT.toFixed(2)});`,
    );
  };
  material.customProgramCacheKey = () => `world-pastel-${PASTEL_LIFT}`;
  return material;
}

const scratch = {
  placement: new Matrix4(),
  normalize: new Matrix4(),
  instance: new Matrix4(),
  rotation: new Quaternion(),
  axis: new Vector3(0, 1, 0),
};

/** One InstancedMesh per model primitive: a draw call per primitive, not per item. */
function buildInstances(
  kind: NatureKind,
  root: Object3D,
  placements: Placement[],
): Group {
  const group = new Object3D() as Group;
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const height = KIND_SPECS[kind].height;
  const unit = height / Math.max(size.y, 1e-6);
  // Base centered on the origin, scaled to the kind's height.
  scratch.normalize
    .makeScale(unit, unit, unit)
    .multiply(new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const material = pastelMaterial(mesh.material as Material, TINTS[kind]);
    const instanced = new InstancedMesh(
      mesh.geometry,
      material,
      placements.length,
    );
    placements.forEach((item, index) => {
      scratch.rotation.setFromAxisAngle(scratch.axis, item.rotationY);
      scratch.placement.compose(
        new Vector3(...item.position),
        scratch.rotation,
        new Vector3(item.scale, item.scale, item.scale),
      );
      scratch.instance
        .copy(scratch.placement)
        .multiply(scratch.normalize)
        .multiply(mesh.matrixWorld);
      instanced.setMatrixAt(index, scratch.instance);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    group.add(instanced);
  });
  return group;
}

function Nature({ onReady }: { onReady: () => void }) {
  const gltfs = useLoader(GLTFLoader, URLS, extendLoader);

  const groups = useMemo(
    () =>
      KINDS.map((kind, index) => ({
        kind,
        group: buildInstances(
          kind,
          gltfs[index].scene,
          LAYOUT.filter((item) => item.kind === kind),
        ),
      })),
    [gltfs],
  );

  useEffect(() => {
    onReady();
    return () => {
      for (const { group } of groups)
        for (const child of group.children) {
          const mesh = child as InstancedMesh;
          (mesh.material as Material).dispose();
          mesh.dispose();
        }
    };
  }, [groups, onReady]);

  return (
    <>
      {groups.map(({ kind, group }) => (
        <primitive key={kind} object={group} />
      ))}
    </>
  );
}

/**
 * Original procedural clouds: one instanced draw per seeded shape, in a soft
 * material (fully rough, smooth normals, emissive lift) tinted by the hour.
 */
function Clouds({
  hours,
  reducedMotion,
}: {
  hours: number;
  reducedMotion: boolean;
}) {
  const clouds = useRef<Group>(null);
  const { drift } = guideMotion(reducedMotion);
  const invalidate = useThree((state) => state.invalidate);

  const { group, material } = useMemo(() => {
    const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const group = new Object3D() as Group;
    const placements = cloudLayout(ISLAND.seed);
    cloudShapes(ISLAND.seed).forEach((shape, index) => {
      const mine = placements.filter((cloud) => cloud.shape === index);
      if (mine.length === 0) return;
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(shape.positions), 3),
      );
      geometry.setAttribute(
        "normal",
        new BufferAttribute(new Float32Array(shape.normals), 3),
      );
      geometry.setIndex(shape.indices);
      const instanced = new InstancedMesh(geometry, material, mine.length);
      mine.forEach((cloud, slot) => {
        scratch.rotation.setFromAxisAngle(scratch.axis, cloud.rotationY);
        scratch.instance.compose(
          new Vector3(...cloud.position),
          scratch.rotation,
          new Vector3(cloud.scale, cloud.scale, cloud.scale),
        );
        instanced.setMatrixAt(slot, scratch.instance);
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    });
    return { group, material };
  }, []);

  useEffect(
    () => () => {
      material.dispose();
      for (const child of group.children) {
        const mesh = child as InstancedMesh;
        mesh.geometry.dispose();
        mesh.dispose();
      }
    },
    [group, material],
  );

  // Warm white by day, pink at dusk, dim blue at night.
  useLayoutEffect(() => {
    const shade = cloudShade(worldLight(hours));
    setColor(material.color, shade.color);
    setColor(material.emissive, shade.emissive);
    material.emissiveIntensity = shade.emissiveIntensity;
    invalidate();
  }, [hours, material, invalidate]);

  // Clouds drift slowly around the island; reduced motion keeps them still.
  useFrame((state, delta) => {
    if (!drift || !clouds.current) return;
    clouds.current.rotation.y += delta * 0.01;
    state.invalidate();
  });

  return (
    <group ref={clouds}>
      <primitive object={group} />
    </group>
  );
}

/** Original procedural flowers: two instanced draws for every flower. */
function Flowers() {
  const group = useMemo(() => {
    const { body, petals } = flowerMesh();
    const color = new Color();
    const bodyColors = new Float32Array(body.colors.length);
    for (let i = 0; i < body.colors.length; i += 3) {
      const [r, g, b] = body.colors.slice(i, i + 3);
      setColor(color, [r, g, b]);
      bodyColors.set([color.r, color.g, color.b], i);
    }
    const bodyGeometry = new BufferGeometry();
    bodyGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(body.positions), 3),
    );
    bodyGeometry.setAttribute("color", new BufferAttribute(bodyColors, 3));
    bodyGeometry.computeVertexNormals();
    const petalGeometry = new BufferGeometry();
    petalGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(petals.positions), 3),
    );
    petalGeometry.computeVertexNormals();

    const stems = new InstancedMesh(
      bodyGeometry,
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: DoubleSide,
      }),
      FLOWERS.length,
    );
    const blooms = new InstancedMesh(
      petalGeometry,
      new MeshStandardMaterial({ roughness: 1, side: DoubleSide }),
      FLOWERS.length,
    );
    FLOWERS.forEach((flower, index) => {
      scratch.rotation.setFromAxisAngle(scratch.axis, flower.rotationY);
      scratch.instance.compose(
        new Vector3(...flower.position),
        scratch.rotation,
        new Vector3(flower.scale, flower.scale, flower.scale),
      );
      stems.setMatrixAt(index, scratch.instance);
      blooms.setMatrixAt(index, scratch.instance);
      blooms.setColorAt(index, color.set(FLOWER_COLORS[flower.color]));
    });
    const flowers = new Object3D() as Group;
    for (const mesh of [stems, blooms]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      flowers.add(mesh);
    }
    return flowers;
  }, []);

  useEffect(
    () => () => {
      for (const child of group.children) {
        const mesh = child as InstancedMesh;
        (mesh.material as Material).dispose();
        mesh.geometry.dispose();
        mesh.dispose();
      }
    },
    [group],
  );

  return <primitive object={group} />;
}
