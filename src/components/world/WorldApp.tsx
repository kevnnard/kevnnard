import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import { TimeController } from "@/components/room/TimeController";
import { useRoomClock } from "@/components/room/useRoomClock";
import {
  browserStorage,
  type ControllerStyle,
  loadControllerStyle,
  saveControllerStyle,
} from "@/lib/room/controller-style.ts";
import {
  DEFAULT_LIGHTS,
  type LightId,
  type LightSetting,
  type LightSettings,
  togglePower,
  updateLight,
} from "@/lib/world/lights.ts";
import { CreditsDialog } from "./CreditsDialog";
import { ScenePanel } from "./ScenePanel";

// Loaded only after WebGL is confirmed, so three.js never ships to clients that can't use it.
const WorldScene = lazy(() => import("./WorldScene"));

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
        <Fallback title="The 3D world could not load">
          <p className="text-muted-foreground">
            Everything in it is also on the static portfolio.
          </p>
        </Fallback>
      );
    }
    return this.props.children;
  }
}

const pillClass =
  "pointer-events-auto rounded-full bg-zinc-950/70 px-4 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function WorldApp() {
  const [webgl] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [home, setHome] = useState(0);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width: 767px)");
  // Same shared clock and controller styles as /room, imported read-only.
  const clock = useRoomClock(reducedMotion);
  const [controllerStyle, setControllerStyle] = useState(() =>
    loadControllerStyle(browserStorage()),
  );
  const chooseStyle = useCallback((next: ControllerStyle) => {
    setControllerStyle(next);
    saveControllerStyle(browserStorage(), next);
  }, []);
  const onReady = useCallback(() => setReady(true), []);
  // Night light settings (T6b): held here for the session, no persistence.
  const [lights, setLights] = useState<LightSettings>(DEFAULT_LIGHTS);
  const changeLight = useCallback(
    (id: LightId, patch: Partial<LightSetting>) =>
      setLights((current) => updateLight(current, id, patch)),
    [],
  );
  const resetLights = useCallback(() => setLights(DEFAULT_LIGHTS), []);
  // Master Power off / Power on (S20): separate from the per-light settings,
  // so they survive off and on; kept across day and night for the session.
  // It only flips at night: by day the action is a no-op.
  const [power, setPower] = useState(true);
  const hours = clock.hours;
  const switchPower = useCallback(
    () => setPower((on) => togglePower(on, hours)),
    [hours],
  );

  if (!webgl) {
    return (
      <Fallback title="Your browser can't display the 3D world">
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
          <WorldScene
            hours={clock.hours}
            reducedMotion={reducedMotion}
            home={home}
            lights={lights}
            power={power}
            onReady={onReady}
          />
        </Suspense>
        {!ready && (
          <p
            role="status"
            className="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            Loading the world…
          </p>
        )}
      </SceneErrorBoundary>

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 p-4">
        <a href="/" className={pillClass}>
          ← Portfolio
        </a>
        <nav
          aria-label="World controls"
          className="pointer-events-auto flex flex-wrap gap-2"
        >
          <button
            type="button"
            onClick={() => setHome((count) => count + 1)}
            className={pillClass}
          >
            Recenter view
          </button>
          <CreditsDialog />
        </nav>
      </header>

      {ready && (
        <TimeController
          clock={clock}
          style={controllerStyle}
          onStyleChange={chooseStyle}
          narrow={narrow}
        />
      )}
      {ready && (
        <ScenePanel
          hours={clock.hours}
          lights={lights}
          narrow={narrow}
          controllerStyle={controllerStyle}
          power={power}
          onChange={changeLight}
          onReset={resetLights}
          onPower={switchPower}
        />
      )}
    </div>
  );
}
