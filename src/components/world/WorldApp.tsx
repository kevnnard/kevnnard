import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { TimeController } from "@/components/room/TimeController";
import { useRoomClock } from "@/components/room/useRoomClock";
import {
  browserStorage,
  type ControllerStyle,
  loadControllerStyle,
  saveControllerStyle,
} from "@/lib/room/controller-style.ts";
import { cn } from "@/lib/utils";
import { AmbientSound } from "@/lib/world/ambient-sound.ts";
import { CASE_STORIES } from "@/lib/world/case-stories.ts";
import { DESK_PRODUCTS } from "@/lib/world/desk-products.ts";
import { DESK_STORIES } from "@/lib/world/desk-stories.ts";
import { type InspectItemId, isDeskItemId } from "@/lib/world/display-cases.ts";
import {
  DEFAULT_LIGHTS,
  type LightId,
  type LightSetting,
  type LightSettings,
  togglePower,
  updateLight,
} from "@/lib/world/lights.ts";
import { type Viewport, visibleSpan } from "@/lib/world/monitor.ts";
import { consoleKeydown, VOLUME_STEP } from "@/lib/world/speaker-console.ts";
import { SpeakerMusic } from "@/lib/world/speaker-music.ts";
import {
  initialListener,
  type ListeningRange,
  listeningRange,
  rangeReach,
} from "@/lib/world/speaker-range.ts";
import { bindMusicResume } from "@/lib/world/speaker-resume.ts";
import {
  type BufferId,
  terminalKeydown,
} from "@/lib/world/terminal-content.ts";
import {
  canvasMeasure,
  clampScroll,
  FONT,
  FULL_COLUMN,
  revealScroll,
  type ScreenHit,
  spanColumn,
  terminalLayout,
} from "@/lib/world/terminal-layout.ts";
import {
  initialTvHome,
  tvClock,
  tvHomeAction,
  tvMove,
  tvScreenLayout,
} from "@/lib/world/tv-screen.ts";
import { presentWorldLoad } from "@/lib/world/world-load-presentation.ts";
import type { WorldLoadState } from "@/lib/world/world-loading.ts";
import {
  loadAmbientPreferences,
  loadLightPreferences,
  loadMusicPreferences,
  type PreferenceStorage,
  saveAmbientPreferences,
  saveLightPreferences,
  saveMusicPreferences,
} from "@/lib/world/world-preferences.ts";
import CaseStory from "./CaseStory";
import CoffeeCard from "./CoffeeCard";
import CollectionRail from "./CollectionRail";
import ProductCard from "./ProductCard";
import type { DeskControl } from "./Setup";
import WorldEntryLoader from "./WorldEntryLoader";
import "./world-entry-gate.css";
import type { MonitorTerminal } from "./MonitorScreen";
import type { PortraitControl } from "./PortraitScreen";
import { ScenePanel } from "./ScenePanel";
import SpeakerBar from "./SpeakerBar";
import type { SpeakerControl } from "./SpeakerZone";
import TerminalMonitor, { TERMINAL_CONTENT } from "./TerminalMonitor";
import TvHome from "./TvHome";
import type { TvControl } from "./TvScreen";
import { useCardPresence } from "./useCardPresence";
import WorldMenu, { type GuideActions } from "./WorldMenu";

// Loaded only after WebGL is confirmed, so three.js never ships to clients that can't use it.
const WorldScene = lazy(() => import("./WorldScene"));
/** Opens the terminal even if the camera never reports arrival. */
const ARRIVAL_FALLBACK_MS = 3000;

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

/**
 * Saves `value` whenever it differs from what storage last held: never on
 * mount, so the stored record is read before any write and defaults never
 * overwrite it. Each write carries the whole current record, never a stale
 * callback's copy.
 */
function useStoredRecord<T>(
  value: T,
  loaded: T,
  save: (storage: PreferenceStorage | undefined, value: T) => boolean,
) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    last.current ??= JSON.stringify(loaded);
    const next = JSON.stringify(value);
    if (next !== last.current && save(browserStorage(), value))
      last.current = next;
  }, [value, loaded, save]);
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
          <button
            type="button"
            onClick={reloadWorld}
            className="rounded-md border px-6 py-3"
          >
            Try again
          </button>
        </Fallback>
      );
    }
    return this.props.children;
  }
}

function reloadWorld() {
  window.location.reload();
}

const pillClass =
  "pointer-events-auto rounded-full bg-zinc-950/70 px-4 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function WorldApp() {
  const [webgl] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [loading, setLoading] = useState<WorldLoadState>({
    progress: 1,
    phase: "scene",
    error: null,
  });
  const [presented, setPresented] = useState(loading);
  const presentationStart = useRef<number | null>(null);
  useEffect(() => {
    presentationStart.current ??= performance.now();
    const began = presentationStart.current;
    let closed = false;
    let frame: number | undefined;
    const tick = () => {
      if (closed) return;
      const next = presentWorldLoad(loading, performance.now() - began);
      setPresented(next);
      if (!next.error && next.progress < loading.progress)
        frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      closed = true;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [loading]);
  const menuButton = useRef<HTMLElement>(null);
  const [home, setHome] = useState(0);
  // A gallery item, or a desk thing (keyboard-card T1) framed the same way.
  const [galleryCase, setGalleryCase] = useState<InspectItemId | null>(null);
  // The inspected case's story card (T10); null when it has none.
  const caseStory =
    galleryCase && !isDeskItemId(galleryCase)
      ? CASE_STORIES[galleryCase]
      : null;
  // The inspected desk thing's product card: always open, no rail.
  const deskProduct =
    galleryCase === "keyboard" ? DESK_PRODUCTS.keyboard : null;
  const deskStory = galleryCase === "coffee" ? DESK_STORIES.coffee : null;
  // Hidden only for the case it was hidden on, so it opens again on every
  // other case; while open the camera frames left of it (T12).
  const [hiddenStory, setHiddenStory] = useState<InspectItemId | null>(null);
  const storyOpen = hiddenStory === null || hiddenStory !== galleryCase;
  const setStoryOpen = useCallback(
    (open: boolean) => setHiddenStory(open ? null : galleryCase),
    [galleryCase],
  );
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
  // Night light settings (T6b) and the master below, kept across reloads
  // (world-persistent-settings S1): read once before the first render and
  // saved on each later change. Reset lights restores only the per-light
  // defaults; the master and the music keep their values.
  const [storedLights] = useState(() => loadLightPreferences(browserStorage()));
  const [lights, setLights] = useState<LightSettings>(storedLights.lights);
  const changeLight = useCallback(
    (id: LightId, patch: Partial<LightSetting>) =>
      setLights((current) => updateLight(current, id, patch)),
    [],
  );
  const resetLights = useCallback(() => setLights(DEFAULT_LIGHTS), []);
  // Master Power off / Power on (S20): separate from the per-light settings,
  // so they survive off and on; kept across day and night and reloads.
  // It only flips at night: by day the action is a no-op, and the day and
  // night gate never writes the stored lights.
  const [power, setPower] = useState(storedLights.power);
  const hours = clock.hours;
  const switchPower = useCallback(
    () => setPower((on) => togglePower(on, hours)),
    [hours],
  );
  const lightPreferences = useMemo(() => ({ lights, power }), [lights, power]);
  useStoredRecord(lightPreferences, storedLights, saveLightPreferences);

  // Terminal on the main monitor (T16, L66): `focus` moves the camera to the
  // close-up and hides the world controls (header inert; clock and lights
  // panel hidden by terminal-monitor.css, still mounted and in place). The
  // terminal is drawn on the curved screen itself (MonitorScreen); once the
  // camera arrives the screen takes clicks and scrolling, and an off-screen
  // companion takes keyboard focus. Leaving restores the controls, the
  // dashboard and keyboard focus on the entry button.
  const [focus, setFocus] = useState(false);
  // The speaker close-up (T2, below): no other close-up opens during it.
  const [speakers, setSpeakers] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const returnFocus = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const enter = useCallback(() => {
    if (!speakers) {
      setGalleryCase(null);
      setFocus(true);
    }
  }, [speakers]);
  const arrive = useCallback(() => setTerminal(true), []);
  const [buffer, setBuffer] = useState<BufferId>("home");
  // The canvas's own font metrics lay the screen text out (L68).
  const [textMeasure] = useState(canvasMeasure);
  const [scroll, setScroll] = useState(0);
  const [ring, setRing] = useState<string | null>(null);
  const companion = useRef<HTMLElement>(null);
  const leave = useCallback(() => {
    returnFocus.current = true;
    setTerminal(false);
    setFocus(false);
    setBuffer("home");
    setScroll(0);
    setRing(null);
  }, []);
  useEffect(() => {
    if (focus || !returnFocus.current) return;
    returnFocus.current = false;
    menuButton.current?.focus();
  }, [focus]);
  // Keyboard focus moves onto the terminal as soon as it opens.
  useEffect(() => {
    if (terminal) companion.current?.focus();
  }, [terminal]);
  useEffect(() => {
    if (!focus || terminal) return;
    const timer = setTimeout(arrive, ARRIVAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [focus, terminal, arrive]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    // The canvas fills this container: the terminal frame uses its size.
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (width > 0 && height > 0) setViewport({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Phones see the middle of the ultrawide: the terminal lays out there.
  const column =
    focus && viewport ? spanColumn(visibleSpan(viewport)) : FULL_COLUMN;
  const layout = useMemo(
    () =>
      terminalLayout(TERMINAL_CONTENT, buffer, column, terminal, textMeasure),
    [buffer, column.x0, column.x1, terminal, textMeasure],
  );
  const open = useCallback((id: BufferId) => {
    setBuffer(id);
    setScroll(0);
    companion.current?.focus();
  }, []);
  const hit = useCallback(
    (action: ScreenHit) => {
      if (action.type === "exit") leave();
      else if (action.type === "open") open(action.buffer);
      else companion.current?.focus();
    },
    [leave, open],
  );
  const scrollLines = useCallback(
    (lines: 1 | -1) =>
      setScroll((current) =>
        clampScroll(layout, current + lines * 3 * FONT.line),
      ),
    [layout],
  );
  // Keys for the open terminal (L68): one document listener, so a/p/e/c,
  // j/k and Esc work right after a click on the screen (focus then sits on
  // the page body), on the companion, never in fields or the Exit pill.
  const exitButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!terminal) return;
    const owns = (target: unknown) =>
      target === document.body ||
      target === document.documentElement ||
      (target instanceof Node &&
        Boolean(root.current?.contains(target)) &&
        !exitButton.current?.contains(target));
    const editable = (target: unknown) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onKey = (event: KeyboardEvent) => {
      const action = terminalKeydown(event, { active: buffer, owns, editable });
      if (!action) return;
      if (action.type === "exit") leave();
      else if (action.type === "scroll") scrollLines(action.lines);
      else open(action.buffer);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [terminal, buffer, leave, open, scrollLines]);
  const focusRing = useCallback(
    (id: string | null) => {
      setRing(id);
      if (id) setScroll((current) => revealScroll(layout, current, id));
    },
    [layout],
  );

  // Portrait close-up (T18, L75): the camera faces the left monitor so its
  // official YouTube player renders at >= 200x200. Same controls as the
  // terminal's close-up (header inert, clock and lights panel hidden), Esc
  // or Exit portrait returns to the saved view and focus to Watch video.
  // Each close-up only opens from the room.
  const [portrait, setPortrait] = useState(false);
  const exitPortrait = useRef<HTMLButtonElement>(null);
  const returnPortrait = useRef(false);
  const enterPortrait = useCallback(() => {
    if (!focus) {
      setGalleryCase(null);
      setPortrait(true);
    }
  }, [focus]);
  const leavePortrait = useCallback(() => {
    returnPortrait.current = true;
    setPortrait(false);
  }, []);
  useEffect(() => {
    if (portrait) {
      exitPortrait.current?.focus();
      return;
    }
    if (!returnPortrait.current) return;
    returnPortrait.current = false;
    menuButton.current?.focus();
  }, [portrait]);
  useEffect(() => {
    if (!portrait) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leavePortrait();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [portrait, leavePortrait]);
  const portraitControl = useMemo<PortraitControl>(
    () => ({
      focused: portrait,
      onEnter: ready && !focus && !speakers ? enterPortrait : undefined,
      onExit: leavePortrait,
    }),
    [portrait, ready, focus, speakers, enterPortrait, leavePortrait],
  );

  // Speaker music (world-speaker-music T2): five local loops on the shelf
  // speakers. Nothing loads before the world is ready and the listening
  // range is measured; then music the visitor left on resumes gently
  // (world-persistent-settings S2, below). One click on a speaker or Play
  // music plays or pauses; a double click or Focus speakers moves the
  // camera to the pair (no playback by itself) with a compact bar:
  // previous, play or pause, next, Exit. Leaving the close-up keeps the
  // music: it fades with the camera's distance. A hidden tab stops it and
  // showing the tab again resumes it if still wanted.
  const [music] = useState(() => new SpeakerMusic());
  // Volume, range and play intent come back from storage (S1); a fresh
  // visit gets half volume, the full range and music on (S2).
  const [storedMusic] = useState(() => loadMusicPreferences(browserStorage()));
  // The visitor's last explicit play or pause, written only by the
  // transport actions below: never by playback, errors, the hidden tab or
  // dispose, so a paused visit stays paused after a reload.
  const [musicEnabled, setMusicEnabled] = useState(storedMusic.enabled);
  const song = useSyncExternalStore(music.subscribe, music.getState);
  useEffect(() => () => music.dispose(), [music]);
  useEffect(() => {
    const update = () => music.setHidden(document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [music]);
  const speakerPlay = useRef<HTMLButtonElement>(null);
  const returnSpeakers = useRef(false);
  const enterSpeakers = useCallback(() => {
    if (!focus && !portrait) {
      setGalleryCase(null);
      setSpeakers(true);
    }
  }, [focus, portrait]);
  const leaveSpeakers = useCallback(() => {
    returnSpeakers.current = true;
    setSpeakers(false);
  }, []);
  useEffect(() => {
    if (speakers) {
      speakerPlay.current?.focus();
      return;
    }
    if (!returnSpeakers.current) return;
    returnSpeakers.current = false;
    menuButton.current?.focus();
  }, [speakers]);
  // Each control unlocks the audio inside its own click (Safari), then
  // keeps the music's own intent right after the action: play sets it
  // before any await, and previous and next leave it as it was.
  const playMusic = useCallback(() => {
    music.unlock();
    music.toggle();
    setMusicEnabled(music.getWanted());
  }, [music]);
  const previousTrack = useCallback(() => {
    music.unlock();
    music.previous();
    setMusicEnabled(music.getWanted());
  }, [music]);
  const nextTrack = useCallback(() => {
    music.unlock();
    music.next();
    setMusicEnabled(music.getWanted());
  }, [music]);
  // The console's settings (speaker-focus-console T3): held here so they
  // outlive the close-up, and stored so they survive a reload. Volume is
  // apart from the distance fade. The listening range runs from the whole
  // house (0) to the initial view (1), measured once from the guide's home
  // pose for the first view the scene opened with: later camera moves and
  // resizes never change it. Until it is measured the music keeps
  // speaker.ts's fade. Setters never create the audio context.
  const [volume, setVolume] = useState(storedMusic.volume);
  const [range, setRange] = useState(storedMusic.range);
  const musicPreferences = useMemo(
    () => ({ volume, range, enabled: musicEnabled }),
    [volume, range, musicEnabled],
  );
  useStoredRecord(musicPreferences, storedMusic, saveMusicPreferences);
  // Outdoor sounds (owl, crickets, rooster, birds) follow the world's clock.
  // Like the music they start with Enter world: unlock runs inside that click,
  // and nothing loads before it. A hidden tab silences them until it returns.
  const [ambient] = useState(() => new AmbientSound());
  const [storedAmbient] = useState(() =>
    loadAmbientPreferences(browserStorage()),
  );
  const [ambientEnabled, setAmbientEnabled] = useState(storedAmbient.enabled);
  useSyncExternalStore(ambient.subscribe, ambient.getState);
  useEffect(() => () => ambient.dispose(), [ambient]);
  // Beds fade with the visitor's distance from the house (outdoor level).
  const onOutdoor = useMemo(
    () => (level: number) => ambient.setOutdoor(level),
    [ambient],
  );
  useEffect(() => {
    ambient.setEnabled(ambientEnabled);
  }, [ambient, ambientEnabled]);
  useEffect(() => {
    ambient.setHours(clock.hours);
  }, [ambient, clock.hours]);
  useEffect(() => {
    const onVisibility = () => ambient.setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [ambient]);
  const ambientPreferences = useMemo(
    () => ({ enabled: ambientEnabled }),
    [ambientEnabled],
  );
  useStoredRecord(ambientPreferences, storedAmbient, saveAmbientPreferences);
  const toggleAmbient = useCallback(() => {
    if (!ambientEnabled) ambient.unlock();
    setAmbientEnabled(!ambientEnabled);
  }, [ambient, ambientEnabled]);
  const [limits, setLimits] = useState<ListeningRange | null>(null);
  useEffect(() => {
    if (!ready || !viewport) return;
    const aspect = viewport.width / viewport.height;
    setLimits((frozen) => frozen ?? listeningRange(initialListener(aspect)));
  }, [ready, viewport]);
  useEffect(() => music.setVolume(volume), [music, volume]);
  useEffect(
    () => music.setReach(limits ? rangeReach(limits, range) : null),
    [music, limits, range],
  );
  // Gentle entry (S2): once the world is ready and the volume and reach
  // above apply, music the visitor left on resumes. speaker-resume.ts tries
  // to start it with a fade and otherwise waits for the first trusted click
  // or key, as the browser's autoplay policy allows. Its cleanup only drops
  // those listeners: pausing here would stop the music on every focus or
  // resize. An explicit Pause is what turns the intent off.
  useEffect(() => {
    if (!entered || !ready || !limits || !musicEnabled) return;
    return bindMusicResume(music, document);
  }, [music, entered, ready, limits, musicEnabled]);
  const stepVolume = useCallback(
    (direction: 1 | -1) =>
      setVolume((current) =>
        Math.min(
          Math.max(
            Math.round((current + direction * VOLUME_STEP) * 100) / 100,
            0,
          ),
          1,
        ),
      ),
    [],
  );
  // gentle-stream's keys while the speakers hold the camera: Space, n, p,
  // + and -, Esc to leave. The event goes to consoleKeydown as is (its
  // fields are inherited getters, never spread). Fields, sliders, selects,
  // editors and frames keep their keys; buttons keep Space; Esc still
  // leaves from anywhere in the world.
  useEffect(() => {
    if (!speakers) return;
    const owns = (target: unknown) =>
      target === document.body ||
      target === document.documentElement ||
      (target instanceof Node && Boolean(root.current?.contains(target)));
    const editable = (target: unknown) =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "IFRAME"].includes(target.tagName));
    const activates = (target: unknown) =>
      target instanceof Element &&
      Boolean(target.closest('button, a[href], summary, [role="button"]'));
    const onKey = (event: KeyboardEvent) => {
      const action = consoleKeydown(event, { owns, editable, activates });
      if (!action) return;
      event.preventDefault();
      if (action === "exit") leaveSpeakers();
      else if (action === "toggle") playMusic();
      else if (action === "next") nextTrack();
      else if (action === "previous") previousTrack();
      else stepVolume(action === "louder" ? 1 : -1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    speakers,
    leaveSpeakers,
    playMusic,
    nextTrack,
    previousTrack,
    stepVolume,
  ]);
  const enterWorld = useCallback(() => {
    if (!ready || loading.phase !== "ready" || loading.error) return;
    if (presented.phase !== "ready" || presented.progress !== 100) return;
    if (musicEnabled) music.unlock();
    if (ambientEnabled) ambient.unlock();
    setEntered(true);
  }, [
    ready,
    loading.phase,
    loading.error,
    presented.phase,
    presented.progress,
    music,
    musicEnabled,
    ambient,
    ambientEnabled,
  ]);
  useLayoutEffect(() => {
    // Keep these direct world children mounted: their own state and overlap
    // measurement survive the entry transition, just like focus modes.
    for (const element of root.current?.querySelectorAll<HTMLElement>(
      ':scope > .scene-panel, :scope > [aria-label="Time of day"]',
    ) ?? [])
      element.inert = !entered;
  }, [ready, entered]);
  useEffect(() => {
    if (entered) menuButton.current?.focus();
  }, [entered]);
  const speakerControl = useMemo<SpeakerControl>(
    () => ({
      music,
      onToggle: playMusic,
      focused: speakers,
      onFocus: ready && !focus && !portrait ? enterSpeakers : undefined,
    }),
    [music, speakers, ready, focus, portrait, enterSpeakers, playMusic],
  );

  // The living-room TV (tv-home-screen T2, T3): Kevnnard TV is drawn on
  // the TV's own glass (TvScreen), idle in the room like the monitor's
  // terminal. A click on it from the room moves the camera straight in to
  // the panel and hides the world controls (header, clock and lights
  // panel); once the camera arrives the screen takes clicks and taps, and
  // an off-screen companion (TvHome) takes the remote's keys. Esc or Back
  // to room returns the camera and focus, and the screen to its preview.
  const [tv, setTv] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const [tvHome, setTvHome] = useState(initialTvHome);
  const [tvClip, setTvClip] = useState(false);
  const tvVideo = useRef<HTMLVideoElement>(null);
  const returnTv = useRef(false);
  const enterTv = useCallback(() => {
    if (!focus && !portrait && !speakers) {
      setGalleryCase(null);
      setTv(true);
    }
  }, [focus, portrait, speakers]);
  const arriveTv = useCallback(() => setTvOpen(true), []);
  const leaveTv = useCallback(() => {
    returnTv.current = true;
    setTvOpen(false);
    setTv(false);
    setTvHome(initialTvHome());
    setTvClip(false);
  }, []);
  useEffect(() => {
    if (!tv || tvOpen) return;
    const timer = setTimeout(arriveTv, ARRIVAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [tv, tvOpen, arriveTv]);
  useEffect(() => {
    if (tv || !returnTv.current) return;
    returnTv.current = false;
    menuButton.current?.focus();
  }, [tv]);
  // A press on the screen or the companion; the clip starts from the
  // visitor's own click or key, muted.
  const tvNow = useRef(tvHome);
  tvNow.current = tvHome;
  const pressTv = useCallback(
    (id: string) => {
      const { state, effect } = tvHomeAction(tvNow.current, id);
      setTvHome(state);
      if (effect === "exit") leaveTv();
      else if (effect === "music") playMusic();
      else if (effect === "clip") {
        const clip = tvVideo.current;
        if (clip?.paused) void clip.play().catch(() => undefined);
        else clip?.pause();
      }
    },
    [leaveTv, playMusic],
  );
  const moveTv = useCallback(
    (key: string) => setTvHome((state) => tvMove(state, key) ?? state),
    [],
  );
  const tvTime = tvClock(clock.hours);
  const tvLayout = useMemo(
    () =>
      tvScreenLayout(tvHome, {
        active: tvOpen,
        clock: tvTime,
        music: { playing: song.playing, track: song.track?.title ?? null },
        clipPlaying: tvClip,
      }),
    [tvHome, tvOpen, tvTime, song.playing, song.track, tvClip],
  );
  const tvControl = useMemo<TvControl>(
    () => ({
      focused: tv,
      active: tvOpen,
      onEnter:
        ready && entered && !focus && !portrait && !speakers
          ? enterTv
          : undefined,
      onArrive: arriveTv,
      layout: tvLayout,
      onPress: pressTv,
      video: tvVideo,
      clipPlaying: tvClip,
    }),
    [
      tv,
      tvOpen,
      ready,
      entered,
      focus,
      portrait,
      speakers,
      enterTv,
      arriveTv,
      tvLayout,
      pressTv,
      tvClip,
    ],
  );

  useEffect(() => {
    if (!galleryCase) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !focus && !portrait && !speakers)
        setGalleryCase(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [galleryCase, focus, portrait, speakers]);

  // The desk things (keyboard-card T1): clicked from the room like the
  // gallery, never while another close-up holds the camera. The terminal,
  // the portrait and the speakers still open from a desk view.
  const deskControl = useMemo<DeskControl>(
    () => ({
      focused: galleryCase,
      onInspect:
        ready && entered && !focus && !portrait && !speakers && !tv
          ? setGalleryCase
          : undefined,
    }),
    [galleryCase, ready, entered, focus, portrait, speakers, tv],
  );

  // The guide's buttons (world-game-menu T1): the same callbacks the menu
  // always ran; the close-ups wait for the world to be ready, as before.
  const menuActions = useMemo<GuideActions>(
    () => ({
      recenter: {
        label: "Recenter view",
        run: () => {
          setGalleryCase(null);
          setHome((count) => count + 1);
        },
      },
      ...(ready && {
        terminal: { label: "Enter terminal", run: enter },
        video: { label: "Watch video", run: enterPortrait },
        music: {
          label: song.playing ? "Pause music" : "Play music",
          run: playMusic,
          pressed: song.playing,
        },
        speakers: { label: "Focus speakers", run: enterSpeakers },
        ambient: {
          label: "Outdoor sounds",
          run: toggleAmbient,
          pressed: ambientEnabled,
        },
      }),
    }),
    [
      ready,
      enter,
      enterPortrait,
      song.playing,
      playMusic,
      enterSpeakers,
      toggleAmbient,
      ambientEnabled,
    ],
  );

  const screen = useMemo<MonitorTerminal>(
    () => ({
      layout,
      scroll,
      ring,
      focused: focus,
      active: terminal,
      onEnter: ready && !portrait ? enter : undefined,
      onHit: hit,
      onScroll: setScroll,
    }),
    [
      layout,
      scroll,
      ring,
      focus,
      terminal,
      ready,
      portrait,
      speakers,
      enter,
      hit,
    ],
  );

  // The side cards stay mounted through their exit (card-motion T1): each
  // fades in and out like the clock and the scene panel, and a switch
  // (mug -> keyboard, case -> case) cross-fades the old card with the new.
  const cardsShown = ready && entered && !focus && !portrait && !speakers;
  const caseCards = useCardPresence(
    cardsShown && galleryCase && caseStory ? galleryCase : null,
    caseStory,
    reducedMotion,
  );
  const productCards = useCardPresence(
    cardsShown && deskProduct ? "keyboard" : null,
    deskProduct,
    reducedMotion,
  );
  const coffeeCards = useCardPresence(
    cardsShown && deskStory ? "coffee" : null,
    deskStory,
    reducedMotion,
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
    <div
      ref={root}
      className={cn(
        "relative h-full w-full",
        !entered && "world-entry-pending",
        entered && "world-entry-revealed",
        focus && "world-terminal-focus",
        portrait && "world-terminal-focus",
        speakers && "world-terminal-focus",
        tv && "world-terminal-focus",
        tv && "world-tv-focus",
        galleryCase && "world-gallery-focus",
      )}
    >
      <SceneErrorBoundary>
        <div
          inert={!entered}
          aria-hidden={!entered}
          className="world-entry-scene"
        >
          <Suspense fallback={null}>
            <WorldScene
              onOutdoor={onOutdoor}
              hours={clock.hours}
              reducedMotion={reducedMotion}
              home={home}
              lights={lights}
              power={power}
              onReady={onReady}
              onProgress={setLoading}
              focus={focus}
              // While the TV holds the camera no other close-up starts.
              terminal={tv ? { ...screen, onEnter: undefined } : screen}
              onMonitorArrive={arrive}
              portrait={
                tv
                  ? { ...portraitControl, onEnter: undefined }
                  : portraitControl
              }
              speakers={
                tv ? { ...speakerControl, onFocus: undefined } : speakerControl
              }
              tv={tvControl}
              galleryCase={galleryCase}
              galleryStory={
                deskProduct !== null ||
                deskStory !== null ||
                (caseStory !== null && storyOpen)
              }
              onInspectCase={
                ready && entered && !focus && !portrait && !speakers && !tv
                  ? setGalleryCase
                  : undefined
              }
              desk={deskControl}
            />
          </Suspense>
        </div>
        <div className="world-entry-veil" inert={entered} aria-hidden={entered}>
          <WorldEntryLoader
            state={presented}
            reducedMotion={reducedMotion}
            onEnter={enterWorld}
            onRetry={reloadWorld}
          />
        </div>
      </SceneErrorBoundary>

      <header
        inert={
          !entered || focus || portrait || speakers || galleryCase !== null
        }
        className={`pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-3 p-4${!entered || focus || portrait || speakers || galleryCase !== null ? " invisible" : ""}`}
      >
        <a
          href="/"
          className="world-portfolio-link world-hud-trigger pointer-events-auto"
        >
          ← Back to portfolio
        </a>
        <WorldMenu triggerRef={menuButton} actions={menuActions} />
        {song.error && !speakers && (
          <p
            role="alert"
            className="pointer-events-auto basis-full rounded-xl bg-zinc-950/80 px-4 py-2 text-right text-sm text-amber-200"
          >
            {song.error}
          </p>
        )}
      </header>

      {ready &&
        entered &&
        galleryCase &&
        !focus &&
        !portrait &&
        !speakers &&
        !isDeskItemId(galleryCase) && (
          <CollectionRail
            focused={galleryCase}
            onInspect={setGalleryCase}
            onReturn={() => setGalleryCase(null)}
            compact
          />
        )}
      {caseCards.map((card) => (
        <CaseStory
          key={card.key}
          story={card.value}
          open={storyOpen}
          onOpenChange={setStoryOpen}
          reducedMotion={reducedMotion}
          state={card.state}
          onMotionEnd={card.onMotionEnd}
        />
      ))}
      {/* The desk isn't the collection: no rail, the card leads back. */}
      {productCards.map((card) => (
        <ProductCard
          key={card.key}
          product={card.value}
          onReturn={() => setGalleryCase(null)}
          state={card.state}
          onMotionEnd={card.onMotionEnd}
        />
      ))}
      {coffeeCards.map((card) => (
        <CoffeeCard
          key={card.key}
          story={card.value}
          onClose={() => setGalleryCase(null)}
          state={card.state}
          onMotionEnd={card.onMotionEnd}
        />
      ))}

      {/* Direct children of the world container: ScenePanel measures its
          parent to sit above the clock (L61). */}
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

      {focus && (
        <button
          ref={exitButton}
          type="button"
          onClick={leave}
          className={`${pillClass} absolute top-4 left-4`}
        >
          Exit terminal
        </button>
      )}
      {portrait && (
        <button
          ref={exitPortrait}
          type="button"
          onClick={leavePortrait}
          className={`${pillClass} absolute top-4 left-4`}
        >
          Exit portrait
        </button>
      )}
      {speakers && (
        <button
          type="button"
          onClick={leaveSpeakers}
          className={`${pillClass} absolute top-4 left-4 min-h-11`}
        >
          Exit speakers
        </button>
      )}
      {speakers && (
        <SpeakerBar
          state={song}
          music={music}
          volume={volume}
          range={range}
          limits={limits}
          reducedMotion={reducedMotion}
          playRef={speakerPlay}
          onPlay={playMusic}
          onPrevious={previousTrack}
          onNext={nextTrack}
          onVolume={setVolume}
          onRange={setRange}
        />
      )}
      {tvOpen && (
        <TvHome
          state={tvHome}
          layout={tvLayout}
          videoRef={tvVideo}
          onPress={pressTv}
          onMove={moveTv}
          onClip={setTvClip}
          onClose={leaveTv}
        />
      )}
      {terminal && (
        <TerminalMonitor
          buffer={buffer}
          mainRef={companion}
          onOpen={open}
          onExit={leave}
          onRing={focusRing}
        />
      )}
    </div>
  );
}
