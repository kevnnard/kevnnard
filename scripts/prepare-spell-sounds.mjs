// Download verified CC0 sources, pin their bytes, and derive small local clips.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const output = "public/world/audio/spell";
await mkdir(output, { recursive: true });
const cache = await mkdtemp("node_modules/.cache/spell-prepare-");
const sources = [
  {
    id: "swish",
    author: "pyranostudios",
    page: "https://opengameart.org/content/air-whoosh",
    url: "https://opengameart.org/sites/default/files/whoosh2_0.wav",
    hash: "d3fbff5bb78b289af16b2dfa29083f07ef83b0cbaff4514c48dfda16d082b468",
    duration: 0.65,
    offset: 0.3,
    filter: "",
  },
  {
    id: "burst",
    author: "JaggedStone",
    page: "https://opengameart.org/content/magic-spell-sfx",
    url: "https://opengameart.org/sites/default/files/magical_4.ogg",
    hash: "b7862d109b4013dfb2a389a10f8917203beb0efc458444bc5a1b8ada605cc118",
    duration: 2.4,
    offset: 0,
    filter: "",
  },
  {
    id: "ambience",
    author: "JaggedStone",
    page: "https://opengameart.org/content/magic-spell-sfx",
    url: "https://opengameart.org/sites/default/files/magical_7_0.ogg",
    hash: "2817da4f5df69ff993baffd6594a2f2a069f85ee2a02019f97db2246e350a76b",
    duration: 2.1,
    offset: 0,
    filter: "asetrate=32000,aresample=44100,lowpass=f=1800,",
  },
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sounds = [];
for (const source of sources) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha(bytes) !== source.hash)
    throw new Error(`${source.id}: source hash mismatch`);
  const input = join(cache, source.url.split("/").pop());
  await writeFile(input, bytes);
  const files = [];
  for (const ext of ["ogg", "mp3"]) {
    const file = `${output}/${source.id}.${ext}`;
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(source.offset),
      "-i",
      input,
      "-t",
      String(source.duration),
      "-af",
      `${source.filter}loudnorm=I=-18:TP=-2:LRA=7,afade=t=in:d=0.035,afade=t=out:st=${source.duration - 0.2}:d=0.2`,
      "-ac",
      "1",
      "-ar",
      "44100",
      "-map_metadata",
      "-1",
      ...(ext === "ogg"
        ? ["-c:a", "libvorbis", "-q:a", "3"]
        : ["-c:a", "libmp3lame", "-b:a", "96k"]),
      file,
    ]);
    const derived = await readFile(file);
    if (derived.length >= 100000) throw new Error(`${file}: over budget`);
    files.push({
      file: `/world/audio/spell/${source.id}.${ext}`,
      bytes: derived.length,
      sha256: sha(derived),
    });
  }
  sounds.push({
    id: source.id,
    author: source.author,
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: source.page,
    sourceFile: source.url,
    sourceSha256: source.hash,
    licenseEvidence: { url: source.page, quote: "License(s): CC0" },
    files,
  });
  process.stdout.write(`${source.id} ${JSON.stringify(files)}\n`);
}
await writeFile(
  `${output}/manifest.json`,
  `${JSON.stringify({ sounds }, null, 2)}\n`,
);
process.stdout.write(
  "CC0 source evidence: Air whoosh by pyranostudios; Magic Spell SFX by JaggedStone, OpenGameArt.\n",
);
