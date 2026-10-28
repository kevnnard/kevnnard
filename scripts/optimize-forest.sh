#!/usr/bin/env bash
# Run prepare-forest.py first. Sources remain in an ignored, rebuildable cache.
# Usage: bash scripts/optimize-forest.sh
# Each LOD starts from the source: simplifying an already reduced needle mesh
# a second time erased its canopy. Keep a much tighter geometric error bound.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/models/forest
for species in pine fir; do
  asset="${species}_tree_01"
  near=0.04
  far=0.015
  if [[ "$species" == fir ]]; then near=0.16; far=0.08; fi
  for lod in near far; do
    ratio="$near"; size=1024; error=0.001
    if [[ "$lod" == far ]]; then ratio="$far"; size=512; error=0.002; fi
    pnpm dlx @gltf-transform/cli@4.5.1 optimize \
      "node_modules/.cache/forest-source/$asset/tree.gltf" "public/models/forest/$species-$lod.glb" \
      --compress meshopt --texture-compress webp --texture-size "$size" \
      --simplify-error "$error" --simplify-ratio "$ratio" --join false --palette false
  done
done
