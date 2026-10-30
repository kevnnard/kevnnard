// The guide's Credits tab (world-game-menu T1, S4/L4): a curated view of
// public/world/credits.json. It thanks gentle-stream for the music, Bruno
// Simon for inspiration and his reused room files, and every external pack's
// author. The site's own procedural work (`original`) stays in the manifest
// for provenance but is not listed as a third-party acknowledgement.

import type { Credits } from "./credits.ts";

/** The music entry written by scripts/prepare-world.py. */
export interface MusicCredit {
  id: string;
  asset: string;
  author: string;
  engine: string;
  engineLicense: string;
  /** Relative to public/world/. */
  engineLicenseFile: string;
  engineCopyright: string;
  generator: string;
  /** Relative to public/world/. */
  manifest: string;
  files: string[];
  note: string;
}

/** A CC0 ambient event sound, mirrored from audio/ambient/manifest.json. */
export interface AmbientCredit {
  id: string;
  event: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  /** Site path under /world/audio/ambient/. */
  file: string;
  bytes: number;
  sha256: string;
}

export interface WorldCredits extends Credits {
  music?: MusicCredit[];
  ambient?: AmbientCredit[];
}

export interface MusicAcknowledgement {
  name: string;
  author: string;
  license: string;
  licenseUrl: string;
  engineUrl: string;
  manifestUrl: string;
  copyright: string;
  tracks: string[];
}

export interface AmbientAcknowledgement {
  /** The event label, e.g. "Night owl". */
  name: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  file: string;
}

export interface AssetAcknowledgement {
  id: string;
  pack: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
  source: string;
  /** Shipped files and ported code, by name. */
  used: string[];
}

export interface CreditSections {
  music: MusicAcknowledgement[];
  ambient: AmbientAcknowledgement[];
  assets: AssetAcknowledgement[];
}

/** Inspiration only for parts; the reused files are listed under assets. */
export const BRUNO_INSPIRATION = {
  name: "Bruno Simon",
  url: "https://bruno-simon.com",
  note: "Inspiration for parts of this world, such as the cozy desk room. His reused room files are credited below with the permission recorded for them; the rest of the world is not his work.",
} as const;

const GENTLE_STREAM = "gentle-stream";

/** "Copyright (c) 2026 Alan Buscaglia (Gentleman Programming)" → the holder. */
const holder = (copyright: string) =>
  copyright.replace(/^Copyright \(c\) \d{4}\s+/, "");

/** "audio/cafe-drift.m4a" → "Cafe Drift". */
const trackName = (file: string) =>
  (file.split("/").pop() ?? file)
    .replace(/\.[^.]+$/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/** "night owl" → "Night owl". */
const eventLabel = (event: string) =>
  event.charAt(0).toUpperCase() + event.slice(1);

export function creditSections(credits: WorldCredits): CreditSections {
  const music = (credits.music ?? []).map((entry) => ({
    name: GENTLE_STREAM,
    author: holder(entry.engineCopyright),
    license: entry.engineLicense,
    licenseUrl: `/world/${entry.engineLicenseFile}`,
    engineUrl: entry.engine,
    manifestUrl: `/world/${entry.manifest}`,
    copyright: entry.engineCopyright,
    tracks: entry.files.map(trackName),
  }));
  const ambient = (credits.ambient ?? []).map((entry) => ({
    name: eventLabel(entry.event),
    author: entry.author,
    license: entry.license,
    licenseUrl: entry.licenseUrl,
    source: entry.source,
    file: entry.file,
  }));
  const files = [
    ...credits.assets,
    ...(credits.textures ?? []),
    ...(credits.maps ?? []),
  ];
  const ported = credits.ported ?? [];
  const assets = credits.packs.map((pack) => {
    const used = [
      ...new Set(
        files
          .filter((entry) => entry.pack === pack.id)
          .map((entry) => entry.asset),
      ),
    ];
    // Ported code carries no pack id: it belongs to the pack whose
    // repository it was ported from.
    const ports = ported
      .filter((entry) =>
        entry.source.startsWith(pack.source.split("/tree/")[0]),
      )
      .map((entry) => `${entry.asset} (ported code)`);
    return {
      id: pack.id,
      pack: pack.pack,
      author: pack.author,
      authorUrl: pack.authorUrl,
      license: pack.license,
      licenseUrl: pack.licenseUrl,
      source: pack.source,
      used: [...used, ...ports],
    };
  });
  return { music, ambient, assets };
}
