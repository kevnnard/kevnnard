import { type AnimationEvent, useEffect, useRef } from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import { CINEMATIC } from "@/lib/world/cinematic.ts";
import { SPELL, type WandStory } from "@/lib/world/wand.ts";
import "./case-story.css";
import "./wand-card.css";

/**
 * The Elder Wand's card (patronus T1), beside its close-up: Cherry's card
 * family (case-story.css supplies the panel, kicker, actions, focus rings,
 * card motion and the footprint the camera frames the wand left of). A
 * kicker, "Expecto Patronum" and two lines; "Cast again" plays the spell
 * once more and "Back to room" leaves, taking focus as the card opens. No
 * images. The words also show briefly over the scene, left of the card,
 * as the spell plays (`cast` counts the casts; the first waits for the
 * camera to arrive).
 */
export default function WandCard({
  story,
  cast,
  reducedMotion,
  onCast,
  onClose,
  state,
  onMotionEnd,
}: {
  story: WandStory;
  /** Casts so far this visit: 0 is the one on arrival. */
  cast: number;
  reducedMotion: boolean;
  onCast: () => void;
  onClose: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const [w0, w1] = SPELL.words;
  const delay = (cast === 0 && !reducedMotion ? CINEMATIC.duration : 0) + w0;

  return (
    <>
      <article
        className="case-story wand-card"
        aria-labelledby="wand-card-title"
        data-state={state}
        inert={state === "leaving"}
        onAnimationEnd={onMotionEnd}
      >
        <p className="case-story-kicker">{story.kicker}</p>
        <h2 id="wand-card-title" className="wand-card-title">
          {story.title}
        </h2>
        {story.lines.map((line) => (
          <p key={line} className="wand-card-line">
            {line}
          </p>
        ))}
        <div className="case-story-actions">
          <button type="button" onClick={onCast}>
            Cast again
          </button>
          <button ref={back} type="button" onClick={onClose}>
            Back to room
          </button>
        </div>
      </article>
      {state !== "leaving" && (
        <p
          key={cast}
          className="wand-spell"
          aria-hidden="true"
          style={{
            animationDelay: `${delay}s`,
            animationDuration: `${w1 - w0}s`,
          }}
        >
          {story.spell}
        </p>
      )}
    </>
  );
}
