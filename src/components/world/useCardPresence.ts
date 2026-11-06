import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  type CardEntry,
  type CardState,
  cardFallbackMs,
  endCard,
  isOwnMotion,
  showCard,
} from "@/lib/world/card-motion.ts";

export type CardPresence<T> = CardEntry<T> & {
  /** The card root's onAnimationEnd. */
  onMotionEnd: (event: SyntheticEvent) => void;
};

/**
 * Keeps a side card mounted through its exit (card-motion T1): `key` is
 * the card shown now (null: none). Each returned card carries its
 * data-state; it opens and unmounts on its own animation's end, or after a
 * timeout if that end never comes (a hidden tab, a missed event).
 */
export function useCardPresence<T>(
  key: string | null,
  value: T | null,
  reducedMotion: boolean,
): CardPresence<T>[] {
  const [entries, setEntries] = useState(() =>
    showCard<T>([], key, value, reducedMotion),
  );
  // Before paint, so a switch never shows a frame without either card.
  useLayoutEffect(() => {
    setEntries((current) => showCard(current, key, value, reducedMotion));
  }, [key, value, reducedMotion]);
  const end = useCallback(
    (card: string, from: CardState) =>
      setEntries((current) => endCard(current, card, from)),
    [],
  );
  useEffect(() => {
    const timers = entries
      .filter((entry) => entry.state !== "open")
      .map((entry) =>
        setTimeout(
          () => end(entry.key, entry.state),
          cardFallbackMs(entry.state),
        ),
      );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [entries, end]);
  return entries.map((entry) => ({
    ...entry,
    onMotionEnd: (event: SyntheticEvent) => {
      if (isOwnMotion(event)) end(entry.key, entry.state);
    },
  }));
}
