// The living-room TV's library (tv-home-screen T2, S1, S3): the apps on the
// dock, their titles and the "Continue" row. Pure data for tv-screen.ts.
// Real covers come from the generated tv-covers.ts (TMDB posters, IGDB game
// covers, shipped locally); each title's motif is the drawn fallback.
// No YouTube ids yet, so nothing here loads a third-party embed.

export type TvAppId =
  | "movies"
  | "games"
  | "videos"
  | "channels"
  | "anime"
  | "highlights"
  | "radio";

/** The drawn cover art where no real cover exists or while it loads. */
export const COVER_MOTIFS = [
  "moon",
  "ring",
  "dune",
  "grid",
  "dots",
  "diag",
  "bars",
  "split",
  "horizon",
] as const;
export type CoverMotif = (typeof COVER_MOTIFS)[number];

/** One film or game inside a collection cover. */
export interface TvEntry {
  title: string;
  year: number;
}

export interface TvTitle {
  /** Unique across the library. */
  id: string;
  app: TvAppId;
  title: string;
  /** Release year; collections take their span from `films`. */
  year?: number;
  /** Meta line under the hero title; collections derive theirs. */
  meta?: string;
  /** The cover's bottom line when there is no year (channels, clips). */
  caption?: string;
  motif: CoverMotif;
  favourite?: boolean;
  /** A saga or body of work: one cover that opens to its entries. */
  films?: readonly TvEntry[];
  /** The owner's word on a collection, shown with its count. */
  collectionNote?: string;
  /** The owner's own "Why I love it" words; never invented. */
  note?: { text: string; draft: boolean };
  /** A local clip, played muted with controls. */
  video?: { src: string; poster: string; label: string };
  /** Still waiting for the owner to name or confirm it. */
  confirm?: boolean;
}

export interface TvApp {
  id: TvAppId;
  label: string;
  /** Rows still without the owner's picks: "Sample picks · replace with yours". */
  sample: boolean;
  /** Dock line in place of the computed count. */
  count?: string;
  titles: readonly TvTitle[];
}

const films = (...entries: [string, number][]): TvEntry[] =>
  entries.map(([title, year]) => ({ title, year }));

export const TV_APPS: readonly TvApp[] = [
  {
    id: "movies",
    label: "Movies & Series",
    sample: false,
    titles: [
      {
        id: "harry-potter",
        app: "movies",
        title: "Harry Potter",
        motif: "moon",
        films: films(
          ["Harry Potter and the Philosopher's Stone", 2001],
          ["Harry Potter and the Chamber of Secrets", 2002],
          ["Harry Potter and the Prisoner of Azkaban", 2004],
          ["Harry Potter and the Goblet of Fire", 2005],
          ["Harry Potter and the Order of the Phoenix", 2007],
          ["Harry Potter and the Half-Blood Prince", 2009],
          ["Harry Potter and the Deathly Hallows – Part 1", 2010],
          ["Harry Potter and the Deathly Hallows – Part 2", 2011],
        ),
      },
      {
        id: "pirates-of-the-caribbean",
        app: "movies",
        title: "Pirates of the Caribbean",
        motif: "horizon",
        films: films(
          ["The Curse of the Black Pearl", 2003],
          ["Dead Man's Chest", 2006],
          ["At World's End", 2007],
          ["On Stranger Tides", 2011],
          ["Dead Men Tell No Tales", 2017],
        ),
      },
      {
        id: "quentin-tarantino",
        app: "movies",
        title: "Quentin Tarantino",
        motif: "split",
        collectionNote: "all of them, favourites",
        films: films(
          ["Reservoir Dogs", 1992],
          ["Pulp Fiction", 1994],
          ["Jackie Brown", 1997],
          ["Kill Bill: Vol. 1", 2003],
          ["Kill Bill: Vol. 2", 2004],
          ["Death Proof", 2007],
          ["Inglourious Basterds", 2009],
          ["Django Unchained", 2012],
          ["The Hateful Eight", 2015],
          ["Once Upon a Time in Hollywood", 2019],
        ),
      },
      {
        id: "jim-carrey",
        app: "movies",
        title: "Jim Carrey",
        motif: "dots",
        films: films(
          ["Ace Ventura: Pet Detective", 1994],
          ["The Mask", 1994],
          ["Dumb and Dumber", 1994],
          ["Liar Liar", 1997],
          ["The Truman Show", 1998],
          ["How the Grinch Stole Christmas", 2000],
          ["Bruce Almighty", 2003],
          ["Eternal Sunshine of the Spotless Mind", 2004],
          ["Yes Man", 2008],
        ),
      },
      {
        id: "american-football-films",
        app: "movies",
        title: "American football films",
        motif: "grid",
        films: films(
          ["Remember the Titans", 2000],
          ["The Blind Side", 2009],
          ["Any Given Sunday", 1999],
          // The owner knows it by its team's name, "La máquina del mal".
          ["The Longest Yard", 2005],
        ),
      },
      {
        id: "perfume",
        app: "movies",
        title: "Perfume: The Story of a Murderer",
        year: 2006,
        meta: "Tom Tykwer · 2006 · film",
        motif: "dune",
      },
      {
        id: "f1",
        app: "movies",
        title: "F1",
        year: 2025,
        meta: "Joseph Kosinski · 2025 · film",
        motif: "bars",
      },
      {
        // "Jack, the animated one" in the owner's words.
        id: "nightmare-before-christmas",
        app: "movies",
        title: "The Nightmare Before Christmas",
        year: 1993,
        meta: "Henry Selick · 1993 · stop-motion film",
        motif: "ring",
      },
    ],
  },
  {
    id: "games",
    label: "Games",
    sample: false,
    titles: [
      {
        id: "ghost-of-tsushima",
        app: "games",
        title: "Ghost of Tsushima",
        year: 2020,
        meta: "Sucker Punch · 2020 · PS4 / PS5 / PC · open-world samurai",
        motif: "moon",
        favourite: true,
      },
      {
        id: "gta-san-andreas",
        app: "games",
        title: "Grand Theft Auto: San Andreas",
        year: 2004,
        meta: "Rockstar North · 2004 · PS2",
        motif: "horizon",
      },
      {
        id: "god-of-war",
        app: "games",
        title: "God of War",
        meta: "Santa Monica Studio · series since 2005",
        caption: "Series",
        motif: "diag",
      },
      {
        id: "hitman",
        app: "games",
        title: "Hitman",
        motif: "bars",
        collectionNote: "all of them",
        films: films(
          ["Hitman: Codename 47", 2000],
          ["Hitman 2: Silent Assassin", 2002],
          ["Hitman: Contracts", 2004],
          ["Hitman: Blood Money", 2006],
          ["Hitman: Absolution", 2012],
          ["Hitman", 2016],
          ["Hitman 2", 2018],
          ["Hitman 3", 2021],
        ),
      },
    ],
  },
  {
    id: "videos",
    label: "My videos",
    sample: false,
    titles: [
      {
        id: "carneros-dc-32-clip",
        app: "videos",
        title: "Carneros DC #32 · game clip",
        meta: "Bogotá · my own clip · 24 s, muted",
        caption: "My videos · own clip",
        motif: "grid",
        // Shipped with the football case's story (case-stories.ts).
        video: {
          src: "/world/stories/carneros-dc-32-clip.mp4",
          poster: "/world/stories/carneros-dc-32-clip-poster.jpg",
          label:
            "Carneros DC game clip: the black and gold defense on the field in Bogotá",
        },
      },
    ],
  },
  {
    id: "channels",
    label: "Channels",
    sample: false,
    titles: [
      ["midudev", "ring"],
      ["Gentleman Programming", "split"],
      ["Fazt", "grid"],
      ["Dalto", "dots"],
      ["Theo (t3.gg)", "diag"],
    ].map(([title, motif]) => ({
      id: `channel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      app: "channels" as const,
      title,
      meta: "YouTube channel",
      caption: "Channels · YouTube",
      motif: motif as CoverMotif,
    })),
  },
  {
    id: "anime",
    label: "Anime",
    sample: true,
    titles: [
      ["Cowboy Bebop", 1998, "horizon"],
      ["Spirited Away", 2001, "dune"],
      ["Attack on Titan", 2013, "diag"],
      ["Demon Slayer", 2019, "moon"],
    ].map(([title, year, motif]) => ({
      id: `anime-${String(title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`,
      app: "anime" as const,
      title: String(title),
      year: Number(year),
      meta: `${year} · sample pick`,
      motif: motif as CoverMotif,
    })),
  },
  {
    id: "highlights",
    label: "Highlights",
    sample: true,
    count: "NFL · Jordan",
    titles: [
      {
        id: "highlights-jordan",
        app: "highlights",
        title: "Michael Jordan · career",
        meta: "Highlights · sample pick",
        caption: "Highlights · YouTube",
        motif: "bars",
      },
      {
        id: "highlights-nfl",
        app: "highlights",
        title: "NFL · week highlights",
        meta: "Highlights · sample pick",
        caption: "Highlights · YouTube",
        motif: "diag",
      },
    ],
  },
  {
    id: "radio",
    label: "Lo-fi radio",
    sample: false,
    count: "Five lo-fi loops",
    titles: [
      {
        id: "lofi-radio",
        app: "radio",
        title: "Lo-fi radio",
        meta: "Five local lo-fi loops on the shelf speakers",
        caption: "On the speakers",
        motif: "horizon",
      },
    ],
  },
];

/** The hero's title when the TV opens. */
export const TV_FEATURED = "ghost-of-tsushima";

/** "Continue · from other apps": the clip, highlights, a channel, the radio. */
export const TV_CONTINUE: readonly string[] = [
  "carneros-dc-32-clip",
  "highlights-jordan",
  "highlights-nfl",
  "channel-midudev",
  "lofi-radio",
];

const BY_ID = new Map(
  TV_APPS.flatMap((app) => app.titles).map((title) => [title.id, title]),
);

export function tvTitle(id: string): TvTitle {
  const title = BY_ID.get(id);
  if (!title) throw new RangeError(`Unknown TV title: ${id}`);
  return title;
}

export function tvApp(id: TvAppId): TvApp {
  const app = TV_APPS.find((entry) => entry.id === id);
  if (!app) throw new RangeError(`Unknown TV app: ${id}`);
  return app;
}

/** The dock's second line: picks, clips or channels, unless set. */
export function appCount(app: TvApp): string {
  if (app.count) return app.count;
  const n = app.titles.length;
  if (app.id === "videos") return `${n} clip${n === 1 ? "" : "s"}`;
  if (app.id === "channels") return `${n} channel${n === 1 ? "" : "s"}`;
  return `${n} pick${n === 1 ? "" : "s"}`;
}

/** What a collection holds: films, or games in the Games app. */
export function entryUnit(title: TvTitle): string {
  return title.app === "games" ? "games" : "films";
}

/** The hero's meta line; collections give their count and span. */
export function titleMeta(title: TvTitle): string {
  if (title.meta) return title.meta;
  const entries = title.films ?? [];
  if (entries.length === 0) return title.year ? String(title.year) : "";
  const years = entries.map((entry) => entry.year);
  const parts = [
    `Collection · ${entries.length} ${entryUnit(title)}`,
    `${Math.min(...years)}–${Math.max(...years)}`,
  ];
  if (title.collectionNote) parts.push(title.collectionNote);
  return parts.join(" · ");
}

/** A cover's bottom line: year, entry count or caption. */
export function coverLine(title: TvTitle): string {
  if (title.films) return `${title.films.length} ${entryUnit(title)}`;
  if (title.year) return String(title.year);
  return title.caption ?? "";
}
