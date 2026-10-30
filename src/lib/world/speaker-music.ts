// Music on the shelf speakers (world-speaker-music T2, S1-S5): five local,
// generated loops listed in /world/audio/manifest.json (T1). Nothing loads
// before the visitor asks: the first click reads and checks the manifest,
// then fetches and decodes only the current track (two decoded buffers at
// most). Playback is Web Audio: an AudioBufferSourceNode looping the
// manifest's bounds, through one panner at the pair's middle, faded by the
// camera's distance (speaker.ts). No HTMLAudio, autoplay or remote source.
// The console (speaker-focus-console T3) adds the visitor's volume, an
// analyser for the spectrum, after the volume and before the distance, and
// a listening reach (speaker-range.ts); without a reach the fade is
// speaker.ts's own.

import type { Vec3 } from "./camera.ts";
import {
  SPEAKER_AUDIO,
  SPEAKER_PAIR,
  speakerDistance,
  speakerGain,
  type Timers,
} from "./speaker.ts";
import { rangeGain } from "./speaker-range.ts";

export const MUSIC_MANIFEST = "/world/audio/manifest.json";
export const TRACK_IDS = [
  "cafe-drift",
  "ambient-focus",
  "velvet-jazz",
  "soft-circuit",
  "midnight-code",
] as const;

export interface Track {
  id: (typeof TRACK_IDS)[number];
  title: string;
  genre: string;
  file: string;
  /** Seconds, as decoded by the generator. */
  duration: number;
  loopStart: number;
  loopEnd: number;
  bytes: number;
  sha256: string;
}

/** A failure the visitor can read. */
export class MusicError extends Error {}

/** The error while the browser's autoplay policy keeps the context suspended. */
export const MUSIC_BLOCKED =
  "The browser blocked playback. Click a speaker or Play music to start it.";

const invalid = (reason: string) =>
  new MusicError(`The music list is invalid: ${reason}.`);

/** Checks the manifest's tracks; throws a MusicError naming the first problem. */
export function parseManifest(data: unknown): Track[] {
  const list = (data as { tracks?: unknown } | null)?.tracks;
  if (!Array.isArray(list)) throw invalid("no track list");
  const tracks = list.map((raw, index): Track => {
    const t = (raw ?? {}) as Record<string, unknown>;
    const where = `track ${index + 1}`;
    for (const key of ["id", "title", "genre", "file", "sha256"])
      if (typeof t[key] !== "string" || t[key] === "")
        throw invalid(`${where} has no ${key}`);
    for (const key of ["duration", "loopStart", "loopEnd", "bytes"])
      if (typeof t[key] !== "number" || !Number.isFinite(t[key]))
        throw invalid(`${where} has no finite ${key}`);
    const track = t as unknown as Track;
    if (!(TRACK_IDS as readonly string[]).includes(track.id))
      throw invalid(`${where} is unknown (${track.id})`);
    if (track.file !== `/world/audio/${track.id}.m4a`)
      throw invalid(`${track.id} is not a local /world/audio file`);
    if (!/^[0-9a-f]{64}$/.test(track.sha256))
      throw invalid(`${track.id} has no sha256`);
    if (
      !(track.duration > 0) ||
      !(track.bytes > 0) ||
      !(track.loopStart >= 0 && track.loopStart < track.loopEnd) ||
      track.loopEnd > track.duration
    )
      throw invalid(`${track.id} has a loop outside its length`);
    return track;
  });
  const ids = new Set(tracks.map((t) => t.id));
  if (ids.size !== tracks.length || ids.size !== TRACK_IDS.length)
    throw invalid(`it needs each of the ${TRACK_IDS.length} tracks once`);
  return tracks;
}

/**
 * How far (s) the decoded length may stray from the manifest: AAC priming
 * and padding are a few thousand frames, well under this.
 */
const DECODE_SLACK = 0.25;

/**
 * The manifest's loop, as declared. Each file carries 1 s of wrapped audio
 * outside its loop on both sides, so a decoder's few frames of priming
 * shift never cut it. A buffer whose length doesn't match the manifest is
 * not the listed file: refused, never rescaled or played whole.
 */
export function loopBounds(
  track: Track,
  decoded: number,
): { start: number; end: number } {
  if (
    !Number.isFinite(decoded) ||
    Math.abs(decoded - track.duration) > DECODE_SLACK
  )
    throw new MusicError(
      `“${track.title}” decoded to ${Number.isFinite(decoded) ? decoded.toFixed(2) : "no"} s, not the listed ${track.duration.toFixed(2)} s.`,
    );
  return { start: track.loopStart, end: Math.min(track.loopEnd, decoded) };
}

export type MusicStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface MusicState {
  status: MusicStatus;
  /** The visitor wants music: kept while a hidden tab silences it. */
  playing: boolean;
  track: Track | null;
  error: string | null;
}

/**
 * Seconds: every start (first play, a new track, back from a hidden tab)
 * rises from silence over about this long (world-persistent-settings S2).
 */
const START_FADE = 2;
/** Seconds: every stop stays short, so track changes never overlap long. */
const STOP_FADE = 0.12;
/** Longest wait (ms) for a suspended context to resume before calling it blocked. */
const RESUME_WAIT = 400;
/** Decoded buffers kept: the current track and the one before. */
const CACHE = 2;
/** Analyser FFT size: SPECTRUM_BINS frequency bins for the console. */
const FFT_SIZE = 512;
export const SPECTRUM_BINS = FFT_SIZE / 2;

interface Voice {
  source: AudioBufferSourceNode;
  envelope: GainNode;
  startedAt: number;
  from: number;
  start: number;
  end: number;
}

interface Pose {
  position: Vec3;
  forward: Vec3;
  up: Vec3;
}

function setParam(param: AudioParam | undefined, value: number, at: number) {
  param?.setValueAtTime(value, at);
}

/** Older Safari has only setPosition/setOrientation. */
function placeListener(context: AudioContext, pose: Pose) {
  const listener = context.listener as AudioListener & {
    setPosition?: (x: number, y: number, z: number) => void;
    setOrientation?: (...v: number[]) => void;
  };
  const t = context.currentTime;
  if (listener.positionX) {
    const [px, py, pz] = pose.position;
    const [fx, fy, fz] = pose.forward;
    const [ux, uy, uz] = pose.up;
    setParam(listener.positionX, px, t);
    setParam(listener.positionY, py, t);
    setParam(listener.positionZ, pz, t);
    setParam(listener.forwardX, fx, t);
    setParam(listener.forwardY, fy, t);
    setParam(listener.forwardZ, fz, t);
    setParam(listener.upX, ux, t);
    setParam(listener.upY, uy, t);
    setParam(listener.upZ, uz, t);
  } else {
    listener.setPosition?.(...pose.position);
    listener.setOrientation?.(...pose.forward, ...pose.up);
  }
}

function defaultContext(): AudioContext | null {
  const Context =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Context ? new Context() : null;
}

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const IDLE: MusicState = {
  status: "idle",
  playing: false,
  track: null,
  error: null,
};

const ignore = () => {
  // Failures already land in the state; nothing else to do.
};

/**
 * The world's one music player. Every async step carries the epoch it
 * started in; play, pause, a track change, a hidden tab and dispose each
 * start a new one, so a late fetch or decode never starts a source. Public
 * methods never reject: failures land in `getState().error`.
 */
export class SpeakerMusic {
  #createContext: () => AudioContext | null;
  #fetch: typeof fetch;
  #timers: Timers;
  #context: AudioContext | null = null;
  #bus: {
    volume: GainNode;
    analyser: AnalyserNode;
    level: GainNode;
    panner: PannerNode;
  } | null = null;
  #manifest: { promise: Promise<Track[]>; abort: AbortController } | null =
    null;
  #tracks: Track[] | null = null;
  #index = 0;
  #steps = 0;
  /** Where the current track resumes, in buffer seconds; null: its loop start. */
  #offset: number | null = null;
  #wanted = false;
  #hidden = false;
  #epoch = 0;
  #voice: Voice | null = null;
  #buffers = new Map<string, AudioBuffer>();
  #loads = new Map<
    string,
    { promise: Promise<AudioBuffer>; abort: AbortController }
  >();
  #pose: Pose = { position: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0] };
  #level = 0;
  /** The visitor's volume, 0..1; kept across dispose like the reach. */
  #volume = 1;
  /** Listening reach in metres (speaker-range.ts); null: speaker.ts's fade. */
  #reach: number | null = null;
  #state: MusicState = IDLE;
  #listeners = new Set<() => void>();

  constructor({
    createContext = defaultContext,
    fetch: fetcher = (input, init) => globalThis.fetch(input, init),
    timers = browserTimers,
  }: {
    createContext?: () => AudioContext | null;
    fetch?: typeof fetch;
    timers?: Timers;
  } = {}) {
    this.#createContext = createContext;
    this.#fetch = fetcher;
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
   * The visitor's transport wish: true after play, false after pause, a
   * failed or blocked start and dispose; a hidden tab keeps it. Reads only.
   */
  getWanted = () => this.#wanted;

  /**
   * Call from the click or key itself: creates and resumes the context so
   * Safari lets later, timed playback sound. Fetches and plays nothing.
   */
  unlock() {
    try {
      this.#context ??= this.#createContext();
    } catch {
      this.#context = null;
    }
    if (this.#context && this.#context.state !== "running")
      this.#context.resume().catch(ignore);
  }

  toggle(): Promise<void> {
    return this.#wanted ? Promise.resolve(this.pause()) : this.play();
  }

  async play() {
    this.#wanted = true;
    const run = ++this.#epoch;
    if (!this.#hidden) await this.#start(run);
  }

  pause() {
    this.#wanted = false;
    this.#epoch++;
    this.#stop();
    this.#set({ status: "paused", playing: false, error: null });
  }

  next() {
    return this.#step(1);
  }

  previous() {
    return this.#step(-1);
  }

  /** The camera, from rendered frames: pans the music and sets its level. */
  setListener(position: Vec3, forward: Vec3, up: Vec3) {
    this.#pose = { position, forward, up };
    if (this.#context && this.#bus) placeListener(this.#context, this.#pose);
    this.#applyLevel();
  }

  /**
   * The listening reach in metres, or null for speaker.ts's fade. Re-levels
   * from the last listener at once: a still camera sends no new frame.
   */
  setReach(reach: number | null) {
    this.#reach =
      reach !== null && Number.isFinite(reach) && reach > 0 ? reach : null;
    this.#applyLevel();
  }

  /** The visitor's volume, clamped to 0..1; non-finite values are ignored. */
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.#volume = Math.min(Math.max(volume, 0), 1);
    const context = this.#context;
    if (!context || !this.#bus) return;
    this.#bus.volume.gain.setTargetAtTime(
      this.#volume,
      context.currentTime,
      SPEAKER_AUDIO.smoothing,
    );
  }

  getVolume = () => this.#volume;

  /**
   * Copies the analyser's frequency bins (0..255, after the volume, before
   * the distance) into `out`. Zeros and false while nothing sounds: before
   * the first start, paused, hidden or muted. Never creates a context.
   */
  spectrum(out: Uint8Array<ArrayBuffer>): boolean {
    const bus = this.#bus;
    if (!bus || !this.#voice || this.#hidden || this.#volume === 0) {
      out.fill(0);
      return false;
    }
    bus.analyser.getByteFrequencyData(out);
    return true;
  }

  #levelFor(position: Vec3) {
    const distance = speakerDistance(position);
    return this.#reach === null
      ? speakerGain(distance)
      : rangeGain(distance, this.#reach);
  }

  #applyLevel() {
    const context = this.#context;
    const level = this.#levelFor(this.#pose.position);
    if (!context || !this.#bus) {
      this.#level = level;
      return;
    }
    if (Math.abs(level - this.#level) < 1e-3) return;
    this.#level = level;
    this.#bus.level.gain.setTargetAtTime(
      level,
      context.currentTime,
      SPEAKER_AUDIO.smoothing,
    );
  }

  /** A hidden tab stops the source; showing it again resumes if still wanted. */
  setHidden(hidden: boolean) {
    if (hidden === this.#hidden) return;
    this.#hidden = hidden;
    const run = ++this.#epoch;
    if (hidden) this.#stop();
    else if (this.#wanted) this.#start(run).catch(ignore);
  }

  /** Stops, aborts and closes everything; the player can start over later. */
  dispose() {
    this.#epoch++;
    this.#wanted = false;
    this.#stop(0);
    this.#manifest?.abort.abort();
    for (const load of this.#loads.values()) load.abort.abort();
    this.#loads.clear();
    this.#buffers.clear();
    this.#context?.close().catch(ignore);
    this.#context = null;
    this.#bus = null;
    this.#manifest = null;
    this.#tracks = null;
    this.#index = 0;
    this.#steps = 0;
    this.#offset = null;
    this.#set(IDLE);
  }

  #set(patch: Partial<MusicState>) {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }

  #fail(run: number, error: unknown) {
    if (run !== this.#epoch) return;
    this.#wanted = false;
    this.#stop();
    const message =
      error instanceof MusicError
        ? error.message
        : "The music couldn't play. Try again.";
    this.#set({ status: "error", playing: false, error: message });
  }

  async #step(direction: 1 | -1) {
    this.#steps += direction;
    const run = ++this.#epoch;
    this.#stop();
    try {
      const tracks = this.#tracks ?? (await this.#loadManifest());
      if (this.#steps !== 0) {
        const n = tracks.length;
        this.#index = (((this.#index + this.#steps) % n) + n) % n;
        this.#steps = 0;
        this.#offset = null;
        const current = tracks[this.#index].id;
        for (const [id, load] of this.#loads)
          if (id !== current) load.abort.abort();
        this.#set({
          track: tracks[this.#index],
          status: this.#wanted ? "loading" : "paused",
        });
      }
      if (run === this.#epoch && this.#wanted && !this.#hidden)
        await this.#start(run);
    } catch (error) {
      this.#fail(run, error);
    }
  }

  async #start(run: number) {
    try {
      this.unlock();
      const context = this.#context;
      if (!context)
        throw new MusicError(
          "This browser doesn't support Web Audio, so the speakers can't play.",
        );
      this.#set({ status: "loading", playing: true, error: null });
      if (context.state !== "running") await this.#resume(context);
      if (run !== this.#epoch) return;
      if (context.state !== "running") throw new MusicError(MUSIC_BLOCKED);
      const tracks = this.#tracks ?? (await this.#loadManifest());
      if (run !== this.#epoch) return;
      const track = tracks[this.#index];
      const buffer = await this.#buffer(context, track);
      if (run !== this.#epoch || this.#hidden || !this.#wanted) return;
      this.#play(context, track, buffer);
      this.#set({ status: "playing", track, error: null });
    } catch (error) {
      this.#fail(run, error);
    }
  }

  #resume(context: AudioContext) {
    return new Promise<void>((resolve) => {
      const timer = this.#timers.set(resolve, RESUME_WAIT);
      context.resume().then(
        () => {
          this.#timers.clear(timer);
          resolve();
        },
        () => {
          this.#timers.clear(timer);
          resolve();
        },
      );
    });
  }

  #loadManifest(): Promise<Track[]> {
    if (!this.#manifest) {
      const abort = new AbortController();
      const promise = (async () => {
        const response = await this.#fetch(MUSIC_MANIFEST, {
          signal: abort.signal,
        }).catch(() => {
          throw new MusicError("The music list couldn't load. Try again.");
        });
        if (!response.ok)
          throw new MusicError(
            `The music list couldn't load (HTTP ${response.status}). Try again.`,
          );
        const tracks = parseManifest(await response.json());
        if (abort.signal.aborted || this.#manifest?.abort !== abort)
          throw new MusicError("Cancelled.");
        this.#tracks = tracks;
        if (!this.#state.track) this.#set({ track: tracks[this.#index] });
        return tracks;
      })();
      const entry = { promise, abort };
      this.#manifest = entry;
      // A failed list is fetched again on the next try.
      promise.catch(() => {
        if (this.#manifest === entry) this.#manifest = null;
      });
    }
    return this.#manifest.promise;
  }

  #buffer(context: AudioContext, track: Track): Promise<AudioBuffer> {
    const cached = this.#buffers.get(track.id);
    if (cached) {
      this.#buffers.delete(track.id);
      this.#buffers.set(track.id, cached);
      return Promise.resolve(cached);
    }
    const pending = this.#loads.get(track.id);
    if (pending && !pending.abort.signal.aborted) return pending.promise;
    const abort = new AbortController();
    const promise = (async () => {
      const response = await this.#fetch(track.file, { signal: abort.signal });
      if (!response.ok)
        throw new MusicError(`“${track.title}” couldn't load. Try again.`);
      const data = await response.arrayBuffer();
      if (abort.signal.aborted) throw new MusicError("Cancelled.");
      const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
        const decoding = context.decodeAudioData(data, resolve, reject);
        decoding?.then(resolve, reject);
      }).catch(() => {
        throw new MusicError(
          `This browser can't decode “${track.title}” (AAC .m4a).`,
        );
      });
      if (
        abort.signal.aborted ||
        this.#context !== context ||
        this.#loads.get(track.id)?.abort !== abort
      )
        throw new MusicError("Cancelled.");
      loopBounds(track, buffer.duration);
      this.#buffers.set(track.id, buffer);
      while (this.#buffers.size > CACHE) {
        const oldest = this.#buffers.keys().next().value;
        if (oldest === undefined) break;
        this.#buffers.delete(oldest);
      }
      return buffer;
    })();
    const entry = { promise, abort };
    this.#loads.set(track.id, entry);
    promise
      .finally(() => {
        if (this.#loads.get(track.id) === entry) this.#loads.delete(track.id);
      })
      .catch(ignore);
    return promise;
  }

  #graph(context: AudioContext) {
    if (this.#bus) return this.#bus;
    const volume = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.8;
    const level = context.createGain();
    const panner = context.createPanner();
    panner.panningModel = "equalpower";
    panner.distanceModel = "inverse";
    // The level gain is the only distance attenuation.
    panner.rolloffFactor = 0;
    const [x, y, z] = SPEAKER_PAIR.center;
    const t = context.currentTime;
    setParam(panner.positionX, x, t);
    setParam(panner.positionY, y, t);
    setParam(panner.positionZ, z, t);
    if (!panner.positionX) panner.setPosition(x, y, z);
    this.#level = this.#levelFor(this.#pose.position);
    level.gain.setValueAtTime(this.#level, t);
    volume.gain.setValueAtTime(this.#volume, t);
    // Volume, then the analyser: the spectrum follows the volume (mute
    // reads zero) but not the distance.
    volume.connect(analyser).connect(level).connect(panner);
    panner.connect(context.destination);
    placeListener(context, this.#pose);
    this.#bus = { volume, analyser, level, panner };
    return this.#bus;
  }

  #play(context: AudioContext, track: Track, buffer: AudioBuffer) {
    const bus = this.#graph(context);
    const { start, end } = loopBounds(track, buffer.duration);
    const from = Math.min(Math.max(this.#offset ?? start, 0), end);
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = start;
    source.loopEnd = end;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.setTargetAtTime(1, now, START_FADE / 4);
    source.connect(envelope).connect(bus.volume);
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
    };
    source.start(now, from);
    this.#offset = from;
    this.#voice = { source, envelope, startedAt: now, from, start, end };
  }

  /** Fades the source out and keeps its exact position for the next start. */
  #stop(fade = STOP_FADE) {
    const voice = this.#voice;
    const context = this.#context;
    if (!voice || !context) return;
    this.#voice = null;
    const now = context.currentTime;
    let at = voice.from + (now - voice.startedAt);
    if (voice.from < voice.end && at >= voice.end)
      at = voice.start + ((at - voice.start) % (voice.end - voice.start));
    this.#offset = at;
    if (fade > 0) voice.envelope.gain.setTargetAtTime(0, now, fade / 4);
    voice.source.stop(now + fade);
  }
}
