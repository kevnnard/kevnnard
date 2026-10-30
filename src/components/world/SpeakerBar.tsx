import { type Ref, useEffect, useRef, useState } from "react";
import {
  spectrumBars,
  spectrumLoop,
  trackPosition,
} from "@/lib/world/speaker-console.ts";
import {
  type MusicState,
  SPECTRUM_BINS,
  type SpeakerMusic,
  TRACK_IDS,
} from "@/lib/world/speaker-music.ts";
import { type ListeningRange, rangeLabel } from "@/lib/world/speaker-range.ts";
import "./speaker-bar.css";

/** Spectrum bars, as in the split console artboard. */
const BARS = 48;
const BAR_KEYS = Array.from({ length: BARS }, (_, i) => `bar-${i}`);

const STATUS: Record<MusicState["status"], string> = {
  idle: "Ready",
  loading: "Loading",
  playing: "Playing",
  paused: "Paused",
  error: "Stopped",
};

/**
 * The speaker close-up's split console (speaker-focus-console T3, artboard
 * 02-split-console): glass on the wall between the speakers, with the
 * spectrum, track and transport on the left and the volume and listening
 * range always visible on the right; stacked on phones. The spectrum is the
 * real analyser's (speaker-music.ts), drawn at SPECTRUM_HZ only while the
 * console is mounted, the music plays, the tab shows and motion is allowed;
 * otherwise the bars rest at zero. Exit is WorldApp's, at the top left.
 */
export default function SpeakerBar({
  state,
  music,
  volume,
  range,
  limits,
  reducedMotion,
  playRef,
  onPlay,
  onPrevious,
  onNext,
  onVolume,
  onRange,
}: {
  state: MusicState;
  music: SpeakerMusic;
  /** 0..1, held by WorldApp so it outlives the close-up. */
  volume: number;
  /** 0 (house) .. 1 (initial view). */
  range: number;
  /** Measured once from the first view; null until then. */
  limits: ListeningRange | null;
  reducedMotion: boolean;
  playRef: Ref<HTMLButtonElement>;
  onPlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onVolume: (volume: number) => void;
  onRange: (range: number) => void;
}) {
  const bars = useRef<(HTMLElement | null)[]>([]);
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  // Muted, the analyser reads zero: no loop for bars at rest.
  const live =
    state.status === "playing" && volume > 0 && !reducedMotion && !hidden;
  useEffect(() => {
    if (!live) return;
    const data = new Uint8Array(SPECTRUM_BINS);
    const levels = new Float32Array(BARS);
    const paint = () =>
      bars.current.forEach((bar, i) => {
        if (bar) bar.style.transform = `scaleY(${levels[i].toFixed(3)})`;
      });
    const loop = spectrumLoop({
      request: (run) => requestAnimationFrame(run),
      cancel: (handle) => cancelAnimationFrame(handle),
      draw: () => {
        if (music.spectrum(data)) spectrumBars(data, levels);
        else levels.fill(0);
        paint();
      },
      clear: () => {
        levels.fill(0);
        paint();
      },
    });
    loop.start();
    return () => loop.stop();
  }, [live, music]);

  const { track } = state;
  const title = track?.title ?? "Five lo-fi loops";
  const meta = track
    ? `${track.genre} · ${Math.round(track.loopEnd - track.loopStart)} s loop`
    : "Local generated loops";
  const percent = Math.round(volume * 100);
  const reach = limits ? rangeLabel(limits, range) : null;
  const spectrumLabel = live
    ? "Live spectrum of the music"
    : reducedMotion
      ? "Spectrum at rest: reduced motion"
      : volume === 0
        ? "Spectrum at rest: muted"
        : "Spectrum at rest: no music playing";

  return (
    <section className="speaker-console" aria-label="Speaker music controls">
      <div className="speaker-console-main">
        <div className="speaker-console-heading">
          <p className="speaker-console-eyebrow">Speakers / local loops</p>
          <p className="speaker-console-status" aria-live="polite">
            <span
              className="speaker-console-dot"
              data-on={state.playing || undefined}
              aria-hidden="true"
            />
            {STATUS[state.status]} {trackPosition(track?.id ?? null)}
          </p>
        </div>
        <h2 className="speaker-console-track">
          {state.status === "loading" ? `Loading ${title}…` : title}
        </h2>
        <p className="speaker-console-meta">{meta}</p>
        <div
          className="speaker-console-spectrum"
          role="img"
          aria-label={spectrumLabel}
        >
          {BAR_KEYS.map((key, i) => (
            <i
              key={key}
              ref={(bar) => {
                bars.current[i] = bar;
              }}
            />
          ))}
        </div>
        <div className="speaker-console-transport">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Previous track"
          >
            ← <kbd>P</kbd>
          </button>
          <button
            ref={playRef}
            type="button"
            onClick={onPlay}
            aria-pressed={state.playing}
            className="speaker-console-play"
          >
            {state.playing ? "Pause" : "Play"} <kbd>Space</kbd>
          </button>
          <button type="button" onClick={onNext} aria-label="Next track">
            <kbd>N</kbd> →
          </button>
        </div>
        {state.error && (
          <p role="alert" className="speaker-console-error">
            {state.error}
          </p>
        )}
      </div>
      <div className="speaker-console-settings">
        <div className="speaker-console-setting">
          <label htmlFor="speaker-volume">
            Volume <output htmlFor="speaker-volume">{percent}%</output>
          </label>
          <input
            id="speaker-volume"
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-valuetext={percent === 0 ? "Muted" : `${percent}%`}
            onChange={(event) =>
              onVolume(Number(event.currentTarget.value) / 100)
            }
          />
          <div className="speaker-console-endpoints" aria-hidden="true">
            <span>Mute</span>
            <span>Full</span>
          </div>
        </div>
        <div className="speaker-console-setting">
          <label htmlFor="speaker-range">
            Listening range{" "}
            <output htmlFor="speaker-range">
              {reach ? (reach.name ?? reach.metres) : "Measuring…"}
            </output>
          </label>
          <input
            id="speaker-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(range * 100)}
            disabled={!limits}
            aria-valuetext={reach?.text ?? "Measuring the view"}
            onChange={(event) =>
              onRange(Number(event.currentTarget.value) / 100)
            }
          />
          <div className="speaker-console-endpoints" aria-hidden="true">
            <span>House{limits && ` · ${rangeLabel(limits, 0).metres}`}</span>
            <span>
              Initial view{limits && ` · ${rangeLabel(limits, 1).metres}`}
            </span>
          </div>
        </div>
      </div>
      <p className="speaker-console-help">
        <span>
          <kbd>+</kbd> <kbd>−</kbd> Volume · <kbd>Esc</kbd> Exit
        </span>
        <span>{TRACK_IDS.length} local tracks</span>
      </p>
    </section>
  );
}
