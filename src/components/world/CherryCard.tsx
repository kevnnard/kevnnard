import { type AnimationEvent, useEffect, useRef } from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import type { CherryStory } from "@/lib/world/cherry.ts";
import "./case-story.css";
import "./cherry-card.css";

/** An original paw print with a small heart for the main pad. */
function Paw() {
  return (
    <svg
      className="cherry-card-glyph"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="14" cy="26" rx="5.5" ry="7" transform="rotate(-24 14 26)" />
      <ellipse cx="25" cy="15" rx="5.5" ry="7.5" transform="rotate(-8 25 15)" />
      <ellipse cx="39" cy="15" rx="5.5" ry="7.5" transform="rotate(8 39 15)" />
      <ellipse cx="50" cy="26" rx="5.5" ry="7" transform="rotate(24 50 26)" />
      <path d="M32 56 C20 47 16 41 16 35.5 C16 30.5 20 27 24.5 27 C28 27 30.5 29 32 31.5 C33.5 29 36 27 39.5 27 C44 27 48 30.5 48 35.5 C48 41 44 47 32 56 Z" />
    </svg>
  );
}

/**
 * Cherry's card (dog-rig T3), beside her close-up in the yard: the football
 * helmet's story card family (case-story.css supplies the panel, kicker,
 * actions, focus rings and the footprint the camera frames her left of),
 * made iconic: her name set large and spaced with a soft glow and an
 * underline that draws in, a drawn paw with a heart, the stats strip and
 * her story in the owner's words. The photos and videos the owner will send
 * go in `story.media` (null for now: nothing renders). She is not part of
 * the collection, so there is no rail: "Back to room" leaves, and takes
 * focus as the card opens. It fades in and out like the other cards
 * (card-motion T1); leaving, it is inert, so it lets go of focus.
 */
export default function CherryCard({
  story,
  onClose,
  state,
  onMotionEnd,
}: {
  story: CherryStory;
  onClose: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);

  return (
    <article
      className="case-story cherry-card"
      aria-labelledby="cherry-card-title"
      data-state={state}
      inert={state === "leaving"}
      onAnimationEnd={onMotionEnd}
    >
      <p className="case-story-kicker">{story.kicker}</p>
      <div className="cherry-card-hero">
        <h2 id="cherry-card-title" className="cherry-card-name">
          {story.name}
        </h2>
        <Paw />
      </div>
      <dl className="cherry-card-stats">
        {story.stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <section className="cherry-card-story" aria-label="Her story">
        {story.story.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
      <section className="cherry-card-poem" aria-label={story.poem.title}>
        <h3>{story.poem.title}</h3>
        {story.poem.stanzas.map((stanza) => (
          <p key={stanza[0]}>
            {stanza.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </p>
        ))}
      </section>
      <div className="case-story-actions">
        <button ref={back} type="button" onClick={onClose}>
          Back to room
        </button>
      </div>
    </article>
  );
}
