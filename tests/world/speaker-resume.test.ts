// Music resume on entry (world-persistent-settings T2, S2): one startup
// attempt once the world is ready, then a trusted pointer or key gesture
// if the browser's autoplay policy blocked it. Runs the real SpeakerMusic
// on a fake AudioContext and fetch (the speaker-music.test.ts fixture,
// trimmed), and gestures on a plain EventTarget. Node can't make a
// trusted event, so tests mark their own gestures through the `trusted`
// port; one test proves the default refuses synthetic ones.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { CLICK_DELAY, clickArbiter } from "../../src/lib/world/speaker.ts";
import {
  MUSIC_BLOCKED,
  MUSIC_MANIFEST,
  SpeakerMusic,
  TRACK_IDS,
  type Track,
} from "../../src/lib/world/speaker-music.ts";
import { bindMusicResume } from "../../src/lib/world/speaker-resume.ts";

const track = (id: string, duration: number): Track => ({
  id,
  title: id,
  genre: "lo-fi",
  file: `/world/audio/${id}.m4a`,
  duration,
  loopStart: 1,
  loopEnd: duration - 1,
  bytes: 1000,
  sha256: "a".repeat(64),
});
const FIXTURE = { tracks: TRACK_IDS.map((id) => track(id, 120)) };

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
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
    return this;
  }
  setTargetAtTime() {
    return this;
  }
}

class Node {
  connect<T>(node: T) {
    return node;
  }
  disconnect() {
    // Nothing is routed in this fake.
  }
}

class Gain extends Node {
  gain = new Param(1);
}

class Source extends Node {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start() {
    assert.equal(this.started, false, "a source starts once");
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}

class FakeContext {
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  /** False: the browser's autoplay policy keeps it suspended. */
  allowResume = true;
  resumes = 0;
  sources: Source[] = [];
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
    return new Gain();
  }
  createPanner() {
    return Object.assign(new Node(), {
      positionX: new Param(0),
      positionY: new Param(0),
      positionZ: new Param(0),
    });
  }
  createAnalyser() {
    return Object.assign(new Node(), {
      getByteFrequencyData() {
        // No spectrum is read here.
      },
    });
  }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  async decodeAudioData() {
    return { duration: 120 };
  }
  get playing() {
    return this.sources.filter((s) => s.started && !s.stopped);
  }
}

/** Timers run by due time, as a clock advances. */
function clock() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    set(run: () => void, ms: number) {
      const id = next++;
      pending.set(id, { at: now + ms, run });
      return id;
    },
    clear(id: unknown) {
      pending.delete(id as number);
    },
    get size() {
      return pending.size;
    },
    advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...pending]
          .filter(([, t]) => t.at <= until)
          .sort(([a, x], [b, y]) => x.at - y.at || a - b)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = until;
    },
  };
}

function harness({ autoplay = true, manifestStatus = 200 } = {}) {
  const context = new FakeContext();
  context.allowResume = autoplay;
  const requests: string[] = [];
  let hold: Promise<void> | null = null;
  const fetch = async (url: string) => {
    requests.push(url);
    if (hold) await hold;
    const status = url === MUSIC_MANIFEST ? manifestStatus : 200;
    return {
      ok: status === 200,
      status,
      json: async () => FIXTURE,
      arrayBuffer: async () => ({}),
    };
  };
  /** The music's own timers: its bounded resume wait. */
  const musicTimers = clock();
  const music = new SpeakerMusic({
    createContext: () => context as unknown as AudioContext,
    fetch: fetch as unknown as typeof globalThis.fetch,
    timers: musicTimers,
  });
  /** The helper's timers: its one pending decision. */
  const timers = clock();
  const target = new EventTarget();
  const trustedEvents = new WeakSet<Event>();
  /** A gesture the test treats as the visitor's own. */
  const gesture = (type: string) => {
    const event = new Event(type, { cancelable: true });
    trustedEvents.add(event);
    target.dispatchEvent(event);
    return event;
  };
  const bind = () =>
    bindMusicResume(music, target, {
      trusted: (event) => trustedEvents.has(event),
      timers,
    });
  /** Lets the music's bounded resume wait run out, as a blocked browser does. */
  const settle = async () => {
    await flush();
    musicTimers.advance(1000);
    await flush();
  };
  return {
    music,
    context,
    requests,
    timers,
    target,
    gesture,
    bind,
    settle,
    holdFetch(promise: Promise<void> | null) {
      hold = promise;
    },
  };
}

/** After the speaker click arbiter's delay and the helper's decision. */
const DECIDE = CLICK_DELAY + 500;

/** The browser now lets the context run: the visitor has interacted. */
const allow = (h: ReturnType<typeof harness>) => {
  h.context.allowResume = true;
};

describe("startup attempt", () => {
  it("plays once at bind when the browser allows autoplay", async () => {
    const h = harness();
    const cleanup = h.bind();
    await h.settle();
    assert.equal(h.music.getState().status, "playing");
    assert.equal(h.music.getWanted(), true);
    assert.equal(h.context.playing.length, 1);
    assert.equal(h.requests.filter((r) => r === MUSIC_MANIFEST).length, 1);
    // A later gesture starts nothing more.
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.sources.length, 1, "no second source");
    assert.equal(h.timers.size, 0);
    cleanup();
  });

  it("a blocked start schedules nothing: no retry timer or loop", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    assert.equal(h.music.getState().error, MUSIC_BLOCKED);
    assert.equal(h.music.getWanted(), false);
    assert.equal(h.timers.size, 0, "no timer of its own");
    const resumes = h.context.resumes;
    h.timers.advance(60_000);
    await h.settle();
    assert.equal(h.context.resumes, resumes, "never asks again by itself");
    assert.equal(h.context.sources.length, 0);
  });

  it("joins a start already loading instead of restarting it", async () => {
    const h = harness();
    let release!: () => void;
    h.holdFetch(new Promise<void>((r) => (release = r)));
    h.music.unlock();
    const play = h.music.play();
    await flush();
    const loading = h.music.getState().status;
    h.bind();
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    release();
    await play;
    await h.settle();
    assert.equal(loading, "loading");
    assert.equal(h.requests.filter((r) => r === MUSIC_MANIFEST).length, 1);
    assert.equal(h.context.playing.length, 1);
    assert.equal(h.context.sources.length, 1, "the load was not cancelled");
  });

  it("keeps an explicit pause made before binding", async () => {
    const h = harness();
    h.music.pause();
    h.bind();
    await h.settle();
    assert.equal(h.music.getState().status, "paused");
    assert.equal(h.context.sources.length, 0);
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.sources.length, 0);
  });

  it("a hidden tab at bind waits for the tab to show", async () => {
    const h = harness();
    h.music.setHidden(true);
    h.bind();
    await h.settle();
    assert.equal(h.context.sources.length, 0, "nothing while hidden");
    assert.equal(h.music.getWanted(), true);
    h.music.setHidden(false);
    await h.settle();
    assert.equal(h.context.playing.length, 1);
  });
});

describe("gesture fallback", () => {
  it("a trusted pointer gesture unlocks at once and then plays once", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    const resumes = h.context.resumes;
    const down = h.gesture("pointerdown");
    assert.equal(h.context.resumes, resumes + 1, "resumed inside the gesture");
    assert.equal(h.context.state, "running");
    const click = h.gesture("click");
    assert.equal(h.context.sources.length, 0, "no start inside the event");
    assert.equal(down.defaultPrevented || click.defaultPrevented, false);
    h.gesture("click");
    assert.equal(h.timers.size, 1, "one pending decision for many clicks");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.music.getState().status, "playing");
    assert.equal(h.context.playing.length, 1);
    assert.equal(h.context.sources.length, 1);
  });

  it("a trusted key gesture plays too", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    h.gesture("keydown");
    h.gesture("keyup");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.playing.length, 1);
  });

  it("by default refuses synthetic events: isTrusted is false in scripts", async () => {
    const h = harness({ autoplay: false });
    bindMusicResume(h.music, h.target, { timers: h.timers });
    await h.settle();
    allow(h);
    const resumes = h.context.resumes;
    for (const type of ["pointerdown", "keydown", "click", "keyup"])
      h.target.dispatchEvent(new Event(type));
    assert.equal(h.context.resumes, resumes, "no unlock");
    assert.equal(h.timers.size, 0, "no decision");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.sources.length, 0);
  });

  it("never steals the event from other listeners", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    const seen: string[] = [];
    for (const type of ["pointerdown", "keydown", "click", "keyup"])
      h.target.addEventListener(type, (event) => {
        if (!event.defaultPrevented) seen.push(type);
      });
    for (const type of ["pointerdown", "keydown", "click", "keyup"])
      h.gesture(type);
    assert.deepEqual(seen, ["pointerdown", "keydown", "click", "keyup"]);
  });

  it("re-entry blocked after playing resumes on the next gesture", async () => {
    const h = harness();
    h.bind();
    await h.settle();
    h.music.setHidden(true);
    h.context.state = "suspended";
    h.context.allowResume = false;
    h.music.setHidden(false);
    await h.settle();
    assert.equal(h.music.getState().error, MUSIC_BLOCKED);
    allow(h);
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.playing.length, 1);
  });

  it("does not retry a list or decode error, only a blocked start", async () => {
    const h = harness({ manifestStatus: 404 });
    h.bind();
    await h.settle();
    assert.match(h.music.getState().error ?? "", /music list/);
    const requests = h.requests.length;
    h.gesture("pointerdown");
    h.gesture("click");
    assert.equal(h.timers.size, 0);
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.requests.length, requests, "nothing fetched again");
  });
});

describe("same gesture as a transport control", () => {
  it("Play music in the blocked state plays once, not paused back", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    // As WorldApp's Play music button does inside its click.
    h.target.addEventListener("click", () => {
      h.music.unlock();
      h.music.toggle();
    });
    h.gesture("pointerdown");
    h.gesture("click");
    // The button's own start has loaded and plays before the decision.
    await h.settle();
    assert.equal(h.context.playing.length, 1);
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.music.getWanted(), true);
    assert.equal(h.music.getState().status, "playing");
    assert.equal(h.context.sources.length, 1, "one source, no duplicate");
  });

  it("Space in the console plays once, not toggled twice", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    h.target.addEventListener("keydown", () => {
      h.music.unlock();
      h.music.toggle();
    });
    h.gesture("keydown");
    await h.settle();
    h.gesture("keyup");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.music.getState().status, "playing");
    assert.equal(h.context.sources.length, 1, "one source, no duplicate");
  });

  it("a speaker click toggles after the arbiter's delay and is not inverted", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    // As SpeakerZone does: unlock in the click, toggle after CLICK_DELAY.
    const arbiter = clickArbiter(
      {
        single: () => h.music.toggle(),
        double: () => {
          // Focusing the speakers plays nothing.
        },
      },
      h.timers,
    );
    h.target.addEventListener("click", () => {
      h.music.unlock();
      arbiter.click();
    });
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.music.getWanted(), true);
    assert.equal(h.music.getState().status, "playing");
    assert.equal(h.context.sources.length, 1);
  });

  it("an explicit pause before the decision is never overridden", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    h.gesture("pointerdown");
    h.gesture("click");
    h.music.pause();
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.music.getState().status, "paused");
    assert.equal(h.music.getWanted(), false);
    assert.equal(h.context.sources.length, 0);
    // Nor by later gestures.
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.sources.length, 0);
  });

  it("pausing after the fallback started is kept by later gestures", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.playing.length, 1);
    h.music.pause();
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.playing.length, 0);
    assert.equal(h.music.getState().status, "paused");
  });
});

describe("cleanup", () => {
  it("cancels the pending decision and removes every listener", async () => {
    const h = harness({ autoplay: false });
    const cleanup = h.bind();
    await h.settle();
    allow(h);
    h.gesture("click");
    assert.equal(h.timers.size, 1);
    cleanup();
    assert.equal(h.timers.size, 0, "the decision is cancelled");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.sources.length, 0);
    const resumes = h.context.resumes;
    h.gesture("pointerdown");
    h.gesture("click");
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.context.resumes, resumes, "no listener left");
    assert.equal(h.context.sources.length, 0);
    assert.equal(h.music.getState().error, MUSIC_BLOCKED, "player kept");
    cleanup();
  });

  it("dispose before the decision keeps the player idle", async () => {
    const h = harness({ autoplay: false });
    h.bind();
    await h.settle();
    allow(h);
    h.gesture("click");
    h.music.dispose();
    h.timers.advance(DECIDE);
    await h.settle();
    assert.equal(h.music.getState().status, "idle");
    assert.equal(h.context.sources.length, 0);
  });
});
