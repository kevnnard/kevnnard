// Speaker focus console (T3, S1/S3/S6): the keys of the speaker close-up,
// the spectrum bars from real analyser bins and the bounded frame loop that
// reads them. Pure helpers; the React panel only wires them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ConsoleTargets,
  consoleKeydown,
  SPECTRUM_HZ,
  spectrumBars,
  spectrumLoop,
  trackPosition,
  VOLUME_STEP,
} from "../../src/lib/world/speaker-console.ts";

const BODY = { kind: "body" };
const SLIDER = { kind: "input" };
const BUTTON = { kind: "button" };
const FIELD = { kind: "textarea" };
const EDITABLE = { kind: "contenteditable" };
const SELECT = { kind: "select" };
const FRAME = { kind: "iframe" };
const TERMINAL = { kind: "terminal" };
const OUTSIDE = { kind: "outside" };

const targets: ConsoleTargets = {
  owns: (target) => target !== OUTSIDE && target !== TERMINAL,
  editable: (target) =>
    [SLIDER, FIELD, EDITABLE, SELECT, FRAME].includes(target as typeof SLIDER),
  activates: (target) => target === BUTTON,
};

/**
 * Like a DOM KeyboardEvent: every field is an inherited getter, so a spread
 * copy (`{ ...event }`) would lose them all.
 */
class Key {
  #init: Record<string, unknown>;
  constructor(key: string, init: Record<string, unknown> = {}) {
    this.#init = { key, target: BODY, ...init };
  }
  get key() {
    return this.#init.key as string;
  }
  get target() {
    return this.#init.target;
  }
  get repeat() {
    return Boolean(this.#init.repeat);
  }
  get ctrlKey() {
    return Boolean(this.#init.ctrlKey);
  }
  get metaKey() {
    return Boolean(this.#init.metaKey);
  }
  get altKey() {
    return Boolean(this.#init.altKey);
  }
  get shiftKey() {
    return Boolean(this.#init.shiftKey);
  }
  get defaultPrevented() {
    return Boolean(this.#init.defaultPrevented);
  }
}

const press = (key: string, init?: Record<string, unknown>) =>
  consoleKeydown(new Key(key, init), targets);

describe("speaker console keys (S1)", () => {
  it("maps gentle-stream's keys from inherited event fields", () => {
    assert.equal(Object.keys(new Key("n")).length, 0, "no own fields");
    assert.equal(press(" "), "toggle");
    assert.equal(press("n"), "next");
    assert.equal(press("N", { shiftKey: true }), "next");
    assert.equal(press("p"), "previous");
    assert.equal(press("P", { shiftKey: true }), "previous");
    assert.equal(press("+", { shiftKey: true }), "louder");
    assert.equal(press("="), "louder");
    assert.equal(press("-"), "quieter");
    assert.equal(press("_", { shiftKey: true }), "quieter");
    assert.equal(press("Escape"), "exit");
    assert.equal(press("x"), null);
    assert.equal(press("ArrowUp"), null, "arrows stay native");
  });

  it("works from the console's own buttons, except Space activating them", () => {
    assert.equal(press(" ", { target: BUTTON }), null);
    assert.equal(press("n", { target: BUTTON }), "next");
    assert.equal(press("+", { target: BUTTON }), "louder");
    assert.equal(press("Escape", { target: BUTTON }), "exit");
  });

  it("leaves native inputs and editors alone", () => {
    for (const target of [SLIDER, FIELD, EDITABLE, SELECT, FRAME])
      for (const key of [" ", "n", "p", "+", "-", "ArrowUp", "ArrowDown"])
        assert.equal(press(key, { target }), null, `${key} on ${target.kind}`);
    // Esc still leaves the close-up from the sliders, as before.
    assert.equal(press("Escape", { target: SLIDER }), "exit");
  });

  it("ignores focus outside the world, like the terminal and frames", () => {
    for (const target of [OUTSIDE, TERMINAL])
      for (const key of [" ", "n", "Escape"])
        assert.equal(press(key, { target }), null);
  });

  it("ignores modifiers, repeats and handled events", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"])
      for (const key of [" ", "n", "p", "+", "-", "Escape"])
        assert.equal(press(key, { [mod]: true }), null, `${mod}+${key}`);
    for (const key of [" ", "n", "p", "+", "-"])
      assert.equal(press(key, { repeat: true }), null);
    assert.equal(press("n", { defaultPrevented: true }), null);
    assert.equal(press("Escape", { defaultPrevented: true }), null);
  });

  it("steps the volume 5% like the source app", () => {
    assert.equal(VOLUME_STEP, 0.05);
  });
});

describe("speaker console spectrum (S1)", () => {
  it("maps silence to zeros and full bins to full bars", () => {
    const out = new Float32Array(48);
    spectrumBars(new Uint8Array(256), out);
    assert.ok(out.every((v) => v === 0));
    spectrumBars(new Uint8Array(256).fill(255), out);
    assert.ok(out.every((v) => v === 1));
  });

  it("covers the bins low to high, each bar from its own band", () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < data.length; i++) data[i] = 255 - i;
    const out = new Float32Array(48);
    spectrumBars(data, out);
    for (let i = 1; i < out.length; i++)
      assert.ok(out[i] < out[i - 1], `bar ${i} falls with frequency`);
    assert.ok(out.every((v) => v >= 0 && v <= 1));
    // Only the top band lit: only the last bars rise.
    data.fill(0);
    data[data.length - 1] = 255;
    spectrumBars(data, out);
    assert.equal(out[0], 0);
    assert.ok(out[out.length - 1] > 0);
  });

  it("is deterministic: the same bins give the same bars", () => {
    const data = new Uint8Array(256).map((_, i) => (i * 37) % 256);
    const a = new Float32Array(32);
    const b = new Float32Array(32);
    spectrumBars(data, a);
    spectrumBars(data, b);
    assert.deepEqual(a, b);
  });
});

function fakeFrames() {
  let next = 1;
  const pending = new Map<number, (time: number) => void>();
  return {
    pending,
    request(run: (time: number) => void) {
      const id = next++;
      pending.set(id, run);
      return id;
    },
    cancel(id: number) {
      pending.delete(id);
    },
    tick(time: number) {
      const runs = [...pending.values()];
      pending.clear();
      for (const run of runs) run(time);
    },
  };
}

describe("speaker console frame loop (S1)", () => {
  it("draws at most SPECTRUM_HZ per second, one request at a time", () => {
    assert.ok(SPECTRUM_HZ >= 15 && SPECTRUM_HZ <= 30);
    const frames = fakeFrames();
    const draws: number[] = [];
    const loop = spectrumLoop({
      request: frames.request,
      cancel: frames.cancel,
      draw: (time) => draws.push(time),
      clear: () => draws.push(-1),
    });
    loop.start();
    loop.start();
    assert.equal(frames.pending.size, 1);
    // 60 Hz display for one second.
    for (let i = 0; i <= 60; i++) frames.tick(i * (1000 / 60));
    assert.ok(draws.length >= 15 && draws.length <= 30, `${draws.length}`);
    assert.equal(frames.pending.size, 1);
  });

  it("stop cancels the pending frame and clears the bars once", () => {
    const frames = fakeFrames();
    const draws: number[] = [];
    let clears = 0;
    const loop = spectrumLoop({
      request: frames.request,
      cancel: frames.cancel,
      draw: (time) => draws.push(time),
      clear: () => clears++,
    });
    loop.start();
    frames.tick(0);
    loop.stop();
    loop.stop();
    assert.equal(frames.pending.size, 0);
    assert.equal(clears, 1);
    frames.tick(1000);
    assert.equal(draws.length, 1, "nothing after stop");
    assert.equal(loop.running, false);
  });

  it("clamps the rate into 15-30 Hz", () => {
    for (const [hz, max] of [
      [240, 30],
      [1, 15],
    ] as const) {
      const frames = fakeFrames();
      let draws = 0;
      const loop = spectrumLoop({
        request: frames.request,
        cancel: frames.cancel,
        draw: () => draws++,
        clear: () => {
          // Nothing drawn, nothing to clear.
        },
        hz,
      });
      loop.start();
      for (let i = 0; i <= 240; i++) frames.tick(i * (1000 / 240));
      assert.ok(draws <= max + 1 && draws >= max - 1, `${hz}: ${draws}`);
    }
  });
});

describe("speaker console track position", () => {
  it("numbers the track in the list of five", () => {
    assert.equal(trackPosition("cafe-drift"), "01 / 05");
    assert.equal(trackPosition("midnight-code"), "05 / 05");
    assert.equal(trackPosition(null), "-- / 05");
  });
});
