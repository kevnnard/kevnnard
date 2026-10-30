// World ambient sound: the pure hour schedule, the owl's nightly plan,
// outdoor placement and the rooster's once-per-morning flag, then the Web
// Audio player on a fake AudioContext and fetch.
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  AMBIENT_EVENTS,
  AMBIENT_IDS,
  AmbientSound,
  ambientAllowed,
  BED_FADE,
  BURST_FADE,
  DISABLE_FADE,
  OUTDOOR_MARGIN,
  OWL_IDLE,
  type OwlState,
  outdoorLevel,
  owlStep,
  placeOneShot,
  ROOSTER_IDLE,
  type RoosterState,
  roosterStep,
  SHELTER,
} from "../../src/lib/world/ambient-sound.ts";

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

/** A random function that cycles through fixed values. */
const sequence =
  (...values: number[]) =>
  () => {
    const value = values.shift() ?? 0.5;
    values.push(value);
    return value;
  };

/** Fixed values for the first draws, then 0.5 for everything after. */
const planned =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0.5;

const at = (h: number, m = 0) => h + m / 60;

/** The owl's fire flags across hours, one state carried through. */
const owlRun = (hours: number[], random: () => number) => {
  let state: OwlState = OWL_IDLE;
  return hours.map((h) => {
    const step = owlStep(state, h, random);
    state = step.state;
    return step.fire;
  });
};

/** The rooster's fire flags across hours, one state carried through. */
const roosterRun = (hours: number[], random: () => number = () => 0.5) => {
  let state: RoosterState = ROOSTER_IDLE;
  return hours.map((h) => {
    const step = roosterStep(state, h, random);
    state = step.state;
    return step.fire;
  });
};

/** Every quarter hour from `from` to `to`, wrapped into [0, 24). */
const quarters = (from: number, to: number) => {
  const out: number[] = [];
  for (let h = from; h <= to; h += 0.25) out.push(h % 24);
  return out;
};

describe("ambient schedule by world hour", () => {
  it("crickets run from 19:00 until 04:00", () => {
    assert.equal(ambientAllowed(at(18, 59)).crickets, false);
    assert.equal(ambientAllowed(19).crickets, true);
    assert.equal(ambientAllowed(at(3, 59)).crickets, true);
    assert.equal(ambientAllowed(4).crickets, false);
  });

  it("the owl is allowed from 20:00 until 05:00", () => {
    assert.equal(ambientAllowed(at(19, 59)).owl, false);
    assert.equal(ambientAllowed(20).owl, true);
    assert.equal(ambientAllowed(at(4, 59)).owl, true);
    assert.equal(ambientAllowed(5).owl, false);
  });

  it("the rooster window is 06:00 to 07:00", () => {
    assert.equal(ambientAllowed(at(5, 59)).rooster, false);
    assert.equal(ambientAllowed(6).rooster, true);
    assert.equal(ambientAllowed(at(6, 59)).rooster, true);
    assert.equal(ambientAllowed(7).rooster, false);
  });

  it("birds are allowed from 08:00 until 15:00", () => {
    assert.equal(ambientAllowed(at(7, 59)).birds, false);
    assert.equal(ambientAllowed(8).birds, true);
    assert.equal(ambientAllowed(at(14, 59)).birds, true);
    assert.equal(ambientAllowed(15).birds, false);
  });

  it("the afternoon is quiet, and bad hours allow nothing", () => {
    for (const id of AMBIENT_IDS) assert.equal(ambientAllowed(16)[id], false);
    for (const id of AMBIENT_IDS) assert.equal(ambientAllowed(NaN)[id], false);
  });

  it("wraps hours outside [0, 24)", () => {
    assert.deepEqual(ambientAllowed(25), ambientAllowed(1));
    assert.deepEqual(ambientAllowed(-1), ambientAllowed(23));
  });

  it("uses the requested gains and files", () => {
    assert.equal(AMBIENT_EVENTS.owl.gain, 0.5);
    assert.equal(AMBIENT_EVENTS.crickets.gain, 0.005);
    assert.equal(AMBIENT_EVENTS.rooster.gain, 0.5);
    assert.equal(AMBIENT_EVENTS.birds.gain, 0.03);
    assert.equal(
      AMBIENT_EVENTS.crickets.file,
      "/world/audio/ambient/crickets-night.mp3",
    );
    assert.equal(BED_FADE, 4);
    assert.equal(BURST_FADE, 2);
    assert.equal(DISABLE_FADE, 0.5);
  });

  it("beds play in short bursts with long rests", () => {
    assert.deepEqual(AMBIENT_EVENTS.crickets.burst, [8, 12]);
    assert.deepEqual(AMBIENT_EVENTS.crickets.rest, [240, 480]);
    assert.deepEqual(AMBIENT_EVENTS.birds.burst, [8, 15]);
    assert.deepEqual(AMBIENT_EVENTS.birds.rest, [180, 360]);
  });
});

describe("owl hoots three times a night", () => {
  it("plays exactly three hoots through one night", () => {
    const fires = owlRun(quarters(20, 29), sequence(0.1, 0.5, 0.9));
    assert.equal(fires.filter(Boolean).length, 3);
  });

  it("plans a new three each night", () => {
    const hours = [...quarters(20, 29), ...quarters(20, 29)];
    const fires = owlRun(hours, sequence(0.1, 0.5, 0.9));
    assert.equal(fires.filter(Boolean).length, 6);
  });

  it("never hoots outside its window", () => {
    const fires = owlRun(quarters(6, 19.75), sequence(0.1, 0.5, 0.9));
    assert.equal(fires.some(Boolean), false);
  });
});

describe("outdoor placement", () => {
  it("pans within -0.9..0.9 and scales the gain by 0.8..1.0", () => {
    assert.deepEqual(
      placeOneShot("owl", () => 0),
      {
        pan: -0.9,
        gain: 0.5 * 0.8,
      },
    );
    const high = placeOneShot("rooster", () => 1);
    assert.equal(high.pan, 0.9);
    assert.ok(Math.abs(high.gain - 0.5) < 1e-9);
    for (let i = 0; i <= 20; i++) {
      const r = i / 20;
      const { pan, gain } = placeOneShot("owl", () => r);
      assert.ok(pan >= -0.9 && pan <= 0.9, `pan ${pan}`);
      assert.ok(gain >= 0.5 * 0.8 - 1e-9 && gain <= 0.5 + 1e-9, `gain ${gain}`);
    }
  });

  it("clamps a random function that strays outside [0, 1]", () => {
    const { pan, gain } = placeOneShot("owl", () => 7);
    assert.equal(pan, 0.9);
    assert.ok(gain <= 0.5 + 1e-9);
  });
});

describe("rooster once per morning", () => {
  it("fires at its random moment between 06:00 and 07:00", () => {
    assert.deepEqual(roosterRun([6, 6.25, 6.5, 6.75]), [
      false,
      false,
      true,
      false,
    ]);
  });

  it("never fires twice in the same morning", () => {
    assert.deepEqual(roosterRun([6.5, 6.6, 6.9, 6.7]), [
      true,
      false,
      false,
      false,
    ]);
  });

  it("never fires outside its window", () => {
    assert.deepEqual(roosterRun([5, 5.99, 7, 8]), [false, false, false, false]);
  });

  it("a wrap past midnight starts a new day", () => {
    assert.deepEqual(roosterRun([6.6, 23, 6.6]), [true, false, true]);
  });
});

describe("outdoor level", () => {
  const house = { id: "main", x0: 0, x1: 10, z0: 0, z1: 6 };

  it("is 0 inside the house walls", () => {
    assert.equal(outdoorLevel(5, 3, [house]), 0);
  });

  it("ramps back to 1 across OUTDOOR_MARGIN metres outside", () => {
    assert.ok(
      Math.abs(outdoorLevel(10 + OUTDOOR_MARGIN / 2, 3, [house]) - 0.5) < 1e-9,
    );
    assert.equal(outdoorLevel(10 + OUTDOOR_MARGIN, 3, [house]), 1);
    assert.equal(outdoorLevel(-50, -50, [house]), 1);
  });

  it("shelters only the house and garage, never the porch or drive", () => {
    assert.deepEqual(SHELTER.map((r) => r.id).sort(), ["garage", "main"]);
    const main = SHELTER.find((r) => r.id === "main");
    assert.ok(main);
    assert.equal(
      outdoorLevel((main.x0 + main.x1) / 2, (main.z0 + main.z1) / 2),
      0,
    );
  });

  it("treats a non-finite position as outdoors", () => {
    assert.equal(outdoorLevel(Number.NaN, 3, [house]), 1);
  });
});

describe("AmbientSound player", () => {
  // Fake Web Audio, fetch and timers are shared with the schedule tests above.
  it("unlock creates and resumes the context synchronously, once", () => {
    const { player, context, created, requests } = setup();
    player.unlock();
    assert.equal(created(), 1);
    assert.equal(context.resumes, 1);
    player.unlock();
    assert.equal(created(), 1);
    assert.deepEqual(requests, [], "unlock fetches nothing");
  });

  it("schedules nothing before unlock", async () => {
    const { player, requests } = setup();
    player.setHours(21);
    await flush();
    assert.deepEqual(requests, []);
  });

  it("at 19:00 a crickets burst fades in over 2 s at gain 0.005", async () => {
    const { player, context, requests, timers } = setup({
      random: planned(0),
    });
    player.unlock();
    player.setHours(19);
    await flush();
    assert.ok(requests.includes("/world/audio/ambient/crickets-night.mp3"));
    const [burst] = started(context, "crickets-night");
    assert.ok(burst, "the burst started");
    assert.equal(burst.loop, true, "the buffer loops within the burst");
    const envelope = burst.outputs[0] as Gain;
    assert.equal(envelope.gain.events[0][1], 0, "starts silent");
    assert.deepEqual(envelope.gain.lastRamp(), ["ramp", 0.005, 12]);
    assert.deepEqual(timers.delays, [8000], "burst of 8 s at random 0");
    player.setHours(at(19, 30));
    await flush();
    assert.equal(started(context, "crickets-night").length, 1, "one burst");
  });

  it("a burst ends with a 2 s fade out at its end", async () => {
    const { player, context, timers } = setup({ random: planned(0) });
    player.unlock();
    player.setHours(19);
    await flush();
    const [burst] = started(context, "crickets-night");
    const envelope = burst.outputs[0] as Gain;
    timers.advance(7999);
    assert.equal(burst.stopped, null, "still playing before the burst end");
    context.currentTime = 18;
    timers.advance(1);
    assert.deepEqual(envelope.gain.lastRamp(), ["ramp", 0, 20]);
    assert.equal(burst.stopped, 20);
  });

  it("crickets burst, rest in silence, then burst again", async () => {
    const { player, context, timers } = setup({ random: planned(0, 0) });
    player.unlock();
    player.setHours(19);
    await flush();
    timers.advance(8000);
    assert.deepEqual(
      timers.delays,
      [8000, 242000],
      "2 s fade, then 240 s rest",
    );
    timers.advance(241999);
    player.setHours(at(19, 45));
    await flush();
    assert.equal(started(context, "crickets-night").length, 1, "silent rest");
    timers.advance(1);
    await flush();
    assert.equal(started(context, "crickets-night").length, 2, "next burst");
  });

  it("burst and rest lengths follow the random draws within their ranges", async () => {
    const delays = async (random: () => number) => {
      const { player, timers } = setup({ random });
      player.unlock();
      player.setHours(19);
      await flush();
      timers.advance(timers.delays[0]);
      return timers.delays;
    };
    assert.deepEqual(await delays(planned(1, 1)), [12000, 482000]);
    assert.deepEqual(await delays(planned(0.5, 0.5)), [10000, 362000]);
    assert.deepEqual(await delays(planned(-3, 9)), [8000, 482000], "clamped");
  });

  it("birds burst only from 08:00 to 15:00 at gain 0.03, silent in their rest", async () => {
    const { player, context, timers } = setup({ random: planned(0, 0) });
    player.unlock();
    player.setHours(at(7, 59));
    await flush();
    assert.equal(started(context, "birds-chirp").length, 0, "not before 08:00");
    player.setHours(8);
    await flush();
    const [bird] = started(context, "birds-chirp");
    assert.ok(bird, "the birds started");
    const envelope = bird.outputs[0] as Gain;
    assert.deepEqual(envelope.gain.lastRamp(), ["ramp", 0.03, 12]);
    timers.advance(8000);
    assert.deepEqual(
      timers.delays,
      [8000, 182000],
      "2 s fade, then 180 s rest",
    );
    for (const h of [9, 10, 12]) player.setHours(h);
    await flush();
    assert.equal(started(context, "birds-chirp").length, 1, "silent rest");
    player.setHours(15);
    timers.advance(62000);
    await flush();
    assert.equal(started(context, "birds-chirp").length, 1, "none after 15:00");
  });

  it("leaving the window fades the burst out over 4 s and cancels its timer", async () => {
    const { player, context, timers } = setup();
    player.unlock();
    player.setHours(at(3, 59));
    await flush();
    const [burst] = started(context, "crickets-night");
    assert.equal(timers.size, 1);
    context.currentTime = 50;
    player.setHours(4);
    const envelope = burst.outputs[0] as Gain;
    assert.deepEqual(envelope.gain.lastRamp(), ["ramp", 0, 54]);
    assert.equal(burst.stopped, 54);
    assert.equal(timers.size, 0, "burst end cancelled");
    timers.advance(1e9);
    await flush();
    assert.equal(started(context, "crickets-night").length, 1);
  });

  it("leaving the window during a rest cancels it; the next night starts fresh", async () => {
    const { player, context, timers } = setup();
    player.unlock();
    player.setHours(3);
    await flush();
    timers.advance(timers.delays[0]);
    assert.equal(timers.size, 1, "resting");
    player.setHours(4);
    assert.equal(timers.size, 0, "rest cancelled");
    player.setHours(19);
    await flush();
    assert.equal(started(context, "crickets-night").length, 2);
  });

  it("hoots three times a night, panned outside, and fetches the file once", async () => {
    const { player, context, requests } = setup({
      random: planned(0.1, 0.5, 0.9),
    });
    player.unlock();
    player.setHours(20);
    await flush();
    player.setHours(21);
    await flush();
    player.setHours(0.6);
    await flush();
    player.setHours(4.5);
    await flush();
    const hoots = started(context, "owl-hoot");
    assert.equal(hoots.length, 3);
    assert.equal(requests.filter((r) => r.endsWith("owl-hoot.mp3")).length, 1);
    const [hoot] = hoots;
    assert.equal(hoot.loop, false);
    const gain = hoot.outputs[0] as Gain;
    const panner = gain.outputs[0] as StereoPanner;
    assert.ok(panner instanceof StereoPanner, "through a StereoPannerNode");
    assert.ok(Math.abs(panner.pan.value) <= 0.9);
    assert.ok(gain.gain.value >= 0.5 * 0.8 - 1e-9);
    assert.ok(gain.gain.value <= 0.5 + 1e-9);
  });

  it("disabled: no fetch and nothing starts", async () => {
    const { player, context, requests } = setup();
    player.setEnabled(false);
    player.unlock();
    for (const h of [21, 6.5, 12]) player.setHours(h);
    await flush();
    assert.deepEqual(requests, []);
    assert.equal(context.sources.length, 0);
    assert.equal(player.getState().enabled, false);
  });

  it("disabling fades everything out over 0.5 s; enabling resumes", async () => {
    const { player, context, timers } = setup();
    player.unlock();
    player.setHours(19);
    await flush();
    const [bed] = started(context, "crickets-night");
    const master = context.gains.find((g) =>
      g.outputs.includes(context.destination),
    );
    assert.ok(master, "one master gain feeds the destination");
    context.currentTime = 30;
    player.setEnabled(false);
    assert.deepEqual(master.gain.lastRamp(), ["ramp", 0, 30.5]);
    assert.equal(bed.stopped, 30.5);
    assert.equal(timers.size, 0, "burst timer cleared");
    player.setEnabled(true);
    await flush();
    assert.equal(player.getState().enabled, true);
  });

  it("a hidden tab pauses the schedule and fetches nothing", async () => {
    const { player, context, requests } = setup();
    player.unlock();
    player.setHidden(true);
    player.setHours(12);
    player.setHours(19);
    await flush();
    assert.deepEqual(requests, []);
    player.setHidden(false);
    await flush();
    assert.equal(started(context, "crickets-night").length, 1);
  });

  it("hiding, disabling or disposing during a rest clears its timer", async () => {
    const halts = [
      (p: AmbientSound) => p.setHidden(true),
      (p: AmbientSound) => p.setEnabled(false),
      (p: AmbientSound) => p.dispose(),
    ];
    for (const halt of halts) {
      const { player, context, timers } = setup();
      player.unlock();
      player.setHours(19);
      await flush();
      timers.advance(timers.delays[0]);
      assert.equal(timers.size, 1, "resting");
      halt(player);
      assert.equal(timers.size, 0, "rest cleared");
      timers.advance(1e9);
      await flush();
      assert.equal(started(context, "crickets-night").length, 1);
    }
  });

  it("a load that lands after a halt starts no burst and no timer", async () => {
    const { player, context, timers } = setup();
    player.unlock();
    player.setHours(19);
    player.setHidden(true);
    await flush();
    assert.equal(started(context, "crickets-night").length, 0);
    assert.equal(timers.size, 0);
  });

  it("a late load after disable plays nothing", async () => {
    const { player, context } = setup();
    player.unlock();
    player.setHours(19);
    player.setEnabled(false);
    await flush();
    assert.equal(started(context, "crickets-night").length, 0);
  });

  it("a failed load lands in the error state, never thrown", async () => {
    const { player, context, requests } = setup({
      fail: new Set(["owl-hoot", "crickets-night:decode"]),
      random: planned(0.1, 0.5, 0.9),
    });
    let notified = 0;
    player.subscribe(() => notified++);
    player.unlock();
    assert.doesNotThrow(() => player.setHours(20));
    assert.doesNotThrow(() => player.setHours(21));
    await flush();
    assert.equal(started(context, "owl-hoot").length, 0);
    assert.equal(started(context, "crickets-night").length, 0);
    assert.match(player.getState().error ?? "", /couldn't load/);
    assert.ok(notified > 0);
    player.setHours(21.5);
    await flush();
    assert.equal(
      requests.filter((r) => r.endsWith("owl-hoot.mp3")).length,
      1,
      "a failed file is not fetched again",
    );
  });

  it("a fetch that throws synchronously is reported, not thrown", async () => {
    const player = new AmbientSound({
      createContext: () => new FakeContext() as unknown as AudioContext,
      fetch: (() => {
        throw new Error("offline");
      }) as typeof fetch,
    });
    player.unlock();
    assert.doesNotThrow(() => player.setHours(19));
    await flush();
    assert.match(player.getState().error ?? "", /crickets/);
  });

  it("without Web Audio it stays silent and fetches nothing", async () => {
    const { player, requests } = setup({ context: null });
    assert.doesNotThrow(() => {
      player.unlock();
      player.setHours(19);
    });
    await flush();
    assert.deepEqual(requests, []);
  });

  it("the rooster crows once in the player too", async () => {
    const { player, context } = setup({ random: () => 0.5 });
    player.unlock();
    player.setHours(6);
    await flush();
    assert.equal(started(context, "rooster-crow").length, 0);
    player.setHours(6.5);
    await flush();
    assert.equal(started(context, "rooster-crow").length, 1);
    for (const h of [6.6, 6.9, 6.7]) player.setHours(h);
    await flush();
    assert.equal(started(context, "rooster-crow").length, 1, "no repeat");
    const crow = started(context, "rooster-crow")[0];
    const gain = (crow.outputs[0] as Gain).gain.value;
    assert.ok(gain >= 0.4 - 1e-9 && gain <= 0.5 + 1e-9);
  });

  it("setOutdoor sets the beds' bus level and ramps it over 1 s", async () => {
    const { player, context } = setup();
    player.unlock();
    player.setOutdoor(0);
    player.setHours(19);
    await flush();
    const [bed] = started(context, "crickets-night");
    const bus = (bed.outputs[0] as Gain).outputs[0] as Gain;
    assert.equal(bus.gain.value, 0, "created at the indoor level");
    context.currentTime = 40;
    player.setOutdoor(1);
    assert.deepEqual(bus.gain.lastRamp(), ["ramp", 1, 41]);
  });

  it("dispose closes the context and nothing starts until unlocked again", async () => {
    const { player, context, requests } = setup();
    player.unlock();
    player.setHours(19);
    await flush();
    player.dispose();
    assert.equal(context.closed, true);
    player.setHours(20);
    await flush();
    assert.equal(requests.length, 1, "only the crickets load, before dispose");
  });
});

/** A fake clock: timers fire only when the test advances time. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  /** Every delay requested, in order. */
  const delays: number[] = [];
  return {
    delays,
    set(run: () => void, ms: number) {
      const id = next++;
      delays.push(ms);
      pending.set(id, { at: now + ms, run });
      return id;
    },
    clear(id: unknown) {
      pending.delete(id as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at))
        if (timer.at <= now) {
          pending.delete(id);
          timer.run();
        }
    },
    get size() {
      return pending.size;
    },
  };
}

// Web Audio fakes.

class Param {
  value: number;
  events: [string, number, number][] = [];
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number) {
    this.value = value;
    this.events.push(["set", value, time]);
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(["ramp", value, time]);
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events.push(["cancel", 0, time]);
    return this;
  }
  /** The last ramp, if any. */
  lastRamp() {
    return this.events.filter((e) => e[0] === "ramp").at(-1) ?? null;
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

class StereoPanner extends Node {
  pan = new Param(0);
}

class Source extends Node {
  buffer: { id: string } | null = null;
  loop = false;
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(when = 0) {
    assert.equal(this.started, null, "a source starts once");
    this.started = when;
  }
  stop(when = 0) {
    this.stopped = when;
  }
}

class FakeContext {
  currentTime = 10;
  state: "suspended" | "running" | "closed" = "suspended";
  destination = new Node();
  resumes = 0;
  closed = false;
  sources: Source[] = [];
  gains: Gain[] = [];
  panners: StereoPanner[] = [];
  decodes: string[] = [];
  resume() {
    this.resumes++;
    this.state = "running";
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = "closed";
    return Promise.resolve();
  }
  createGain() {
    const gain = new Gain();
    this.gains.push(gain);
    return gain;
  }
  createStereoPanner() {
    const panner = new StereoPanner();
    this.panners.push(panner);
    return panner;
  }
  createBufferSource() {
    const source = new Source();
    this.sources.push(source);
    return source;
  }
  decodeAudioData(data: ArrayBuffer) {
    const id = new TextDecoder().decode(data);
    this.decodes.push(id);
    if (id === "broken") return Promise.reject(new Error("decode"));
    return Promise.resolve({ id, duration: 2 });
  }
}

const fileId = (url: string) =>
  url.replace("/world/audio/ambient/", "").replace(".mp3", "");

function setup({
  random = () => 0.5,
  context = new FakeContext() as FakeContext | null,
  fail = new Set<string>(),
} = {}) {
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    const id = fileId(url);
    if (fail.has(id) && id !== "broken-decode")
      return { ok: false, status: 404 } as Response;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        new TextEncoder().encode(fail.has(`${id}:decode`) ? "broken" : id)
          .buffer,
    } as Response;
  }) as typeof fetch;
  let created = 0;
  const timers = fakeTimers();
  const player = new AmbientSound({
    timers,
    createContext: () => {
      created++;
      return context as unknown as AudioContext | null;
    },
    fetch: fetcher,
    random,
  });
  return {
    player,
    context: context as FakeContext,
    requests,
    timers,
    created: () => created,
  };
}

const started = (context: FakeContext, id: string) =>
  context.sources.filter((s) => s.buffer?.id === id && s.started !== null);
