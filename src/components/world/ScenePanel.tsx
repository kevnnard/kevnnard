import { useEffect, useId, useRef, useState } from "react";
import {
  clockMinute,
  LIGHT_IDS,
  LIGHT_INFO,
  type LightId,
  type LightSetting,
  type LightSettings,
  NIGHT_GATE,
  nightLightsOn,
} from "@/lib/world/lights.ts";

const DAY = 24 * 60;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minute: number) =>
  `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
const span = (n: number) =>
  n >= 60 ? `${Math.floor(n / 60)} h ${pad(n % 60)} min` : `${n} min`;
const wrap = (n: number) => ((n % DAY) + DAY) % DAY;

/** Boundary previews: they set the simulated clock, like the day controller. */
const PREVIEWS = [
  { minute: NIGHT_GATE.on - 1, caption: "last off" },
  { minute: NIGHT_GATE.on, caption: "first on" },
  { minute: NIGHT_GATE.off - 1, caption: "last on" },
  { minute: NIGHT_GATE.off, caption: "first off" },
] as const;

type State = "on" | "standby" | "disabled";
const STATE_LABEL: Record<State, string> = {
  on: "On",
  standby: "Off · daytime",
  disabled: "Disabled",
};

const stateOf = (light: LightSetting, night: boolean): State =>
  !light.enabled ? "disabled" : night ? "on" : "standby";

const ZONES = [
  { id: "tv", title: "TV wall" },
  { id: "desk", title: "Desk setup" },
] as const;

const card = "grid gap-3.5 rounded-xl border border-border bg-background p-4";
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const button = `inline-flex h-8 items-center justify-center rounded-md border border-border bg-input/30 px-3 text-xs font-medium text-foreground transition-colors hover:bg-input/50 ${focus}`;

function LightRow({
  id,
  light,
  night,
  onChange,
}: {
  id: LightId;
  light: LightSetting;
  night: boolean;
  onChange: (id: LightId, patch: Partial<LightSetting>) => void;
}) {
  const uid = useId();
  const { name, where } = LIGHT_INFO[id];
  const state = stateOf(light, night);
  const hint = {
    on: `${where}. On until 06:00.`,
    standby: `${where}. Turns on at 18:00 with these settings.`,
    disabled: `${where}. Disabled, stays off at night.`,
  }[state];
  return (
    <div
      role="group"
      aria-labelledby={`${uid}-name`}
      className="grid gap-2.5 border-border [&+&]:border-t [&+&]:pt-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full"
          style={{
            background: light.color,
            opacity: state === "disabled" ? 0.5 : 1,
          }}
        />
        <span id={`${uid}-name`} className="font-medium">
          {name}
        </span>
        <span
          className={`ml-auto whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${
            state === "on"
              ? "border-emerald-500 bg-emerald-500/30 text-foreground"
              : "border-border text-muted-foreground"
          } ${state === "disabled" ? "border-dashed" : ""}`}
        >
          {STATE_LABEL[state]}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={light.enabled}
          aria-label={`${name} enabled`}
          onClick={() => onChange(id, { enabled: !light.enabled })}
          className={`relative h-5 w-9 shrink-0 rounded-full border ${
            light.enabled
              ? "border-emerald-500 bg-emerald-500/30"
              : "border-border bg-secondary"
          } ${focus}`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-0.5 left-0.5 size-3.5 rounded-full transition-transform motion-reduce:transition-none ${
              light.enabled
                ? "translate-x-4 bg-foreground"
                : "bg-muted-foreground"
            }`}
          />
        </button>
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
        <input
          type="color"
          value={light.color}
          aria-label={`${name} color`}
          aria-describedby={`${uid}-hex`}
          onChange={(event) => onChange(id, { color: event.target.value })}
          className={`h-7 w-9 cursor-pointer rounded-md border border-border bg-input/30 p-0.5 ${focus}`}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={light.intensity}
          aria-label={`${name} intensity`}
          aria-valuetext={`${light.intensity} percent`}
          onChange={(event) =>
            onChange(id, { intensity: Number(event.target.value) })
          }
          className={`m-0 w-full accent-emerald-500 ${focus}`}
        />
        <span
          aria-hidden="true"
          className="min-w-10 text-right font-mono text-xs tabular-nums text-muted-foreground"
        >
          {light.intensity}%
        </span>
      </div>
      <p className="m-0 text-xs text-muted-foreground">
        <span id={`${uid}-hex`} className="font-mono tabular-nums">
          {light.color}
        </span>{" "}
        · {hint}
      </p>
    </div>
  );
}

/**
 * Scene settings (T6b, design/world-lighting/03-grouped-cards.html): a stack
 * of cards on the right edge. The night gate card shows the simulated time
 * and previews the boundaries; zone cards hold every light's switch, color
 * and intensity, all visible and editable by day. "Hide settings" folds the
 * stack to its header line. On narrow screens it starts folded.
 */
export function ScenePanel({
  hours,
  lights,
  narrow,
  onChange,
  onReset,
  onPreview,
}: {
  hours: number;
  lights: LightSettings;
  narrow: boolean;
  onChange: (id: LightId, patch: Partial<LightSetting>) => void;
  onReset: () => void;
  /** Sets the simulated clock to an hour (boundary previews). */
  onPreview: (hours: number) => void;
}) {
  const [open, setOpen] = useState(!narrow);
  const [status, setStatus] = useState("");
  const uid = useId();
  const minute = clockMinute(hours);
  const night = nightLightsOn(hours);
  const time = clock(minute);
  const onCount = LIGHT_IDS.filter(
    (id) => stateOf(lights[id], night) === "on",
  ).length;

  // Announce the gate opening and closing, not the first render.
  const last = useRef(night);
  useEffect(() => {
    if (last.current === night) return;
    last.current = night;
    setStatus(
      night
        ? `${time}: night gate open, ${onCount} of ${LIGHT_IDS.length} lights on.`
        : `${time}: daytime, all night lights off.`,
    );
  }, [night, time, onCount]);

  const change = (id: LightId, patch: Partial<LightSetting>) => {
    onChange(id, patch);
    if (patch.enabled !== undefined)
      setStatus(
        `${LIGHT_INFO[id].name} ${patch.enabled ? "enabled" : "disabled"}.`,
      );
  };

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={`pointer-events-none absolute flex flex-col gap-3 ${
        narrow
          ? `inset-x-2 top-[4.5rem] ${open ? "max-h-[55vh]" : ""}`
          : `top-20 right-4 w-[23rem] ${open ? "bottom-4" : ""}`
      }`}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-background/90 px-3 py-2 backdrop-blur">
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${night ? "bg-emerald-500" : "bg-muted-foreground"}`}
        />
        <h2 id={`${uid}-title`} className="m-0 text-base font-semibold">
          Scene
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {night
            ? `${onCount}/${LIGHT_IDS.length} lights on`
            : "lights off · day"}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${uid}-cards`}
          onClick={() => setOpen((value) => !value)}
          className={`${button} ml-auto bg-background`}
        >
          {open ? "Hide settings" : "Show settings"}
        </button>
      </div>

      <div
        id={`${uid}-cards`}
        hidden={!open}
        className="pointer-events-auto -m-0.5 grid min-h-0 content-start gap-3 overflow-y-auto p-0.5 text-sm"
      >
        <section aria-labelledby={`${uid}-gate`} className={card}>
          <div className="flex items-baseline gap-2">
            <h3 id={`${uid}-gate`} className="m-0 text-sm font-semibold">
              Night gate
            </h3>
            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
              18:00–05:59
            </span>
          </div>
          <div className="flex items-center gap-2.5 font-mono text-xs tabular-nums">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${night ? "bg-emerald-500" : "bg-muted-foreground"}`}
            />
            <strong className="text-2xl font-semibold">{time}</strong>
            <span
              className={`uppercase tracking-widest ${night ? "text-emerald-500" : "text-muted-foreground"}`}
            >
              {night ? "Open" : "Closed"}
            </span>
            <span className="ml-auto text-muted-foreground">
              {night
                ? `off in ${span(wrap(NIGHT_GATE.off - minute))}`
                : `on in ${span(wrap(NIGHT_GATE.on - minute))}`}
            </span>
          </div>
          <div aria-hidden="true">
            <div className="relative h-6 overflow-hidden rounded-md border border-border bg-input/30">
              <span className="absolute inset-y-0 left-0 w-1/4 bg-emerald-500/20" />
              <span className="absolute inset-y-0 left-3/4 w-1/4 bg-emerald-500/20" />
              <span
                className="absolute -inset-y-px w-0.5 bg-foreground"
                style={{ left: `calc(${(minute / DAY) * 100}% - 1px)` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>24</span>
            </div>
          </div>
          <div>
            <div
              role="group"
              aria-label="Preview the night boundary"
              className="grid grid-cols-4 overflow-hidden rounded-md border border-border"
            >
              {PREVIEWS.map(({ minute: at }) => (
                <button
                  key={at}
                  type="button"
                  aria-pressed={minute === at}
                  aria-describedby={`${uid}-cap-${at}`}
                  onClick={() => onPreview(at / 60)}
                  className={`h-8 border-border font-mono text-xs font-medium tabular-nums text-foreground [&+&]:border-l ${
                    minute === at
                      ? "bg-emerald-500/30"
                      : "bg-input/30 hover:bg-input/50"
                  } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`}
                >
                  {clock(at)}
                </button>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-4 text-center text-xs text-muted-foreground">
              {PREVIEWS.map(({ minute: at, caption }) => (
                <span key={at} id={`${uid}-cap-${at}`}>
                  {caption}
                </span>
              ))}
            </div>
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Uses the simulated time from the day controller, not your PC clock.
            Previews pause the clock; resume it there.
          </p>
        </section>

        {ZONES.map((zone) => {
          const ids = LIGHT_IDS.filter((id) => LIGHT_INFO[id].zone === zone.id);
          const on = ids.filter(
            (id) => stateOf(lights[id], night) === "on",
          ).length;
          return (
            <section
              key={zone.id}
              aria-labelledby={`${uid}-${zone.id}`}
              className={card}
            >
              <div className="flex items-baseline gap-2">
                <h3
                  id={`${uid}-${zone.id}`}
                  className="m-0 text-sm font-semibold"
                >
                  {zone.title}
                </h3>
                <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                  {on} of {ids.length} on
                </span>
              </div>
              <div>
                {ids.map((id) => (
                  <LightRow
                    key={id}
                    id={id}
                    light={lights[id]}
                    night={night}
                    onChange={change}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <div className={`${card} border-dashed py-3`}>
          <p className="m-0 text-xs text-muted-foreground">
            Light colors are scene data you pick for each light. New scene
            settings arrive as their own cards in this stack.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onReset();
                setStatus("Lights reset to their defaults.");
              }}
              className={button}
            >
              Reset lights
            </button>
          </div>
          <p aria-hidden="true" className="m-0 text-muted-foreground">
            {status}
          </p>
        </div>
      </div>
    </section>
  );
}
