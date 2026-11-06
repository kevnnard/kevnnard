import { type AnimationEvent, useEffect, useRef } from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import type { GarageStory } from "@/lib/world/truck.ts";
import "./case-story.css";
import "./truck-card.css";

/**
 * The garage's card (dream-truck T4), beside the close-up of its closed
 * door: Cherry's card family (case-story.css supplies the panel, kicker,
 * actions, focus rings, card motion and the footprint the camera frames
 * the door left of). A kicker, "Coming soon" set large and one line. No
 * images, no rail: "Back to room" leaves, and takes focus as the card
 * opens; leaving, it is inert.
 */
export default function TruckCard({
  story,
  onClose,
  state,
  onMotionEnd,
}: {
  story: GarageStory;
  onClose: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);

  return (
    <article
      className="case-story garage-card"
      aria-labelledby="garage-card-title"
      data-state={state}
      inert={state === "leaving"}
      onAnimationEnd={onMotionEnd}
    >
      <p className="case-story-kicker">{story.kicker}</p>
      <h2 id="garage-card-title" className="garage-card-title">
        {story.title}
      </h2>
      <p className="garage-card-line">{story.line}</p>
      <div className="case-story-actions">
        <button ref={back} type="button" onClick={onClose}>
          Back to room
        </button>
      </div>
    </article>
  );
}
