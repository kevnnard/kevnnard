import { useLoader } from "@react-three/fiber";
import { MeshoptDecoder } from "meshoptimizer/decoder";
import {
  memo,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  Color,
  Float32BufferAttribute,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { applyLowFog } from "@/lib/room/forest-fog.ts";
import {
  forestTrees,
  mountainHeight,
  WORLD,
} from "@/lib/room/forest-layout.ts";
import { treeFrame } from "@/lib/room/forest-model.ts";
import { ForestDebris } from "./ForestDebris";
import { GroundSurface } from "./GroundSurface";

const MODELS = ["pine-near", "pine-far", "fir-near", "fir-far"] as const;
// Invalidate useLoader/browser caches after restoring the reduced canopies.
const URLS = MODELS.map((name) => `/models/forest/${name}.glb?v=canopy-2`);
const TREES = forestTrees();
const loaderOptions = (loader: GLTFLoader) =>
  loader.setMeshoptDecoder(MeshoptDecoder);

function mountainGeometry() {
  const geometry = new PlaneGeometry(800, 800, 96, 96).rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  const colors: number[] = [];
  const low = new Color("#405746");
  const high = new Color("#87918e");
  const color = new Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height = mountainHeight(x, z);
    positions.setY(i, WORLD.groundY + height);
    const rock = Math.min(1, Math.max(0, (height - 12) / 45));
    color.copy(low).lerp(high, rock);
    color.multiplyScalar(0.94 + Math.sin(x * 0.29) * Math.cos(z * 0.23) * 0.06);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface TreePart {
  geometry: Mesh["geometry"];
  material: Material | Material[];
  local: Matrix4;
}

// Keep quantized source geometry untouched. Normalize by composing matrices,
// not by baking transforms into normalized Int16 position attributes.
function normalizedParts(root: Object3D): TreePart[] {
  const normalize = treeFrame(root);
  const parts: TreePart[] = [];
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const clone = (source: Material) => {
      const material = source.clone();
      // Geometry carries the needles; avoid sorting a whole forest as BLEND.
      material.transparent = false;
      material.opacity = 1;
      material.alphaTest = 0.4;
      material.depthWrite = true;
      // Distant trunks dissolve into the lowland fog; crowns rise above it.
      return applyLowFog(material);
    };
    parts.push({
      geometry: mesh.geometry,
      material: Array.isArray(mesh.material)
        ? mesh.material.map(clone)
        : clone(mesh.material),
      local: normalize.clone().multiply(mesh.matrixWorld),
    });
  });
  return parts;
}

function TreeInstances({
  part,
  indices,
}: {
  part: TreePart;
  indices: number[];
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    indices.forEach((index, instance) => {
      const tree = TREES[index];
      position.set(
        tree.x,
        WORLD.groundY + mountainHeight(tree.x, tree.z),
        tree.z,
      );
      scale.setScalar(tree.height);
      rotation.setFromAxisAngle(up, tree.yaw);
      matrix.compose(position, rotation, scale).multiply(part.local);
      mesh.setMatrixAt(instance, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [part, indices]);
  return (
    <instancedMesh
      ref={ref}
      args={[part.geometry, part.material, indices.length]}
      dispose={null}
    />
  );
}

function ForestModels() {
  const gltfs = useLoader(GLTFLoader, URLS, loaderOptions);
  const batches = useMemo(
    () =>
      gltfs.map((gltf, model) => ({
        parts: normalizedParts(gltf.scene),
        indices: TREES.flatMap((tree, i) =>
          `${tree.species}-${tree.lod}` === MODELS[model] ? [i] : [],
        ),
      })),
    [gltfs],
  );
  useEffect(
    () => () => {
      for (const batch of batches)
        for (const part of batch.parts) {
          for (const material of ([] as Material[]).concat(part.material))
            material.dispose();
        }
    },
    [batches],
  );
  // Loader-owned resources stay cached like the original room models. R3F
  // must not auto-dispose geometry/textures shared by instanced batches.
  return (
    <group name="textured-pine-and-fir-forest">
      {batches.flatMap((batch, model) =>
        batch.parts.map((part, index) => (
          <TreeInstances
            key={`${MODELS[model]}-${index}`}
            part={part}
            indices={batch.indices}
          />
        )),
      )}
    </group>
  );
}

export const ForestEnvironment = memo(function ForestEnvironment() {
  const mountains = useMemo(mountainGeometry, []);
  useEffect(() => () => mountains.dispose(), [mountains]);
  return (
    <group name="forest-environment">
      {/* Vertex colors are only the loading fallback; textures replace them. */}
      <GroundSurface terrain={mountains} />
      <Suspense fallback={null}>
        <ForestModels />
      </Suspense>
      <ForestDebris />
    </group>
  );
});
