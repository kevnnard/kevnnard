import { useEffect, useId, useRef, useState } from "react";
import type { TerminalLine } from "@/lib/room/terminal.ts";
import { cn } from "@/lib/utils";

interface TerminalProps {
  lines: readonly TerminalLine[];
  onSubmit: (input: string) => void;
  /** Last link produced by `open`, shown as a fallback when popups are blocked. */
  link?: { title: string; url: string };
  /** Inactive terminals are a visual preview only: not focusable or announced. */
  active: boolean;
  className?: string;
}

const LINE_CLASS: Record<TerminalLine["kind"], string> = {
  input: "text-emerald-300",
  output: "text-zinc-200",
  error: "text-red-400",
};

export function Terminal({
  lines,
  onSubmit,
  link,
  active,
  className,
}: TerminalProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (active) inputRef.current?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [lines]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-md bg-zinc-950/95 p-3 font-mono text-[13px] leading-snug text-zinc-200",
        className,
      )}
      inert={!active}
      aria-hidden={!active}
      onPointerDown={() => inputRef.current?.focus({ preventScroll: true })}
    >
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {lines.map((line, index) => (
          // Lines are append-only between clears, so the index is a stable key.
          <p
            key={index}
            className={`whitespace-pre-wrap break-words ${LINE_CLASS[line.kind]}`}
          >
            {line.kind === "input" ? `$ ${line.text}` : line.text}
          </p>
        ))}
        {link && (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300 underline"
          >
            {link.title} ↗
          </a>
        )}
      </div>
      <form
        className="mt-2 flex items-center gap-2 border-t border-zinc-800 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
          setValue("");
        }}
      >
        <label htmlFor={inputId} className="text-emerald-400">
          <span className="sr-only">Terminal command</span>$
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={120}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="type help"
          className="min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
        />
      </form>
    </div>
  );
}
