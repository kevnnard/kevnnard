import type { Vec3 } from "./house.ts";
import { PATRONUS } from "./patronus.ts";
import { WAND_TIP } from "./wand.ts";

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
/** Continuous, slow envelopes; no strobe or abrupt particle pop. */
export function patronusFxAt(t: number, reducedMotion = false) {
  const formation = smooth((t - PATRONUS.start) / 0.55);
  const dissolve = smooth(
    (t - (PATRONUS.start + PATRONUS.duration - PATRONUS.dissolve)) /
      PATRONUS.dissolve,
  );
  return {
    formation,
    dissolve,
    stream: reducedMotion
      ? 0
      : smooth((t - 0.25) / 0.35) * (1 - smooth((t - 1.1) / 0.65)),
    mist: reducedMotion
      ? 0
      : smooth((t - PATRONUS.start) / 0.3) * (1 - smooth((t - 4.2) / 0.6)),
  };
}
/** Three soft helical filaments, anchored at the wand, converging on light. */
export function streamPoint(
  u: number,
  end: readonly number[],
  time: number,
  strand = 0,
): Vec3 {
  if (u <= 0) return [...WAND_TIP];
  if (u >= 1) return [end[0], end[1], end[2]];
  const radius = Math.sin(Math.PI * u) * 0.045;
  const phase = u * Math.PI * 5 - time * 4 + (strand * Math.PI * 2) / 3;
  return [
    WAND_TIP[0] + (end[0] - WAND_TIP[0]) * u + Math.cos(phase) * radius,
    WAND_TIP[1] + (end[1] - WAND_TIP[1]) * u + Math.sin(phase) * radius,
    WAND_TIP[2] + (end[2] - WAND_TIP[2]) * u,
  ];
}
