import { useEffect, useId, useRef, useState } from "react";
import type { CreditPack, Credits } from "@/lib/world/credits.ts";

const linkClass =
  "underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-sm";

function PackCredit({ pack, files }: { pack: CreditPack; files: string[] }) {
  return (
    <li className="border-t border-border py-3 first:border-t-0">
      <h3 className="text-sm font-semibold">{pack.pack}</h3>
      <p className="text-sm text-muted-foreground">
        By{" "}
        <a
          className={linkClass}
          href={pack.authorUrl}
          target="_blank"
          rel="noreferrer"
        >
          {pack.author}
        </a>{" "}
        ·{" "}
        <a
          className={linkClass}
          href={pack.licenseUrl}
          target="_blank"
          rel="noreferrer"
        >
          {pack.license}
        </a>{" "}
        ·{" "}
        <a
          className={linkClass}
          href={pack.source}
          target="_blank"
          rel="noreferrer"
        >
          Source
        </a>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Used: {files.join(", ")}
      </p>
    </li>
  );
}

/**
 * Credits for every shipped asset (S4). A native modal dialog: it traps focus,
 * closes on Escape and returns focus to the button that opened it.
 */
export function CreditsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || credits) return;
    fetch("/world/credits.json")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Credits>;
      })
      .then(setCredits)
      .catch(() => setFailed(true));
  }, [open, credits]);

  const show = () => {
    setOpen(true);
    dialogRef.current?.showModal();
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        className="pointer-events-auto rounded-full bg-zinc-950/70 px-4 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Credits
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl border border-border bg-card p-6 text-card-foreground backdrop:bg-background/80"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Credits
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every model in this world is credited to its author, including CC0
          ones. The island and lighting are original code.
        </p>
        {failed && (
          <p role="alert" className="mt-4 text-sm">
            Credits could not load. They are also in /world/credits.json.
          </p>
        )}
        {!credits && !failed && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Loading credits…
          </p>
        )}
        {credits && (
          <ul className="mt-4 max-h-[60vh] overflow-y-auto">
            {credits.packs.map((pack) => (
              <PackCredit
                key={pack.id}
                pack={pack}
                files={[
                  ...new Set(
                    [...credits.assets, ...(credits.textures ?? [])]
                      .filter((entry) => entry.pack === pack.id)
                      .map((entry) => entry.asset),
                  ),
                ]}
              />
            ))}
            {credits.original?.map((entry) => (
              <li
                key={entry.id}
                className="border-t border-border py-3 first:border-t-0"
              >
                <h3 className="text-sm font-semibold">{entry.asset}</h3>
                <p className="text-sm text-muted-foreground">
                  By {entry.author} · {entry.license}
                </p>
              </li>
            ))}
          </ul>
        )}
        <form method="dialog" className="mt-4 flex justify-end">
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
