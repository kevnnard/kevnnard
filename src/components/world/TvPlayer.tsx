import { useEffect, useRef } from "react";
import { tvEmbedSrc } from "@/lib/world/tv-media.ts";
import type { TvPlayerView } from "@/lib/world/tv-screen.ts";
import "./tv-player.css";

/**
 * The TV's player (tv-home-screen T8, S8-S10): YouTube's privacy-enhanced
 * player or Twitch's official player, framed on the living-room TV's glass
 * by TvScreen.tsx (drei <Html transform>, like the portrait monitor's
 * YouTube tab). It mounts only after a press asks it to play, so nothing
 * third-party loads before. YouTube starts muted; Twitch starts muted and
 * waits for its own play button. Back, or Esc anywhere on the page, returns
 * to the home screen; Esc inside the frame stays with the player, so Back
 * is always there.
 */
export default function TvPlayer({
  view,
  width,
  height,
  onPress,
}: {
  view: TvPlayerView;
  /** CSS pixels of the page, scaled onto the glass. */
  width: number;
  height: number;
  /** A player region id, as the remote would press it. */
  onPress: (id: string) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
  }, []);
  const src = tvEmbedSrc(view.media, window.location.hostname);

  return (
    <section
      className="tv-player"
      style={{ width, height }}
      aria-label={`${view.title}, on the living-room TV`}
    >
      <header className="tv-player-bar">
        <button
          ref={back}
          type="button"
          data-region="player:close"
          onClick={() => onPress("player:close")}
        >
          <kbd>Esc</kbd> Back to Kevnnard TV
        </button>
        <p className="tv-player-title">{view.title}</p>
        {view.options.length > 0 && (
          <nav aria-label="What to play">
            {view.options.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.current}
                onClick={() => onPress(option.id)}
              >
                {option.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      <iframe
        key={src}
        src={src}
        title={`${view.title} · ${view.platform} player`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      <p className="tv-player-credit">{view.credit}</p>
    </section>
  );
}
