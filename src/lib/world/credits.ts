// Credits for every downloaded asset the world ships (S4: credit every author,
// even under CC0). public/world/credits.json is written by
// scripts/prepare-world.py; the UI reads it and the tests validate it here.

export const ALLOWED_LICENSES: readonly string[] = [
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
];

/**
 * Bruno Simon's my-room-in-3d has no license file: its effects are used with
 * the author's permission, given by private message to the site owner
 * (odd/tasks/stylized-house.md L25). Accepted for that author and repository
 * only.
 */
export const PERMISSION_LICENSE =
  "used with the author's permission (private message to the site owner)";
const PERMISSION_AUTHOR = "Bruno Simon";
const PERMISSION_REPOSITORY = "/brunosimon/my-room-in-3d/";

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
  // StylizedTextures: the site, and the Drive files its catalog links to.
  "stylizedtextures.com",
  "drive.google.com",
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

/** One shipped texture map (T4e). */
export interface TextureCredit extends CreditEntry {
  map: string;
  width: number;
  height: number;
  /** Mean linear RGB, color maps only: the runtime normalizes by it. */
  meanLinear?: [number, number, number];
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
  /** Official pages it was modelled from (no download), https only (T12). */
  references?: string[];
}

/** Code or shaders ported from a permitted author (T4i). */
export interface PortedCredit {
  id: string;
  asset: string;
  author: string;
  license: string;
  source: string;
  /** Repository-relative file holding the port. */
  port: string;
  sourceFiles: SourceFile[];
}

export interface Credits {
  packs: CreditPack[];
  assets: CreditEntry[];
  textures?: TextureCredit[];
  original?: OriginalCredit[];
  ported?: PortedCredit[];
  /** Bruno Simon's chair maps and LED mask (T4k), under public/world/bruno/. */
  maps?: TextureCredit[];
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

function permittedUrl(url: string): boolean {
  return (
    officialHttps(url) &&
    new URL(url).pathname.startsWith(PERMISSION_REPOSITORY) &&
    ["github.com", "raw.githubusercontent.com"].includes(new URL(url).hostname)
  );
}

/** An allowed open license, or the permission license for its one author and repository. */
export function licenseAllowed(entry: {
  license: string;
  author: string;
  source: string;
  sourceFiles?: SourceFile[];
}): boolean {
  if (ALLOWED_LICENSES.includes(entry.license)) return true;
  return (
    entry.license === PERMISSION_LICENSE &&
    entry.author === PERMISSION_AUTHOR &&
    permittedUrl(entry.source) &&
    (entry.sourceFiles ?? []).every((file) => permittedUrl(file.url))
  );
}

/** Every reason the credits are incomplete; empty when they are valid. */
export function creditProblems(credits: Credits): string[] {
  const problems: string[] = [];
  const packs = new Set(credits.packs.map((pack) => pack.id));
  const seen = new Set<string>();
  for (const entry of [
    ...credits.assets,
    ...(credits.textures ?? []),
    ...(credits.maps ?? []),
  ]) {
    const name = entry.file;
    if (seen.has(name)) {
      problems.push(`${name}: credited twice`);
      continue;
    }
    seen.add(name);
    if (!entry.author?.trim()) problems.push(`${name}: missing author`);
    else if (!licenseAllowed(entry))
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
    else if (
      (entry.references ?? []).some((url) => !url.startsWith("https://"))
    )
      problems.push(`${entry.id}: references must be https pages`);
  }
  for (const entry of credits.ported ?? []) {
    if (!entry.author?.trim()) problems.push(`${entry.id}: missing author`);
    else if (!licenseAllowed(entry) || entry.sourceFiles.length === 0)
      problems.push(`${entry.id}: license ${entry.license} is not allowed`);
    else if (!entry.port.startsWith("src/"))
      problems.push(`${entry.id}: port must be a repository file`);
  }
  return problems;
}
