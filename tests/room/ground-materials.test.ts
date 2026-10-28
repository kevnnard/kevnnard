import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import type { BufferGeometry } from "three";
import {
  BoxGeometry,
  Matrix4,
  NoColorSpace,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Triangle,
  Vector3,
} from "three";
import {
  mountainHeight,
  TERRAIN_AXIS,
  terrainHeight,
  WORLD,
} from "../../src/lib/room/forest-layout.ts";
import {
  GROUND_SIZE,
  groundBlend,
  groundMaterial,
  groundShade,
  lawnMaterial,
  terrainGeometry,
  terrainLayers,
  worldUv,
} from "../../src/lib/room/ground-materials.ts";
import { PLOT } from "../../src/lib/room/house-layout.ts";

const plotMatrix = () =>
  new Matrix4().compose(
    new Vector3(...PLOT.min.map((min, i) => (min + PLOT.max[i]) / 2)),
    new Quaternion(),
    new Vector3(...PLOT.min.map((min, i) => PLOT.max[i] - min)),
  );

// Interpolates a vertex attribute channel at a world (x, z) point, as the
// rasterizer would, over the triangles in [start, start + count).
function sampleAt(
  geometry: BufferGeometry,
  read: (index: number) => number,
  x: number,
  z: number,
  matrix = new Matrix4(),
  start = 0,
  count = geometry.getIndex()?.count ?? 0,
) {
  const index = geometry.getIndex();
  const position = geometry.getAttribute("position");
  assert.ok(index);
  const corner = (i: number) => {
    const vertex = index.getX(i);
    const point = new Vector3().fromBufferAttribute(position, vertex);
    point.applyMatrix4(matrix).setY(0);
    return { point, vertex };
  };
  const target = new Vector3(x, 0, z);
  for (let i = start; i < start + count; i += 3) {
    const [a, b, c] = [corner(i), corner(i + 1), corner(i + 2)];
    const triangle = new Triangle(a.point, b.point, c.point);
    if (triangle.getArea() === 0 || !triangle.containsPoint(target)) continue;
    const w = triangle.getBarycoord(target, new Vector3());
    assert.ok(w);
    return w.x * read(a.vertex) + w.y * read(b.vertex) + w.z * read(c.vertex);
  }
  throw new Error(`No triangle covers ${x}, ${z}`);
}

const manifest = JSON.parse(
  readFileSync(
    new URL("../../public/textures/ground/manifest.json", import.meta.url),
    "utf8",
  ),
);

it("tiles each layer at its captured real-world size, not one shared repeat", () => {
  // The manifest keeps Poly Haven's float32 metadata (2.509999990463257).
  for (const material of manifest.materials)
    assert.ok(
      Math.abs(
        GROUND_SIZE[material.layer as keyof typeof GROUND_SIZE] -
          material.realWorldSizeMeters,
      ) < 1e-6,
    );
  const maps = {
    color: new Texture(),
    normal: new Texture(),
    roughness: new Texture(),
  };
  for (const layer of ["grass", "forest", "rock"] as const) {
    const { material } = groundMaterial(layer, maps, { anisotropy: 4 });
    for (const map of [
      material.map,
      material.normalMap,
      material.roughnessMap,
    ]) {
      assert.ok(map);
      assert.equal(map.repeat.x, 1 / GROUND_SIZE[layer]);
      assert.equal(map.repeat.y, 1 / GROUND_SIZE[layer]);
      assert.equal(map.wrapS, RepeatWrapping);
      assert.equal(map.wrapT, RepeatWrapping);
    }
  }
});

it("maps the lawn and the terrain with the same world-meter UVs without touching shared geometry", () => {
  const box = new BoxGeometry();
  const before = Array.from(box.getAttribute("position").array);
  const uvBefore = Array.from(box.getAttribute("uv").array);
  const normalBefore = Array.from(box.getAttribute("normal").array);
  const groupsBefore = structuredClone(box.groups);
  const matrix = plotMatrix();
  const lawn = worldUv(box, matrix);
  assert.notEqual(lawn, box);
  assert.deepEqual(Array.from(box.getAttribute("position").array), before);
  assert.deepEqual(Array.from(box.getAttribute("uv").array), uvBefore);
  assert.deepEqual(Array.from(box.getAttribute("normal").array), normalBefore);
  assert.deepEqual(box.groups, groupsBefore);
  assert.equal(box.getAttribute("color"), undefined);
  assert.deepEqual(Array.from(lawn.getAttribute("position").array), before);
  assert.deepEqual(Array.from(lawn.getAttribute("normal").array), normalBefore);
  assert.deepEqual(lawn.groups, groupsBefore);
  const position = lawn.getAttribute("position");
  const uv = lawn.getAttribute("uv");
  const world = new Vector3();
  for (let i = 0; i < position.count; i++) {
    world.fromBufferAttribute(position, i).applyMatrix4(matrix);
    assert.ok(Math.abs(uv.getX(i) - world.x) < 1e-5);
    assert.ok(Math.abs(uv.getY(i) + world.z) < 1e-5);
  }
  // Terrain vertices already sit in world space: same mapping, same phase.
  const plane = new PlaneGeometry(10, 10, 2, 2).rotateX(-Math.PI / 2);
  const flat = worldUv(plane);
  const p = flat.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    assert.ok(Math.abs(flat.getAttribute("uv").getX(i) - p.getX(i)) < 1e-6);
    assert.ok(Math.abs(flat.getAttribute("uv").getY(i) + p.getZ(i)) < 1e-6);
  }
});

it("shades the lawn and the surrounding terrain grass identically at shared world points", () => {
  const lawn = worldUv(new BoxGeometry(), plotMatrix());
  const color = lawn.getAttribute("color");
  assert.ok(color, "lawn carries the world macro shade");
  const position = lawn.getAttribute("position");
  const world = new Vector3();
  for (let i = 0; i < position.count; i++) {
    world.fromBufferAttribute(position, i).applyMatrix4(plotMatrix());
    assert.equal(color.getX(i), color.getY(i));
    assert.equal(color.getY(i), color.getZ(i));
    assert.ok(Math.abs(color.getX(i) - groundShade(world.x, world.z)) < 1e-6);
  }
  // A coarser grid than the rendered one (flat in the clearing): the finer
  // rendered grid interpolates the shade more closely still.
  const source = new PlaneGeometry(800, 800, 96, 96).rotateX(-Math.PI / 2);
  const grass = terrainLayers(source).grass;
  const shade = grass.getAttribute("color");
  const top = new BoxGeometry().groups[2];
  let worst = 0;
  const [x0, , z0] = PLOT.min;
  const [x1, , z1] = PLOT.max;
  const e = 1e-3;
  for (let t = 0; t <= 1; t += 0.02) {
    const x = x0 + e + t * (x1 - x0 - 2 * e);
    const z = z0 + e + t * (z1 - z0 - 2 * e);
    for (const [px, pz] of [
      [x, z0 + e],
      [x, z1 - e],
      [x0 + e, z],
      [x1 - e, z],
    ]) {
      const yard = sampleAt(
        lawn,
        (v) => color.getX(v),
        px,
        pz,
        plotMatrix(),
        top.start,
        top.count,
      );
      const outside = sampleAt(grass, (v) => shade.getX(v), px, pz);
      worst = Math.max(worst, Math.abs(yard - outside));
    }
  }
  // Below one 8-bit step: no brightness seam along the plot edge.
  assert.ok(worst < 1 / 255, `edge shade differs by ${worst}`);
});

it("blends lawn to forest soil to rock smoothly with macro variation", () => {
  // Clearing around the house is lawn, never rock.
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const near = groundBlend(Math.cos(angle) * 12, Math.sin(angle) * 12, 0);
    assert.equal(near.grass, 1);
    assert.equal(near.rock, 0);
    const forest = groundBlend(Math.cos(angle) * 90, Math.sin(angle) * 90, 0);
    assert.equal(forest.grass, 0);
    assert.equal(forest.rock, 0);
  }
  assert.equal(groundBlend(250, 0, 55).rock, 1);
  // No hard edges: neighbouring metres change by small steps.
  for (let x = 0; x < 120; x += 1) {
    const a = groundBlend(x, 7, x > 60 ? 30 : 0);
    const b = groundBlend(x + 1, 7, x > 60 ? 30 : 0);
    assert.ok(Math.abs(a.grass - b.grass) < 0.1);
    if (x !== 60) assert.ok(Math.abs(a.rock - b.rock) < 0.1);
  }
  // The lawn edge wanders instead of forming a perfect circle.
  const edge = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    return groundBlend(Math.cos(angle) * 33, Math.sin(angle) * 33, 0).grass;
  });
  assert.ok(Math.max(...edge) - Math.min(...edge) > 0.3);
});

it("builds terrain layers that own copies of the topology and carry neutral variation with layer alphas", () => {
  const source = new PlaneGeometry(800, 800, 24, 24).rotateX(-Math.PI / 2);
  const positions = source.getAttribute("position");
  for (let i = 0; i < positions.count; i++)
    positions.setY(
      i,
      WORLD.groundY + mountainHeight(positions.getX(i), positions.getZ(i)),
    );
  source.computeVertexNormals();
  const before = Array.from(positions.array);
  const normalsBefore = Array.from(source.getAttribute("normal").array);
  const indexBefore = Array.from(source.getIndex()?.array ?? []);
  const layers = terrainLayers(source);
  assert.deepEqual(Object.keys(layers), ["forest", "grass", "rock"]);
  assert.deepEqual(Array.from(positions.array), before);
  // Each layer owns its buffers, so disposing one never frees the parent's
  // terrain or a sibling layer. Topology and coordinates stay identical.
  const owners: ArrayLike<number>[] = [
    positions.array,
    source.getAttribute("normal").array,
    source.getIndex()?.array ?? [],
  ];
  for (const geometry of Object.values(layers)) {
    const index = geometry.getIndex();
    assert.ok(index);
    assert.deepEqual(Array.from(index.array), indexBefore);
    assert.deepEqual(
      Array.from(geometry.getAttribute("position").array),
      before,
    );
    assert.deepEqual(
      Array.from(geometry.getAttribute("normal").array),
      normalsBefore,
    );
    for (const name of ["position", "normal", "uv", "color"])
      owners.push(geometry.getAttribute(name).array);
    owners.push(index.array);
    assert.equal(geometry.getAttribute("color").itemSize, 4);
  }
  assert.equal(new Set(owners).size, owners.length, "no shared buffers");
  const freed: string[] = [];
  source.addEventListener("dispose", () => freed.push("source"));
  for (const geometry of Object.values(layers)) geometry.dispose();
  assert.deepEqual(freed, []);
  assert.deepEqual(Array.from(positions.array), before);
  assert.deepEqual(
    Array.from(source.getAttribute("normal").array),
    normalsBefore,
  );
  assert.deepEqual(Array.from(source.getIndex()?.array ?? []), indexBefore);
  const alphas = { forest: [] as number[], grass: [], rock: [] } as Record<
    string,
    number[]
  >;
  for (const [layer, geometry] of Object.entries(layers)) {
    const color = geometry.getAttribute("color");
    for (let i = 0; i < color.count; i++) {
      // Neutral brightness only: the photo color is never re-tinted green.
      assert.equal(color.getX(i), color.getY(i));
      assert.equal(color.getY(i), color.getZ(i));
      assert.ok(color.getX(i) >= 0.8 && color.getX(i) <= 1);
      alphas[layer].push(color.getW(i));
    }
  }
  assert.ok(alphas.forest.every((alpha) => alpha === 1));
  const normals = source.getAttribute("normal");
  for (let i = 0; i < positions.count; i++) {
    const height = positions.getY(i) - WORLD.groundY;
    const blend = groundBlend(
      positions.getX(i),
      positions.getZ(i),
      height,
      1 - normals.getY(i),
    );
    assert.ok(Math.abs(alphas.grass[i] - blend.grass) < 1e-6);
    assert.ok(Math.abs(alphas.rock[i] - blend.rock) < 1e-6);
  }
  assert.ok(alphas.rock.some((alpha) => alpha === 1));
  assert.ok(alphas.grass.some((alpha) => alpha === 1));
});

it("renders the near hills on a fine grid that scenery placement reads exactly", () => {
  const terrain = terrainGeometry();
  const position = terrain.getAttribute("position");
  const index = terrain.getIndex();
  assert.ok(index);
  // Cells stay under 2 units out to the near crests.
  for (let i = 1; i < TERRAIN_AXIS.length; i++)
    if (Math.abs(TERRAIN_AXIS[i]) <= 60)
      assert.ok(TERRAIN_AXIS[i] - TERRAIN_AXIS[i - 1] < 2);
  // Inside real rendered triangles (centroids, not just vertices), the
  // placement height equals the mesh surface.
  let checked = 0;
  for (let i = 0; i < index.count; i += 3 * 29) {
    const [a, b, c] = [0, 1, 2].map((k) =>
      new Vector3().fromBufferAttribute(position, index.getX(i + k)),
    );
    const center = a.add(b).add(c).divideScalar(3);
    if (Math.hypot(center.x, center.z) > 120) continue;
    checked++;
    const placed = WORLD.groundY + terrainHeight(center.x, center.z);
    assert.ok(Math.abs(placed - center.y) < 1e-3, `${center.toArray()}`);
  }
  assert.ok(checked > 1000);
  // Points anywhere on the foothills, interpolated like the rasterizer, and
  // the mesh follows the analytic relief closely.
  for (let i = 0; i < 12; i++) {
    const angle = i * 2.39;
    const r = 24 + i * 2.1;
    const x = Math.cos(angle) * r + 0.37;
    const z = Math.sin(angle) * r - 0.21;
    const mesh = sampleAt(terrain, (v) => position.getY(v), x, z);
    assert.ok(Math.abs(mesh - WORLD.groundY - terrainHeight(x, z)) < 1e-3);
    assert.ok(Math.abs(terrainHeight(x, z) - mountainHeight(x, z)) < 0.6);
  }
  terrain.dispose();
});

it("binds sRGB color with linear OpenGL normal and roughness data on owned clones", () => {
  const maps = {
    color: new Texture(),
    normal: new Texture(),
    roughness: new Texture(),
  };
  const disposed: string[] = [];
  for (const [kind, texture] of Object.entries(maps))
    texture.addEventListener("dispose", () => disposed.push(kind));
  const terrain = groundMaterial("grass", maps, {
    anisotropy: 8,
    vertexColors: true,
    overlay: true,
  });
  const { material } = terrain;
  assert.equal(material.map?.colorSpace, SRGBColorSpace);
  assert.equal(material.normalMap?.colorSpace, NoColorSpace);
  assert.equal(material.roughnessMap?.colorSpace, NoColorSpace);
  // OpenGL (+Y) normals match three's default tangent convention.
  assert.deepEqual(material.normalScale.toArray(), [1, 1]);
  assert.equal(material.roughness, 1);
  assert.equal(material.metalness, 0);
  assert.equal(material.vertexColors, true);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.map?.anisotropy, 8);
  for (const [kind, source] of Object.entries(maps)) {
    assert.equal(source.repeat.x, 1, `${kind} source stays untouched`);
    assert.equal(source.colorSpace, "");
  }
  assert.notEqual(material.map, maps.color);
  // Overlays blend over the soil; the lawn is opaque but shaded like them.
  assert.equal(terrain.material.polygonOffset, true);
  const lawn = lawnMaterial(maps, 2);
  assert.equal(lawn.material.vertexColors, true);
  assert.equal(lawn.material.transparent, false);
  assert.equal(lawn.material.depthWrite, true);
  assert.equal(lawn.material.polygonOffset, false);
  assert.equal(lawn.material.map?.repeat.x, material.map?.repeat.x);
  let materialDisposed = false;
  material.addEventListener("dispose", () => {
    materialDisposed = true;
  });
  const clones: string[] = [];
  for (const map of [material.map, material.normalMap, material.roughnessMap])
    map?.addEventListener("dispose", () => clones.push("clone"));
  terrain.dispose();
  assert.ok(materialDisposed);
  assert.equal(clones.length, 3);
  assert.deepEqual(disposed, [], "cached loader textures are never disposed");
});
