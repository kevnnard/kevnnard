// World speaker music (T2, S1-S5): manifest checks and the Web Audio
// playback on a fake AudioContext and fetch, observed through what the
// public contract exposes: requests, started and stopped sources, gains.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import type { Vec3 } from "../../src/lib/world/camera.ts";
import {
  CLICK_DELAY,
  clickArbiter,
  SPEAKER_PAIR,
} from "../../src/lib/world/speaker.ts";
import {
  loopBounds,
  MUSIC_BLOCKED,
  MUSIC_MANIFEST,
  parseManifest,
  SpeakerMusic,
  TRACK_IDS,
  type Track,
} from "../../src/lib/world/speaker-music.ts";

const REAL = JSON.parse(
  readFileSync(
    new URL("../../public/world/audio/manifest.json", import.meta.url),
    "utf8",
  ),
);

const track = (id: string, duration: number): Track => ({
  id,
  title: id
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" "),
  genre: "lo-fi",
  file: `/world/audio/${id}.m4a`,
  duration,
  loopStart: 1,
  loopEnd: duration - 1,
  bytes: 1000,
  sha256: "a".repeat(64),
});
const DURATIONS = [122, 128, 116, 119, 125];
const FIXTURE = { tracks: TRACK_IDS.map((id, i) => track(id, DURATIONS[i])) };

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
process.on("unhandledRejection", onUnhandled);
after(() => {
  process.off("unhandledRejection", onUnhandled);
  assert.deepEqual(unhandled, [], "no unhandled promise rejections");
});

const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

class Param {
  value: number;
  target: number;
  /** The last smoothed change's time constant (s); null: none yet. */
  constant: number | null = null;
  constructor(value: number) {
    this.value = value;
    this.target = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
    this.target = value;
    return this;
  }
  setTargetAtTime(value: number, _at: number, constant: number) {
    assert.ok(constant > 0, "a smoothed change, never a step");
    this.target = value;
    this.constant = constant;
    return this;
  }
}

class Node {
  outputs: unknown[] = [];
  connect<T>(node: T) {
    this.outputs.push(node);
    return node;
  }
  disconnect() {
    this.outputs = [];
  }
}

class Gain extends Node {
  gain = new Param(1);
}

class Panner extends Node {
  panningModel = "HRTF";
  distanceModel = "inverse";
  rolloffFactor = 1;
  positionX = new Param(0);
  positionY = new Param(0);
  positionZ = new Param(0);
}

class Analyser extends Node {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  /** What the browser's FFT would report next. */
  bins = new Uint8Array(0);
  reads = 0;
  get frequencyBinCount() {
    return this.fftSize / 2;
  }
  getByteFrequencyData(out: Uint8Array) {
    this.reads++;
    out.fill(0);
    out.set(this.bins.subarray(0, out.length));
  }
}

class Source extends Node {
  buffer: { duration: number; id: string } | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started: { when: number; offset: number } | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  context: FakeContext;
  constructor(context: FakeContext) {
    super();
    this.context = context;
  }
  start(when: number, offset: number) {
    assert.equal(this.started, null, "a source starts once");
    this.started = { when, offset };
  }
  stop(when = this.context.currentTime) {
    this.stopped = when;
  }
  get running() {
    return this.started !== null && this.stopped === null;
  }
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

class FakeContext {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  /** False: the browser's autoplay policy keeps it suspended. */
  allowResume = true;
  resumes = 0;
  sources: Source[] = [];
  gains: Gain[] = [];
  panners: Panner[] = [];
  analysers: Analyser[] = [];
  destination = new Node();
  listener = {
    positionX: new Param(0),
    positionY: new Param(0),
    positionZ: new Param(0),
    forwardX: new Param(0),
    forwardY: new Param(0),
    forwardZ: new Param(-1),
    upX: new Param(0),
    upY: new Param(1),
    upZ: new Param(0),
  };
  /** Decoded length per track id (AAC may differ a little from the manifest). */
  decoded: Record<string, number> = {};
  failDecode = new Set<string>();
  holdDecode: Deferred<void> | null = null;
  resume() {
    this.resumes++;
    if (this.allowResume && this.state !== "closed") this.state = "running";
    return this.allowResume
      ? Promise.resolve()
      : new Promise<void>(() => {
          // The autoplay policy never settles it.
        });
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
  createGain() {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createPanner() {
    const panner = new Panner();
    this.panners.push(panner);
    return panner;
  }
  createAnalyser() {
    const analyser = new Analyser();
    this.analysers.push(analyser);
    return analyser;
  }
  createBufferSource() {
    const source = new Source(this);
    this.sources.push(source);
    return source;
  }
  async decodeAudioData(data: { id: string }) {
    if (this.holdDecode) await this.holdDecode.promise;
    if (this.failDecode.has(data.id))
      throw new DOMException("Unable to decode", "EncodingError");
    const base = FIXTURE.tracks.find((t) => t.id === data.id)?.duration ?? 0;
    return { duration: this.decoded[data.id] ?? base, id: data.id };
  }
  get playing() {
    return this.sources.filter((source) => source.running);
  }
}

function fakeTimers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    set(run: () => void) {
      const id = next++;
      pending.set(id, run);
      return id;
    },
    clear(id: unknown) {
      pending.delete(id as number);
    },
    runAll() {
      for (const [id, run] of [...pending]) {
        pending.delete(id);
        run();
      }
    },
  };
}

function harness(manifest: unknown = FIXTURE) {
  const context = new FakeContext();
  const requests: { url: string; signal?: AbortSignal }[] = [];
  const holds = new Map<string, Deferred<void>>();
  let contexts = 0;
  const statusFor: Record<string, number> = {};
  const fetch = async (url: string, init?: { signal?: AbortSignal }) => {
    requests.push({ url, signal: init?.signal });
    const hold = holds.get(url);
    if (hold) await hold.promise;
    if (init?.signal?.aborted)
      throw new DOMException("The operation was aborted.", "AbortError");
    const status = statusFor[url] ?? 200;
    return {
      ok: status === 200,
      status,
      json: async () => manifest,
      arrayBuffer: async () => ({
        id: url.replace("/world/audio/", "").replace(".m4a", ""),
      }),
    };
  };
  const timers = fakeTimers();
  const music = new SpeakerMusic({
    createContext: () => {
      contexts++;
      return context as unknown as AudioContext;
    },
    fetch: fetch as unknown as typeof globalThis.fetch,
    timers,
  });
  return {
    music,
    context,
    requests,
    holds,
    statusFor,
    timers,
    contexts: () => contexts,
    tracks: () => requests.filter((r) => r.url.endsWith(".m4a")),
  };
}

/** The last source started and its position at `time`. */
const last = (context: FakeContext) => context.sources.at(-1);

describe("music manifest (T2)", () => {
  it("accepts the real generated manifest as published", () => {
    const tracks = parseManifest(REAL);
    assert.deepEqual(
      tracks.map((t) => t.id),
      [...TRACK_IDS],
    );
    for (const t of tracks) {
      assert.equal(t.file, `/world/audio/${t.id}.m4a`);
      assert.ok(t.loopStart >= 0 && t.loopStart < t.loopEnd);
      assert.ok(t.loopEnd <= t.duration);
      assert.ok(t.duration > 100 && t.duration < 140, "about two minutes");
    }
    assert.equal(MUSIC_MANIFEST, "/world/audio/manifest.json");
  });

  const broken: [string, (t: Record<string, unknown>) => void][] = [
    ["a missing title", (t) => delete t.title],
    ["a non-finite loop", (t) => (t.loopEnd = Number.POSITIVE_INFINITY)],
    ["a loop past the end", (t) => (t.loopEnd = (t.duration as number) + 1)],
    ["a reversed loop", (t) => (t.loopStart = t.loopEnd)],
    ["a remote file", (t) => (t.file = "https://example.com/cafe-drift.m4a")],
    ["another file name", (t) => (t.file = "/world/audio/other.m4a")],
    ["an unknown id", (t) => (t.id = "elevator-music")],
    ["a bad checksum", (t) => (t.sha256 = "xyz")],
  ];
  for (const [name, edit] of broken)
    it(`rejects ${name} with a readable reason`, () => {
      const copy = structuredClone(FIXTURE) as {
        tracks: Record<string, unknown>[];
      };
      edit(copy.tracks[0]);
      assert.throws(
        () => parseManifest(copy),
        (error: Error) => /music list/i.test(error.message),
      );
    });

  it("rejects duplicates, a missing track and a non-object", () => {
    const dup = structuredClone(FIXTURE);
    dup.tracks[1] = dup.tracks[0];
    assert.throws(() => parseManifest(dup));
    assert.throws(() => parseManifest({ tracks: FIXTURE.tracks.slice(1) }));
    assert.throws(() => parseManifest(null));
    assert.throws(() => parseManifest({ tracks: "nope" }));
  });

  it("keeps the declared loop when the decoded length matches, never rescaled", () => {
    const t = FIXTURE.tracks[0];
    assert.deepEqual(loopBounds(t, t.duration), { start: 1, end: 121 });
    // AAC priming or padding moves the length by a few frames only.
    assert.deepEqual(loopBounds(t, t.duration - 0.05), { start: 1, end: 121 });
    assert.deepEqual(loopBounds(t, t.duration + 0.05), { start: 1, end: 121 });
    // Anything else is not the listed file: refused, not played whole.
    for (const decoded of [120.5, 0.5, 0, Number.NaN])
      assert.throws(
        () => loopBounds(t, decoded),
        (error: Error) => /Cafe Drift/.test(error.message),
      );
  });
});

describe("speaker playback (T2)", () => {
  for (const action of ["play", "next"] as const)
    it(`does not restore a disposed track after deferred manifest JSON (${action})`, async () => {
      const body = deferred<unknown>();
      const context = new FakeContext();
      const music = new SpeakerMusic({
        createContext: () => context as unknown as AudioContext,
        fetch: (async () => ({
          ok: true,
          json: () => body.promise,
        })) as unknown as typeof fetch,
      });
      music.unlock();
      const pending = music[action]();
      await flush();
      music.dispose();
      body.resolve(FIXTURE);
      await pending;
      assert.deepEqual(music.getState(), {
        status: "idle",
        playing: false,
        track: null,
        error: null,
      });
      assert.equal(context.sources.length, 0);
    });

  it("does nothing until an explicit action: no context, no request", async () => {
    const h = harness();
    await flush();
    assert.equal(h.contexts(), 0);
    assert.deepEqual(h.requests, []);
    assert.equal(h.music.getState().status, "idle");
  });

  it("unlocking in the gesture resumes the context without fetching or sound", async () => {
    const h = harness();
    h.music.unlock();
    await flush();
    assert.equal(h.contexts(), 1);
    assert.equal(h.context.resumes, 1);
    assert.equal(h.context.state, "running");
    assert.deepEqual(h.requests, []);
    assert.deepEqual(h.context.sources, []);
  });

  it("plays only the current track as a looping buffer from its loop start", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    assert.deepEqual(
      h.requests.map((r) => r.url),
      [MUSIC_MANIFEST, "/world/audio/cafe-drift.m4a"],
    );
    assert.equal(h.context.playing.length, 1);
    const source = h.context.playing[0];
    assert.equal(source.loop, true);
    assert.equal(source.loopStart, 1);
    assert.equal(source.loopEnd, 121);
    assert.equal(source.started?.offset, 1);
    const state = h.music.getState();
    assert.equal(state.status, "playing");
    assert.equal(state.playing, true);
    assert.equal(state.track?.title, "Cafe Drift");
  });

  it("loops the real manifest's declared bounds on its decoded buffers", async () => {
    const h = harness(REAL);
    for (const t of REAL.tracks) h.context.decoded[t.id] = t.duration;
    h.music.unlock();
    await h.music.toggle();
    await flush();
    for (const [i, t] of REAL.tracks.entries()) {
      const source = h.context.playing[0];
      assert.equal(source.buffer?.id, t.id);
      assert.equal(source.loop, true);
      assert.equal(source.loopStart, t.loopStart);
      assert.equal(source.loopEnd, t.loopEnd);
      assert.equal(source.started?.offset, t.loopStart);
      assert.equal(h.music.getState().track?.title, t.title);
      if (i < REAL.tracks.length - 1) {
        await h.music.next();
        await flush();
      }
    }
  });

  it("refuses a decoded file that doesn't match its listed length", async () => {
    const h = harness();
    h.context.decoded["cafe-drift"] = 60;
    h.music.unlock();
    await h.music.toggle();
    await flush();
    assert.equal(h.music.getState().status, "error");
    assert.match(h.music.getState().error ?? "", /Cafe Drift.*60\.00 s/);
    assert.equal(h.context.sources.length, 0);
  });

  it("a speaker click unlocks at once but plays only after the click delay; a double never plays", async () => {
    const h = harness();
    const timers = fakeTimers();
    let focused = 0;
    const clicks = clickArbiter(
      {
        single: () => {
          h.music.toggle();
        },
        double: () => {
          focused++;
        },
      },
      timers,
    );
    // As SpeakerZone does: unlock inside the gesture, then arbitrate.
    h.music.unlock();
    clicks.click();
    h.music.unlock();
    clicks.click();
    clicks.dblclick();
    timers.runAll();
    await flush();
    assert.equal(focused, 1);
    assert.equal(h.context.state, "running");
    assert.deepEqual(h.requests, [], "a double click fetches nothing");
    assert.equal(h.context.sources.length, 0);
    timers.runAll();
    h.music.unlock();
    clicks.click();
    await flush();
    assert.deepEqual(h.requests, [], "nothing before the delay");
    timers.runAll();
    await flush();
    assert.equal(h.context.playing.length, 1);
    assert.ok(CLICK_DELAY >= 250);
  });

  it("pauses at the exact offset and resumes from it, wrapping inside the loop", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    h.context.currentTime = 10;
    await h.music.toggle();
    assert.equal(h.context.playing.length, 0, "the source stops");
    assert.equal(h.music.getState().status, "paused");
    h.context.currentTime = 50;
    await h.music.toggle();
    await flush();
    assert.equal(last(h.context)?.started?.offset, 11);
    // 125 s later: past the 120 s loop once.
    h.context.currentTime = 175;
    await h.music.toggle();
    await h.music.toggle();
    await flush();
    assert.ok(Math.abs((last(h.context)?.started?.offset ?? 0) - 16) < 1e-9);
    assert.equal(h.tracks().length, 1, "the decoded buffer is reused");
  });

  it("next while paused stays paused and fetches nothing until play", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    await h.music.toggle();
    await h.music.next();
    await flush();
    assert.equal(h.context.playing.length, 0);
    assert.equal(h.music.getState().status, "paused");
    assert.equal(h.music.getState().track?.id, "ambient-focus");
    assert.equal(h.tracks().length, 1);
    await h.music.toggle();
    await flush();
    assert.equal(last(h.context)?.buffer?.id, "ambient-focus");
    assert.equal(last(h.context)?.started?.offset, 1);
  });

  it("previous and next wrap around the five tracks", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.previous();
    assert.equal(h.music.getState().track?.id, "midnight-code");
    await h.music.next();
    assert.equal(h.music.getState().track?.id, "cafe-drift");
    assert.equal(h.context.sources.length, 0, "switching never plays");
  });

  it("rapid switches start only the last track and abort the others", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    const hold = deferred<void>();
    for (const id of ["ambient-focus", "velvet-jazz"])
      h.holds.set(`/world/audio/${id}.m4a`, hold);
    const steps = [h.music.next(), h.music.next(), h.music.next()];
    await flush();
    hold.resolve();
    await Promise.all(steps);
    await flush();
    assert.equal(h.context.playing.length, 1);
    assert.equal(h.context.playing[0].buffer?.id, "soft-circuit");
    for (const request of h.tracks().slice(1, 3))
      assert.equal(request.signal?.aborted, true);
    const started = h.context.sources.filter((s) => s.started);
    assert.deepEqual(
      started.map((s) => s.buffer?.id),
      ["cafe-drift", "soft-circuit"],
    );
  });

  it("a pause during decoding never lets the late buffer start", async () => {
    const h = harness();
    h.context.holdDecode = deferred<void>();
    h.music.unlock();
    const play = h.music.toggle();
    await flush();
    await h.music.toggle();
    h.context.holdDecode.resolve();
    await play;
    await flush();
    assert.equal(h.context.playing.length, 0);
    assert.equal(h.music.getState().status, "paused");
  });

  it("dispose stops, aborts and closes, and a late load stays silent", async () => {
    const h = harness();
    const hold = deferred<void>();
    h.holds.set("/world/audio/cafe-drift.m4a", hold);
    h.music.unlock();
    const play = h.music.toggle();
    await flush();
    h.music.dispose();
    hold.resolve();
    await play;
    await flush();
    assert.equal(h.context.sources.length, 0);
    assert.equal(h.context.state, "closed");
    assert.equal(h.tracks()[0].signal?.aborted, true);
    assert.equal(h.music.getState().status, "idle");
  });

  it("keeps at most two decoded buffers", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    for (let i = 0; i < 4; i++) {
      await h.music.next();
      await flush();
    }
    assert.equal(h.tracks().length, 5);
    // Back to the previous one: still cached. One more: evicted, decoded again.
    await h.music.previous();
    await flush();
    assert.equal(h.tracks().length, 5);
    assert.equal(last(h.context)?.buffer?.id, "soft-circuit");
    await h.music.previous();
    await flush();
    assert.equal(h.tracks().length, 6);
    assert.equal(h.tracks()[5].url, "/world/audio/velvet-jazz.m4a");
  });

  it("explains a track the browser cannot decode, without unhandled errors", async () => {
    const h = harness();
    h.context.failDecode.add("cafe-drift");
    h.music.unlock();
    await h.music.toggle();
    await flush();
    const state = h.music.getState();
    assert.equal(state.status, "error");
    assert.equal(state.playing, false);
    assert.match(state.error ?? "", /can.t decode .Cafe Drift./);
    assert.equal(h.context.sources.length, 0);
  });

  it("explains a missing music list", async () => {
    const h = harness();
    h.statusFor[MUSIC_MANIFEST] = 404;
    h.music.unlock();
    await h.music.toggle();
    await flush();
    assert.match(h.music.getState().error ?? "", /music list/i);
    // A later try fetches again.
    h.statusFor[MUSIC_MANIFEST] = 200;
    await h.music.toggle();
    await flush();
    assert.equal(h.music.getState().status, "playing");
  });

  it("explains a browser without Web Audio", async () => {
    const music = new SpeakerMusic({
      createContext: () => null,
      fetch: (() => {
        throw new Error("no request expected");
      }) as unknown as typeof fetch,
      timers: fakeTimers(),
    });
    music.unlock();
    await music.toggle();
    assert.equal(music.getState().status, "error");
    assert.match(music.getState().error ?? "", /Web Audio/);
  });

  it("reports playback blocked by the autoplay policy", async () => {
    const h = harness();
    h.context.allowResume = false;
    h.music.unlock();
    const play = h.music.toggle();
    await flush();
    h.timers.runAll();
    await play;
    await flush();
    assert.equal(h.music.getState().status, "error");
    assert.match(h.music.getState().error ?? "", /blocked/);
    assert.equal(h.context.sources.length, 0);
  });
});

describe("speaker space (T2)", () => {
  const place = (music: SpeakerMusic, at: Vec3) =>
    music.setListener(at, [-1, 0, 0], [0, 1, 0]);
  const [x, y, z] = SPEAKER_PAIR.center;

  it("pans from the pair's middle and fades only by distance", async () => {
    const h = harness();
    place(h.music, [x + 1, y, z]);
    h.music.unlock();
    await h.music.toggle();
    await flush();
    const panner = h.context.panners[0];
    assert.equal(h.context.panners.length, 1, "one source for the pair");
    assert.equal(panner.rolloffFactor, 0, "no second attenuation");
    assert.deepEqual(
      [panner.positionX.value, panner.positionY.value, panner.positionZ.value],
      [x, y, z],
    );
    assert.equal(h.context.listener.positionX.value, x + 1);
    assert.equal(h.context.listener.forwardX.value, -1);
    assert.equal(h.context.listener.upY.value, 1);
    // The distance level is the gain feeding the panner.
    const bus = h.context.gains.find((g) => g.outputs.includes(panner));
    const level = () => bus?.gain.target;
    assert.equal(level(), 1, "near: full");
    place(h.music, [x + 3.75, y, z]);
    assert.ok(level() > 0.45 && level() < 0.55, "mid: about half");
    place(h.music, [x + 8, y, z]);
    assert.equal(level(), 0, "far: silent");
    // The source keeps playing silently: walking back brings it in.
    assert.equal(h.context.playing.length, 1);
    place(h.music, [x + 1.2, y, z]);
    assert.equal(level(), 1);
  });

  it("a hidden tab stops the source but keeps the wish to play", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    h.context.currentTime = 20;
    h.music.setHidden(true);
    assert.equal(h.context.playing.length, 0);
    assert.equal(h.music.getState().playing, true);
    h.context.currentTime = 80;
    h.music.setHidden(false);
    await flush();
    assert.equal(h.context.playing.length, 1);
    assert.equal(last(h.context)?.started?.offset, 21);
  });

  it("back from hidden, a suspended context waits for a new gesture", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    h.music.setHidden(true);
    h.context.state = "suspended";
    h.context.allowResume = false;
    h.music.setHidden(false);
    await flush();
    h.timers.runAll();
    await flush();
    assert.equal(h.context.playing.length, 0);
    assert.equal(h.music.getState().status, "error");
    assert.equal(h.music.getState().playing, false);
  });
});

describe("speaker console settings (T3, S1/S3/S4)", () => {
  const [x, y, z] = SPEAKER_PAIR.center;
  const place = (music: SpeakerMusic, at: Vec3) =>
    music.setListener(at, [-1, 0, 0], [0, 1, 0]);
  /** The node `from` feeds, through every single-output node. */
  const chain = (from: { outputs: unknown[] }) => {
    const nodes: unknown[] = [];
    let node: { outputs: unknown[] } | undefined = from;
    while (node?.outputs.length === 1) {
      node = node.outputs[0] as { outputs: unknown[] };
      nodes.push(node);
    }
    return nodes;
  };
  const playing = async (h: ReturnType<typeof harness>) => {
    h.music.unlock();
    await h.music.toggle();
    await flush();
  };

  it("settings and spectrum reads create no context and fetch nothing", async () => {
    const h = harness();
    h.music.setVolume(0.3);
    h.music.setReach(12);
    place(h.music, [x + 9, y, z]);
    const out = new Uint8Array(8).fill(9);
    assert.equal(h.music.spectrum(out), false);
    assert.ok(out.every((v) => v === 0));
    await flush();
    assert.equal(h.contexts(), 0);
    assert.deepEqual(h.requests, []);
    assert.equal(h.music.getVolume(), 0.3);
  });

  it("analyses after the volume, before the distance and the panner", async () => {
    const h = harness();
    await playing(h);
    assert.equal(h.context.analysers.length, 1, "one analyser");
    const [source] = h.context.sources;
    const [envelope, volume, analyser, level, panner, destination] =
      chain(source);
    assert.ok(envelope instanceof Gain);
    assert.ok(volume instanceof Gain);
    assert.equal(analyser, h.context.analysers[0]);
    assert.ok(level instanceof Gain);
    assert.equal(panner, h.context.panners[0]);
    assert.equal(destination, h.context.destination);
    // Next and previous reuse the same graph.
    await h.music.next();
    await flush();
    assert.equal(h.context.analysers.length, 1);
    assert.equal(h.context.panners.length, 1);
    assert.equal(chain(h.context.sources.at(-1) as Source)[2], analyser);
  });

  it("clamps the volume, ignores non-finite values and smooths changes", async () => {
    const h = harness();
    assert.equal(h.music.getVolume(), 1, "full by default");
    await playing(h);
    const volume = chain(h.context.sources[0])[1] as Gain;
    assert.equal(volume.gain.target, 1);
    h.music.setVolume(0.4);
    assert.equal(volume.gain.target, 0.4);
    h.music.setVolume(3);
    assert.equal(volume.gain.target, 1);
    h.music.setVolume(-1);
    assert.equal(volume.gain.target, 0);
    h.music.setVolume(Number.NaN);
    h.music.setVolume(Number.POSITIVE_INFINITY);
    assert.equal(h.music.getVolume(), 0);
    assert.equal(volume.gain.target, 0);
  });

  it("volume never changes the distance level", async () => {
    const h = harness();
    place(h.music, [x + 3.75, y, z]);
    await playing(h);
    const level = chain(h.context.sources[0])[3] as Gain;
    const before = level.gain.target;
    h.music.setVolume(0.2);
    assert.equal(level.gain.target, before);
  });

  it("a reach change re-levels from the last listener without a new frame", async () => {
    const h = harness();
    place(h.music, [x + 8, y, z]);
    await playing(h);
    const level = chain(h.context.sources[0])[3] as Gain;
    assert.equal(level.gain.target, 0, "legacy: silent at 8 m");
    h.music.setReach(8);
    assert.ok(Math.abs(level.gain.target - 0.5) < 1e-9, "half at the reach");
    h.music.setReach(30);
    assert.ok(level.gain.target > 0.9);
    h.music.setReach(null);
    assert.equal(level.gain.target, 0, "back to the legacy fade");
    h.music.setReach(Number.NaN);
    assert.equal(level.gain.target, 0, "non-finite: the legacy fade");
  });

  it("a reach set before the gesture levels the first start", async () => {
    const h = harness();
    place(h.music, [x + 8, y, z]);
    h.music.setReach(8);
    await playing(h);
    const level = chain(h.context.sources[0])[3] as Gain;
    assert.ok(Math.abs(level.gain.value - 0.5) < 1e-9);
  });

  it("reads the real analyser only while a source sounds", async () => {
    const h = harness();
    await playing(h);
    const analyser = h.context.analysers[0];
    assert.ok(analyser.frequencyBinCount >= 64);
    analyser.bins = new Uint8Array(analyser.frequencyBinCount).fill(120);
    const out = new Uint8Array(analyser.frequencyBinCount);
    assert.equal(h.music.spectrum(out), true);
    assert.ok(out.every((v) => v === 120));
    h.music.pause();
    out.fill(7);
    const reads = analyser.reads;
    assert.equal(h.music.spectrum(out), false, "paused: no levels");
    assert.ok(out.every((v) => v === 0));
    assert.equal(analyser.reads, reads);
  });

  it("muted or hidden: zero levels", async () => {
    const h = harness();
    await playing(h);
    const analyser = h.context.analysers[0];
    analyser.bins = new Uint8Array(analyser.frequencyBinCount).fill(200);
    const out = new Uint8Array(analyser.frequencyBinCount);
    h.music.setVolume(0);
    assert.equal(h.music.spectrum(out), false);
    assert.ok(out.every((v) => v === 0));
    h.music.setVolume(0.5);
    h.music.setHidden(true);
    assert.equal(h.music.spectrum(out), false);
    assert.ok(out.every((v) => v === 0));
  });

  it("keeps the settings across dispose; a new start uses them", async () => {
    const h = harness();
    h.music.setVolume(0.25);
    await playing(h);
    h.music.dispose();
    assert.equal(h.music.getVolume(), 0.25);
    const out = new Uint8Array(4).fill(1);
    assert.equal(h.music.spectrum(out), false);
    assert.ok(out.every((v) => v === 0));
    h.context.state = "suspended";
    await playing(h);
    const volume = chain(h.context.sources.at(-1) as Source)[1] as Gain;
    assert.equal(volume.gain.value, 0.25);
  });
});

describe("gentle entry (world-persistent-settings T2, S2)", () => {
  /** The envelope gain right after a source: the fade in and out. */
  const envelope = (source: Source | undefined) => {
    const gain = source?.outputs[0];
    assert.ok(gain instanceof Gain, "each source has its own envelope");
    return gain.gain;
  };
  /** setTargetAtTime reaches about 98 % after four time constants. */
  const span = (param: Param) => (param.constant ?? 0) * 4;

  it("fades a first start in from silence over two seconds", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    const gain = envelope(h.context.playing[0]);
    assert.equal(gain.value, 0, "it starts silent, never at full gain");
    assert.equal(gain.target, 1);
    assert.ok(Math.abs(span(gain) - 2) < 1e-9, `${span(gain)} s, not 2 s`);
  });

  it("a stop keeps its short fade: no two-second overlap between tracks", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    const first = h.context.playing[0];
    h.context.currentTime = 10;
    await h.music.next();
    await flush();
    assert.ok(
      Math.abs((first.stopped ?? 0) - 10.12) < 1e-9,
      "the old source ends 0.12 s later",
    );
    assert.ok(Math.abs(span(envelope(first)) - 0.12) < 1e-9);
    assert.equal(envelope(first).target, 0);
    const second = h.context.playing[0];
    assert.equal(second.buffer?.id, "ambient-focus");
    assert.equal(envelope(second).value, 0);
    assert.ok(Math.abs(span(envelope(second)) - 2) < 1e-9);
    h.context.currentTime = 20;
    h.music.pause();
    assert.ok(Math.abs((second.stopped ?? 0) - 20.12) < 1e-9);
  });

  it("coming back to the tab fades in again from silence", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    h.context.currentTime = 5;
    h.music.setHidden(true);
    h.context.currentTime = 60;
    h.music.setHidden(false);
    await flush();
    const back = h.context.playing;
    assert.equal(back.length, 1, "one source after re-entry");
    assert.equal(envelope(back[0]).value, 0);
    assert.ok(Math.abs(span(envelope(back[0])) - 2) < 1e-9);
  });

  it("dispose still cuts at once", async () => {
    const h = harness();
    h.music.unlock();
    await h.music.toggle();
    await flush();
    const source = h.context.playing[0];
    h.context.currentTime = 3;
    h.music.dispose();
    assert.equal(source.stopped, 3);
  });
});

describe("transport intent (world-persistent-settings T2, S2)", () => {
  it("getWanted reads the visitor's wish without changing anything", async () => {
    const h = harness();
    let notified = 0;
    h.music.subscribe(() => notified++);
    assert.equal(h.music.getWanted(), false);
    assert.equal(notified, 0, "reading notifies nobody");
    assert.equal(h.contexts(), 0, "reading creates no context");
    h.music.unlock();
    const play = h.music.play();
    assert.equal(h.music.getWanted(), true, "wanted while loading");
    await play;
    await flush();
    assert.equal(h.music.getWanted(), true);
    h.music.setHidden(true);
    assert.equal(h.music.getWanted(), true, "a hidden tab keeps the wish");
    h.music.setHidden(false);
    await flush();
    const state = h.music.getState();
    const before = notified;
    h.music.getWanted();
    assert.equal(h.music.getState(), state);
    assert.equal(notified, before);
    h.music.pause();
    assert.equal(h.music.getWanted(), false);
    await h.music.toggle();
    await flush();
    assert.equal(h.music.getWanted(), true);
    h.music.dispose();
    assert.equal(h.music.getWanted(), false);
  });

  it("a blocked start reads as not wanted, with the blocked message", async () => {
    const h = harness();
    h.context.allowResume = false;
    const play = h.music.play();
    await flush();
    h.timers.runAll();
    await play;
    assert.equal(h.music.getWanted(), false);
    assert.equal(h.music.getState().status, "error");
    assert.equal(h.music.getState().error, MUSIC_BLOCKED);
  });
});
