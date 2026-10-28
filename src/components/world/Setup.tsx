import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BackSide,
  type BufferAttribute,
  Color,
  DataTexture,
  DoubleSide,
  type Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  type Texture,
  Vector3,
} from "three";
import {
  BrunoChair,
  BrunoOverlayModel,
  GoogleHomeLeds,
} from "@/components/world/BrunoProps";
import { mergeParts } from "@/components/world/House";
import {
  CoffeeSteam,
  logoMesh,
  mugGeometry,
  steamMaterial,
} from "@/components/world/SetupEffects";
import { type SurfaceMaps, surfaceMaterial } from "@/components/world/surfaces";
import {
  BOUNCE,
  bounceStep,
  chairSway,
  GOOGLE_LED_COLORS,
  GOOGLE_LED_REST,
  googleLedOpacity,
  LOUPEDECK,
  LOUPEDECK_REST,
  ledLevel,
  loupedeckButton,
  setupAnimates,
} from "@/lib/world/motion.ts";
import { NORMAL_SIZE, normalPixels } from "@/lib/world/normals.ts";
import {
  BRUNO_FILES,
  BRUNO_OVERLAYS,
  CHAIR_PIVOT,
  SETUP_COLORS,
  SETUP_MATERIALS,
  SETUP_PROPS,
  SETUP_ROUND_SEGMENTS,
  type SetupMaterial,
  type SetupMaterialId,
  type SetupPart,
  setupGlow,
  setupMeshes,
  setupOcclusion,
} from "@/lib/world/setup.ts";

/** Where the animation gate measures the camera distance from. */
const FOCUS = new Vector3(
  CHAIR_PIVOT[0],
  SETUP_PROPS.mug.center[1],
  CHAIR_PIVOT[1],
);
/** Frames after a pause (demand loop) step at most this long, in ms. */
const MAX_STEP = 100;

const SOLID_MERGE = {
  roundSegments: SETUP_ROUND_SEGMENTS,
  occlusion: setupOcclusion,
};

/** An owned DataTexture over a cached procedural normal map, tiled in metres. */
export function proceduralNormal(spec: SetupMaterial): Texture | null {
  if (!spec.normal || !spec.tile) return null;
  const texture = new DataTexture(
    normalPixels(spec.normal),
    NORMAL_SIZE,
    NORMAL_SIZE,
  );
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
  if (spec.offset) texture.offset.set(...spec.offset);
  texture.needsUpdate = true;
  return texture;
}

/** One material per setup material id; textures it creates join `owned`. */
export function setupMaterial(
  spec: SetupMaterial,
  maps: SurfaceMaps | undefined,
  owned: { materials: Material[]; textures: Texture[] },
): MeshStandardMaterial {
  const params = {
    vertexColors: true,
    roughness: spec.roughness,
    metalness: spec.metalness,
    shadowSide: BackSide,
  };
  const base = spec.clearcoat
    ? new MeshPhysicalMaterial({
        ...params,
        clearcoat: spec.clearcoat,
        clearcoatRoughness: 0.4,
      })
    : new MeshStandardMaterial(params);
  const normal = proceduralNormal(spec);
  if (normal) {
    base.normalMap = normal;
    base.normalScale.setScalar(spec.normalScale ?? 1);
    owned.textures.push(normal);
  }
  if (!spec.surface || !maps) {
    owned.materials.push(base);
    return base;
  }
  const textured = surfaceMaterial(base, spec.surface, maps);
  base.dispose();
  owned.materials.push(textured);
  return textured;
}

/** Merges parts into one mesh per material, shadowed, under `parent`. */
function addSolids(
  parent: Object3D,
  parts: SetupPart[],
  material: (id: SetupMaterialId) => Material,
) {
  const groups = new Map<SetupMaterialId, SetupPart[]>();
  for (const part of parts) {
    const list = groups.get(part.material);
    if (list) list.push(part);
    else groups.set(part.material, [part]);
  }
  for (const [id, list] of groups) {
    const body = new Mesh(mergeParts(list, SOLID_MERGE), material(id));
    body.name = `setup-${id}`;
    body.castShadow = true;
    body.receiveShadow = true;
    parent.add(body);
  }
}

/** One merged LED mesh; `index` holds each vertex's LED phase index. */
function ledMesh(parts: SetupPart[], material: Material) {
  const merge = { roundSegments: SETUP_ROUND_SEGMENTS };
  const geometry = mergeParts(parts, merge);
  const index = new Uint8Array(geometry.getAttribute("position").count);
  let offset = 0;
  for (const part of parts) {
    const single = mergeParts([part], merge);
    const count = single.getAttribute("position").count;
    index.fill(part.led ?? 0, offset, offset + count);
    offset += count;
    single.dispose();
  }
  const colors = geometry.getAttribute("color") as BufferAttribute;
  const mesh = new Mesh(geometry, material);
  mesh.name = "setup-leds";
  return { mesh, index, colors, base: Float32Array.from(colors.array) };
}

/** Bruno's overlay materials (T4k): Elgato glow, Google Home LEDs, Loupedeck screens. */
function brunoMaterials() {
  return {
    elgato: new MeshBasicMaterial({ side: DoubleSide }),
    leds: GOOGLE_LED_COLORS.map(
      (color) => new MeshBasicMaterial({ color, transparent: true }),
    ),
    buttons: Array.from(
      { length: LOUPEDECK.buttons },
      () => new MeshBasicMaterial({ color: "#ffffff", transparent: true }),
    ),
  };
}

type BrunoMaterials = ReturnType<typeof brunoMaterials>;
const BUTTON_COLORS = new Map(
  LOUPEDECK.colors.map((color) => [color, new Color(color)]),
);

/** LoupedeckButtons and GoogleLeds at `t` ms. */
function brunoFrame(bruno: BrunoMaterials, t: number, ledT: number | null) {
  for (const [index, material] of bruno.buttons.entries()) {
    const { color, opacity } = loupedeckButton(t, index);
    const value = BUTTON_COLORS.get(color);
    if (value) material.color.copy(value);
    material.opacity = opacity;
  }
  for (const [index, material] of bruno.leds.entries())
    material.opacity =
      ledT === null ? GOOGLE_LED_REST : googleLedOpacity(ledT, index);
}

/** The resting pose, also what reduced motion and far views show. */
function rest(
  {
    swivel,
    leds,
    logo,
    bruno,
  }: {
    swivel: Object3D;
    leds: ReturnType<typeof ledMesh>;
    logo: ReturnType<typeof logoMesh>;
    bruno: BrunoMaterials;
  },
  base: number,
) {
  brunoFrame(bruno, LOUPEDECK_REST, null);
  swivel.rotation.y = 0;
  for (let i = 0; i < leds.base.length; i++)
    leds.colors.array[i] = leds.base[i] * base;
  leds.colors.needsUpdate = true;
  logo.mesh.position.x = 0;
  logo.mesh.position.y = 0;
  return { ...BOUNCE.start };
}

/**
 * Original procedural gaming setup in the main room (T4d). Lives outside the
 * cutaway groups, so it never fades. Screens and RGB are unlit vertex colors
 * scaled by the hour: no extra lights. Solid parts merge into one mesh per
 * material (T4g): laminate, powder coat, satin and matte plastics, keycaps,
 * cones and cloth with original procedural normals, and with `maps` the
 * mesh grilles and sci-fi PC panels. Grilles wait for their opacity map, so
 * the flat fallback never hides the cones. The seat is Bruno Simon's top
 * chair with his baked shader, and his Elgato, Google Home and Loupedeck
 * overlays sit on original bodies (T4k, BrunoProps.tsx).
 *
 * Effects ported from Bruno Simon's my-room-in-3d (T4i, with permission):
 * the seat sways on its column, the PC and keyboard LEDs breathe, steam rises
 * from an original mug and the site's initials bounce on the side screen.
 * The Google Home LEDs breathe and the Loupedeck buttons light up in turns.
 * Frames are requested continuously only while the camera is near the house
 * and motion is allowed; otherwise the setup rests (chair centred, LEDs at
 * the hour's glow, logo still, steam frozen, or hidden with reduced motion).
 */
export default function Setup({
  hours,
  maps,
  reducedMotion = false,
}: {
  hours: number;
  maps?: SurfaceMaps;
  reducedMotion?: boolean;
}) {
  const { invalidate } = useThree();
  const { group, glow, owned, swivel, leds, steam, logo, bruno } =
    useMemo(() => {
      const meshes = setupMeshes();
      const owned = { materials: [] as Material[], textures: [] as Texture[] };
      const screens = new MeshBasicMaterial({ vertexColors: true });
      const ledMaterial = new MeshBasicMaterial({ vertexColors: true });
      const glass = new MeshStandardMaterial({
        color: SETUP_COLORS.glass,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      });
      const mugMaterial = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.35,
        metalness: 0,
      });
      const steam = steamMaterial();
      const bruno = brunoMaterials();
      owned.materials.push(
        screens,
        ledMaterial,
        glass,
        mugMaterial,
        steam,
        bruno.elgato,
        ...bruno.leds,
        ...bruno.buttons,
      );
      const materials = new Map<SetupMaterialId, Material>();
      const material = (id: SetupMaterialId) => {
        let found = materials.get(id);
        if (!found) {
          found = setupMaterial(SETUP_MATERIALS[id], maps, owned);
          materials.set(id, found);
        }
        return found;
      };
      const setup = new Object3D() as Group;
      setup.name = "house-interior";
      const shown = meshes.solid.filter(
        (part) => maps || part.material !== "grille",
      );
      addSolids(
        setup,
        shown.filter((part) => part.rig !== "swivel"),
        material,
      );
      // The seat turns around the column: Bruno's top chair (BrunoChair) is
      // rendered into this pivot, on its axis.
      const swivel = new Object3D();
      swivel.position.set(CHAIR_PIVOT[0], 0, CHAIR_PIVOT[1]);
      addSolids(
        swivel,
        shown.filter((part) => part.rig === "swivel"),
        material,
      );
      for (const child of swivel.children)
        (child as Mesh).geometry.translate(-CHAIR_PIVOT[0], 0, -CHAIR_PIVOT[1]);
      const lit = new Mesh(
        mergeParts(
          meshes.glow.filter((part) => part.led === undefined),
          { roundSegments: SETUP_ROUND_SEGMENTS },
        ),
        screens,
      );
      const leds = ledMesh(
        meshes.glow.filter((part) => part.led !== undefined),
        ledMaterial,
      );
      const pane = new Mesh(mergeParts(meshes.glass), glass);
      pane.renderOrder = 1;
      const mug = new Mesh(mugGeometry(), mugMaterial);
      mug.name = "setup-mug";
      mug.position.set(...SETUP_PROPS.mug.center);
      mug.castShadow = true;
      mug.receiveShadow = true;
      const logo = logoMesh();
      owned.materials.push(logo.mesh.material);
      if (logo.mesh.material.map) owned.textures.push(logo.mesh.material.map);
      setup.add(swivel, lit, leds.mesh, pane, mug, logo.group);
      return {
        group: setup,
        glow: screens,
        owned,
        swivel,
        leds,
        steam,
        logo,
        bruno,
      };
    }, [maps]);

  const base = setupGlow(hours);
  const effects = useMemo(
    () => ({ swivel, leds, logo, bruno }),
    [swivel, leds, logo, bruno],
  );
  const motion = useRef({ active: false, bounce: { ...BOUNCE.start } });

  useLayoutEffect(() => {
    glow.color.setScalar(base);
    logo.mesh.material.color.setScalar(base);
    // ElgatoLight.js: his plain white panel, warm and dimmer by day.
    bruno.elgato.color.set(SETUP_COLORS.keyLight).multiplyScalar(base);
    motion.current.bounce = rest(effects, base);
    motion.current.active = false;
    invalidate();
  }, [base, reducedMotion, glow, logo, bruno, effects, invalidate]);

  useFrame((frame, delta) => {
    const active = setupAnimates({
      reducedMotion,
      distance: frame.camera.position.distanceTo(FOCUS),
    });
    if (!active) {
      if (motion.current.active) {
        motion.current.active = false;
        motion.current.bounce = rest(effects, base);
        frame.invalidate();
      }
      return;
    }
    motion.current.active = true;
    const t = frame.clock.elapsedTime * 1000;
    swivel.rotation.y = chairSway(t);
    const { colors, index, base: original } = leds;
    for (let v = 0; v < index.length; v++) {
      const level = ledLevel(t, index[v], base);
      for (let k = 0; k < 3; k++)
        colors.array[v * 3 + k] = original[v * 3 + k] * level;
    }
    colors.needsUpdate = true;
    brunoFrame(bruno, t, t);
    steam.uniforms.uTime.value = t;
    motion.current.bounce = bounceStep(
      motion.current.bounce,
      Math.min(delta * 1000, MAX_STEP),
    );
    logo.mesh.position.x = motion.current.bounce.x;
    logo.mesh.position.y = motion.current.bounce.y;
    frame.invalidate();
  });

  useEffect(
    () => () => {
      for (const material of owned.materials) material.dispose();
      for (const texture of owned.textures) texture.dispose();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
    },
    [group, owned],
  );

  return (
    <>
      <primitive object={group} />
      <Suspense fallback={null}>
        <CoffeeSteam material={steam} visible={!reducedMotion} />
      </Suspense>
      {createPortal(
        <Suspense fallback={null}>
          <BrunoChair hours={hours} />
        </Suspense>,
        swivel,
      )}
      <Suspense fallback={null}>
        <BrunoOverlayModel
          url={BRUNO_FILES.elgato}
          overlay={BRUNO_OVERLAYS.elgato}
          materials={[bruno.elgato]}
        />
        <GoogleHomeLeds
          overlay={BRUNO_OVERLAYS.googleHome}
          materials={bruno.leds}
        />
        <BrunoOverlayModel
          url={BRUNO_FILES.loupedeck}
          overlay={BRUNO_OVERLAYS.loupedeck}
          materials={bruno.buttons}
        />
      </Suspense>
    </>
  );
}
