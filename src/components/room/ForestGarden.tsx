import { useLoader, useThree } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  Component,
  memo,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  Box3,
  type BufferGeometry,
  DoubleSide,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  type Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  FERN_MODELS,
  FERN_URL,
  type Fern,
} from "@/lib/room/forest-understory.ts";
import {
  BEDS,
  bollardGeometry,
  boxesGeometry,
  EDGING,
  GARDEN_SIZE,
  type GardenLayer,
  GRAVEL,
  gardenFerns,
  gardenUrls,
  lampGlow,
  MAILBOX,
  mailboxGeometry,
  PATH_LIGHTS,
  stonesGeometry,
} from "@/lib/room/garden-layout.ts";
import {
  groundMaterial,
  groundUrls,
  worldUv,
} from "@/lib/room/ground-materials.ts";
import { LEVELS } from "@/lib/room/house-layout.ts";

// Same URL as the forest ferns: the loader cache shares one parsed GLB.
const FERN_SOURCE = `${FERN_URL}?v=understory-1`;
const FERNS = gardenFerns();
const URLS = [
  ...gardenUrls("stone"),
  ...gardenUrls("gravel"),
  ...groundUrls("forest"),
];
/** Emissive intensity of a lamp head at full night. */
const GLOW = 2.4;
const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

const pick = (textures: Texture[], index: number) => {
  const [color, normal, roughness] = textures.slice(index * 3);
  return { color, normal, roughness };
};

/**
 * Stone or gravel PBR on world-metre UVs, repeating at its captured size.
 * Loader textures stay cached and shared; only the clones are disposed.
 */
function pathMaterial(
  layer: GardenLayer,
  maps: ReturnType<typeof pick>,
  anisotropy: number,
) {
  const textures = (["color", "normal", "roughness"] as const).map((kind) => {
    const texture = maps[kind].clone();
    texture.colorSpace = kind === "color" ? SRGBColorSpace : NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.setScalar(1 / GARDEN_SIZE[layer]);
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  });
  const material = new MeshStandardMaterial({
    map: textures[0],
    normalMap: textures[1],
    roughnessMap: textures[2],
    roughness: 1,
    metalness: 0,
  });
  return {
    material,
    dispose() {
      material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}

/** Replace a temporary geometry by its world-UV copy. */
function owned(geometry: BufferGeometry) {
  const result = worldUv(geometry);
  geometry.dispose();
  return result;
}

function TexturedGarden() {
  const textures = useLoader(TextureLoader, URLS);
  const anisotropy = useThree((state) =>
    Math.min(8, state.gl.capabilities.getMaxAnisotropy()),
  );
  const invalidate = useThree((state) => state.invalidate);
  const garden = useMemo(() => {
    const [x0, , z0] = GRAVEL.min;
    const [x1, top, z1] = GRAVEL.max;
    return {
      gravel: owned(
        new PlaneGeometry(x1 - x0, z1 - z0)
          .rotateX(-Math.PI / 2)
          .translate((x0 + x1) / 2, top, (z0 + z1) / 2),
      ),
      stones: owned(stonesGeometry()),
      soil: owned(boxesGeometry(BEDS)),
      edging: owned(boxesGeometry(EDGING)),
      stone: pathMaterial("stone", pick(textures, 0), anisotropy),
      grit: pathMaterial("gravel", pick(textures, 1), anisotropy),
      earth: groundMaterial("forest", pick(textures, 2), { anisotropy }),
    };
  }, [textures, anisotropy]);
  useEffect(() => {
    // Demand rendering: draw once the loaded textures are in place.
    invalidate();
    return () => {
      for (const geometry of [
        garden.gravel,
        garden.stones,
        garden.soil,
        garden.edging,
      ])
        geometry.dispose();
      for (const material of [garden.stone, garden.grit, garden.earth])
        material.dispose();
    };
  }, [garden, invalidate]);
  return (
    <group name="garden-path-and-beds">
      <mesh
        name="garden-gravel"
        geometry={garden.gravel}
        material={garden.grit.material}
        receiveShadow
        dispose={null}
      />
      <mesh
        name="garden-stepping-stones"
        geometry={garden.stones}
        material={garden.stone.material}
        castShadow
        receiveShadow
        dispose={null}
      />
      <mesh
        name="garden-bed-soil"
        geometry={garden.soil}
        material={garden.earth.material}
        receiveShadow
        dispose={null}
      />
      <mesh
        name="garden-edging"
        geometry={garden.edging}
        material={garden.stone.material}
        castShadow
        receiveShadow
        dispose={null}
      />
    </group>
  );
}

interface FernPart {
  geometry: Mesh["geometry"];
  /** Model frame: centered in XZ, lowest point at y = 0, quantization kept. */
  local: Matrix4;
  height: number;
  ferns: Fern[];
}

function GardenFernInstances({
  part,
  material,
}: {
  part: FernPart;
  material: Material;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    part.ferns.forEach((fern, instance) => {
      // Bed soil is level: only yaw, scale and a slight burial.
      matrix
        .makeRotationY(fern.yaw)
        .scale(new Vector3().setScalar(fern.scale))
        .setPosition(
          fern.x,
          fern.y - fern.burial * part.height * fern.scale,
          fern.z,
        )
        .multiply(part.local);
      mesh.setMatrixAt(instance, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part]);
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, material, part.ferns.length]}
      dispose={null}
    />
  );
}

// The cutout leaves keep the source alpha test and double sides on a clone.
function leafMaterial(root: Object3D) {
  const mesh = root.getObjectByName(FERN_MODELS[0].node) as Mesh | undefined;
  const source = mesh?.material as MeshStandardMaterial | undefined;
  if (
    !source?.map ||
    !(source.alphaTest > 0) ||
    source.transparent ||
    source.side !== DoubleSide
  )
    throw new Error("Forest garden: fern material lost its leaf cutout");
  return source.clone();
}

function GardenFerns() {
  const gltf = useLoader(GLTFLoader, FERN_SOURCE, loaderOptions);
  const invalidate = useThree((state) => state.invalidate);
  const owned = useMemo(() => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const parts = FERN_MODELS.map(({ node }, variant): FernPart => {
      const mesh = root.getObjectByName(node) as Mesh | undefined;
      if (!mesh?.isMesh || Array.isArray(mesh.material))
        throw new Error(`Forest garden: missing fern mesh ${node}`);
      const box = new Box3().setFromObject(mesh);
      const center = box.getCenter(new Vector3());
      return {
        geometry: mesh.geometry,
        local: new Matrix4()
          .makeTranslation(-center.x, -box.min.y, -center.z)
          .multiply(mesh.matrixWorld),
        height: box.max.y - box.min.y,
        ferns: FERNS.filter((fern) => fern.variant === variant),
      };
    });
    return {
      material: leafMaterial(root),
      parts: parts.filter((part) => part.ferns.length),
    };
  }, [gltf]);
  // Only the cloned material is ours; loader geometry/textures stay cached.
  useEffect(() => {
    invalidate();
    return () => owned.material.dispose();
  }, [owned, invalidate]);
  return (
    <group name="garden-ferns">
      {owned.parts.map((part) => (
        <GardenFernInstances
          key={part.geometry.uuid}
          part={part}
          material={owned.material}
        />
      ))}
    </group>
  );
}

function Mailbox() {
  const owned = useMemo(
    () => ({
      ...mailboxGeometry(),
      // Dark powder coat with a satin sheen; a red flag.
      coat: new MeshStandardMaterial({
        color: "#262a27",
        roughness: 0.48,
        metalness: 0.35,
      }),
      paint: new MeshStandardMaterial({ color: "#9e3a2a", roughness: 0.55 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const resource of Object.values(owned)) resource.dispose();
    },
    [owned],
  );
  return (
    <group
      name="garden-mailbox"
      position={[MAILBOX.x, LEVELS.terrainTop, MAILBOX.z]}
    >
      <mesh
        geometry={owned.body}
        material={owned.coat}
        castShadow
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={owned.flag}
        material={owned.paint}
        castShadow
        dispose={null}
      />
    </group>
  );
}

/** Emissive bollards only: no light objects, no shadows, no frame loop. */
function PathLights({ hours }: { hours: number }) {
  const owned = useMemo(
    () => ({
      ...bollardGeometry(),
      coat: new MeshStandardMaterial({
        color: "#262a27",
        roughness: 0.48,
        metalness: 0.35,
      }),
      diffuser: new MeshStandardMaterial({
        color: "#d9cdb8",
        roughness: 0.35,
        emissive: "#ffb46b",
        emissiveIntensity: 0,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      for (const resource of Object.values(owned)) resource.dispose();
    },
    [owned],
  );
  const invalidate = useThree((state) => state.invalidate);
  const glow = lampGlow(hours);
  useEffect(() => {
    owned.diffuser.emissiveIntensity = GLOW * glow;
    invalidate();
  }, [owned, glow, invalidate]);
  const posts = useRef<InstancedMesh>(null);
  const lamps = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new Matrix4();
    for (const mesh of [posts.current, lamps.current]) {
      if (!mesh) continue;
      PATH_LIGHTS.forEach((light, i) => {
        mesh.setMatrixAt(
          i,
          matrix.makeTranslation(light.x, LEVELS.terrainTop, light.z),
        );
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);
  return (
    <group name="garden-path-lights">
      <instancedMesh
        ref={posts}
        args={[owned.post, owned.coat, PATH_LIGHTS.length]}
        castShadow
        dispose={null}
      />
      <instancedMesh
        ref={lamps}
        args={[owned.lamp, owned.diffuser, PATH_LIGHTS.length]}
        dispose={null}
      />
    </group>
  );
}

/** The garden is optional scenery: a failed load must not take down the room. */
class GardenBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    // An empty, named marker keeps the failure inspectable in the scene graph.
    return this.state.failed ? (
      <group name={`${this.props.name}-unavailable`} />
    ) : (
      this.props.children
    );
  }
}

/**
 * Forest garden at the front entrance: gravel and stepping stones over the
 * walk, planted fern beds, a mailbox and low path lights glowing by `hours`.
 */
export const ForestGarden = memo(function ForestGarden({
  hours,
}: {
  hours: number;
}) {
  return (
    <group name="forest-garden">
      <Mailbox />
      <PathLights hours={hours} />
      <GardenBoundary name="garden-path-and-beds">
        <Suspense fallback={null}>
          <TexturedGarden />
        </Suspense>
      </GardenBoundary>
      <GardenBoundary name="garden-ferns">
        <Suspense fallback={null}>
          <GardenFerns />
        </Suspense>
      </GardenBoundary>
    </group>
  );
});
