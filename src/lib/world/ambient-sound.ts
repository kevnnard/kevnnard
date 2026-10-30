// Outdoor ambient sounds by world hour: crickets through the night and
// birds by day, both in short bursts with long rests, three owl hoots a
// night and one rooster crow at dawn. The schedule, placement and planning are pure; AmbientSound plays
// them through Web Audio. Files load lazily (only when a sound is due) and
// only while enabled and visible. No HTMLAudio, autoplay or remote source.

import { HOUSE_FOOTPRINT, type Rect } from "./house.ts";

export const AMBIENT_IDS = ["owl", "crickets", "rooster", "birds"] as const;
export type AmbientId = (typeof AMBIENT_IDS)[number];

/** Beds: short looped bursts with long silent rests inside their window. */
export const BED_IDS = ["crickets", "birds"] as const;
export type BedId = (typeof BED_IDS)[number];

/** One-shots: the owl's planned hoots and the rooster's single crow. */
export type OneShotId = "owl" | "rooster";

export interface AmbientEvent {
  file: string;
  /** Linear gain before the placement factor (one-shots) or as the bed level. */
  gain: number;
  /** World hours [start, end); start > end wraps past midnight. */
  start: number;
  end: number;
}

export interface BedEvent extends AmbientEvent {
  /** Seconds [min, max] a burst plays, fades included. */
  burst: readonly [number, number];
  /** Seconds [min, max] of silence after a burst fades out. */
  rest: readonly [number, number];
}

const DIR = "/world/audio/ambient";

export const AMBIENT_EVENTS: Readonly<
  Record<OneShotId, AmbientEvent> & Record<BedId, BedEvent>
> = {
  owl: { file: `${DIR}/owl-hoot.mp3`, gain: 0.5, start: 20, end: 5 },
  crickets: {
    file: `${DIR}/crickets-night.mp3`,
    gain: 0.01,
    start: 19,
    end: 4,
    burst: [8, 12],
    rest: [240, 480],
  },
  rooster: { file: `${DIR}/rooster-crow.mp3`, gain: 0.5, start: 6, end: 7 },
  birds: {
    file: `${DIR}/birds-chirp.mp3`,
    gain: 0.05,
    start: 8,
    end: 15,
    burst: [8, 15],
    rest: [180, 360],
  },
};

/**
 * Beds are heard only outside the house: a listener inside its walls is
 * silent, and the level ramps back up within OUTDOOR_MARGIN metres of them.
 */
export const OUTDOOR_MARGIN = 3;
export const OUTDOOR_FADE = 1;
/** House and garage walls with roof overhang; porch and drive stay outdoors. */
export const SHELTER = HOUSE_FOOTPRINT.filter(
  (rect) => rect.id === "main" || rect.id === "garage",
);

/** Metres from (x, z) to the nearest edge of rect; 0 inside it. */
function distanceTo(x: number, z: number, rect: Rect) {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
  return Math.hypot(dx, dz);
}

/** 0 inside a sheltered footprint, 1 at or beyond OUTDOOR_MARGIN from all of them. */
export function outdoorLevel(
  x: number,
  z: number,
  shelters: readonly Rect[] = SHELTER,
): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 1;
  let nearest = Infinity;
  for (const rect of shelters) {
    const d = distanceTo(x, z, rect);
    if (d === 0) return 0;
    nearest = Math.min(nearest, d);
  }
  return Math.min(1, nearest / OUTDOOR_MARGIN);
}

/** Owl hoots planned at random moments in each night's window. */
export const OWL_HOOTS_PER_NIGHT = 3;
/** Seconds: a bed fades out over this when its window ends. */
export const BED_FADE = 4;
/** Seconds: each bed burst fades in and out over this. */
export const BURST_FADE = 2;
/** Seconds: everything fades out on disable, a hidden tab or dispose. */
export const DISABLE_FADE = 0.5;
/** Outdoor angles stay within this stereo pan. */
export const PAN_LIMIT = 0.9;
/** One-shot gains are scaled by a random factor in this range. */
export const GAIN_JITTER: readonly [number, number] = [0.8, 1];

type Random = () => number;

const unitRandom = (random: Random) => {
  const r = random();
  return Number.isFinite(r) ? Math.min(Math.max(r, 0), 1) : 0.5;
};

const between = ([low, high]: readonly [number, number], random: Random) =>
  low + (high - low) * unitRandom(random);

export interface Timers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Hours wrapped into [0, 24); null when not finite. */
export function wrapHours(hours: number): number | null {
  if (!Number.isFinite(hours)) return null;
  return ((hours % 24) + 24) % 24;
}

function inWindow(hours: number, { start, end }: AmbientEvent) {
  return start < end
    ? hours >= start && hours < end
    : hours >= start || hours < end;
}

/** Hours since the window opened, in [0, 24). */
const offsetIn = (hours: number, { start }: AmbientEvent) =>
  (((hours - start) % 24) + 24) % 24;

/** Which ambient sounds may play at this world hour. */
export function ambientAllowed(hours: number): Record<AmbientId, boolean> {
  const h = wrapHours(hours);
  return Object.fromEntries(
    AMBIENT_IDS.map((id) => [
      id,
      h !== null && inWindow(h, AMBIENT_EVENTS[id]),
    ]),
  ) as Record<AmbientId, boolean>;
}

/** A random outdoor angle as a stereo pan, and the jittered gain. */
export function placeOneShot(
  id: OneShotId,
  random: Random,
): { pan: number; gain: number } {
  const pan = -PAN_LIMIT + 2 * PAN_LIMIT * unitRandom(random);
  const [low, high] = GAIN_JITTER;
  const factor = low + (high - low) * unitRandom(random);
  return { pan, gain: AMBIENT_EVENTS[id].gain * factor };
}

export interface OwlState {
  /** Hours into the window of each planned hoot, ascending; null: not planned tonight. */
  moments: number[] | null;
  /** How many planned hoots have played. */
  played: number;
}

export const OWL_IDLE: Readonly<OwlState> = { moments: null, played: 0 };

/**
 * Three owl hoots per night at random moments of its window. The plan is
 * drawn once, from the hour the window is reached, and dropped when the
 * window ends, so each night gets a new plan.
 */
export function owlStep(
  state: OwlState,
  hours: number,
  random: Random,
): { state: OwlState; fire: boolean } {
  const h = wrapHours(hours);
  if (h === null || !inWindow(h, AMBIENT_EVENTS.owl))
    return { state: OWL_IDLE, fire: false };
  const offset = offsetIn(h, AMBIENT_EVENTS.owl);
  const length = offsetIn(AMBIENT_EVENTS.owl.end, AMBIENT_EVENTS.owl);
  let next = state;
  if (next.moments === null) {
    const moments = Array.from(
      { length: OWL_HOOTS_PER_NIGHT },
      () => offset + (length - offset) * unitRandom(random),
    ).sort((a, b) => a - b);
    next = { moments, played: 0 };
  }
  const due = next.moments?.[next.played];
  if (due !== undefined && offset >= due)
    return { state: { ...next, played: next.played + 1 }, fire: true };
  return { state: next, fire: false };
}

export interface RoosterState {
  /** Already crowed this morning. */
  fired: boolean;
  /** The rolled crow hour this morning; null until the window opens. */
  at: number | null;
  /** The last hour seen, to notice a wrap past midnight. */
  last: number | null;
}

export const ROOSTER_IDLE: Readonly<RoosterState> = {
  fired: false,
  at: null,
  last: null,
};

/**
 * One rooster crow per morning at a random moment in its window. The flag
 * resets before dawn (hours under the window start) or on a wrap past
 * midnight, so scrubbing within the same morning never repeats it.
 */
export function roosterStep(
  state: RoosterState,
  hours: number,
  random: Random,
): { state: RoosterState; fire: boolean } {
  const h = wrapHours(hours);
  if (h === null) return { state, fire: false };
  const { start, end } = AMBIENT_EVENTS.rooster;
  const wrapped = state.last !== null && h < state.last - 12;
  let next: RoosterState =
    h < start || wrapped ? { ...ROOSTER_IDLE, last: h } : { ...state, last: h };
  if (next.fired || h >= end) return { state: next, fire: false };
  const moment = next.at ?? start + (end - start) * unitRandom(random);
  next = { ...next, at: moment };
  if (h < moment) return { state: next, fire: false };
  return { state: { ...next, fired: true }, fire: true };
}

export interface AmbientState {
  enabled: boolean;
  error: string | null;
}

const LOAD_ERROR = (id: AmbientId) => `The ${id} sound couldn't load.`;

function defaultContext(): AudioContext | null {
  const Context =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Context ? new Context() : null;
}

const ignore = () => {
  // Failures already land in the state; nothing else to do.
};

/**
 * The world's outdoor ambient player. setHours drives it, once per clock
 * tick; every halt starts a new epoch, so a late fetch or decode never
 * starts a source. Public methods never throw or reject: failures land in
 * `getState().error`.
 */
export class AmbientSound {
  #createContext: () => AudioContext | null;
  #fetch: typeof fetch;
  #random: Random;
  #timers: Timers;
  #context: AudioContext | null = null;
  /** The session's output gain; replaced after each fade-out. */
  #master: GainNode | null = null;
  /** Bed-only gain, scaled by how far the listener is outside the house. */
  #bedBus: GainNode | null = null;
  #outdoor = 1;
  #enabled = true;
  #hidden = false;
  #hours: number | null = null;
  #epoch = 0;
  #beds = new Map<
    BedId,
    { source: AudioBufferSourceNode; envelope: GainNode }
  >();
  /** The epoch a bed load was started in, per bed. */
  #bedRuns = new Map<BedId, number>();
  /** The pending burst end or rest end, per bed. */
  #bedTimers = new Map<BedId, unknown>();
  #voices = new Set<AudioBufferSourceNode>();
  #buffers = new Map<AmbientId, AudioBuffer>();
  #loads = new Map<AmbientId, Promise<AudioBuffer | null>>();
  #failed = new Set<AmbientId>();
  #owl: OwlState = OWL_IDLE;
  #rooster: RoosterState = ROOSTER_IDLE;
  #state: AmbientState = { enabled: true, error: null };
  #listeners = new Set<() => void>();

  constructor({
    createContext = defaultContext,
    fetch: fetcher = (input, init) => globalThis.fetch(input, init),
    random = Math.random,
    timers = browserTimers,
  }: {
    createContext?: () => AudioContext | null;
    fetch?: typeof fetch;
    random?: Random;
    timers?: Timers;
  } = {}) {
    this.#createContext = createContext;
    this.#fetch = fetcher;
    this.#random = random;
    this.#timers = timers;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  getState = () => this.#state;

  /**
   * Call from the click or key itself: creates and resumes the context so
   * later, timed sounds may play. Fetches nothing by itself.
   */
  unlock() {
    try {
      this.#context ??= this.#createContext();
    } catch {
      this.#context = null;
    }
    if (this.#context && this.#context.state !== "running")
      this.#context.resume().catch(ignore);
    this.#sync();
  }

  /** The world clock, in hours; cheap to call every frame. */
  setHours(hours: number) {
    const h = wrapHours(hours);
    if (h === null) return;
    this.#hours = h;
    this.#sync();
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.#enabled) return;
    this.#enabled = enabled;
    this.#set({ enabled });
    if (enabled) this.#sync();
    else this.#halt();
  }

  /** A hidden tab (document.hidden) pauses the schedule. */
  setHidden(hidden: boolean) {
    if (hidden === this.#hidden) return;
    this.#hidden = hidden;
    if (hidden) this.#halt();
    else this.#sync();
  }

  /** Stops, clears and closes everything; unlock starts over. */
  dispose() {
    this.#halt(0);
    this.#context?.close().catch(ignore);
    this.#context = null;
    this.#buffers.clear();
    this.#loads.clear();
    this.#failed.clear();
    this.#owl = OWL_IDLE;
    this.#rooster = ROOSTER_IDLE;
    this.#set({ error: null });
  }

  #set(patch: Partial<AmbientState>) {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }

  #ready() {
    return this.#context !== null && this.#enabled && !this.#hidden;
  }

  #sync() {
    const hours = this.#hours;
    if (!this.#ready() || hours === null) return;
    const allowed = ambientAllowed(hours);
    for (const id of BED_IDS) {
      if (allowed[id]) this.#startBed(id);
      else this.#stopBed(id, BED_FADE);
    }
    const owl = owlStep(this.#owl, hours, this.#random);
    this.#owl = owl.state;
    if (owl.fire) this.#oneShot("owl");
    const step = roosterStep(this.#rooster, hours, this.#random);
    this.#rooster = step.state;
    if (step.fire) this.#oneShot("rooster");
  }

  /** The session's output gain, created on first use. */
  #output(context: AudioContext) {
    if (this.#master) return this.#master;
    const master = context.createGain();
    master.gain.setValueAtTime(1, context.currentTime);
    master.connect(context.destination);
    this.#master = master;
    return master;
  }

  /** Listener position: 1 outdoors, 0 inside the house (see outdoorLevel). */
  setOutdoor(level: number) {
    const next = Number.isFinite(level) ? Math.min(Math.max(level, 0), 1) : 1;
    if (next === this.#outdoor) return;
    this.#outdoor = next;
    const bus = this.#bedBus;
    const context = this.#context;
    if (!bus || !context) return;
    const now = context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(next, now + OUTDOOR_FADE);
  }

  /** The beds' bus, created on first use and ramped by setOutdoor. */
  #bedOutput(context: AudioContext) {
    if (this.#bedBus) return this.#bedBus;
    const bus = context.createGain();
    bus.gain.setValueAtTime(this.#outdoor, context.currentTime);
    bus.connect(this.#output(context));
    this.#bedBus = bus;
    return bus;
  }

  #oneShot(id: OneShotId) {
    const run = this.#epoch;
    this.#load(id).then((buffer) => {
      const context = this.#context;
      if (!buffer || !context || run !== this.#epoch || !this.#ready()) return;
      const { pan, gain } = placeOneShot(id, this.#random);
      const now = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const level = context.createGain();
      level.gain.setValueAtTime(gain, now);
      const output = this.#output(context);
      // Older Safari has no StereoPannerNode: play centred there.
      if (typeof context.createStereoPanner === "function") {
        const panner = context.createStereoPanner();
        panner.pan.setValueAtTime(pan, now);
        source.connect(level).connect(panner).connect(output);
      } else source.connect(level).connect(output);
      source.onended = () => {
        this.#voices.delete(source);
        source.disconnect();
        level.disconnect();
      };
      this.#voices.add(source);
      source.start(now);
    }, ignore);
  }

  /** Starts a burst unless one plays, rests or loads already. */
  #startBed(id: BedId) {
    if (
      this.#beds.has(id) ||
      this.#bedTimers.has(id) ||
      this.#bedRuns.get(id) === this.#epoch
    )
      return;
    const run = this.#epoch;
    this.#bedRuns.set(id, run);
    this.#load(id).then((buffer) => {
      if (this.#bedRuns.get(id) !== run) return;
      this.#bedRuns.delete(id);
      const context = this.#context;
      const hours = this.#hours;
      if (
        !buffer ||
        !context ||
        run !== this.#epoch ||
        this.#beds.has(id) ||
        this.#bedTimers.has(id) ||
        !this.#ready() ||
        hours === null ||
        !ambientAllowed(hours)[id]
      )
        return;
      const event = AMBIENT_EVENTS[id];
      const now = context.currentTime;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(event.gain, now + BURST_FADE);
      source.connect(envelope).connect(this.#bedOutput(context));
      source.onended = () => {
        source.disconnect();
        envelope.disconnect();
      };
      source.start(now);
      this.#beds.set(id, { source, envelope });
      const burst = between(event.burst, this.#random);
      this.#wait(id, burst, () => this.#endBurst(id));
    }, ignore);
  }

  /** Fades the burst out, then rests before the next one. */
  #endBurst(id: BedId) {
    this.#fadeBed(id, BURST_FADE);
    const rest = between(AMBIENT_EVENTS[id].rest, this.#random);
    this.#wait(id, BURST_FADE + rest, () => {
      const hours = this.#hours;
      if (this.#ready() && hours !== null && ambientAllowed(hours)[id])
        this.#startBed(id);
    });
  }

  /** The bed's one pending timer, dropped by a halt or a window end. */
  #wait(id: BedId, seconds: number, run: () => void) {
    const epoch = this.#epoch;
    const handle = this.#timers.set(() => {
      if (this.#bedTimers.get(id) !== handle) return;
      this.#bedTimers.delete(id);
      if (epoch === this.#epoch) run();
    }, seconds * 1000);
    this.#bedTimers.set(id, handle);
  }

  #clearBedTimer(id: BedId) {
    if (!this.#bedTimers.has(id)) return;
    this.#timers.clear(this.#bedTimers.get(id));
    this.#bedTimers.delete(id);
  }

  #stopBed(id: BedId, fade: number) {
    this.#bedRuns.delete(id);
    this.#clearBedTimer(id);
    this.#fadeBed(id, fade);
  }

  #fadeBed(id: BedId, fade: number) {
    const bed = this.#beds.get(id);
    const context = this.#context;
    if (!bed || !context) return;
    this.#beds.delete(id);
    const now = context.currentTime;
    const gain = bed.envelope.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + fade);
    bed.source.stop(now + fade);
  }

  /** Fades every source out and invalidates pending loads. */
  #halt(fade = DISABLE_FADE) {
    this.#epoch++;
    this.#bedRuns.clear();
    for (const id of BED_IDS) this.#clearBedTimer(id);
    const context = this.#context;
    const master = this.#master;
    const beds = [...this.#beds.values()];
    this.#master = null;
    this.#bedBus = null;
    this.#beds.clear();
    const voices = [...this.#voices];
    this.#voices.clear();
    if (!context) return;
    const now = context.currentTime;
    if (master) {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + fade);
    }
    for (const bed of beds) bed.source.stop(now + fade);
    for (const voice of voices) voice.stop(now + fade);
  }

  /** The decoded buffer, cached; null when it failed (reported once). */
  #load(id: AmbientId): Promise<AudioBuffer | null> {
    const cached = this.#buffers.get(id);
    if (cached) return Promise.resolve(cached);
    const context = this.#context;
    if (!context || this.#failed.has(id)) return Promise.resolve(null);
    const pending = this.#loads.get(id);
    if (pending) return pending;
    const entry = { promise: null as Promise<AudioBuffer | null> | null };
    const promise = (async () => {
      try {
        const response = await this.#fetch(AMBIENT_EVENTS[id].file);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          const decoding = context.decodeAudioData(data, resolve, reject);
          decoding?.then(resolve, reject);
        });
        if (this.#context !== context) return null;
        this.#buffers.set(id, buffer);
        return buffer;
      } catch {
        if (this.#context !== context) return null;
        this.#failed.add(id);
        this.#set({ error: LOAD_ERROR(id) });
        return null;
      } finally {
        // A synchronous failure lands here before the map holds the promise.
        if (entry.promise && this.#loads.get(id) === entry.promise)
          this.#loads.delete(id);
      }
    })();
    if (!this.#failed.has(id)) {
      entry.promise = promise;
      this.#loads.set(id, promise);
    }
    return promise;
  }
}
