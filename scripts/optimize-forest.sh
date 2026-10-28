#!/usr/bin/env bash
# Run prepare-forest.py first. Sources remain in an ignored, rebuildable cache.
# Usage: bash scripts/optimize-forest.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/models/forest
for species in pine fir; do
  asset="${species}_tree_01"
  ratio=0.004
  [[ "$species" == fir ]] && ratio=0.025
  pnpm dlx @gltf-transform/cli@4.5.1 optimize \
    "node_modules/.cache/forest-source/$asset/tree.gltf" "public/models/forest/$species-near.glb" \
    --compress meshopt --texture-compress webp --texture-size 1024 \
    --simplify-error 0.025 --simplify-ratio "$ratio" --join false --palette false
  pnpm dlx @gltf-transform/cli@4.5.1 optimize \
    "public/models/forest/$species-near.glb" "public/models/forest/$species-far.glb" \
    --compress meshopt --texture-compress webp --texture-size 512 \
    --simplify-error 0.08 --simplify-ratio 0.12 --join false --palette false
done
