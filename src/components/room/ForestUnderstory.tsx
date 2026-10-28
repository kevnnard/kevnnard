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
  DoubleSide,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyLowFog } from "@/lib/room/forest-fog.ts";
import {
  FERN_MODELS,
  FERN_URL,
  type Fern,
  forestFerns,
} from "@/lib/room/forest-understory.ts";

const SOURCE = `${FERN_URL}?v=understory-1`;
const FERNS = forestFerns();
const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

interface FernPart {
  geometry: Mesh["geometry"];
  material: Material;
  /** Model frame: centered in XZ, lowest point at y = 0, quantization kept. */
  local: Matrix4;
  height: number;
  ferns: Fern[];
}

// Compose matrices instead of baking into the quantized source vertices.
// Each clump of the set is its own part, instanced on its own.
function fernParts(root: Object3D, material: Material): FernPart[] {
  root.updateMatrixWorld(true);
  return FERN_MODELS.map(({ node }, variant) => {
    const mesh = root.getObjectByName(node) as Mesh | undefined;
    if (!mesh?.isMesh || Array.isArray(mesh.material))
      throw new Error(
        `Forest understory: missing single-material mesh ${node}`,
      );
    const box = new Box3().setFromObject(mesh);
    const center = box.getCenter(new Vector3());
    return {
      geometry: mesh.geometry,
      material,
      local: new Matrix4()
        .makeTranslation(-center.x, -box.min.y, -center.z)
        .multiply(mesh.matrixWorld),
      height: box.max.y - box.min.y,
      ferns: FERNS.filter((fern) => fern.variant === variant),
    };
  });
}

/**
 * The fronds are cut out by the base color alpha. Keep the source's alpha
 * test and double sides; refuse to draw them as opaque cards.
 */
function leafMaterial(root: Object3D) {
  const mesh = root.getObjectByName(FERN_MODELS[0].node) as Mesh | undefined;
  const source = mesh?.material as MeshStandardMaterial | undefined;
  if (
    !source?.map ||
    !(source.alphaTest > 0) ||
    source.transparent ||
    source.side !== DoubleSide
  )
    throw new Error("Forest understory: fern material lost its leaf cutout");
  return applyLowFog(source.clone());
}

function FernInstances({ part }: { part: FernPart }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const lean = new Quaternion();
    const yaw = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const normal = new Vector3();
    part.ferns.forEach((fern, instance) => {
      // Sink the crown base slightly so the fronds grow out of the soil.
      position.set(
        fern.x,
        fern.y - fern.burial * part.height * fern.scale,
        fern.z,
      );
      scale.setScalar(fern.scale);
      // Base plane y = tilt · (dx, dz): its normal is (-tx, 1, -tz).
      normal.set(-fern.tilt[0], 1, -fern.tilt[1]).normalize();
      lean.setFromUnitVectors(up, normal);
      yaw.setFromAxisAngle(up, fern.yaw);
      matrix.compose(position, lean.multiply(yaw), scale).multiply(part.local);
      mesh.setMatrixAt(instance, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part]);
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, part.ferns.length]}
      dispose={null}
    />
  );
}

function FernModels() {
  const gltf = useLoader(GLTFLoader, SOURCE, loaderOptions);
  const owned = useMemo(() => {
    const material = leafMaterial(gltf.scene);
    const parts = fernParts(gltf.scene, material);
    return { material, parts: parts.filter((part) => part.ferns.length) };
  }, [gltf]);
  // Only the cloned material is ours; loader geometry/textures stay cached.
  useEffect(() => () => owned.material.dispose(), [owned]);
  return (
    <group name="forest-floor-ferns">
      {owned.parts.map((part) => (
        <FernInstances key={part.geometry.uuid} part={part} />
      ))}
    </group>
  );
}

/** Ferns are optional scenery: a failed load must not take down the room. */
class UnderstoryBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    // An empty, named marker keeps the failure inspectable in the scene graph.
    return this.state.failed ? (
      <group name="forest-floor-ferns-unavailable" />
    ) : (
      this.props.children
    );
  }
}

export function ForestUnderstory() {
  return (
    <UnderstoryBoundary>
      <Suspense fallback={null}>
        <FernModels />
      </Suspense>
    </UnderstoryBoundary>
  );
}
