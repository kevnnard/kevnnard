// The world's game-style guide (world-game-menu T1, S2/S3/S5), from
// design/world-game-menu/01-game-guide.html. Every key listed here is the
// current binding in speaker-console.ts, terminal-content.ts, tv-screen.ts
// (TvHome's remote), CollectionRail or the camera (WorldScene's
// CameraControls); the guide documents them and adds none.
// tests/world/world-guide.test.ts checks each against its source.

import { CONTACT_LINKS, type TerminalLink } from "./terminal-content.ts";

export type GuideSectionId =
  | "home"
  | "controls"
  | "terminal"
  | "video"
  | "tv"
  | "lofi"
  | "collection"
  | "cherry"
  | "credits";

/** The world's existing actions; WorldApp maps each to its callback. */
export type GuideActionId =
  | "terminal"
  | "video"
  | "music"
  | "speakers"
  | "ambient"
  | "recenter"
  | "tv"
  | "collection"
  | "desk"
  | "cherry";

export interface GuideKey {
  /** Key caps or gestures, each shown in its own <kbd>. */
  keys: string[];
  action: string;
}

export interface GuideSection {
  id: GuideSectionId;
  tab: string;
  eyebrow: string;
  title: string;
  /** Accessible name of the section's original illustration. */
  illustration: string;
  paragraphs: string[];
  keys: GuideKey[];
  actions: GuideActionId[];
  links: TerminalLink[];
}

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: "home",
    tab: "Kevnnard Home",
    eyebrow: "Welcome to my world",
    title: "Kevnnard Home",
    illustration:
      "Illustration of the wooden house with the desk, monitors and speakers inside",
    paragraphs: [
      "This is my visual portfolio in 3D: a small world built around my work, the technologies I use, the things I enjoy and the objects that have stayed with me along the way.",
      "Open the monitor for my projects and experience, watch a video on the portrait screen and put on some lo-fi from the speakers.",
      "The desk, the collection shelf and the everyday objects each tell a part of that story. Take your time and look around.",
    ],
    keys: [],
    actions: [],
    links: [{ label: "Static portfolio", href: "/" }, ...CONTACT_LINKS],
  },
  {
    id: "controls",
    tab: "Controls",
    eyebrow: "Look around",
    title: "Explore the world",
    illustration:
      "Illustration of the house with orbit arrows, a pointer and two fingers pinching",
    paragraphs: [
      "The camera orbits the house and moves closer or farther; there is no walking or panning.",
      "The time card on screen sets the time of day. At night the lights card adjusts each lamp, and Power off darkens them all.",
    ],
    keys: [
      { keys: ["Drag"], action: "Orbit the house (mouse or one finger)." },
      {
        keys: ["Scroll"],
        action: "Move closer or farther (wheel or middle-button drag).",
      },
      { keys: ["Pinch"], action: "Zoom with two fingers on touch screens." },
      { keys: ["Tab"], action: "Move between the on-screen controls." },
      { keys: ["Enter", "Space"], action: "Activate the focused control." },
      { keys: ["Esc"], action: "Close this guide." },
    ],
    actions: ["recenter"],
    links: [],
  },
  {
    id: "terminal",
    tab: "Terminal",
    eyebrow: "My work",
    title: "Portfolio terminal",
    illustration:
      "Illustration of the curved ultrawide monitor showing the terminal dashboard",
    paragraphs: [
      "Select the main monitor, or Enter terminal, to move in close. The screen opens a terminal with my about, projects, experience and contact.",
      "Click a section or a link on the screen; the wheel or a drag scrolls it. Links open in a new tab.",
    ],
    keys: [
      { keys: ["A"], action: "About." },
      { keys: ["P"], action: "Projects." },
      { keys: ["E"], action: "Experience." },
      { keys: ["C"], action: "Contact." },
      { keys: ["J"], action: "Scroll down." },
      { keys: ["K"], action: "Scroll up." },
      {
        keys: ["Esc"],
        action:
          "Back to the dashboard; from the dashboard, leave the terminal.",
      },
    ],
    actions: ["terminal"],
    links: [],
  },
  {
    id: "video",
    tab: "Video",
    eyebrow: "The portrait screen",
    title: "Neovim, video and documentation",
    illustration:
      "Illustration of the portrait monitor with a video player above documentation",
    paragraphs: [
      "From the room the portrait monitor shows Neovim typing this site's own code. Select it, or Watch video, to move in close: the NVIM tab is a small playable Neovim (try :help), and the Gentleman and NestJS tabs hold a Gentleman Programming video in YouTube's official player and the NestJS Controllers documentation.",
      "Use the player's own controls. Exit portrait returns to the world.",
    ],
    keys: [
      {
        keys: ["Esc"],
        action:
          "In Neovim's NORMAL mode, leave the close-up; on the Gentleman or NestJS tab, go back to NVIM.",
      },
    ],
    actions: ["video"],
    links: [],
  },
  {
    id: "tv",
    tab: "TV",
    eyebrow: "The living room",
    title: "Kevnnard TV",
    illustration:
      "Illustration of the living-room TV showing the app dock, a featured title and a row of covers",
    paragraphs: [
      "Select the living-room TV, or Watch TV, to move in close. Kevnnard TV has apps for movies and series, games, my videos, YouTube channels, Twitch live, anime and the lo-fi radio.",
      "Pick a title to see it featured; pick it again to open its collection or play it. Trailers and YouTube channels play in YouTube's official player, Twitch streams in Twitch's.",
    ],
    keys: [
      { keys: ["Arrows"], action: "Move between the apps and rows." },
      { keys: ["Enter"], action: "Select a title; again, open or play it." },
      { keys: ["Esc"], action: "Close the player, then leave the TV." },
    ],
    actions: ["tv"],
    links: [],
  },
  {
    id: "lofi",
    tab: "Kevnnard Lo-fi",
    eyebrow: "gentle-stream",
    title: "Kevnnard Lo-fi",
    illustration:
      "Illustration of the two shelf speakers sending out sound waves",
    paragraphs: [
      "Click a speaker to play or pause. Double-click it, or Focus speakers, to open the console with the track, volume and listening range.",
      "Five local loops rendered with gentle-stream by Gentleman Programming. Leaving the close-up keeps the music playing; it fades with the camera's distance.",
      "Outdoor sounds follow the world's clock: three owl hoots at night, crickets from dusk to dawn, a rooster as the morning starts, and birds through the working day. The Outdoor sounds button turns them on or off.",
    ],
    keys: [
      { keys: ["Space"], action: "Play or pause, in speaker focus." },
      { keys: ["N"], action: "Next track, in speaker focus." },
      { keys: ["P"], action: "Previous track, in speaker focus." },
      { keys: ["+"], action: "Louder, in speaker focus." },
      { keys: ["−"], action: "Quieter, in speaker focus." },
      { keys: ["Esc"], action: "Leave speaker focus; the music keeps going." },
    ],
    actions: ["music", "speakers", "ambient"],
    links: [],
  },
  {
    id: "collection",
    tab: "Collection",
    eyebrow: "Things I keep",
    title: "The collection",
    illustration:
      "Illustration of a display case with a helmet, the katanas on their wall shelf, and the keyboard and coffee cup on the desk",
    paragraphs: [
      "Select a display case, the katanas on the wall shelf or the collection shelf, or Open collection, to move in close. The cases and the katanas carry their stories, and the rail below steps through the collection in the room's order.",
      "On the desk, the keyboard and the coffee cup open their own cards. See the desk starts at the keyboard.",
    ],
    keys: [
      { keys: ["←", "→"], action: "Step through the collection on the rail." },
      { keys: ["Esc"], action: "Back to the room." },
    ],
    actions: ["collection", "desk"],
    links: [],
  },
  {
    id: "cherry",
    tab: "Cherry",
    eyebrow: "In the front yard",
    title: "Cherry",
    illustration:
      "Illustration of a small Miniature Pinscher standing on the front lawn under the morning sun",
    paragraphs: [
      "Cherry is my Miniature Pinscher, with me for more than nineteen years. She visits the front yard in the mornings; select her for her card.",
      "Outside her hours, Meet Cherry moves the world clock to 08:00 first.",
    ],
    keys: [{ keys: ["Esc"], action: "Back to the room." }],
    actions: ["cherry"],
    links: [],
  },
  {
    id: "credits",
    tab: "Credits",
    eyebrow: "With thanks",
    title: "Credits and inspiration",
    illustration:
      "Illustration of the collection shelf with a music note, a lamp and stacked boxes",
    paragraphs: [
      "The music engine, the inspiration and every external asset in this world, with its author, license and source.",
    ],
    keys: [],
    actions: [],
    links: [],
  },
];

export function guideSection(id: GuideSectionId): GuideSection {
  const section = GUIDE_SECTIONS.find((entry) => entry.id === id);
  if (!section) throw new Error(`Unknown guide section ${id}`);
  return section;
}
