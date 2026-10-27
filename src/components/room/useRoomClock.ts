import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClockMode,
  type ClockState,
  clockHours,
  createClock,
  localHours,
  pauseClock,
  resumeClock,
  setClockHours,
  syncClock,
} from "@/lib/room/clock.ts";

export interface RoomClock {
  /** Simulated hour, refreshed once per second. */
  hours: number;
  mode: ClockMode;
  /** Wall-clock PC time of the last refresh. */
  pcTime: Date;
  /** True while reduced motion is holding the clock and the user has not acted. */
  heldByMotion: boolean;
  pause: () => void;
  resume: () => void;
  /** Manual input: holds the given hour until resume or sync. */
  setHours: (hours: number) => void;
  sync: () => void;
}

const sample = () => ({ at: performance.now(), wall: new Date() });

/**
 * The room's one shared clock. Owned by RoomApp so switching controller styles
 * never remounts or resets it. With reduced motion it starts held at the PC time
 * and only runs after an explicit resume.
 */
export function useRoomClock(reducedMotion: boolean): RoomClock {
  const [state, setState] = useState<ClockState>(() =>
    createClock(
      localHours(new Date()),
      performance.now(),
      reducedMotion ? "paused" : "auto",
    ),
  );
  const [tick, setTick] = useState(sample);
  const [heldByMotion, setHeldByMotion] = useState(reducedMotion);

  // Re-render once per second. Hours come from timestamps, so a throttled or
  // hidden tab catches up on its next callback; refresh as soon as it returns.
  useEffect(() => {
    const refresh = () => setTick(sample());
    const id = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Turning reduced motion on holds a running clock; turning it off never
  // starts one by surprise.
  const previousMotion = useRef(reducedMotion);
  useEffect(() => {
    if (previousMotion.current === reducedMotion) return;
    previousMotion.current = reducedMotion;
    if (!reducedMotion || state.mode !== "auto") return;
    const now = performance.now();
    setState((current) => pauseClock(current, now));
    setHeldByMotion(true);
    setTick(sample());
  }, [reducedMotion, state.mode]);

  const act = useCallback(
    (transition: (current: ClockState, now: number) => ClockState) => {
      const next = sample();
      setState((current) => transition(current, next.at));
      setHeldByMotion(false);
      setTick(next);
    },
    [],
  );
  const pause = useCallback(() => act(pauseClock), [act]);
  const resume = useCallback(() => act(resumeClock), [act]);
  const sync = useCallback(
    () =>
      act((current, now) => syncClock(current, localHours(new Date()), now)),
    [act],
  );
  const setHours = useCallback(
    (hours: number) => {
      if (Number.isFinite(hours))
        act((current) => setClockHours(current, hours));
    },
    [act],
  );

  return {
    hours: clockHours(state, tick.at),
    mode: state.mode,
    pcTime: tick.wall,
    heldByMotion,
    pause,
    resume,
    setHours,
    sync,
  };
}
