import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { PATRONUS } from "../../src/lib/world/patronus.ts";
import {
  ambienceLevel,
  ambiencePan,
  createSpellSound,
  SPELL_SAMPLES,
  SPELL_SOUND,
  SPELL_VOICE,
  spellSoundPlan,
} from "../../src/lib/world/spell-sound.ts";
import {
  creditSections,
  type WorldCredits,
} from "../../src/lib/world/world-credits.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const noop = () => undefined;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A Web Audio stand-in that records what was built, started and faded. */
function fakeContext() {
  const started: { kind: string; buffer: unknown; loop: boolean }[] = [];
  const faded: unknown[] = [];
  const param = (owner: unknown) => ({
    value: 0,
    setValueAtTime: noop,
    linearRampToValueAtTime: noop,
    exponentialRampToValueAtTime: noop,
    setTargetAtTime: (value: number) => {
      if (value === 0) faded.push(owner);
    },
    setValueCurveAtTime: noop,
    cancelScheduledValues: noop,
  });
  const node = (kind: string) => {
    const self = {
      kind,
      type: "",
      buffer: null as unknown,
      loop: false,
      connect: noop,
      disconnect: noop,
      start() {
        started.push({ kind, buffer: self.buffer, loop: self.loop });
      },
      stop: noop,
    } as Record<string, unknown>;
    for (const name of ["gain", "frequency", "Q", "pan", "playbackRate"])
      self[name] = param(self);
    return self;
  };
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
    createBiquadFilter: () => node("filter"),
    createStereoPanner: () => node("panner"),
    createBufferSource: () => node("source"),
    decodeAudioData: (bytes: ArrayBuffer) =>
      Promise.resolve({ name: new TextDecoder().decode(bytes), duration: 2 }),
  };
  return { context, started, faded };
}

/** A fetch stand-in serving each requested URL as its own name. */
function fakeFetch(requests: string[], missing: RegExp | null = null) {
  return ((input: string) => {
    requests.push(input);
    if (missing?.test(input))
      return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(new Response(new TextEncoder().encode(input)));
  }) as unknown as typeof fetch;
}

describe("spell sounds (patronus T3)", () => {
  it("swishes as the tip lights, bursts as the patronus forms, hums through its run", () => {
    const plan = spellSoundPlan();
    assert.equal(plan.swish, 0);
    assert.equal(plan.burst, PATRONUS.start);
    assert.deepEqual(plan.ambience, [
      PATRONUS.start,
      PATRONUS.start + PATRONUS.duration,
    ]);
    assert.equal(plan.voice, null, "no voice clip ships");
  });

  it("fades the ambience in, holds it, and lets it go as the patronus dissolves", () => {
    const [a0, a1] = spellSoundPlan().ambience;
    assert.equal(ambienceLevel(a0 - 0.01), 0);
    assert.equal(ambienceLevel(a1 + 0.01), 0);
    const mid = ambienceLevel((a0 + a1) / 2);
    assert.ok(mid > 0.9, `holds at ${mid}`);
    const dissolving = ambienceLevel(a1 - PATRONUS.dissolve / 2);
    assert.ok(dissolving > 0 && dissolving < mid, "fading as it dissolves");
    // It pans with the run: from the shelf's side across the room.
    assert.ok(ambiencePan(a0) < ambiencePan(a1 - 0.3));
    for (let t = a0; t <= a1; t += 0.1)
      assert.ok(Math.abs(ambiencePan(t)) <= SPELL_SOUND.ambience.maxPan + 1e-9);
  });

  it("plays three real recordings shipped beside a manifest, each small", () => {
    const manifest = JSON.parse(
      source("public/world/audio/spell/manifest.json"),
    );
    for (const id of ["swish", "burst", "ambience"] as const) {
      const urls = SPELL_SAMPLES[id];
      assert.deepEqual(
        urls.map((url) => url.split(".").pop()),
        ["ogg", "mp3"],
        `${id}: ogg first, mp3 fallback`,
      );
      const entry = manifest.sounds.find(
        (sound: { id: string }) => sound.id === id,
      );
      assert.ok(entry, `${id} in the manifest`);
      assert.match(entry.license, /^CC0-1\.0$|^CC-BY-(3|4)\.0$/);
      for (const url of urls) {
        const file = new URL(`../../public${url}`, import.meta.url);
        assert.ok(existsSync(file), url);
        assert.ok(statSync(file).size < 100_000, `${url} under 100 KB`);
        assert.ok(
          entry.files.some((f: { file: string }) => f.file === url),
          `${url} listed`,
        );
      }
    }
  });

  it("shows the sound authors and source links in the menu credits", () => {
    const credits = JSON.parse(
      source("public/world/credits.json"),
    ) as WorldCredits;
    const sounds = creditSections(credits).ambient;
    for (const id of ["swish", "burst", "ambience"] as const) {
      const entry = sounds.find((sound) => sound.file === SPELL_SAMPLES[id][1]);
      assert.ok(entry, `${id} visible in menu credits`);
      assert.equal(entry.license, "CC0-1.0");
      assert.match(entry.source, /^https:\/\/opengameart.org\/content\//);
      assert.ok(entry.author.length > 0);
    }
  });

  it("loads the recordings in the click, never the absent voice clip", async () => {
    const { context, started } = fakeContext();
    const requests: string[] = [];
    const sound = createSpellSound({
      createContext: () => context as unknown as AudioContext,
      fetch: fakeFetch(requests),
    });
    sound.cast(0);
    assert.deepEqual(started, [], "nothing before a click unlocks it");
    assert.deepEqual(requests, [], "nothing fetched before the click");
    sound.unlock();
    assert.equal(context.resumed, 1);
    await tick();
    assert.deepEqual(requests.sort(), [
      SPELL_SAMPLES.ambience[0],
      SPELL_SAMPLES.burst[0],
      SPELL_SAMPLES.swish[0],
    ]);
    assert.ok(!requests.some((url) => /expecto-patronum/.test(url)));
    sound.cast(3.8);
    await tick();
    const names = started.map(
      (s) => (s.buffer as { name: string } | null)?.name,
    );
    assert.deepEqual(names.sort(), [
      SPELL_SAMPLES.ambience[0],
      SPELL_SAMPLES.burst[0],
      SPELL_SAMPLES.swish[0],
    ]);
    const ambience = started.find(
      (s) => (s.buffer as { name: string }).name === SPELL_SAMPLES.ambience[0],
    );
    assert.equal(ambience?.loop, true, "the ambience loops through the run");
    sound.cancel();
  });

  it("falls back to the mp3 when the ogg is not there", async () => {
    const { context } = fakeContext();
    const requests: string[] = [];
    const sound = createSpellSound({
      createContext: () => context as unknown as AudioContext,
      fetch: fakeFetch(requests, /\.ogg$/),
    });
    sound.unlock();
    for (let i = 0; i < 5; i++) await tick();
    for (const urls of Object.values(SPELL_SAMPLES))
      assert.ok(requests.includes(urls[1]), urls[1]);
  });

  it("stops the old cast when a new one starts, and never throws", async () => {
    const { context, faded } = fakeContext();
    const sound = createSpellSound({
      createContext: () => context as unknown as AudioContext,
      fetch: fakeFetch([]),
    });
    sound.unlock();
    await tick();
    sound.cast(0);
    assert.equal(faded.length, 0);
    sound.cast(0);
    assert.equal(faded.length, 1, "the first cast's bus fades out");
    sound.cancel();
    assert.equal(faded.length, 2);
    const silent = createSpellSound({ createContext: () => null });
    silent.unlock();
    silent.cast(0);
    const offline = createSpellSound({
      createContext: () => context as unknown as AudioContext,
      fetch: () => Promise.reject(new Error("offline")),
    });
    offline.unlock();
    offline.cast(0);
    await tick();
  });

  it("keeps a typed hook for an optional voice clip, off by default", () => {
    assert.equal(SPELL_VOICE, null);
    assert.match(
      source("src/lib/world/spell-sound.ts"),
      /export const SPELL_VOICE: string \| null = null;/,
    );
  });

  it("is wired to the wand's click and its spell clock", () => {
    const wand = source("src/components/world/Wand.tsx");
    assert.match(wand, /spellSound\.unlock\(\)/);
    assert.match(wand, /spellSound\.cast\(/);
    const app = source("src/components/world/WorldApp.tsx");
    assert.match(app, /spellSound\.unlock\(\)/);
    assert.doesNotMatch(
      source("src/lib/world/spell-sound.ts"),
      /createOscillator/,
      "no synthesized tones left",
    );
  });
});
