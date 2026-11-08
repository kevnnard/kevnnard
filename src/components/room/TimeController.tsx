import { useEffect, useId, useRef, useState } from "react";
import { localHours } from "@/lib/room/clock.ts";
import type { ControllerStyle } from "@/lib/room/controller-style.ts";
import {
  formatHours,
  type Phase,
  PRESETS,
  phaseAt,
  wrapHours,
} from "@/lib/room/day-cycle.ts";
import { cn } from "@/lib/utils";
import { ControllerSettings } from "./ControllerSettings";
import {
  buttonClass,
  type ControllerProps,
  formatPcTime,
  labelClass,
  MODE_LABELS,
  ModeBadge,
  PRESET_KEYS,
  PRESET_LABELS,
  pad,
  primaryButtonClass,
  RATE_TEXT,
  statusText,
  TimeDial,
  useWheelHours,
} from "./TimeDial";
import type { RoomClock } from "./useRoomClock";

const DAY_MINUTES = 24 * 60;
const toMinutes = (hours: number) => Math.floor(wrapHours(hours) * 60);

/** "2 h 05 min ahead of PC", the short way around the clock. */
function offsetText(hours: number, pc: number) {
  let diff = Math.round(wrapHours(hours - pc) * 60);
  if (diff > DAY_MINUTES / 2) diff -= DAY_MINUTES;
  if (diff === 0) return "in step with PC";
  const abs = Math.abs(diff);
  return `${Math.floor(abs / 60)} h ${pad(abs % 60)} min ${diff > 0 ? "ahead of" : "behind"} PC`;
}

/** Minute range shared by Compact and Timeline. */
function MinuteRange({
  clock,
  id,
  className,
}: {
  clock: RoomClock;
  id: string;
  className?: string;
}) {
  const time = formatHours(clock.hours);
  return (
    <input
      id={id}
      type="range"
      min={0}
      max={DAY_MINUTES - 1}
      step={1}
      value={toMinutes(clock.hours)}
      aria-valuetext={`${time}, ${phaseAt(clock.hours)}`}
      onChange={(event) =>
        clock.setHours(Number(event.currentTarget.value) / 60)
      }
      className={cn("w-full accent-emerald-500", className)}
    />
  );
}

/**
 * Phone stack disclosure (mobile-hud S1): the app folds this console while
 * the Scene panel is open and hears when it opens or closes.
 */
interface Disclosure {
  folded?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Compact console: a corner instrument that collapses to a one-line pill. */
function CompactConsole({
  clock,
  settings,
  narrow,
  folded,
  onOpenChange,
}: ControllerProps & Disclosure) {
  const rootRef = useRef<HTMLElement>(null);
  const rangeId = useId();
  const modeName = useId();
  // Starts collapsed on small screens so the room keeps the view.
  const [open, setOpen] = useState(!narrow);
  useEffect(() => {
    if (folded) setOpen(false);
  }, [folded]);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  useWheelHours(rootRef, clock.hours, clock.setHours);
  const time = formatHours(clock.hours);
  const phase = phaseAt(clock.hours);
  const progress = Math.floor((wrapHours(clock.hours) / 24) * 100);

  const chooseMode = (mode: RoomClock["mode"]) => {
    if (mode === "auto") clock.resume();
    else if (mode === "paused") clock.pause();
    else clock.setHours(clock.hours);
  };

  return (
    <section
      ref={rootRef}
      aria-label="Time of day"
      className={cn(
        "tc-compact",
        "absolute rounded-xl border border-zinc-800 bg-zinc-950/90 font-mono text-xs text-zinc-50 backdrop-blur",
        narrow ? "inset-x-3 bottom-3" : "bottom-4 left-4 w-[21rem]",
      )}
    >
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl py-3 pr-12 pl-4 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              clock.mode === "auto" ? "bg-emerald-500" : "bg-zinc-400",
            )}
          />
          <span className="text-base font-semibold">{time}</span>
          <span className="uppercase tracking-widest text-emerald-500">
            {phase}
          </span>
          <span className="ml-auto uppercase tracking-widest text-zinc-400">
            {MODE_LABELS[clock.mode]}
          </span>
          <span
            aria-hidden
            className={cn("text-zinc-400", open && "rotate-180")}
          >
            ▾
          </span>
        </summary>
        <div className="tc-body grid gap-3.5 border-t border-zinc-800 px-4 pt-3 pb-4">
          <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1.5 tabular-nums">
            <dt className="uppercase tracking-widest text-zinc-400">Sim</dt>
            <dd>
              {time} <span className="text-emerald-500">{phase}</span>
            </dd>
            <dt className="uppercase tracking-widest text-zinc-400">PC</dt>
            <dd>{formatPcTime(clock.pcTime)}</dd>
            <dt className="uppercase tracking-widest text-zinc-400">Offset</dt>
            <dd>{offsetText(clock.hours, localHours(clock.pcTime))}</dd>
            <dt className="uppercase tracking-widest text-zinc-400">Rate</dt>
            <dd>60× · 1 s = 1 min</dd>
            <dt className="uppercase tracking-widest text-zinc-400">Day</dt>
            <dd>
              {progress}% of the simulated day
              <div
                aria-hidden
                className="mt-1.5 h-1 overflow-hidden rounded-sm bg-zinc-800"
              >
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </dd>
          </dl>

          <fieldset>
            <legend className="mb-1.5 uppercase tracking-widest text-zinc-400">
              Mode
            </legend>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-zinc-800 font-sans font-medium">
              {(["auto", "paused", "manual"] as const).map((mode) => (
                <label
                  key={mode}
                  className="relative cursor-pointer py-2 text-center not-first:border-l not-first:border-zinc-800 has-checked:bg-emerald-500/30 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-zinc-300"
                >
                  <input
                    type="radio"
                    name={modeName}
                    value={mode}
                    checked={clock.mode === mode}
                    onChange={() => chooseMode(mode)}
                    className="absolute inset-0 m-0 cursor-pointer opacity-0"
                  />
                  {mode === "paused" ? "Pause" : MODE_LABELS[mode]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <label htmlFor={rangeId} className="text-zinc-400">
              Set time
            </label>
            <MinuteRange clock={clock} id={rangeId} />
          </div>

          <div
            role="group"
            aria-label="Time presets"
            className="flex flex-wrap gap-1.5"
          >
            {PRESET_KEYS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={phase === preset}
                onClick={() => clock.setHours(PRESETS[preset])}
                className={buttonClass}
              >
                {PRESET_LABELS[preset]}
              </button>
            ))}
            <button
              type="button"
              onClick={clock.sync}
              className={cn(buttonClass, "ml-auto")}
            >
              Sync to PC
            </button>
          </div>
          <p
            role="status"
            aria-live="polite"
            className="font-sans text-zinc-400"
          >
            {statusText(clock, "Auto")}
          </p>
        </div>
      </details>
      {/* Outside the summary, so it stays reachable while collapsed. */}
      <div className="tc-settings absolute top-2 right-2">{settings}</div>
    </section>
  );
}

// Same bounds as phaseAt in day-cycle.ts, in timeline order.
const BANDS: { phase: Phase; from: number; to: number }[] = [
  { phase: "night", from: 0, to: 5 },
  { phase: "dawn", from: 5, to: 7 },
  { phase: "day", from: 7, to: 16.5 },
  { phase: "sunset", from: 16.5, to: 19.5 },
  { phase: "night", from: 19.5, to: 24 },
];
const BAND_CLASS: Record<Phase, string> = {
  night: "bg-zinc-800 text-zinc-400",
  dawn: "bg-emerald-500/20 text-zinc-50",
  day: "bg-emerald-500/40 text-zinc-50",
  sunset: "bg-emerald-500/20 text-zinc-50",
};

/** "Sunset in 2 h 10 min" in simulated time. */
function nextPhaseText(hours: number) {
  const h = wrapHours(hours);
  const next = BANDS.find(({ from }) => from > h) ?? BANDS[1];
  const minutes = Math.round(wrapHours(next.from - h) * 60);
  const label = next.phase[0].toUpperCase() + next.phase.slice(1);
  return `${label} in ${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
}

/** Timeline dock: a bottom strip with phase bands, playhead and PC marker. */
function TimelineDock({ clock, settings, narrow }: ControllerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const rangeId = useId();
  useWheelHours(rootRef, clock.hours, clock.setHours);
  const time = formatHours(clock.hours);
  const phase = phaseAt(clock.hours);
  const at = (hours: number) => `${(wrapHours(hours) / 24) * 100}%`;
  const running = clock.mode === "auto";

  return (
    <section
      ref={rootRef}
      aria-label="Time of day"
      className={cn(
        "absolute grid items-center rounded-xl border border-zinc-800 bg-zinc-950/90 text-zinc-50 backdrop-blur",
        narrow
          ? "inset-x-3 bottom-3 gap-3 p-3"
          : "inset-x-4 bottom-4 grid-cols-[11rem_1fr_19rem] gap-8 px-6 py-4",
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className={labelClass}>Time of day</h2>
          <p
            className={cn(
              "font-mono font-semibold tabular-nums",
              narrow ? "text-2xl" : "text-4xl",
            )}
          >
            {time}
          </p>
          <p className="flex gap-3 text-xs text-zinc-400">
            <span>Simulated</span>
            <strong className="font-medium capitalize text-emerald-500">
              {phase}
            </strong>
          </p>
          <p className="mt-1 flex gap-3 text-xs text-zinc-400">
            <span>Your PC time</span>
            <span className="font-mono tabular-nums text-zinc-50">
              {formatPcTime(clock.pcTime)}
            </span>
          </p>
        </div>
        {narrow && settings}
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex justify-between text-xs text-zinc-400">
          <label htmlFor={rangeId} className="font-medium text-zinc-50">
            Scrub the day
          </label>
          <span>{nextPhaseText(clock.hours)}</span>
        </div>
        <div className="relative h-11 rounded-md focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-zinc-300">
          <div
            aria-hidden
            className="absolute inset-0 flex overflow-hidden rounded-md border border-zinc-800"
          >
            {BANDS.map(({ phase: band, from, to }) => (
              <div
                key={from}
                style={{ width: `${((to - from) / 24) * 100}%` }}
                className={cn(
                  "flex items-end overflow-hidden px-1.5 pb-1 text-xs whitespace-nowrap capitalize",
                  BAND_CLASS[band],
                )}
              >
                {!narrow && band}
              </div>
            ))}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 border-l-2 border-dashed border-zinc-400"
            style={{ left: at(localHours(clock.pcTime)) }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-zinc-50"
            style={{ left: at(clock.hours) }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-sm bg-zinc-50 px-1 font-mono text-xs font-medium text-zinc-900 tabular-nums">
              {time}
            </span>
          </div>
          <MinuteRange
            clock={clock}
            id={rangeId}
            className="absolute inset-0 h-full cursor-ew-resize opacity-0"
          />
        </div>
        <div
          aria-hidden
          className="mt-1.5 flex justify-between font-mono text-xs text-zinc-400"
        >
          {(narrow ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]).map(
            (tick) => (
              <span key={tick}>{pad(tick)}</span>
            ),
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
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
          <ModeBadge mode={clock.mode} />
          {!narrow && <span className="ml-auto">{settings}</span>}
        </div>
        <div role="group" aria-label="Time presets" className="flex gap-2">
          {PRESET_KEYS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={phase === preset}
              onClick={() => clock.setHours(PRESETS[preset])}
              className={buttonClass}
            >
              {PRESET_LABELS[preset]}
              {!narrow && ` ${formatHours(PRESETS[preset])}`}
            </button>
          ))}
        </div>
        {!narrow && <p className="text-xs text-zinc-400">{RATE_TEXT}</p>}
        <p role="status" aria-live="polite" className="text-xs text-zinc-400">
          {statusText(clock)}
        </p>
      </div>
    </section>
  );
}

const STYLES = {
  compact: CompactConsole,
  orbital: TimeDial,
  timeline: TimelineDock,
} satisfies Record<ControllerStyle, (props: ControllerProps) => unknown>;

interface TimeControllerProps extends Disclosure {
  clock: RoomClock;
  style: ControllerStyle;
  onStyleChange: (style: ControllerStyle) => void;
  narrow: boolean;
  /** Phone stack (mobile-hud S1): the controller sits at the top. */
  stacked?: boolean;
}

/**
 * Renders the chosen controller design. Purely presentational: the clock lives
 * in RoomApp, so switching styles never resets time, mode or pause state. The
 * settings panel's open state lives here so it survives the style swap.
 * Only the compact console folds, so only it takes the phone disclosure.
 */
export function TimeController({
  clock,
  style,
  onStyleChange,
  narrow,
  stacked = false,
  folded,
  onOpenChange,
}: TimeControllerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = (
    <ControllerSettings
      style={style}
      onChange={onStyleChange}
      open={settingsOpen}
      onOpenChange={setSettingsOpen}
      // Stacked at the top of a phone, the panel opens down into the room.
      side={stacked || style === "orbital" ? "bottom" : "top"}
    />
  );
  if (style === "compact")
    return (
      <CompactConsole
        clock={clock}
        narrow={narrow}
        settings={settings}
        folded={folded}
        onOpenChange={onOpenChange}
      />
    );
  const Style = STYLES[style];
  return <Style clock={clock} narrow={narrow} settings={settings} />;
}
