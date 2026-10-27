// Deterministic, allowlisted portfolio terminal. It never evaluates input:
// every command is a lookup in COMMANDS and only reads portfolio data.

export interface RoomProject {
  title: string;
  description: string;
  status: string;
  url: { icon: string; url: string; isSolid: boolean }[];
  tags: { title: string; logo: string }[];
}

export interface RoomExperience {
  title: string;
  company: string;
  duration: string;
  isCurrent: boolean;
  tags: string[];
}

export interface TerminalData {
  projects: RoomProject[];
  experience: RoomExperience[];
}

export type TerminalLineKind = "input" | "output" | "error";

export interface TerminalLine {
  kind: TerminalLineKind;
  text: string;
}

export interface TerminalResult {
  lines: TerminalLine[];
  clear?: true;
  open?: { title: string; url: string };
}

export const MAX_INPUT_LENGTH = 120;
const MAX_HISTORY = 200;

const out = (text: string): TerminalLine => ({ kind: "output", text });
const err = (text: string): TerminalLine => ({ kind: "error", text });

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function safeExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function stackOf(data: TerminalData): string[] {
  const counts = new Map<string, number>();
  for (const project of data.projects) {
    for (const tag of project.tags)
      counts.set(tag.title, (counts.get(tag.title) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

function findProject(
  query: string,
  projects: RoomProject[],
): RoomProject | undefined {
  if (/^\d+$/.test(query)) return projects[Number(query) - 1];
  const slug = slugify(query);
  return projects.find((p) => slugify(p.title) === slug);
}

const HELP = [
  "Available commands:",
  "  help            show this list",
  "  projects        list portfolio projects",
  "  stack           technologies used across projects",
  "  about           roles and experience",
  "  open <project>  open a project by number or name",
  "  clear           clear the screen",
];

type Handler = (arg: string, data: TerminalData) => TerminalResult;

const COMMANDS: Record<string, Handler> = {
  help: () => ({ lines: HELP.map(out) }),
  projects: (_arg, { projects }) => ({
    lines: [
      out(`${projects.length} projects — type "open <number>" to visit one:`),
      ...projects.map((p, i) =>
        out(
          `${i + 1}. ${p.title} [${p.status}] — ${p.tags.map((t) => t.title).join(", ")}`,
        ),
      ),
    ],
  }),
  stack: (_arg, data) => ({
    lines: [out("Stack across projects:"), out(stackOf(data).join(" · "))],
  }),
  about: (_arg, { experience }) => ({
    lines: [
      out(
        "Kevin Londoño (KEVNNARD) — Software Engineer, TypeScript full-stack.",
      ),
      ...experience.map((e) =>
        out(
          `${e.isCurrent ? "●" : "○"} ${e.title} @ ${e.company} (${e.duration.trim()})`,
        ),
      ),
    ],
  }),
  clear: () => ({ lines: [], clear: true }),
  open: (arg, { projects }) => {
    if (!arg)
      return {
        lines: [err('Usage: open <project number or name>. Try "projects".')],
      };
    const project = findProject(arg, projects);
    if (!project)
      return { lines: [err(`No project matches "${arg}". Try "projects".`)] };
    const url = project.url
      .map((u) => safeExternalUrl(u.url))
      .find((u) => u !== null);
    if (!url) return { lines: [err(`${project.title} has no public link.`)] };
    return {
      lines: [out(`Opening ${project.title} → ${url}`)],
      open: { title: project.title, url },
    };
  },
};

export function runTerminalCommand(
  input: string,
  data: TerminalData,
): TerminalResult {
  const trimmed = input.trim();
  if (trimmed.length > MAX_INPUT_LENGTH)
    return { lines: [err(`Input too long (max ${MAX_INPUT_LENGTH} chars).`)] };
  const [name = "", ...rest] = trimmed.split(/\s+/);
  const handler = Object.hasOwn(COMMANDS, name.toLowerCase())
    ? COMMANDS[name.toLowerCase()]
    : undefined;
  if (!handler)
    return { lines: [err(`Command not found: ${name}. Type "help".`)] };
  return handler(rest.join(" "), data);
}

export function createTerminalSession(data: TerminalData) {
  let lines: readonly TerminalLine[] = Object.freeze([
    out('Welcome to kevnnard@room. Type "help" to start.'),
  ]);
  return {
    history: () => lines,
    submit(input: string): TerminalResult {
      if (!input.trim()) return { lines: [] };
      const result = runTerminalCommand(input, data);
      const next = result.clear
        ? []
        : [
            ...lines,
            {
              kind: "input" as const,
              text: input.trim().slice(0, MAX_INPUT_LENGTH),
            },
            ...result.lines,
          ];
      lines = Object.freeze(next.slice(-MAX_HISTORY));
      return result;
    },
  };
}
