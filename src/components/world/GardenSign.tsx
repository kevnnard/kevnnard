import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  type Mesh,
  MeshStandardMaterial,
  PointLight,
  SRGBColorSpace,
} from "three";
import { houseBlocks } from "@/lib/world/cherry.ts";
import {
  GARDEN_PROPS,
  GARDEN_SIGN,
  SIGN_LANTERN,
  SIGN_PANEL,
  type SignStatus,
} from "@/lib/world/garden.ts";
import {
  fitLine,
  SIGN_FACE,
  SIGN_FACE_CENTRE,
  SIGN_HITBOX,
  SIGN_MESSAGES,
  SIGN_TILE_PANEL,
  signCopy,
  signLanternGlow,
  signTile,
  signTileWake,
} from "@/lib/world/garden-sign.ts";

/** Pointer travel (px) past which a press is a drag, not a click. */
const CLICK_SLOP = 6;
const SANS = (weight: number, size: number) =>
  `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const MONO = (size: number) =>
  `600 ${size}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

/**
 * The painted face for `status`: cream inside the coral rule, the headline
 * on one big line, the name and role with a coral dot, and the dark tile
 * strip with its hairline (the rotating line is drawn over it on its own
 * plane). System fonts only.
 */
function faceTexture(status: SignStatus): CanvasTexture {
  const [width, height] = SIGN_FACE.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    const { rule, headline, who, tiles } = SIGN_FACE;
    context.fillStyle = GARDEN_SIGN.board;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = GARDEN_SIGN.accent;
    context.lineWidth = rule.width;
    context.strokeRect(
      rule.inset,
      rule.inset,
      width - 2 * rule.inset,
      height - 2 * rule.inset,
    );
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillStyle = GARDEN_SIGN.ink;
    const text = signCopy(status).headline;
    const size = fitLine(
      text,
      (line, px) => {
        context.font = SANS(800, px);
        return context.measureText(line).width;
      },
      headline.width,
      headline.maxSize,
      headline.minSize,
    );
    context.font = SANS(800, size);
    context.fillText(text, width / 2, headline.y);

    // Name · role, the dot in the coral, centred as one line.
    const [name, role] = who.text.split(" · ");
    const whoSize = fitLine(
      who.text,
      (line, px) => {
        context.font = SANS(600, px);
        return context.measureText(line).width;
      },
      who.width,
      who.size,
    );
    context.font = SANS(600, whoSize);
    context.textAlign = "left";
    const runs: [string, string][] = [
      [name, GARDEN_SIGN.ink],
      [" · ", GARDEN_SIGN.accent],
      [role, GARDEN_SIGN.ink],
    ];
    const total = runs.reduce(
      (sum, [run]) => sum + context.measureText(run).width,
      0,
    );
    let x = (width - total) / 2;
    for (const [run, color] of runs) {
      context.fillStyle = color;
      context.fillText(run, x, who.y);
      x += context.measureText(run).width;
    }

    context.fillStyle = tiles.ink;
    context.beginPath();
    context.roundRect(
      tiles.x,
      tiles.y,
      tiles.width,
      tiles.height,
      tiles.radius,
    );
    context.fill();
    // The split between the flaps.
    context.fillStyle = "rgba(9, 9, 11, 0.8)";
    context.fillRect(tiles.x, tiles.y + tiles.height / 2 - 3, tiles.width, 6);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Draws one rotating line, upper case and spaced, on the tile canvas. */
function drawTile(canvas: HTMLCanvasElement, line: string) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const [width, height] = SIGN_TILE_PANEL.canvas;
  context.clearRect(0, 0, width, height);
  const text = line.toUpperCase();
  context.letterSpacing = "4px";
  const size = fitLine(
    text,
    (value, px) => {
      context.font = MONO(px);
      return context.measureText(value).width;
    },
    width - 80,
    SIGN_TILE_PANEL.fontSize,
  );
  context.font = MONO(size);
  context.fillStyle = SIGN_FACE.tiles.paint;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
}

/**
 * The garden sign's face and status lantern (garden-sign T2, 01 wooden
 * board): the painted board for GARDEN_SIGN.status, a flip-tile line that
 * rotates SIGN_MESSAGES every 3 s (only its small canvas redraws; the flip
 * folds the plane), a lantern glass in the status colour with a soft point
 * light that is always mounted and only lit at night (the wall lanterns'
 * gate and the master power), and a click target for the close-up. The
 * demand frameloop is woken for the flips only; reduced motion changes the
 * line slowly with no flip. Clickable only in plain sight from outside, as
 * Cherry is. Posts, board and lantern cage are Garden's merged wood.
 */
export default function GardenSign({
  hours,
  power,
  reducedMotion,
  focused,
  onInspect,
}: {
  hours: number;
  power: boolean;
  reducedMotion: boolean;
  /** Its close-up holds the camera. */
  focused: boolean;
  /** Absent while another close-up holds the camera. */
  onInspect?: (id: "sign") => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const element = useThree((state) => state.gl.domElement);
  const status = GARDEN_SIGN.status;
  const owned = useMemo(() => {
    const face = faceTexture(status);
    const faceMaterial = new MeshStandardMaterial({
      map: face,
      roughness: 0.8,
      metalness: 0,
    });
    const tileCanvas = document.createElement("canvas");
    [tileCanvas.width, tileCanvas.height] = SIGN_TILE_PANEL.canvas;
    const tile = new CanvasTexture(tileCanvas);
    tile.colorSpace = SRGBColorSpace;
    tile.anisotropy = 8;
    const tileMaterial = new MeshStandardMaterial({
      map: tile,
      transparent: true,
      depthWrite: false,
      roughness: 0.8,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const { color } = signLanternGlow(0, false, status);
    const glass = new MeshStandardMaterial({
      color,
      emissive: color,
      roughness: 0.25,
      metalness: 0,
    });
    const { distance, decay } = SIGN_LANTERN.light;
    const light = new PointLight(color, 0, distance, decay);
    light.name = "garden-sign-lantern";
    light.position.set(...SIGN_LANTERN.glass.center);
    return { face, faceMaterial, tileCanvas, tile, tileMaterial, glass, light };
  }, [status]);
  useEffect(
    () => () => {
      owned.face.dispose();
      owned.tile.dispose();
      owned.faceMaterial.dispose();
      owned.tileMaterial.dispose();
      owned.glass.dispose();
      owned.light.dispose();
    },
    [owned],
  );
  useEffect(
    () => () => {
      element.style.cursor = "";
    },
    [element],
  );

  useLayoutEffect(() => {
    const glow = signLanternGlow(hours, power, status);
    owned.light.intensity = glow.intensity;
    owned.glass.emissiveIntensity = glow.emissive;
    invalidate();
  }, [hours, power, status, owned, invalidate]);

  // The line's clock starts with the sign; -1 forces the first draw.
  const start = useRef(performance.now());
  const drawn = useRef(-1);
  const tileMesh = useRef<Mesh>(null);
  useFrame((frame) => {
    const t = (performance.now() - start.current) / 1000;
    const tile = signTile(t, reducedMotion);
    if (tile.index !== drawn.current) {
      drawTile(owned.tileCanvas, SIGN_MESSAGES[tile.index]);
      owned.tile.needsUpdate = true;
      drawn.current = tile.index;
    }
    const mesh = tileMesh.current;
    if (mesh) {
      mesh.scale.y = Math.max(tile.scale, 1e-3);
      mesh.visible = tile.scale > 1e-3;
    }
    if (signTileWake(t, reducedMotion) === 0) frame.invalidate();
  });
  // Wakes the demand frameloop for each flip (or slow change); useFrame
  // keeps it running through the flip.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const t = (performance.now() - start.current) / 1000;
      const wait = signTileWake(t, reducedMotion);
      timer = setTimeout(
        () => {
          invalidate();
          arm();
        },
        wait * 1000 + 20,
      );
    };
    arm();
    return () => clearTimeout(timer);
  }, [reducedMotion, invalidate]);

  const reachable = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    if (!onInspect || focused) return false;
    const { x, y, z } = event.camera.position;
    return !houseBlocks([x, y, z], SIGN_FACE_CENTRE);
  };

  const { position, rotationY } = GARDEN_PROPS.sign;
  return (
    <group
      name="garden-sign-face"
      position={[position[0], 0, position[1]]}
      rotation-y={rotationY}
    >
      <mesh
        name="garden-sign-text"
        position={SIGN_PANEL.center}
        material={owned.faceMaterial}
        receiveShadow
      >
        <planeGeometry args={[SIGN_PANEL.width, SIGN_PANEL.height]} />
      </mesh>
      <mesh
        ref={tileMesh}
        name="garden-sign-tile"
        position={SIGN_TILE_PANEL.center}
        material={owned.tileMaterial}
        renderOrder={1}
      >
        <planeGeometry args={[SIGN_TILE_PANEL.width, SIGN_TILE_PANEL.height]} />
      </mesh>
      <mesh
        name="garden-sign-glass"
        position={SIGN_LANTERN.glass.center}
        material={owned.glass}
      >
        <boxGeometry args={SIGN_LANTERN.glass.size} />
      </mesh>
      <primitive object={owned.light} />
      <mesh
        name="garden-sign-hit"
        position={SIGN_HITBOX.center}
        onClick={(event) => {
          if (event.delta > CLICK_SLOP || !reachable(event)) return;
          event.stopPropagation();
          element.style.cursor = "";
          onInspect?.("sign");
        }}
        onPointerOver={(event) => {
          if (reachable(event)) element.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          element.style.cursor = "";
        }}
      >
        <boxGeometry args={SIGN_HITBOX.size} />
        <meshBasicMaterial
          transparent
          opacity={0}
          colorWrite={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
