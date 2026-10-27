import {
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  CONTROLLER_STYLES,
  type ControllerStyle,
} from "@/lib/room/controller-style.ts";
import { cn } from "@/lib/utils";

const OPTIONS: Record<ControllerStyle, { title: string; detail: string }> = {
  compact: {
    title: "Compact console",
    detail: "Corner pill, smallest footprint",
  },
  orbital: { title: "Orbital clock", detail: "Large 24-hour dial" },
  timeline: { title: "Timeline dock", detail: "Full-width day strip" },
};

interface ControllerSettingsProps {
  style: ControllerStyle;
  onChange: (style: ControllerStyle) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which way the panel opens from the button. */
  side?: "top" | "bottom";
}

/**
 * Style switcher: a disclosure button with a radio group, not a modal, so the
 * room stays visible and usable. Escape closes only the panel and never also
 * steps the room back to the overview.
 */
export function ControllerSettings({
  style,
  onChange,
  open,
  onOpenChange,
  side = "top",
}: ControllerSettingsProps) {
  const panelId = useId();
  const name = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // A style switch remounts this component inside the new design; keep focus
  // on the chosen option so keyboard users do not lose their place.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLInputElement>("input:checked")
      ?.focus({ preventScroll: true });
  }, [open]);

  const close = () => {
    onOpenChange(false);
    buttonRef.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    // React's stopPropagation also stops the native event before it reaches
    // RoomApp's window listener.
    event.stopPropagation();
    close();
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    if (root.contains(event.relatedTarget)) return;
    // Checked after focus settles: some browsers report no relatedTarget for
    // clicks inside, and a style switch detaches this copy on purpose.
    window.setTimeout(() => {
      if (root.isConnected && !root.contains(document.activeElement))
        onOpenChange(false);
    });
  };

  return (
    <div className="relative font-sans" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Controller style"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="inline-flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-50 aria-expanded:bg-zinc-800 aria-expanded:text-zinc-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-zinc-300/50"
      >
        {/* Inline sliders icon: no extra dependency on the room's lazy path. */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="size-4"
        >
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <circle cx={16} cy={7} r={2} />
          <circle cx={8} cy={17} r={2} />
        </svg>
      </button>
      {open && (
        // Focusable so clicks on the panel's padding keep it open.
        <div
          ref={panelRef}
          id={panelId}
          tabIndex={-1}
          className={cn(
            "absolute right-0 z-10 w-60 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-zinc-50 outline-none",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <fieldset>
            <legend className="mb-2 text-xs uppercase tracking-widest text-emerald-500">
              Controller style
            </legend>
            <div className="grid gap-1">
              {CONTROLLER_STYLES.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-zinc-800/50 has-checked:bg-emerald-500/30 has-focus-visible:outline-2 has-focus-visible:outline-zinc-300"
                >
                  <input
                    type="radio"
                    name={name}
                    value={option}
                    checked={style === option}
                    onChange={() => onChange(option)}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">
                      {OPTIONS[option].title}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {OPTIONS[option].detail}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-2 text-xs text-zinc-400">
            Saved in this browser. The clock keeps running.
          </p>
        </div>
      )}
    </div>
  );
}
