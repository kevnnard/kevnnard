// The spoken "Expecto Patronum" (patronus T6): a short film clip the owner
// downloaded and chose to ship as a fan tribute (odd/tasks/patronus.md S7).
// Usage: node scripts/prepare-spell-voice.mjs <copy of the download>.mp3
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const SOURCE_SHA256 =
  "59fe9187dd96f9f91bf4f3272de26b6ebdbf023728bf8bdc77f1921b12e8adc4";
/** Skip the lead-in whoosh; the words start right after. */
const OFFSET = 0.9;
const DURATION = 3.5;
const output = "public/world/audio/spell/voice.mp3";

const input = process.argv[2];
if (!input) throw new Error("usage: prepare-spell-voice.mjs <source.mp3>");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sha(await readFile(input)) !== SOURCE_SHA256)
  throw new Error("source hash mismatch");
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-ss",
  String(OFFSET),
  "-i",
  input,
  "-t",
  String(DURATION),
  "-af",
  `loudnorm=I=-16:TP=-1.5:LRA=7,afade=t=in:d=0.04,afade=t=out:st=${DURATION - 0.5}:d=0.5`,
  "-ac",
  "1",
  "-ar",
  "44100",
  "-map_metadata",
  "-1",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "96k",
  output,
]);
const bytes = await readFile(output);
process.stdout.write(
  `wrote ${output} ${bytes.length} bytes sha256 ${sha(bytes)}\n`,
);
