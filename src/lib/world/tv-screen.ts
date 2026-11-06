// Kevnnard TV on the living-room TV's glass (tv-home-screen T3, S6): the
// home screen of artboard 01-tv-os-overlay laid out for the 16:9 panel. The
// remote's state, what a press does, and where every item sits on the
// 1600 x 896 canvas. Pure data for TvScreen.tsx (drawing and clicks on the
// panel) and TvHome.tsx (the keyboard companion). Covers are the shipped
// TMDB and IGDB images of tv-covers.ts (T7, S7); the drawn motif stays where
// there is none, and under an image until it loads.

import { coverKey, TV_COVERS } from "./tv-covers.ts";
import { moveRemote, type RemotePosition } from "./tv-focus.ts";
import {
  appCount,
  type CoverMotif,
  coverLine,
  entryUnit,
  TV_APPS,
  TV_CONTINUE,
  TV_FEATURED,
  type TvAppId,
  type TvEntry,
  type TvTitle,
  titleMeta,
  tvApp,
  tvTitle,
} from "./tv-library.ts";

/** Layout pixels of the screen: the glass's 1 x 0.56 m at 1600 px/m. */
export const TV_SCREEN_W = 1600;
export const TV_SCREEN_H = 896;

/** The remote's rows, as region id prefixes: `dock:2`, `cover:0`, … */
const ROWS = ["dock", "cover", "continue"] as const;
const DOCK = 0;
const COVERS = 1;
const CONTINUE = 2;

const PAD = 56;
const GAP = 16;
const BACK = { w: 200, h: 44, y: 28 };
const DOCK_BOX = { y: 92, h: 100, gap: 12 };
const HERO = { y: 212, artW: 448, artH: 252 };
const ACTIONS = { h: 48, primaryW: 264, secondaryW: 380, gap: 12 };
const COVER = { y: 512, w: 136, h: 184 };
const WIDE = { y: 744, w: 220, h: 112 };

export const TV_LAYOUT = {
  pad: PAD,
  brandY: 50,
  heroKickerY: 236,
  heroTitleY: 290,
  heroMetaY: 336,
  heroNoteY: 372,
  coversHeadY: 492,
  continueHeadY: 724,
  hintY: 878,
} as const;

/** What the remote holds: the app, an opened collection, the hero and focus. */
export interface TvHomeState {
  app: TvAppId;
  /** The collection open in the cover row, by title id. */
  opened: string | null;
  /** The hero's title id, and the picked entry of an opened collection. */
  hero: { id: string; entry?: number };
  pos: RemotePosition;
}

/** What a press asks of the world beyond the screen. */
export type TvEffect = "exit" | "clip" | "music" | null;

export interface TvScreenOptions {
  /** The camera holds the TV: the remote ring shows and input is taken. */
  active: boolean;
  /** The world clock, "HH:MM". */
  clock: string;
  /** The shelf speakers' lo-fi stream. */
  music: { playing: boolean; track: string | null };
  /** The owner's clip is playing on the screen. */
  clipPlaying: boolean;
}

export interface TvRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TvDockItem extends TvRegion {
  app: TvAppId;
  label: string;
  count: string;
  current: boolean;
}

export interface TvCoverItem extends TvRegion {
  kind: "title" | "entry" | "back";
  title: string;
  line: string;
  motif: CoverMotif;
  /** The shipped cover image, or null to draw the motif. */
  cover: string | null;
  favourite: boolean;
  collection: boolean;
  picked: boolean;
  /** On screen; covers scrolled past the row's ends take no clicks. */
  visible: boolean;
  /** The accessible name, for the companion's button. */
  label: string;
}

export interface TvHero {
  kicker: string;
  title: string;
  meta: string;
  note: { label: string; text: string } | null;
  primary: string | null;
  secondary: string | null;
  motif: CoverMotif;
  /** The title's or picked entry's shipped cover; null for the clip. */
  cover: string | null;
  video: string | null;
  poster: string | null;
  videoLabel: string | null;
  art: TvRegion;
}

export interface TvScreenLayout {
  status: string;
  clock: string;
  back: TvRegion;
  dock: TvDockItem[];
  hero: TvHero;
  coversHeading: string;
  coversNote: string;
  sampleTag: string | null;
  covers: TvCoverItem[];
  continuedHeading: string;
  continuedNote: string;
  continued: TvCoverItem[];
  /** Everything a click or tap can hit, in drawing order. */
  regions: TvRegion[];
  /** The region under the remote's focus ring, while active. */
  ring: string | null;
  hint: string;
}

type Cover =
  | { kind: "title"; title: TvTitle }
  | { kind: "entry"; title: TvTitle; entry: TvEntry; index: number }
  | { kind: "back"; title: TvTitle };

/** A shipped cover under public/world/tv/covers/, never a remote URL. */
const SHIPPED_COVER = /^\/world\/tv\/covers\/[a-z0-9-]+\.webp$/;

/** The manifest's cover of a title, or of one entry of its collection. */
export function tvCoverSrc(title: TvTitle, entry?: TvEntry): string | null {
  const key = entry ? coverKey(title.id, entry) : title.id;
  if (!Object.hasOwn(TV_COVERS, key)) return null;
  const { src } = TV_COVERS[key];
  return SHIPPED_COVER.test(src) ? src : null;
}

/** The screen as the room first sees it: Ghost of Tsushima in the hero. */
export function initialTvHome(): TvHomeState {
  const featured = tvTitle(TV_FEATURED);
  return {
    app: featured.app,
    opened: null,
    hero: { id: featured.id },
    pos: { row: COVERS, col: tvApp(featured.app).titles.indexOf(featured) },
  };
}

function coversOf(state: TvHomeState): Cover[] {
  if (state.opened) {
    const opened = tvTitle(state.opened);
    return [
      { kind: "back", title: opened },
      ...(opened.films ?? []).map((entry, index) => ({
        kind: "entry" as const,
        title: opened,
        entry,
        index,
      })),
    ];
  }
  return tvApp(state.app).titles.map((title) => ({
    kind: "title" as const,
    title,
  }));
}

const rowLengths = (state: TvHomeState) => [
  TV_APPS.length,
  coversOf(state).length,
  TV_CONTINUE.length,
];

/** One arrow press on the remote; null for any other key. */
export function tvMove(state: TvHomeState, key: string): TvHomeState | null {
  const pos = moveRemote(state.pos, key, rowLengths(state));
  return pos ? { ...state, pos } : null;
}

/** The region id under the remote's position. */
export const tvRegionId = ({ row, col }: RemotePosition) =>
  `${ROWS[row]}:${col}`;

type Primary = "open" | "clip" | "music" | null;

function primaryOf(state: TvHomeState): Primary {
  const title = tvTitle(state.hero.id);
  if (
    title.films &&
    state.hero.entry === undefined &&
    state.opened !== title.id
  )
    return "open";
  if (title.video) return "clip";
  if (title.app === "radio") return "music";
  return null;
}

function runPrimary(state: TvHomeState): {
  state: TvHomeState;
  effect: TvEffect;
} {
  const primary = primaryOf(state);
  if (primary === "open") {
    const title = tvTitle(state.hero.id);
    return {
      state: {
        app: title.app,
        opened: title.id,
        hero: { id: title.id },
        pos: { row: COVERS, col: 1 },
      },
      effect: null,
    };
  }
  return { state, effect: primary };
}

/**
 * Pressing a region (a click on the panel, Enter or a companion button):
 * a dock app switches the cover row; a cover is picked into the hero, and
 * pressed again where the remote already sits it runs the hero's primary
 * action (open the collection, play the clip, play the radio); the back
 * cover closes a collection; Back leaves. Trailers and channels are
 * "coming soon" and do nothing.
 */
export function tvHomeAction(
  state: TvHomeState,
  id: string,
): { state: TvHomeState; effect: TvEffect } {
  const same = { state, effect: null };
  if (id === "back") return { state, effect: "exit" };
  if (id === "primary") return runPrimary(state);
  const [name, index] = id.split(":");
  const row = ROWS.indexOf(name as (typeof ROWS)[number]);
  const col = Number(index);
  if (row < 0 || !Number.isInteger(col) || col < 0) return same;
  const pos = { row, col };
  const again = (titleId: string) =>
    state.hero.id === titleId &&
    state.hero.entry === undefined &&
    state.pos.row === row &&
    state.pos.col === col;

  if (row === DOCK) {
    const app = TV_APPS[col];
    if (!app) return same;
    const hero = app.titles.find((title) => title.favourite) ?? app.titles[0];
    return {
      state: { app: app.id, opened: null, hero: { id: hero.id }, pos },
      effect: null,
    };
  }
  if (row === CONTINUE) {
    const item = TV_CONTINUE[col];
    if (!item) return same;
    if (again(item)) return runPrimary(state);
    return { state: { ...state, hero: { id: item }, pos }, effect: null };
  }
  const cover = coversOf(state)[col];
  if (!cover) return same;
  if (cover.kind === "back")
    return {
      state: {
        ...state,
        opened: null,
        hero: { id: cover.title.id },
        pos: {
          row: COVERS,
          col: tvApp(cover.title.app).titles.indexOf(cover.title),
        },
      },
      effect: null,
    };
  if (cover.kind === "entry")
    return {
      state: {
        ...state,
        hero: { id: cover.title.id, entry: cover.index },
        pos,
      },
      effect: null,
    };
  if (again(cover.title.id)) return runPrimary(state);
  return {
    state: { ...state, hero: { id: cover.title.id }, pos },
    effect: null,
  };
}

/** A row of covers from `x0`, scrolled so `focus` stays fully on screen. */
function placeRow(count: number, width: number, focus: number) {
  const visible = Math.max(
    1,
    Math.floor((TV_SCREEN_W - 2 * PAD + GAP) / (width + GAP)),
  );
  const start = Math.min(
    Math.max(focus - visible + 1, 0),
    Math.max(count - visible, 0),
  );
  return (i: number) => ({
    x: PAD + (i - start) * (width + GAP),
    visible: i >= start && i < start + visible,
  });
}

function heroOf(
  state: TvHomeState,
  options: TvScreenOptions,
): Omit<TvHero, "art"> {
  const title = tvTitle(state.hero.id);
  const entry =
    state.hero.entry === undefined
      ? undefined
      : title.films?.[state.hero.entry];
  const app = tvApp(title.app);
  const collection = title.films;
  const radio = title.app === "radio";
  const kicker = entry
    ? `${title.title} · ${(state.hero.entry ?? 0) + 1} of ${collection?.length ?? 1}`
    : [
        app.label,
        title.favourite && "my favourite",
        collection && "collection",
        app.sample && "sample pick",
      ]
        .filter(Boolean)
        .join(" · ");
  const meta = entry
    ? `${entry.year} · ${entryUnit(title) === "games" ? "game" : "film"}`
    : radio
      ? options.music.playing
        ? `Playing${options.music.track ? ` “${options.music.track}”` : ""} on the shelf speakers`
        : "Paused · five local lo-fi loops on the shelf speakers"
      : titleMeta(title);
  const primary = primaryOf(state);
  return {
    kicker,
    title: entry ? entry.title : title.title,
    meta,
    note:
      title.note && !entry
        ? {
            label: `Why I love it${title.note.draft ? " · draft, owner to confirm" : ""}`,
            text: title.note.text,
          }
        : null,
    primary:
      primary === "open"
        ? "Open collection"
        : primary === "clip"
          ? options.clipPlaying
            ? "Pause clip"
            : "Play clip · muted"
          : primary === "music"
            ? options.music.playing
              ? "Pause the speakers"
              : "Play on the speakers"
            : null,
    secondary:
      title.app === "channels"
        ? "Open channel · YouTube · coming soon"
        : title.app === "highlights"
          ? "Watch on YouTube · coming soon"
          : title.app === "videos" || radio
            ? null
            : "Watch trailer · YouTube · coming soon",
    motif: title.motif,
    cover: title.video ? null : tvCoverSrc(title, entry),
    video: title.video?.src ?? null,
    poster: title.video?.poster ?? null,
    videoLabel: title.video?.label ?? null,
  };
}

/** Where everything sits on the screen, and what it says. */
export function tvScreenLayout(
  state: TvHomeState,
  options: TvScreenOptions,
): TvScreenLayout {
  const app = tvApp(state.app);
  const opened = state.opened ? tvTitle(state.opened) : null;
  const back: TvRegion = {
    id: "back",
    x: TV_SCREEN_W - PAD - BACK.w,
    y: BACK.y,
    w: BACK.w,
    h: BACK.h,
  };

  const dockW = (TV_SCREEN_W - 2 * PAD - 6 * DOCK_BOX.gap) / 7;
  const dock = TV_APPS.map((entry, col) => ({
    id: `dock:${col}`,
    x: PAD + col * (dockW + DOCK_BOX.gap),
    y: DOCK_BOX.y,
    w: dockW,
    h: DOCK_BOX.h,
    app: entry.id,
    label: entry.label,
    count: appCount(entry),
    current: entry.id === state.app,
  }));

  const heroText = heroOf(state, options);
  const art: TvRegion = {
    id: "art",
    x: TV_SCREEN_W - PAD - HERO.artW,
    y: HERO.y,
    w: HERO.artW,
    h: HERO.artH,
  };
  const actionsY = heroText.note
    ? TV_LAYOUT.heroNoteY + 48
    : TV_LAYOUT.heroMetaY + 40;
  const actions: TvRegion[] = [];
  if (heroText.primary)
    actions.push({
      id: "primary",
      x: PAD,
      y: actionsY,
      w: ACTIONS.primaryW,
      h: ACTIONS.h,
    });
  if (heroText.secondary)
    actions.push({
      id: "secondary",
      x: actions.length ? PAD + ACTIONS.primaryW + ACTIONS.gap : PAD,
      y: actionsY,
      w: ACTIONS.secondaryW,
      h: ACTIONS.h,
    });

  const coverList = coversOf(state);
  const pickedCol = coverList.findIndex((cover) =>
    cover.kind === "entry"
      ? state.hero.entry === cover.index
      : cover.kind === "title" &&
        state.hero.id === cover.title.id &&
        state.hero.entry === undefined,
  );
  const coverAt = placeRow(
    coverList.length,
    COVER.w,
    state.pos.row === COVERS ? state.pos.col : Math.max(pickedCol, 0),
  );
  const covers: TvCoverItem[] = coverList.map((cover, col) => {
    const place = coverAt(col);
    const base = {
      id: `cover:${col}`,
      x: place.x,
      y: COVER.y,
      w: COVER.w,
      h: COVER.h,
      visible: place.visible,
      motif: cover.title.motif,
      cover:
        cover.kind === "back"
          ? null
          : tvCoverSrc(
              cover.title,
              cover.kind === "entry" ? cover.entry : undefined,
            ),
      picked: col === pickedCol,
    };
    if (cover.kind === "back")
      return {
        ...base,
        kind: "back",
        title: "←",
        line: `All ${app.label}`,
        favourite: false,
        collection: false,
        label: `Back to ${app.label}`,
      };
    if (cover.kind === "entry")
      return {
        ...base,
        kind: "entry",
        title: cover.entry.title,
        line: String(cover.entry.year),
        favourite: false,
        collection: false,
        label: `${cover.entry.title}, ${cover.entry.year}`,
      };
    const { title } = cover;
    return {
      ...base,
      kind: "title",
      title: title.title,
      line: coverLine(title),
      favourite: Boolean(title.favourite),
      collection: Boolean(title.films),
      label: [
        title.title,
        coverLine(title),
        title.favourite && "my favourite",
        title.films && "collection",
        app.sample && "sample pick",
      ]
        .filter(Boolean)
        .join(", "),
    };
  });

  const continuedAt = placeRow(
    TV_CONTINUE.length,
    WIDE.w,
    state.pos.row === CONTINUE ? state.pos.col : 0,
  );
  const continued: TvCoverItem[] = TV_CONTINUE.map((id, col) => {
    const title = tvTitle(id);
    const owner = tvApp(title.app);
    const place = continuedAt(col);
    return {
      id: `continue:${col}`,
      x: place.x,
      y: WIDE.y,
      w: WIDE.w,
      h: WIDE.h,
      visible: place.visible,
      kind: "title",
      title: title.title,
      line: title.caption ?? owner.label,
      motif: title.motif,
      // The owner's clip shows its own local poster.
      cover: title.video?.poster ?? tvCoverSrc(title),
      favourite: false,
      collection: false,
      picked: state.hero.id === id && state.hero.entry === undefined,
      label: [`${owner.label}: ${title.title}`, owner.sample && "sample pick"]
        .filter(Boolean)
        .join(", "),
    };
  });

  const { music } = options;
  return {
    status: music.playing
      ? `♪ ${music.track ?? "Lo-fi radio"} on the speakers`
      : "♪ Lo-fi radio paused",
    clock: options.clock,
    back,
    dock,
    hero: { ...heroText, art },
    coversHeading: opened ? opened.title : app.label,
    coversNote: opened
      ? `${opened.films?.length ?? 0} ${entryUnit(opened)}${opened.collectionNote ? ` · ${opened.collectionNote}` : ""}`
      : app.id === "movies"
        ? "posters from TMDB · see Credits"
        : app.id === "games"
          ? "covers from IGDB · see Credits"
          : "drawn covers",
    sampleTag:
      !opened && app.sample ? "Sample picks · replace with yours" : null,
    covers,
    continuedHeading: "Continue · from other apps",
    continuedNote: "My videos, Highlights, Channels, Lo-fi radio",
    continued,
    regions: [
      back,
      ...dock,
      ...actions,
      ...covers.filter((cover) => cover.visible),
      ...continued.filter((cover) => cover.visible),
    ],
    ring: options.active ? tvRegionId(state.pos) : null,
    hint: options.active
      ? "← → ↑ ↓ move · Enter select, again to open or play · Esc back to the room"
      : "Kevnnard TV · Click or tap the TV to use it",
  };
}

/**
 * Every image the screen can draw for `layout`, once each: the hero's cover
 * and clip poster, then both rows (scrolled-off covers too, so scrolling
 * never waits). Only the shipped covers and the clip's local poster.
 */
export function tvImageSources(layout: TvScreenLayout): string[] {
  const sources = [
    layout.hero.cover,
    layout.hero.poster,
    ...layout.covers.map((item) => item.cover),
    ...layout.continued.map((item) => item.cover),
  ];
  return [
    ...new Set(
      sources.filter((src): src is string => Boolean(src?.startsWith("/"))),
    ),
  ];
}

/** The world clock as the top bar shows it, "HH:MM". */
export function tvClock(hours: number): string {
  const minutes = Math.floor((((hours % 24) + 24) % 24) * 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A UV on the glass (v up) to layout pixels (y down). */
export const tvUvToCanvas = (u: number, v: number) => ({
  x: u * TV_SCREEN_W,
  y: (1 - v) * TV_SCREEN_H,
});

/** The region under layout pixel (x, y), or null. */
export function tvHitAt(
  layout: TvScreenLayout,
  x: number,
  y: number,
): string | null {
  return (
    layout.regions.find(
      (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
    )?.id ?? null
  );
}
