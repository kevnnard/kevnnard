#!/usr/bin/env python3
"""Record offline tree provenance after optimize-forest.sh (no network calls)."""
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parent.parent
output = ROOT / "public/models/forest"
assets = []
for species in ["pine", "fir"]:
    source = json.loads((ROOT / "node_modules/.cache/forest-source" / (species + "_tree_01") / "provenance.json").read_text())
    files = []
    for lod in ["near", "far"]:
        path = output / (species + "-" + lod + ".glb")
        data = path.read_bytes()
        gltf = json.loads(data[20:20 + struct.unpack_from("<I", data, 12)[0]])
        triangles = sum(gltf["accessors"][primitive["indices"]]["count"] // 3
                        for mesh in gltf["meshes"] for primitive in mesh["primitives"])
        files.append({"path": path.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "triangles": triangles})
    assets.append({
        "species": species, "source": source["source"], "license": source["license"],
        "licenseUrl": source["licenseUrl"],
        "authors": {"Rob Tuytel": "photography", "Rico Cilliers": "modeling"},
        "selectedVariant": source["variant"], "gltfUrl": source["gltfUrl"],
        "gltfSha256": source["gltfSha256"],
        "extractedGeometryBytes": sum(r["bytes"] for r in source["ranges"]),
        "extractedRangesSha256": hashlib.sha256(json.dumps(source["ranges"], sort_keys=True).encode()).hexdigest(),
        "sourceBinaryMd5DeclaredNotFullyVerified": source["sourceBinaryMd5DeclaredNotFullyVerified"],
        "files": files,
    })
(output / "manifest.json").write_text(json.dumps({
    "license": "CC0-1.0", "provider": "Poly Haven", "runtimeExternalRequests": False,
    "attributionEvidence": "https://api.polyhaven.com/info/{asset}",
    "processing": "Selected one source variant using verified HTTP ranges; meshopt geometry, WebP 1024px near/512px far textures. Full binary source MD5 is declared, not verified; selected ranges have locally recorded SHA-256.",
    "assets": assets,
}, indent=2) + "\n")
print("Forest manifest:", sum(f["bytes"] for a in assets for f in a["files"]), "bytes")
