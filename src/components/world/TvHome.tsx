import { type ReactNode, useEffect, useRef, useState } from "react";
import type { MusicState } from "@/lib/world/speaker-music.ts";
import { moveRemote, type RemotePosition } from "@/lib/world/tv-focus.ts";
import {
  appCount,
  coverLine,
  entryUnit,
  TV_APPS,
  TV_CONTINUE,
  TV_FEATURED,
  type TvApp,
  type TvAppId,
  type TvEntry,
  type TvTitle,
  titleMeta,
  tvApp,
  tvTitle,
} from "@/lib/world/tv-library.ts";
import "./tv-home.css";

/** Original line icons for the dock (24 x 24, stroked by tv-home.css). */
const ICONS: Record<TvAppId, ReactNode> = {
  movies: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 5v4M16 5v4" />
    </>
  ),
  games: (
    <>
      <path d="M6 9h12a3 3 0 0 1 3 3v2a3 3 0 0 1-5 2l-1-1H9l-1 1a3 3 0 0 1-5-2v-2a3 3 0 0 1 3-3Z" />
      <path d="M8 11v3M6.5 12.5h3" />
    </>
  ),
  videos: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </>
  ),
  channels: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="m8 3 4 4 4-4M10 11v5l4-2.5Z" />
    </>
  ),
  anime: (
    <>
      <path d="M12 3 4 7v10l8 4 8-4V7Z" />
      <path d="m4 7 8 4 8-4M12 11v10" />
    </>
  ),
  highlights: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" transform="rotate(-35 12 12)" />
      <path d="m9 15 6-6M10 11l3 3M12 9l3 3" />
    </>
  ),
  radio: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1" />
      <rect x="17" y="14" width="4" height="6" rx="1" />
    </>
  ),
};

/** The hero shows a title, or one film or game of an opened collection. */
interface HeroPick {
  title: TvTitle;
  entry?: TvEntry;
}

/** One focusable cover in the middle or bottom row. */
type Cover =
  | { kind: "title"; title: TvTitle }
  | { kind: "entry"; title: TvTitle; entry: TvEntry; index: number }
  | { kind: "back"; title: TvTitle };

const DOCK = 0;
const COVERS = 1;
const CONTINUE = 2;

const clockLabel = (hours: number) => {
  const minutes = Math.floor((((hours % 24) + 24) % 24) * 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
};

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="tv-kbd">{children}</kbd>;
}

function CoverArt({ title, wide }: { title: TvTitle; wide?: boolean }) {
  return (
    <span
      className={`tv-art tv-art-${title.motif}${wide ? " is-wide" : ""}`}
      aria-hidden="true"
    />
  );
}

/**
 * Kevnnard TV (tv-home-screen T2, artboard 01-tv-os-overlay): the full-screen
 * home screen shown once the camera reaches the living-room TV. A remote's
 * three rows (the app dock, the selected app's covers and "Continue"), a
 * hero for the picked title, the owner's clip playable muted, and nothing
 * from third parties: trailers and channels wait for the owner's video ids.
 * Arrows move focus, Enter (or a click or tap) selects, Esc leaves.
 */
export default function TvHome({
  hours,
  song,
  onToggleMusic,
  onClose,
}: {
  /** The world's clock, shown in the top bar. */
  hours: number;
  /** The speakers' stream, for the status line and the Lo-fi radio app. */
  song: MusicState;
  onToggleMusic: () => void;
  onClose: () => void;
}) {
  const featured = tvTitle(TV_FEATURED);
  const [appId, setAppId] = useState<TvAppId>(featured.app);
  const [opened, setOpened] = useState<TvTitle | null>(null);
  const [hero, setHero] = useState<HeroPick>({ title: featured });
  const [pos, setPos] = useState<RemotePosition>(() => ({
    row: COVERS,
    col: tvApp(featured.app).titles.indexOf(featured),
  }));
  const items = useRef(new Map<string, HTMLButtonElement>());
  const video = useRef<HTMLVideoElement>(null);
  // Set when a key or a selection should move keyboard focus to `pos`.
  const pendingFocus = useRef(true);

  const app = tvApp(appId);
  const covers: Cover[] = opened
    ? [
        { kind: "back", title: opened },
        ...(opened.films ?? []).map((entry, index) => ({
          kind: "entry" as const,
          title: opened,
          entry,
          index,
        })),
      ]
    : app.titles.map((title) => ({ kind: "title" as const, title }));
  const continued = TV_CONTINUE.map(tvTitle);
  const lengths = [TV_APPS.length, covers.length, continued.length];

  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    items.current.get(`${pos.row}:${pos.col}`)?.focus();
  });

  const focusAt = (next: RemotePosition) => {
    pendingFocus.current = true;
    setPos(next);
  };

  // One listener for the whole screen: Esc leaves from anywhere, arrows
  // drive the remote from the rows or from a click on empty space.
  const remote = useRef({ pos, lengths, onClose });
  remote.current = { pos, lengths, onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        remote.current.onClose();
        return;
      }
      const target = event.target;
      const onRow =
        target === document.body ||
        (target instanceof HTMLElement && target.dataset.remote !== undefined);
      if (!onRow || event.altKey || event.ctrlKey || event.metaKey) return;
      const next = moveRemote(
        remote.current.pos,
        event.key,
        remote.current.lengths,
      );
      if (!next) return;
      event.preventDefault();
      pendingFocus.current = true;
      setPos(next);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const chooseApp = (next: TvApp) => {
    setAppId(next.id);
    setOpened(null);
    setHero({
      title: next.titles.find((title) => title.favourite) ?? next.titles[0],
    });
  };

  const openCollection = (title: TvTitle) => {
    setAppId(title.app);
    setOpened(title);
    setHero({ title });
    focusAt({ row: COVERS, col: 1 });
  };

  const closeCollection = (title: TvTitle) => {
    setOpened(null);
    setHero({ title });
    focusAt({ row: COVERS, col: tvApp(title.app).titles.indexOf(title) });
  };

  const pickCover = (cover: Cover) => {
    if (cover.kind === "back") closeCollection(cover.title);
    else if (cover.kind === "entry")
      setHero({ title: cover.title, entry: cover.entry });
    // A second Enter on a picked collection opens it, like a remote.
    else if (cover.title.films && hero.title === cover.title && !hero.entry)
      openCollection(cover.title);
    else setHero({ title: cover.title });
  };

  const remoteProps = (row: number, col: number, active: number) => ({
    ref: (element: HTMLButtonElement | null) => {
      if (element) items.current.set(`${row}:${col}`, element);
      else items.current.delete(`${row}:${col}`);
    },
    "data-remote": "",
    tabIndex: (pos.row === row ? pos.col : active) === col ? 0 : -1,
    onFocus: () => setPos({ row, col }),
  });

  const { title, entry } = hero;
  const heroApp = tvApp(title.app);
  const heroSample = heroApp.sample;
  const collection = title.films;
  const radio = title.app === "radio";
  const kicker = entry
    ? `${title.title} · ${collection ? collection.indexOf(entry) + 1 : 1} of ${collection?.length ?? 1}`
    : [
        heroApp.label,
        title.favourite && "my favourite",
        collection && "collection",
        heroSample && "sample pick",
      ]
        .filter(Boolean)
        .join(" · ");
  const meta = entry
    ? `${entry.year} · ${entryUnit(title) === "games" ? "game" : "film"}`
    : radio
      ? song.playing
        ? `Playing${song.track ? ` “${song.track.title}”` : ""} on the shelf speakers`
        : "Paused · five local lo-fi loops on the shelf speakers"
      : titleMeta(title);
  const status = song.playing
    ? `♪ ${song.track ? song.track.title : "Lo-fi radio"} on the speakers`
    : "♪ Lo-fi radio paused";
  const youtube =
    title.app === "channels"
      ? "Open channel · YouTube · coming soon"
      : title.app === "highlights"
        ? "Watch on YouTube · coming soon"
        : title.app === "videos" || radio
          ? null
          : "Watch trailer · YouTube · coming soon";
  const coversHeading = opened ? opened.title : app.label;

  let primary: ReactNode = null;
  if (collection && !entry && opened !== title)
    primary = (
      <button
        type="button"
        className="tv-btn is-primary"
        onClick={() => openCollection(title)}
      >
        <Kbd>Enter</Kbd> Open collection
      </button>
    );
  else if (title.video)
    primary = (
      <button
        type="button"
        className="tv-btn is-primary"
        // A blocked or interrupted play leaves the native controls in charge.
        onClick={() => void video.current?.play().catch(() => undefined)}
      >
        Play clip · muted
      </button>
    );
  else if (radio)
    primary = (
      <button
        type="button"
        className="tv-btn is-primary"
        aria-pressed={song.playing}
        onClick={onToggleMusic}
      >
        {song.playing ? "Pause the speakers" : "Play on the speakers"}
      </button>
    );

  return (
    <div
      className="tv-home"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tv-home-brand"
    >
      <header className="tv-home-top">
        <p className="tv-home-brand" id="tv-home-brand">
          <i aria-hidden="true" />
          Kevnnard TV <span>· living room</span>
        </p>
        <div className="tv-home-status">
          <span className="tv-home-stream">{status}</span>
          <time aria-label="World time">{clockLabel(hours)}</time>
          <button type="button" className="tv-home-back" onClick={onClose}>
            <Kbd>Esc</Kbd> Back to room
          </button>
        </div>
      </header>

      <nav aria-label="Apps">
        <ul className="tv-home-dock">
          {TV_APPS.map((entry, col) => (
            <li key={entry.id}>
              <button
                type="button"
                className="tv-app"
                aria-current={entry.id === appId}
                onClick={() => chooseApp(entry)}
                {...remoteProps(
                  DOCK,
                  col,
                  TV_APPS.findIndex((item) => item.id === appId),
                )}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {ICONS[entry.id]}
                </svg>
                <span>
                  <b>{entry.label}</b>
                  <small>{appCount(entry)}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="tv-hero" aria-live="polite" aria-label="Selected">
        <div className="tv-hero-text">
          <p className="tv-kicker">{kicker}</p>
          <h2 className="tv-hero-title">{entry ? entry.title : title.title}</h2>
          <p className="tv-meta">{meta}</p>
          {title.note && !entry && (
            <p className="tv-note">
              <span className="tv-note-label">
                Why I love it
                {title.note.draft && " · draft, owner to confirm"}
              </span>
              {title.note.text}
            </p>
          )}
          {(primary || youtube) && (
            <div className="tv-actions">
              {primary}
              {youtube && (
                <button type="button" className="tv-btn" disabled>
                  {youtube}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="tv-hero-art">
          {title.video ? (
            <video
              ref={video}
              key={title.video.src}
              src={title.video.src}
              poster={title.video.poster}
              aria-label={title.video.label}
              muted
              controls
              playsInline
              preload="none"
            />
          ) : (
            <CoverArt title={title} wide />
          )}
        </div>
      </section>

      <section className="tv-row" aria-labelledby="tv-row-covers">
        <div className="tv-row-head">
          <h3 id="tv-row-covers">{coversHeading}</h3>
          {!opened && app.sample && (
            <span className="tv-tag">Sample picks · replace with yours</span>
          )}
          <span>
            {opened
              ? `${opened.films?.length ?? 0} ${entryUnit(opened)}${opened.collectionNote ? ` · ${opened.collectionNote}` : ""}`
              : "covers are drawn placeholders until licensed art (TMDB / IGDB) is wired"}
          </span>
        </div>
        <ul className="tv-covers">
          {covers.map((cover, col) => {
            const picked =
              cover.kind === "entry"
                ? hero.entry === cover.entry
                : cover.kind === "title" &&
                  hero.title === cover.title &&
                  !hero.entry;
            const label =
              cover.kind === "back"
                ? `Back to ${app.label}`
                : cover.kind === "entry"
                  ? `${cover.entry.title}, ${cover.entry.year}`
                  : [
                      cover.title.title,
                      coverLine(cover.title),
                      cover.title.favourite && "my favourite",
                      cover.title.films && "collection",
                      app.sample && "sample pick",
                    ]
                      .filter(Boolean)
                      .join(", ");
            return (
              <li key={cover.kind === "entry" ? cover.index : cover.kind}>
                <button
                  type="button"
                  className={`tv-cover${cover.kind === "back" ? " is-back" : ""}`}
                  aria-label={label}
                  aria-current={picked}
                  onClick={() => pickCover(cover)}
                  {...remoteProps(COVERS, col, 0)}
                >
                  {cover.kind === "back" ? (
                    <span className="tv-cover-back" aria-hidden="true">
                      ←<small>All {app.label}</small>
                    </span>
                  ) : (
                    <>
                      <CoverArt title={cover.title} />
                      {cover.kind === "title" && cover.title.favourite && (
                        <span className="tv-fav">FAV</span>
                      )}
                      {cover.kind === "title" && cover.title.films && (
                        <span className="tv-stack" aria-hidden="true" />
                      )}
                      <span className="tv-cover-title">
                        {cover.kind === "entry"
                          ? cover.entry.title
                          : cover.title.title}
                      </span>
                      <span className="tv-cover-line">
                        {cover.kind === "entry"
                          ? cover.entry.year
                          : coverLine(cover.title)}
                      </span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tv-row" aria-labelledby="tv-row-continue">
        <div className="tv-row-head">
          <h3 id="tv-row-continue">Continue · from other apps</h3>
          <span>My videos, Highlights, Channels, Lo-fi radio</span>
        </div>
        <ul className="tv-covers">
          {continued.map((item, col) => (
            <li key={item.id}>
              <button
                type="button"
                className="tv-cover is-wide"
                aria-label={[
                  `${tvApp(item.app).label}: ${item.title}`,
                  tvApp(item.app).sample && "sample pick",
                ]
                  .filter(Boolean)
                  .join(", ")}
                aria-current={hero.title === item && !hero.entry}
                onClick={() => setHero({ title: item })}
                {...remoteProps(CONTINUE, col, 0)}
              >
                <CoverArt title={item} wide />
                <span className="tv-cover-title">{item.title}</span>
                <span className="tv-cover-line">
                  {item.caption ?? tvApp(item.app).label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="tv-hints" aria-label="Remote keys">
        <span>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>Enter</Kbd> select · twice opens a collection
        </span>
        <span>
          <Kbd>Esc</Kbd> camera back to the room
        </span>
      </footer>
    </div>
  );
}
