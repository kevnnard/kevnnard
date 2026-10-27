import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  formatHours,
  PRESETS,
  type Preset,
  phaseAt,
  wrapHours,
} from "@/lib/room/day-cycle.ts";
import { cn } from "@/lib/utils";
import type { RoomClock } from "./useRoomClock";

const STEP = 0.25;
// Wheel pixels per STEP: one mouse notch (~100px) moves about half an hour,
// and small trackpad deltas accumulate instead of being dropped.
const WHEEL_PIXELS = 50;
export const PRESET_LABELS: Record<Preset, string> = {
  day: "Day",
  sunset: "Sunset",
  night: "Night",
};
export const PRESET_KEYS = Object.keys(PRESETS) as Preset[];
export const RATE_TEXT = "60× · 1 s = 1 min · full day in 24 min";

/** Props shared by the three controller styles. */
export interface ControllerProps {
  clock: RoomClock;
  /** The style switcher, placed by each style in its header. */
  settings: ReactNode;
  narrow: boolean;
}

export const pad = (value: number) => String(value).padStart(2, "0");
export const formatPcTime = (date: Date) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
export const MODE_LABELS = { auto: "Auto", paused: "Paused", manual: "Manual" };

/** Live status line; `resume` names the control that restarts the clock. */
export function statusText(clock: RoomClock, resume = "Resume") {
  if (clock.heldByMotion)
    return `Paused because reduced motion is on. Press ${resume} to run the 60× cycle.`;
  if (clock.mode === "auto")
    return "Auto: one real second is one simulated minute.";
  if (clock.mode === "manual")
    return `Manual: auto is paused so it does not fight your change. Press ${resume} to continue from here.`;
  return `Paused. Press ${resume} to continue from this time.`;
}

// Hand angle in degrees, clockwise from the top: noon up, midnight down.
const angleOf = (hours: number) => ((hours - 12) / 24) * 360;
const pointAt = (hours: number, radius: number) => {
  const angle = (angleOf(hours) * Math.PI) / 180;
  return [Math.sin(angle) * radius, -Math.cos(angle) * radius] as const;
};
const arc = (from: number, to: number, radius: number) => {
  const [x1, y1] = pointAt(from, radius);
  const [x2, y2] = pointAt(to, radius);
  const large = wrapHours(to - from) > 12 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
};
// Same bounds as phaseAt in day-cycle.ts.
const PHASE_ARCS = [
  { from: 5, to: 7, opacity: 0.2 },
  { from: 7, to: 16.5, opacity: 0.4 },
  { from: 16.5, to: 19.5, opacity: 0.2 },
];

/**
 * Wheel over `ref` changes the time by STEP per notch. React's onWheel is
 * passive, so it cannot stop the page or the room camera from also reacting;
 * bind a native listener scoped to the control instead.
 */
export function useWheelHours(
  ref: RefObject<HTMLElement | null>,
  hours: number,
  onChange: (hours: number) => void,
) {
  // Latest values for the native listener without re-binding it.
  const latest = useRef({ hours, onChange });
  useEffect(() => {
    latest.current = { hours, onChange };
  }, [hours, onChange]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let pending = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const scale =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? 400
            : 1;
      pending += event.deltaY * scale;
      const steps = Math.trunc(pending / WHEEL_PIXELS);
      if (steps === 0) return;
      pending -= steps * WHEEL_PIXELS;
      const next = wrapHours(latest.current.hours + steps * STEP);
      latest.current.hours = next;
      latest.current.onChange(next);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [ref]);
}

export const buttonClass =
  "inline-flex h-8 items-center justify-center rounded-md border border-zinc-800 bg-zinc-800/30 px-3 text-xs font-medium text-zinc-50 hover:bg-zinc-800/50 aria-pressed:border-emerald-500 aria-pressed:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-zinc-300/50";
export const primaryButtonClass =
  "inline-flex h-8 min-w-24 items-center justify-center rounded-md bg-zinc-50 px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-zinc-300/50";
export const labelClass = "text-xs uppercase tracking-widest text-emerald-500";

/** Mode badge with the emerald dot while auto runs. */
export function ModeBadge({ mode }: { mode: RoomClock["mode"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-0.5 text-xs font-medium">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          mode === "auto" ? "bg-emerald-500" : "bg-zinc-400",
        )}
      />
      {MODE_LABELS[mode]}
    </span>
  );
}

/**
 * Orbital clock style: a large 24-hour dial (noon at the top) with phase arcs.
 * The native range input is the accessible path (arrows, Home/End,
 * PageUp/PageDown); the dial adds wheel and drag. Manual input holds auto.
 */
export function TimeDial({ clock, settings, narrow }: ControllerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const inputId = useId();
  const { hours, setHours } = clock;
  const phase = phaseAt(hours);
  const time = formatHours(hours);
  useWheelHours(rootRef, hours, setHours);

  const setFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    if (x === 0 && y === 0) return;
    const turn = Math.atan2(x, -y) / (Math.PI * 2);
    setHours(wrapHours(12 + Math.round(turn * 24 * 60) / 60));
  };

  const [knobX, knobY] = pointAt(hours, 44);
  const [handX, handY] = pointAt(hours, 36);
  const running = clock.mode === "auto";

  return (
    <section
      ref={rootRef}
      aria-label="Time of day"
      className={cn(
        "absolute flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 text-zinc-50 backdrop-blur",
        narrow ? "inset-x-3 bottom-3" : "bottom-4 left-4 w-72",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className={labelClass}>Time of day</h2>
        <div className="flex items-center gap-2">
          <ModeBadge mode={clock.mode} />
          {settings}
        </div>
      </div>

      <div className={cn("flex gap-3", narrow ? "items-center" : "flex-col")}>
        <div
          className={cn(
            "relative shrink-0 self-center",
            narrow ? "size-28" : "size-44",
          )}
        >
          <svg
            viewBox="-50 -50 100 100"
            aria-hidden
            className="size-full cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setFromPointer(event);
            }}
          >
            <circle r={44} fill="none" stroke="#27272a" strokeWidth={5} />
            {PHASE_ARCS.map(({ from, to, opacity }) => (
              <path
                key={from}
                d={arc(from, to, 44)}
                fill="none"
                stroke="#10b981"
                strokeOpacity={opacity}
                strokeWidth={5}
              />
            ))}
            {Array.from({ length: 24 }, (_, tick) => {
              const [x1, y1] = pointAt(tick, 39);
              const [x2, y2] = pointAt(tick, tick % 6 ? 37.5 : 35);
              return (
                <line
                  key={tick}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#a1a1aa"
                  strokeWidth={0.6}
                />
              );
            })}
            {[0, 6, 12, 18].map((tick) => {
              const [x, y] = pointAt(tick, 29);
              return (
                <text
                  key={tick}
                  x={x}
                  y={y + 2.5}
                  textAnchor="middle"
                  fontSize={6.5}
                  fill="#a1a1aa"
                  className="font-mono"
                >
                  {pad(tick)}
                </text>
              );
            })}
            <line
              x1={0}
              y1={0}
              x2={handX}
              y2={handY}
              stroke="#fafafa"
              strokeOpacity={0.5}
              strokeWidth={0.8}
              strokeLinecap="round"
            />
            <circle
              cx={knobX}
              cy={knobY}
              r={4.5}
              fill="#10b981"
              stroke="#09090b"
              strokeWidth={1.2}
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase tracking-widest text-zinc-400">
              Simulated
            </span>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                narrow ? "text-xl" : "text-3xl",
              )}
            >
              {time}
            </span>
            <span className="text-xs font-medium capitalize text-emerald-500">
              {phase}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-zinc-800 px-2.5 py-1.5">
              <dt className="text-zinc-400">Simulated</dt>
              <dd className="font-mono tabular-nums">{time}</dd>
            </div>
            <div className="rounded-md border border-zinc-800 px-2.5 py-1.5">
              <dt className="text-zinc-400">Your PC time</dt>
              <dd className="font-mono tabular-nums">
                {formatPcTime(clock.pcTime)}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={running ? clock.pause : clock.resume}
              className={primaryButtonClass}
            >
              {running ? "Pause" : "Resume"}
            </button>
            <button type="button" onClick={clock.sync} className={buttonClass}>
              Sync to PC time
            </button>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Time presets" className="flex gap-2">
        {PRESET_KEYS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={phase === preset}
            onClick={() => setHours(PRESETS[preset])}
            className={buttonClass}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="flex justify-between text-xs text-zinc-400"
        >
          <span>Set time manually</span>
          {!narrow && <span>Scroll or drag the dial</span>}
        </label>
        <input
          id={inputId}
          type="range"
          min={0}
          max={24}
          step={STEP}
          value={hours}
          aria-valuetext={`${time}, ${phase}`}
          onChange={(event) => setHours(Number(event.currentTarget.value))}
          className="w-full accent-emerald-500"
        />
      </div>
      {!narrow && <p className="text-xs text-zinc-400">{RATE_TEXT}</p>}
      <p role="status" aria-live="polite" className="text-xs text-zinc-400">
        {statusText(clock)}
      </p>
    </section>
  );
}
