// The desk keyboard's printed legends (keyboard-faithful T1): one merged
// decal of a quad per cap (setup.ts keyboardLegendQuads) over the prebaked
// atlas (scripts/prepare-keyboard-legends.mjs), one draw, no shadows.
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import { LEGEND_ATLAS } from "@/lib/world/keyboard-layout.ts";
import { keyboardLegendQuads } from "@/lib/world/setup.ts";

/** The legend decal; `onLoad` runs once its atlas is ready to draw. */
export function keyboardLegends(onLoad: () => void) {
  const { positions, uvs, indices } = keyboardLegendQuads();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const texture = new TextureLoader().load(LEGEND_ATLAS.url, onLoad);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({
    map: texture,
    roughness: 0.6,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "setup-keyboard-legends";
  mesh.receiveShadow = true;
  return { mesh, material, texture };
}
