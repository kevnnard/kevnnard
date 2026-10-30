// Ghostty × Neovim portfolio terminal on the main monitor (T16, S29), from
// design/terminal-monitor/01-dashboard.html. Nothing is executed: a key or a
// click only picks one of four read-only buffers built from the same JSON
// the homepage renders, and every link goes through the room's validator.

import {
  type RoomExperience,
  type RoomProject,
  safeExternalUrl,
} from "../room/terminal.ts";

/** "KEVNNARD" in ANSI Shadow, six rows of at most `ASCII_COLUMNS`. */
export const KEVNNARD_ASCII = [
  "██╗  ██╗███████╗██╗   ██╗███╗   ██╗███╗   ██╗ █████╗ ██████╗ ██████╗",
  "██║ ██╔╝██╔════╝██║   ██║████╗  ██║████╗  ██║██╔══██╗██╔══██╗██╔══██╗",
  "█████╔╝ █████╗  ██║   ██║██╔██╗ ██║██╔██╗ ██║███████║██████╔╝██║  ██║",
  "██╔═██╗ ██╔══╝  ╚██╗ ██╔╝██║╚██╗██║██║╚██╗██║██╔══██║██╔══██╗██║  ██║",
  "██║  ██╗███████╗ ╚████╔╝ ██║ ╚████║██║ ╚████║██║  ██║██║  ██║██████╔╝",
  "╚═╝  ╚═╝╚══════╝  ╚═══╝  ╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝",
] as const;
export const ASCII_COLUMNS = 69;
/** Monospace advance in em, used to fit the header without clipping. */
export const MONO_ADVANCE = 0.6;

export const BUFFERS = {
  a: { label: "About", file: "about.md" },
  p: { label: "Projects", file: "projects/" },
  e: { label: "Experience", file: "experience.md" },
  c: { label: "Contact", file: "contact.md" },
} as const;
export type BufferKey = keyof typeof BUFFERS;
export type BufferId = "home" | BufferKey;

export const bufferFile = (id: BufferId) =>
  id === "home" ? "dashboard" : BUFFERS[id].file;

export type TerminalAction =
  | { type: "open"; buffer: BufferId }
  | { type: "exit" }
  | { type: "scroll"; lines: 1 | -1 }
  | null;

export interface TerminalKey {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** The key landed in a text field or editable element. */
  editable: boolean;
}

const isBuffer = (key: string): key is BufferKey => Object.hasOwn(BUFFERS, key);

/**
 * a/p/e/c open their buffer; j/k scroll it, as in Neovim; Esc goes back to
 * the dashboard, and from the dashboard leaves the terminal. Anything else
 * (modifiers, fields, Space, Tab, Enter, arrows) stays native.
 */
export function terminalKey(
  event: TerminalKey,
  active: BufferId,
): TerminalAction {
  if (event.altKey || event.ctrlKey || event.metaKey || event.editable)
    return null;
  if (event.key === "Escape")
    return active === "home"
      ? { type: "exit" }
      : { type: "open", buffer: "home" };
  const letter = event.key.length === 1 ? event.key.toLowerCase() : "";
  if (letter === "j") return { type: "scroll", lines: 1 };
  if (letter === "k") return { type: "scroll", lines: -1 };
  return isBuffer(letter) ? { type: "open", buffer: letter } : null;
}

export interface TerminalLink {
  label: string;
  href: string;
}

/** The homepage footer's profiles (src/components/page/Footer.astro). */
export const CONTACT_LINKS: readonly TerminalLink[] = [
  { label: "GitHub", href: "https://github.com/kevnnard" },
  { label: "LinkedIn", href: "https://linkedin.com/in/kevnnard" },
  { label: "X", href: "https://x.com/kevnnard" },
];

/** The About section's CV downloads (src/components/page/AboutMe.astro). */
const CV_LINKS: readonly TerminalLink[] = [
  {
    label: "CV English",
    href: "https://kevnnard.s3.us-east-1.amazonaws.com/CV_EN.pdf",
  },
  {
    label: "CV Español",
    href: "https://kevnnard.s3.us-east-1.amazonaws.com/CV_ES.pdf",
  },
];

export interface MonitorData {
  projects: RoomProject[];
  experience: (RoomExperience & {
    location?: string;
    description?: string;
    link?: string;
  })[];
}

const safeLinks = (links: readonly TerminalLink[]) =>
  links.flatMap((link) => {
    const href = safeExternalUrl(link.href);
    return href ? [{ label: link.label, href }] : [];
  });

const host = (href: string) => new URL(href).hostname.replace(/^www\./, "");

/** Read-only buffer contents; links are already validated https/http. */
export function portfolioBuffers({ projects, experience }: MonitorData) {
  return {
    about: {
      name: "Kevin Londoño (KEVNNARD)",
      summary:
        "Software Engineer specialized in TypeScript full-stack, with six years shipping production software across web, mobile, and cloud.",
      roles: experience
        .filter((e) => e.isCurrent)
        .map((e) => `${e.title} @ ${e.company}`),
      links: safeLinks(CV_LINKS),
    },
    projects: projects.map((p) => ({
      title: p.title,
      status: p.status.replace(/_/g, " "),
      description: p.description,
      tags: p.tags.map((t) => t.title),
      links: p.url.flatMap((u) => {
        const href = safeExternalUrl(u.url);
        return href ? [{ label: host(href), href }] : [];
      }),
    })),
    experience: experience.map((e) => ({
      company: e.company,
      title: e.title,
      duration: e.duration.trim(),
      location: e.location ?? "",
      description: e.description ?? "",
      link: e.link ? safeExternalUrl(e.link) : null,
    })),
    contact: safeLinks(CONTACT_LINKS),
  };
}
export type PortfolioBuffers = ReturnType<typeof portfolioBuffers>;

export interface TerminalKeydown extends Omit<TerminalKey, "editable"> {
  isComposing: boolean;
  defaultPrevented: boolean;
  target: unknown;
  preventDefault: () => void;
}

/**
 * The one key route while the terminal is open (L68), from a document
 * listener: keys count whenever focus belongs to the terminal (the page
 * body after a click on the canvas, the canvas, the companion), never in
 * fields, during IME composition, or once something else handled them.
 */
export function terminalKeydown(
  event: TerminalKeydown,
  scope: {
    active: BufferId;
    owns: (target: unknown) => boolean;
    editable: (target: unknown) => boolean;
  },
): TerminalAction {
  if (event.isComposing || event.defaultPrevented) return null;
  if (!scope.owns(event.target)) return null;
  const action = terminalKey(
    {
      // Native KeyboardEvent fields are inherited accessors, not enumerable.
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      editable: scope.editable(event.target),
    },
    scope.active,
  );
  if (action) event.preventDefault();
  return action;
}
