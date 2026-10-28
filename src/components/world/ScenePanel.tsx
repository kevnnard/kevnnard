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

type State = "on" | "standby" | "disabled";
const STATE_LABEL: Record<State, string> = {
  on: "On",
  standby: "Off · day",
  disabled: "Disabled",
};

const stateOf = (light: LightSetting, night: boolean): State =>
  !light.enabled ? "disabled" : night ? "on" : "standby";

const ZONES = [
  { id: "tv", title: "TV wall" },
  { id: "desk", title: "Desk setup" },
] as const;

/** Gap to the viewport edges and to the day controller, in px. */
const EDGE = 16;
const GAP = 8;
/** Panel width on wide screens (scene-panel.css). */
const WIDTH = 320;

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
 * lifts above it.
 */
export function ScenePanel({
  hours,
  lights,
  narrow,
  controllerStyle,
  onChange,
  onReset,
}: {
  hours: number;
  lights: LightSettings;
  narrow: boolean;
  /** The day controller remounts on a style switch; re-measure it then. */
  controllerStyle: string;
  onChange: (id: LightId, patch: Partial<LightSetting>) => void;
  onReset: () => void;
}) {
  // Starts folded to its header row so the scene stays clear.
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [lift, setLift] = useState(EDGE);
  const rootRef = useRef<HTMLElement>(null);
  const uid = useId();
  const night = nightLightsOn(hours);
  const onCount = LIGHT_IDS.filter(
    (id) => stateOf(lights[id], night) === "on",
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
      night
        ? `Night lights on, ${onCount} of ${LIGHT_IDS.length}.`
        : "Night lights off.",
    );
  }, [night, onCount]);

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
      style={{
        bottom: lift,
        // Below the top action buttons (5rem), above the bottom offset.
        maxHeight: `calc(100% - 5rem - ${lift}px)`,
      }}
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
              (id) => stateOf(lights[id], night) === "on",
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
          </div>
        </div>
      )}
      <div className="sp-head">
        <span aria-hidden="true" className="sp-dot" data-on={onCount > 0} />
        <h2 id={`${uid}-title`}>Scene</h2>
        <span className="sp-muted">
          {night ? `${onCount}/${LIGHT_IDS.length} lights on` : "lights off"}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${uid}-cards`}
          onClick={() => setOpen((value) => !value)}
          className="sp-btn"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
    </section>
  );
}
