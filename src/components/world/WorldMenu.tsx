import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useId,
  useRef,
  useState,
} from "react";
import {
  GUIDE_SECTIONS,
  type GuideActionId,
  type GuideSection,
} from "@/lib/world/world-guide.ts";
import { CreditsList } from "./CreditsDialog";
import { WorldGuideIllustration } from "./WorldGuideIllustration";
import "./world-menu.css";

export interface GuideAction {
  label: string;
  run: () => void;
  /** Toggle buttons (Play/Pause music) report their state. */
  pressed?: boolean;
}

/** The world's existing actions; missing ones are not offered yet. */
export type GuideActions = Partial<Record<GuideActionId, GuideAction>>;

const TAB_ICONS: Record<GuideSection["id"], string> = {
  home: "⌂",
  controls: "⌨",
  terminal: "▣",
  video: "▷",
  lofi: "♫",
  credits: "✦",
};

/**
 * The game-style world guide (world-game-menu T1, S2), from
 * design/world-game-menu/01-game-guide.html: a native modal dialog, so the
 * rest of the world (camera, clock, lights) is inert behind it without being
 * unmounted. Esc is the dialog's own cancel; a click on the backdrop or
 * Close also closes it, and focus returns to the Menu button. Tabs follow the
 * tablist pattern: arrows, Home and End move and select, one tab stop.
 */
export default function WorldMenu({
  triggerRef,
  actions,
}: {
  triggerRef: RefObject<HTMLElement | null>;
  actions: GuideActions;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const downOnBackdrop = useRef(false);
  const base = useId();
  const titleId = `${base}-title`;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const setTrigger = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
    },
    [triggerRef],
  );

  const show = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setOpen(true);
    tabs.current[index]?.focus();
  };
  const close = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setOpen(false);
    triggerRef.current?.focus();
  };
  // Close first so the action's own focus (Exit buttons, the speaker
  // console's Play, the terminal) and camera move start from a closed guide.
  const run = (action: GuideAction) => {
    close();
    action.run();
  };
  const select = (next: number) => {
    const count = GUIDE_SECTIONS.length;
    const wrapped = (next + count) % count;
    setIndex(wrapped);
    tabs.current[wrapped]?.focus();
  };
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: GUIDE_SECTIONS.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(moves[event.key]);
  };

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        className="world-menu-trigger world-hud-trigger pointer-events-auto"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${base}-guide`}
        onClick={show}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Menu
      </button>
      <dialog
        ref={dialogRef}
        id={`${base}-guide`}
        className="world-guide"
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          // Esc: the browser restores focus; only fill in when it did not.
          if (
            !document.activeElement ||
            document.activeElement === document.body
          )
            triggerRef.current?.focus();
        }}
        onPointerDown={(event) => {
          downOnBackdrop.current = event.target === dialogRef.current;
        }}
        onClick={(event) => {
          const dialog = dialogRef.current;
          // The frame fills the dialog box: only the backdrop hits the dialog.
          if (event.target === dialog && downOnBackdrop.current) close();
        }}
      >
        <div className="world-guide-frame">
          <div className="world-guide-bar">
            <h2 id={titleId} className="world-guide-name">
              World guide
            </h2>
            <div
              role="tablist"
              aria-label="Guide sections"
              className="world-guide-tabs"
              onKeyDown={onTabKey}
            >
              {GUIDE_SECTIONS.map((section, position) => {
                const selected = position === index;
                return (
                  <button
                    key={section.id}
                    ref={(node) => {
                      tabs.current[position] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`${base}-tab-${section.id}`}
                    aria-selected={selected}
                    aria-controls={`${base}-panel-${section.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(position)}
                  >
                    <span aria-hidden="true">{TAB_ICONS[section.id]}</span>
                    {section.tab}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="world-guide-close"
              aria-label="Close guide"
              onClick={close}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {GUIDE_SECTIONS.map((section, position) => {
            const selected = position === index;
            return (
              <div
                key={section.id}
                role="tabpanel"
                id={`${base}-panel-${section.id}`}
                aria-labelledby={`${base}-tab-${section.id}`}
                hidden={!selected}
                tabIndex={0}
                className="world-guide-sheet"
              >
                {open && selected && (
                  <GuidePanel section={section} actions={actions} run={run} />
                )}
              </div>
            );
          })}
          <p className="world-guide-hint">
            <kbd>←</kbd>
            <kbd>→</kbd> Sections · <kbd>Esc</kbd> Close
          </p>
        </div>
      </dialog>
    </>
  );
}

function GuidePanel({
  section,
  actions,
  run,
}: {
  section: GuideSection;
  actions: GuideActions;
  run: (action: GuideAction) => void;
}) {
  const offered = section.actions.flatMap((id) => {
    const action = actions[id];
    return action ? [{ id, action }] : [];
  });
  return (
    <>
      <div className="world-guide-image">
        <WorldGuideIllustration
          section={section.id}
          label={section.illustration}
        />
      </div>
      <div className="world-guide-copy">
        <p className="world-guide-eyebrow">{section.eyebrow}</p>
        <h3 className="world-guide-title">{section.title}</h3>
        {section.paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
        {section.keys.length > 0 && (
          <dl className="world-guide-keys">
            {section.keys.map((entry) => (
              <div key={entry.action}>
                <dt>
                  {entry.keys.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dt>
                <dd>{entry.action}</dd>
              </div>
            ))}
          </dl>
        )}
        {offered.length > 0 && (
          <div className="world-guide-actions">
            {offered.map(({ id, action }) => (
              <button
                key={id}
                type="button"
                aria-pressed={action.pressed}
                onClick={() => run(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {section.links.length > 0 && (
          <ul className="world-guide-links">
            {section.links.map((link) =>
              link.href.startsWith("/") ? (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ) : (
                <li key={link.href}>
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                </li>
              ),
            )}
          </ul>
        )}
        {section.id === "credits" && <CreditsList />}
      </div>
    </>
  );
}
