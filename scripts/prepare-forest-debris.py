#!/usr/bin/env python3
"""Download, verify and optimize the CC0 Poly Haven forest-floor debris.

Usage: python3 scripts/prepare-forest-debris.py
Requires network access the first time; sources are cached in ignored
node_modules/.cache/forest-debris/ and reused while their MD5 still matches.
Optimizes with the pinned glTF Transform CLI 4.5.1 (set GLTF_TRANSFORM to an
already cached binary to avoid `pnpm dlx`; it is not an app dependency).
Writes log.glb, stump.glb, rocks.glb and manifest.json to public/models/forest-debris/.
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

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "forest-debris"
OUTPUT = ROOT / "public" / "models" / "forest-debris"
# Poly Haven API terms 2.4: a unique user agent naming the software.
AGENT = "KevnnardPortfolioForestDebrisBuild/1.0"
LIMIT = 20_000_000
CLI = shlex.split(os.environ.get("GLTF_TRANSFORM", "pnpm dlx @gltf-transform/cli@4.5.1"))
# name, asset, vertex ratio, error (fraction of extent). Low error keeps the
# silhouette; the ratio is only an upper bound on what simplification removes.
ASSETS = [
    ("log", "dead_tree_trunk_02", 0.25, 0.0008),
    ("stump", "tree_stump_01", 0.3, 0.0008),
    ("rocks", "rock_moss_set_01", 0.35, 0.0008),
]
GRID = 64
AXES = [(0, 1), (0, 2), (1, 2)]


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


def positions(gltf, folder, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    if accessor["componentType"] != 5126 or accessor["type"] != "VEC3":
        raise ValueError("Source positions must be float VEC3")
    blob = (folder / gltf["buffers"][view["buffer"]]["uri"]).read_bytes()
    stride = view.get("byteStride", 12)
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [struct.unpack_from("<3f", blob, start + i * stride) for i in range(accessor["count"])]


def indices(gltf, folder, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    blob = (folder / gltf["buffers"][view["buffer"]]["uri"]).read_bytes()
    code = {5121: "B", 5123: "H", 5125: "I"}[accessor["componentType"]]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return struct.unpack_from("<%d%s" % (accessor["count"], code), blob, start)


def silhouette(points, triangles):
    """Fraction of 64² cell centers covered by projected triangles, per axis pair.

    Mirrored by tests/room/forest-debris-assets.test.ts on the shipped GLBs.
    """
    low = [min(p[a] for p in points) for a in range(3)]
    high = [max(p[a] for p in points) for a in range(3)]
    result = []
    for a, b in AXES:
        project = [((p[a] - low[a]) / (high[a] - low[a]) * GRID,
                    (p[b] - low[b]) / (high[b] - low[b]) * GRID) for p in points]
        cells = set()
        for i in range(0, len(triangles), 3):
            (x0, y0), (x1, y1), (x2, y2) = (project[triangles[i + k]] for k in range(3))
            area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
            if area == 0:
                continue
            for cx in range(max(0, int(min(x0, x1, x2))), min(GRID - 1, int(max(x0, x1, x2))) + 1):
                for cy in range(max(0, int(min(y0, y1, y2))), min(GRID - 1, int(max(y0, y1, y2))) + 1):
                    px, py = cx + 0.5, cy + 0.5
                    w0 = (x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)
                    w1 = (x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)
                    w2 = (x0 - px) * (y1 - py) - (x1 - px) * (y0 - py)
                    if (w0 >= 0 and w1 >= 0 and w2 >= 0) or (w0 <= 0 and w1 <= 0 and w2 <= 0):
                        cells.add(cx + cy * GRID)
        result.append(round(len(cells) / GRID ** 2, 5))
    return result


def glb_json(data):
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 8)[0] != len(data):
        raise ValueError("Output is not a complete GLB")
    return json.loads(data[20:20 + struct.unpack_from("<I", data, 12)[0]])


def prepare(name, asset, ratio, error):
    folder = CACHE / asset
    info = json.loads(fetch("https://api.polyhaven.com/info/" + asset))
    entry = json.loads(fetch("https://api.polyhaven.com/files/" + asset))["gltf"]["1k"]["gltf"]
    sources = [{"path": asset + "_1k.gltf", **checked(folder / (asset + "_1k.gltf"), entry)}]
    for relative, include in sorted(entry["include"].items()):
        sources.append({"path": relative, **checked(folder / relative, include)})
    gltf = json.loads((folder / (asset + "_1k.gltf")).read_text())
    meshes = []
    for node in gltf["nodes"]:
        if "mesh" not in node:
            continue
        points, triangles = [], []
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            offset = len(points)
            points += positions(gltf, folder, primitive["attributes"]["POSITION"])
            triangles += [offset + i for i in indices(gltf, folder, primitive["indices"])]
        meshes.append({"node": node["name"], "sourceTriangles": len(triangles) // 3,
                       "sourceSizeMeters": [round(max(p[a] for p in points) - min(p[a] for p in points), 4)
                                            for a in range(3)],
                       "sourceSilhouette": silhouette(points, triangles)})
    target = OUTPUT / (name + ".glb")
    command = [*CLI, "optimize", str(folder / (asset + "_1k.gltf")), str(target),
               "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024",
               "--simplify-ratio", str(ratio), "--simplify-error", str(error),
               # Keep every rock a separate mesh: the runtime instances them individually.
               "--join", "false", "--instance", "false", "--palette", "false"]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    data = target.read_bytes()
    output = glb_json(data)
    by_node = {node.get("name"): node for node in output["nodes"] if "mesh" in node}
    for mesh in meshes:
        primitives = output["meshes"][by_node[mesh["node"]]["mesh"]]["primitives"]
        mesh["triangles"] = sum(output["accessors"][p["indices"]]["count"] // 3 for p in primitives)
    print(asset, sum(m["sourceTriangles"] for m in meshes), "->",
          sum(m["triangles"] for m in meshes), "triangles,", len(data), "bytes", flush=True)
    return {
        "name": name, "asset": asset, "title": info["name"],
        "source": "https://polyhaven.com/a/" + asset,
        "infoApi": "https://api.polyhaven.com/info/" + asset,
        "filesApi": "https://api.polyhaven.com/files/" + asset,
        "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "authors": info["authors"],
        # Poly Haven reports dimensions in millimetres.
        "dimensionsMeters": [round(value / 1000, 3) for value in info["dimensions"]],
        "websitePolycount": info["polycount"],
        "sourceRepresentation": "official 1k glTF; triangle counts from its index accessors",
        "sourceLodVariants": "none published; the single source mesh per node is simplified once",
        "sourceFiles": sources,
        "processing": {"simplifyRatio": ratio, "simplifyError": error, "textureSize": 1024,
                       "compression": "meshopt", "textures": "webp"},
        "file": {"path": target.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                 "triangles": sum(m["triangles"] for m in meshes)},
        "meshes": meshes,
    }


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    version = subprocess.run([*CLI, "--version"], capture_output=True, text=True, check=True).stdout.strip()
    if not version.endswith("4.5.1"):
        raise ValueError("Expected glTF Transform CLI 4.5.1, found " + version)
    assets = [prepare(*spec) for spec in ASSETS]
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "provider": "Poly Haven", "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "apiTerms": "https://raw.githubusercontent.com/Poly-Haven/Public-API/master/ToS.md",
        "userAgent": AGENT, "runtimeExternalRequests": False,
        "toolchain": "@gltf-transform/cli " + version,
        "previewRenders": "not included: website preview images are not covered by the CC0 asset grant",
        "silhouette": "fraction of 64x64 cell centers covered by projected triangles in XY, XZ, YZ",
        "rawBytes": sum(f["bytes"] for asset in assets for f in asset["sourceFiles"]),
        "optimizedBytes": sum(asset["file"]["bytes"] for asset in assets),
        "assets": assets,
    }, indent=2) + "\n")
    print("Forest debris:", sum(a["file"]["bytes"] for a in assets), "bytes", flush=True)
