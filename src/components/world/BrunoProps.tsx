import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  Color,
  LinearSRGBColorSpace,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  NoColorSpace,
  Object3D,
  ShaderMaterial,
  type Texture,
  TextureLoader,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { extendLoader } from "@/components/world/SetupEffects";
import { worldLight } from "@/lib/world/palette.ts";
import {
  BRUNO_CHAIR,
  BRUNO_FILES,
  BRUNO_MAPS,
  BRUNO_SCALE,
  type BrunoOverlay,
  SETUP_COLORS,
} from "@/lib/world/setup.ts";

// Bruno Simon's my-room-in-3d at 5d00b3f8 (T4k), used with the author's
// permission and credited in public/world/credits.json: his top chair with
// the baked shader (Baked.js, shaders/baked), and his Elgato light, Google
// Home LED and Loupedeck button meshes on original bodies (setup.ts).

/** shaders/baked/vertex.glsl */
const BAKED_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectionPosition = projectionMatrix * viewPosition;
    gl_Position = projectionPosition;

    vUv = uv;
  }
`;

/**
 * shaders/baked/fragment.glsl, with glslify's glsl-blend/lighten inlined.
 * Like his, it mixes the raw sRGB texels and writes them out unconverted.
 */
const BAKED_FRAGMENT = /* glsl */ `
  uniform sampler2D uBakedDayTexture;
  uniform sampler2D uBakedNightTexture;
  uniform sampler2D uBakedNeutralTexture;
  uniform sampler2D uLightMapTexture;

  uniform float uNightMix;
  uniform float uNeutralMix;

  uniform vec3 uLightTvColor;
  uniform float uLightTvStrength;

  uniform vec3 uLightDeskColor;
  uniform float uLightDeskStrength;

  uniform vec3 uLightPcColor;
  uniform float uLightPcStrength;

uniform vec3 uTint;
uniform float uRegrade;
uniform float uShade;

  varying vec2 vUv;

  vec3 blend(vec3 base, vec3 color, float opacity) {
    return max(color, base) * opacity + base * (1.0 - opacity);
  }

  void main() {
    vec3 bakedDayColor = texture2D(uBakedDayTexture, vUv).rgb;
    vec3 bakedNightColor = texture2D(uBakedNightTexture, vUv).rgb;
    vec3 bakedNeutralColor = texture2D(uBakedNeutralTexture, vUv).rgb;
    vec3 bakedColor = mix(mix(bakedDayColor, bakedNightColor, uNightMix), bakedNeutralColor, uNeutralMix);
    vec3 lightMapColor = texture2D(uLightMapTexture, vUv).rgb;

    float lightTvStrength = lightMapColor.r * uLightTvStrength;
    bakedColor = blend(bakedColor, uLightTvColor, lightTvStrength);

    float lightPcStrength = lightMapColor.b * uLightPcStrength;
    bakedColor = blend(bakedColor, uLightPcColor, lightPcStrength);

    float lightDeskStrength = lightMapColor.g * uLightDeskStrength;
    bakedColor = blend(bakedColor, uLightDeskColor, lightDeskStrength);

    // Our regrade: his bake carries his room's warm orange light. Keep its
    // shading (luminance) but recolor toward our chair tint, and follow our
    // scene brightness so the chair sits in the same light as the room.
    float luma = dot(bakedColor, vec3(0.299, 0.587, 0.114));
    bakedColor = mix(bakedColor, uTint * luma * 1.6, uRegrade) * uShade;

    gl_FragColor = vec4(bakedColor, 1.0);
  }
`;

/** His colors, as raw sRGB like his texels. */
const raw = (hex: string) => new Color().setStyle(hex, LinearSRGBColorSpace);

/** Baked.js strengths: the TV and desk lamp light the chair only at night. */
const STRENGTH = { tv: 1.47, desk: 1.9, pc: 1.4 } as const;
/** Charcoal leather, so his warm bake reads like our black gaming chair. */
const CHAIR_TINT = "#55595f";
/** Share of his bake's color replaced by our tint (his shading stays). */
const REGRADE = 0.8;
/** A little of his neutral bake softens the day/night contrast. */
const NEUTRAL_MIX = 0.12;

/** Baked.js material; the PC channel takes our setup's RGB color. */
function bakedMaterial([day, night, neutral, lightMap]: Texture[]) {
  return new ShaderMaterial({
    uniforms: {
      uBakedDayTexture: { value: day },
      uBakedNightTexture: { value: night },
      uBakedNeutralTexture: { value: neutral },
      uLightMapTexture: { value: lightMap },
      uNightMix: { value: 1 },
      uNeutralMix: { value: NEUTRAL_MIX },
      uLightTvColor: { value: raw("#ff115e") },
      uLightTvStrength: { value: STRENGTH.tv },
      uLightDeskColor: { value: raw("#ff6700") },
      uLightDeskStrength: { value: STRENGTH.desk },
      uLightPcColor: { value: raw(SETUP_COLORS.rgb) },
      uLightPcStrength: { value: STRENGTH.pc },
      uTint: { value: raw(CHAIR_TINT) },
      uRegrade: { value: REGRADE },
      uShade: { value: 1 },
    },
    vertexShader: BAKED_VERTEX,
    fragmentShader: BAKED_FRAGMENT,
  });
}

/** Day/night mix from our clock: his night bake as the stars come out. */
function setHours(material: ShaderMaterial, hours: number) {
  const night = worldLight(hours).stars;
  const { uniforms } = material;
  uniforms.uNightMix.value = night;
  uniforms.uLightTvStrength.value = STRENGTH.tv * night * 0.5;
  uniforms.uLightDeskStrength.value = STRENGTH.desk * night * 0.5;
  uniforms.uLightPcStrength.value = STRENGTH.pc * (0.4 + 0.6 * night);
  // His bake is brighter than our daylight interior: dim it by day.
  uniforms.uShade.value = 0.8 + 0.2 * night;
}

/**
 * TopChair.js: his chair, his pivot on our column. Rendered inside the
 * setup's swivel, which sways it (motion.ts chairSway).
 */
export function BrunoChair({ hours }: { hours: number }) {
  const { invalidate } = useThree();
  const gltf = useLoader(GLTFLoader, BRUNO_FILES.chair, extendLoader);
  const maps = useLoader(TextureLoader, [
    BRUNO_MAPS.day,
    BRUNO_MAPS.night,
    BRUNO_MAPS.neutral,
    BRUNO_MAPS.lightMap,
  ]);
  const { group, material } = useMemo(() => {
    for (const map of maps) {
      map.flipY = false;
      map.colorSpace = NoColorSpace;
      map.anisotropy = 4;
      map.needsUpdate = true;
    }
    const material = bakedMaterial(maps);
    const scene = gltf.scene.clone(true);
    // His pivot node (Empty.012) is what TopChair.js turns.
    scene.children[0]?.position.set(0, 0, 0);
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.castShadow = true;
    });
    const group = new Object3D();
    group.name = "bruno-chair";
    group.position.set(0, BRUNO_CHAIR.y, 0);
    group.rotation.y = BRUNO_CHAIR.yaw;
    group.scale.setScalar(BRUNO_SCALE);
    group.add(scene);
    return { group, material };
  }, [gltf, maps]);

  useLayoutEffect(() => {
    setHours(material, hours);
    invalidate();
  }, [material, hours, invalidate]);
  useEffect(() => () => material.dispose(), [material]);

  return <primitive object={group} />;
}

/**
 * One of his overlay models on its original body: his meshes sorted by name,
 * as his classes sort them, each taking `materials[index]`.
 */
export function BrunoOverlayModel({
  url,
  overlay,
  materials,
}: {
  url: string;
  overlay: BrunoOverlay;
  materials: readonly Material[];
}) {
  const gltf = useLoader(GLTFLoader, url, extendLoader);
  const group = useMemo(() => {
    const group = new Object3D();
    group.position.set(...overlay.to);
    group.rotation.y = overlay.yaw;
    group.scale.setScalar(BRUNO_SCALE);
    const scene = gltf.scene.clone(true);
    scene.position.set(-overlay.from[0], -overlay.from[1], -overlay.from[2]);
    group.add(scene);
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) meshes.push(object as Mesh);
    });
    meshes.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const [index, mesh] of meshes.entries()) {
      mesh.material = materials[Math.min(index, materials.length - 1)];
      mesh.renderOrder = 2;
    }
    return group;
  }, [gltf, overlay, materials]);
  return <primitive object={group} />;
}

/** GoogleLeds.js: his LEDs, alpha-masked by his googleHomeLedMask. */
export function GoogleHomeLeds({
  overlay,
  materials,
}: {
  overlay: BrunoOverlay;
  materials: readonly MeshBasicMaterial[];
}) {
  const mask = useLoader(TextureLoader, BRUNO_MAPS.ledMask);
  useLayoutEffect(() => {
    for (const material of materials) {
      material.alphaMap = mask;
      material.needsUpdate = true;
    }
  }, [mask, materials]);
  return (
    <BrunoOverlayModel
      url={BRUNO_FILES.googleHome}
      overlay={overlay}
      materials={materials}
    />
  );
}
