import { type CSSProperties, useEffect, useId, useRef } from "react";
import type { WorldLoadState } from "@/lib/world/world-loading.ts";
import "./world-entry-loader.css";

type WorldEntryLoaderProps = {
  state: WorldLoadState;
  onEnter: () => void;
  onRetry?: () => void;
  reducedMotion: boolean;
};

const PHASE_LABEL: Record<WorldLoadState["phase"], string> = {
  scene: "Nature and sky",
  assets: "Ground and surfaces",
  frame: "Living interior",
  ready: "Ready to enter",
};

/** Four milestones matching the blueprint ticks and real progress intervals. */
const MILESTONES: { label: string; threshold: number }[] = [
  { label: "Nature and sky", threshold: 24 },
  { label: "Ground and surfaces", threshold: 49 },
  { label: "Living interior", threshold: 74 },
  { label: "First frame", threshold: 99 },
];

/**
 * Isometric blueprint drawing of the house from artboard 06.
 * The SVG paths are grouped in 10 sequential ink orders (0..9).
 * CSS handles the stroke-dashoffset transition driven by `--world-entry-order-t`.
 */
function BlueprintDrawing() {
  return (
    <svg
      className="world-entry-blueprint"
      viewBox="0 0 720 440"
      role="img"
      aria-label="Isometric blueprint of the house drawing itself with scene loading progress"
    >
      {/* Interior warm glow polygon: transparent during loading, emerges on ready */}
      <polygon
        className="world-entry-glow"
        points="260,150 460,100 560,160 560,300 360,350 260,290"
      />

      {/* 0: ground plate */}
      <path
        className="world-entry-ink world-entry-ink-faint"
        data-order="0"
        pathLength={1}
        d="M120,300 L360,400 L640,300 L400,200 Z"
      />

      {/* 1: main body front face */}
      <path
        className="world-entry-ink"
        data-order="1"
        pathLength={1}
        d="M260,290 L260,150 L460,100 L460,240 Z"
      />

      {/* 2: main body side face */}
      <path
        className="world-entry-ink"
        data-order="2"
        pathLength={1}
        d="M460,240 L460,100 L560,160 L560,300 Z"
      />

      {/* 3: internal structure and corner verticals */}
      <path
        className="world-entry-ink"
        data-order="3"
        pathLength={1}
        d="M260,290 L360,350 L560,300"
      />
      <path
        className="world-entry-ink"
        data-order="3"
        pathLength={1}
        d="M360,350 L360,210 L460,240"
      />
      <path
        className="world-entry-ink"
        data-order="3"
        pathLength={1}
        d="M360,210 L560,160"
      />

      {/* 4: pitched rooflines */}
      <path
        className="world-entry-ink"
        data-order="4"
        pathLength={1}
        d="M250,150 L350,90 L470,60 L570,150"
      />
      <path
        className="world-entry-ink"
        data-order="4"
        pathLength={1}
        d="M350,90 L350,205"
      />
      <path
        className="world-entry-ink"
        data-order="4"
        pathLength={1}
        d="M470,60 L470,100"
      />

      {/* 5: garage footprint and wall siding */}
      <path
        className="world-entry-ink"
        data-order="5"
        pathLength={1}
        d="M160,275 L160,215 L260,185 L260,290"
      />
      <path
        className="world-entry-ink"
        data-order="5"
        pathLength={1}
        d="M160,275 L230,310 L260,290"
      />
      <path
        className="world-entry-ink"
        data-order="5"
        pathLength={1}
        d="M230,310 L230,250 L260,240"
      />
      <path
        className="world-entry-ink world-entry-ink-faint"
        data-order="5"
        pathLength={1}
        d="M175,225 L175,268 M190,222 L190,275 M205,218 L205,282 M220,215 L220,289"
      />

      {/* 6: porch threshold and door */}
      <path
        className="world-entry-ink"
        data-order="6"
        pathLength={1}
        d="M400,318 L400,250 L425,242 L425,330"
      />
      <path
        className="world-entry-ink world-entry-ink-faint"
        data-order="6"
        pathLength={1}
        d="M372,340 L372,270 M440,335 L440,262"
      />

      {/* 7: windows: glass fills that light up on ready, then frames and panes */}
      <polygon
        className="world-entry-window"
        points="290,190 328,180 328,228 290,238"
      />
      <polygon
        className="world-entry-window"
        points="480,150 514,170 514,216 480,196"
      />
      <path
        className="world-entry-ink"
        data-order="7"
        pathLength={1}
        d="M290,190 L328,180 L328,228 L290,238 Z"
      />
      <path
        className="world-entry-ink"
        data-order="7"
        pathLength={1}
        d="M480,150 L514,170 L514,216 L480,196 Z"
      />
      <path
        className="world-entry-ink world-entry-ink-faint"
        data-order="7"
        pathLength={1}
        d="M309,185 L309,233 M290,214 L328,204"
      />

      {/* 8: chimney */}
      <path
        className="world-entry-ink"
        data-order="8"
        pathLength={1}
        d="M520,100 L520,70 L540,75 L540,112"
      />

      {/* 9: architectural dimension lines */}
      <path
        className="world-entry-ink world-entry-dim"
        data-order="9"
        pathLength={1}
        d="M120,320 L360,420 M640,320 L360,420"
      />
      <text className="world-entry-dim-label" x="200" y="392">
        12.40 m
      </text>
      <text className="world-entry-dim-label" x="520" y="392">
        9.60 m
      </text>
      <text className="world-entry-dim-label" x="585" y="150">
        roof · 4.2 m
      </text>
    </svg>
  );
}

/**
 * The /world entry gate refreshed to Blueprint Home (artboard 06).
 * Stateless: percentage, phase and error come entirely from `state`.
 * Entry unlocks only when phase is "ready" and error is null.
 */
export default function WorldEntryLoader({
  state,
  onEnter,
  onRetry,
  reducedMotion,
}: WorldEntryLoaderProps) {
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);

  const failed = state.error !== null;
  const ready = state.phase === "ready" && state.error === null;
  const percent = ready
    ? 100
    : Math.min(99, Math.max(1, Math.round(state.progress || 1)));
  const status = failed
    ? "The world could not be prepared"
    : PHASE_LABEL[state.phase];

  // Orient keyboard and screen reader users once on mount.
  useEffect(() => {
    if (document.activeElement === document.body) headingRef.current?.focus();
  }, []);

  // At readiness, hand focus to Enter only if it is still on the loader.
  useEffect(() => {
    if (!ready) return;
    const active = document.activeElement;
    if (active === document.body || rootRef.current?.contains(active)) {
      enterRef.current?.focus();
    }
  }, [ready]);

  // Order parameter t in [0, 10] driving the 10 ink layers (data-order 0..9)
  const orderT = (percent / 100) * 10;

  return (
    <div
      ref={rootRef}
      className={`world-entry-loader ${ready ? "world-entry-ready" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-state={failed ? "error" : ready ? "ready" : "loading"}
      style={
        {
          "--world-entry-progress": percent / 100,
          "--world-entry-order-t": orderT,
        } as CSSProperties
      }
    >
      <div className="world-entry-shell">
        <header className="world-entry-header">
          <div className="world-entry-titleblock">
            <div className="world-entry-topline">
              <a href="/" className="world-entry-link">
                ← Back to portfolio
              </a>
              <span className="world-entry-sheet-ref">
                Kevnnard · world entry · sheet 01
              </span>
            </div>
            <h2
              ref={headingRef}
              id={headingId}
              className="world-entry-heading"
              tabIndex={-1}
            >
              Drawing the house
            </h2>
          </div>

          <div
            className="world-entry-readout"
            role="progressbar"
            aria-label="World preparation"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${percent} percent, ${status}`}
          >
            <span className="world-entry-pct" aria-hidden="true">
              {percent}
              <small>%</small>
            </span>
            <span className="world-entry-phase" role="status">
              {status}
            </span>
          </div>
        </header>

        <div className="world-entry-sheet">
          <BlueprintDrawing />
        </div>

        <footer className="world-entry-footer">
          <div className="world-entry-ticks" aria-hidden="true">
            {MILESTONES.map((m) => (
              <div
                key={m.label}
                className="world-entry-tick"
                data-on={percent >= m.threshold ? "true" : "false"}
              >
                <i />
                <span>{m.label}</span>
              </div>
            ))}
          </div>

          <div className="world-entry-foot-bar">
            <div
              className="world-entry-status"
              data-state={failed ? "error" : ready ? "ready" : "loading"}
              role="status"
            >
              <span className="world-entry-status-dot" aria-hidden="true" />
              <span>
                {failed
                  ? "Could not load"
                  : ready
                    ? "Ready to enter"
                    : "Not ready"}
              </span>
            </div>

            <p className="world-entry-about">
              <strong>A small house in the forest.</strong> Walk the rooms, read
              the terminal, play the lo-fi speakers and watch the light change
              with the real time of day.
            </p>
          </div>

          {failed && (
            <div className="world-entry-error" role="alert">
              <p>The world could not be prepared.</p>
              <p className="world-entry-error-detail">{state.error}</p>
              <div className="world-entry-error-actions">
                {onRetry && (
                  <button
                    type="button"
                    className="world-entry-button"
                    onClick={onRetry}
                  >
                    Try again
                  </button>
                )}
                <a href="/" className="world-entry-link">
                  Back to portfolio
                </a>
              </div>
            </div>
          )}

          <div className="world-entry-actions">
            <button
              ref={enterRef}
              type="button"
              className="world-entry-button world-entry-enter"
              disabled={!ready}
              onClick={ready ? onEnter : undefined}
            >
              {ready ? (
                <>
                  Enter world <span aria-hidden="true">→</span>
                </>
              ) : failed ? (
                "World unavailable"
              ) : (
                "Preparing your world…"
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
