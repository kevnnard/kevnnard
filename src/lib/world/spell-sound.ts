// The Elder Wand's spell sounds (patronus T2): made in Web Audio, no audio
// files and no licences. A short filtered-noise swish as the tip lights, a
// bright chime as the patronus bursts out (a few detuned sine partials,
// a fast attack and a long tail through a feedback delay), and a soft airy
// whoosh that pans with the run and fades as the patronus dissolves. An
// optional voice clip (public/world/audio/expecto-patronum.*) says the
// words if it ships. Like the lamp switch (floor-lamp.ts), one lazy
// AudioContext is made inside the visitor's click, and sounds still play
// under reduced motion; only the visuals calm down.

import { PATRONUS, patronusAt } from "./patronus.ts";
import { SPELL } from "./wand.ts";
import { WAND_CHASE } from "./wand-shot.ts";

export const SPELL_SOUND = {
  /** The whole spell's level. */
  gain: 0.5,
  swish: {
    duration: 0.45,
    attack: 0.03,
    peak: 0.35,
    /** The band-pass sweeps up over the swish, Hz. */
    from: 500,
    to: 4200,
    q: 1.4,
  },
  chime: {
    /** C6, G6, C7, E7, G7: bright and open. */
    partials: [1046.5, 1568, 2093, 2637, 3136],
    /** Cents each partial is detuned by, alternately up and down. */
    detune: 7,
    attack: 0.008,
    peak: 0.07,
    /** Seconds each partial rings for. */
    decay: 2.4,
    /** The tail: a damped feedback delay. */
    delay: 0.21,
    feedback: 0.5,
    damp: 3200,
    wet: 0.55,
    /** Seconds the tail is allowed before its nodes are freed. */
    tail: 4,
  },
  whoosh: {
    peak: 0.16,
    fadeIn: 0.4,
    /** A soft band of noise, drifting up as the run goes on, Hz. */
    from: 600,
    to: 1500,
    q: 0.8,
    /** Pan with the run, at most this far either side. */
    maxPan: 0.6,
    /** Pan points per second of the run. */
    panRate: 20,
  },
  voiceGain: 0.9,
} as const;

/** The optional voice clip, tried in this order; none ships yet. */
export const SPELL_VOICE_URLS = [
  "/world/audio/expecto-patronum.mp3",
  "/world/audio/expecto-patronum.ogg",
] as const;

/** When each sound starts, seconds of the spell (wand.ts SPELL). */
export function spellSoundPlan(): {
  swish: number;
  chime: number;
  whoosh: readonly [number, number];
  voice: number;
} {
  return {
    swish: 0,
    chime: PATRONUS.start,
    whoosh: [PATRONUS.start, PATRONUS.start + PATRONUS.duration],
    voice: SPELL.words[0],
  };
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** The whoosh's level (0-1) `t` seconds into the spell. */
export function whooshLevel(t: number): number {
  const [w0, w1] = spellSoundPlan().whoosh;
  if (t < w0 || t > w1) return 0;
  const rise = smooth((t - w0) / SPELL_SOUND.whoosh.fadeIn);
  const fall = smooth((w1 - t) / PATRONUS.dissolve);
  return Math.min(rise, fall);
}

// Across the chase's wide view (wand-shot.ts): its screen-right direction.
const RIGHT = [Math.cos(WAND_CHASE.yaw), -Math.sin(WAND_CHASE.yaw)] as const;
const across = (t: number) => {
  const state = patronusAt(t);
  return state
    ? state.position[0] * RIGHT[0] + state.position[2] * RIGHT[1]
    : 0;
};
const ACROSS = (() => {
  const values: number[] = [];
  for (let k = 0; k <= 60; k++)
    values.push(across(PATRONUS.start + (PATRONUS.duration * k) / 60));
  return [Math.min(...values), Math.max(...values)] as const;
})();

/** The whoosh's pan (-1 left, 1 right) `t` seconds into the spell. */
export function whooshPan(t: number): number {
  const [w0, w1] = spellSoundPlan().whoosh;
  const x = across(Math.min(w1, Math.max(w0, t)));
  const share = (x - ACROSS[0]) / (ACROSS[1] - ACROSS[0] || 1);
  return (clamp01(share) * 2 - 1) * SPELL_SOUND.whoosh.maxPan;
}

export interface SpellSound {
  /** Inside the visitor's click: makes or resumes the context. */
  unlock: () => void;
  /** Plays the spell's sounds, the spell starting `delay` seconds from now. */
  cast: (delay: number) => void;
  /** Quietly stops whatever is still playing. */
  cancel: () => void;
}

function defaultContext(): AudioContext | null {
  const Context =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Context ? new Context() : null;
}

/**
 * The spell's player. Nothing is made until `unlock` (in a click); `cast`
 * before that is silent. Every call is safe: it never throws or rejects.
 */
export function createSpellSound({
  createContext = defaultContext,
  fetch: fetcher = (input, init) => globalThis.fetch(input, init),
}: {
  createContext?: () => AudioContext | null;
  fetch?: typeof fetch;
} = {}): SpellSound {
  let context: AudioContext | null = null;
  let failed = false;
  let noise: AudioBuffer | null = null;
  let voice: Promise<AudioBuffer | null> | null = null;
  let playing: { bus: GainNode; nodes: AudioNode[]; timer: number } | null =
    null;

  const loadVoice = async (ctx: AudioContext) => {
    for (const url of SPELL_VOICE_URLS) {
      try {
        const res = await fetcher(url);
        if (!res.ok) continue;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        // Not there, or not decodable: try the next.
      }
    }
    return null;
  };

  const release = (cast: NonNullable<typeof playing>) => {
    for (const node of cast.nodes) {
      try {
        node.disconnect();
      } catch {
        // Already gone.
      }
    }
  };

  const cancel = () => {
    const cast = playing;
    playing = null;
    if (!cast || !context) return;
    globalThis.clearTimeout(cast.timer);
    try {
      cast.bus.gain.setTargetAtTime(0, context.currentTime, 0.03);
    } catch {
      // Released below anyway.
    }
    globalThis.setTimeout(() => release(cast), 200);
  };

  const schedule = (ctx: AudioContext, delay: number) => {
    const nodes: AudioNode[] = [];
    const keep = <T extends AudioNode>(node: T) => {
      nodes.push(node);
      return node;
    };
    const plan = spellSoundPlan();
    const at = ctx.currentTime + Math.max(0, delay);
    const bus = keep(ctx.createGain());
    bus.gain.value = SPELL_SOUND.gain;
    bus.connect(ctx.destination);
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const noiseFrom = (start: number, length: number) => {
      const source = keep(ctx.createBufferSource());
      source.buffer = noise;
      source.loop = true;
      source.start(start);
      source.stop(start + length);
      return source;
    };

    // The swish: noise through a band sweeping up, a fast rise and fall.
    {
      const { duration, attack, peak, from, to, q } = SPELL_SOUND.swish;
      const start = at + plan.swish;
      const filter = keep(ctx.createBiquadFilter());
      filter.type = "bandpass";
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(to, start + duration);
      const level = keep(ctx.createGain());
      level.gain.setValueAtTime(0, start);
      level.gain.linearRampToValueAtTime(peak, start + attack);
      level.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      noiseFrom(start, duration + 0.05).connect(filter);
      filter.connect(level);
      level.connect(bus);
    }

    // The chime: detuned partials into a dry path and a damped echo.
    {
      const chime = SPELL_SOUND.chime;
      const start = at + plan.chime;
      const dry = keep(ctx.createGain());
      dry.connect(bus);
      const echo = keep(ctx.createDelay(1));
      echo.delayTime.value = chime.delay;
      const damp = keep(ctx.createBiquadFilter());
      damp.type = "lowpass";
      damp.frequency.value = chime.damp;
      const feedback = keep(ctx.createGain());
      feedback.gain.value = chime.feedback;
      const wet = keep(ctx.createGain());
      wet.gain.value = chime.wet;
      dry.connect(echo);
      echo.connect(damp);
      damp.connect(feedback);
      feedback.connect(echo);
      damp.connect(wet);
      wet.connect(bus);
      chime.partials.forEach((frequency, i) => {
        const tone = keep(ctx.createOscillator());
        tone.type = "sine";
        tone.frequency.value = frequency;
        tone.detune.value = (i % 2 ? -1 : 1) * chime.detune;
        const level = keep(ctx.createGain());
        // Higher partials quieter and shorter.
        const peak = chime.peak / (1 + i * 0.35);
        const decay = chime.decay / (1 + i * 0.25);
        level.gain.setValueAtTime(0, start);
        level.gain.linearRampToValueAtTime(peak, start + chime.attack);
        level.gain.exponentialRampToValueAtTime(0.0001, start + decay);
        tone.connect(level);
        level.connect(dry);
        tone.start(start);
        tone.stop(start + decay + 0.05);
      });
    }

    // The whoosh: a soft band of noise, panned with the run.
    {
      const whoosh = SPELL_SOUND.whoosh;
      const [w0, w1] = plan.whoosh;
      const start = at + w0;
      const length = w1 - w0;
      const filter = keep(ctx.createBiquadFilter());
      filter.type = "bandpass";
      filter.Q.value = whoosh.q;
      filter.frequency.setValueAtTime(whoosh.from, start);
      filter.frequency.linearRampToValueAtTime(whoosh.to, start + length);
      const level = keep(ctx.createGain());
      const pan = keep(ctx.createStereoPanner());
      const points = Math.max(2, Math.ceil(length * whoosh.panRate));
      const levels = new Float32Array(points);
      const pans = new Float32Array(points);
      for (let k = 0; k < points; k++) {
        const t = w0 + (length * k) / (points - 1);
        levels[k] = whoosh.peak * whooshLevel(t);
        pans[k] = whooshPan(t);
      }
      level.gain.setValueCurveAtTime(levels, start, length);
      pan.pan.setValueCurveAtTime(pans, start, length);
      noiseFrom(start, length).connect(filter);
      filter.connect(level);
      level.connect(pan);
      pan.connect(bus);
    }

    // The words, if the clip ships.
    const cast = {
      bus,
      nodes,
      timer: globalThis.setTimeout(
        () => {
          if (playing === cast) playing = null;
          release(cast);
        },
        (Math.max(0, delay) + plan.whoosh[1] + SPELL_SOUND.chime.tail) * 1000,
      ) as unknown as number,
    };
    voice?.then((clip) => {
      const start = at + plan.voice;
      if (!clip || playing !== cast || start < ctx.currentTime) return;
      try {
        const source = keep(ctx.createBufferSource());
        source.buffer = clip;
        const level = keep(ctx.createGain());
        level.gain.value = SPELL_SOUND.voiceGain;
        source.connect(level);
        level.connect(bus);
        source.start(start);
      } catch {
        // A missing voice is not worth surfacing.
      }
    });
    return cast;
  };

  return {
    unlock: () => {
      if (failed) return;
      try {
        context ??= createContext();
      } catch {
        context = null;
      }
      const ctx = context;
      if (!ctx) {
        failed = true;
        return;
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
      voice ??= loadVoice(ctx);
    },
    cast: (delay) => {
      const ctx = context;
      if (!ctx) return;
      cancel();
      try {
        playing = schedule(ctx, delay);
      } catch {
        // No sound is better than a broken page.
        playing = null;
      }
    },
    cancel,
  };
}

/** The page's spell sounds. */
export const spellSound = createSpellSound();
