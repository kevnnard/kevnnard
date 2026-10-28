import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  type DirectionalLight,
  type Group,
  type HemisphereLight,
  type Mesh,
  type MeshBasicMaterial,
  PMREMGenerator,
  type PointLight,
  type Points,
  type PointsMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  dayCycle,
  PRESETS,
  type RGB,
  shortestHourDelta,
  wrapHours,
} from "@/lib/room/day-cycle.ts";

// Indoor lamps at midday; the day cycle scales them up as it gets dark.
const ACCENTS: {
  position: [number, number, number];
  color: string;
  intensity: number;
  distance: number;
}[] = [
  { position: [1.5, 3.1, 0.6], color: "#ffc68a", intensity: 12, distance: 6 },
  { position: [-2, 2.5, -1.8], color: "#8fb8ee", intensity: 5, distance: 5 },
  { position: [2.5, 1.7, 0.5], color: "#90dfdc", intensity: 1.8, distance: 2 },
];

// Sky, stars and moon draw first without writing depth, so a distant plot is
// never hidden behind them; they only need to sit inside the camera `far`.
const SKY_RADIUS = 40;
const STAR_RADIUS = 35;
const MOON_DISTANCE = 30;
const STAR_COUNT = 220;
const SHADOW_MAP = 1024;

const setColor = (color: Color, [r, g, b]: RGB) =>
  color.setRGB(r, g, b, SRGBColorSpace);

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Vertical gradient (ground, horizon, zenith) plus a soft glow around a low sun.
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 glowColor;
  uniform vec3 sunDirection;
  uniform float glow;
  varying vec3 vWorldPosition;
  void main() {
    vec3 dir = normalize(vWorldPosition - cameraPosition);
    vec3 color = dir.y >= 0.0
      ? mix(horizon, zenith, pow(smoothstep(0.0, 1.0, dir.y), 0.6))
      : mix(horizon, ground, smoothstep(0.0, 0.25, -dir.y));
    float toSun = max(dot(dir, sunDirection), 0.0);
    color += glowColor * glow * (0.35 * pow(toSun, 8.0) + 0.6 * pow(toSun, 96.0));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

// Fixed pseudo-random stars above the horizon: no texture and no animation.
function starGeometry() {
  const positions = new Float32Array(STAR_COUNT * 3);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const y = 0.08 + random() * 0.92;
    const angle = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y);
    positions.set(
      [Math.cos(angle) * ring, y, Math.sin(angle) * ring].map(
        (v) => v * STAR_RADIUS,
      ),
      i * 3,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  return geometry;
}

/** Orthographic key-light shadow box around `center`. */
export interface ShadowBox {
  center: readonly [number, number, number];
  halfSize: number;
  /** Light distance from `center`; only the direction affects lighting. */
  distance: number;
  near: number;
  far: number;
}

// The original room-only shadow box.
const ROOM_SHADOW: ShadowBox = {
  center: [0, 0, 0],
  halfSize: 5,
  distance: 9,
  near: 0.5,
  far: 20,
};

interface RoomAtmosphereProps {
  /** Target hour of the day; non-finite values fall back to the day preset. */
  hours: number;
  reducedMotion: boolean;
  /** Keep stable (module-level) so the shadow camera is set up once. */
  shadow?: ShadowBox;
}

// Sky, sun/moon key light, fill, indoor accents, reflections and exposure all
// follow one `dayCycle` state. Time changes ease toward the new hour and only
// request frames while moving; with reduced motion they jump.
export function RoomAtmosphere({
  hours,
  reducedMotion,
  shadow = ROOM_SHADOW,
}: RoomAtmosphereProps) {
  const { gl, scene, invalidate } = useThree();
  const target = wrapHours(Number.isFinite(hours) ? hours : PRESETS.day);
  const shown = useRef(target);
  const goal = useRef(target);

  const sky = useRef<Group>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const key = useRef<DirectionalLight>(null);
  const accents = useRef<(PointLight | null)[]>([]);
  const stars = useRef<Points>(null);
  const moon = useRef<Mesh>(null);

  const uniforms = useMemo(
    () => ({
      zenith: { value: new Color() },
      horizon: { value: new Color() },
      ground: { value: new Color() },
      glowColor: { value: new Color().setRGB(1, 0.69, 0.44, SRGBColorSpace) },
      sunDirection: { value: new Vector3() },
      glow: { value: 0 },
    }),
    [],
  );
  const shadowCenter = useMemo(() => new Vector3(...shadow.center), [shadow]);
  const starPositions = useMemo(starGeometry, []);
  useEffect(() => () => starPositions.dispose(), [starPositions]);

  // A local, generated environment provides restrained material reflections.
  // It is computed once; the day cycle only changes its intensity.
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const environment = generator.fromScene(room, 0.04);
    const previous = scene.environment;
    scene.environment = environment.texture;
    invalidate();
    room.dispose();
    generator.dispose();
    return () => {
      scene.environment = previous;
      environment.dispose();
    };
  }, [gl, scene, invalidate]);

  // Restore what the cycle overrides on the shared renderer and scene.
  useLayoutEffect(() => {
    const exposure = gl.toneMappingExposure;
    const environmentIntensity = scene.environmentIntensity;
    return () => {
      gl.toneMappingExposure = exposure;
      scene.environmentIntensity = environmentIntensity;
    };
  }, [gl, scene]);

  const apply = useCallback(
    (hour: number) => {
      const state = dayCycle(hour);
      setColor(uniforms.zenith.value, state.sky.zenith);
      setColor(uniforms.horizon.value, state.sky.horizon);
      setColor(uniforms.ground.value, state.sky.ground);
      if (scene.fog) setColor(scene.fog.color, state.sky.horizon);
      uniforms.sunDirection.value.set(...state.sun.direction);
      uniforms.glow.value = state.sun.glow;

      if (key.current) {
        key.current.position
          .set(...state.key.position)
          .setLength(shadow.distance)
          .add(shadowCenter);
        setColor(key.current.color, state.key.color);
        key.current.intensity = state.key.intensity;
      }
      if (hemisphere.current) {
        setColor(hemisphere.current.color, state.ambient.sky);
        setColor(hemisphere.current.groundColor, state.ambient.ground);
        hemisphere.current.intensity = state.ambient.intensity;
      }
      accents.current.forEach((light, i) => {
        if (light) light.intensity = ACCENTS[i].intensity * state.accent;
      });
      if (stars.current) {
        const material = stars.current.material as PointsMaterial;
        material.opacity = 0.85 * state.stars;
        stars.current.visible = state.stars > 0.01;
      }
      if (moon.current) {
        const material = moon.current.material as MeshBasicMaterial;
        material.opacity = state.moon.opacity;
        moon.current.visible = state.moon.opacity > 0.01;
        moon.current.position
          .set(...state.moon.direction)
          .multiplyScalar(MOON_DISTANCE);
      }
      scene.environmentIntensity = state.environment;
      gl.toneMappingExposure = state.exposure;
    },
    [gl, scene, uniforms, shadow, shadowCenter],
  );

  // The light target is not in the scene graph, so update it by hand.
  useLayoutEffect(() => {
    const light = key.current;
    if (!light) return;
    light.target.position.copy(shadowCenter);
    light.target.updateMatrixWorld();
    light.shadow.camera.updateProjectionMatrix();
  }, [shadowCenter]);

  useLayoutEffect(() => {
    apply(shown.current);
  }, [apply]);

  useEffect(() => {
    goal.current = target;
    if (reducedMotion) {
      shown.current = target;
      apply(target);
    }
    invalidate();
  }, [target, reducedMotion, apply, invalidate]);

  useFrame((state, delta) => {
    sky.current?.position.copy(state.camera.position);
    const remaining = shortestHourDelta(shown.current, goal.current);
    if (remaining === 0) return;
    // Exponential approach that snaps once close, so frames stop requesting.
    if (Math.abs(remaining) < 0.01) shown.current = goal.current;
    else {
      const step = 1 - Math.exp(-Math.min(delta, 0.05) * 8);
      shown.current = wrapHours(shown.current + remaining * step);
    }
    apply(shown.current);
    state.invalidate();
  });

  return (
    <>
      <group ref={sky}>
        <mesh frustumCulled={false} renderOrder={-1}>
          <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={SKY_VERTEX}
            fragmentShader={SKY_FRAGMENT}
            side={BackSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <points ref={stars} geometry={starPositions} frustumCulled={false}>
          <pointsMaterial
            color="#dfe8ff"
            size={2}
            sizeAttenuation={false}
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </points>
        <mesh ref={moon}>
          <sphereGeometry args={[0.6, 16, 12]} />
          <meshBasicMaterial
            color="#e8eeff"
            transparent
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      <hemisphereLight ref={hemisphere} />
      <directionalLight
        ref={key}
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-shadow.halfSize}
        shadow-camera-right={shadow.halfSize}
        shadow-camera-top={shadow.halfSize}
        shadow-camera-bottom={-shadow.halfSize}
        shadow-camera-near={shadow.near}
        shadow-camera-far={shadow.far}
        // About two shadow texels, never below the room-only bias.
        shadow-normalBias={Math.max(0.035, (4 * shadow.halfSize) / SHADOW_MAP)}
        shadow-bias={-0.00015}
        shadow-radius={3}
      />
      {ACCENTS.map(({ position, color, distance }, i) => (
        <pointLight
          key={color}
          ref={(light) => {
            accents.current[i] = light;
          }}
          position={position}
          color={color}
          distance={distance}
          decay={2}
        />
      ))}
    </>
  );
}
