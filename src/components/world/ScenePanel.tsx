import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  LIGHT_IDS,
  LIGHT_INFO,
  type LightId,
  type LightSetting,
  type LightSettings,
  nightLightsOn,
} from "@/lib/world/lights.ts";
import "./scene-panel.css";
import "./world-hud.css";

type State = "on" | "standby" | "off" | "disabled";
const STATE_LABEL: Record<State, string> = {
  on: "On",
  standby: "Off · day",
  off: "Off · power",
  disabled: "Disabled",
};

/** `power` is the master switch: off at night holds every light dark. */
const stateOf = (light: LightSetting, night: boolean, power: boolean): State =>
  !light.enabled ? "disabled" : !night ? "standby" : power ? "on" : "off";

const ZONES = [
  { id: "tv", title: "TV wall" },
  { id: "desk", title: "Desk setup" },
] as const;

/** Gap to the viewport edges and to the day controller, in px. */
const EDGE = 16;
const GAP = 8;
/** Compact clock/card width on wide screens (21rem in scene-panel.css). */
const WIDTH = 336;

function LightRow({
  id,
  light,
  night,
  power,
  onChange,
}: {
  id: LightId;
  light: LightSetting;
  night: boolean;
  power: boolean;
  onChange: (id: LightId, patch: Partial<LightSetting>) => void;
}) {
  const uid = useId();
  const { name, where } = LIGHT_INFO[id];
  const state = stateOf(light, night, power);
  return (
    <div role="group" aria-labelledby={`${uid}-name`} className="sp-light">
      <div className="sp-light-head">
        <span
          aria-hidden="true"
          className="sp-swatch"
          data-state={state}
          style={{ background: light.color }}
        />
        <span id={`${uid}-name`} className="sp-name">
          {name}
        </span>
        <span className="sp-chip" data-state={state}>
          {STATE_LABEL[state]}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={light.enabled}
          aria-label={`${name} enabled`}
          onClick={() => onChange(id, { enabled: !light.enabled })}
          className="sp-switch"
        >
          <span aria-hidden="true" />
        </button>
      </div>
      <div className="sp-controls">
        <input
          type="color"
          value={light.color}
          aria-label={`${name} color`}
          aria-describedby={`${uid}-hint`}
          onChange={(event) => onChange(id, { color: event.target.value })}
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
        />
        <span aria-hidden="true" className="sp-pct sp-mono sp-muted">
          {light.intensity}%
        </span>
      </div>
      <p id={`${uid}-hint`} className="sp-muted">
        <span className="sp-mono">{light.color}</span> · {where}
      </p>
    </div>
  );
}

/**
 * Scene settings (T6b): the lower-left day controller mirrored to the bottom
 * right, one console whose header row stays at the bottom and whose content
 * opens upward above it. Inside, the zone cards of
 * design/world-lighting/03-grouped-cards.html, without its night gate card:
 * the shared day controller is the only time display and editor; this panel
 * only reads the simulated hour to show each light's state. When the day
 * controller spans under the panel (narrow screens, timeline dock), the panel
 * lifts above it. Beside Reset, one master Power off / Power on button (S20)
 * darkens every artificial light at night; by day it is disabled.
 * The whole header row is one native disclosure button styled like the
 * compact day controller (world-hud-trigger, S1); closed, the panel shrinks
 * to that row. Stacked on a phone (mobile-hud S1), scene-panel.css places it
 * under the top buttons and opens it downward; the app folds it while the
 * clock is open.
 */
export function ScenePanel({
  hours,
  lights,
  narrow,
  controllerStyle,
  power = true,
  stacked = false,
  folded,
  onOpenChange,
  onChange,
  onReset,
  onPower,
}: {
  hours: number;
  lights: LightSettings;
  narrow: boolean;
  /** The day controller remounts on a style switch; re-measure it then. */
  controllerStyle: string;
  /** Master switch, separate from the per-light settings. */
  power?: boolean;
  /** Phone stack: the stylesheet owns the position, no measured lift. */
  stacked?: boolean;
  /** Closes the cards, e.g. while the clock is open on a phone. */
  folded?: boolean;
  onOpenChange?: (open: boolean) => void;
  onChange: (id: LightId, patch: Partial<LightSetting>) => void;
  onReset: () => void;
  /** Flips the master; the app ignores it by day. */
  onPower?: () => void;
}) {
  // Starts folded to its header row so the scene stays clear.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (folded) setOpen(false);
  }, [folded]);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const [status, setStatus] = useState("");
  const [lift, setLift] = useState(EDGE);
  const rootRef = useRef<HTMLElement>(null);
  const uid = useId();
  const night = nightLightsOn(hours);
  const onCount = LIGHT_IDS.filter(
    (id) => stateOf(lights[id], night, power) === "on",
  ).length;

  // Sit above the day controller whenever it reaches under the panel.
  // Re-measured after the controller remounts or the layout switches.
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    const clock = parent?.querySelector<HTMLElement>(
      'section[aria-label="Time of day"]',
    );
    if (!parent || !clock) {
      setLift(EDGE);
      return;
    }
    const update = () => {
      const box = parent.getBoundingClientRect();
      const dock = clock.getBoundingClientRect();
      const width = Math.min(WIDTH, box.width - 2 * EDGE);
      const left = box.right - EDGE - width;
      setLift(dock.right + GAP > left ? box.bottom - dock.top + GAP : EDGE);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    observer.observe(clock);
    return () => observer.disconnect();
  }, [narrow, controllerStyle]);

  // Announce the night lights switching, not the first render.
  const last = useRef(night);
  useEffect(() => {
    if (last.current === night) return;
    last.current = night;
    setStatus(
      night && power
        ? `Night lights on, ${onCount} of ${LIGHT_IDS.length}.`
        : "Night lights off.",
    );
  }, [night, power, onCount]);

  const change = (id: LightId, patch: Partial<LightSetting>) => {
    onChange(id, patch);
    if (patch.enabled !== undefined)
      setStatus(
        `${LIGHT_INFO[id].name} ${patch.enabled ? "enabled" : "disabled"}.`,
      );
  };

  return (
    <section
      ref={rootRef}
      aria-labelledby={`${uid}-title`}
      className="scene-panel"
      data-open={open}
      style={
        stacked
          ? undefined
          : {
              bottom: lift,
              // Below the top action buttons (5rem), above the bottom offset.
              maxHeight: `calc(100% - 5rem - ${lift}px)`,
            }
      }
    >
      <p role="status" aria-live="polite" className="sp-sr">
        {status}
      </p>
      {/* Content before the header row, so it opens upward above it. */}
      {open && (
        <div id={`${uid}-cards`} className="sp-body">
          {ZONES.map((zone) => {
            const ids = LIGHT_IDS.filter(
              (id) => LIGHT_INFO[id].zone === zone.id,
            );
            const on = ids.filter(
              (id) => stateOf(lights[id], night, power) === "on",
            ).length;
            return (
              <section
                key={zone.id}
                aria-labelledby={`${uid}-${zone.id}`}
                className="sp-card"
              >
                <div className="sp-card-head">
                  <h3 id={`${uid}-${zone.id}`}>{zone.title}</h3>
                  <span className="sp-mono sp-muted">
                    {on} of {ids.length} on
                  </span>
                </div>
                {ids.map((id) => (
                  <LightRow
                    key={id}
                    id={id}
                    light={lights[id]}
                    night={night}
                    power={power}
                    onChange={change}
                  />
                ))}
              </section>
            );
          })}
          <div className="sp-foot">
            <button
              type="button"
              onClick={() => {
                onReset();
                setStatus("Lights reset to their defaults.");
              }}
              className="sp-btn"
            >
              Reset lights
            </button>
            <button
              type="button"
              aria-pressed={!power}
              disabled={!night}
              title={night ? undefined : "Lights are off by day"}
              onClick={() => {
                if (!night) return;
                onPower?.();
                setStatus(power ? "All lights off." : "All lights on.");
              }}
              className="sp-btn"
            >
              {!power ? "Power on" : "Power off"}
            </button>
          </div>
        </div>
      )}
      {/* Heading around one button: the whole row toggles the cards. */}
      <h2 className="sp-head">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${uid}-cards`}
          onClick={() => setOpen((value) => !value)}
          className="world-hud-trigger sp-trigger"
        >
          <span aria-hidden="true" className="sp-dot" data-on={onCount > 0} />
          <span id={`${uid}-title`} className="sp-title">
            Scene
          </span>
          <span className="sp-muted">
            {night && power
              ? `${onCount}/${LIGHT_IDS.length} lights on`
              : "lights off"}
          </span>
          <span aria-hidden="true" className="sp-chevron">
            ▾
          </span>
        </button>
      </h2>
    </section>
  );
}
