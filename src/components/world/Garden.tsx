import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SpotLight,
  SRGBColorSpace,
  type Texture,
} from "three";
import { mergeParts } from "@/components/world/House";
import { setupMaterial } from "@/components/world/Setup";
import type { SurfaceMaps } from "@/components/world/surfaces";
import { cutaway } from "@/lib/world/cutaway.ts";
import {
  fitSignText,
  GARDEN_COLORS,
  GARDEN_MATERIALS,
  GARDEN_PROPS,
  GARDEN_ROUND_SEGMENTS,
  GARDEN_SIGN,
  type GardenMaterialId,
  type GardenPart,
  type GardenProp,
  LANTERN,
  LANTERN_FIXTURES,
  LANTERN_IDS,
  LANTERN_MOUNTS,
  type LanternWall,
  lanternGlass,
  lanternLevel,
  lanternParts,
  mailboxParts,
  PATH_STONES,
  pathMesh,
  SIGN_PANEL,
  SIGN_TEXT_BOX,
  STONE,
  signParts,
} from "@/lib/world/garden.ts";
import { boxUv } from "@/lib/world/textures.ts";

type Owned = { materials: Material[]; textures: Texture[] };

/** A lantern's wall fades from here on: the lantern hides with it. */
const LANTERN_HIDE = 0.5;
const SIGN_FONT = (size: number) =>
  `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** One merged, shadowed mesh per material under `parent`. */
function addSolids(
  parent: Object3D,
  parts: GardenPart[],
  material: (id: GardenMaterialId) => Material,
  name: string,
) {
  const groups = new Map<GardenMaterialId, GardenPart[]>();
  for (const part of parts) {
    const list = groups.get(part.material);
    if (list) list.push(part);
    else groups.set(part.material, [part]);
  }
  for (const [id, list] of groups) {
    const mesh = new Mesh(
      mergeParts(list, { roundSegments: GARDEN_ROUND_SEGMENTS }),
      material(id),
    );
    mesh.name = `${name}-${id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

/** A prop's local frame on the grass. */
function propGroup(name: string, prop: GardenProp) {
  const group = new Object3D();
  group.name = name;
  group.position.set(prop.position[0], 0, prop.position[1]);
  group.rotation.y = prop.rotationY;
  return group;
}

/**
 * The stones as one smooth vertex-colored mesh: shaded per stone, a little
 * darker toward the ground (contact), UVs in world metres for the pitted
 * normal map.
 */
function stoneGeometry() {
  const mesh = pathMesh();
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(mesh.positions), 3),
  );
  geometry.setIndex(mesh.indices);
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const color = new Color();
  for (let i = 0; i < count; i++) {
    const stone = PATH_STONES[mesh.stone[i]];
    const world = [
      position.getX(i),
      position.getY(i),
      position.getZ(i),
    ] as const;
    const facing = [normal.getX(i), normal.getY(i), normal.getZ(i)] as const;
    const lift = (world[1] - stone.y) / STONE.height;
    color
      .set(GARDEN_COLORS.stone)
      .multiplyScalar(stone.shade * (0.72 + 0.28 * lift));
    colors.set([color.r, color.g, color.b], i * 3);
    uvs.set(boxUv(world, facing), i * 2);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The sign's text on its painted board: GARDEN_SIGN.text measured with the
 * canvas, wrapped and shrunk to fit (fitSignText), dark ink on cream inside a
 * thin coral rule. System fonts only.
 */
function signTexture(): CanvasTexture {
  const [width, height] = SIGN_TEXT_BOX.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = GARDEN_SIGN.board;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = GARDEN_SIGN.accent;
    context.lineWidth = 8;
    context.strokeRect(20, 20, width - 40, height - 40);
    const measure = (line: string, size: number) => {
      context.font = SIGN_FONT(size);
      return context.measureText(line).width;
    };
    const { lines, fontSize } = fitSignText(GARDEN_SIGN.text, measure);
    context.font = SIGN_FONT(fontSize);
    context.fillStyle = GARDEN_SIGN.ink;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const step = fontSize * SIGN_TEXT_BOX.lineHeight;
    const top = height / 2 - ((lines.length - 1) * step) / 2;
    lines.forEach((line, i) => {
      context.fillText(line, width / 2, top + i * step);
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface Lantern {
  light: SpotLight;
  glass: MeshStandardMaterial;
  bulb: MeshBasicMaterial;
}

/**
 * Front garden entrance (T7, S19, S20): four bronze wall lanterns (two beside
 * the front door, one at the garage door, one on the back wall), a beveled
 * stepping-stone path from the porch step, a decorative mailbox and a garden
 * sign reading GARDEN_SIGN.text. The lanterns are non-shadow spots with a
 * finite range, aimed out of their wall and down, on from 18:00 through
 * 05:59 (the night lights gate) unless the scene panel's master `power` is
 * off; they stay mounted at intensity 0 otherwise so the light count never
 * changes. Each lantern body hides while its own wall is cut away. With
 * `maps` the wood takes the house's plank texture.
 */
export default function Garden({
  hours,
  maps,
  power = true,
}: {
  hours: number;
  maps?: SurfaceMaps;
  /** The scene panel's master switch (night only). */
  power?: boolean;
}) {
  const { invalidate } = useThree();
  const { group, lanternGroups, lanterns, owned } = useMemo(() => {
    const owned: Owned = { materials: [], textures: [] };
    const cache = new Map<GardenMaterialId, Material>();
    const material = (id: GardenMaterialId) => {
      let found = cache.get(id);
      if (!found) {
        found = setupMaterial(GARDEN_MATERIALS[id], maps, owned);
        cache.set(id, found);
      }
      return found;
    };
    const group = new Object3D() as Group;
    group.name = "garden";

    const stones = new Mesh(stoneGeometry(), material("stone"));
    stones.name = "garden-path";
    stones.receiveShadow = true;
    group.add(stones);

    const mailbox = propGroup("garden-mailbox", GARDEN_PROPS.mailbox);
    addSolids(mailbox, mailboxParts(), material, "mailbox");
    const sign = propGroup("garden-sign", GARDEN_PROPS.sign);
    addSolids(sign, signParts(), material, "sign");
    const text = signTexture();
    const face = new MeshStandardMaterial({
      map: text,
      roughness: 0.8,
      metalness: 0,
    });
    owned.textures.push(text);
    owned.materials.push(face);
    const panel = new Mesh(
      new PlaneGeometry(SIGN_PANEL.width, SIGN_PANEL.height),
      face,
    );
    panel.name = "garden-sign-text";
    panel.position.set(...SIGN_PANEL.center);
    panel.receiveShadow = true;
    sign.add(panel);
    group.add(mailbox, sign);

    // One group per wall, so each lantern follows its own wall's cutaway.
    const lanternGroups = new Map<LanternWall, Object3D>();
    for (const id of LANTERN_IDS) {
      const { wall } = LANTERN_MOUNTS[id];
      if (lanternGroups.has(wall)) continue;
      const parent = new Object3D();
      parent.name = `garden-lanterns-${wall}`;
      addSolids(
        parent,
        LANTERN_IDS.filter(
          (other) => LANTERN_MOUNTS[other].wall === wall,
        ).flatMap(lanternParts),
        material,
        `lantern-${wall}`,
      );
      lanternGroups.set(wall, parent);
      group.add(parent);
    }
    const glassBox = new BoxGeometry(1, 1, 1);
    const bulbBall = new SphereGeometry(1, 16, 12);
    const lanterns = {} as Record<(typeof LANTERN_IDS)[number], Lantern>;
    for (const id of LANTERN_IDS) {
      const fixture = LANTERN_FIXTURES[id];
      const glass = new MeshStandardMaterial({
        color: GARDEN_COLORS.glass,
        roughness: 0.15,
        metalness: 0,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      const bulb = new MeshBasicMaterial({ color: GARDEN_COLORS.bulbOff });
      owned.materials.push(glass, bulb);
      const pane = new Mesh(glassBox, glass);
      const { center, size } = lanternGlass(id);
      pane.name = `${id}-glass`;
      pane.position.set(...center);
      pane.scale.set(...size);
      pane.renderOrder = 1;
      const lit = new Mesh(bulbBall, bulb);
      lit.name = `${id}-bulb`;
      lit.position.set(...fixture.position);
      lit.scale.setScalar(LANTERN.bulb.radius * LANTERN_MOUNTS[id].scale);
      lanternGroups.get(LANTERN_MOUNTS[id].wall)?.add(pane, lit);

      const light = new SpotLight(
        GARDEN_COLORS.light,
        0,
        fixture.distance,
        fixture.angle,
        fixture.penumbra,
        fixture.decay,
      );
      light.name = `garden-${id}`;
      light.castShadow = fixture.castShadow;
      light.position.set(...fixture.position);
      light.target.position.set(...fixture.target);
      // Lights stay in the garden group: on even while the bodies hide.
      group.add(light, light.target);
      lanterns[id] = { light, glass, bulb };
    }
    return { group, lanternGroups, lanterns, owned };
  }, [maps]);

  useLayoutEffect(() => {
    const level = lanternLevel(hours, power);
    for (const id of LANTERN_IDS) {
      const { light, glass, bulb } = lanterns[id];
      light.intensity = LANTERN_FIXTURES[id].intensity * level;
      bulb.color.set(level > 0 ? GARDEN_COLORS.light : GARDEN_COLORS.bulbOff);
      if (level > 0) bulb.color.multiplyScalar(2);
      // Twice the first pass (0.55), with the doubled spot.
      glass.emissive.set(GARDEN_COLORS.light).multiplyScalar(1.1 * level);
    }
    invalidate();
  }, [hours, power, lanterns, invalidate]);

  const camera = useRef<[number, number, number]>([0, 0, 0]);
  useFrame(({ camera: { position } }) => {
    camera.current[0] = position.x;
    camera.current[1] = position.y;
    camera.current[2] = position.z;
    const fades = cutaway(camera.current);
    for (const [wall, parent] of lanternGroups)
      parent.visible = fades[wall] < LANTERN_HIDE;
  });

  useEffect(
    () => () => {
      for (const material of owned.materials) material.dispose();
      for (const texture of owned.textures) texture.dispose();
      const geometries = new Set<BufferGeometry>();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) geometries.add(mesh.geometry);
      });
      for (const geometry of geometries) geometry.dispose();
    },
    [group, owned],
  );

  return <primitive object={group} />;
}
