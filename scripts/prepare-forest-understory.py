#!/usr/bin/env python3
"""Download, verify and optimize the CC0 Poly Haven fern clumps (fern_02).

Usage: python3 scripts/prepare-forest-understory.py
Requires network access the first time; sources are cached in ignored
node_modules/.cache/forest-understory/ and reused while their MD5 still matches.
Optimizes with the pinned glTF Transform CLI 4.5.1 (set GLTF_TRANSFORM to an
already cached binary to avoid `pnpm dlx`; it is not an app dependency).
Writes ferns.glb and manifest.json to public/models/forest-understory/.

The official glTF pairs `alphaMode: MASK` with a JPEG base color, which has no
alpha channel, so it would render the fronds as solid cards. The official
16-bit PNG diffuse and alpha maps are merged here into one RGBA base color
(standard library only). Geometry is not simplified: the clumps are already
light and their fronds lose their silhouette under decimation.
Only official asset files are used; website preview renders are never downloaded.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import struct
import subprocess
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "forest-understory"
OUTPUT = ROOT / "public" / "models" / "forest-understory"
# Poly Haven API terms 2.4: a unique user agent naming the software.
AGENT = "KevnnardPortfolioForestUnderstoryBuild/1.0"
LIMIT = 40_000_000
CLI = shlex.split(os.environ.get("GLTF_TRANSFORM", "pnpm dlx @gltf-transform/cli@4.5.1"))
ASSET = "fern_02"
MERGED = "textures/fern_02_diff_alpha_1k.png"


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise ValueError("Download exceeds the bound: " + url)
    return data


def checked(path, entry):
    data = path.read_bytes() if path.exists() else b""
    if hashlib.md5(data).hexdigest() != entry["md5"]:
        data = fetch(entry["url"])
    if len(data) != entry["size"] or hashlib.md5(data).hexdigest() != entry["md5"]:
        raise ValueError("Source checksum or byte count mismatch: " + entry["url"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"url": entry["url"], "bytes": entry["size"], "md5": entry["md5"],
            "sha256": hashlib.sha256(data).hexdigest()}


def read_png(path):
    """Decode a non-interlaced 8/16-bit PNG; returns (width, height, channels, 8-bit samples)."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Not a PNG: " + str(path))
    pos, header, idat = 8, None, []
    while pos < len(data):
        length, kind = struct.unpack_from(">I4s", data, pos)
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    width, height, depth, color, _, _, interlace = header
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    if depth not in (8, 16) or interlace:
        raise ValueError("Unsupported PNG layout: " + str(path))
    bpp = channels * depth // 8
    stride = width * bpp
    raw = zlib.decompress(b"".join(idat))
    previous = bytearray(stride)
    samples = bytearray()
    for y in range(height):
        start = y * (stride + 1)
        kind, line = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        if kind == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif kind == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 255
        elif kind == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 255
        elif kind == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = previous[i]
                c = previous[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        elif kind != 0:
            raise ValueError("Bad PNG filter in " + str(path))
        previous = line
        # 16-bit samples are big-endian: keep the high byte.
        samples += line[0::2] if depth == 16 else line
    return width, height, channels, bytes(samples)


def write_png(path, width, height, rgba):
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    stride = width * 4
    rows = b"".join(b"\x00" + rgba[y * stride:(y + 1) * stride] for y in range(height))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


def merge_alpha(diffuse, alpha, target):
    width, height, channels, rgb = read_png(diffuse)
    a_width, a_height, a_channels, cutout = read_png(alpha)
    if (width, height, channels) != (a_width, a_height, 3) or a_channels != 1:
        raise ValueError("Diffuse and alpha maps do not pair")
    rgba = bytearray(width * height * 4)
    for channel in range(3):
        rgba[channel::4] = rgb[channel::3]
    rgba[3::4] = cutout
    write_png(target, width, height, bytes(rgba))
    # Share of texels that survive the 0.5 alpha cutoff.
    opaque = cutout.translate(bytes(1 if v >= 128 else 0 for v in range(256))).count(1)
    return round(opaque / (width * height), 4)


def mesh_stats(gltf, folder):
    blob = (folder / gltf["buffers"][0]["uri"]).read_bytes()
    meshes = []
    for node in gltf["nodes"]:
        if "mesh" not in node:
            continue
        points, triangles = [], 0
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
            view = gltf["bufferViews"][accessor["bufferView"]]
            if accessor["componentType"] != 5126 or accessor["type"] != "VEC3":
                raise ValueError("Source positions must be float VEC3")
            stride = view.get("byteStride", 12)
            start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            points += [struct.unpack_from("<3f", blob, start + i * stride) for i in range(accessor["count"])]
            triangles += gltf["accessors"][primitive["indices"]]["count"] // 3
        meshes.append({"node": node["name"], "sourceTriangles": triangles,
                       "sourceSizeMeters": [round(max(p[a] for p in points) - min(p[a] for p in points), 4)
                                            for a in range(3)]})
    return meshes


def glb_json(data):
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError("Output is not a complete GLB")
    return json.loads(data[20:20 + struct.unpack_from("<I", data, 12)[0]])


def prepare():
    folder = CACHE / ASSET
    info = json.loads(fetch("https://api.polyhaven.com/info/" + ASSET))
    files = json.loads(fetch("https://api.polyhaven.com/files/" + ASSET))
    entry = files["gltf"]["1k"]["gltf"]
    sources = [{"path": ASSET + "_1k.gltf", **checked(folder / (ASSET + "_1k.gltf"), entry)}]
    for relative, include in sorted(entry["include"].items()):
        # The JPEG base color is replaced by the merged RGBA map below.
        if "_diff_" in relative:
            continue
        sources.append({"path": relative, **checked(folder / relative, include)})
    pngs = []
    for kind in ("Diffuse", "Alpha"):
        png = files[kind]["1k"]["png"]
        relative = "png/" + png["url"].rsplit("/", 1)[1]
        sources.append({"path": relative, **checked(folder / relative, png)})
        pngs.append(folder / relative)
    raw = sum(source["bytes"] for source in sources)
    if raw > LIMIT:
        raise ValueError("Raw sources exceed the bound")
    coverage = merge_alpha(*pngs, folder / MERGED)
    gltf = json.loads((folder / (ASSET + "_1k.gltf")).read_text())
    material = gltf["materials"][0]
    if material.get("alphaMode") != "MASK" or not material.get("doubleSided"):
        raise ValueError("Expected the source leaf material to be alpha-masked and double-sided")
    base = gltf["textures"][material["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]
    gltf["images"][base] = {"name": gltf["images"][base]["name"], "mimeType": "image/png", "uri": MERGED}
    derived = folder / (ASSET + "_1k_alpha.gltf")
    derived.write_text(json.dumps(gltf))
    meshes = mesh_stats(gltf, folder)
    target = OUTPUT / "ferns.glb"
    command = [*CLI, "optimize", str(derived), str(target),
               "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024",
               "--simplify", "false",
               # Keep every clump a separate mesh: the runtime instances them individually.
               "--join", "false", "--instance", "false", "--palette", "false"]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    data = target.read_bytes()
    output = glb_json(data)
    by_node = {node.get("name"): node for node in output["nodes"] if "mesh" in node}
    for mesh in meshes:
        primitives = output["meshes"][by_node[mesh["node"]]["mesh"]]["primitives"]
        mesh["triangles"] = sum(output["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    print(ASSET, sum(m["sourceTriangles"] for m in meshes), "->",
          sum(m["triangles"] for m in meshes), "triangles,", len(data), "bytes", flush=True)
    merged = (folder / MERGED).read_bytes()
    return {
        "name": "ferns", "asset": ASSET, "title": info["name"],
        "source": "https://polyhaven.com/a/" + ASSET,
        "infoApi": "https://api.polyhaven.com/info/" + ASSET,
        "filesApi": "https://api.polyhaven.com/files/" + ASSET,
        "filesHash": info["files_hash"],
        "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "authors": info["authors"],
        # Poly Haven reports dimensions in millimetres (whole four-clump set).
        "dimensionsMeters": [round(value / 1000, 3) for value in info["dimensions"]],
        "websitePolycount": info["polycount"],
        "sourceRepresentation": "official 1k glTF; triangle counts from its index accessors",
        "sourceFiles": sources,
        "baseColorAlpha": {
            "from": [str(path.relative_to(folder)) for path in pngs],
            "sha256": hashlib.sha256(merged).hexdigest(),
            "coverage": coverage,
            "note": "official 1k PNG diffuse (RGB) + official 1k PNG alpha, 16-bit to 8-bit RGBA",
        },
        "processing": {"simplify": False, "textureSize": 1024, "compression": "meshopt", "textures": "webp"},
        "file": {"path": target.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                 "triangles": sum(m["triangles"] for m in meshes)},
        "meshes": meshes,
    }


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    version = subprocess.run([*CLI, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    if not version.endswith("4.5.1"):
        raise ValueError("Expected glTF Transform CLI 4.5.1, found " + version)
    asset = prepare()
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "provider": "Poly Haven", "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "apiTerms": "https://raw.githubusercontent.com/Poly-Haven/Public-API/master/ToS.md",
        "userAgent": AGENT, "runtimeExternalRequests": False,
        "toolchain": "@gltf-transform/cli " + version,
        "previewRenders": "not included: website preview images are not covered by the CC0 asset grant",
        "rawBytes": sum(f["bytes"] for f in asset["sourceFiles"]),
        "optimizedBytes": asset["file"]["bytes"],
        "assets": [asset],
    }, indent=2) + "\n")
    print("Forest understory:", asset["file"]["bytes"], "bytes", flush=True)
