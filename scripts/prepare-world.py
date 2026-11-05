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

Bruno Simon step (T4i): `python3 scripts/prepare-world.py --bruno` only
refreshes the coffee steam model and the credits for the effects ported from
his my-room-in-3d (used with his permission, odd/tasks/stylized-house.md L25).
Sources are cached in node_modules/.cache/world/bruno/<path>; the Draco steam
model is re-encoded with meshopt, so the runtime needs no Draco decoder.
T4k adds his top chair and desk overlays (Elgato light, Google Home LEDs,
Loupedeck buttons), also re-encoded with meshopt. The chair's UV islands are
repacked into a small atlas: each baked map (day, night, neutral, light map,
4096 JPEGs shared with his whole room) is decoded with djpeg (DJPEG overrides
/opt/homebrew/bin/djpeg), cropped island by island and encoded with cwebp
into public/world/bruno/, so only the chair's texels ship.

Living area step (T4j): `python3 scripts/prepare-world.py --living` only
refreshes the KayKit Furniture Bits models of the living area (sofa, coffee
table, TV bench, rug, books, cactus) and their credits.
"""
import hashlib
import json
import math
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
    "kaykit-furniture-bits": {
        "pack": "KayKit Furniture Bits 1.0",
        "author": "Kay Lousberg",
        "authorUrl": "https://www.kaylousberg.com",
        "repo": "KayKit-Game-Assets/KayKit-Furniture-Bits-1.0",
        "commit": "96d5930a8dbdb363409bbc2d3341718b00e17c9c",
        "licenseFile": "LICENSE.txt",
        "quote": "License: (Creative Commons Zero, CC0)",
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

FURNITURE = "addons/kaykit_furniture_bits/Assets/gltf/"


def furniture(name):
    return [FURNITURE + name + ".gltf", FURNITURE + name + ".bin",
            FURNITURE + "furniturebits_texture.png"]


# Living area props (T4j): single models placed by src/lib/world/living.ts.
LIVING = [
    ("sofa", "kaykit-furniture-bits", furniture("couch_pillows")),
    ("coffee-table", "kaykit-furniture-bits", furniture("table_low")),
    ("tv-stand", "kaykit-furniture-bits", furniture("cabinet_medium")),
    ("rug", "kaykit-furniture-bits", furniture("rug_rectangle_A")),
    ("books", "kaykit-furniture-bits", furniture("book_set")),
    ("cactus", "kaykit-furniture-bits", furniture("cactus_small_A")),
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
    # T12 (S24-S25): the finished setup, modelled from NuPhy's official pages.
    {"id": "setup",
     "asset": ("Gaming setup: copper-toned wooden desk under a giant black mouse pad, a NuPhy Air75 "
               "V2-inspired wireless low-profile 75% keyboard with side lights, an original curved mouse, "
               "a curved ultrawide and a portrait monitor on clamp arms, an original white monitor light "
               "bar, a wall shelf with the speakers, gamer lamps and two potted plants, over-ear headphones "
               "on an under-desk hanger, a coffee mug on a wooden coaster, the PC and the chair base "
               "(procedural; modelled from NuPhy's official product pages, no assets downloaded; NuPhy is "
               "a trademark of its owner, no affiliation)"),
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/setup.ts",
     "references": ["https://nuphy.com/products/air75-v2",
                    "https://nuphy.com/blogs/journal/air75-v2"]},
    {"id": "setup-normals",
     "asset": ("Setup maps: noise, speaker cone, fabric weave and keycap normals, and wood grain normals "
               "with their colour map (procedural)"),
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/normals.ts"},
    {"id": "living",
     "asset": "Living area: TV, PS5-style controller, game cases and leafy potted plants (procedural)",
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/living.ts"},
    {"id": "garden",
     "asset": "Front garden: wall lanterns, stepping-stone path, mailbox and sign (procedural)",
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/garden.ts"},
    {"id": "shelf",
     "asset": "Personal collection shelf: white two-column display shelf, football on its stand, cameras, hardware boxes, keyboard and books, personal athlete trophies, tricolor medals, film canisters, lenses and original landscape prints (procedural; labels and ball skin drawn in code from reference photos supplied by Kevnnard; brand names and marks belong to their owners, no affiliation)",
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/lib/world/shelf.ts"},
    # T18 (S31-S32): the portrait page; the video and docs stream from their sites.
    {"id": "portrait-page",
     "asset": ("Portrait monitor page: the layout, frames and a Gentleman Programming header with an original GP "
               "monogram (not the channel's avatar) are original; it embeds YouTube's official player for the "
               "channel's video NN6vlDRjg5Y (youtube-nocookie.com) above the official NestJS Controllers documentation "
               "framed live from docs.nestjs.com; both stream from their owners' sites, never downloaded, proxied or "
               "rehosted, and their content is not part of this credit; YouTube, Gentleman Programming and NestJS "
               "names and marks belong to their owners, no affiliation"),
     "author": "Kevnnard", "license": "Original work (repository license)",
     "source": "src/components/world/PortraitScreen.tsx",
     "references": ["https://www.youtube.com/watch?v=NN6vlDRjg5Y",
                    "https://www.youtube.com/c/GentlemanProgramming",
                    "https://docs.nestjs.com/controllers"]},
]

# World speaker music (odd/tasks/world-speaker-music.md T1): rendered by
# scripts/generate-world-music.py with the MIT gentle-stream engine, whose notice
# ships beside the tracks; hashes and loop bounds live in audio/manifest.json.
GENTLE_STREAM_COMMIT = "381290451544ad2ca3348a68a81b3056bdac73b7"
MUSIC = [
    {"id": "speaker-music",
     "asset": ("Speaker music: five looping tracks (Cafe Drift, Ambient Focus, Velvet Jazz, Soft Circuit, "
               "Midnight Code) rendered offline for this site by the gentle-stream engine's procedural "
               "instruments from fixed seeds and styles; no soundfont, samples or mood model"),
     "author": "Kevnnard (seeds, styles and loop edit); gentle-stream engine by Alan Buscaglia (Gentleman Programming)",
     "engine": "https://github.com/Gentleman-Programming/gentle-stream/tree/" + GENTLE_STREAM_COMMIT,
     "engineLicense": "MIT",
     "engineLicenseFile": "audio/gentle-stream-LICENSE.txt",
     "engineCopyright": "Copyright (c) 2026 Alan Buscaglia (Gentleman Programming)",
     "generator": "scripts/generate-world-music.py",
     "manifest": "audio/manifest.json",
     "files": ["audio/%s.m4a" % name for name in
               ("cafe-drift", "ambient-focus", "velvet-jazz", "soft-circuit", "midnight-code")],
     "note": ("The engine is used under its MIT license, whose notice ships unchanged; this credit claims no "
              "other license for the rendered audio.")},
]


BRUNO_COMMIT = "5d00b3f870da81f103e901e0d12e20bbcc816834"
BRUNO_REPO = "https://github.com/brunosimon/my-room-in-3d"
BRUNO_LICENSE = "used with the author's permission (private message to the site owner)"
BRUNO_PACK = {
    "id": "bruno-my-room-in-3d",
    "pack": "My Room in 3D",
    "author": "Bruno Simon",
    "authorUrl": "https://bruno-simon.com",
    "license": BRUNO_LICENSE,
    "licenseUrl": "%s/tree/%s" % (BRUNO_REPO, BRUNO_COMMIT),
    "source": "%s/tree/%s" % (BRUNO_REPO, BRUNO_COMMIT),
    "licenseEvidence": {
        "url": "%s/tree/%s" % (BRUNO_REPO, BRUNO_COMMIT),
        "quote": "No license file at this commit; " + BRUNO_LICENSE
                 + ", recorded in odd/tasks/stylized-house.md L25",
    },
}
EXPERIENCE = "src/Experience/"
# Ported code and shaders: id, what, files, the repository file holding the port.
BRUNO_PORTS = [
    ("coffee-steam", "Coffee steam shader (vertex, fragment, perlin2d partial)",
     [EXPERIENCE + "CoffeeSteam.js", EXPERIENCE + "shaders/coffeeSteam/vertex.glsl",
      EXPERIENCE + "shaders/coffeeSteam/fragment.glsl",
      EXPERIENCE + "shaders/partials/perlin2d.glsl"],
     "src/components/world/SetupEffects.tsx"),
    ("chair-sway", "Chair sway", [EXPERIENCE + "TopChair.js"], "src/lib/world/motion.ts"),
    ("breathing-leds", "Breathing LED wave", [EXPERIENCE + "GoogleLeds.js"],
     "src/lib/world/motion.ts"),
    ("bouncing-logo", "Bouncing logo limits and velocity", [EXPERIENCE + "BouncingLogo.js"],
     "src/lib/world/motion.ts"),
    ("wheel-zoom", "Normalized wheel zoom", [EXPERIENCE + "Navigation.js"],
     "src/lib/world/wheel.ts"),
    ("baked-shader", "Baked day, night and neutral mix with the light map (chair material)",
     [EXPERIENCE + "Baked.js", EXPERIENCE + "shaders/baked/vertex.glsl",
      EXPERIENCE + "shaders/baked/fragment.glsl"],
     "src/components/world/BrunoProps.tsx"),
    ("elgato-light", "Elgato key light glow", [EXPERIENCE + "ElgatoLight.js"],
     "src/components/world/BrunoProps.tsx"),
    ("google-home-leds", "Google Home LED colors and alpha mask", [EXPERIENCE + "GoogleLeds.js"],
     "src/components/world/BrunoProps.tsx"),
    ("loupedeck-buttons", "Loupedeck button colors and timing",
     [EXPERIENCE + "LoupedeckButtons.js"], "src/lib/world/motion.ts"),
]
BRUNO_STEAM = "static/assets/coffeeSteamModel.glb"
BRUNO_ASSETS = "static/assets/"
# Shipped name, his model (T4k).
BRUNO_MODELS = [
    ("bruno-chair", "topChairModel"),
    ("bruno-elgato-light", "elgatoLightModel"),
    ("bruno-google-home-leds", "googleHomeLedsModel"),
    ("bruno-loupedeck-buttons", "loupedeckButtonsModel"),
]
# Chair atlas maps: shipped name, his baked JPEG, cwebp flags.
BRUNO_BAKED = [
    ("day", "bakedDay.jpg", ["-q", "80"]),
    ("night", "bakedNight.jpg", ["-q", "80"]),
    ("neutral", "bakedNeutral.jpg", ["-q", "80"]),
    ("light-map", "lightMap.jpg", ["-q", "85"]),
]
BRUNO_MASK = "googleHomeLedMask.png"
BRUNO_FLAGS = ["--simplify", "false", "--join", "false", "--instance", "false",
               "--palette", "false", "--flatten", "false"]
# Source atlas size, island padding (source texels), packed shelf width and
# the shipped scale of the packed atlas.
ATLAS = {"source": 4096, "pad": 8, "width": 2048, "scale": 1}
# Horizontal slabs of the chair's collision hull (his units, around his pivot).
HULL_SLABS = 8
DJPEG = os.environ.get("DJPEG", "/opt/homebrew/bin/djpeg")


def bruno_cached(path):
    """Pinned commit, so a cached copy is reused as is."""
    url = "https://raw.githubusercontent.com/brunosimon/my-room-in-3d/%s/%s" % (BRUNO_COMMIT, path)
    target = CACHE / "bruno" / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(fetch(url))
    data = target.read_bytes()
    return target, {"url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def glb_split(data):
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    start = 20 + length
    size = struct.unpack_from("<I", data, start)[0]
    return gltf, bytearray(data[start + 8:start + 8 + size])


def glb_join(gltf, binary):
    text = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    binary = bytes(binary) + b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    return (struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<I4s", len(text), b"JSON") + text
            + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def accessor_slots(gltf, index, count):
    """Byte offsets of each element of a float accessor."""
    accessor = gltf["accessors"][index]
    if accessor["componentType"] != 5126:
        raise ValueError("expected a float accessor")
    view = gltf["bufferViews"][accessor["bufferView"]]
    stride = view.get("byteStride", 4 * count)
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [base + i * stride for i in range(accessor["count"])]


def read_indices(gltf, binary, index):
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    fmt = {5121: "B", 5123: "H", 5125: "I"}[accessor["componentType"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return list(struct.unpack_from("<%d%s" % (accessor["count"], fmt), binary, base))


def node_transform(node):
    """3x4 local matrix of a glTF node (TRS)."""
    t = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    r = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[r[i][0] * s[0], r[i][1] * s[1], r[i][2] * s[2], t[i]] for i in range(3)]


def decompress(source, target):
    """His Draco GLB as plain float attributes, hierarchy untouched."""
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([*CLI, "optimize", str(source), str(target), "--compress", "false",
                    "--weld", "false", "--prune", "false", *BRUNO_FLAGS],
                   check=True, stdout=subprocess.DEVNULL, cwd=ROOT)


def chair_islands(gltf, binary, primitive):
    """UV islands (connected triangles) and each one's padded texel rectangle."""
    slots = accessor_slots(gltf, primitive["attributes"]["TEXCOORD_0"], 2)
    uvs = [struct.unpack_from("<ff", binary, offset) for offset in slots]
    indices = read_indices(gltf, binary, primitive["indices"])
    parent = list(range(len(uvs)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for t in range(0, len(indices), 3):
        a = root(indices[t])
        for k in (1, 2):
            b = root(indices[t + k])
            if a != b:
                parent[b] = a
    size, pad = ATLAS["source"], ATLAS["pad"]
    rects = {}
    for i in set(indices):
        u, v = uvs[i]
        rect = rects.setdefault(root(i), [u, v, u, v])
        rect[:] = [min(rect[0], u), min(rect[1], v), max(rect[2], u), max(rect[3], v)]
    islands = {key: (max(int(r[0] * size) - pad, 0), max(int(r[1] * size) - pad, 0),
                     min(int(r[2] * size) + 1 + pad, size), min(int(r[3] * size) + 1 + pad, size))
               for key, r in rects.items()}
    return uvs, slots, root, islands


def shelf_pack(islands, width):
    """Tallest first, left to right in rows: island -> (x, y), and the height."""
    order = sorted(islands, key=lambda key: (islands[key][1] - islands[key][3], key))
    x = y = row = 0
    places = {}
    for key in order:
        x0, y0, x1, y1 = islands[key]
        if x + x1 - x0 > width:
            x, y, row = 0, y + row, 0
        places[key] = (x, y)
        x += x1 - x0
        row = max(row, y1 - y0)
    step = int(4 / ATLAS["scale"])
    return places, -(-(y + row) // step) * step


def chair_hull(gltf, binary, mesh_node, primitive):
    """Per-slab bounds [x0, x1, y0, y1, z0, z1] of the chair around his pivot."""
    matrix = node_transform(mesh_node)
    slots = accessor_slots(gltf, primitive["attributes"]["POSITION"], 3)
    points = []
    for offset in slots:
        p = struct.unpack_from("<fff", binary, offset)
        points.append([sum(matrix[r][c] * p[c] for c in range(3)) + matrix[r][3] for r in range(3)])
    indices = read_indices(gltf, binary, primitive["indices"])
    low = min(p[1] for p in points)
    high = max(p[1] for p in points)
    step = (high - low) / HULL_SLABS
    slabs = [[1e9, -1e9, low + k * step, low + (k + 1) * step, 1e9, -1e9] for k in range(HULL_SLABS)]
    for t in range(0, len(indices), 3):
        tri = [points[indices[t + k]] for k in range(3)]
        y0, y1 = min(p[1] for p in tri), max(p[1] for p in tri)
        for slab in slabs:
            if y1 >= slab[2] and y0 <= slab[3]:
                slab[0] = min(slab[0], *(p[0] for p in tri))
                slab[1] = max(slab[1], *(p[0] for p in tri))
                slab[4] = min(slab[4], *(p[2] for p in tri))
                slab[5] = max(slab[5], *(p[2] for p in tri))
    # Rounded outwards, so the hull always contains the mesh.
    down = lambda value: math.floor(value * 1000) / 1000
    up = lambda value: math.ceil(value * 1000) / 1000
    return [[down(s[0]), up(s[1]), down(s[2]), up(s[3]), down(s[4]), up(s[5])] for s in slabs]


def read_ppm(path):
    data = path.read_bytes()
    tokens, position = [], 0
    while len(tokens) < 4:
        while data[position:position + 1].isspace():
            position += 1
        end = position
        while not data[end:end + 1].isspace():
            end += 1
        tokens.append(data[position:end])
        position = end
    if tokens[0] != b"P6" or tokens[3] != b"255":
        raise ValueError("%s is not an 8-bit PPM" % path)
    return int(tokens[1]), int(tokens[2]), data[position + 1:]


def bake_atlas(jpeg, islands, places, height, target, flags):
    """Copies each island's texels from his atlas into the packed one, as WebP."""
    work = CACHE / "bruno" / "atlas"
    work.mkdir(parents=True, exist_ok=True)
    source_ppm = work / (target.stem + "-source.ppm")
    subprocess.run([DJPEG, "-pnm", "-outfile", str(source_ppm), str(jpeg)], check=True)
    size, size_y, pixels = read_ppm(source_ppm)
    if (size, size_y) != (ATLAS["source"], ATLAS["source"]):
        raise ValueError("%s is %dx%d" % (jpeg.name, size, size_y))
    width = ATLAS["width"]
    packed = bytearray(width * height * 3)
    for key, (x0, y0, x1, y1) in islands.items():
        px, py = places[key]
        span = (x1 - x0) * 3
        for row in range(y1 - y0):
            src = ((y0 + row) * size + x0) * 3
            dst = ((py + row) * width + px) * 3
            packed[dst:dst + span] = pixels[src:src + span]
    packed_ppm = work / (target.stem + ".ppm")
    packed_ppm.write_bytes(b"P6\n%d %d\n255\n" % (width, height) + bytes(packed))
    out = [round(width * ATLAS["scale"]), round(height * ATLAS["scale"])]
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([CWEBP, *flags, "-metadata", "none", "-resize", str(out[0]), str(out[1]),
                    str(packed_ppm), "-o", str(target)], check=True, capture_output=True)
    data = target.read_bytes()
    if list(webp_size(data)) != out:
        raise ValueError("%s is not %dx%d" % (target.name, *out))
    return data, out


def bruno_entry(name, info_path, data, sources, **extra):
    return {"file": name, "pack": BRUNO_PACK["id"], "author": "Bruno Simon",
            "license": BRUNO_LICENSE, "licenseUrl": BRUNO_PACK["licenseUrl"],
            "source": "%s/blob/%s/%s" % (BRUNO_REPO, BRUNO_COMMIT, info_path),
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            **extra, "sourceFiles": sources}


def meshopt_bruno(name, entry, model, info, **extra):
    target = OUTPUT / "models" / (name + ".glb")
    subprocess.run([*CLI, "optimize", str(entry), str(target), "--compress", "meshopt",
                    *BRUNO_FLAGS], check=True, stdout=subprocess.DEVNULL, cwd=ROOT)
    data = target.read_bytes()
    output = glb_json(data)
    triangles = sum(output["accessors"][p["indices"]]["count"] // 3
                    for mesh in output["meshes"] for p in mesh["primitives"])
    print(name, "<-", model, triangles, "triangles,", len(data), "bytes", flush=True)
    return bruno_entry("models/" + target.name, BRUNO_ASSETS + model + ".glb", data, [info],
                       asset=model, triangles=triangles, **extra)


def prepare_bruno_chair():
    """His top chair with its UVs moved onto a packed atlas of its own texels."""
    source, info = bruno_cached(BRUNO_ASSETS + "topChairModel.glb")
    plain = CACHE / "bruno" / "plain" / "topChairModel.glb"
    decompress(source, plain)
    gltf, binary = glb_split(plain.read_bytes())
    pivot = gltf["nodes"][gltf["scenes"][0]["nodes"][0]]
    if len(pivot.get("children", [])) != 1 or "mesh" in pivot:
        raise ValueError("topChairModel: expected one pivot with one mesh child")
    mesh_node = gltf["nodes"][pivot["children"][0]]
    primitive = gltf["meshes"][mesh_node["mesh"]]["primitives"][0]
    uvs, slots, root, islands = chair_islands(gltf, binary, primitive)
    places, height = shelf_pack(islands, ATLAS["width"])
    size = ATLAS["source"]
    for i, offset in enumerate(slots):
        u, v = uvs[i]
        x0, y0, _, _ = islands[root(i)]
        px, py = places[root(i)]
        struct.pack_into("<ff", binary, offset, (u * size - x0 + px) / ATLAS["width"],
                         (v * size - y0 + py) / height)
    accessor = gltf["accessors"][primitive["attributes"]["TEXCOORD_0"]]
    accessor.pop("min", None)
    accessor.pop("max", None)
    remapped = CACHE / "bruno" / "plain" / "topChairModel-atlas.glb"
    remapped.write_bytes(glb_join(gltf, binary))
    print("chair atlas:", len(islands), "islands,", ATLAS["width"], "x", height, "texels", flush=True)
    maps = []
    for kind, jpeg, flags in BRUNO_BAKED:
        path, jpeg_info = bruno_cached(BRUNO_ASSETS + jpeg)
        target = OUTPUT / "bruno" / ("chair-%s.webp" % kind)
        data, (width, out_height) = bake_atlas(path, islands, places, height, target, flags)
        print(target.name, len(data), "bytes", flush=True)
        maps.append(bruno_entry("bruno/" + target.name, BRUNO_ASSETS + jpeg, data,
                                [jpeg_info, info], asset=Path(jpeg).stem, map=kind,
                                width=width, height=out_height))
    model = meshopt_bruno("bruno-chair", remapped, "topChairModel", info,
                          hull=chair_hull(gltf, binary, mesh_node, primitive),
                          pivot=[round(value, 6) for value in pivot.get("translation", [0, 0, 0])])
    return model, maps


def prepare_bruno_props():
    """The chair, the three desk overlays and the Google Home LED mask (T4k)."""
    chair, maps = prepare_bruno_chair()
    models = [chair]
    for name, model in BRUNO_MODELS[1:]:
        entry, info = bruno_cached(BRUNO_ASSETS + model + ".glb")
        models.append(meshopt_bruno(name, entry, model, info))
    mask, info = bruno_cached(BRUNO_ASSETS + BRUNO_MASK)
    data = mask.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("googleHomeLedMask is not a PNG")
    target = OUTPUT / "bruno" / "google-home-led-mask.png"
    target.write_bytes(data)
    width, height = struct.unpack_from(">II", data, 16)
    maps.append(bruno_entry("bruno/" + target.name, BRUNO_ASSETS + BRUNO_MASK, data, [info],
                            asset="googleHomeLedMask", map="alpha", width=width, height=height))
    return models, maps


def prepare_bruno():
    ported = [{"id": pid, "asset": asset, "author": "Bruno Simon", "license": BRUNO_LICENSE,
               "source": "%s/blob/%s/%s" % (BRUNO_REPO, BRUNO_COMMIT, files[0]),
               "port": port, "sourceFiles": [bruno_cached(f)[1] for f in files]}
              for pid, asset, files, port in BRUNO_PORTS]
    entry, info = bruno_cached(BRUNO_STEAM)
    target = OUTPUT / "models" / "coffee-steam.glb"
    subprocess.run([*CLI, "optimize", str(entry), str(target), "--compress", "meshopt",
                    "--simplify", "false", "--join", "false", "--instance", "false",
                    "--palette", "false"], check=True, stdout=subprocess.DEVNULL, cwd=ROOT)
    data = target.read_bytes()
    output = glb_json(data)
    triangles = sum(output["accessors"][p["indices"]]["count"] // 3
                    for mesh in output["meshes"] for p in mesh["primitives"])
    print("coffee-steam <-", BRUNO_STEAM, triangles, "triangles,", len(data), "bytes", flush=True)
    asset = {
        "file": "models/" + target.name, "asset": "coffeeSteamModel", "pack": BRUNO_PACK["id"],
        "author": "Bruno Simon", "license": BRUNO_LICENSE, "licenseUrl": BRUNO_PACK["licenseUrl"],
        "source": "%s/blob/%s/%s" % (BRUNO_REPO, BRUNO_COMMIT, BRUNO_STEAM),
        "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "triangles": triangles, "sourceFiles": [info],
    }
    models, maps = prepare_bruno_props()
    return [asset, *models], ported, maps


def with_bruno(credits, bruno):
    assets_bruno, ported, maps = bruno
    packs = [pack for pack in credits["packs"] if pack["id"] != BRUNO_PACK["id"]]
    assets = [a for a in credits["assets"] if a["pack"] != BRUNO_PACK["id"]]
    return {**credits, "packs": [*packs, BRUNO_PACK], "assets": [*assets, *assets_bruno],
            "ported": ported, "maps": maps, "mapBytes": sum(m["bytes"] for m in maps)}


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


def with_living(credits, packs, assets):
    ids = {pack["id"] for pack in packs}
    kept = [a for a in credits["assets"] if a["pack"] not in ids]
    merged = [*kept, *assets]
    owned = [a for a in merged if a["pack"] in PACKS]
    return {**credits,
            "packs": [*[p for p in credits["packs"] if p["id"] not in ids], *packs],
            "assets": merged, "original": ORIGINAL,
            "rawBytes": sum(f["bytes"] for a in owned for f in a["sourceFiles"]),
            "optimizedBytes": sum(a["bytes"] for a in owned)}


def write_credits(credits):
    # The gallery's CC BY models are independently sourced and optimized.
    # Preserve their credited provenance whenever base-world assets regenerate.
    # The football helmet is Exodusks' SpeedFlex (collection-display-models T7),
    # derived by scripts/prepare-display-football.mjs; the off-road helmet is
    # senoaji's Fox X Supreme helmet (T15), derived by
    # scripts/prepare-display-offroad-fox.mjs.
    path = OUTPUT / "credits.json"
    if path.exists():
        previous = json.loads(path.read_text(encoding="utf-8"))
        gallery_files = {"models/display-offroad-helmet.glb",
                         "models/display-football-helmet.glb",
                         "models/display-jordan-1.glb"}
        gallery_assets = [asset for asset in previous.get("assets", [])
                          if asset["file"] in gallery_files]
        if gallery_assets:
            gallery_packs = {asset["pack"] for asset in gallery_assets}
            credits["assets"] = [asset for asset in credits["assets"]
                                 if asset["file"] not in gallery_files] + gallery_assets
            credits["packs"] = [pack for pack in credits["packs"]
                                if pack["id"] not in gallery_packs] + [
                                    pack for pack in previous["packs"]
                                    if pack["id"] in gallery_packs]
    # A file built here as original work is never also credited as a download,
    # so a stale credits.json cannot bring a retired mesh or its pack back.
    original_files = {entry["file"] for entry in credits.get("original", [])
                      if "file" in entry}
    credits["assets"] = [asset for asset in credits["assets"]
                         if asset["file"] not in original_files]
    used = {entry["pack"] for key in ("assets", "textures", "maps")
            for entry in credits.get(key, [])}
    credits["packs"] = [pack for pack in credits["packs"] if pack["id"] in used]
    # Original work that ships as a file records that file's bytes and hash.
    if "original" in credits:
        originals = []
        for entry in credits["original"]:
            if "file" in entry:
                data = (OUTPUT / entry["file"]).read_bytes()
                entry = {**entry, "bytes": len(data),
                         "sha256": hashlib.sha256(data).hexdigest()}
            originals.append(entry)
        credits["original"] = originals
    path.write_text(json.dumps(credits, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")


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
    if sys.argv[1:] == ["--bruno"]:
        current = json.loads((OUTPUT / "credits.json").read_text(encoding="utf-8"))
        write_credits(with_bruno(current, prepare_bruno()))
        sys.exit(0)
    if sys.argv[1:] == ["--living"]:
        current = json.loads((OUTPUT / "credits.json").read_text(encoding="utf-8"))
        used = sorted({pack_id for _, pack_id, _ in LIVING})
        write_credits(with_living(current, [verify_license(pack_id) for pack_id in used],
                                  [prepare(*spec) for spec in LIVING]))
        sys.exit(0)
    if sys.argv[1:] == ["--textures"]:
        current = json.loads((OUTPUT / "credits.json").read_text(encoding="utf-8"))
        write_credits(with_textures(current, prepare_textures()))
        sys.exit(0)
    (OUTPUT / "models").mkdir(parents=True, exist_ok=True)
    version = subprocess.run([*CLI, "--version"], capture_output=True, text=True,
                             check=True, cwd=ROOT).stdout.strip()
    if not version.endswith("4.5.1"):
        raise ValueError("Expected glTF Transform CLI 4.5.1, found " + version)
    used = sorted({pack_id for _, pack_id, _ in ASSETS + LIVING})
    packs = [verify_license(pack_id) for pack_id in used]
    assets = [prepare(*spec) for spec in ASSETS + LIVING]
    write_credits(with_bruno(with_textures({
        "policy": "Every shipped asset is credited, including CC0 ones (odd/tasks/stylized-house.md S4).",
        "userAgent": AGENT,
        "toolchain": "@gltf-transform/cli " + version,
        "runtimeExternalRequests": True,
        "rawBytes": sum(f["bytes"] for asset in assets for f in asset["sourceFiles"]),
        "optimizedBytes": sum(asset["bytes"] for asset in assets),
        "packs": packs,
        "assets": assets,
        "original": ORIGINAL,
        "music": MUSIC,
    }, prepare_textures()), prepare_bruno()))
    print("World models:", sum(a["bytes"] for a in assets), "bytes", flush=True)
