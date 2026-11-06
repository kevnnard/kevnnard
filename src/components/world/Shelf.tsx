import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Texture,
  Vector2,
} from "three";
import { mergeParts } from "@/components/world/House";
import { proceduralNormal, setupMaterial } from "@/components/world/Setup";
import type { SurfaceMaps } from "@/components/world/surfaces";
import {
  BALL_SKIN,
  FOOTBALL,
  footballProfile,
  LABEL_ATLAS,
  type LabelKind,
  SHELF,
  SHELF_HITBOX,
  SHELF_LABELS,
  SHELF_MATERIALS,
  SHELF_ROUND_SEGMENTS,
  type ShelfLabel,
  type ShelfMaterialId,
  type ShelfPart,
  shelfParts,
} from "@/lib/world/shelf.ts";

type Owned = { materials: Material[]; textures: Texture[] };
type Context = CanvasRenderingContext2D;

const FONT = (weight: number, size: number) =>
  `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Darker toward the back panel and under the boards: baked contact shade. */
function shelfOcclusion(
  [, , z]: readonly [number, number, number],
  [, ny]: readonly [number, number, number],
): number {
  const back = Math.min(Math.max((-0.04 - z) / 0.11, 0), 1);
  let ao = 1 - 0.22 * back;
  if (ny < -0.5) ao *= 0.82;
  return ao;
}

function roundRect(
  c: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function text(
  c: Context,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  { weight = 800, align = "left" as CanvasTextAlign, spacing = 0 } = {},
) {
  c.font = FONT(weight, size);
  c.fillStyle = color;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.letterSpacing = `${spacing}px`;
  c.fillText(value, x, y);
  c.letterSpacing = "0px";
}

/** A box fan seen from the front: hub, blades and a ring. */
function fan(c: Context, x: number, y: number, r: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = Math.max(2, r * 0.08);
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25);
    c.quadraticCurveTo(
      x + Math.cos(a + 0.5) * r * 0.7,
      y + Math.sin(a + 0.5) * r * 0.7,
      x + Math.cos(a + 0.9) * r * 0.9,
      y + Math.sin(a + 0.9) * r * 0.9,
    );
    c.stroke();
  }
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r * 0.22, 0, Math.PI * 2);
  c.fill();
}

/** A memory or NVMe stick, drawn upright: board, chips and gold contacts. */
function stick(
  c: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  board: string,
  chips: number,
) {
  c.fillStyle = board;
  roundRect(c, x, y, w, h, w * 0.08);
  c.fill();
  c.fillStyle = "#1a1a1d";
  const chip = (h * 0.8) / chips;
  for (let i = 0; i < chips; i++)
    c.fillRect(x + w * 0.2, y + h * 0.06 + i * chip, w * 0.6, chip * 0.7);
  c.fillStyle = "#d9b65a";
  for (let i = 0; i < 6; i++)
    c.fillRect(
      x + w * 0.1 + (i * w * 0.8) / 6,
      y + h - h * 0.05,
      w * 0.08,
      h * 0.04,
    );
}

/** Original swoosh outline in a 1 x 0.36 box, tip at the upper right. */
function swooshPath(c: Context) {
  c.beginPath();
  c.moveTo(0.09, 0.12);
  c.bezierCurveTo(-0.04, 0.24, -0.02, 0.37, 0.16, 0.355);
  c.bezierCurveTo(0.34, 0.34, 0.66, 0.17, 1, 0);
  c.bezierCurveTo(0.68, 0.11, 0.38, 0.22, 0.2, 0.235);
  c.bezierCurveTo(0.06, 0.245, 0.04, 0.18, 0.09, 0.12);
  c.closePath();
}

/** Draws one label kind into a `w` x `h` pixel region at the origin. */
function drawLabel(c: Context, label: ShelfLabel, w: number, h: number) {
  const kind: LabelKind = label.kind;
  switch (kind) {
    case "psu": {
      c.fillStyle = "#f2d33c";
      c.fillRect(0, 0, w, h);
      // Corsair sails and wordmark, then the boxed unit and model.
      c.fillStyle = "#111";
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(12 + i * 7, 26);
        c.lineTo(22 + i * 7, 10);
        c.lineTo(24 + i * 7, 26);
        c.fill();
      }
      text(c, "CORSAIR", 46, 19, 15, "#111", { spacing: 1 });
      roundRect(c, w * 0.36, h * 0.24, w * 0.56, h * 0.44, 10);
      c.fillStyle = "#1b1b1d";
      c.fill();
      fan(c, w * 0.64, h * 0.46, h * 0.16, "#4a4a50");
      text(c, "VS600", 12, h * 0.72, 40, "#111");
      text(c, "600 WATT", 14, h * 0.86, 14, "#111", { weight: 600 });
      c.fillStyle = "#111";
      c.fillRect(0, h - 10, w, 10);
      roundRect(c, w - 62, h - 46, 50, 26, 5);
      c.fill();
      text(c, "80+", w - 37, h - 33, 14, "#f2d33c", { align: "center" });
      break;
    }
    case "ryzen": {
      c.fillStyle = "#2c2b30";
      c.fillRect(0, 0, w, h);
      text(c, "AMD", 12, 18, 15, "#fff");
      c.strokeStyle = "#f26a21";
      c.lineWidth = 9;
      c.beginPath();
      c.arc(w / 2, h * 0.48, w * 0.36, Math.PI * 0.85, Math.PI * 2.3);
      c.stroke();
      text(c, "RYZEN", w / 2, h * 0.5, 36, "#fff", {
        align: "center",
        spacing: 1,
      });
      c.fillStyle = "#f26a21";
      c.beginPath();
      c.moveTo(w, h - 64);
      c.lineTo(w, h);
      c.lineTo(w - 64, h);
      c.closePath();
      c.fill();
      text(c, "7", w - 18, h - 20, 30, "#fff", { align: "center" });
      break;
    }
    case "gigabyte": {
      c.fillStyle = "#1f2024";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#f2852d";
      c.fillRect(0, h - 8, w * 0.4, 8);
      text(c, "GIGABYTE", 18, h * 0.42, 38, "#f3f3f3", { spacing: 3 });
      roundRect(c, w * 0.58, h * 0.16, w * 0.38, h * 0.62, 10);
      c.fillStyle = "#34363c";
      c.fill();
      for (let i = 0; i < 3; i++)
        fan(c, w * (0.64 + i * 0.13), h * 0.47, h * 0.24, "#7c7f87");
      break;
    }
    case "memory": {
      c.fillStyle = "#2a2d33";
      c.fillRect(0, 0, w, h);
      stick(c, w * 0.28, 14, w * 0.44, h * 0.6, "#2f7a4a", 6);
      text(c, "DDR4", w / 2, h * 0.8, 24, "#fff", { align: "center" });
      c.fillStyle = "#d8342b";
      c.fillRect(0, h - 10, w, 10);
      break;
    }
    case "nvme": {
      c.fillStyle = "#30343b";
      c.fillRect(0, 0, w, h);
      stick(c, w * 0.36, 12, w * 0.28, h * 0.56, "#16181c", 3);
      text(c, "M.2", w / 2, h * 0.76, 22, "#fff", { align: "center" });
      text(c, "NVMe", w / 2, h * 0.9, 14, "#7fc4ff", { align: "center" });
      break;
    }
    case "carton": {
      const bands = ["#e63b2e", "#f7902c", "#f9d23c", "#5fb547", "#1f8dd6"];
      bands.forEach((color, i) => {
        c.fillStyle = color;
        c.fillRect((i * w) / bands.length, 0, w / bands.length + 1, h);
      });
      // An instant print: white frame, wider at the bottom.
      c.fillStyle = "#fbfaf6";
      c.fillRect(w * 0.22, h * 0.18, w * 0.56, h * 0.6);
      const gradient = c.createLinearGradient(0, h * 0.22, 0, h * 0.6);
      gradient.addColorStop(0, "#f2a33a");
      gradient.addColorStop(1, "#7a2c1d");
      c.fillStyle = gradient;
      c.fillRect(w * 0.27, h * 0.22, w * 0.46, h * 0.42);
      text(c, "Polaroid", w / 2, h * 0.9, 20, "#fff", {
        weight: 700,
        align: "center",
      });
      break;
    }
    case "keys": {
      c.fillStyle = "#1e1d22";
      c.fillRect(0, 0, w, h);
      const rows = 5;
      const cols = 15;
      const kw = w / cols;
      const kh = h / rows;
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < cols; k++) {
          const orange = (r === 0 && k === 0) || (r === 2 && k === cols - 1);
          c.fillStyle = orange ? "#f07a2c" : "#3a3940";
          roundRect(c, k * kw + 2, r * kh + 2, kw - 4, kh - 4, 4);
          c.fill();
        }
      // Wide orange space bar on the bottom row, like the owner's keyboard.
      c.fillStyle = "#1e1d22";
      c.fillRect(kw * 4, (rows - 1) * kh, kw * 7, kh);
      c.fillStyle = "#f07a2c";
      roundRect(c, kw * 4 + 2, (rows - 1) * kh + 2, kw * 7 - 4, kh - 4, 4);
      c.fill();
      break;
    }
    case "zenit": {
      c.fillStyle = "#1c1b1f";
      c.fillRect(0, 0, w, h);
      text(c, "ZENIT", w / 2, h / 2 + 1, 22, "#f3f3f3", {
        align: "center",
        spacing: 3,
      });
      break;
    }
    case "samsung": {
      c.fillStyle = "#c9cbcf";
      c.fillRect(0, 0, w, h);
      text(c, "SAMSUNG", w / 2, h / 2 + 1, 17, "#2b3a63", {
        align: "center",
        spacing: 2,
      });
      break;
    }
    case "spine":
    case "spine-flat": {
      // No readable titles: colour, gilt bands and a title block.
      const flat = kind === "spine-flat";
      c.fillStyle = label.color ?? "#555";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "rgba(0, 0, 0, 0.18)";
      if (flat) c.fillRect(0, 0, w, 3);
      else c.fillRect(0, 0, 3, h);
      c.fillStyle = "#d8b35e";
      if (flat) {
        c.fillRect(10, 0, 4, h);
        c.fillRect(w - 14, 0, 4, h);
        c.fillStyle = "rgba(255, 255, 255, 0.7)";
        c.fillRect(w * 0.3, h * 0.35, w * 0.4, h * 0.3);
      } else {
        c.fillRect(0, 14, w, 4);
        c.fillRect(0, h - 18, w, 4);
        c.fillStyle = "rgba(255, 255, 255, 0.7)";
        c.fillRect(w * 0.35, h * 0.25, w * 0.3, h * 0.42);
        c.fillRect(w * 0.3, h * 0.78, w * 0.4, h * 0.06);
      }
      break;
    }
  }
}

/** Every printed face in one canvas: boxes, cameras, keys and spines. */
function labelAtlas(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_ATLAS.width;
  canvas.height = LABEL_ATLAS.height;
  const context = canvas.getContext("2d");
  if (context)
    for (const label of SHELF_LABELS) {
      const [x, y, w, h] = label.region;
      context.save();
      context.translate(x, y);
      context.beginPath();
      context.rect(0, 0, w, h);
      context.clip();
      drawLabel(context, label, w, h);
      context.restore();
    }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The football's leather: four panels (slightly varied), dark seams, white
 * stripes across the two panels beside the laces, and the swoosh. Canvas x
 * is lathe u (around), canvas y is 1 - v (tip to tip, flipped).
 */
function ballSkin(): CanvasTexture {
  const { width: W, height: H } = BALL_SKIN;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = BALL_SKIN.leather;
    c.fillRect(0, 0, W, H);
    // Each panel a touch lighter or darker.
    const seams = [...BALL_SKIN.seams].sort((a, b) => a - b);
    seams.forEach((u, i) => {
      const next = i + 1 < seams.length ? seams[i + 1] : seams[0] + 1;
      c.fillStyle = i % 2 ? "rgba(255, 220, 190, 0.05)" : "rgba(0, 0, 0, 0.06)";
      c.fillRect(u * W, 0, (next - u) * W, H);
      if (next > 1) c.fillRect((u - 1) * W, 0, (next - u) * W, H);
    });
    // Tips darker, where the leather turns away.
    const tips = c.createLinearGradient(0, 0, 0, H);
    tips.addColorStop(0, "rgba(30, 12, 4, 0.45)");
    tips.addColorStop(0.18, "rgba(30, 12, 4, 0)");
    tips.addColorStop(0.82, "rgba(30, 12, 4, 0)");
    tips.addColorStop(1, "rgba(30, 12, 4, 0.45)");
    c.fillStyle = tips;
    c.fillRect(0, 0, W, H);
    // Stripes: the two panels beside the laces, wrapping around u = 0.
    const lace = BALL_SKIN.seams[0];
    c.fillStyle = BALL_SKIN.stripe;
    for (const { v0, v1 } of BALL_SKIN.stripes)
      for (const shift of [-1, 0, 1])
        c.fillRect(
          (lace - BALL_SKIN.stripeSpan + shift) * W,
          (1 - v1) * H,
          BALL_SKIN.stripeSpan * 2 * W,
          (v1 - v0) * H,
        );
    c.strokeStyle = BALL_SKIN.seam;
    c.lineWidth = 5;
    for (const u of seams)
      for (const shift of [-1, 0, 1]) {
        c.beginPath();
        c.moveTo((u + shift) * W, 0);
        c.lineTo((u + shift) * W, H);
        c.stroke();
      }
    // The swoosh runs along the ball: canvas right is "down" on the ball's
    // front and canvas down is its left, so it is drawn turned a quarter.
    const { u, v, length, color } = BALL_SKIN.swoosh;
    c.save();
    c.translate(u * W, (1 - v) * H);
    c.rotate(-Math.PI / 2);
    const size = length * H;
    c.scale(size, size);
    c.translate(-0.5, -0.18);
    swooshPath(c);
    c.fillStyle = color;
    c.fill();
    c.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Every label as one quad mesh with atlas UVs. */
function labelGeometry(): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const { width: AW, height: AH } = LABEL_ATLAS;
  for (const label of SHELF_LABELS) {
    const [rx, ry, rw, rh] = label.region;
    const [u0, u1] = [rx / AW, (rx + rw) / AW];
    const [v0, v1] = [1 - (ry + rh) / AH, 1 - ry / AH];
    const [x, y, z] = label.center;
    const [w, h] = label.size;
    const base = positions.length / 3;
    if (label.face === "top") {
      // Image top toward the back, so it reads from the front.
      positions.push(
        x - w / 2,
        y,
        z - h / 2,
        x + w / 2,
        y,
        z - h / 2,
        x + w / 2,
        y,
        z + h / 2,
        x - w / 2,
        y,
        z + h / 2,
      );
      uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
      for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    } else {
      positions.push(
        x - w / 2,
        y - h / 2,
        z,
        x + w / 2,
        y - h / 2,
        z,
        x + w / 2,
        y + h / 2,
        z,
        x - w / 2,
        y + h / 2,
        z,
      );
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let i = 0; i < 4; i++) normals.push(0, 0, 1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
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
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The personal collection shelf (T10, S22): a white two-column display shelf
 * left of the setup, turned to face the room. One merged, shadowed mesh per
 * material, the football (lathe, leather skin and pebble normal) and one
 * label mesh from an original canvas atlas. Static: no animation, no lights.
 * With `maps` the oak takes the house's plank grain. With `onInspect`, a
 * click from the room enters its inspection view (katana-wall-shelf T15);
 * the inspected shelf takes no clicks, so they reach whatever lies behind.
 */
export default function Shelf({
  maps,
  focused = false,
  onInspect,
}: {
  maps?: SurfaceMaps;
  focused?: boolean;
  onInspect?: (id: "collection-shelf") => void;
}) {
  const { invalidate } = useThree();
  const { group, owned } = useMemo(() => {
    const owned: Owned = { materials: [], textures: [] };
    const cache = new Map<ShelfMaterialId, Material>();
    const material = (id: ShelfMaterialId) => {
      let found = cache.get(id);
      if (!found) {
        found = setupMaterial(SHELF_MATERIALS[id], maps, owned);
        cache.set(id, found);
      }
      return found;
    };
    const group = new Object3D() as Group;
    group.name = "shelf";
    group.position.set(...SHELF.base);
    group.rotation.y = SHELF.yaw;

    const byMaterial = new Map<ShelfMaterialId, ShelfPart[]>();
    for (const part of shelfParts()) {
      const list = byMaterial.get(part.material);
      if (list) list.push(part);
      else byMaterial.set(part.material, [part]);
    }
    for (const [id, list] of byMaterial) {
      const mesh = new Mesh(
        mergeParts(list, {
          roundSegments: SHELF_ROUND_SEGMENTS,
          occlusion: shelfOcclusion,
        }),
        material(id),
      );
      mesh.name = `shelf-${id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    const lathe = new LatheGeometry(
      footballProfile().map(([r, y]) => new Vector2(r, y)),
      FOOTBALL.segments,
    );
    lathe.rotateZ(-Math.PI / 2);
    lathe.translate(...FOOTBALL.center);
    const skin = ballSkin();
    const pebble = proceduralNormal({
      roughness: 0.6,
      metalness: 0,
      normal: BALL_SKIN.normal,
      tile: [1 / BALL_SKIN.pebbleRepeat[0], 1 / BALL_SKIN.pebbleRepeat[1]],
    });
    const leather = new MeshStandardMaterial({
      map: skin,
      roughness: 0.6,
      metalness: 0,
      ...(pebble && { normalMap: pebble }),
    });
    leather.normalScale.setScalar(0.55);
    owned.textures.push(skin, ...(pebble ? [pebble] : []));
    owned.materials.push(leather);
    const ball = new Mesh(lathe, leather);
    ball.name = "shelf-football";
    ball.castShadow = true;
    ball.receiveShadow = true;
    group.add(ball);

    const atlas = labelAtlas();
    const print = new MeshStandardMaterial({
      map: atlas,
      roughness: 0.62,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    owned.textures.push(atlas);
    owned.materials.push(print);
    const labels = new Mesh(labelGeometry(), print);
    labels.name = "shelf-labels";
    labels.receiveShadow = true;
    group.add(labels);
    return { group, owned };
  }, [maps]);

  useEffect(() => {
    invalidate();
  }, [group, invalidate]);

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

  return (
    <>
      <primitive object={group} />
      {onInspect && (
        // Click target over the carcass only (SHELF_HITBOX)
        <mesh
          name="collection-shelf-hitbox"
          position={SHELF_HITBOX.center}
          onClick={(e) => {
            if (focused) return;
            e.stopPropagation();
            onInspect?.("collection-shelf");
          }}
          onPointerOver={(e) => {
            if (focused) return;
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
          visible={false}
        >
          <boxGeometry args={SHELF_HITBOX.size} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}
    </>
  );
}
