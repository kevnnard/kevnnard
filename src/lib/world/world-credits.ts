// The guide's Credits tab (world-game-menu T1, S4/L4): a curated view of
// public/world/credits.json. It thanks gentle-stream for the music, Bruno
// Simon for inspiration and his reused room files, and every external pack's
// author. The site's own procedural work (`original`) stays in the manifest
// for provenance but is not listed as a third-party acknowledgement.

import type { Credits, SourceFile } from "./credits.ts";

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

/**
 * A public-domain artwork shown on a story card (katana-wall-shelf T11),
 * downloaded from Wikimedia Commons and resized for the card.
 */
export interface ImageCredit {
  /** Shipped file, relative to public/world/. */
  file: string;
  title: string;
  artist: string;
  /** As the Commons file page states it. */
  date: string;
  license: string;
  /** The Commons file page. */
  source: string;
  /** Where the public-domain status was read, and the exact words. */
  licenseEvidence: { url: string; quote: string };
  bytes: number;
  sha256: string;
  sourceFiles: SourceFile[];
}

/**
 * A data service whose files ship with the site (tv-home-screen T4): TMDB's
 * film posters on the living-room TV, fetched once at prepare time by
 * scripts/prepare-tv-covers.mjs. Nothing calls the service at runtime.
 */
export interface ServiceCredit {
  id: string;
  name: string;
  url: string;
  /** The attribution the service requires, verbatim. */
  notice: string;
  /** What the site uses it for. */
  usage: string;
  /** Who owns the shipped files and on what terms they are shown. */
  rights: string;
  /** Shipped folder, relative to public/world/. */
  files: string;
  count: number;
  script: string;
}

export interface WorldCredits extends Credits {
  music?: MusicCredit[];
  ambient?: AmbientCredit[];
  images?: ImageCredit[];
  services?: ServiceCredit[];
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

export interface ImageAcknowledgement {
  title: string;
  artist: string;
  date: string;
  license: string;
  source: string;
}

export interface ServiceAcknowledgement {
  name: string;
  url: string;
  notice: string;
  usage: string;
  rights: string;
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
  images: ImageAcknowledgement[];
  services: ServiceAcknowledgement[];
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
  const images = (credits.images ?? []).map((entry) => ({
    title: entry.title,
    artist: entry.artist,
    date: entry.date,
    license: entry.license,
    source: entry.source,
  }));
  const services = (credits.services ?? []).map((entry) => ({
    name: entry.name,
    url: entry.url,
    notice: entry.notice,
    usage: entry.usage,
    rights: entry.rights,
  }));
  return { music, ambient, assets, images, services };
}
