// The world's game-style guide (world-game-menu T1, S2/S3/S5), from
// design/world-game-menu/01-game-guide.html. Every key listed here is the
// current binding in speaker-console.ts, terminal-content.ts or the camera
// (WorldScene's CameraControls); the guide documents them and adds none.
// tests/world/world-guide.test.ts checks each against its source.

import { CONTACT_LINKS, type TerminalLink } from "./terminal-content.ts";

export type GuideSectionId =
  | "home"
  | "controls"
  | "terminal"
  | "video"
  | "lofi"
  | "credits";

/** The world's existing actions; WorldApp maps each to its callback. */
export type GuideActionId =
  | "terminal"
  | "video"
  | "music"
  | "speakers"
  | "recenter";

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
    title: "Video and documentation",
    illustration:
      "Illustration of the portrait monitor with a video player above documentation",
    paragraphs: [
      "Select the portrait monitor, or Watch video, to move in close. It plays a Gentleman Programming video in YouTube's official player, above the NestJS Controllers documentation.",
      "Use the player's own controls. Exit portrait returns to the world.",
    ],
    keys: [
      {
        keys: ["Esc"],
        action: "Leave the close-up (when focus is outside the player).",
      },
    ],
    actions: ["video"],
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
    ],
    keys: [
      { keys: ["Space"], action: "Play or pause, in speaker focus." },
      { keys: ["N"], action: "Next track, in speaker focus." },
      { keys: ["P"], action: "Previous track, in speaker focus." },
      { keys: ["+"], action: "Louder, in speaker focus." },
      { keys: ["−"], action: "Quieter, in speaker focus." },
      { keys: ["Esc"], action: "Leave speaker focus; the music keeps going." },
    ],
    actions: ["music", "speakers"],
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
