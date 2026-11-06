import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  type Group,
  type Material,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import {
  bySurface,
  materialFor,
  type SurfaceMaps,
} from "@/components/world/surfaces";
import { cutaway, DITHER_GLSL, shadowShell } from "@/lib/world/cutaway.ts";
import { GARAGE_DOOR } from "@/lib/world/garage.ts";
import { easeToward, GARAGE_DOOR_MOTION } from "@/lib/world/garage-lights.ts";
import {
  garageDoorCurtain,
  HOUSE,
  HOUSE_COLORS,
  HOUSE_FOCUS,
  HOUSE_GROUPS,
  type HouseGroup,
  houseMeshes,
  type Part,
} from "@/lib/world/house.ts";
import { roundedBox } from "@/lib/world/rounded.ts";
import { boxUv } from "@/lib/world/textures.ts";

/** Object names, one per cutaway group. */
export const HOUSE_NAMES = Object.fromEntries(
  HOUSE_GROUPS.map((group) => [group, `house-${group}`]),
) as Record<HouseGroup, string>;

/** Fully faded groups are hidden; the shadow shell keeps casting. */
const HIDDEN = 0.995;
/** Fade easing rate per second; the camera is already smoothed. */
const EASE = 12;

/**
 * Screen-door transparency: an 8x8 ordered dither discards a `uFade` share of
 * the pixels. Stays opaque (no sorting) and keeps the vertex colors; runs
 * after the source's own patch (the textured surfaces).
 */
function cutawayMaterial(
  source: MeshStandardMaterial,
  fade: { value: number },
): MeshStandardMaterial {
  const material = source.clone();
  material.onBeforeCompile = (shader, renderer) => {
    source.onBeforeCompile(shader, renderer);
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `uniform float uFade;
        ${DITHER_GLSL}
        void main() {`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (cutawayBayer8(gl_FragCoord.xy) < uFade) discard;`,
      );
  };
  material.customProgramCacheKey = () =>
    `house-cutaway-${source.transparent ? "glass" : "wood"}-${source.userData.surface ?? "flat"}`;
  return material;
}

const scratch = {
  matrix: new Matrix4(),
  normals: new Matrix3(),
  rotation: new Quaternion(),
  euler: new Euler(),
  center: new Vector3(),
  scale: new Vector3(),
  vertex: new Vector3(),
  color: new Color(),
};

/** A convex counter-clockwise outline extruded from z -0.5 to 0.5. */
function prismGeometry(profile: [number, number][]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const n = profile.length;
  for (const z of [0.5, -0.5]) {
    const base = positions.length / 3;
    for (const [x, y] of profile) {
      positions.push(x, y, z);
      normals.push(0, 0, Math.sign(z));
    }
    for (let i = 1; i < n - 1; i++)
      if (z > 0) indices.push(base, base + i, base + i + 1);
      else indices.push(base, base + i + 1, base + i);
  }
  for (let i = 0; i < n; i++) {
    const [ax, ay] = profile[i];
    const [bx, by] = profile[(i + 1) % n];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const [nx, ny] = [(by - ay) / length, -(bx - ax) / length];
    const base = positions.length / 3;
    positions.push(ax, ay, 0.5, bx, by, 0.5, bx, by, -0.5, ax, ay, -0.5);
    for (let k = 0; k < 4; k++) normals.push(nx, ny, 0);
    indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
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
  geometry.setIndex(indices);
  return geometry;
}

/** A "rounded" part at its own size: scaling would squash the radius. */
function roundedGeometry(part: Part): BufferGeometry {
  const box = roundedBox(part.size, part.radius ?? 0, part.segments);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(box.position), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(box.normal), 3),
  );
  geometry.setIndex(box.index);
  return geometry;
}

export interface MergeOptions {
  /** Cylinder sides ("round" parts); 10 by default. */
  roundSegments?: number;
  /** Baked occlusion per vertex from world position and normal (T4h). */
  occlusion?: (
    position: readonly [number, number, number],
    normal: readonly [number, number, number],
  ) => number;
}

/**
 * Merges the parts into one vertex-colored geometry: one draw per mesh. UVs
 * are box-projected world metres, so textures line up across parts.
 */
export function mergeParts(
  parts: Part[],
  { roundSegments = 10, occlusion }: MergeOptions = {},
): BufferGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const round = new CylinderGeometry(0.5, 0.5, 1, roundSegments);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const part of parts) {
    const owned = part.shape === "prism" || part.shape === "rounded";
    const source =
      part.shape === "prism"
        ? prismGeometry(part.profile ?? [])
        : part.shape === "rounded"
          ? roundedGeometry(part)
          : part.shape === "box"
            ? box
            : round;
    const { matrix, normals: normalMatrix, vertex, color } = scratch;
    scratch.rotation.setFromEuler(
      scratch.euler.set(...(part.rotation ?? [0, 0, 0])),
    );
    matrix.compose(
      scratch.center.set(...part.center),
      scratch.rotation,
      part.shape === "rounded"
        ? scratch.scale.set(1, 1, 1)
        : scratch.scale.set(...part.size),
    );
    normalMatrix.getNormalMatrix(matrix);
    color.set(part.color).multiplyScalar(part.shade);
    const base = positions.length / 3;
    const position = source.getAttribute("position");
    const normal = source.getAttribute("normal");
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      const world: [number, number, number] = [vertex.x, vertex.y, vertex.z];
      positions.push(...world);
      vertex.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix);
      vertex.normalize();
      const facing: [number, number, number] = [vertex.x, vertex.y, vertex.z];
      normals.push(...facing);
      const ao = occlusion ? occlusion(world, facing) : 1;
      colors.push(color.r * ao, color.g * ao, color.b * ao);
      uvs.push(...boxUv(world, facing));
    }
    const index = source.getIndex();
    if (index)
      for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    if (owned) source.dispose();
  }
  box.dispose();
  round.dispose();
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
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** No group dissolved beyond the camera's own cutaway. */
export const NO_REVEAL: readonly HouseGroup[] = [];

interface FadeGroup {
  object: Object3D;
  fade: { value: number };
}

/**
 * Original procedural wooden house and garage on the island pad. Walls,
 * floor and roof cast and receive shadows; the glass does not, so the sun
 * by day and the moon by night draw window patches on the empty floor.
 * Zooming in dissolves the roofs and camera-facing walls (T4c); their shadow
 * stays, cast by an invisible shell, so light still enters only through the
 * window and door openings (S21). With `maps`
 * the planks, floor and roofs are textured (T4e); without, they stay flat.
 * `reveal` dissolves its groups whatever the camera, easing like the rest:
 * the dream truck's close-up opens the garage (dream-truck T1). `door`
 * rolls the garage's roller door down (1) or up (0) over about 1.5 s, at
 * once with reduced motion (dream-truck T2); it hangs in the garage front's
 * group, so it fades with the front wall and its reveal.
 */
export default function House({
  reducedMotion,
  maps,
  reveal = NO_REVEAL,
  door = 0,
}: {
  reducedMotion: boolean;
  maps?: SurfaceMaps;
  reveal?: readonly HouseGroup[];
  door?: number;
}) {
  const { group, materials, fades, curtain } = useMemo(() => {
    const wood = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      // Closed boxes cast from their back faces: no acne on lit faces.
      shadowSide: BackSide,
    });
    const glass = new MeshStandardMaterial({
      color: HOUSE_COLORS.glass,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const owned: MeshStandardMaterial[] = [wood, glass];
    const surfaces = new Map<string, MeshStandardMaterial>();
    const fading = new Map<HouseGroup, FadeGroup>();
    const meshes = houseMeshes();
    /** Opaque solids of the fading groups; the panes are never added. */
    const solids: Mesh[] = [];
    const house = new Object3D() as Group;
    house.name = "house";
    for (const name of HOUSE_GROUPS) {
      const part = new Object3D();
      part.name = HOUSE_NAMES[name];
      const fade = { value: 0 };
      const faded = (material: MeshStandardMaterial) => {
        if (name === "base") return material;
        const copy = cutawayMaterial(material, fade);
        owned.push(copy);
        return copy;
      };
      const glassMaterial = faded(glass);
      if (name !== "base") fading.set(name, { object: part, fade });
      for (const [surface, parts] of bySurface(meshes[name].wood)) {
        const material = materialFor(surface, wood, maps, surfaces, owned);
        const solid = new Mesh(mergeParts(parts), faded(material));
        solid.name = `${part.name}-${surface}`;
        // Fading solids never cast: the shell does, so no dotted shadows
        // and no duplicate casters.
        solid.castShadow = name === "base";
        solid.receiveShadow = true;
        if (name !== "base") solids.push(solid);
        part.add(solid);
      }
      if (meshes[name].glass.length > 0) {
        const panes = new Mesh(mergeParts(meshes[name].glass), glassMaterial);
        panes.castShadow = false;
        panes.receiveShadow = false;
        panes.renderOrder = 1;
        part.add(panes);
      }
      house.add(part);
    }
    // A sibling of the fading groups: hiding them never hides the shell.
    const { shell, materials: blockers } = shadowShell(solids);
    house.add(shell);
    // The roller door, hung from the opening's head: scaled down from there
    // it rolls up into the drum. Rolled up, it hides.
    const head = HOUSE.floorY + GARAGE_DOOR.v1;
    const front = fading.get("garage-front");
    const curtainGeometry = mergeParts(garageDoorCurtain());
    curtainGeometry.translate(0, -head, 0);
    const curtainMaterial = cutawayMaterial(wood, front?.fade ?? { value: 0 });
    owned.push(curtainMaterial);
    const curtain = new Mesh(curtainGeometry, curtainMaterial);
    curtain.name = `${HOUSE_NAMES["garage-front"]}-door`;
    curtain.position.y = head;
    curtain.receiveShadow = true;
    curtain.visible = false;
    front?.object.add(curtain);
    const materials: Material[] = [...owned, ...blockers];
    return { group: house, materials, fades: fading, curtain };
  }, [maps]);

  const wake = useThree((state) => state.invalidate);
  // A new reveal or door target wakes the demand frameloop, the camera at
  // rest.
  useEffect(() => wake(), [reveal, door, wake]);
  const closed = useRef(door);

  const position = useRef<[number, number, number]>([0, 0, 0]);
  useFrame(({ camera, invalidate }, delta) => {
    const { x, y, z } = camera.position;
    position.current[0] = x;
    position.current[1] = y;
    position.current[2] = z;
    const targets = cutaway(position.current, HOUSE_FOCUS, reveal);
    const step = reducedMotion ? 1 : 1 - Math.exp(-EASE * delta);
    let moving = false;
    for (const [name, group] of fades) {
      const { object, fade } = group;
      const target = targets[name];
      const next = fade.value + (target - fade.value) * step;
      fade.value = Math.abs(target - next) < 1e-3 ? target : next;
      if (fade.value !== target) moving = true;
      object.visible = fade.value < HIDDEN;
    }
    closed.current = easeToward(
      closed.current,
      door,
      delta,
      GARAGE_DOOR_MOTION.duration,
      reducedMotion,
    );
    if (closed.current !== door) moving = true;
    // Eased in and out along the steady motion.
    const c = closed.current;
    curtain.scale.y = Math.max(c * c * (3 - 2 * c), 1e-3);
    curtain.visible = c > 0;
    // Demand frameloop: keep rendering only while a fade is still easing.
    if (moving) invalidate();
  });

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
      // The shell shares the solids' geometry: dispose each one once.
      const geometries = new Set<BufferGeometry>();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) geometries.add(mesh.geometry);
      });
      for (const geometry of geometries) geometry.dispose();
    },
    [group, materials],
  );

  return <primitive object={group} />;
}
