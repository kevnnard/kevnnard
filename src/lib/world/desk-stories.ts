// Desk things with a short story rather than a shop link (coffee-card T1-T3):
// the side card beside the inspected mug, laid out like the football
// helmet's story card. Only what the owner confirmed or the researched facts
// in odd/tasks/coffee-card.md L2-L3 are written here; no third-party images
// or requests.
import type { CaseStoryMedia } from "./case-stories.ts";

export interface DeskStory {
  kicker: string;
  title: string;
  /** One short line in the owner's words, under the title. */
  subtitle: string;
  /** The stats strip: origin, altitude and variety. */
  stats: readonly { label: string; value: string }[];
  /** The growing band (metres above sea level) the altitude diagram marks. */
  altitude: { low: number; high: number };
  /** Processes of the coffee, each with a short tasting note. */
  processes: readonly { name: string; note: string }[];
  /** The variety's typical cup profile, as short tasting chips (T3). */
  profile: readonly string[];
  /** One line about the cup on the desk (T3); its credit lives in the menu. */
  mug: string;
  /** Where to drink it. */
  place: {
    name: string;
    city: string;
    text: string;
    link: { label: string; url: string };
  };
  /**
   * The owner's own photos or clip (files under /world/stories/), shown
   * like the case card's; null until the owner sends them.
   */
  media: readonly CaseStoryMedia[] | null;
}

export const DESK_STORIES: { coffee: DeskStory } = {
  coffee: {
    kicker: "DESK · COFFEE",
    title: "Chiroso",
    subtitle: "My favourite coffee, a rare Colombian variety",
    stats: [
      { label: "Origin", value: "Urrao, Antioquia" },
      { label: "Altitude", value: "1,800–2,200 m" },
      { label: "Variety", value: "Caturra Chiroso" },
    ],
    altitude: { low: 1800, high: 2200 },
    processes: [
      { name: "Washed", note: "clean, bright citrus acidity, floral" },
      { name: "Honey", note: "honeyed sweetness, rounder body" },
      { name: "Natural", note: "red fruit, berries, winey" },
    ],
    // Chiroso's typical notes in the researched sources (L2).
    profile: [
      "Jasmine & white flowers",
      "Citrus acidity",
      "Panela & peach",
      "Silky body",
      "Long sweet finish",
    ],
    mug: "Jack Skellington cup, a nod to my favourite stop-motion film.",
    // The owner's friend's shop; no street address (none verified), only
    // the Maps place the owner sent, tracking parameters dropped.
    place: {
      name: "Café Mi Tierra",
      city: "Bogotá",
      text: "my friend's coffee shop. Go have a cup there.",
      link: {
        label: "Open in Google Maps",
        url: "https://www.google.com/maps?cid=17693029903064901813",
      },
    },
    media: null,
  },
};
