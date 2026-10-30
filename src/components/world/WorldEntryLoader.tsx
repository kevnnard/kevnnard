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
  scene: "Preparing the scene",
  assets: "Loading models & materials",
  frame: "Preparing the first frame",
  ready: "Your world is ready",
};

/** Checklist rows of artboard 03, with the phase that completes each one. */
const STEPS: { label: string; doneAt: WorldLoadState["phase"][] }[] = [
  { label: "Scene foundations", doneAt: ["assets", "frame", "ready"] },
  { label: "Models & materials", doneAt: ["frame", "ready"] },
  { label: "First frame", doneAt: ["ready"] },
];

/** Line drawing of the house and desk, revealed by the real percentage. */
function AssemblyDrawing() {
  return (
    <svg
      className="world-entry-drawing"
      viewBox="0 0 440 360"
      role="img"
      aria-label="A line drawing of the house and desk being assembled"
    >
      <path className="world-entry-floor" d="m30 249 180-89 200 89-191 100Z" />
      <g className="world-entry-wire">
        <path pathLength={1} d="M65 265V140L210 55l153 87v118" />
        <path pathLength={1} d="M49 151 210 42l171 110-171-61Z" />
        <path pathLength={1} d="M210 91v229M65 236l145 48 153-48" />
        <path pathLength={1} d="M112 227l97-42 101 41-99 33ZM112 227v52" />
        <path pathLength={1} d="M310 226v51" />
        <path pathLength={1} d="m164 215 2-59 76 23v57Zm2-59 76 23" />
        <path pathLength={1} d="M210 228v20M127 218v-29l18 6v29" />
        <path pathLength={1} d="M273 224v-28l18-5v28" />
      </g>
      <g className="world-entry-nodes">
        <circle cx="65" cy="140" r="3" />
        <circle cx="210" cy="55" r="3" />
        <circle cx="363" cy="142" r="3" />
      </g>
      <text className="world-entry-caption" x="38" y="340">
        WORLD / HOUSE / DESK / STORIES
      </text>
    </svg>
  );
}

/**
 * The /world entry gate from design/world-entry-loader/03-world-assembly.html.
 * Stateless: the percentage, phase and error come from `state`, which the
 * parent derives from the scene's real preparation. Entry unlocks only when
 * the phase is "ready" without an error.
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
  const count = String(percent).padStart(2, "0");
  const status = failed
    ? "The world could not be prepared"
    : PHASE_LABEL[state.phase];

  // Orient keyboard and screen reader users once, unless focus is elsewhere.
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

  return (
    <div
      ref={rootRef}
      className="world-entry-loader"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-state={failed ? "error" : ready ? "ready" : "loading"}
      style={
        {
          "--world-entry-progress": percent / 100,
        } as CSSProperties
      }
    >
      <div className="world-entry-shell">
        <div className="world-entry-header">
          <a href="/" className="world-entry-link">
            ← Back to portfolio
          </a>
          <span className="world-entry-brand">KEVNNARD / WORLD</span>
        </div>

        <div className="world-entry-main">
          <div className="world-entry-assembly">
            <AssemblyDrawing />

            <div className="world-entry-panel">
              <p className="world-entry-eyebrow">World assembly</p>
              <h2
                ref={headingRef}
                id={headingId}
                className="world-entry-heading"
                tabIndex={-1}
              >
                Building a place
                <br />
                to look around.
              </h2>

              <ol className="world-entry-steps">
                {STEPS.map((step, index) => (
                  <li
                    key={step.label}
                    data-done={step.doneAt.includes(state.phase)}
                  >
                    <span aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>{" "}
                    {step.label}
                  </li>
                ))}
              </ol>

              <div className="world-entry-meter">
                <div className="world-entry-meter-top">
                  <p className="world-entry-phase" role="status">
                    {status}
                  </p>
                  <span className="world-entry-count" aria-hidden="true">
                    {count}
                    <span className="world-entry-count-total"> / 100</span>
                  </span>
                </div>
                <div
                  className="world-entry-bar"
                  role="progressbar"
                  aria-label="World preparation"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-valuetext={`${percent} percent, ${status}`}
                >
                  <span className="world-entry-bar-fill" />
                </div>
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
          </div>
        </div>

        <div className="world-entry-footer">
          <span>Work, interests, and the objects that tell my story.</span>
          <span>Sound follows your saved preference.</span>
        </div>
      </div>
    </div>
  );
}
