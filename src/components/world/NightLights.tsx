import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Color,
  DoubleSide,
  type Group,
  LatheGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  SpotLight,
  type Texture,
  Vector2,
} from "three";
import { mergeParts } from "@/components/world/House";
import { setupMaterial } from "@/components/world/Setup";
import {
  LAMP,
  LIGHT_FIXTURES,
  LIGHT_IDS,
  type LightId,
  type LightSettings,
  lampParts,
  lightLevel,
} from "@/lib/world/lights.ts";
import { TV_PANEL } from "@/lib/world/living.ts";
import {
  MAIN_MONITOR,
  SETUP_MATERIALS,
  SETUP_ROUND_SEGMENTS,
  type SetupMaterialId,
  type SetupPart,
  setupOcclusion,
} from "@/lib/world/setup.ts";

const LAMPS = ["lampLeft", "lampRight"] as const;
/** Unlit LED strip color while its light is off. */
const STRIP_OFF = "#2a2930";
const BAR = 0.012;
const BAR_DEPTH = 0.006;

/** Four thin bars framing a `width` x `height` rectangle, facing `axis`. */
function frame(
  center: readonly [number, number, number],
  axis: "x" | "z",
  width: number,
  height: number,
): SetupPart[] {
  const [x, y, z] = center;
  const bar = (du: number, dy: number, su: number, sy: number): SetupPart => ({
    material: "satin",
    shape: "box",
    center: axis === "z" ? [x + du, y + dy, z] : [x, y + dy, z + du],
    size: axis === "z" ? [su, sy, BAR_DEPTH] : [BAR_DEPTH, sy, su],
    color: "#ffffff",
    shade: 1,
  });
  return [
    bar(0, height / 2, width + BAR, BAR),
    bar(0, -height / 2, width + BAR, BAR),
    bar(-width / 2, 0, BAR, height),
    bar(width / 2, 0, BAR, height),
  ];
}

/** Lathe outline of the bell shade, rim to crown (radius, height). */
function shadeGeometry() {
  const { y0, y1, bottom, top } = LAMP.shade;
  const points = [
    [bottom + 0.003, y0],
    [bottom, y0 + 0.008],
    [bottom - 0.006, y0 + 0.04],
    [top + 0.012, y1 - 0.03],
    [top, y1 - 0.008],
    [top - 0.012, y1],
    [0.009, y1],
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(points, 32);
}

interface Emitters {
  light: PointLight | SpotLight;
  /** Strip or bulb: unlit, tinted by the light. */
  glow: MeshBasicMaterial;
  /** Lamp shades: the fabric glows a little when lit. */
  shade?: MeshStandardMaterial;
  off: Color;
}

/**
 * Night lights (T6b, S17): a TV backlight, a setup backlight and two desk
 * lamps, each a non-shadow light with a finite range (wall-aimed spots for
 * the backlights, point bulbs in the lamp shades, S18) plus its emitter
 * (LED strip behind the TV panel or monitor, lamp bulb and shade). Always
 * mounted, so the shader light count never changes: by day or when disabled
 * a light's intensity drops to zero. Settings and the hour only repaint on
 * demand; nothing here animates.
 */
export default function NightLights({
  hours,
  lights,
}: {
  hours: number;
  lights: LightSettings;
}) {
  const { invalidate } = useThree();
  const { group, emitters, owned, geometries } = useMemo(() => {
    const group = new Object3D() as Group;
    group.name = "night-lights";
    const owned = { materials: [] as Material[], textures: [] as Texture[] };
    const geometries = [shadeGeometry(), new SphereGeometry(1, 20, 14)];
    const [shade, bulb] = geometries;

    // Lamp bodies in the setup's materials: one merged draw per material.
    const byMaterial = new Map<SetupMaterialId, SetupPart[]>();
    for (const part of LAMPS.flatMap(lampParts)) {
      const list = byMaterial.get(part.material);
      if (list) list.push(part);
      else byMaterial.set(part.material, [part]);
    }
    for (const [id, list] of byMaterial) {
      const body = new Mesh(
        mergeParts(list, {
          roundSegments: SETUP_ROUND_SEGMENTS,
          occlusion: setupOcclusion,
        }),
        setupMaterial(SETUP_MATERIALS[id], undefined, owned),
      );
      body.name = `lamp-${id}`;
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
    }

    const emitters = {} as Record<LightId, Emitters>;
    const fixtureLight = (id: LightId) => {
      const fixture = LIGHT_FIXTURES[id];
      let light: PointLight | SpotLight;
      if (fixture.kind === "spot") {
        const spot = new SpotLight(
          "#ffffff",
          0,
          fixture.distance,
          fixture.angle,
          fixture.penumbra,
          fixture.decay,
        );
        // In the group, so its world matrix follows the scene's updates.
        spot.target.position.set(...fixture.target);
        group.add(spot.target);
        light = spot;
      } else
        light = new PointLight("#ffffff", 0, fixture.distance, fixture.decay);
      light.name = `night-${id}`;
      light.castShadow = fixture.castShadow;
      light.position.set(...fixture.position);
      group.add(light);
      return light;
    };
    const strip = (id: LightId, parts: SetupPart[]) => {
      const glow = new MeshBasicMaterial({ color: STRIP_OFF });
      owned.materials.push(glow);
      const mesh = new Mesh(mergeParts(parts), glow);
      mesh.name = `night-${id}-strip`;
      group.add(mesh);
      emitters[id] = {
        light: fixtureLight(id),
        glow,
        off: new Color(STRIP_OFF),
      };
    };
    const [tx, ty] = TV_PANEL.center;
    strip(
      "tv",
      frame(
        [tx, ty, TV_PANEL.panelBack - BAR_DEPTH / 2],
        "z",
        TV_PANEL.width - 0.1,
        TV_PANEL.height - 0.08,
      ),
    );
    const [, my, mz] = MAIN_MONITOR.center;
    const back = MAIN_MONITOR.center[0] - MAIN_MONITOR.size[0] / 2;
    strip(
      "setup",
      frame(
        [back - BAR_DEPTH / 2, my, mz],
        "x",
        MAIN_MONITOR.size[2] - 0.1,
        MAIN_MONITOR.size[1] - 0.08,
      ),
    );

    for (const id of LAMPS) {
      const fixture = LIGHT_FIXTURES[id];
      const fabric = new MeshStandardMaterial({
        color: LAMP.colors.shade,
        roughness: 0.85,
        metalness: 0,
        side: DoubleSide,
      });
      const glow = new MeshBasicMaterial({ color: LAMP.colors.bulbOff });
      owned.materials.push(fabric, glow);
      const cover = new Mesh(shade, fabric);
      cover.name = `${id}-shade`;
      cover.position.set(...fixture.base);
      cover.castShadow = true;
      const lit = new Mesh(bulb, glow);
      lit.name = `${id}-bulb`;
      lit.position.set(...fixture.position);
      lit.scale.setScalar(LAMP.bulb.radius);
      group.add(cover, lit);
      emitters[id] = {
        light: fixtureLight(id),
        glow,
        shade: fabric,
        off: new Color(LAMP.colors.bulbOff),
      };
    }
    return { group, emitters, owned, geometries };
  }, []);

  useLayoutEffect(() => {
    const color = new Color();
    for (const id of LIGHT_IDS) {
      const setting = lights[id];
      const level = lightLevel(setting, hours);
      const { light, glow, shade, off } = emitters[id];
      color.set(setting.color);
      light.color.copy(color);
      light.intensity = LIGHT_FIXTURES[id].intensity * level;
      if (level > 0) glow.color.copy(color).multiplyScalar(0.6 + 0.8 * level);
      else glow.color.copy(off);
      if (shade) shade.emissive.copy(color).multiplyScalar(0.35 * level);
    }
    invalidate();
  }, [hours, lights, emitters, invalidate]);

  useEffect(
    () => () => {
      for (const material of owned.materials) material.dispose();
      for (const texture of owned.textures) texture.dispose();
      for (const geometry of geometries) geometry.dispose();
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh && !geometries.includes(mesh.geometry as never))
          mesh.geometry.dispose();
      });
    },
    [group, owned, geometries],
  );

  return <primitive object={group} />;
}
