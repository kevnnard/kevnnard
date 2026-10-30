#!/usr/bin/env python3
"""Generate the /world speaker music: five looping tracks rendered offline by gentle-stream.

odd/tasks/world-speaker-music.md T1 (S1, S3-S5, L5-L6). The gentle-stream engine
(https://github.com/Gentleman-Programming/gentle-stream, MIT) is imported read-only
from a local checkout and rendered bar by bar with its procedural instruments: no
soundfont, no mood model, no audio device. Each track keeps the engine's first
full song-form cycle after the intro (A B A' breakdown B' release, 40 bars, ending
on the tonic cadence); the bar that follows it is crossfaded into the cycle's head
so the end flows into the start. The file holds one second of the cycle's end
before it and one second of its start after it, so the loop bounds land inside
continuous music even when a decoder keeps or drops the AAC priming frames.

Run with the checkout's own Python (3.13, numpy, scipy), from this repository:

    PYTHONDONTWRITEBYTECODE=1 ../gentle-lofi/.venv/bin/python -I -B \\
        scripts/generate-world-music.py --source ../gentle-lofi

Every write stays in node_modules/.cache/world/music/ (rendering, encoding,
decoding, metrics) until all five tracks verify; then the verified files are
published atomically into public/world/audio/ (manifest.json, <id>.m4a and the
engine's LICENSE). Existing different files are never replaced without --replace.
Encoding and decoding use macOS afconvert (native AAC).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "world" / "music"
OUTPUT = ROOT / "public" / "world" / "audio"
ENGINE_REPO = "https://github.com/Gentleman-Programming/gentle-stream"
AFCONVERT = "/usr/bin/afconvert"
LICENSE_FILE = "gentle-stream-LICENSE.txt"

INTRO_BARS = 4        # composer.FIRST_FORM opens with a 4-bar intro
CYCLE_BARS = 40       # composer.FORM: A 8, B 8, A' 8, breakdown 4, B' 8, release 4
CROSSFADE = 0.4       # seconds of the next cycle's start blended into the head
PAD = 1.0             # seconds of wrap-around music on each side of the loop
SEAM_WINDOW = 2048    # frames compared on each side of the wrap
BITRATE = 128_000
TARGET_RMS_DB = -19.0
PEAK_LIMIT = 0.79     # about -2 dBFS before encoding, room for AAC overshoot

# Fixed seeds and styles (gentle_stream.style.Style fields, all inside its bounds).
TRACKS = [
    {"id": "cafe-drift", "title": "Cafe Drift", "genre": "Cafe lo-fi", "seed": 20261101,
     "style": {"name": "Cafe Drift", "mood": "warm cafe, rain on the window, coding slowly",
               "genre": "lofi", "key": "F", "mode": "major", "bpm": 80, "progression": [2, 5, 1, 6],
               "chords": "rhodes", "lead": "piano", "drums": "lofi", "energy": 0.4, "brightness": 0.48,
               "swing": 0.12, "vinyl": 0.55, "space": 0.5, "lead_density": 0.45}},
    {"id": "ambient-focus", "title": "Ambient Focus", "genre": "Ambient focus", "seed": 20261102,
     "style": {"name": "Ambient Focus", "mood": "calm deep focus, slow light",
               "genre": "ambient", "key": "A", "mode": "lydian", "bpm": 76, "progression": [1, 2, 5, 1],
               "chords": "pad", "lead": "nylon", "drums": "none", "energy": 0.25, "brightness": 0.4,
               "swing": 0.0, "vinyl": 0.0, "space": 0.8, "lead_density": 0.3}},
    {"id": "velvet-jazz", "title": "Velvet Jazz", "genre": "Velvet jazz", "seed": 20261103,
     "style": {"name": "Velvet Jazz", "mood": "late lounge, brushed drums, soft keys",
               "genre": "jazz", "key": "A#", "mode": "dorian", "bpm": 84, "progression": [1, 4, 1, 4],
               "chords": "piano", "lead": "rhodes", "drums": "soft", "energy": 0.35, "brightness": 0.5,
               "swing": 0.2, "vinyl": 0.25, "space": 0.45, "lead_density": 0.5}},
    {"id": "soft-circuit", "title": "Soft Circuit", "genre": "Soft chill electronic", "seed": 20261104,
     "style": {"name": "Soft Circuit", "mood": "soft neon, gentle synths, relaxed night drive",
               "genre": "synthwave", "key": "E", "mode": "minor", "bpm": 82, "progression": [1, 6, 3, 7],
               "chords": "pad", "lead": "rhodes", "drums": "soft", "energy": 0.3, "brightness": 0.4,
               "swing": 0.05, "vinyl": 0.0, "space": 0.6, "lead_density": 0.4}},
    {"id": "midnight-code", "title": "Midnight Code", "genre": "Midnight lo-fi", "seed": 20261105,
     "style": {"name": "Midnight Code", "mood": "dark quiet room, late night coding",
               "genre": "lofi", "key": "C#", "mode": "minor", "bpm": 78, "progression": [1, 4, 7, 3],
               "chords": "piano", "lead": "rhodes", "drums": "lofi", "energy": 0.35, "brightness": 0.32,
               "swing": 0.14, "vinyl": 0.6, "space": 0.6, "lead_density": 0.35}},
]


def inside(path: Path, base: Path) -> Path:
    """`path` resolved, refusing anything outside `base`."""
    resolved = path.resolve()
    resolved.relative_to(base.resolve())
    return resolved


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic_write(path: Path, data: bytes, base: Path) -> None:
    path = inside(path, base)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = inside(path.with_name("." + path.name + ".tmp"), base)
    tmp.write_bytes(data)
    os.replace(tmp, path)


def git(source: Path, *args: str) -> str:
    # --no-optional-locks: `status` must not refresh the source index (no writes there)
    return subprocess.run(["git", "--no-optional-locks", "-C", str(source), *args],
                          capture_output=True, text=True, check=True).stdout


def fingerprint(source: Path) -> dict:
    """The source checkout's commit, status and every file under src/ plus LICENSE and pyproject.toml."""
    files = {}
    for path in sorted([*(source / "src").rglob("*"), source / "LICENSE", source / "pyproject.toml"]):
        if path.is_file():
            files[str(path.relative_to(source))] = sha256(path.read_bytes())
    return {"commit": git(source, "rev-parse", "HEAD").strip(),
            "status": git(source, "status", "--porcelain", "--untracked-files=all"),
            "files": sha256(json.dumps(files, sort_keys=True).encode()), "count": len(files)}


def load_engine(source: Path):
    # Isolate the engine: no audio device, no soundfont renderer, caches inside this repository.
    for name in ("XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"):
        os.environ[name] = str(inside(CACHE / "xdg" / name.split("_")[1].lower(), CACHE))
    sys.modules["sounddevice"] = None   # importing it now fails: nothing can open PortAudio
    sys.modules["fluidsynth"] = None    # procedural instruments only
    sys.path.insert(0, str(source / "src"))
    from gentle_stream import composer
    from gentle_stream.engine import Engine
    from gentle_stream.style import Style
    from gentle_stream.synth import SR
    return Engine, Style, SR, composer


def render(spec: dict, Engine, Style, SR: int, composer, np) -> tuple:
    style = Style.from_dict(spec["style"])
    applied = style.to_dict()
    for key, value in spec["style"].items():
        if applied[key] != value:
            raise ValueError(f"{spec['id']}: style field {key} became {applied[key]!r}, not {value!r}")
    engine = Engine(style, seed=spec["seed"], samples=False)
    if engine.backend != "procedural":
        raise RuntimeError(f"{spec['id']}: backend {engine.backend}")
    form = [name for name, n in composer.FIRST_FORM for _ in range(n)]
    if (len(form), sum(n for _, n in composer.FORM)) != (INTRO_BARS + CYCLE_BARS, CYCLE_BARS):
        raise RuntimeError("gentle-stream song form changed")
    bar = int(round(engine.bar_seconds * SR))
    bars = [engine.render_bar() for _ in range(INTRO_BARS + CYCLE_BARS + 1)]
    sections = [engine.composer.plan(i).section for i in range(len(bars))]
    if sections[INTRO_BARS] != "A" or sections[-2] != "release" or sections[-1] != "A":
        raise RuntimeError(f"{spec['id']}: unexpected sections {sections}")
    pcm = np.concatenate(bars).astype(np.float64)
    start, length, fade = INTRO_BARS * bar, CYCLE_BARS * bar, int(round(CROSSFADE * SR))
    cycle = pcm[start:start + length].copy()
    t = ((np.arange(fade) + 0.5) / fade)[:, None]
    # equal-power: the music after the release (with its reverb tail) hands over to the cycle's head
    cycle[:fade] = pcm[start:start + fade] * np.sin(np.pi / 2 * t) + \
        pcm[start + length:start + length + fade] * np.cos(np.pi / 2 * t)
    end, w = start + length, SEAM_WINDOW

    def level(x):
        return float(np.sqrt(np.mean(x ** 2)))

    # the engine's own uninterrupted transitions: release into the next A, and the head of the kept A
    natural = {"seamRms": level(pcm[end:end + w]) / level(pcm[end - w:end]),
               "crossfadeRms": level(pcm[start:start + fade]) / level(pcm[start + fade:start + 2 * fade])}
    rms = level(cycle)
    gain = min(10 ** (TARGET_RMS_DB / 20) / rms, PEAK_LIMIT / float(np.max(np.abs(cycle))))
    cycle *= gain
    meta = {"bars": CYCLE_BARS, "renderedBars": len(bars), "barFrames": bar, "bpm": style.bpm,
            "sections": sections, "gain": round(gain, 6), "sourceRmsDb": round(float(20 * np.log10(rms)), 2),
            "style": applied, "pieceSeed": engine.seed}
    return cycle, meta, natural


def zero_times(data: bytes) -> bytes:
    """The m4a with its mvhd/tkhd/mdhd creation and modification times set to 0: reproducible bytes."""
    out = bytearray(data)

    def walk(start: int, end: int) -> None:
        at = start
        while at + 8 <= end:
            size = int.from_bytes(out[at:at + 4], "big")
            kind = bytes(out[at + 4:at + 8])
            if size < 8 or at + size > end:
                raise RuntimeError(f"malformed MP4 box {kind!r}")
            if kind in (b"moov", b"trak", b"mdia"):
                walk(at + 8, at + size)
            elif kind in (b"mvhd", b"tkhd", b"mdhd"):
                width = 8 if out[at + 8] == 1 else 4
                out[at + 12:at + 12 + 2 * width] = bytes(2 * width)
            at += size

    walk(0, len(out))
    return bytes(out)


def write_wav(path: Path, pcm, SR: int, np) -> None:
    from scipy.io import wavfile
    wavfile.write(inside(path, CACHE), SR, pcm.astype(np.float32))


def run(command: list[str], log) -> None:
    log.write("$ " + " ".join(command) + "\n")
    done = subprocess.run(command, capture_output=True, text=True)
    log.write(done.stdout + done.stderr)
    if done.returncode:
        raise RuntimeError(f"{command[0]} failed ({done.returncode}): {done.stderr.strip()}")


def measure(decoded, cycle, padded, frames: int, natural: dict, SR: int, np) -> dict:
    """Seam, level and alignment metrics of the decoded file against the padded source."""
    lag = 4096
    ref = padded[:4 * SR, 0]
    got = decoded[:4 * SR + lag, 0]
    scores = [float(np.dot(ref[:len(ref) - lag], got[k:k + len(ref) - lag])) for k in range(lag)]
    offset = int(np.argmax(scores))
    a = int(round(PAD * SR)) + offset
    b = a + frames
    loop = decoded[a:b]
    steps = np.abs(np.diff(loop, axis=0))
    wrap = float(np.max(np.abs(decoded[a] - decoded[b - 1])))
    w = SEAM_WINDOW

    def rms(x):
        return float(np.sqrt(np.mean(x ** 2)))

    x = int(round(CROSSFADE * SR))
    win = SR
    quiet = [rms(loop[i:i + win]) for i in range(0, len(loop) - win + 1, win)]
    src_steps = np.abs(np.diff(cycle, axis=0))
    return {
        "decodeOffsetFrames": offset,
        "loopStartFrame": a,
        "loopEndFrame": b,
        "peak": round(float(np.max(np.abs(decoded))), 5),
        "rmsDb": round(float(20 * np.log10(rms(loop))), 2),
        "clippedSamples": int(np.sum(np.abs(decoded) >= 0.999)),
        "nonFinite": int(np.sum(~np.isfinite(decoded))),
        "silentWindows": int(sum(q < 10 ** (-50 / 20) for q in quiet)),
        "quietestSecondDb": round(float(20 * np.log10(min(quiet))), 2),
        # the wrap step against the loop's 99.9th-percentile neighbouring-sample step
        "seamStepRatio": round(wrap / float(np.percentile(steps, 99.9)), 4),
        # after the wrap the decoder plays what the file holds after loopEnd: the same music
        "seamErrorDb": round(float(20 * np.log10(rms(decoded[a:a + w] - decoded[b:b + w]) / rms(decoded[b:b + w]))), 2),
        "seamErrorBeforeDb": round(float(20 * np.log10(rms(decoded[a - w:a] - decoded[b - w:b]) / rms(decoded[b - w:b]))), 2),
        # level change across the wrap (and over the crossfade) relative to the same change in the engine's
        # continuous render: 1 means the seam moves like the uninterrupted music
        "seamRmsRatio": round(rms(decoded[a:a + w]) / rms(decoded[b - w:b]) / natural["seamRms"], 4),
        "crossfadeRmsRatio": round(rms(loop[:x]) / rms(loop[x:2 * x]) / natural["crossfadeRms"], 4),
        "sourceSeamStepRatio": round(float(np.max(np.abs(cycle[0] - cycle[-1]))) / float(np.percentile(src_steps, 99.9)), 4),
        "sourcePeak": round(float(np.max(np.abs(cycle))), 5),
    }


def features(loop, SR: int, np):
    """Mean log band energies and chroma of the mono loop, as one unit vector."""
    mono = loop.mean(axis=1)
    n = 8192
    frames = mono[:len(mono) // n * n].reshape(-1, n) * np.hanning(n)
    spec = (np.abs(np.fft.rfft(frames, axis=1)) ** 2).mean(axis=0)
    freqs = np.fft.rfftfreq(n, 1 / SR)
    edges = np.geomspace(40, 16000, 25)
    bands = np.log10([spec[(freqs >= lo) & (freqs < hi)].sum() + 1e-12 for lo, hi in zip(edges[:-1], edges[1:])])
    bands = bands - bands.mean()
    keep = (freqs > 60) & (freqs < 2000)
    pcs = np.round(12 * np.log2(freqs[keep] / 440.0)).astype(int) % 12
    chroma = np.bincount(pcs, weights=spec[keep], minlength=12)
    chroma = chroma / chroma.sum()
    vec = np.concatenate([bands / np.linalg.norm(bands), (chroma - chroma.mean()) / np.linalg.norm(chroma - chroma.mean())])
    return vec / np.linalg.norm(vec)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", required=True, type=Path, help="read-only gentle-stream checkout")
    parser.add_argument("--replace", action="store_true", help="replace different published files")
    args = parser.parse_args()
    source = args.source.resolve()
    if not (source / "src" / "gentle_stream" / "engine.py").is_file():
        raise SystemExit(f"not a gentle-stream checkout: {source}")
    if sys.version_info < (3, 13):
        raise SystemExit("gentle-stream needs Python 3.13")
    if not Path(AFCONVERT).is_file():
        raise SystemExit("afconvert (macOS native AAC) is required; no fallback encoder is used")
    import numpy as np

    stage = inside(CACHE / "stage", CACHE)
    stage.mkdir(parents=True, exist_ok=True)
    before = fingerprint(source)
    Engine, Style, SR, composer = load_engine(source)
    license_bytes = (source / "LICENSE").read_bytes()
    copyright_line = next(line for line in license_bytes.decode().splitlines() if line.startswith("Copyright"))
    started = time.time()
    tracks, prov, metrics, vectors = [], {}, {}, {}
    with open(inside(stage / "generate.log", CACHE), "w", encoding="utf-8") as log:
        for spec in TRACKS:
            t0 = time.time()
            cycle, meta, natural = render(spec, Engine, Style, SR, composer, np)
            pad = int(round(PAD * SR))
            padded = np.concatenate([cycle[-pad:], cycle, cycle[:pad]])
            wav = stage / f"{spec['id']}.source.wav"
            m4a = stage / f"{spec['id']}.m4a"
            dec = stage / f"{spec['id']}.decoded.wav"
            write_wav(wav, padded, SR, np)
            run([AFCONVERT, "-f", "m4af", "-d", "aac", "-b", str(BITRATE), "-s", "0", "-q", "127",
                 str(inside(wav, CACHE)), str(inside(m4a, CACHE))], log)
            inside(m4a, CACHE).write_bytes(zero_times(m4a.read_bytes()))
            run([AFCONVERT, "-f", "WAVE", "-d", "LEF32", str(inside(m4a, CACHE)), str(inside(dec, CACHE))], log)
            from scipy.io import wavfile
            rate, decoded = wavfile.read(inside(dec, CACHE))
            if rate != SR or decoded.ndim != 2 or decoded.shape[1] != 2:
                raise RuntimeError(f"{spec['id']}: decoded {rate} Hz {decoded.shape}")
            decoded = decoded.astype(np.float64)
            data = m4a.read_bytes()
            m = measure(decoded, cycle, padded, len(cycle), natural, SR, np)
            m.update({"sha256": sha256(data), "sampleRate": SR, "channels": 2, "decodedFrames": len(decoded),
                      "sourceFrames": len(padded), "loopFrames": len(cycle), "crossfadeSeconds": CROSSFADE,
                      "bitrate": BITRATE})
            vectors[spec["id"]] = features(decoded[m["loopStartFrame"]:m["loopEndFrame"]], SR, np)
            tracks.append({"id": spec["id"], "title": spec["title"], "genre": spec["genre"],
                           "file": f"/world/audio/{spec['id']}.m4a", "duration": round(len(decoded) / SR, 6),
                           "loopStart": round(m["loopStartFrame"] / SR, 6), "loopEnd": round(m["loopEndFrame"] / SR, 6),
                           "bytes": len(data), "sha256": m["sha256"]})
            prov[spec["id"]] = {"seed": spec["seed"], **meta}
            metrics[spec["id"]] = m
            log.write(json.dumps({spec["id"]: m, "seconds": round(time.time() - t0, 1)}) + "\n")
            log.flush()
            print(spec["id"], json.dumps(m), flush=True)
    ids = list(vectors)
    pairs = {f"{x}/{y}": round(1 - float(np.dot(vectors[x], vectors[y])), 4)
             for i, x in enumerate(ids) for y in ids[i + 1:]}
    after = fingerprint(source)
    if after != before:
        raise RuntimeError("the gentle-stream checkout changed while rendering")
    problems = [f"{k}: {v}" for k, v in metrics.items()
                if v["clippedSamples"] or v["nonFinite"] or v["silentWindows"] or v["seamErrorDb"] >= -20
                or v["seamStepRatio"] >= 1 or not 0.7 < v["seamRmsRatio"] < 1.4]
    if problems or min(pairs.values()) <= 0.05:
        (stage / "failed.json").write_text(json.dumps({"metrics": metrics, "pairs": pairs}, indent=2))
        raise RuntimeError("verification failed: " + "; ".join(problems) + f" pairs {pairs}")
    manifest = {
        "version": 1,
        "tracks": tracks,
        "license": {
            "engine": "gentle-stream", "spdx": "MIT", "file": f"/world/audio/{LICENSE_FILE}",
            "copyright": copyright_line,
            "note": ("The engine's MIT notice is copied unchanged. The audio was rendered by the engine for this "
                     "site; this manifest makes no further licensing claim about the recordings."),
        },
        "provenance": {
            "engine": {"name": "gentle-stream", "repository": ENGINE_REPO, "commit": before["commit"],
                       "checkoutClean": before["status"] == "", "sourceFingerprint": before["files"],
                       "sourceFiles": before["count"], "backend": "procedural", "soundfont": None,
                       "moodModel": None, "python": sys.version.split()[0], "numpy": np.__version__},
            "generator": "scripts/generate-world-music.py",
            "command": ("PYTHONDONTWRITEBYTECODE=1 <gentle-stream>/.venv/bin/python -I -B "
                        "scripts/generate-world-music.py --source <gentle-stream>"),
            "encoder": f"afconvert -f m4af -d aac -b {BITRATE} -s 0 -q 127 (macOS AudioToolbox)",
            "tracks": prov,
        },
        "transforms": [
            f"Rendered bars 0-{INTRO_BARS + CYCLE_BARS} with Engine(style, seed, samples=False).render_bar() at {SR} Hz stereo",
            f"Kept bars {INTRO_BARS}-{INTRO_BARS + CYCLE_BARS - 1}: one full song-form cycle (A B A' breakdown B' release)",
            f"Equal-power crossfade of {CROSSFADE} s from the following bar into the cycle's head",
            f"Gain to {TARGET_RMS_DB} dBFS RMS, peak at most {PEAK_LIMIT}",
            f"Wrapped {PAD} s of the cycle's end before it and {PAD} s of its start after it; loopStart/loopEnd mark the cycle",
            f"AAC-LC {BITRATE // 1000} kbps CBR in m4a, header times zeroed; loop bounds measured on the afconvert-decoded PCM",
        ],
        "metrics": {
            "note": ("Measured by the generator on afconvert-decoded PCM of these exact files; they record that run "
                     "and are not a listening test."),
            "tracks": metrics,
            "pairwiseDistance": pairs,
            "minPairwiseDistance": min(pairs.values()),
        },
    }
    publish = {LICENSE_FILE: license_bytes, **{f"{t['id']}.m4a": (stage / f"{t['id']}.m4a").read_bytes() for t in tracks},
               "manifest.json": (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode()}
    (stage / "manifest.json").write_bytes(publish["manifest.json"])
    for name, data in publish.items():
        target = inside(OUTPUT / name, OUTPUT)
        if target.exists() and target.read_bytes() != data and not args.replace:
            raise SystemExit(f"{target} exists with other content; rerun with --replace")
    for name, data in publish.items():
        if not (OUTPUT / name).exists() or (OUTPUT / name).read_bytes() != data:
            atomic_write(OUTPUT / name, data, OUTPUT)
            print("wrote", name, flush=True)
    print("generated in", round(time.time() - started, 1), "s;", "published", sum(t["bytes"] for t in tracks), "bytes to", OUTPUT, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
