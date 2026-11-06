// Enter and exit motion for the side cards (card-motion T1): the football
// helmet's story, the coffee card, the keyboard card and Cherry's card
// (dog-rig T3). They fade in like
// the clock and the scene panel do on the way back to the room
// (world-entry-gate.css, world-entry-hud-in: 1100ms ease-out, opacity
// 0 -> 1, no offset, scale or blur) and out in reverse, a little faster.
// Pure state, so the presence rules are unit tested; useCardPresence.ts
// drives it from the cards' animationend events. Times are milliseconds.

/** world-entry-hud-in's duration and easing (world-entry-gate.css). */
export const CARD_ENTER_MS = 1100;
export const CARD_ENTER_EASE = "ease-out";
/** The reverse curve, a little faster, so a switch never waits on it. */
export const CARD_EXIT_MS = 800;
export const CARD_EXIT_EASE = "ease-in";
/** Step between the inner sections' fades on enter (case-story.css). */
export const CARD_STAGGER_MS = 60;
/** Margin before a missed animationend is assumed. */
const FALLBACK_SLACK_MS = 250;

export type CardState = "entering" | "open" | "leaving";
export type CardEntry<T> = { key: string; value: T; state: CardState };

/** How long to wait for a state's animation before ending it anyway. */
export function cardFallbackMs(state: CardState): number {
  return (
    (state === "leaving" ? CARD_EXIT_MS : CARD_ENTER_MS) + FALLBACK_SLACK_MS
  );
}

const same = <T>(a: readonly CardEntry<T>[], b: readonly CardEntry<T>[]) =>
  a.length === b.length && a.every((entry, index) => entry === b[index]);

/**
 * The cards to render once `key` is the one shown (null: none). Every
 * other card leaves while it enters, so a switch cross-fades; a leaving
 * card shown again turns back instead of stacking a copy. `instant`
 * (reduced motion) drops the leaving cards and opens the new one at once.
 * Returns `entries` itself when nothing changes.
 */
export function showCard<T>(
  entries: readonly CardEntry<T>[],
  key: string | null,
  value: T | null,
  instant: boolean,
): readonly CardEntry<T>[] {
  const shown = key === null || value === null ? null : key;
  let next: CardEntry<T>[];
  if (instant) {
    const current = entries.find((entry) => entry.key === shown);
    next =
      shown === null || value === null
        ? []
        : [
            current?.state === "open"
              ? current
              : { key: shown, value, state: "open" },
          ];
  } else {
    next = entries.map((entry) =>
      entry.key === shown
        ? entry.state === "leaving"
          ? { ...entry, state: "entering" }
          : entry
        : entry.state === "leaving"
          ? entry
          : { ...entry, state: "leaving" },
    );
    if (
      shown !== null &&
      value !== null &&
      !entries.some((entry) => entry.key === shown)
    )
      next.push({ key: shown, value, state: "entering" });
  }
  return same(entries, next) ? entries : next;
}

/**
 * A card's animation from `from` ended: an entering card is open, a leaving
 * card unmounts. An end from a state the card already left changes nothing.
 */
export function endCard<T>(
  entries: readonly CardEntry<T>[],
  key: string,
  from: CardState,
): readonly CardEntry<T>[] {
  const index = entries.findIndex(
    (entry) => entry.key === key && entry.state === from,
  );
  if (index === -1 || from === "open") return entries;
  if (from === "leaving") return entries.filter((_, i) => i !== index);
  return entries.map((entry, i) =>
    i === index ? { ...entry, state: "open" } : entry,
  );
}

/** The card's own animation, not one bubbling from a section or tab note. */
export function isOwnMotion(event: {
  target: unknown;
  currentTarget: unknown;
}): boolean {
  return event.target === event.currentTarget;
}
