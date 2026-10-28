import { useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import {
  type BufferGeometry,
  type Material,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  type Texture,
  TextureLoader,
  Vector3,
} from "three";
import { applyLowFog } from "@/lib/room/forest-fog.ts";
import { WORLD } from "@/lib/room/forest-layout.ts";
import {
  type GroundLayer,
  groundMaterial,
  groundUrls,
  lawnMaterial,
  terrainLayers,
  worldUv,
} from "@/lib/room/ground-materials.ts";
import type { Box } from "@/lib/room/house-layout.ts";

const LAYERS: readonly GroundLayer[] = ["grass", "forest", "rock"];
const URLS = LAYERS.flatMap(groundUrls);

const pick = (textures: Texture[], layer: GroundLayer) => {
  const [color, normal, roughness] = textures.slice(LAYERS.indexOf(layer) * 3);
  return { color, normal, roughness };
};

// Loader textures stay cached and shared; each surface owns clones of them.
function useGroundMaps() {
  const textures = useLoader(TextureLoader, URLS);
  const anisotropy = useThree((state) =>
    Math.min(8, state.gl.capabilities.getMaxAnisotropy()),
  );
  const invalidate = useThree((state) => state.invalidate);
  return { textures, anisotropy, invalidate };
}

function TexturedTerrain({ terrain }: { terrain: BufferGeometry }) {
  const { textures, anisotropy, invalidate } = useGroundMaps();
  const ground = useMemo(() => {
    const flat = new PlaneGeometry(WORLD.size, WORLD.size)
      .rotateX(-Math.PI / 2)
      .translate(0, WORLD.groundY - 0.01, 0);
    const outer = worldUv(flat);
    flat.dispose();
    const options = { anisotropy, vertexColors: true };
    const owned = {
      outer,
      layers: terrainLayers(terrain),
      outerSoil: groundMaterial("forest", pick(textures, "forest"), {
        anisotropy,
      }),
      soil: groundMaterial("forest", pick(textures, "forest"), options),
      grass: groundMaterial("grass", pick(textures, "grass"), {
        ...options,
        overlay: true,
      }),
      rock: groundMaterial("rock", pick(textures, "rock"), {
        ...options,
        overlay: true,
      }),
    };
    // Terrain only: every layer gets the same lowland fog so overlays blend
    // consistently. The house lawn (LawnSurface) is never fogged.
    for (const layer of [owned.outerSoil, owned.soil, owned.grass, owned.rock])
      applyLowFog(layer.material);
    return owned;
  }, [terrain, textures, anisotropy]);
  useEffect(() => {
    // Demand rendering: draw once the loaded textures replace the fallback.
    invalidate();
    return () => {
      ground.outer.dispose();
      for (const geometry of Object.values(ground.layers)) geometry.dispose();
      for (const owned of [
        ground.outerSoil,
        ground.soil,
        ground.grass,
        ground.rock,
      ])
        owned.dispose();
    };
  }, [ground, invalidate]);
  return (
    <group name="textured-ground">
      <mesh
        geometry={ground.outer}
        material={ground.outerSoil.material}
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={ground.layers.forest}
        material={ground.soil.material}
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={ground.layers.grass}
        material={ground.grass.material}
        renderOrder={1}
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={ground.layers.rock}
        material={ground.rock.material}
        renderOrder={2}
        receiveShadow
        dispose={null}
      />
    </group>
  );
}

/** Lawn, forest soil and rock over the mountain terrain; flat colors while loading. */
export function GroundSurface({ terrain }: { terrain: BufferGeometry }) {
  const fallback = (
    <>
      <mesh
        position={[0, WORLD.groundY - 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[WORLD.size, WORLD.size]} />
        <meshStandardMaterial color="#526e42" roughness={1} />
      </mesh>
      {/* R3F disposes only JSX instances: the inline material, never the
          parent-owned terrain passed as a prop. */}
      <mesh geometry={terrain} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
    </>
  );
  return (
    <Suspense fallback={fallback}>
      <TexturedTerrain terrain={terrain} />
    </Suspense>
  );
}

interface LawnProps {
  /** Shared unit cube; cloned, never modified. */
  box: BufferGeometry;
  plot: Box;
  soil: Material;
  fallback: Material;
}

type Tuple = [number, number, number];
const centerOf = ({ min, max }: Box) =>
  min.map((value, i) => (value + max[i]) / 2) as Tuple;
const sizeOf = ({ min, max }: Box) =>
  min.map((value, i) => max[i] - value) as Tuple;
const transformOf = (plot: Box) =>
  new Matrix4().compose(
    new Vector3(...centerOf(plot)),
    new Quaternion(),
    new Vector3(...sizeOf(plot)),
  );

function TexturedLawn({ box, plot, soil }: Omit<LawnProps, "fallback">) {
  const { textures, anisotropy, invalidate } = useGroundMaps();
  const lawn = useMemo(
    () => ({
      // World UVs and shade match the terrain grass: same scale, phase, tone.
      geometry: worldUv(box, transformOf(plot)),
      grass: lawnMaterial(pick(textures, "grass"), anisotropy),
    }),
    [box, plot, textures, anisotropy],
  );
  useEffect(() => {
    invalidate();
    return () => {
      lawn.geometry.dispose();
      lawn.grass.dispose();
    };
  }, [lawn, invalidate]);
  return (
    <PlotMesh
      geometry={lawn.geometry}
      plot={plot}
      top={lawn.grass.material}
      soil={soil}
    />
  );
}

function PlotMesh({
  geometry,
  plot,
  top,
  soil,
}: {
  geometry: BufferGeometry;
  plot: Box;
  top: Material;
  soil: Material;
}) {
  // Box faces: +x, -x, +y, -y, +z, -z. Only the top is grass.
  return (
    <mesh
      name="plot"
      geometry={geometry}
      material={[soil, soil, top, soil, soil, soil]}
      position={centerOf(plot)}
      scale={sizeOf(plot)}
      receiveShadow
      dispose={null}
    />
  );
}

/** Textured lawn on the plot's top face; the flat grass material while loading. */
export function LawnSurface({ box, plot, soil, fallback }: LawnProps) {
  return (
    <Suspense
      fallback={
        <PlotMesh geometry={box} plot={plot} top={fallback} soil={soil} />
      }
    >
      <TexturedLawn box={box} plot={plot} soil={soil} />
    </Suspense>
  );
}
