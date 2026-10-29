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
  CHANNEL_FIXTURES,
  fixtureOutputs,
  LAMP,
  LIGHT_FIXTURES,
  LIGHT_IDS,
  LIGHTBAR_FIXTURE,
  type LightFixture,
  type LightId,
  type LightSettings,
  lampParts,
  lightLevel,
} from "@/lib/world/lights.ts";
import { TV_PANEL } from "@/lib/world/living.ts";
import {
  LIGHTBAR,
  MAIN_MONITOR,
  mainCurve,
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

/**
 * The setup backlight's strip on the back of the curved ultrawide: top and
 * bottom runs in short segments following the arc, and the two ends.
 */
function curvedFrame(): SetupPart[] {
  const { curve, size, center } = MAIN_MONITOR;
  const behind = -(size[0] / 2 + BAR_DEPTH / 2);
  const half = curve.halfAngle - 0.05 / curve.radius;
  const steps = 10;
  const step = (2 * half) / steps;
  const chord = 2 * curve.radius * Math.sin(step / 2) + 0.002;
  const top = center[1] + size[1] / 2 - 0.04;
  const bottom = center[1] - size[1] / 2 + 0.04;
  const bar = (
    theta: number,
    y: number,
    sy: number,
    su: number,
  ): SetupPart => ({
    material: "satin",
    shape: "box",
    center: mainCurve(theta, behind, y),
    size: [BAR_DEPTH, sy, su],
    rotation: [0, theta, 0],
    color: "#ffffff",
    shade: 1,
  });
  const parts: SetupPart[] = [];
  for (let i = 0; i < steps; i++) {
    const theta = -half + (i + 0.5) * step;
    parts.push(bar(theta, top, BAR, chord), bar(theta, bottom, BAR, chord));
  }
  for (const theta of [-half, half])
    parts.push(bar(theta, (top + bottom) / 2, top - bottom, BAR));
  return parts;
}

/** Lathe outline of the lamp's head shade, rim to crown (radius, height). */
function shadeGeometry() {
  const { y0, y1, bottom, top } = LAMP.shade;
  const points = [
    [bottom + 0.002, y0],
    [bottom, y0 + 0.006],
    [bottom * 0.8, y0 + 0.03],
    [top + 0.006, y1 - 0.006],
    [top, y1],
    [0.009, y1],
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(points, 32);
}

interface Emitters {
  /** The setup's light bar slit, fixed white. */
  slit?: { glow: MeshBasicMaterial; color: Color };
  /** Strip or bulb: unlit, tinted by the light. */
  glow: MeshBasicMaterial;
  /** Lamp shades: the fabric glows a little when lit. */
  shade?: MeshStandardMaterial;
  off: Color;
}

/**
 * Night lights (T6b, S17): a TV backlight, a setup backlight and two shelf
 * lamps (T12), each a non-shadow spot with a finite range (wall-aimed for
 * the backlights, S18; aimed down at the desk for the lamps) plus its
 * emitter (LED strip behind the TV panel or the curved monitor, lamp bulb and
 * shade). The setup channel also lights the white monitor light bar: its
 * slit and a neutral white downlight onto the keyboard and mouse. The TV and
 * setup channels each add a bounce fill out of their wall (T13). Every light
 * comes from `CHANNEL_FIXTURES` and takes `fixtureOutputs`. Always
 * mounted, so the shader light count never changes: by day or when disabled
 * a light's intensity drops to zero, as with the scene panel's master
 * `power` off. Settings, the master and the hour only repaint on demand;
 * nothing here animates.
 */
export default function NightLights({
  hours,
  lights,
  power = true,
}: {
  hours: number;
  lights: LightSettings;
  /** The scene panel's master switch (night only). */
  power?: boolean;
}) {
  const { invalidate } = useThree();
  const {
    group,
    emitters,
    lights: sceneLights,
    owned,
    geometries,
  } = useMemo(() => {
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
    const fixtureLight = (id: string, fixture: LightFixture) => {
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
      emitters[id] = { glow, off: new Color(STRIP_OFF) };
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
    strip("setup", curvedFrame());
    // The light bar's slit, under its housing, and its white downlight.
    const slit = new MeshBasicMaterial({ color: STRIP_OFF });
    owned.materials.push(slit);
    const slitMesh = new Mesh(
      mergeParts([
        {
          shape: "box",
          center: LIGHTBAR.slit.center,
          size: LIGHTBAR.slit.size,
          color: "#ffffff",
          shade: 1,
        },
      ]),
      slit,
    );
    slitMesh.name = "night-lightbar-slit";
    group.add(slitMesh);
    emitters.setup.slit = {
      glow: slit,
      color: new Color(LIGHTBAR_FIXTURE.color),
    };

    for (const id of LAMPS) {
      const fixture = LIGHT_FIXTURES[id];
      const fabric = new MeshStandardMaterial({
        color: LAMP.colors.shade,
        roughness: 0.5,
        metalness: 0.4,
        side: DoubleSide,
      });
      const glow = new MeshBasicMaterial({ color: LAMP.colors.bulbOff });
      owned.materials.push(fabric, glow);
      const cover = new Mesh(shade, fabric);
      cover.name = `${id}-shade`;
      cover.position.set(
        fixture.base[0] + LAMP.head.dx,
        fixture.base[1],
        fixture.base[2],
      );
      cover.castShadow = true;
      const lit = new Mesh(bulb, glow);
      lit.name = `${id}-bulb`;
      lit.position.set(...fixture.position);
      lit.scale.setScalar(LAMP.bulb.radius);
      group.add(cover, lit);
      emitters[id] = {
        glow,
        shade: fabric,
        off: new Color(LAMP.colors.bulbOff),
      };
    }
    // Every scene light, channel by channel, in CHANNEL_FIXTURES order.
    const lights = CHANNEL_FIXTURES.map(({ id, fixture }) =>
      fixtureLight(id, fixture),
    );
    return { group, emitters, lights, owned, geometries };
  }, []);

  useLayoutEffect(() => {
    fixtureOutputs(lights, hours, power).forEach((output, i) => {
      const light = sceneLights[i];
      light.color.set(output.color);
      light.intensity = output.intensity;
    });
    const color = new Color();
    for (const id of LIGHT_IDS) {
      const setting = lights[id];
      const level = lightLevel(setting, hours, power);
      const { glow, shade, off, slit } = emitters[id];
      color.set(setting.color);
      if (level > 0) glow.color.copy(color).multiplyScalar(0.6 + 0.8 * level);
      else glow.color.copy(off);
      if (shade) shade.emissive.copy(color).multiplyScalar(0.2 * level);
      if (slit) {
        if (level > 0)
          slit.glow.color.copy(slit.color).multiplyScalar(0.7 + 0.5 * level);
        else slit.glow.color.copy(off);
      }
    }
    invalidate();
  }, [hours, lights, power, emitters, sceneLights, invalidate]);

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
