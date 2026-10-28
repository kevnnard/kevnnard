// Credits for every downloaded asset the world ships (S4: credit every author,
// even under CC0). public/world/credits.json is written by
// scripts/prepare-world.py; the UI reads it and the tests validate it here.

export const ALLOWED_LICENSES: readonly string[] = [
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
];

/** Official distribution hosts only: the packs' own sites and repositories. */
export const OFFICIAL_HOSTS: readonly string[] = [
  "github.com",
  "raw.githubusercontent.com",
  "kaylousberg.com",
  "kaylousberg.itch.io",
  "quaternius.com",
  "poly.pizza",
  "static.poly.pizza",
  "kenney.nl",
];

export interface SourceFile {
  url: string;
  bytes: number;
  sha256: string;
}

export interface CreditPack {
  id: string;
  pack: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
  source: string;
  /** Where the license was read during the build, and the exact words. */
  licenseEvidence: { url: string; quote: string };
}

export interface CreditEntry {
  /** Shipped file, relative to public/world/. */
  file: string;
  asset: string;
  pack: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  bytes: number;
  sha256: string;
  sourceFiles: SourceFile[];
}

/** Work made for this project (no download): same license as the repository. */
export const ORIGINAL_LICENSE = "Original work (repository license)";

export interface OriginalCredit {
  id: string;
  asset: string;
  author: string;
  license: string;
  /** Repository-relative file that builds it. */
  source: string;
}

export interface Credits {
  packs: CreditPack[];
  assets: CreditEntry[];
  original?: OriginalCredit[];
}

function officialHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && OFFICIAL_HOSTS.includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/** Every reason the credits are incomplete; empty when they are valid. */
export function creditProblems(credits: Credits): string[] {
  const problems: string[] = [];
  const packs = new Set(credits.packs.map((pack) => pack.id));
  const seen = new Set<string>();
  for (const entry of credits.assets) {
    const name = entry.file;
    if (seen.has(name)) {
      problems.push(`${name}: credited twice`);
      continue;
    }
    seen.add(name);
    if (!entry.author?.trim()) problems.push(`${name}: missing author`);
    else if (!ALLOWED_LICENSES.includes(entry.license))
      problems.push(`${name}: license ${entry.license} is not allowed`);
    else if (!packs.has(entry.pack))
      problems.push(`${name}: unknown pack ${entry.pack}`);
    else if (
      !officialHttps(entry.source) ||
      !entry.sourceFiles.every((file) => officialHttps(file.url))
    )
      problems.push(`${name}: source is not an official https URL`);
  }
  for (const entry of credits.original ?? []) {
    if (!entry.author?.trim()) problems.push(`${entry.id}: missing author`);
    else if (entry.license !== ORIGINAL_LICENSE)
      problems.push(`${entry.id}: original work must use ${ORIGINAL_LICENSE}`);
    else if (!entry.source.startsWith("src/"))
      problems.push(`${entry.id}: source must be a repository file`);
  }
  return problems;
}
