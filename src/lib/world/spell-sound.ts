// Local CC0 recordings; no audio requests or AudioContext before a click.
import { PATRONUS, patronusAt } from "./patronus.ts";
import { WAND_CHASE } from "./wand-shot.ts";

export const SPELL_SOUND = {
  gain: 0.45,
  swish: { gain: 0.7 },
  burst: { gain: 0.6 },
  ambience: { gain: 0.18, fadeIn: 0.45, maxPan: 0.6, panRate: 20 },
} as const;
export const SPELL_VOICE: string | null = null;
export const SPELL_SAMPLES = {
  swish: ["/world/audio/spell/swish.ogg", "/world/audio/spell/swish.mp3"],
  burst: ["/world/audio/spell/burst.ogg", "/world/audio/spell/burst.mp3"],
  ambience: [
    "/world/audio/spell/ambience.ogg",
    "/world/audio/spell/ambience.mp3",
  ],
} as const;
export function spellSoundPlan() {
  return {
    swish: 0,
    burst: PATRONUS.start,
    ambience: [PATRONUS.start, PATRONUS.start + PATRONUS.duration] as const,
    voice: SPELL_VOICE ? 0.35 : null,
  };
}
const clamp = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export function ambienceLevel(t: number) {
  const [a, b] = spellSoundPlan().ambience;
  return Math.min(
    smooth((t - a) / SPELL_SOUND.ambience.fadeIn),
    smooth((b - t) / PATRONUS.dissolve),
  );
}
const RIGHT = [Math.cos(WAND_CHASE.yaw), -Math.sin(WAND_CHASE.yaw)];
const across = (t: number) => {
  const p = patronusAt(t)?.position;
  return p ? p[0] * RIGHT[0] + p[2] * RIGHT[1] : 0;
};
const bounds = Array.from({ length: 61 }, (_, i) =>
  across(PATRONUS.start + (PATRONUS.duration * i) / 60),
);
const min = Math.min(...bounds),
  max = Math.max(...bounds);
export function ambiencePan(t: number) {
  const x = across(
    Math.max(PATRONUS.start, Math.min(PATRONUS.start + PATRONUS.duration, t)),
  );
  return (
    (clamp((x - min) / (max - min || 1)) * 2 - 1) * SPELL_SOUND.ambience.maxPan
  );
}
export interface SpellSound {
  unlock: () => void;
  cast: (delay: number) => void;
  cancel: () => void;
}
function defaultContext(): AudioContext | null {
  const Context =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return Context ? new Context() : null;
}
type SampleId = keyof typeof SPELL_SAMPLES;
type Clips = Record<SampleId, AudioBuffer | null> & {
  voice: AudioBuffer | null;
};
export function createSpellSound({
  createContext = defaultContext,
  fetch: fetcher = (input, init) => globalThis.fetch(input, init),
}: {
  createContext?: () => AudioContext | null;
  fetch?: typeof fetch;
} = {}): SpellSound {
  let context: AudioContext | null = null;
  let loading: Promise<Clips> | null = null;
  let clips: Clips | null = null;
  let generation = 0;
  let playing: {
    bus: GainNode;
    nodes: AudioNode[];
    sources: AudioBufferSourceNode[];
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const load = async (ctx: AudioContext, urls: readonly string[]) => {
    for (const url of urls) {
      try {
        const res = await fetcher(url);
        if (res.ok) return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        /* Try the fallback codec, silently. */
      }
    }
    return null;
  };
  const release = (cast: NonNullable<typeof playing>) => {
    for (const source of cast.sources) {
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
    }
    for (const node of cast.nodes) {
      try {
        node.disconnect();
      } catch {
        /* Already released. */
      }
    }
  };
  const cancel = () => {
    generation++;
    const cast = playing;
    playing = null;
    if (!cast || !context) return;
    clearTimeout(cast.timer);
    cast.bus.gain.cancelScheduledValues(context.currentTime);
    cast.bus.gain.setTargetAtTime(0, context.currentTime, 0.025);
    setTimeout(() => release(cast), 180);
  };
  const schedule = (ctx: AudioContext, buffers: Clips, at: number) => {
    const nodes: AudioNode[] = [],
      sources: AudioBufferSourceNode[] = [];
    const keep = <T extends AudioNode>(node: T): T => {
      nodes.push(node);
      return node;
    };
    const bus = keep(ctx.createGain());
    bus.gain.value = SPELL_SOUND.gain;
    bus.connect(ctx.destination);
    const plan = spellSoundPlan();
    const play = (
      buffer: AudioBuffer | null,
      start: number,
      gain: number,
      loop = false,
    ) => {
      if (
        !buffer ||
        start + (loop ? PATRONUS.duration : buffer.duration) <= ctx.currentTime
      )
        return;
      const source = keep(ctx.createBufferSource());
      sources.push(source);
      source.buffer = buffer;
      source.loop = loop;
      const level = keep(ctx.createGain());
      level.gain.value = gain;
      source.connect(level);
      if (loop) {
        const pan = keep(ctx.createStereoPanner());
        level.connect(pan);
        pan.connect(bus);
        const length = PATRONUS.duration,
          count = Math.ceil(length * SPELL_SOUND.ambience.panRate);
        const levels = new Float32Array(count),
          pans = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          const t = PATRONUS.start + (length * i) / (count - 1);
          levels[i] = gain * ambienceLevel(t);
          pans[i] = ambiencePan(t);
        }
        // Late downloads never try to automate in the past.
        if (start >= ctx.currentTime) {
          level.gain.setValueCurveAtTime(levels, start, length);
          pan.pan.setValueCurveAtTime(pans, start, length);
        } else {
          level.gain.setValueAtTime(
            gain * ambienceLevel(PATRONUS.start + ctx.currentTime - start),
            ctx.currentTime,
          );
          level.gain.linearRampToValueAtTime(0, start + length);
        }
        source.start(Math.max(start, ctx.currentTime));
        source.stop(start + length);
      } else {
        level.connect(bus);
        source.start(
          Math.max(start, ctx.currentTime),
          Math.max(0, ctx.currentTime - start),
        );
      }
    };
    play(buffers.swish, at, SPELL_SOUND.swish.gain);
    play(buffers.burst, at + plan.burst, SPELL_SOUND.burst.gain);
    play(
      buffers.ambience,
      at + plan.ambience[0],
      SPELL_SOUND.ambience.gain,
      true,
    );
    if (plan.voice !== null) play(buffers.voice, at + plan.voice, 0.8);
    const cast = {
      bus,
      nodes,
      sources,
      timer: setTimeout(
        () => {
          if (playing === cast) playing = null;
          release(cast);
        },
        Math.max(0, at + plan.ambience[1] + 3 - ctx.currentTime) * 1000,
      ),
    };
    // Node test runners should not wait for the browser's cleanup timer.
    (cast.timer as unknown as { unref?: () => void }).unref?.();
    return cast;
  };
  return {
    unlock: () => {
      try {
        context ??= createContext();
        const ctx = context;
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
        loading ??= Promise.all([
          load(ctx, SPELL_SAMPLES.swish),
          load(ctx, SPELL_SAMPLES.burst),
          load(ctx, SPELL_SAMPLES.ambience),
          SPELL_VOICE ? load(ctx, [SPELL_VOICE]) : Promise.resolve(null),
        ]).then(([swish, burst, ambience, voice]) => {
          clips = { swish, burst, ambience, voice };
          return clips;
        });
      } catch {
        /* Audio is optional, never break navigation. */
      }
    },
    cast: (delay) => {
      const ctx = context;
      if (!ctx || !loading) return;
      cancel();
      const token = generation;
      const at = ctx.currentTime + Math.max(0, delay);
      const start = (buffers: Clips) => {
        if (token !== generation) return;
        try {
          playing = schedule(ctx, buffers, at);
        } catch {
          playing = null;
        }
      };
      if (clips) start(clips);
      else void loading.then(start).catch(() => undefined);
    },
    cancel,
  };
}
export const spellSound = createSpellSound();
