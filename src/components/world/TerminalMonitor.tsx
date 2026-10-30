import type { FocusEvent, ReactNode, RefObject } from "react";
import {
  BUFFERS,
  type BufferId,
  type BufferKey,
  bufferFile,
  portfolioBuffers,
  type TerminalLink,
} from "@/lib/world/terminal-content.ts";
import experience from "@/utils/experience.json";
import projects from "@/utils/projects.json";
import "./terminal-monitor.css";

/** The same JSON the homepage renders; links already validated. */
export const TERMINAL_CONTENT = portfolioBuffers({ projects, experience });
const CONTENT = TERMINAL_CONTENT;
const KEYS = Object.keys(BUFFERS) as BufferKey[];

function Links({ links }: { links: readonly TerminalLink[] }) {
  return (
    <ul>
      {links.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-region={`link:${link.href}`}
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Buffer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Content({ id, open }: { id: BufferId; open: (id: BufferId) => void }) {
  if (id === "a")
    return (
      <Buffer title={CONTENT.about.name}>
        <p>{CONTENT.about.summary}</p>
        <ul>
          {CONTENT.about.roles.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
        <Links links={CONTENT.about.links} />
        <button type="button" data-region="open:p" onClick={() => open("p")}>
          Explore projects
        </button>
      </Buffer>
    );
  if (id === "p")
    return (
      <Buffer title="Projects">
        {CONTENT.projects.map((project) => (
          <article key={project.title}>
            <h3>{project.title}</h3>
            <p>Status: {project.status}</p>
            <p>{project.description}</p>
            <p>{project.tags.join(", ")}</p>
            <Links links={project.links} />
          </article>
        ))}
      </Buffer>
    );
  if (id === "e")
    return (
      <Buffer title="Experience">
        {CONTENT.experience.map((entry) => (
          <article key={`${entry.company}-${entry.title}`}>
            <h3>
              {entry.title}, {entry.company}
            </h3>
            <p>
              {entry.duration}
              {entry.location && `, ${entry.location}`}
            </p>
            <p>{entry.description}</p>
            {entry.link && (
              <Links links={[{ label: entry.company, href: entry.link }]} />
            )}
          </article>
        ))}
      </Buffer>
    );
  if (id === "c")
    return (
      <Buffer title="Contact">
        <Links links={CONTENT.contact} />
      </Buffer>
    );
  return (
    <section>
      <h2>Kevnnard</h2>
      <p>Software Engineer, TypeScript full-stack. Web, mobile, cloud.</p>
      <nav aria-label="Portfolio sections">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            data-region={`open:${key}`}
            aria-keyshortcuts={key}
            onClick={() => open(key)}
          >
            {BUFFERS[key].label}
          </button>
        ))}
      </nav>
    </section>
  );
}

/**
 * The terminal's accessible companion (T16, L64-L66). The terminal itself
 * is drawn on the ultrawide's curved screen (MonitorScreen.tsx); this
 * region has no visual of its own (clipped to nothing in
 * terminal-monitor.css). It carries the same buffers as text, native links
 * and buttons; WorldApp routes the keys (a/p/e/c, j/k, Esc) for the whole
 * open terminal, this region included.
 * Each control's `data-region` matches its region on the screen, so the
 * screen draws the focus ring there and scrolls it into view.
 */
export default function TerminalMonitor({
  buffer,
  mainRef,
  onOpen,
  onExit,
  onRing,
}: {
  buffer: BufferId;
  mainRef: RefObject<HTMLElement | null>;
  onOpen: (id: BufferId) => void;
  onExit: () => void;
  /** The screen region of the focused control, or null. */
  onRing: (id: string | null) => void;
}) {
  const ring = (event: FocusEvent<HTMLElement>) =>
    onRing(
      event.target instanceof HTMLElement
        ? (event.target.dataset.region ?? null)
        : null,
    );

  return (
    <section
      role="region"
      className="terminal-companion"
      aria-label="Kevnnard's terminal, shown on the monitor"
      onFocus={ring}
      onBlur={() => onRing(null)}
    >
      <button type="button" data-region="exit" onClick={onExit}>
        Exit terminal
      </button>
      <nav aria-label="Neovim buffers">
        <button
          type="button"
          data-region="tab:home"
          aria-current={buffer === "home"}
          onClick={() => onOpen("home")}
        >
          Dashboard
        </button>
      </nav>
      <main ref={mainRef} tabIndex={-1} aria-label={bufferFile(buffer)}>
        <Content id={buffer} open={onOpen} />
      </main>
      <p>
        Keys: a about, p projects, e experience, c contact, j and k scroll, Esc{" "}
        {buffer === "home" ? "leaves the terminal" : "returns to the dashboard"}
        .
      </p>
    </section>
  );
}
