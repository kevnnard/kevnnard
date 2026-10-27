import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { roomData } from "@/lib/room/content.ts";
import {
  browserStorage,
  type ControllerStyle,
  loadControllerStyle,
  saveControllerStyle,
} from "@/lib/room/controller-style.ts";
import { createTerminalSession } from "@/lib/room/terminal.ts";
import { cn } from "@/lib/utils";
import type { RoomView } from "./RoomScene";
import { Terminal } from "./Terminal";
import { TimeController } from "./TimeController";
import { useRoomClock } from "./useRoomClock";

// Loaded only after WebGL is confirmed, so three.js never ships to clients that can't use it.
const RoomScene = lazy(() => import("./RoomScene"));

const VIEWS: { id: RoomView; label: string }[] = [
  { id: "overview", label: "Room overview" },
  { id: "pc", label: "PC terminal" },
  { id: "tv", label: "TV: featured projects" },
];

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function Fallback({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
      <a
        href="/"
        className="rounded-full border border-emerald-500/40 px-4 py-2 text-emerald-400 hover:bg-emerald-500/10"
      >
        Back to the portfolio
      </a>
    </div>
  );
}

class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <Fallback title="The 3D room could not load">
          <p className="text-muted-foreground">
            Everything in it is also on the static portfolio.
          </p>
        </Fallback>
      );
    }
    return this.props.children;
  }
}

export default function RoomApp() {
  const [webgl] = useState(hasWebGL);
  const [view, setView] = useState<RoomView>("overview");
  const [ready, setReady] = useState(false);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 767px)");
  // The one shared clock: lives here so a style switch never resets it.
  const clock = useRoomClock(reducedMotion);
  const [controllerStyle, setControllerStyle] = useState(() =>
    loadControllerStyle(browserStorage()),
  );
  const chooseStyle = useCallback((next: ControllerStyle) => {
    setControllerStyle(next);
    saveControllerStyle(browserStorage(), next);
  }, []);

  const [session] = useState(() => createTerminalSession(roomData));
  const [lines, setLines] = useState(session.history);
  const [link, setLink] = useState<{ title: string; url: string }>();
  const submit = useCallback(
    (input: string) => {
      const result = session.submit(input);
      setLines(session.history());
      if (result.clear) setLink(undefined);
      if (result.open) {
        setLink(result.open);
        // URL already validated as http(s) by the terminal; never pass opener.
        window.open(result.open.url, "_blank", "noopener,noreferrer");
      }
    },
    [session],
  );

  const buttons = useRef(new Map<RoomView, HTMLButtonElement>());
  const select = useCallback((next: RoomView) => setView(next), []);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (view === "overview") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setView("overview");
      // Return focus to the control that leads back to where the user was.
      buttons.current.get(view)?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  // Stable while only the time changes, so the memoized room skips re-rendering.
  const embeddedTerminal = useMemo(
    () => (
      <Terminal
        lines={lines}
        link={link}
        onSubmit={submit}
        active={view === "pc" && !narrow}
        className="h-full"
      />
    ),
    [lines, link, submit, view, narrow],
  );

  if (!webgl) {
    return (
      <Fallback title="Your browser can't display the 3D room">
        <p className="text-muted-foreground">
          WebGL is unavailable or disabled.
        </p>
      </Fallback>
    );
  }

  return (
    <div className="relative h-full w-full">
      <SceneErrorBoundary>
        <Suspense fallback={null}>
          <RoomScene
            view={view}
            hours={clock.hours}
            reducedMotion={reducedMotion}
            onSelect={select}
            onReady={onReady}
            pcScreen={embeddedTerminal}
          />
        </Suspense>
        {!ready && (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            Loading the room…
          </p>
        )}
      </SceneErrorBoundary>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 p-4">
        <a
          href="/"
          className="pointer-events-auto rounded-full bg-zinc-950/70 px-4 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-900"
        >
          ← Portfolio
        </a>
        <nav
          aria-label="Room views"
          className="pointer-events-auto flex flex-wrap gap-2"
        >
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              ref={(node) => {
                if (node) buttons.current.set(id, node);
                else buttons.current.delete(id);
              }}
              aria-pressed={view === id}
              onClick={() => select(id)}
              className="rounded-full bg-zinc-950/70 px-4 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-900 aria-pressed:bg-emerald-500/30 aria-pressed:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Kept off small screens while focused, so it never covers the terminal;
          the clock keeps running while hidden. */}
      {ready && !(narrow && view !== "overview") && (
        <TimeController
          clock={clock}
          style={controllerStyle}
          onStyleChange={chooseStyle}
          narrow={narrow}
        />
      )}

      {view !== "overview" && (
        <p
          className={cn(
            "pointer-events-none absolute right-4 text-right text-xs text-zinc-400",
            // The timeline dock owns the bottom band on wide screens.
            controllerStyle === "timeline" && !narrow ? "top-20" : "bottom-3",
          )}
        >
          Press Esc or choose “Room overview” to step back.
        </p>
      )}

      {view === "pc" && narrow && (
        <section
          aria-label="PC terminal"
          className="absolute inset-x-0 bottom-0 h-[55%] p-3"
        >
          <Terminal
            lines={lines}
            link={link}
            onSubmit={submit}
            active
            className="h-full text-base"
          />
        </section>
      )}
    </div>
  );
}
