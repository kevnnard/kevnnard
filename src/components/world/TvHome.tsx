import { type RefObject, useEffect, useRef } from "react";
import {
  type TvCoverItem,
  type TvHomeState,
  type TvScreenLayout,
  tvRegionId,
} from "@/lib/world/tv-screen.ts";
import "./tv-home.css";

/**
 * Kevnnard TV's accessible companion (tv-home-screen T3, S6). The home
 * screen itself is drawn on the living-room TV's glass (TvScreen.tsx); this
 * region has no visual of its own (clipped to nothing in tv-home.css), like
 * the terminal's (TerminalMonitor.tsx). It carries the same items as named
 * buttons and the owner's muted clip as a native video, and holds keyboard
 * focus on the remote's position, so the screen draws its ring there.
 * Arrows move, Enter selects (again to open or play), Esc leaves.
 */
export default function TvHome({
  state,
  layout,
  videoRef,
  onPress,
  onMove,
  onClip,
  onClose,
}: {
  state: TvHomeState;
  layout: TvScreenLayout;
  /** The clip the screen draws from while it plays. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** A region id, as a click on the screen would press it. */
  onPress: (id: string) => void;
  /** An arrow key for the remote. */
  onMove: (key: string) => void;
  onClip: (playing: boolean) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const current = tvRegionId(state.pos);

  // Keyboard focus follows the remote: on open, on arrows, on screen clicks.
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body && !root.current?.contains(active))
      return;
    root.current
      ?.querySelector<HTMLElement>(`[data-region="${current}"]`)
      ?.focus({ preventScroll: true });
  }, [current, state.app, state.opened]);

  // One listener for the open TV: Esc leaves from anywhere, arrows and
  // Enter drive the remote from its items or after a click on the screen.
  const keys = useRef({ current, onPress, onMove, onClose });
  keys.current = { current, onPress, onMove, onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        keys.current.onClose();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      const onRemote =
        target === document.body ||
        (target instanceof HTMLElement && target.dataset.remote !== undefined);
      if (!onRemote) return;
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        keys.current.onMove(event.key);
      } else if (event.key === "Enter" && target === document.body) {
        event.preventDefault();
        keys.current.onPress(keys.current.current);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // A clip leaving the hero stops counting as playing.
  const src = layout.hero.video;
  useEffect(() => {
    if (!src) return;
    return () => onClip(false);
  }, [src, onClip]);

  const remote = (id: string) => ({
    "data-region": id,
    "data-remote": "",
    tabIndex: id === current ? 0 : -1,
  });
  const covers = (items: TvCoverItem[]) =>
    items.map((item) => (
      <li key={item.id}>
        <button
          type="button"
          aria-label={item.label}
          aria-current={item.picked}
          onClick={() => onPress(item.id)}
          {...remote(item.id)}
        >
          {item.title}
        </button>
      </li>
    ));
  const { hero } = layout;

  return (
    <section
      ref={root}
      role="region"
      className="tv-companion"
      aria-label="Kevnnard TV, shown on the living-room TV"
    >
      <button type="button" data-region="back" onClick={onClose}>
        Back to room
      </button>
      <p>
        {layout.status}, {layout.clock}
      </p>
      <nav aria-label="Apps">
        <ul>
          {layout.dock.map((app) => (
            <li key={app.id}>
              <button
                type="button"
                aria-current={app.current}
                onClick={() => onPress(app.id)}
                {...remote(app.id)}
              >
                {app.label}, {app.count}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-live="polite" aria-label="Selected">
        <p>{hero.kicker}</p>
        <h2>{hero.title}</h2>
        <p>{hero.meta}</p>
        {hero.note && (
          <p>
            {hero.note.label}: {hero.note.text}
          </p>
        )}
        {hero.primary && (
          <button
            type="button"
            data-region="primary"
            onClick={() => onPress("primary")}
          >
            {hero.primary}
          </button>
        )}
        {hero.secondary && (
          <button type="button" disabled>
            {hero.secondary}
          </button>
        )}
        {src && (
          <video
            ref={videoRef}
            key={src}
            src={src}
            poster={hero.poster ?? undefined}
            aria-label={hero.videoLabel ?? undefined}
            muted
            controls
            playsInline
            preload="none"
            onPlay={() => onClip(true)}
            onPause={() => onClip(false)}
          />
        )}
      </section>
      <section aria-label={layout.coversHeading}>
        <h3>{layout.coversHeading}</h3>
        {layout.sampleTag && <p>{layout.sampleTag}</p>}
        <ul>{covers(layout.covers)}</ul>
      </section>
      <section aria-label={layout.continuedHeading}>
        <h3>{layout.continuedHeading}</h3>
        <ul>{covers(layout.continued)}</ul>
      </section>
      <p>
        Keys: arrows move, Enter selects, again opens a collection or plays, Esc
        returns the camera to the room.
      </p>
    </section>
  );
}
