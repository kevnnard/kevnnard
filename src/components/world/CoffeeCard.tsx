import { useEffect, useRef } from "react";
import type { DeskStory } from "@/lib/world/desk-stories.ts";
import "./katana-story.css";
import "./coffee-card.css";

/**
 * The side card beside the inspected coffee mug (coffee-card T1), in the
 * katana card's lo-fi console look and footprint, so the camera frames the
 * mug left of it. No photos: the steaming mug is the visual. The desk is not
 * part of the collection, so there is no rail: "Back to room" leaves. The
 * Maps link opens in a new tab.
 */
export default function CoffeeCard({
  story,
  onClose,
}: {
  story: DeskStory;
  onClose: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  // Keyboard focus lands on the card as it opens, so Tab reaches the link.
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const { place } = story;
  return (
    <article
      className="katana-story coffee-card"
      aria-labelledby="coffee-card-title"
    >
      <p className="katana-story-kicker">{story.kicker}</p>
      <h2 id="coffee-card-title">{story.title}</h2>
      <p className="coffee-card-line">{story.line}</p>
      <section
        className="coffee-card-section"
        aria-labelledby="coffee-processes"
      >
        <h3 id="coffee-processes">Processes</h3>
        <ul className="coffee-card-processes">
          {story.processes.map((process) => (
            <li key={process.name}>
              <strong>{process.name}</strong> — {process.note}
            </li>
          ))}
        </ul>
      </section>
      <section className="coffee-card-section" aria-labelledby="coffee-place">
        <h3 id="coffee-place">Where to drink it</h3>
        <p className="coffee-card-place">
          <strong>
            {place.name} · {place.city}
          </strong>{" "}
          — {place.text}
        </p>
      </section>
      <div className="katana-story-actions coffee-card-actions">
        <button ref={back} type="button" onClick={onClose}>
          Back to room
        </button>
        <a
          className="coffee-card-link"
          href={place.link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${place.link.label} (opens in a new tab)`}
        >
          {place.link.label}
        </a>
      </div>
    </article>
  );
}
