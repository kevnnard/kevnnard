// The desk mug's turntable while its close-up is open (coffee-card T2): like
// a display case's (display-cases.ts DISPLAY_TURN), one steady turn per 20 s
// about the mug's own vertical axis, eased in on arrival, and a lift of about
// a centimetre off the coaster. Leaving, it eases back to its rest angle
// (the nearer front) and height without a jump, then rests. Reduced motion:
// it never turns or lifts. Pure numbers; CoffeeMug.tsx samples them.

export const MUG_TURN = {
  /** Seconds per full turn once up to speed (as DISPLAY_TURN.period). */
  period: 20,
  /** Seconds from still to full speed on arrival. */
  spinUp: 2,
  /** Metres the mug rises off its coaster while turning. */
  lift: 0.01,
  /** Seconds to rise, and to sink back. */
  liftTime: 1.2,
  /** Stiffness (1/s) of the critically damped return to the rest angle. */
  settle: 3,
} as const;

/** The turntable's state: yaw (radians, [0, 2pi)), its rate and ramps. */
export interface MugTurn {
  yaw: number;
  /** Radians per second. */
  speed: number;
  /** Arrival ramp, 0-1: the share of `spinUp` done. */
  spin: number;
  /** Lift ramp, 0-1: the share of `liftTime` done. */
  rise: number;
}

export const MUG_REST: MugTurn = { yaw: 0, speed: 0, spin: 0, rise: 0 };

const FULL_TURN = 2 * Math.PI;
const FULL_SPEED = FULL_TURN / MUG_TURN.period;
/** Smoothstep: a slow start and a slow landing. */
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * The next state after `dt` seconds: turning and rising while `turning`,
 * otherwise springing back to the nearer front (0 or a full turn, critically
 * damped from the current speed, so there is no jump) and sinking, then
 * exactly `MUG_REST`. Reduced motion is always at rest.
 */
export function mugTurnStep(
  state: MugTurn,
  dt: number,
  turning: boolean,
  reducedMotion: boolean,
): MugTurn {
  if (reducedMotion) return MUG_REST;
  if (turning) {
    const spin = Math.min(1, state.spin + dt / MUG_TURN.spinUp);
    const speed = FULL_SPEED * ease(spin);
    return {
      yaw: (state.yaw + speed * dt) % FULL_TURN,
      speed,
      spin,
      rise: Math.min(1, state.rise + dt / MUG_TURN.liftTime),
    };
  }
  const front = state.yaw > Math.PI ? FULL_TURN : 0;
  const k = MUG_TURN.settle;
  const x0 = state.yaw - front;
  const c = state.speed + k * x0;
  const decay = Math.exp(-k * dt);
  const x = (x0 + c * dt) * decay;
  const speed = (state.speed - k * c * dt) * decay;
  const rise = Math.max(0, state.rise - dt / MUG_TURN.liftTime);
  if (Math.abs(x) < 1e-3 && Math.abs(speed) < 1e-2 && rise === 0)
    return MUG_REST;
  return { yaw: (front + x + FULL_TURN) % FULL_TURN, speed, spin: 0, rise };
}

/** The mug's turn (radians) and lift (metres) over its rest pose. */
export function mugPose(state: MugTurn): { yaw: number; lift: number } {
  return { yaw: state.yaw, lift: MUG_TURN.lift * ease(state.rise) };
}

/** True once the mug is back on its coaster at its rest angle. */
export function mugAtRest(state: MugTurn): boolean {
  return state.yaw === 0 && state.speed === 0 && state.rise === 0;
}
