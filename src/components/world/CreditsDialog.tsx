import { useEffect, useState } from "react";
import {
  type AssetAcknowledgement,
  BRUNO_INSPIRATION,
  type CreditSections,
  creditSections,
  type WorldCredits,
} from "@/lib/world/world-credits.ts";

/** One request per page: the tab can open and close without refetching. */
let pending: Promise<CreditSections> | null = null;
function loadCredits() {
  pending ??= fetch("/world/credits.json")
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json() as Promise<WorldCredits>;
    })
    .then(creditSections)
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}

function External({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function PackCredit({ pack }: { pack: AssetAcknowledgement }) {
  return (
    <li>
      <h4>{pack.pack}</h4>
      <p>
        By <External href={pack.authorUrl}>{pack.author}</External> ·{" "}
        <External href={pack.licenseUrl}>{pack.license}</External> ·{" "}
        <External href={pack.source}>Source</External>
      </p>
      <p className="world-credits-used">Used: {pack.used.join(", ")}</p>
    </li>
  );
}

/**
 * The guide's Credits tab (S4): gentle-stream's music engine first, Bruno
 * Simon's inspiration, then every external asset pack from
 * /world/credits.json. The site's own procedural work stays in that file and
 * is not listed here as a third-party credit.
 */
export function CreditsList() {
  const [credits, setCredits] = useState<CreditSections | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadCredits()
      .then((sections) => live && setCredits(sections))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed)
    return (
      <p role="alert">
        Credits could not load. They are also in{" "}
        <a href="/world/credits.json">/world/credits.json</a>.
      </p>
    );
  if (!credits) return <p role="status">Loading credits…</p>;
  return (
    <div className="world-credits">
      <section aria-labelledby="world-credits-music">
        <h3 id="world-credits-music">Music</h3>
        {credits.music.map((music) => (
          <div key={music.engineUrl} className="world-credits-feature">
            <h4>
              <External href={music.engineUrl}>{music.name}</External>
            </h4>
            <p>
              The procedural music engine behind the {music.tracks.length} local
              loops: {music.tracks.join(", ")}. By {music.author} ·{" "}
              <External href={music.licenseUrl}>{music.license}</External> ·{" "}
              <External href={music.manifestUrl}>Track manifest</External>
            </p>
          </div>
        ))}
      </section>
      <section aria-labelledby="world-credits-inspiration">
        <h3 id="world-credits-inspiration">Inspiration</h3>
        <div className="world-credits-feature">
          <h4>
            <External href={BRUNO_INSPIRATION.url}>
              {BRUNO_INSPIRATION.name}
            </External>
          </h4>
          <p>{BRUNO_INSPIRATION.note}</p>
        </div>
      </section>
      <section aria-labelledby="world-credits-assets">
        <h3 id="world-credits-assets">Assets</h3>
        <ul>
          {credits.assets.map((pack) => (
            <PackCredit key={pack.id} pack={pack} />
          ))}
        </ul>
      </section>
    </div>
  );
}
