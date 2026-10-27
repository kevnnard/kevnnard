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

// The sky moves with the camera, so these only need to sit inside `far`.
const SKY_RADIUS = 40;
const STAR_RADIUS = 35;
const MOON_DISTANCE = 30;
const STAR_COUNT = 220;

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

interface RoomAtmosphereProps {
  /** Target hour of the day; non-finite values fall back to the day preset. */
  hours: number;
  reducedMotion: boolean;
}

// Sky, sun/moon key light, fill, indoor accents, reflections and exposure all
// follow one `dayCycle` state. Time changes ease toward the new hour and only
// request frames while moving; with reduced motion they jump.
export function RoomAtmosphere({ hours, reducedMotion }: RoomAtmosphereProps) {
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
      uniforms.sunDirection.value.set(...state.sun.direction);
      uniforms.glow.value = state.sun.glow;

      if (key.current) {
        key.current.position.set(...state.key.position);
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
    [gl, scene, uniforms],
  );

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
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-normalBias={0.035}
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
