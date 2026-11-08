#!/usr/bin/env node
// Prepare the owner's two photos of Cherry for her card in /world
// (cherry-photos T1, S2): auto-oriented, converted to sRGB, resized to two
// widths each (a long edge of 1200 px and a smaller variant for the card's
// srcset), encoded as WebP with every EXIF, XMP, IPTC, GPS and ICC block
// stripped, into public/world/cherry/, with a manifest of the sources'
// sha256 and the outputs' sizes.
//
// Usage:
//   node scripts/prepare-cherry-photos.mjs [cheery-1.jpg] [cherry-2.jpg]
// The sources default to ~/Downloads/cherry-from-mac/; they are the owner's
// own photos (copied from their Mac) and are not committed. Each is checked
// against its pinned sha256, so a rerun reproduces the shipped files.
//
// Needs ImageMagick 7 (`magick`) with WebP and lcms, and an sRGB ICC profile
// (SRGB_ICC, or the first of SRGB_CANDIDATES that exists): the patio photo
// is tagged Adobe RGB (1998) and is converted before its profile is dropped.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/world/cherry");
const MANIFEST = join(OUT, "manifest.json");
const SOURCES = join(homedir(), "Downloads/cherry-from-mac");
const QUALITY = 80;

const SRGB_CANDIDATES = [
  "/usr/share/color/icc/colord/sRGB.icc",
  "/usr/share/ghostscript/iccprofiles/srgb.icc",
  "/usr/share/color/icc/sRGB.icc",
];

/** The photos, in card order; `sizes` are long edges in px. */
const PHOTOS = [
  {
    id: "cherry-patio",
    source: "cheery-1.jpg",
    sha256: "e4674bba9fbbbc1eb36e5722555dd5547f86547a19ea4ad2e9b57b1c2afead7b",
    sizes: [640, 1200],
  },
  {
    id: "cherry-blanket",
    source: "cherry-2.jpg",
    sha256: "02c25a5aae336b0afd9f16be127059f5eb18bc94f0d0e1c6f506f0c0407b8fd3",
    sizes: [640, 1200],
  },
];

function magick(args) {
  const run = spawnSync("magick", args, { encoding: "utf8" });
  if (run.status !== 0)
    throw new Error(`magick ${args[0]} failed: ${run.stderr.trim()}`);
  return run.stdout;
}

const say = (line) => process.stdout.write(`${line}\n`);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function srgbProfile() {
  const path =
    process.env.SRGB_ICC ?? SRGB_CANDIDATES.find((file) => existsSync(file));
  if (!path || !existsSync(path))
    throw new Error("No sRGB ICC profile found: set SRGB_ICC.");
  return path;
}

const args = process.argv.slice(2);
const srgb = srgbProfile();
mkdirSync(OUT, { recursive: true });

const manifest = {
  generator: "scripts/prepare-cherry-photos.mjs",
  note: "The owner's own photos of Cherry; sources are not committed.",
  photos: [],
};

for (const [index, photo] of PHOTOS.entries()) {
  const input = resolve(args[index] ?? join(SOURCES, photo.source));
  const bytes = readFileSync(input);
  const hash = sha256(bytes);
  if (hash !== photo.sha256)
    throw new Error(
      `${photo.source}: sha256 ${hash}, expected ${photo.sha256}`,
    );
  // Read as JPEG only, whatever the bytes claim to be.
  const source = `jpeg:${input}`;
  const [width, height] = magick(["identify", "-format", "%w %h", source])
    .split(" ")
    .map(Number);
  const tagged = magick(["identify", "-format", "%[profiles]", source]);

  const outputs = [];
  for (const size of photo.sizes) {
    const tmp = join(OUT, `${photo.id}.tmp.webp`);
    magick([
      source,
      "-auto-orient",
      // Convert from the embedded profile (Adobe RGB) to sRGB first; an
      // untagged photo is taken as sRGB already.
      ...(tagged.includes("icc") ? ["-profile", srgb] : []),
      "-resize",
      `${size}x${size}>`,
      "-strip",
      "-quality",
      String(QUALITY),
      "-define",
      "webp:method=6",
      `webp:${tmp}`,
    ]);
    const [w, h] = magick(["identify", "-format", "%w %h", `webp:${tmp}`])
      .split(" ")
      .map(Number);
    const left = magick(["identify", "-format", "%[profiles]", `webp:${tmp}`]);
    if (left.trim()) throw new Error(`${photo.id}: profiles left: ${left}`);
    // Named by width, as the card's srcset describes them.
    const name = `${photo.id}-${w}.webp`;
    renameSync(tmp, join(OUT, name));
    const data = readFileSync(join(OUT, name));
    outputs.push({
      file: `cherry/${name}`,
      width: w,
      height: h,
      bytes: data.length,
      sha256: sha256(data),
    });
    say(`${name}: ${w}x${h}, ${data.length} B`);
  }
  manifest.photos.push({
    id: photo.id,
    source: {
      file: photo.source,
      sha256: hash,
      bytes: bytes.length,
      width,
      height,
    },
    outputs,
  });
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
say(`wrote ${MANIFEST}`);
