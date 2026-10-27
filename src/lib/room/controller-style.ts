// Which time controller design the room shows. Only this validated name is
// persisted; the clock itself is never stored.

export const CONTROLLER_STYLES = ["compact", "orbital", "timeline"] as const;
export type ControllerStyle = (typeof CONTROLLER_STYLES)[number];
export const DEFAULT_CONTROLLER_STYLE: ControllerStyle = "compact";
export const STYLE_STORAGE_KEY = "room:controller-style";

/** The subset of `Storage` used here, so tests can pass a fake. */
export interface StyleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseControllerStyle(value: unknown): ControllerStyle {
  return (
    CONTROLLER_STYLES.find((style) => style === value) ??
    DEFAULT_CONTROLLER_STYLE
  );
}

/** `localStorage`, or undefined when the browser blocks access to it. */
export function browserStorage(): StyleStorage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function loadControllerStyle(
  storage: StyleStorage | undefined,
): ControllerStyle {
  try {
    return parseControllerStyle(storage?.getItem(STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_CONTROLLER_STYLE;
  }
}

/** Returns false when the choice could not be stored (blocked or full storage). */
export function saveControllerStyle(
  storage: StyleStorage | undefined,
  style: ControllerStyle,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STYLE_STORAGE_KEY, style);
    return true;
  } catch {
    return false;
  }
}
