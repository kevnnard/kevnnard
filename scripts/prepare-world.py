#!/usr/bin/env python3
"""Download, verify, optimize and credit the CC0 models for the /world island.

Usage: python3 scripts/prepare-world.py
Requires network access the first time; sources come from the packs' official
GitHub repositories at pinned commits and are cached in ignored
node_modules/.cache/world/<pack>/<commit>/. Each pack's license file is read
at the same commit and must state CC0 before anything is processed.
Optimizes with the pinned glTF Transform CLI 4.5.1 (set GLTF_TRANSFORM to an
already cached binary to avoid `pnpm dlx`; it is not an app dependency).
Writes public/world/models/<kind>.glb and public/world/credits.json (S4: every
author is credited, even under CC0).

StylizedTextures step (T4e): `python3 scripts/prepare-world.py --textures` only
refreshes the house and setup textures and their credits. Drive ids come from
node_modules/.cache/world/explore/picks.tsv (rows of the pack's catalog CSV);
the 4K PNGs are cached in node_modules/.cache/world/textures/ and downscaled to
1024 WebP with cwebp (CWEBP overrides /opt/homebrew/bin/cwebp).
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import struct
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "world"
OUTPUT = ROOT / "public" / "world"
AGENT = "KevnnardPortfolioWorldBuild/1.0"
LIMIT = 60_000_000
CLI = shlex.split(os.environ.get("GLTF_TRANSFORM", "pnpm dlx @gltf-transform/cli@4.5.1"))
CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/"

PACKS = {
    "kaykit-medieval-hexagon": {
        "pack": "KayKit Medieval Hexagon Pack 1.0",
        "author": "Kay Lousberg",
        "authorUrl": "https://www.kaylousberg.com",
        "repo": "KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0",
        "commit": "84fa4e91af6a88989be7c99e0891cede11f2ca38",
        "licenseFile": "LICENSE.txt",
        "quote": "License: (Creative Commons Zero, CC0)",
    },
    "kaykit-city-builder-bits": {
        "pack": "KayKit City Builder Bits 1.0",
        "author": "Kay Lousberg",
        "authorUrl": "https://www.kaylousberg.com",
        "repo": "KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0",
        "commit": "63976910ca04d16f0fc531b9c614244be8128713",
        "licenseFile": "LICENSE.txt",
        "quote": "License: (Creative Commons Zero, CC0)",
    },
    "kenney-mini-arena": {
        "pack": "Kenney Mini Arena 1.0 (Starter Kit Basic Scene)",
        # The pack's License.txt lists Tony Schär as additional credit.
        "author": "Kenney, Tony Schär",
        "authorUrl": "https://kenney.nl",
        "repo": "KenneyNL/Starter-Kit-Basic-Scene",
        "commit": "a6927e66ff8dd8e173660ce4825abe773c65f683",
        "licenseFile": "sample/Mini Arena/License.txt",
        "quote": "License: (Creative Commons Zero, CC0)",
    },
    "kenney-starter-kit-3d-platformer": {
        "pack": "Kenney Starter Kit 3D Platformer",
        "author": "Kenney",
        "authorUrl": "https://kenney.nl",
        "repo": "KenneyNL/Starter-Kit-3D-Platformer",
        "commit": "3fa8a04b1c01ab23db43123d4ce814a34c3fc7f0",
        # Code is MIT; the README license section puts the models under CC0.
        "licenseFile": "README.md",
        "quote": "Assets included in this package (2D sprites, 3D models and sound effects) are [CC0 licensed]",
    },
}

KAYKIT = "addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/nature/"
KENNEY_ARENA = "sample/Mini Arena/Models/GLB format/"
CITY_BITS = "addons/kaykit_city_builder_bits/Assets/gltf/"


def kaykit(name):
    return [KAYKIT + name + ".gltf", KAYKIT + name + ".bin", KAYKIT + "hexagons_medieval.png"]


# kind (runtime model name), pack, source files (the first is the entry file).
ASSETS = [
    # Kenney GLBs reference their shared atlas as an external file.
    ("tree", "kenney-mini-arena", [KENNEY_ARENA + "tree.glb", KENNEY_ARENA + "Textures/colormap.png"]),
    ("pine", "kaykit-medieval-hexagon", kaykit("tree_single_A")),
    ("pines", "kaykit-medieval-hexagon", kaykit("trees_A_small")),
    ("pines-b", "kaykit-medieval-hexagon", kaykit("trees_B_small")),
    ("rock-a", "kaykit-medieval-hexagon", kaykit("rock_single_C")),
    ("rock-b", "kaykit-medieval-hexagon", kaykit("rock_single_E")),
    ("stone", "kaykit-medieval-hexagon", kaykit("rock_single_A")),
    ("tuft", "kenney-starter-kit-3d-platformer", ["models/grass.glb", "models/Textures/colormap.png"]),
    ("tuft-small", "kenney-starter-kit-3d-platformer", ["models/grass-small.glb", "models/Textures/colormap.png"]),
    ("bush", "kaykit-city-builder-bits",
     [CITY_BITS + "bush.gltf", CITY_BITS + "bush.bin", CITY_BITS + "citybits_texture.png"]),
]

# Original work built in code for this project: credited too, under the
# repository's own license.
ORIGINAL = [
    {"id": "flowers", "asset": "Low-poly flowers (procedural)", "author": "Kevnnard",
     "license": "Original work (repository license)", "source": "src/lib/world/flowers.ts"},
    {"id": "clouds", "asset": "Puffy clouds (procedural)", "author": "Kevnnard",
     "license": "Original work (repository license)", "source": "src/lib/world/clouds.ts"},
    {"id": "house", "asset": "Wooden house and garage (procedural)", "author": "Kevnnard",
     "license": "Original work (repository license)", "source": "src/lib/world/house.ts"},
    {"id": "setup", "asset": "Gaming setup: desk, monitors, PC, speakers and chair (procedural)",
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/setup.ts"},
    {"id": "setup-normals",
     "asset": "Setup normal maps: noise, speaker cone, fabric weave and keycaps (procedural)",
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/normals.ts"},
]


TEXTURE_PACK = {
    "id": "stylizedtextures",
    "pack": "StylizedTextures",
    "author": "CreativeTrio",
    "authorUrl": "https://creativetrio.art",
    "license": "CC0-1.0",
    "licenseUrl": CC0_URL,
    "source": "https://stylizedtextures.com",
    "licenseEvidence": {
        "url": "https://stylizedtextures.com/faq",
        "quote": "They are released under the CC0 (Creative Commons Zero) license",
    },
}
# Map name, catalog column (after the material name), cwebp encoding.
MAPS = [("color", 0, ["-q", "82"]), ("normal", 1, ["-lossless", "-z", "9"]),
        ("roughness", 2, ["-q", "70"])]
# The setup's small surfaces (T4g) use lossy normals to fit their 2.5 MB
# budget, plus the grille's alpha mask (catalog column 4).
SETUP_MAPS = [MAPS[0], ("normal", 1, ["-q", "85"]), MAPS[2]]
# Only these materials ship: walls, floor, roofs, the chair, the speaker
# grilles and the PC case.
TEXTURES = [("Stylized_Wood_Planks_001", MAPS), ("Stylized_Wood_Floor_001", MAPS),
            ("Stylized_Wood_Shingles_001", MAPS), ("Stylized_Leather_Patch_001", MAPS),
            ("Metal_Mesh_009", [*SETUP_MAPS, ("opacity", 4, ["-lossless", "-z", "9"])]),
            ("Stylized_Sci_fi_Metal_Panel_001", SETUP_MAPS)]
CWEBP = os.environ.get("CWEBP", "/opt/homebrew/bin/cwebp")
DWEBP = str(Path(CWEBP).with_name("dwebp"))
TEXTURE_SIZE = 1024


def drive_url(view_url):
    file_id = urllib.parse.parse_qs(urllib.parse.urlparse(view_url).query)["id"][0]
    return "https://drive.google.com/uc?export=download&id=" + file_id


def webp_size(data):
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("Output is not a WebP")
    chunk = data[12:16]
    if chunk == b"VP8 ":
        return (struct.unpack_from("<H", data, 26)[0] & 0x3FFF,
                struct.unpack_from("<H", data, 28)[0] & 0x3FFF)
    if chunk == b"VP8L":
        bits = struct.unpack_from("<I", data, 21)[0]
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if chunk == b"VP8X":
        return (int.from_bytes(data[24:27], "little") + 1,
                int.from_bytes(data[27:30], "little") + 1)
    raise ValueError("Unknown WebP chunk")


def mean_linear(webp):
    """Mean linear RGB of a color map: the runtime divides by it, so the map
    adds detail around the house's own pastel vertex colors."""
    ppm = CACHE / "textures" / "mean.ppm"
    subprocess.run([DWEBP, str(webp), "-scale", "64", "64", "-ppm", "-o", str(ppm)],
                   check=True, capture_output=True)
    data = ppm.read_bytes()
    fields = data.split(maxsplit=4)
    pixels = fields[4]
    lut = [((c / 255 + 0.055) / 1.055) ** 2.4 if c > 10 else c / 255 / 12.92
           for c in range(256)]
    count = len(pixels) // 3
    return [round(sum(lut[b] for b in pixels[k::3]) / count, 4) for k in range(3)]


def prepare_textures():
    license_page = fetch(TEXTURE_PACK["licenseEvidence"]["url"]).decode("utf-8")
    if TEXTURE_PACK["licenseEvidence"]["quote"] not in license_page:
        raise ValueError("StylizedTextures FAQ does not state CC0")
    picks = {}
    for line in (CACHE / "explore" / "picks.tsv").read_text(encoding="utf-8").splitlines():
        name, *urls = line.split("\t")
        picks[name] = urls
    (CACHE / "textures").mkdir(parents=True, exist_ok=True)
    (OUTPUT / "textures").mkdir(parents=True, exist_ok=True)
    entries = []
    for name, maps in TEXTURES:
        for kind, column, flags in maps:
            url = drive_url(picks[name][column])
            source = CACHE / "textures" / ("%s-%s.png" % (name, kind))
            if not source.exists():
                source.write_bytes(fetch(url))
            raw = source.read_bytes()
            if raw[:8] != b"\x89PNG\r\n\x1a\n":
                raise ValueError("%s %s is not a PNG" % (name, kind))
            target = OUTPUT / "textures" / ("%s-%s.webp" % (name, kind))
            subprocess.run([CWEBP, *flags, "-metadata", "none", "-resize",
                            str(TEXTURE_SIZE), str(TEXTURE_SIZE), str(source), "-o", str(target)],
                           check=True, capture_output=True)
            data = target.read_bytes()
            width, height = webp_size(data)
            if (width, height) != (TEXTURE_SIZE, TEXTURE_SIZE):
                raise ValueError("%s is %dx%d" % (target.name, width, height))
            entry = {
                "file": "textures/" + target.name,
                "asset": name,
                "map": kind,
                "pack": TEXTURE_PACK["id"],
                "author": TEXTURE_PACK["author"],
                "license": "CC0-1.0",
                "licenseUrl": CC0_URL,
                "source": "https://stylizedtextures.com/texture/" + name.lower(),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
                "width": width,
                "height": height,
                "sourceFiles": [{"url": url, "bytes": len(raw),
                                 "sha256": hashlib.sha256(raw).hexdigest()}],
            }
            if kind == "color":
                entry["meanLinear"] = mean_linear(target)
            print(target.name, len(data), "bytes", flush=True)
            entries.append(entry)
    print("World textures:", sum(e["bytes"] for e in entries), "bytes", flush=True)
    return entries


def with_textures(credits, textures):
    packs = [pack for pack in credits["packs"] if pack["id"] != TEXTURE_PACK["id"]]
    return {**credits, "packs": [*packs, TEXTURE_PACK], "original": ORIGINAL, "textures": textures,
            "textureBytes": sum(e["bytes"] for e in textures)}


def write_credits(credits):
    (OUTPUT / "credits.json").write_text(
        json.dumps(credits, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def raw_url(pack, path):
    return "https://raw.githubusercontent.com/%s/%s/%s" % (
        pack["repo"], pack["commit"], urllib.parse.quote(path))


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("Download exceeds the bound: " + url)
    return data


def cached(pack_id, path):
    """Pinned commits are immutable, so a cached copy is reused as is."""
    pack = PACKS[pack_id]
    target = CACHE / pack_id / pack["commit"] / path
    if not target.exists():
        data = fetch(raw_url(pack, path))
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    data = target.read_bytes()
    return target, {"url": raw_url(pack, path), "bytes": len(data),
                    "sha256": hashlib.sha256(data).hexdigest()}


def verify_license(pack_id):
    pack = PACKS[pack_id]
    path, _ = cached(pack_id, pack["licenseFile"])
    if pack["quote"] not in path.read_text(encoding="utf-8"):
        raise ValueError("%s: license file does not state CC0" % pack_id)
    return {
        "id": pack_id, "pack": pack["pack"], "author": pack["author"],
        "authorUrl": pack["authorUrl"], "license": "CC0-1.0", "licenseUrl": CC0_URL,
        "source": "https://github.com/%s/tree/%s" % (pack["repo"], pack["commit"]),
        "licenseEvidence": {"url": raw_url(pack, pack["licenseFile"]), "quote": pack["quote"]},
    }


def glb_json(data):
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError("Output is not a complete GLB")
    return json.loads(data[20:20 + struct.unpack_from("<I", data, 12)[0]])


def prepare(kind, pack_id, paths):
    sources = [cached(pack_id, path) for path in paths]
    entry = sources[0][0]
    target = OUTPUT / "models" / (kind + ".glb")
    command = [*CLI, "optimize", str(entry), str(target),
               "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "256",
               # Already low poly: keep every triangle, and keep material names
               # so the runtime can map them onto the owned pastel palette.
               "--simplify", "false", "--join", "false", "--instance", "false",
               "--palette", "false"]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, cwd=ROOT)
    data = target.read_bytes()
    output = glb_json(data)
    triangles = sum(output["accessors"][p["indices"]]["count"] // 3
                    for mesh in output["meshes"] for p in mesh["primitives"])
    pack = PACKS[pack_id]
    print(kind, "<-", paths[0], triangles, "triangles,", len(data), "bytes", flush=True)
    return {
        "file": "models/" + target.name,
        "asset": Path(paths[0]).stem,
        "pack": pack_id,
        "author": pack["author"],
        "license": "CC0-1.0",
        "licenseUrl": CC0_URL,
        "source": "https://github.com/%s/blob/%s/%s" % (
            pack["repo"], pack["commit"], urllib.parse.quote(paths[0])),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "triangles": triangles,
        "sourceFiles": [info for _, info in sources],
    }


if __name__ == "__main__":
    if sys.argv[1:] == ["--textures"]:
        current = json.loads((OUTPUT / "credits.json").read_text(encoding="utf-8"))
        write_credits(with_textures(current, prepare_textures()))
        sys.exit(0)
    (OUTPUT / "models").mkdir(parents=True, exist_ok=True)
    version = subprocess.run([*CLI, "--version"], capture_output=True, text=True,
                             check=True, cwd=ROOT).stdout.strip()
    if not version.endswith("4.5.1"):
        raise ValueError("Expected glTF Transform CLI 4.5.1, found " + version)
    used = sorted({pack_id for _, pack_id, _ in ASSETS})
    packs = [verify_license(pack_id) for pack_id in used]
    assets = [prepare(*spec) for spec in ASSETS]
    write_credits(with_textures({
        "policy": "Every shipped asset is credited, including CC0 ones (odd/tasks/stylized-house.md S4).",
        "userAgent": AGENT,
        "toolchain": "@gltf-transform/cli " + version,
        "runtimeExternalRequests": False,
        "rawBytes": sum(f["bytes"] for asset in assets for f in asset["sourceFiles"]),
        "optimizedBytes": sum(asset["bytes"] for asset in assets),
        "packs": packs,
        "assets": assets,
        "original": ORIGINAL,
    }, prepare_textures()))
    print("World models:", sum(a["bytes"] for a in assets), "bytes", flush=True)
