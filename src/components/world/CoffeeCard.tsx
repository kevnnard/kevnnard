import {
  type AnimationEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { CardState } from "@/lib/world/card-motion.ts";
import type { DeskStory } from "@/lib/world/desk-stories.ts";
import "./case-story.css";
import "./coffee-card.css";

/** The altitude diagram's frame (220 x 96): metres at its top and its base. */
const PEAK_M = 3000;
const TOP_Y = 10;
const BASE_Y = 86;
const altitudeY = (metres: number) =>
  BASE_Y - (metres / PEAK_M) * (BASE_Y - TOP_Y);
const metres = (value: number) => `${value.toLocaleString("en-US")} m`;
/** An original ridge line for the diagram, not any real profile. */
const RIDGE =
  "M1 86 L34 64 L58 50 L76 56 L104 24 L122 34 L140 18 L166 42 L190 36 L219 70 L219 86 Z";

/**
 * The growing band on the mountain: where the band crosses the ridge, the
 * slope is filled emerald; dashed lines mark its edges across the frame.
 */
function AltitudeBand({ altitude }: { altitude: DeskStory["altitude"] }) {
  const clip = useId();
  const high = altitudeY(altitude.high);
  const low = altitudeY(altitude.low);
  return (
    <svg
      className="coffee-card-altitude"
      viewBox="0 0 220 96"
      role="img"
      aria-label={`Grown on the mountain between ${metres(altitude.low)} and ${metres(altitude.high)} above sea level`}
    >
      <defs>
        <clipPath id={clip}>
          <path d={RIDGE} />
        </clipPath>
      </defs>
      <rect className="frame" x="1" y="1" width="218" height="94" rx="6" />
      <path className="ridge" d={RIDGE} />
      <rect
        className="band"
        x="1"
        y={high}
        width="218"
        height={low - high}
        clipPath={`url(#${clip})`}
      />
      <line className="edge" x1="1" y1={high} x2="219" y2={high} />
      <line className="edge" x1="1" y1={low} x2="219" y2={low} />
      <text className="label" x="6" y={high - 4}>
        {metres(altitude.high)}
      </text>
      <text className="label" x="6" y={low + 11}>
        {metres(altitude.low)}
      </text>
      <text className="caption" x="214" y="91" textAnchor="end">
        SEA LEVEL ↓
      </text>
    </svg>
  );
}

/** An original outlined coffee bean, the head's emblem (as the helmet's #). */
function Bean() {
  return (
    <svg
      className="coffee-card-bean"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-32 32 32)">
        <ellipse cx="32" cy="32" rx="19" ry="27" />
        <path d="M32 6 C24 18 40 26 32 32 C24 38 40 46 32 58" />
      </g>
    </svg>
  );
}

/**
 * The side card beside the inspected coffee mug (coffee-card T1, T2), laid
 * out like the football helmet's story card (CaseStory.tsx,
 * design/collection-case-story/01-side-story-card) in the same footprint,
 * so the camera still frames the mug left of it: the name and an emblem up
 * top, a stats strip, the owner's photos once shipped, the growing band
 * beside the processes as tabs with their tasting notes, the cup profile
 * as chips with a line about the mug (T3), and the friend's shop with its
 * Maps link. The desk is not part of the collection, so there
 * is no rail: "Back to room" leaves, and takes focus as the card opens.
 * It fades in and out like the scene panel (card-motion T1); leaving, it
 * is inert, so it lets go of focus.
 */
export default function CoffeeCard({
  story,
  onClose,
  state,
  onMotionEnd,
}: {
  story: DeskStory;
  onClose: () => void;
  /** The card's presence, from WorldApp's useCardPresence. */
  state: CardState;
  onMotionEnd: (event: AnimationEvent) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState(0);
  const ids = useId();
  // Keyboard focus lands on the card as it opens, so Tab reaches the link.
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const { place, processes } = story;
  const process = processes[selected];
  const panel = `${ids}-process`;
  const tabId = (index: number) => `${ids}-tab-${index}`;

  // Roving focus: arrows move along the tabs (wrapping), Home and End jump.
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = processes.length - 1;
    const next =
      event.key === "ArrowRight"
        ? selected === last
          ? 0
          : selected + 1
        : event.key === "ArrowLeft"
          ? selected === 0
            ? last
            : selected - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  };

  return (
    <article
      className="case-story coffee-card"
      aria-labelledby="coffee-card-title"
      data-state={state}
      inert={state === "leaving"}
      onAnimationEnd={onMotionEnd}
    >
      <p className="case-story-kicker">{story.kicker}</p>
      <div className="case-story-head">
        <div>
          <h2 id="coffee-card-title">{story.title}</h2>
          <p className="case-story-sub">{story.subtitle}</p>
        </div>
        <Bean />
      </div>
      <dl className="coffee-card-stats">
        {story.stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {story.media && story.media.length > 0 && (
        <div
          className="case-story-media"
          data-count={story.media.length}
          aria-label="Photos of the coffee"
        >
          {story.media.map((media) =>
            media.kind === "clip" ? (
              // No autoplay: the card has no motion setting of its own.
              <video
                key={media.src}
                src={media.src}
                poster={media.poster}
                aria-label={media.alt}
                style={{ objectPosition: media.focus }}
                muted
                loop
                playsInline
                controls
                preload="metadata"
              />
            ) : (
              <img
                key={media.src}
                src={media.src}
                alt={media.alt}
                style={{ objectPosition: media.focus }}
                loading="lazy"
              />
            ),
          )}
        </div>
      )}
      <div className="case-story-grid">
        <section
          className="case-story-block"
          aria-labelledby="coffee-card-grown"
        >
          <h3 id="coffee-card-grown">Grown at</h3>
          <AltitudeBand altitude={story.altitude} />
        </section>
        <section
          className="case-story-block coffee-card-processes"
          aria-labelledby="coffee-card-processes"
        >
          <h3 id="coffee-card-processes">Processes</h3>
          <div
            className="coffee-card-tabs"
            role="tablist"
            aria-labelledby="coffee-card-processes"
            onKeyDown={onTabKey}
          >
            {processes.map((item, index) => (
              <button
                key={item.name}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={index === selected}
                aria-controls={panel}
                tabIndex={index === selected ? 0 : -1}
                onClick={() => setSelected(index)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div
            key={process.name}
            id={panel}
            className="coffee-card-note"
            role="tabpanel"
            aria-labelledby={tabId(selected)}
          >
            <span>In the cup</span>
            <p>{process.note}</p>
          </div>
        </section>
      </div>
      <section
        className="coffee-card-cup"
        aria-labelledby="coffee-card-profile"
      >
        <h3 id="coffee-card-profile">Cup profile</h3>
        <ul className="coffee-card-profile">
          {story.profile.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="coffee-card-mug">
          <span>The mug</span>
          {story.mug}
        </p>
      </section>
      <section className="coffee-card-place" aria-labelledby="coffee-place">
        <h3 id="coffee-place">Where to drink it</h3>
        <p>
          <b>{place.name}</b> · {place.city}
        </p>
        <p className="coffee-card-place-text">{place.text}</p>
      </section>
      <div className="case-story-actions">
        <a
          href={place.link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${place.link.label} (opens in a new tab)`}
        >
          {place.link.label}
        </a>
        <button ref={back} type="button" onClick={onClose}>
          Back to room
        </button>
      </div>
    </article>
  );
}
