import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type CreditEntry,
  type Credits,
  creditProblems,
} from "../../src/lib/world/credits.ts";
import {
  DISPLAY_CASE,
  DISPLAY_CASE_LIGHT_Y,
  DISPLAY_CASES,
  DISPLAY_ITEMS,
  DISPLAY_MODEL_FILES,
  type DisplayItemId,
  displayCaseLevel,
  displayCaseLightPosition,
  displayCaseStoredEnabled,
  displayMeshCastsShadow,
  displayModelFit,
  ITEM_FLOOR_Y,
} from "../../src/lib/world/display-cases.ts";
import {
  buildFootballHelmet,
  HELMET_PARTS,
  LIVERY,
  liveryAt,
} from "../../src/lib/world/football-helmet-asset.ts";
import { HOUSE, WALLS } from "../../src/lib/world/house.ts";
import {
  LIVING_MODELS,
  livingMeshes,
  modelBounds,
} from "../../src/lib/world/living.ts";
import { MAIN_ROOM, partBounds } from "../../src/lib/world/setup.ts";
import { SOFA_LAMP, SOFA_LAMPS } from "../../src/lib/world/sofa-lamps.ts";
import { PUBLIC } from "./glb.ts";

type V3 = [number, number, number];
type GlbNode = {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: V3;
  rotation?: [number, number, number, number];
  scale?: V3;
};
type GlbJson = {
  scene?: number;
  scenes: { nodes: number[] }[];
  nodes: GlbNode[];
  meshes: { primitives: { attributes: { POSITION: number } }[] }[];
  accessors: {
    min: number[];
    max: number[];
    normalized?: boolean;
    componentType: number;
  }[];
};

function glbJson(file: string): GlbJson {
  const buffer = readFileSync(new URL(file, PUBLIC));
  return JSON.parse(buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)));
}

/** Largest value of a normalized integer component type. */
const NORMALIZED: Record<number, number> = {
  5120: 127,
  5121: 255,
  5122: 32767,
  5123: 65535,
};

/** Rotate by quaternion, then scale-first TRS, as glTF composes it. */
function trs(node: GlbNode, [x, y, z]: V3): V3 {
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  [x, y, z] = [x * sx, y * sy, z * sz];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [tx, ty, tz] = [
    2 * (qy * z - qz * y),
    2 * (qz * x - qx * z),
    2 * (qx * y - qy * x),
  ];
  const r: V3 = [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
  const [px, py, pz] = node.translation ?? [0, 0, 0];
  return [r[0] + px, r[1] + py, r[2] + pz];
}

/** World corners of every primitive's accessor bounds in a shipped GLB. */
function glbCorners(file: string, only?: string): V3[] {
  const json = glbJson(file);
  const points: V3[] = [];
  const walk = (index: number, chain: GlbNode[]) => {
    const node = json.nodes[index];
    const path = [node, ...chain];
    if (node.mesh !== undefined && (only === undefined || node.name === only))
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        const unit = accessor.normalized
          ? NORMALIZED[accessor.componentType]
          : 1;
        const [lo, hi] = [accessor.min, accessor.max].map((v) =>
          v.map((n) => n / unit),
        );
        for (const i of [0, 1])
          for (const j of [0, 1])
            for (const k of [0, 1]) {
              let point: V3 = [
                i ? hi[0] : lo[0],
                j ? hi[1] : lo[1],
                k ? hi[2] : lo[2],
              ];
              for (const step of path) point = trs(step, point);
              points.push(point);
            }
      }
    for (const child of node.children ?? []) walk(child, path);
  };
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, []);
  return points;
}

/** Turn about the vertical, as three.js rotation.y does. */
const turn = ([x, y, z]: V3, yaw: number): V3 => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  y,
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

const boxOf = (points: V3[]) => ({
  min: [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a]))) as V3,
  max: [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a]))) as V3,
});

const sofaModel = LIVING_MODELS.find((model) => model.kind === "sofa");
assert.ok(sofaModel);
const sofa = modelBounds(sofaModel);
const sofaCenterX = (sofa.x0 + sofa.x1) / 2;

type Box = { x0: number; x1: number; z0: number; z1: number };
const footprint = ([x, , z]: readonly number[]): Box => ({
  x0: x - DISPLAY_CASE.plinth.width / 2,
  x1: x + DISPLAY_CASE.plinth.width / 2,
  z0: z - DISPLAY_CASE.plinth.depth / 2,
  z1: z + DISPLAY_CASE.plinth.depth / 2,
});
const apart = (a: Box, b: Box) =>
  a.x1 <= b.x0 || a.x0 >= b.x1 || a.z1 <= b.z0 || a.z0 >= b.z1;

const frontWall = WALLS.find((wall) => wall.id === "main-front");
assert.ok(frontWall);
const frontFace = frontWall.at - HOUSE.wall / 2;

describe("display case placement", () => {
  it("lines up three cases left to right behind the sofa", () => {
    assert.deepEqual(
      DISPLAY_CASES.map((item) => item.id),
      ["football-helmet", "moto-helmet", "jordan-1"],
    );
    const xs = DISPLAY_CASES.map((item) => item.base[0]);
    assert.ok(Math.abs(xs[0] - 2.15) < 0.05, "football helmet on the left");
    assert.ok(Math.abs(xs[1] - sofaCenterX) < 1e-9, "moto helmet centred");
    assert.ok(Math.abs(xs[2] - 3.4) < 0.05, "Jordan 1 on the right");
    assert.ok(
      Math.abs(sofaCenterX - xs[0] - (xs[2] - sofaCenterX)) < 1e-9,
      "symmetric about the sofa",
    );
    for (const item of DISPLAY_CASES) {
      assert.ok(item.base[2] >= 0.8 && item.base[2] <= 0.95, "on the row line");
      assert.equal(item.base[2], DISPLAY_CASES[0].base[2]);
    }
  });

  it("stands on the floor in the space between sofa back and front wall", () => {
    for (const item of DISPLAY_CASES) {
      const box = footprint(item.base);
      assert.equal(item.base[1], sofa.y0, "plinth on the floor boards");
      assert.ok(box.z0 >= 0.45, `${item.id} clears the sofa back`);
      assert.ok(box.z1 <= 1.15, `${item.id} keeps off the front wall`);
      assert.ok(box.z0 - sofa.z1 >= 0.3, "walkway behind the sofa");
      assert.ok(frontFace - box.z1 >= 0.2, "gap to the front wall");
      assert.ok(box.x0 > MAIN_ROOM.x0 && box.x1 < MAIN_ROOM.x1);
      assert.ok(box.x0 >= sofa.x0 - 0.05 && box.x1 <= sofa.x1 + 0.05);
    }
  });

  it("keeps the cases apart from each other", () => {
    for (let i = 1; i < DISPLAY_CASES.length; i++) {
      const gap =
        footprint(DISPLAY_CASES[i].base).x0 -
        footprint(DISPLAY_CASES[i - 1].base).x1;
      assert.ok(gap >= 0.15, `gap ${gap} between cases`);
    }
  });

  it("does not overlap the sofa lamps or the other living-room pieces", () => {
    const reach = Math.max(SOFA_LAMP.base.radius, SOFA_LAMP.shade.bottom);
    const meshes = livingMeshes();
    const others: Box[] = [
      ...[...meshes.solid, ...meshes.glow].map((part) => partBounds(part)),
      ...LIVING_MODELS.filter((model) => model.kind !== "rug").map(modelBounds),
      ...SOFA_LAMPS.map(({ base: [x, , z] }) => ({
        x0: x - reach,
        x1: x + reach,
        z0: z - reach,
        z1: z + reach,
      })),
    ];
    for (const item of DISPLAY_CASES)
      for (const other of others)
        assert.ok(apart(footprint(item.base), other), `${item.id} is clear`);
  });

  it("stays well under the eave", () => {
    const eave = HOUSE.floorY + HOUSE.main.height;
    const { plinth, glass } = DISPLAY_CASE;
    for (const item of DISPLAY_CASES) {
      const top = item.base[1] + plinth.height + glass.height;
      assert.ok(top < eave - 0.4, `${item.id} top ${top}`);
      assert.ok(top > sofa.y1, "glass rises above the sofa back");
    }
  });
});

describe("display case architecture", () => {
  it("has a museum-sized plinth and a glass case that fits on it", () => {
    const { plinth, glass, riser } = DISPLAY_CASE;
    assert.ok(plinth.height >= 0.75 && plinth.height <= 0.85);
    assert.ok(Math.abs(plinth.width - 0.42) < 1e-9);
    assert.ok(Math.abs(plinth.depth - 0.42) < 1e-9);
    assert.ok(glass.width <= plinth.width && glass.depth <= plinth.depth);
    assert.ok(riser.width < glass.width && riser.depth < glass.depth);
    assert.equal(ITEM_FLOOR_Y, plinth.height + riser.height);
  });

  it("uses clear, low-roughness glass", () => {
    const glass = DISPLAY_CASE.materials.glass;
    assert.ok(glass.roughness <= 0.1);
    assert.ok(glass.metalness <= 0.15);
    assert.ok(glass.opacity <= 0.3);
  });

  it("hangs the light inside the glass, over the item", () => {
    const { plinth, glass } = DISPLAY_CASE;
    assert.ok(DISPLAY_CASE_LIGHT_Y > ITEM_FLOOR_Y);
    assert.ok(DISPLAY_CASE_LIGHT_Y < plinth.height + glass.height);
    for (const item of DISPLAY_CASES) {
      const [x, y, z] = displayCaseLightPosition(item);
      assert.equal(x, item.base[0]);
      assert.equal(z, item.base[2]);
      assert.equal(y, item.base[1] + DISPLAY_CASE_LIGHT_Y);
    }
  });
});

describe("display case items", () => {
  it("shows a licensed mesh in every case", () => {
    for (const { id } of DISPLAY_CASES) {
      const item = DISPLAY_ITEMS[id];
      assert.ok(
        existsSync(new URL(item.model.url.replace("/world/", ""), PUBLIC)),
        `${id} ships`,
      );
      assert.match(item.note, /not the owner's exact/i);
    }
    assert.deepEqual(
      [...DISPLAY_MODEL_FILES],
      [
        "/world/models/display-football-helmet.glb",
        "/world/models/display-offroad-helmet.glb",
        "/world/models/display-jordan-1.glb",
      ],
    );
  });

  it("shows an off-road helmet in the middle case, never a street helmet", () => {
    const item = DISPLAY_ITEMS["moto-helmet"];
    assert.equal(item.model.url, "/world/models/display-offroad-helmet.glb");
    assert.match(item.note, /recreated Fox V1 F-A18/);
    assert.match(item.note, /not the owner's exact Fox V1/);
    assert.ok(!DISPLAY_MODEL_FILES.some((url) => /street/.test(url)));
  });

  it("paints the F-A18 graphic into the off-road helmet's own UV atlas", () => {
    // Textured, not tinted: the runtime keeps the shipped materials.
    assert.equal(DISPLAY_ITEMS["moto-helmet"].model.tint, undefined);
    type Ref = { index: number };
    const json = glbJson("models/display-offroad-helmet.glb") as GlbJson & {
      extensionsUsed?: string[];
      images: { mimeType: string }[];
      materials: {
        name: string;
        alphaMode?: string;
        normalTexture?: Ref;
        pbrMetallicRoughness: {
          baseColorTexture?: Ref;
          roughnessFactor?: number;
          metallicFactor?: number;
        };
      }[];
      meshes: {
        primitives: { attributes: Record<string, number>; material: number }[];
      }[];
    };
    const parts = new Map(
      json.nodes
        .filter((node) => node.mesh !== undefined)
        .map((node) => {
          const primitive = json.meshes[node.mesh ?? 0].primitives[0];
          return [node.name, primitive] as const;
        }),
    );
    assert.deepEqual([...parts.keys()].sort(), [
      "goggle-frame",
      "goggle-lens",
      "goggle-strap",
      "liner",
      "mouth-vent",
      "shell",
      "visor",
      "visor-screws",
    ]);
    for (const [name, primitive] of parts)
      for (const attribute of ["TEXCOORD_0", "NORMAL", "TANGENT"])
        assert.ok(attribute in primitive.attributes, `${name} ${attribute}`);
    const material = (name: string) => {
      const primitive = parts.get(name);
      assert.ok(primitive, name);
      return json.materials[primitive.material];
    };
    const paint = material("shell");
    assert.equal(paint.name, "fa18-paint");
    assert.equal(material("visor"), paint);
    const { baseColorTexture, roughnessFactor, metallicFactor } =
      paint.pbrMetallicRoughness;
    assert.ok(baseColorTexture, "painted base color");
    assert.ok(paint.normalTexture, "source normal map kept");
    assert.equal(metallicFactor, 0);
    // Satin paint, well short of the old gloss tint.
    assert.ok((roughnessFactor ?? 1) >= 0.35 && (roughnessFactor ?? 1) <= 0.6);
    for (const name of [
      "liner",
      "goggle-frame",
      "goggle-strap",
      "goggle-lens",
    ]) {
      const kept = material(name);
      assert.notEqual(kept, paint, `${name} is not repainted`);
      assert.deepEqual(
        kept.pbrMetallicRoughness.baseColorTexture,
        baseColorTexture,
        `${name} keeps its source texels in the same atlas`,
      );
      assert.deepEqual(kept.normalTexture, paint.normalTexture);
    }
    assert.equal(material("goggle-lens").alphaMode, "BLEND");
    assert.deepEqual(
      json.images.map((image) => image.mimeType),
      ["image/webp", "image/webp"],
    );
    assert.ok(
      !json.extensionsUsed?.includes("KHR_materials_transmission"),
      "no transmission pass",
    );
  });

  it("projects the off-road helmet's peak past the chin, still mounted at the back", () => {
    // Source units, +x front: the source peak stopped 0.13 short of the chin.
    const file = "models/display-offroad-helmet.glb";
    const visor = boxOf(glbCorners(file, "visor"));
    const shell = boxOf(glbCorners(file, "shell"));
    const screws = boxOf(glbCorners(file, "visor-screws"));
    const overhang = visor.max[0] - shell.max[0];
    assert.ok(overhang >= 2.5 && overhang <= 4, `peak overhang ${overhang}`);
    // The rear stays where it was, on the shell and over its screws.
    assert.ok(
      Math.abs(visor.min[0] - 0.69) < 0.05,
      `peak rear ${visor.min[0]}`,
    );
    assert.ok(
      Math.abs(visor.min[1] - 172.48) < 0.05,
      `peak base ${visor.min[1]}`,
    );
    assert.ok(visor.min[0] < screws.min[0] && screws.max[0] < 9);
  });

  it("derives the off-road helmet with a pinned, reproducible script", () => {
    const script = readFileSync(
      new URL("../../scripts/prepare-display-offroad.mjs", import.meta.url),
      "utf8",
    );
    assert.match(
      script,
      /72662d520218577c66c6ec5e4679b502200c65789a0e453a5e50cf7f8952c1f6/,
    );
    assert.match(script, /public\/world\/models\/display-offroad-helmet\.glb/);
    assert.match(script, /"4\.5\.1"/);
  });

  it("credits Pieter Ferreira's off-road helmet under CC BY 4.0, from Sketchfab", () => {
    const page =
      "https://sketchfab.com/3d-models/off-road-helmet-c9d968e024b749a7a9d0e257277a2d5c";
    const credits: Credits = JSON.parse(
      readFileSync(new URL("credits.json", PUBLIC), "utf8"),
    );
    assert.deepEqual(creditProblems(credits), []);
    const entry: (CreditEntry & { changes?: string }) | undefined =
      credits.assets.find(
        (asset) => asset.file === "models/display-offroad-helmet.glb",
      );
    assert.ok(entry, "credited");
    assert.equal(entry.author, "Pieter Ferreira");
    assert.equal(entry.license, "CC-BY-4.0");
    assert.equal(entry.source, page);
    assert.match(entry.changes ?? "", /not the owner's exact Fox V1/i);
    assert.match(entry.changes ?? "", /F-A18/);
    assert.match(entry.changes ?? "", /approximat/);
    // The photo guided the paint; it is neither shipped nor licensed.
    const reference = (
      entry as { graphicReference?: { url: string; note: string } }
    ).graphicReference;
    assert.equal(reference?.url, "https://www.ebay.com/itm/157680317522");
    assert.match(reference?.note ?? "", /front/);
    assert.match(reference?.note ?? "", /not shipped/);
    assert.deepEqual(
      entry.sourceFiles.map((file) => [file.url, file.bytes, file.sha256]),
      [
        [
          page,
          6546284,
          "72662d520218577c66c6ec5e4679b502200c65789a0e453a5e50cf7f8952c1f6",
        ],
      ],
    );
    const pack = credits.packs.find((item) => item.id === entry.pack);
    assert.equal(pack?.authorUrl, "https://sketchfab.com/Badboy17Aiden");
    assert.match(pack?.licenseEvidence.quote ?? "", /CC-BY-4.0/);
  });

  it("shows an original SpeedFlex-inspired helmet, honestly labelled, with no runtime tint", () => {
    const item = DISPLAY_ITEMS["football-helmet"];
    assert.equal(item.model.url, "/world/models/display-football-helmet.glb");
    // Painted in its own UV atlas, like the off-road helmet and the Jordans.
    assert.equal(item.model.tint, undefined);
    assert.equal(DISPLAY_ITEMS["jordan-1"].model.tint, undefined);
    assert.match(item.note, /SpeedFlex-inspired/);
    assert.match(item.note, /not an exact Riddell/i);
    assert.match(item.note, /not the owner's exact/i);
    assert.doesNotMatch(item.note, /Generic football helmet/);
  });

  type HelmetGlb = GlbJson & {
    accessors: { count: number }[];
    extensionsUsed?: string[];
    images: { mimeType: string; bufferView: number }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
    textures: {
      source?: number;
      extensions?: { EXT_texture_webp?: { source: number } };
    }[];
    materials: {
      name: string;
      alphaMode?: string;
      doubleSided?: boolean;
      pbrMetallicRoughness: {
        baseColorFactor?: number[];
        baseColorTexture?: { index: number };
        metallicRoughnessTexture?: { index: number };
        roughnessFactor?: number;
        metallicFactor?: number;
      };
    }[];
    meshes: {
      primitives: {
        attributes: Record<string, number>;
        material: number;
        indices: number;
      }[];
    }[];
  };
  const helmetGlb = () =>
    glbJson("models/display-football-helmet.glb") as HelmetGlb;
  const helmetParts = (json: HelmetGlb) =>
    new Map(
      json.nodes
        .filter((node) => node.mesh !== undefined)
        .map((node) => [
          node.name ?? "",
          json.meshes[node.mesh ?? 0].primitives[0],
        ]),
    );

  it("ships the football helmet as named SpeedFlex-style parts", () => {
    const json = helmetGlb();
    const parts = helmetParts(json);
    assert.deepEqual([...parts.keys()].sort(), [...HELMET_PARTS].sort());
    for (const name of [
      "shell",
      "shell-edge",
      "flex-panel",
      "padding",
      "facemask",
      "facemask-clips",
      "eye-shield",
    ])
      assert.ok(parts.has(name), name);
    // Modelled topology, not a primitive sphere and a few boxes.
    const triangles = (name: string) => {
      const primitive = parts.get(name);
      assert.ok(primitive, name);
      return json.accessors[primitive.indices].count / 3;
    };
    assert.ok(triangles("shell") > 20_000, `shell ${triangles("shell")}`);
    assert.ok(triangles("facemask") > 5_000, "curved facemask bars");
    assert.ok(triangles("padding") > 2_000, "padded liner");
    // The shell has a thickness: the edge part rims its openings.
    assert.ok(triangles("shell-edge") > 2_000, "shell edge and lip");
  });

  it("maps a gold and black horn livery through the shell's UV atlas", () => {
    const json = helmetGlb();
    const parts = helmetParts(json);
    const material = (name: string) => {
      const primitive = parts.get(name);
      assert.ok(primitive, name);
      return json.materials[primitive.material];
    };
    const livery = material("shell");
    assert.equal(material("flex-panel"), livery, "panel shares the livery");
    const pbr = livery.pbrMetallicRoughness;
    assert.ok(pbr.baseColorTexture, "livery atlas");
    assert.ok(pbr.metallicRoughnessTexture, "satin gold, matte horns");
    for (const name of ["shell", "flex-panel"]) {
      const primitive = parts.get(name);
      assert.ok(primitive && "TEXCOORD_0" in primitive.attributes, name);
    }
    // Quantized into 0..1, so no texture transform is needed.
    const shellUv =
      json.accessors[parts.get("shell")?.attributes.TEXCOORD_0 ?? -1];
    assert.ok(shellUv.normalized, "normalized UVs");
    // The atlas is an embedded 2:1 WebP, wrapped around the whole shell.
    const glb = readFileSync(
      new URL("models/display-football-helmet.glb", PUBLIC),
    );
    const binStart = 20 + glb.readUInt32LE(12) + 8;
    const texture = json.textures[pbr.baseColorTexture?.index ?? 0];
    const image =
      json.images[
        texture.extensions?.EXT_texture_webp?.source ?? texture.source ?? -1
      ];
    assert.equal(image.mimeType, "image/webp");
    const view = json.bufferViews[image.bufferView];
    const webp = glb.subarray(
      binStart + (view.byteOffset ?? 0),
      binStart + (view.byteOffset ?? 0) + view.byteLength,
    );
    assert.equal(webp.toString("latin1", 8, 12), "WEBP");
    for (const name of ["facemask", "padding", "eye-shield"])
      assert.equal(
        material(name).pbrMetallicRoughness.baseColorTexture,
        undefined,
        `${name} is not painted with the livery`,
      );
  });

  it("keeps the eye shield a separate, black tinted part behind a black cage", () => {
    const json = helmetGlb();
    const parts = helmetParts(json);
    const material = (name: string) => {
      const primitive = parts.get(name);
      assert.ok(primitive, name);
      return json.materials[primitive.material];
    };
    const shield = material("eye-shield");
    assert.equal(shield.alphaMode, "BLEND");
    const [sr, sg, sb, alpha] =
      shield.pbrMetallicRoughness.baseColorFactor ?? [];
    assert.ok(Math.max(sr, sg, sb) <= 0.01, "black visor tint");
    assert.ok(alpha !== undefined && alpha >= 0.4, `shield alpha ${alpha}`);
    assert.ok((shield.pbrMetallicRoughness.roughnessFactor ?? 1) <= 0.12);
    for (const name of ["shell", "facemask", "padding"])
      assert.notEqual(material(name), shield, name);
    const cage = material("facemask").pbrMetallicRoughness;
    const [r, g, b] = cage.baseColorFactor ?? [1, 1, 1];
    assert.ok(Math.max(r, g, b) <= 0.03, "black facemask");
    assert.equal(material("facemask").alphaMode ?? "OPAQUE", "OPAQUE");
    // The shield sits in front of the face, behind the cage's front bars.
    const file = "models/display-football-helmet.glb";
    const shieldBox = boxOf(glbCorners(file, "eye-shield"));
    const shellBox = boxOf(glbCorners(file, "shell"));
    const cageBox = boxOf(glbCorners(file, "facemask"));
    assert.ok(shieldBox.max[0] < cageBox.max[0], "behind the cage");
    assert.ok(shieldBox.max[0] > shellBox.max[0], "in front of the brow");
    assert.ok(cageBox.max[0] > shellBox.max[0] + 0.04, "cage stands off");
  });

  it("casts no solid shadow from the tinted eye shield, and keeps every other shadow", () => {
    // As GLTFLoader reads a material: BLEND is transparent, opacity is the
    // base color alpha.
    type Material = {
      alphaMode?: string;
      pbrMetallicRoughness?: { baseColorFactor?: number[] };
    };
    const noShadow: string[] = [];
    for (const url of DISPLAY_MODEL_FILES) {
      const json = glbJson(url.replace("/world/", "")) as unknown as {
        nodes: GlbNode[];
        materials: Material[];
        meshes: { primitives: { material?: number }[] }[];
      };
      for (const node of json.nodes) {
        if (node.mesh === undefined) continue;
        const casts = json.meshes[node.mesh].primitives.every(
          ({ material }) => {
            const m = material === undefined ? {} : json.materials[material];
            return displayMeshCastsShadow({
              transparent: m.alphaMode === "BLEND",
              opacity: m.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1,
            });
          },
        );
        if (!casts) noShadow.push(`${url}#${node.name}`);
      }
    }
    assert.deepEqual(noShadow, [
      "/world/models/display-football-helmet.glb#eye-shield",
    ]);
    assert.equal(
      displayMeshCastsShadow({ transparent: false, opacity: 0.1 }),
      true,
      "opacity alone does not drop an opaque mesh's shadow",
    );
  });

  it("leaves the visor window open: no facemask bar crosses the eye shield", () => {
    const { parts } = buildFootballHelmet("preview");
    const part = (name: string) => {
      const found = parts.find((p) => p.name === name);
      assert.ok(found, name);
      return found;
    };
    const points = (name: string) => {
      const { positions } = part(name);
      return Array.from({ length: positions.length / 3 }, (_, i) => [
        positions[i * 3],
        positions[i * 3 + 1],
        positions[i * 3 + 2],
      ]) as V3[];
    };
    const shield = boxOf(points("eye-shield"));
    // A full eye window, top bar to eye bar, not a strip under the brow.
    assert.ok(
      shield.max[1] - shield.min[1] >= 0.045,
      `window height ${shield.max[1] - shield.min[1]}`,
    );
    assert.ok(shield.max[2] - shield.min[2] >= 0.15, "window width");
    // Inside the window, clear of the top and eye bars that frame it, nothing
    // of the cage stands in front of the shield.
    const halfZ = (shield.max[2] - shield.min[2]) / 2;
    const blocking = points("facemask").filter(
      ([x, y, z]) =>
        x > shield.min[0] &&
        y > shield.min[1] + 0.012 &&
        y < shield.max[1] - 0.012 &&
        Math.abs(z) < halfZ * 0.75,
    );
    assert.equal(blocking.length, 0, "no vertical bars across the visor");
    // A single front sheet, not a closed slab that sorts against itself.
    const { positions, normals } = part("eye-shield");
    let outward = 0;
    for (let i = 0; i < normals.length; i += 3)
      if (normals[i] * positions[i] + normals[i + 2] * positions[i + 2] > 0)
        outward++;
    assert.equal(outward, normals.length / 3, "one outward sheet");
  });

  it("builds the helmet from a deterministic, side-effect-free original builder", () => {
    const a = buildFootballHelmet("preview");
    const b = buildFootballHelmet("preview");
    assert.deepEqual(
      a.parts.map((part) => part.name),
      [...HELMET_PARTS],
    );
    for (const [i, part] of a.parts.entries()) {
      assert.deepEqual(part.positions, b.parts[i].positions, part.name);
      assert.equal(part.normals.length, part.positions.length, part.name);
      for (const index of part.indices)
        assert.ok(index < part.positions.length / 3, part.name);
      if (part.uvs)
        for (const value of part.uvs)
          assert.ok(value >= 0 && value <= 1, `${part.name} uv ${value}`);
    }
    assert.deepEqual(a.atlas.data, b.atlas.data, "same atlas bytes");
    // The shell's UVs wrap the whole atlas: back seam to back seam, crown down.
    const shell = a.parts.find((part) => part.name === "shell");
    assert.ok(shell?.uvs, "shell UVs");
    const u = shell.uvs.filter((_, i) => i % 2 === 0);
    const v = shell.uvs.filter((_, i) => i % 2 === 1);
    assert.ok(Math.min(...u) < 0.01 && Math.max(...u) > 0.99, "wraps around");
    assert.ok(Math.min(...v) < 0.01 && Math.max(...v) > 0.7, "crown to jaw");
    const panel = a.parts.find((part) => part.name === "flex-panel");
    assert.ok(panel?.uvs && panel.uvs.length > 0, "panel UVs");
    assert.equal(a.atlas.width, 2 * a.atlas.height, "2:1 wrap atlas");
  });

  it("paints black Rams-style horns on gold, mirrored on both sides", () => {
    const deg = Math.PI / 180;
    let horn = 0;
    let side = 0;
    for (let az = 30; az <= 150; az += 5)
      for (let el = -40; el <= 50; el += 5) {
        const right = liveryAt(az * deg, el * deg);
        assert.equal(liveryAt(-az * deg, el * deg), right, `${az} ${el}`);
        side++;
        if (right === "horn") horn++;
      }
    const share = horn / side;
    assert.ok(share > 0.2 && share < 0.6, `horn share ${share}`);
    // One continuous curled horn a side: brow, temple arch, behind and under
    // the ear, then an inner curl in front of the ear, kept on the shell, with
    // a gold channel inside the spiral.
    for (const [az, el] of [
      [10, 24],
      [30, 35],
      [50, 42],
      [82, 36],
      [108, 18],
      [128, -6],
      [114, -42],
      [90, -45],
      [71, -31],
      [73, -19],
      [84, -9],
    ])
      assert.equal(liveryAt(az * deg, el * deg), "horn", `horn at ${az} ${el}`);
    for (const [az, el] of [
      [80, 15],
      [100, -20],
      [80, -22],
    ])
      assert.equal(liveryAt(az * deg, el * deg), "gold", `gold at ${az} ${el}`);
    // A single 8-connected region on the right side: no chop, no temple gap.
    const cells = new Set<string>();
    for (let az = 0; az <= 180; az++)
      for (let el = -70; el <= 89; el++)
        if (liveryAt(az * deg, el * deg) === "horn") cells.add(`${az},${el}`);
    const [first] = cells;
    assert.ok(first, "horn cells");
    const seen = new Set([first]);
    const queue = [first];
    while (queue.length) {
      const [az, el] = (queue.pop() ?? "").split(",").map(Number);
      for (let da = -1; da <= 1; da++)
        for (let de = -1; de <= 1; de++) {
          const key = `${az + da},${el + de}`;
          if (cells.has(key) && !seen.has(key)) {
            seen.add(key);
            queue.push(key);
          }
        }
    }
    assert.equal(seen.size, cells.size, "one continuous horn");
    // Metallic gold under satin black.
    assert.ok(LIVERY.gold.metalness >= 0.4 && LIVERY.gold.roughness <= 0.35);
    assert.ok(Math.max(...LIVERY.horn.color) <= 20, "jet black horns");
    // Gold crown and forehead panel; the back carries the owner's #32.
    assert.equal(liveryAt(0, 85 * deg), "gold");
    assert.equal(liveryAt(0, 38 * deg), "gold");
    assert.equal(liveryAt(Math.PI, 70 * deg), "gold");
    const back: string[] = [];
    for (let az = 166; az <= 194; az += 2)
      for (let el = -10; el <= 16; el += 2)
        back.push(liveryAt(az * deg, el * deg));
    assert.ok(back.includes("number"), "#32 on the back");
    assert.ok(back.includes("gold"), "on gold");
  });

  it("fits each shipped mesh uniformly, grounded, inside the glass and under the spot", () => {
    const { glass } = DISPLAY_CASE;
    const inner = Math.min(glass.width, glass.depth) / 2 - glass.thickness;
    for (const placement of DISPLAY_CASES) {
      const item = DISPLAY_ITEMS[placement.id];
      const corners = glbCorners(item.model.url.replace("/world/", "")).map(
        (point) => turn(point, item.model.frontYaw),
      );
      const fit = displayModelFit(boxOf(corners));
      assert.equal(typeof fit.scale, "number", "one uniform scale");
      assert.ok(fit.scale > 0);
      const placed = corners.map(([x, y, z]) =>
        turn(
          [
            x * fit.scale + fit.offset[0],
            y * fit.scale + fit.offset[1],
            z * fit.scale + fit.offset[2],
          ],
          placement.itemYaw,
        ),
      );
      const box = boxOf(placed);
      assert.ok(Math.abs(box.min[1]) < 1e-9, `${placement.id} on the riser`);
      for (const [x, , z] of placed)
        assert.ok(Math.hypot(x, z) < inner, `${placement.id} clears the glass`);
      const top = ITEM_FLOOR_Y + box.max[1];
      assert.ok(top < DISPLAY_CASE_LIGHT_Y - 0.03, `${placement.id} top`);
      // Real-world scale: a helmet or shoe, not a toy or a statue.
      const length = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]);
      assert.ok(length > 0.22 && length < 0.34, `${placement.id} ${length}`);
    }
  });

  it("turns each mesh's front toward the room before the case yaw", () => {
    // Facemask (football), chin guard (off-road) and toes (Jordan) sit on
    // the built +x, source +x and source +z.
    const front = (id: DisplayItemId, axis: 0 | 2) => {
      const [x, , z] = turn(
        axis === 0 ? [1, 0, 0] : [0, 0, 1],
        DISPLAY_ITEMS[id].model.frontYaw,
      );
      assert.ok(Math.abs(x) < 1e-9 && Math.abs(z + 1) < 1e-9, id);
    };
    front("football-helmet", 0);
    front("moto-helmet", 0);
    front("jordan-1", 2);
  });
});

describe("display case switch and light", () => {
  it("starts on and remembers each case's switch under its own key", () => {
    assert.equal(displayCaseStoredEnabled(null), true);
    assert.equal(displayCaseStoredEnabled("true"), true);
    assert.equal(displayCaseStoredEnabled("false"), false);
    const keys = DISPLAY_CASES.map((item) => item.storageKey);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) assert.ok(key.startsWith("world:display-case-"));
  });

  it("stays soft and controlled", () => {
    assert.ok(DISPLAY_CASE.pointIntensity >= 0.5);
    assert.ok(DISPLAY_CASE.pointIntensity <= 0.8);
    assert.ok(DISPLAY_CASE.pointDistance <= 1.2);
    assert.ok(DISPLAY_CASE.puckEmissive <= 0.8);
    assert.equal(DISPLAY_CASE.lightDecay, 2);
  });

  it("is full at night once switched on, completely off by day", () => {
    for (const h of [18, 21, 0, 3, 5.99])
      assert.equal(displayCaseLevel(true, h), 1, `on at ${h}h`);
    for (const h of [6, 9, 12, 15, 17.99])
      assert.equal(displayCaseLevel(true, h), 0, `off at ${h}h`);
  });

  it("is dark when switched off or with the power off", () => {
    assert.equal(displayCaseLevel(false, 21), 0);
    assert.equal(displayCaseLevel(true, 21, false), 0);
    assert.equal(displayCaseLevel(false, 12, false), 0);
  });
});
