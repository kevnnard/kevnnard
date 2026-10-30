// Music on entry (world-persistent-settings T2, S2): when the visitor left
// the music on, the world tries once to start it as soon as it is ready,
// fading in over two seconds (speaker-music.ts). Browsers may refuse sound
// before the visitor interacts: the start then ends blocked, and the next
// trusted pointer or key gesture resumes it. Nothing retries on a timer,
// nothing mutes to get around the policy, and an explicit pause always
// wins. Cleanup removes the listeners and the pending decision only; the
// player itself is WorldApp's to dispose.

import { CLICK_DELAY, type Timers } from "./speaker.ts";
import { MUSIC_BLOCKED, type SpeakerMusic } from "./speaker-music.ts";

/** Pointer and key events that carry the browser's user activation. */
const UNLOCKS = ["pointerdown", "keydown"] as const;
/** Ends of a gesture: the decision waits for the controls after them. */
const ENDS = ["click", "keyup"] as const;
/**
 * Ms after a gesture ends before deciding: past the speaker click arbiter's
 * delayed toggle, so a click on a speaker or Play music, or Space in the
 * console, is never doubled or turned back into a pause.
 */
const DECIDE_DELAY = CLICK_DELAY + 120;

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const ignore = () => {
  // SpeakerMusic never rejects; its state carries any failure.
};

/**
 * Starts the music once (WorldApp: when ready, with the volume and reach
 * applied and music left on), then resumes a blocked start on the next
 * trusted gesture on `target`. Returns the cleanup. `trusted` and `timers`
 * exist for tests; by default only the browser's own events count.
 */
export function bindMusicResume(
  music: SpeakerMusic,
  target: EventTarget,
  {
    trusted = (event: Event) => event.isTrusted,
    timers = browserTimers,
  }: { trusted?: (event: Event) => boolean; timers?: Timers } = {},
): () => void {
  let closed = false;
  let pending: unknown = null;

  /** Only a start the autoplay policy blocked; a pause or failure stays. */
  const blocked = () => {
    const { status, error } = music.getState();
    return status === "error" && error === MUSIC_BLOCKED && !music.getWanted();
  };
  /** A start still waiting on the context: the gesture can unlock it. */
  const starting = () =>
    music.getWanted() && music.getState().status === "loading";

  // The one startup attempt. A start already under way is joined, not
  // restarted; an explicit pause made before binding is kept.
  const { status } = music.getState();
  if (!music.getWanted() && (status === "idle" || status === "error"))
    music.play().catch(ignore);

  const decide = () => {
    pending = null;
    if (!closed && blocked()) music.play().catch(ignore);
  };
  // Inside the gesture itself: resume the context (Safari needs that), but
  // never decide yet; never prevent or stop the event either.
  const onUnlock = (event: Event) => {
    if (closed || !trusted(event)) return;
    if (blocked() || starting()) music.unlock();
  };
  const onEnd = (event: Event) => {
    if (closed || !trusted(event) || !blocked()) return;
    music.unlock();
    if (pending === null) pending = timers.set(decide, DECIDE_DELAY);
  };

  const options = { capture: true, passive: true };
  for (const type of UNLOCKS) target.addEventListener(type, onUnlock, options);
  for (const type of ENDS) target.addEventListener(type, onEnd, options);
  return () => {
    if (closed) return;
    closed = true;
    if (pending !== null) timers.clear(pending);
    pending = null;
    for (const type of UNLOCKS)
      target.removeEventListener(type, onUnlock, options);
    for (const type of ENDS) target.removeEventListener(type, onEnd, options);
  };
}
