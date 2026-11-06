import type {
  CaseStoryPlayer,
  CaseStory as Story,
  WallStory,
} from "@/lib/world/case-stories.ts";
import "./case-story.css";
import "./katana-story.css";

/** Where each position lines up in the secondary diagram (220 x 96). */
const SPOTS: Record<string, readonly [number, number][]> = {
  FS: [[78, 22]],
  SS: [[140, 40]],
  CB: [
    [22, 62],
    [198, 62],
  ],
};

/**
 * The defensive secondary seen from behind the line: each played position
 * is a filled spot; a second cornerback is drawn as an outline.
 */
function SecondaryDiagram({ player }: { player: CaseStoryPlayer }) {
  return (
    <svg
      className="case-story-field"
      viewBox="0 0 220 96"
      role="img"
      aria-label="Defensive secondary: two safeties deep, a cornerback on each side"
    >
      <rect className="frame" x="1" y="1" width="218" height="94" rx="6" />
      <line className="scrimmage" x1="1" y1="78" x2="219" y2="78" />
      <text className="caption" x="6" y="91">
        LINE OF SCRIMMAGE
      </text>
      {player.positions.flatMap(({ code }) =>
        (SPOTS[code] ?? []).map(([x, y], index) => (
          <g key={`${code}-${x}`} className={index ? "spot ghost" : "spot"}>
            <circle cx={x} cy={y} r="7" />
            <text x={x > 180 ? x - 28 : x + 10} y={y + 3}>
              {code}
            </text>
          </g>
        )),
      )}
    </svg>
  );
}

/**
 * The wall katana's card (katana-wall-shelf T5), in the lo-fi console's
 * look: translucent zinc, emerald kicker, monospace. Same place and width
 * as the case card, so the camera frames the stand left of it.
 */
function WallStoryCard({
  story,
  open,
  onOpenChange,
}: {
  story: WallStory;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open)
    return (
      <button
        type="button"
        className="katana-story-reopen"
        onClick={() => onOpenChange(true)}
      >
        Show story
      </button>
    );
  return (
    <article className="katana-story" aria-labelledby="case-story-title">
      <p className="katana-story-kicker">{story.kicker}</p>
      <h2 id="case-story-title">{story.title}</h2>
      <p className="katana-story-lede">{story.lede}</p>
      <div className="katana-story-actions">
        <p className="katana-story-credit">
          {story.credit.text}{" "}
          <a
            href={story.credit.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${story.credit.name} on Sketchfab (opens in a new tab)`}
          >
            {story.credit.name}
          </a>
        </p>
        <button type="button" onClick={() => onOpenChange(false)}>
          Hide story
        </button>
      </div>
    </article>
  );
}

/**
 * The side story card beside an inspected display case (collection-display-
 * models T10, T11; design/collection-case-story/01-side-story-card): the
 * team and number up top, the owner's photos or clip when shipped, the
 * position and seasons side by side, a dated timeline, the story and the
 * team link. "Hide story" folds it to a small button so the turning model
 * has the room; WorldApp opens it again on every case. The wall katana's
 * story takes the lo-fi WallStoryCard instead.
 */
export default function CaseStory({
  story,
  reducedMotion,
  open,
  onOpenChange,
}: {
  story: Story | WallStory;
  reducedMotion: boolean;
  /** Owned by WorldApp: the camera frames left of the card while open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if ("credit" in story)
    return (
      <WallStoryCard story={story} open={open} onOpenChange={onOpenChange} />
    );
  if (!open)
    return (
      <button
        type="button"
        className="case-story-reopen"
        onClick={() => onOpenChange(true)}
      >
        Show story
      </button>
    );
  const { player } = story;
  return (
    <article className="case-story" aria-labelledby="case-story-title">
      <p className="case-story-kicker">{story.kicker}</p>
      <div className="case-story-head">
        <div>
          <h2 id="case-story-title">{story.title}</h2>
          <p className="case-story-sub">{story.subtitle}</p>
        </div>
        {player && (
          <span
            className="case-story-number"
            aria-label={`Number ${player.number.replace("#", "")}`}
          >
            {player.number}
          </span>
        )}
      </div>
      {story.media.length > 0 && (
        <div
          className="case-story-media"
          data-count={story.media.length}
          aria-label="Photos and video from the field"
        >
          {story.media.map((media) =>
            media.kind === "clip" ? (
              <video
                key={media.src}
                src={media.src}
                poster={media.poster}
                aria-label={media.alt}
                style={{ objectPosition: media.focus }}
                muted
                loop
                playsInline
                autoPlay={!reducedMotion}
                controls={reducedMotion}
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
      {player && (
        <div className="case-story-grid">
          <section
            className="case-story-block"
            aria-labelledby="case-story-position"
          >
            <h3 id="case-story-position">My position</h3>
            <SecondaryDiagram player={player} />
            <ul className="case-story-roles" aria-label="Positions played">
              {player.positions.map((position) => (
                <li key={position.code}>{position.label}</li>
              ))}
            </ul>
          </section>
          <section
            className="case-story-block case-story-years"
            aria-labelledby="case-story-field"
          >
            <h3 id="case-story-field">On the field</h3>
            <p>
              <b>{player.seasons}</b>
              <span>seasons playing American football</span>
            </p>
            <p className="since">
              <b>{player.joined.label}</b>
              <span>joined {player.joined.team}</span>
            </p>
          </section>
        </div>
      )}
      {story.timeline.length > 0 && (
        <ol className="case-story-timeline" aria-label="My football story">
          {story.timeline.map((step) => (
            <li key={step.date}>
              <time dateTime={step.date}>{step.label}</time>
              {step.text}
            </li>
          ))}
        </ol>
      )}
      <p className="case-story-lede">{story.lede}</p>
      <div className="case-story-actions">
        {story.link && (
          <a
            href={story.link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${story.link.label} (opens in a new tab)`}
          >
            {story.link.label}
          </a>
        )}
        <button type="button" onClick={() => onOpenChange(false)}>
          Hide story
        </button>
      </div>
    </article>
  );
}
