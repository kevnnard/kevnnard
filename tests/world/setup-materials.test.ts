import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Credits } from "../../src/lib/world/credits.ts";
import {
  NORMAL_PATTERNS,
  NORMAL_SIZE,
  normalPixels,
} from "../../src/lib/world/normals.ts";
import {
  SETUP,
  SETUP_COLORS,
  SETUP_MATERIALS,
  type SetupMaterialId,
  type SetupPart,
  setupMeshes,
} from "../../src/lib/world/setup.ts";
import { SETUP_SURFACES, TEXTURES } from "../../src/lib/world/textures.ts";
import { PUBLIC } from "./glb.ts";

const meshes = setupMeshes();
const using = (id: SetupMaterialId) =>
  meshes.solid.filter((part: SetupPart) => part.material === id);
const credits = (): Credits =>
  JSON.parse(readFileSync(new URL("credits.json", PUBLIC), "utf8"));

describe("gaming setup materials (T4g, S11)", () => {
  it("maps every solid part to a known material, one draw each", () => {
    const ids = new Set(meshes.solid.map((part) => part.material));
    for (const id of ids) assert.ok(id in SETUP_MATERIALS, id);
    assert.equal(SETUP.draws, ids.size + 2, "solids plus glow and glass");
    assert.ok(SETUP.draws <= 12, `${SETUP.draws} draws`);
  });

  it("puts each part on its intended material", () => {
    assert.ok(using("grille").length === 2, "one grille per speaker");
    assert.ok(using("cone").length === 4, "woofer and tweeter per speaker");
    assert.ok(using("panel").length >= 5, "PC case and frame");
    assert.ok(using("powder").length >= 10, "desk frame and legs");
    assert.ok(using("laminate").length === 2, "desk top and front edge");
    assert.ok(using("keycap").length === 4, "key rows");
    assert.ok(using("fabric").length === 1, "mousepad");
    assert.ok(using("base").length >= 10, "chair star base and casters");
    assert.ok(using("leather").length >= 2, "seat and back");
    for (const part of meshes.solid)
      if (part.color === SETUP_COLORS.trim)
        assert.equal(part.material, "leather", "white trim is leather");
    assert.ok(
      using("leather").some((part) => part.color === SETUP_COLORS.trim),
    );
    assert.ok(using("satin").length >= 10, "bezels and cabinets");
  });

  it("tunes PBR per material", () => {
    const M = SETUP_MATERIALS;
    assert.equal(M.powder.metalness, 0.35);
    assert.equal(M.powder.roughness, 0.45);
    assert.equal(M.powder.normal, "noise");
    assert.ok(M.powder.normalScale <= 0.2, "very subtle");
    assert.equal(M.laminate.roughness, 0.6);
    assert.ok(M.laminate.clearcoat > 0 && M.laminate.clearcoat <= 0.4);
    assert.equal(M.satin.roughness, 0.5);
    assert.equal(M.fabric.normal, "weave");
    assert.equal(M.cone.normal, "radial");
    assert.equal(M.keycap.normal, "keycap");
    assert.equal(M.grille.surface, "grille");
    assert.equal(M.panel.surface, "panel");
    assert.equal(M.leather.surface, "leather");
  });

  it("generates tileable unit normals once, from original code", () => {
    for (const pattern of NORMAL_PATTERNS) {
      const data = normalPixels(pattern);
      assert.equal(data, normalPixels(pattern), "cached");
      assert.equal(data.length, NORMAL_SIZE * NORMAL_SIZE * 4);
      const at = (x: number, y: number) => {
        const i = (y * NORMAL_SIZE + x) * 4;
        return [data[i], data[i + 1], data[i + 2]].map((v) => v / 127.5 - 1);
      };
      let inner = 0;
      let seam = 0;
      for (let y = 0; y < NORMAL_SIZE; y++) {
        const [a, b, c] = at(NORMAL_SIZE - 1, y);
        assert.ok(Math.abs(Math.hypot(a, b, c) - 1) < 0.03, pattern);
        assert.ok(c > 0, "points out");
        for (let x = 1; x < NORMAL_SIZE; x++) {
          const p = at(x - 1, y);
          const q = at(x, y);
          inner = Math.max(inner, Math.abs(p[0] - q[0]));
        }
        seam = Math.max(seam, Math.abs(at(0, y)[0] - a));
      }
      assert.ok(seam <= inner + 0.02, `${pattern} wraps (${seam}/${inner})`);
    }
    const original = (credits().original ?? []).find(
      (entry) => entry.id === "setup-normals",
    );
    assert.equal(original?.source, "src/lib/world/normals.ts");
  });

  it("ships the grille and panel maps credited, 1024, hashed, within 2.5 MB", () => {
    const textures = credits().textures ?? [];
    let total = 0;
    for (const surface of SETUP_SURFACES) {
      const { name, maps } = TEXTURES[surface];
      for (const map of maps) {
        const file = `textures/${name}-${map}.webp`;
        const entry = textures.find((item) => item.file === file);
        assert.ok(entry, `${file} credited`);
        assert.equal(entry.author, "CreativeTrio");
        assert.equal(entry.license, "CC0-1.0");
        assert.deepEqual([entry.width, entry.height], [1024, 1024]);
        const data = readFileSync(new URL(file, PUBLIC));
        assert.equal(entry.bytes, data.length, file);
        assert.equal(
          entry.sha256,
          createHash("sha256").update(data).digest("hex"),
        );
        total += data.length;
      }
    }
    assert.deepEqual(TEXTURES.grille.maps, [
      "color",
      "normal",
      "roughness",
      "opacity",
    ]);
    assert.equal(TEXTURES.grille.name, "Metal_Mesh_009");
    assert.equal(TEXTURES.panel.name, "Stylized_Sci_fi_Metal_Panel_001");
    assert.ok(total <= 2_500_000, `${total} bytes`);
  });
});
