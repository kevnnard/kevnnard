#!/usr/bin/env python3
"""Download, verify and encode the CC0 Poly Haven garden path textures.

Usage: python3 scripts/prepare-garden.py
Same pipeline as scripts/prepare-ground.py. Requires network access and cwebp
(libwebp). Lossless 1K PNG sources are cached in ignored node_modules/.cache/garden/
and reused while their MD5 still matches. Writes six WebP maps plus manifest.json
to public/textures/garden/.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "garden"
OUTPUT = ROOT / "public" / "textures" / "garden"
AGENT = "KevnnardPortfolioGardenBuild/1.0"
LIMIT = 20_000_000
LAYERS = [("stone", "stone_pathway_02"), ("gravel", "gravel_floor_02")]
# Raw source guidance from the feature log; these two sets exceed it (build time only).
SOURCE_GUIDANCE = 20_000_000
# Poly Haven map key, colorSpace for THREE, cwebp arguments.
MAPS = {
    "color": ("Diffuse", "srgb", ["-q", "86", "-m", "6", "-sharp_yuv"]),
    # Lossless: lossy 4:2:0 chroma would corrupt the X/Y vectors stored in red/green.
    "normal": ("nor_gl", "linear", ["-lossless", "-exact", "-z", "9"]),
    # Grayscale data sits in full-resolution luma, so lossy loses no chroma detail.
    "roughness": ("Rough", "linear", ["-q", "90", "-m", "6"]),
}


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("Download exceeds the bound: " + url)
    return data


def source(asset, entry):
    path = CACHE / asset / entry["url"].rsplit("/", 1)[1]
    data = path.read_bytes() if path.exists() else b""
    if hashlib.md5(data).hexdigest() != entry["md5"]:
        data = fetch(entry["url"])
    if len(data) != entry["size"] or hashlib.md5(data).hexdigest() != entry["md5"]:
        raise ValueError("Source checksum or byte count mismatch: " + entry["url"])
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Source is not a PNG: " + entry["url"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    # IHDR: width, height, bit depth, color type.
    return path, data, int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big"), data[24], data[25]


def prepare(layer, asset):
    files = json.loads(fetch("https://api.polyhaven.com/files/" + asset))
    info = json.loads(fetch("https://api.polyhaven.com/info/" + asset))
    maps = {}
    for kind, (key, color_space, arguments) in MAPS.items():
        entry = files[key]["1k"]["png"]
        path, data, width, height, depth, color_type = source(asset, entry)
        if (width, height) != (1024, 1024):
            raise ValueError("Unexpected source dimensions for " + entry["url"])
        name = layer + "-" + kind + ".webp"
        command = ["cwebp", "-quiet", "-metadata", "none", *arguments, str(path), "-o", str(OUTPUT / name)]
        subprocess.run(command, check=True)
        encoded = (OUTPUT / name).read_bytes()
        maps[kind] = {
            "path": name, "colorSpace": color_space, "sourceUrl": entry["url"],
            "sourceMd5": entry["md5"], "sourceBytes": entry["size"],
            "sourceSha256": hashlib.sha256(data).hexdigest(),
            "sourcePng": {"bitDepth": depth, "colorType": color_type},
            "encoding": " ".join(["cwebp", "-metadata", "none", *arguments]),
            "width": width, "height": height, "bytes": len(encoded),
            "sha256": hashlib.sha256(encoded).hexdigest(),
        }
        print(asset, kind, entry["size"], "->", len(encoded), "bytes", flush=True)
    return {
        "layer": layer, "asset": asset, "name": info["name"],
        "source": "https://polyhaven.com/a/" + asset,
        "filesApi": "https://api.polyhaven.com/files/" + asset,
        "infoApi": "https://api.polyhaven.com/info/" + asset,
        "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "authors": info["authors"],
        # Poly Haven reports the captured surface size in millimetres.
        "realWorldSizeMeters": info["dimensions"][0] / 1000,
        "maps": maps,
    }


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    version = subprocess.run(["cwebp", "-version"], capture_output=True, text=True, check=True).stdout.split()[0]
    materials = [prepare(layer, asset) for layer, asset in LAYERS]
    total = sum(m["bytes"] for material in materials for m in material["maps"].values())
    raw = sum(m["sourceBytes"] for material in materials for m in material["maps"].values())
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "provider": "Poly Haven", "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "runtimeExternalRequests": False, "encoder": "cwebp " + version,
        "processing": "Official 1K PNG maps verified against API MD5 and byte size, re-encoded once to "
                      "1024px WebP without metadata. Color is sRGB lossy; OpenGL normals are lossless; "
                      "roughness is lossy grayscale linear data. No website preview renders are used.",
        "totalBytes": total, "sourceBytes": raw,
        "sourceBudgetNote": ("Raw official PNG sources total " + str(raw) + " bytes, above the 20 MB raw "
                             "source guidance; accepted for this build-time-only step. Sources stay in the "
                             "ignored cache and never ship." if raw > SOURCE_GUIDANCE else
                             "Raw official PNG sources stay within the 20 MB raw source guidance."),
        "materials": materials,
    }, indent=2) + "\n")
    print("Garden textures:", total, "bytes from", raw, "source bytes", flush=True)
