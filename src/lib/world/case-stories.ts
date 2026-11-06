// The short personal story beside an inspected display case
// (collection-display-models T10, T11; design/collection-case-story/01).
// Only what the owner told is written here; a case without a story shows
// none. Media lists only files shipped under public/world/stories/, so the
// card never shows a placeholder slot.
import type { GalleryItemId } from "./display-cases.ts";

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
 * The short card styled like the lo-fi music console (katana-wall-shelf T5,
 * T11, T13): the owner's words, beside a framed print when there is one
 * (the katana's). The models' and the print's credits live in the menu's
 * Credits only (S9).
 */
export interface WallStory {
  kicker: string;
  title: string;
  paragraphs: readonly string[];
  /** A shipped file under /world/stories/, credited in credits.json. */
  image?: { src: string; alt: string };
}

/**
 * Every gallery item's story; null while the owner has not told it. Kickers
 * carry the collection rail's numbers, in room order (T14).
 */
export const CASE_STORIES: Record<
  GalleryItemId,
  CaseStory | WallStory | null
> & {
  "football-helmet": CaseStory;
  katana: WallStory & { image: { src: string; alt: string } };
} = {
  "football-helmet": {
    kicker: "CASE 04 · FOOTBALL HELMET",
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
  // The owner's words (S11): the motocross dream behind their first helmet.
  "moto-helmet": {
    kicker: "CASE 03 · OFF-ROAD HELMET",
    title: "Fox V1 · F-A18",
    paragraphs: [
      "Ever since I was a kid I wanted my first motorcycle to be a motocross bike, and I dreamed of racing. I never got the chance, but the love for it never left.",
      "So my first helmet was this one, the Fox V1 Sayak. It lives here in my museum corner, where I will keep it for good: a reminder of that kid's dream.",
    ],
  },
  // The owner's words (S11): Michael Jordan, and the brand ever since.
  "jordan-1": {
    kicker: "CASE 02 · AIR JORDAN 1",
    title: "My first Jordans",
    paragraphs: [
      "I grew up watching the brand and the player behind it: Michael Jordan, one of the greatest athletes sport has ever seen, simply exceptional at what he did.",
      "The day I bought my first original pair of Jordans, that admiration turned into a passion. Jordan and Nike became my brand for everything: the clothes I wear, the shoes I walk in, the cleats I play in.",
    ],
  },
  // Only the owner's words: their love of Japanese culture. The print is
  // Utagawa Kuniyoshi's public-domain Uesugi Kenshin (1843-1844, Wikimedia
  // Commons), 524 x 720 WebP.
  katana: {
    kicker: "WALL 01 · KATANA",
    title: "Blossom Katana",
    paragraphs: [
      "Japanese culture pulls me in, above all its feudal era: the age of the samurai, when honor, discipline and the blade shaped a whole way of living.",
      "Ghost of Tsushima is my favorite game. It captures that world like nothing else, from the wind sweeping the fields to the silence before a duel. These katanas are my nod to that love of the East, a small piece of it on my wall.",
    ],
    image: {
      src: "/world/stories/katana-ukiyoe.webp",
      alt: "Ukiyo-e print by Utagawa Kuniyoshi of the samurai lord Uesugi Kenshin, seated in blue lacquered armour and a white head cowl, a sword at his side",
    },
  },
  // Still being written by the owner (T15): no card, not an empty one.
  "collection-shelf": null,
};
