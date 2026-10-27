#!/usr/bin/env bash
# Rebuild browser assets from the separately recovered legacy repository.
set -euo pipefail
source_dir="${1:?Usage: bash scripts/optimize-room.sh /absolute/path/to/FRONTEND_KEVNNARD}"
output="public/models/room"
mkdir -p "$output"
for entry in 'office office' 'escritorio desk' 'silla chair' 'sala lounge'; do
  read -r source_name target_name <<< "$entry"
  error=0.001
  ratio=0.15
  if [[ "$target_name" == desk || "$target_name" == chair ]]; then
    error=0.01
    ratio=0.02
  fi
  pnpm dlx @gltf-transform/cli@4.5.1 optimize \
    "$source_dir/public/models3D/$source_name.gltf" "$output/$target_name.glb" \
    --compress meshopt --texture-compress webp --texture-size 1024 \
    --simplify-error "$error" --simplify-ratio "$ratio" --join false --palette false
done
