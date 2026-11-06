import { type AnimationEvent, useEffect, useRef } from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import type { TruckStory } from "@/lib/world/truck.ts";
import "./case-story.css";
import "./truck-card.css";

/**
 * The dream truck's card (dream-truck T1), beside its close-up in the
 * garage: Cherry's card family (case-story.css supplies the panel, kicker,
 * actions, focus rings, card motion and the footprint the camera frames the
 * truck left of). The model's name set large, the stats strip and the
 * owner's words. No images. The truck is not part of the collection, so
 * there is no rail: "Back to room" leaves, and takes focus as the card
 * opens; leaving, it is inert.
 */
export default function TruckCard({
  story,
  onClose,
  state,
  onMotionEnd,
}: {
  story: TruckStory;
  onClose: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);

  return (
    <article
      className="case-story truck-card"
      aria-labelledby="truck-card-title"
      data-state={state}
      inert={state === "leaving"}
      onAnimationEnd={onMotionEnd}
    >
      <p className="case-story-kicker">{story.kicker}</p>
      <h2 id="truck-card-title" className="truck-card-title">
        {story.title}
      </h2>
      <dl className="truck-card-stats">
        {story.stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <section className="truck-card-story" aria-label="Why it is here">
        {story.story.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
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
