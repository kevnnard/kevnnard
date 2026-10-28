import { useLoader } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  Component,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  Box3,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  DEBRIS_MODELS,
  DEBRIS_URLS,
  type DebrisKind,
  type DebrisPiece,
  forestDebris,
} from "@/lib/room/forest-debris.ts";
import { applyLowFog } from "@/lib/room/forest-fog.ts";

const KINDS: readonly DebrisKind[] = ["log", "stump", "rock"];
const URLS = KINDS.map((kind) => `${DEBRIS_URLS[kind]}?v=debris-1`);
const PIECES = forestDebris();
const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

interface DebrisPart {
  geometry: Mesh["geometry"];
  material: Material;
  /** Model frame: centered in XZ, lowest point at y = 0, quantization kept. */
  local: Matrix4;
  height: number;
  pieces: DebrisPiece[];
}

// Like the trees, compose matrices instead of baking into quantized vertices.
// Each rock of the set is its own part, so rocks are placed individually.
function debrisParts(
  root: Object3D,
  kind: DebrisKind,
  materials: Map<Material, Material>,
): DebrisPart[] {
  root.updateMatrixWorld(true);
  return DEBRIS_MODELS[kind].map(({ node }, variant) => {
    const mesh = root.getObjectByName(node) as Mesh | undefined;
    if (!mesh?.isMesh || Array.isArray(mesh.material))
      throw new Error(`Forest debris: missing single-material mesh ${node}`);
    const box = new Box3().setFromObject(mesh);
    const center = box.getCenter(new Vector3());
    let material = materials.get(mesh.material);
    if (!material) {
      material = applyLowFog(mesh.material.clone());
      materials.set(mesh.material, material);
    }
    return {
      geometry: mesh.geometry,
      material,
      local: new Matrix4()
        .makeTranslation(-center.x, -box.min.y, -center.z)
        .multiply(mesh.matrixWorld),
      height: box.max.y - box.min.y,
      pieces: PIECES.filter(
        (piece) => piece.kind === kind && piece.variant === variant,
      ),
    };
  });
}

function DebrisInstances({ part }: { part: DebrisPart }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    part.pieces.forEach((piece, instance) => {
      // Sink a fraction of the scaled height so pieces sit in the soil.
      position.set(
        piece.x,
        piece.y - piece.burial * part.height * piece.scale,
        piece.z,
      );
      scale.setScalar(piece.scale);
      rotation.setFromAxisAngle(up, piece.yaw);
      matrix.compose(position, rotation, scale).multiply(part.local);
      mesh.setMatrixAt(instance, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part]);
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, part.pieces.length]}
      dispose={null}
    />
  );
}

function DebrisModels() {
  const gltfs = useLoader(GLTFLoader, URLS, loaderOptions);
  const owned = useMemo(() => {
    const materials = new Map<Material, Material>();
    const parts = gltfs.flatMap((gltf, i) =>
      debrisParts(gltf.scene, KINDS[i], materials),
    );
    return { materials, parts: parts.filter((part) => part.pieces.length) };
  }, [gltfs]);
  // Only the cloned materials are ours; loader geometry/textures stay cached.
  useEffect(
    () => () => {
      for (const material of owned.materials.values()) material.dispose();
    },
    [owned],
  );
  return (
    <group name="forest-floor-debris">
      {owned.parts.map((part) => (
        <DebrisInstances key={part.geometry.uuid} part={part} />
      ))}
    </group>
  );
}

/** Debris is optional scenery: a failed download must not take down the room. */
class DebrisBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ForestDebris() {
  return (
    <DebrisBoundary>
      <Suspense fallback={null}>
        <DebrisModels />
      </Suspense>
    </DebrisBoundary>
  );
}
