#!/usr/bin/env python3
"""Extract one real tree variant from each CC0 Poly Haven glTF.

Usage: python3 scripts/prepare-forest.py
Writes rebuildable inputs under node_modules/.cache/forest-source/ (never served or committed).
Uses HTTP byte ranges: the originals contain all three very dense variants.
"""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "node_modules" / ".cache" / "forest-source"
AGENT = "KevnnardPortfolioForestBuild/1.0"


def fetch(url, start=None, length=None):
    headers = {"User-Agent": AGENT}
    if start is not None:
        headers["Range"] = "bytes=%d-%d" % (start, start + length - 1)
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
        if start is not None:
            expected = "bytes %d-%d/" % (start, start + length - 1)
            if response.status != 206 or not response.headers.get("Content-Range", "").startswith(expected):
                raise ValueError("Source does not support the requested bounded byte range")
        data = response.read(length + 1 if length is not None else 20_000_001)
    if length is not None and len(data) != length:
        raise ValueError("Unexpected byte-range length")
    if start is None and len(data) > 20_000_000:
        raise ValueError("Metadata/texture exceeds the download bound")
    return data


def checked(entry):
    data = fetch(entry["url"])
    if len(data) != entry["size"] or hashlib.md5(data).hexdigest() != entry["md5"]:
        raise ValueError("Source checksum or byte count mismatch")
    return data


def prepare(asset, variant):
    folder = CACHE / asset
    folder.mkdir(parents=True, exist_ok=True)
    metadata = json.loads(fetch("https://api.polyhaven.com/files/" + asset))
    entry = metadata["gltf"]["1k"]["gltf"]
    original = checked(entry)
    gltf = json.loads(original)
    node = gltf["nodes"][variant]
    mesh = gltf["meshes"][node["mesh"]]
    accessors = sorted({index for primitive in mesh["primitives"]
                        for index in [primitive["indices"], *primitive["attributes"].values()]})
    views = sorted({gltf["accessors"][index]["bufferView"] for index in accessors})
    accessor_map = {old: new for new, old in enumerate(accessors)}
    view_map = {old: new for new, old in enumerate(views)}
    blob = bytearray()
    sources = []
    for index in views:
        view = gltf["bufferViews"][index]
        source = entry["include"][gltf["buffers"][view["buffer"]]["uri"]]
        data = fetch(source["url"], view.get("byteOffset", 0), view["byteLength"])
        while len(blob) % 4:
            blob.append(0)
        sources.append({"offset": view.get("byteOffset", 0), "bytes": len(data),
                        "sha256": hashlib.sha256(data).hexdigest()})
        view.update(buffer=0, byteOffset=len(blob))
        blob.extend(data)
    gltf["bufferViews"] = [gltf["bufferViews"][i] for i in views]
    gltf["accessors"] = [gltf["accessors"][i] for i in accessors]
    for accessor in gltf["accessors"]:
        accessor["bufferView"] = view_map[accessor["bufferView"]]
    for primitive in mesh["primitives"]:
        primitive["indices"] = accessor_map[primitive["indices"]]
        primitive["attributes"] = {key: accessor_map[value] for key, value in primitive["attributes"].items()}
    gltf["meshes"] = [mesh]
    gltf["nodes"] = [{**node, "mesh": 0}]
    gltf["scenes"] = [{"nodes": [0]}]
    gltf["scene"] = 0
    gltf["buffers"] = [{"uri": "tree.bin", "byteLength": len(blob)}]
    (folder / "tree.bin").write_bytes(blob)
    downloaded = []
    for image in gltf.get("images", []):
        relative = image["uri"]
        target = folder / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        data = checked(entry["include"][relative])
        target.write_bytes(data)
        downloaded.append({"path": relative, "sha256": hashlib.sha256(data).hexdigest()})
    (folder / "tree.gltf").write_text(json.dumps(gltf))
    provenance = {
        "asset": asset, "source": "https://polyhaven.com/a/" + asset,
        "license": "CC0-1.0", "licenseUrl": "https://polyhaven.com/license",
        "variant": node["name"], "gltfUrl": entry["url"],
        "gltfSha256": hashlib.sha256(original).hexdigest(),
        "sourceBinaryMd5DeclaredNotFullyVerified": source["md5"],
        "ranges": sources, "images": downloaded,
    }
    (folder / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(asset, node["name"], "geometry bytes", len(blob), "textures", len(downloaded), flush=True)


if __name__ == "__main__":
    prepare("pine_tree_01", 1)
    prepare("fir_tree_01", 2)
