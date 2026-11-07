import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PATRONUS } from "../../src/lib/world/patronus.ts";
import {
  createSpellSound,
  SPELL_SOUND,
  SPELL_VOICE_URLS,
  spellSoundPlan,
  whooshLevel,
  whooshPan,
} from "../../src/lib/world/spell-sound.ts";
import { SPELL } from "../../src/lib/world/wand.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const noop = () => undefined;

/** A Web Audio stand-in that records what was built and started. */
function fakeContext() {
  const started: string[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: noop,
    linearRampToValueAtTime: noop,
    exponentialRampToValueAtTime: noop,
    setTargetAtTime: noop,
    setValueCurveAtTime: noop,
    cancelScheduledValues: noop,
  });
  const node = (kind: string) => ({
    kind,
    gain: param(),
    frequency: param(),
    detune: param(),
    Q: param(),
    pan: param(),
    delayTime: param(),
    type: "",
    buffer: null as unknown,
    connect: noop,
    disconnect: noop,
    start() {
      started.push(kind);
    },
    stop: noop,
    onended: null as unknown,
  });
  const context = {
    state: "suspended",
    currentTime: 10,
    sampleRate: 8000,
    destination: node("destination"),
    resumed: 0,
    resume() {
      context.resumed++;
      return Promise.resolve();
    },
    createGain: () => node("gain"),
    createOscillator: () => node("oscillator"),
    createBiquadFilter: () => node("filter"),
    createStereoPanner: () => node("panner"),
    createDelay: () => node("delay"),
    createBufferSource: () => node("noise"),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    decodeAudioData: () => Promise.reject(new Error("no voice")),
  };
  return { context, started };
}

describe("spell sounds (patronus T2)", () => {
  it("swishes as the tip lights, chimes as the patronus bursts out, whooshes through its run", () => {
    const plan = spellSoundPlan();
    assert.equal(plan.swish, 0);
    assert.equal(plan.chime, PATRONUS.start);
    assert.deepEqual(plan.whoosh, [
      PATRONUS.start,
      PATRONUS.start + PATRONUS.duration,
    ]);
    assert.equal(plan.voice, SPELL.words[0]);
    assert.ok(SPELL_SOUND.chime.partials.length >= 3, "a few partials");
    assert.ok(
      SPELL_SOUND.chime.feedback > 0 && SPELL_SOUND.chime.feedback < 0.8,
    );
  });

  it("fades the whoosh in, holds it, and lets it go as the patronus dissolves", () => {
    const [w0, w1] = spellSoundPlan().whoosh;
    assert.equal(whooshLevel(w0 - 0.01), 0);
    assert.equal(whooshLevel(w1 + 0.01), 0);
    const mid = whooshLevel((w0 + w1) / 2);
    assert.ok(mid > 0.9, `holds at ${mid}`);
    const dissolving = whooshLevel(w1 - PATRONUS.dissolve / 2);
    assert.ok(dissolving > 0 && dissolving < mid, "fading as it dissolves");
    // It pans with the run: from the shelf's side across the room.
    assert.ok(whooshPan(w0) < whooshPan(w1 - 0.3));
    for (let t = w0; t <= w1; t += 0.1)
      assert.ok(Math.abs(whooshPan(t)) <= SPELL_SOUND.whoosh.maxPan + 1e-9);
  });

  it("plays only after a click unlocked it, and never throws", () => {
    const { context, started } = fakeContext();
    const sound = createSpellSound({
      createContext: () => context as unknown as AudioContext,
      fetch: () => Promise.reject(new Error("offline")),
    });
    sound.cast(0);
    assert.deepEqual(started, [], "nothing before a click unlocks it");
    sound.unlock();
    assert.equal(context.resumed, 1);
    sound.cast(3.8);
    assert.ok(started.includes("noise"), "swish and whoosh");
    assert.ok(started.filter((kind) => kind === "oscillator").length >= 3);
    sound.cancel();
    const silent = createSpellSound({ createContext: () => null });
    silent.unlock();
    silent.cast(0);
  });

  it("leaves a hook for an optional Expecto Patronum voice clip", () => {
    assert.ok(
      SPELL_VOICE_URLS.every((url) =>
        /^\/world\/audio\/expecto-patronum\.\w+$/.test(url),
      ),
    );
  });

  it("is wired to the wand's click and its spell clock", () => {
    const wand = source("src/components/world/Wand.tsx");
    assert.match(wand, /spellSound\.unlock\(\)/);
    assert.match(wand, /spellSound\.cast\(/);
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(app, /spellSound\.unlock\(\)/);
  });
});
