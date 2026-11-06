// The short personal story beside an inspected display case
// (collection-display-models T10, T11; design/collection-case-story/01).
// Only what the owner told is written here; a case without a story shows
// none. Media lists only files shipped under public/world/stories/, so the
// card never shows a placeholder slot.
import type { DisplayItemId } from "./display-cases.ts";

export interface CaseStoryMedia {
  kind: "photo" | "clip";
  /** Public path under /world/stories/. */
  src: string;
  /** What the photo or clip shows. */
  alt: string;
  /** Still frame for a clip, shown under reduced motion. */
  poster?: string;
  /** CSS object-position: the part kept when the slot crops it. */
  focus?: string;
}

/** The owner as a player: number, positions, seasons and team. */
export interface CaseStoryPlayer {
  number: string;
  positions: readonly { code: string; label: string }[];
  seasons: number;
  joined: { date: string; label: string; team: string };
}

export interface CaseStory {
  kicker: string;
  title: string;
  subtitle: string;
  player?: CaseStoryPlayer;
  /** Dated steps, oldest first. */
  timeline: readonly { date: string; label: string; text: string }[];
  lede: string;
  /** Up to three: the first one leads the grid. */
  media: readonly CaseStoryMedia[];
  link?: { label: string; href: string };
}

/**
 * The short card beside the wall katana (katana-wall-shelf T5), styled like
 * the lo-fi music console: a line from the owner and the model's credit.
 */
export interface WallStory {
  kicker: string;
  title: string;
  lede: string;
  /** "3D model by" and the author, linked to their profile. */
  credit: { text: string; name: string; href: string };
}

export const CASE_STORIES: Record<DisplayItemId, CaseStory | null> & {
  katana: WallStory;
} = {
  "football-helmet": {
    kicker: "CASE 01 · FOOTBALL HELMET",
    title: "Carneros DC",
    subtitle: "Bogotá, Colombia · Defensive back",
    player: {
      number: "#32",
      positions: [
        { code: "FS", label: "Free safety" },
        { code: "SS", label: "Strong safety" },
        { code: "CB", label: "Cornerback" },
      ],
      seasons: 12,
      joined: { date: "2022-01", label: "Jan 2022", team: "Carneros DC" },
    },
    timeline: [
      { date: "2014", label: "2014", text: "First season" },
      { date: "2022-01", label: "JAN 2022", text: "Joined Carneros DC" },
      // Copa Andina's Instagram announcement of the Bogotá Bowl (Oct 2024).
      {
        date: "2024-10-26",
        label: "OCT 2024",
        text: "Bogotá Bowl vs USA All-Stars",
      },
      { date: "2026", label: "2026", text: "Season 12" },
    ],
    lede: "Carneros means rams, so this helmet wears gold and black horns. Twelve years in, I line up deep at free or strong safety, or press at cornerback, always as #32.",
    // The owner's own photo (@kevnnard on Instagram), 720 px; the clip was
    // filmed by their sister (@moonsunwitch_), with permission: 360 px,
    // muted, 24 s.
    media: [
      {
        kind: "photo",
        src: "/world/stories/carneros-dc-32-photo.jpg",
        alt: "Kevnnard kneeling on the field in the gold Carneros DC helmet and black jersey",
        focus: "50% 22%",
      },
      {
        kind: "clip",
        src: "/world/stories/carneros-dc-32-clip.mp4",
        poster: "/world/stories/carneros-dc-32-clip-poster.jpg",
        alt: "Carneros DC game clip: the black and gold defense on the field in Bogotá",
        focus: "50% 60%",
      },
    ],
    link: {
      label: "@carneros_dc on Instagram",
      href: "https://www.instagram.com/carneros_dc/",
    },
  },
  "moto-helmet": null,
  "jordan-1": null,
  // Only the owner's words: their love of Japanese culture, and Mitchell
  // Bekke's credit for the model.
  katana: {
    kicker: "WALL · KATANA",
    title: "Blossom Katana",
    lede: "Japanese culture pulls me in, above all its feudal era, the age of the samurai. Ghost of Tsushima is my favorite game, and these katanas are my nod to that love of the East.",
    credit: {
      text: "3D model by",
      name: "Mitchell Bekke",
      href: "https://sketchfab.com/MitchellBekke",
    },
  },
};
