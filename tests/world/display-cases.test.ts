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
  DISPLAY_CASE_AIM,
  DISPLAY_CASE_LIGHT_Y,
  DISPLAY_CASE_SPOT_POSITION,
  DISPLAY_CASE_UPLIGHT_POSITION,
  DISPLAY_CASES,
  DISPLAY_ITEMS,
  DISPLAY_LIFT,
  DISPLAY_MODEL_FILES,
  DISPLAY_TURN,
  type DisplayItemId,
  displayCaseEnvIntensity,
  displayCaseLevel,
  displayCaseLightPosition,
  displayCaseStoredEnabled,
  displayLiftStep,
  displayMeshCastsShadow,
  displayModelFit,
  displayTurnStep,
  ITEM_FLOOR_Y,
} from "../../src/lib/world/display-cases.ts";
import { HOUSE, WALLS } from "../../src/lib/world/house.ts";
import {
  LIVING_MODELS,
  livingMeshes,
  modelBounds,
} from "../../src/lib/world/living.ts";
import { environmentIntensity } from "../../src/lib/world/palette.ts";
import { MAIN_ROOM, partBounds } from "../../src/lib/world/setup.ts";
import { SOFA_LAMP, SOFA_LAMPS } from "../../src/lib/world/sofa-lamps.ts";
import { PUBLIC } from "./glb.ts";

/** sha256 of the five Sayak product photos projected onto the off-road helmet. */
const SAYAK_PHOTOS = [
  "83c7477a20a75f8ab0cf162e54e1b1b851aa9974bbf4f618007fea7b160f3a38",
  "744345bb25868c8d06cb7468296674e97bf8aee65157ad0cc4aef4a69e971249",
  "b434d9cf1171d8ea83e73e72d7797696e3812582665544f6f8408aaa8e58700c",
  "6f55f68aa97f548aa0767f274e0616d62c4448788a11e92f9e0f9cdf3af402db",
  "f8e7ca60740b2fec9b53d41de4f6ae626fc61e1c09966aae0b79ed5c971ea530",
];

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

  it("shows senoaji's Fox X Supreme helmet in the middle case, baked from Sayak photos (T15)", () => {
    const item = DISPLAY_ITEMS["moto-helmet"];
    assert.equal(item.model.url, "/world/models/display-offroad-helmet.glb");
    // Textured, not tinted: the runtime keeps the shipped materials.
    assert.equal(item.model.tint, undefined);
    assert.match(item.note, /senoaji's "Fox X Supreme Helmet"/);
    assert.match(item.note, /CC BY 4\.0/);
    assert.match(item.note, /Fox V1 Sayak/);
    assert.match(item.note, /not the owner's exact helmet/i);
    assert.doesNotMatch(item.note, /recreated Fox V1 F-A18|Pieter Ferreira/);
    assert.ok(!DISPLAY_MODEL_FILES.some((url) => /street/.test(url)));
  });

  it("ships the off-road helmet as one baked shell without the goggles (T15)", () => {
    type Ref = { index: number };
    const json = glbJson("models/display-offroad-helmet.glb") as GlbJson & {
      accessors: { count: number }[];
      images: { mimeType: string }[];
      materials: {
        name: string;
        alphaMode?: string;
        pbrMetallicRoughness: {
          baseColorTexture?: Ref;
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
    const nodes = json.nodes.filter((node) => node.mesh !== undefined);
    assert.deepEqual(
      nodes.map((node) => node.name),
      ["shell"],
    );
    const primitives = json.meshes[nodes[0].mesh ?? 0].primitives;
    const materials = primitives.map((p) => json.materials[p.material]);
    assert.deepEqual(materials.map((m) => m.name).sort(), [
      "liner",
      "sayak-paint",
      "vent-mesh",
    ]);
    assert.ok(!json.materials.some((m) => /goggle/.test(m.name)), "no goggles");
    const paint = materials.find((m) => m.name === "sayak-paint");
    assert.ok(paint?.pbrMetallicRoughness.baseColorTexture, "baked texture");
    assert.ok(
      "TEXCOORD_0" in primitives[materials.indexOf(paint)].attributes,
      "UVs",
    );
    assert.equal(paint.pbrMetallicRoughness.metallicFactor, 0);
    const roughness = paint.pbrMetallicRoughness.roughnessFactor ?? 1;
    assert.ok(roughness >= 0.35 && roughness <= 0.6, "satin paint");
    for (const m of materials) assert.notEqual(m.alphaMode, "BLEND", m.name);
    assert.deepEqual(
      json.images.map((image) => image.mimeType),
      ["image/webp"],
    );
    const triangles = primitives.reduce(
      (sum, p) => sum + json.accessors[p.indices].count / 3,
      0,
    );
    assert.ok(triangles > 3_000 && triangles < 10_000, `${triangles}`);
  });

  it("derives the off-road helmet with a pinned, reproducible script (T15)", () => {
    const script = readFileSync(
      new URL("../../scripts/prepare-display-offroad-fox.mjs", import.meta.url),
      "utf8",
    );
    // The source archive and the five projected photos are pinned.
    for (const hash of [
      "fa74e45ffc828a418163ba9c8ac3dc0ee1ca77a791c0ebffe1731107c4bd2935",
      ...SAYAK_PHOTOS,
    ])
      assert.match(script, new RegExp(hash));
    assert.match(script, /public\/world\/models\/display-offroad-helmet\.glb/);
    assert.match(script, /scripts\/prepare-display-offroad-fox\.py/);
    assert.match(script, /"4\.5\.1"/);
    assert.ok(
      existsSync(
        new URL(
          "../../scripts/prepare-display-offroad-fox.py",
          import.meta.url,
        ),
      ),
      "Blender half",
    );
    assert.ok(
      !existsSync(
        new URL("../../scripts/prepare-display-offroad.mjs", import.meta.url),
      ),
      "the retired F-A18 painter is gone",
    );
  });

  it("credits senoaji's helmet under CC BY 4.0 and names the baked photos (T15)", () => {
    const page =
      "https://sketchfab.com/3d-models/fox-x-supreme-helmet-ac680d32d02b4a9cb769d29f4f545609";
    const credits: Credits = JSON.parse(
      readFileSync(new URL("credits.json", PUBLIC), "utf8"),
    );
    assert.deepEqual(creditProblems(credits), []);
    const entry:
      | (CreditEntry & {
          changes?: string;
          graphicReference?: { url: string; note: string };
        })
      | undefined = credits.assets.find(
      (asset) => asset.file === "models/display-offroad-helmet.glb",
    );
    assert.ok(entry, "credited");
    assert.equal(entry.author, "Muhammad Seno Aji (senoaji)");
    assert.equal(entry.license, "CC-BY-4.0");
    assert.equal(entry.source, page);
    assert.match(entry.changes ?? "", /goggles removed/);
    assert.match(entry.changes ?? "", /five .*Sayak.* product photos/);
    assert.match(entry.changes ?? "", /owner's choice/);
    assert.match(entry.changes ?? "", /no affiliation/);
    assert.equal(
      entry.graphicReference?.url,
      "https://www.motocard.com/en/helmets/fox-v1_sayak_2018_matte_red_003.aspx",
    );
    assert.match(entry.graphicReference?.note ?? "", /baked into the texture/);
    assert.match(
      entry.graphicReference?.note ?? "",
      /not covered by this license/,
    );
    assert.deepEqual(
      entry.sourceFiles.map((file) => [file.url, file.bytes, file.sha256]),
      [
        [
          page,
          681923,
          "fa74e45ffc828a418163ba9c8ac3dc0ee1ca77a791c0ebffe1731107c4bd2935",
        ],
      ],
    );
    const pack = credits.packs.find((item) => item.id === entry.pack);
    assert.equal(pack?.authorUrl, "https://sketchfab.com/senoaji");
    assert.ok(
      !credits.packs.some((item) => /pieter-ferreira/.test(item.id)),
      "the old off-road pack is gone",
    );
  });

  it("shows Exodusks' repainted SpeedFlex, honestly labelled, with no runtime tint (T7)", () => {
    const item = DISPLAY_ITEMS["football-helmet"];
    assert.equal(item.model.url, "/world/models/display-football-helmet.glb");
    // Painted in its own UV atlas, like the off-road helmet and the Jordans.
    assert.equal(item.model.tint, undefined);
    assert.equal(DISPLAY_ITEMS["jordan-1"].model.tint, undefined);
    assert.match(item.note, /Exodusks' Riddell SpeedFlex/);
    assert.match(item.note, /CC BY 4\.0/);
    assert.match(item.note, /Rams-style horns/);
    assert.match(item.note, /not the owner's exact helmet/i);
    assert.match(item.note, /no NFL or team logo/);
    assert.doesNotMatch(item.note, /built for this site/);
  });

  it("derives the football helmet with a pinned, reproducible script (T7)", () => {
    const script = readFileSync(
      new URL("../../scripts/prepare-display-football.mjs", import.meta.url),
      "utf8",
    );
    assert.match(
      script,
      /064297188d088fdcdcbdd2081ab367b48268e82abc281aab1f06918b08a0bccc/,
    );
    assert.match(script, /public\/world\/models\/display-football-helmet\.glb/);
    assert.match(script, /scripts\/prepare-display-football\.py/);
    assert.match(script, /"4\.5\.1"/);
    assert.ok(
      existsSync(
        new URL("../../scripts/prepare-display-football.py", import.meta.url),
      ),
      "Blender half",
    );
    assert.ok(
      !existsSync(
        new URL(
          "../../src/lib/world/football-helmet-asset.ts",
          import.meta.url,
        ),
      ),
      "the retired builder is gone",
    );
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
  /** Canvas size of a WebP held in a RIFF buffer. */
  const webpSize = (webp: Buffer): [number, number] => {
    const chunk = webp.toString("latin1", 12, 16);
    if (chunk === "VP8X")
      return [webp.readUIntLE(24, 3) + 1, webp.readUIntLE(27, 3) + 1];
    if (chunk === "VP8L") {
      const bits = webp.readUInt32LE(21);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    return [webp.readUInt16LE(26) & 0x3fff, webp.readUInt16LE(28) & 0x3fff];
  };
  const helmetParts = (json: HelmetGlb) =>
    new Map(
      json.nodes
        .filter((node) => node.mesh !== undefined)
        .map((node) => [
          node.name ?? "",
          json.meshes[node.mesh ?? 0].primitives[0],
        ]),
    );

  it("ships the football helmet as six named parts within a web budget (T7)", () => {
    const json = helmetGlb();
    const parts = helmetParts(json);
    assert.deepEqual([...parts.keys()].sort(), [
      "eye-shield",
      "facemask",
      "hardware",
      "padding",
      "shell",
      "trim",
    ]);
    const triangles = (name: string) => {
      const primitive = parts.get(name);
      assert.ok(primitive, name);
      return json.accessors[primitive.indices].count / 3;
    };
    // The source's modelled shell and cage, with the padding decimated.
    assert.ok(triangles("shell") > 4_000, `shell ${triangles("shell")}`);
    assert.ok(triangles("facemask") > 1_000, "modelled facemask bars");
    const total = [...parts.keys()].reduce(
      (sum, name) => sum + triangles(name),
      0,
    );
    assert.ok(total < 150_000, `total ${total} triangles`);
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
    const pbr = livery.pbrMetallicRoughness;
    assert.ok(pbr.baseColorTexture, "livery atlas");
    assert.ok(pbr.metallicRoughnessTexture, "metallic gold, satin horns");
    const shell = parts.get("shell");
    assert.ok(shell && "TEXCOORD_0" in shell.attributes, "shell UVs");
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
    const [width, height] = webpSize(webp);
    assert.equal(width, 2 * height, `atlas ${width}x${height}`);
    assert.ok(width >= 1024, `atlas ${width}x${height}`);
    for (const name of ["facemask", "padding", "trim", "eye-shield"])
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
    // The SpeedFlex's jaw reaches forward almost to the cage (T7), so the
    // cage stands about 2 cm proud of the shell rather than 4.
    assert.ok(cageBox.max[0] > shellBox.max[0] + 0.015, "cage stands off");
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

  it("polishes the black facemask and the smoked visor (T6, T7)", () => {
    const json = helmetGlb();
    const parts = helmetParts(json);
    const pbr = (name: string) => {
      const primitive = parts.get(name);
      assert.ok(primitive, name);
      return json.materials[primitive.material].pbrMetallicRoughness;
    };
    const cage = pbr("facemask");
    assert.ok(
      (cage.roughnessFactor ?? 1) <= 0.3,
      `cage ${cage.roughnessFactor}`,
    );
    assert.equal(cage.metallicFactor ?? 1, 0, "powder-coated, not bare metal");
    const shield = pbr("eye-shield");
    assert.ok((shield.roughnessFactor ?? 1) <= 0.03, "glossy visor");
    assert.ok(
      (shield.baseColorFactor?.[3] ?? 0) >= 0.85,
      "smoked, still see-through",
    );
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
    // Facemask (football), chin bar (off-road) and toes (Jordan) sit on the
    // built +x, the built +x and source +z.
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

  it("stays soft and controlled: a key spot and a weaker fill (T14)", () => {
    // T14 replaced the lid point light (pointIntensity/pointDistance) with a
    // key spot and a fill uplight; both stay small and short-ranged.
    assert.ok(
      DISPLAY_CASE.spotIntensity >= 1 && DISPLAY_CASE.spotIntensity <= 2.5,
    );
    assert.ok(DISPLAY_CASE.spotDistance <= 1.2);
    assert.ok(
      DISPLAY_CASE.spotPenumbra >= 0.6 && DISPLAY_CASE.spotPenumbra <= 1,
    );
    assert.ok(DISPLAY_CASE.spotAngle < Math.PI / 3, "a cone, not a flood");
    assert.ok(DISPLAY_CASE.upIntensity < DISPLAY_CASE.spotIntensity / 4);
    assert.ok(DISPLAY_CASE.upDistance <= 0.6);
    assert.ok(DISPLAY_CASE.puckEmissive <= 0.8);
    assert.ok(DISPLAY_CASE.stripEmissive <= 1.5);
    assert.equal(DISPLAY_CASE.lightDecay, 2);
    assert.equal("pointIntensity" in DISPLAY_CASE, false, "lid point retired");
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

describe("display case museum lighting (collection-display-models T14)", () => {
  const { glass, plinth, riser, itemFit } = DISPLAY_CASE;
  const lidUnder = plinth.height + glass.height - glass.thickness;
  const innerHalf = Math.min(glass.width, glass.depth) / 2 - glass.thickness;
  const sub = (a: readonly number[], b: readonly number[]) =>
    [0, 1, 2].map((i) => a[i] - b[i]) as V3;
  const len = (v: V3) => Math.hypot(...v);
  const smoothstep = (lo: number, hi: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };
  /** three.js punctual falloff: inverse square, windowed by `distance`. */
  const falloff = (d: number, distance: number) =>
    Math.max(0, 1 - (d / distance) ** 4) ** 2 / (d * d);
  /** Illuminance of the key spot at a case-local point, as three.js shades it. */
  const keyAt = (point: V3) => {
    const toPoint = sub(point, DISPLAY_CASE_SPOT_POSITION);
    const axis = sub(DISPLAY_CASE_AIM, DISPLAY_CASE_SPOT_POSITION);
    const cos =
      toPoint.reduce((sum, v, i) => sum + v * axis[i], 0) /
      (len(toPoint) * len(axis));
    const { spotAngle, spotPenumbra } = DISPLAY_CASE;
    const cone = smoothstep(
      Math.cos(spotAngle),
      Math.cos(spotAngle * (1 - spotPenumbra)),
      cos,
    );
    return (
      DISPLAY_CASE.spotIntensity *
      cone *
      falloff(len(toPoint), DISPLAY_CASE.spotDistance)
    );
  };
  const fillAt = (point: V3) =>
    DISPLAY_CASE.upIntensity *
    falloff(
      len(sub(point, DISPLAY_CASE_UPLIGHT_POSITION)),
      DISPLAY_CASE.upDistance,
    );
  const restCentre = ITEM_FLOOR_Y + itemFit.height / 2;

  it("aims at the item centre, between its rest and its lifted height", () => {
    const [x, y, z] = DISPLAY_CASE_AIM;
    assert.equal(x, 0);
    assert.equal(z, 0);
    assert.ok(y >= restCentre && y <= restCentre + DISPLAY_LIFT.height, `${y}`);
  });

  it("hangs the key spot inside the glass, near the lid, at the front", () => {
    const [x, y, z] = DISPLAY_CASE_SPOT_POSITION;
    assert.equal(x, 0);
    assert.ok(y < lidUnder && lidUnder - y <= 0.04, `near the lid: ${y}`);
    // Front is toward the room and the inspection camera: -z.
    assert.ok(z < 0 && -z < innerHalf, `inside the front glass: ${z}`);
    assert.ok(-z >= innerHalf / 2, "in the front half");
    const liftedTop = ITEM_FLOOR_Y + itemFit.height + DISPLAY_LIFT.height;
    assert.ok(y > liftedTop + 0.04, "clear of the lifted item");
    // A museum angle: 25-50 degrees off the vertical, down onto the item.
    const [, dy, dz] = sub(DISPLAY_CASE_AIM, DISPLAY_CASE_SPOT_POSITION);
    const tilt = Math.atan2(dz, -dy);
    assert.ok(tilt > (25 * Math.PI) / 180 && tilt < (50 * Math.PI) / 180);
  });

  it("spreads its soft cone over the whole item", () => {
    const reach = len(sub(DISPLAY_CASE_AIM, DISPLAY_CASE_SPOT_POSITION));
    assert.ok(DISPLAY_CASE.spotAngle > Math.atan(itemFit.radius / reach));
    assert.ok(DISPLAY_CASE.spotDistance > reach * 2, "no hard range cut");
    // The item's edge still gets a useful share, not a hot centre only.
    const edge: V3 = [itemFit.radius, DISPLAY_CASE_AIM[1], 0];
    assert.ok(keyAt(edge) > 0.25 * keyAt([...DISPLAY_CASE_AIM] as V3));
  });

  it("puts the uplight below the item, inside the glass, in front of the riser", () => {
    const [x, y, z] = DISPLAY_CASE_UPLIGHT_POSITION;
    assert.equal(x, 0);
    assert.ok(y > plinth.height && y < ITEM_FLOOR_Y, `below the item: ${y}`);
    assert.ok(z < -riser.depth / 2, "in front of the riser");
    assert.ok(-z < innerHalf, "inside the glass");
  });

  it("keeps the fill clearly weaker than the key at the item centre", () => {
    for (const y of [restCentre, restCentre + DISPLAY_LIFT.height]) {
      const centre: V3 = [0, y, 0];
      const key = keyAt(centre);
      const fill = fillAt(centre);
      assert.ok(fill > 0, "the fill reaches the item");
      assert.ok(fill < key / 4, `fill ${fill} vs key ${key}`);
    }
  });

  it("lights nothing when off or by day", () => {
    for (const [enabled, h, power] of [
      [false, 21, true],
      [true, 21, false],
      [true, 12, true],
    ] as const) {
      const level = displayCaseLevel(enabled, h, power);
      assert.equal(DISPLAY_CASE.spotIntensity * level, 0);
      assert.equal(DISPLAY_CASE.upIntensity * level, 0);
      assert.equal(DISPLAY_CASE.stripEmissive * level, 0);
    }
  });

  it("keeps item reflections from the scene by day and boosts them in a lit case at night", () => {
    for (const h of [6, 9, 12, 15, 17.5])
      for (const level of [0, 0.5, 1])
        assert.equal(
          displayCaseEnvIntensity(level, h),
          environmentIntensity(h),
          `unchanged at ${h}h, level ${level}`,
        );
    for (const h of [21, 0, 3]) {
      assert.equal(displayCaseEnvIntensity(0, h), environmentIntensity(h));
      assert.ok(DISPLAY_CASE.envBoost > environmentIntensity(h));
      assert.equal(displayCaseEnvIntensity(1, h), DISPLAY_CASE.envBoost);
    }
    for (const h of [0, 6, 12, 18, 21])
      for (const level of [0, 1])
        assert.ok(displayCaseEnvIntensity(level, h) <= 1);
  });

  it("wires the key spot, fill, strip and case-local reflections", () => {
    const cases = readFileSync(
      new URL("../../src/components/world/DisplayCases.tsx", import.meta.url),
      "utf8",
    );
    assert.match(cases, /<spotLight[\s\S]*?target=\{/);
    assert.match(cases, /intensity=\{DISPLAY_CASE\.spotIntensity \* level\}/);
    assert.match(cases, /intensity=\{DISPLAY_CASE\.upIntensity \* level\}/);
    assert.match(cases, /DISPLAY_CASE\.stripEmissive \* level/);
    assert.doesNotMatch(cases, /pointIntensity/);
    assert.doesNotMatch(cases, /<spotLight[^>]*castShadow(?!=\{false\})/);
    // Reflections on the case's own cloned materials, from the level.
    assert.match(cases, /\.envMap = scene\.environment/);
    assert.match(cases, /displayCaseEnvIntensity\(level, hours\)/);
    assert.match(cases, /material\.clone\(\)/);
    // The switch lives in DisplayCases, shared by the case and its model.
    assert.match(cases, /localStorage\.setItem\(item\.storageKey/);
    assert.match(cases, /playLampSwitch\(\)/);
    assert.match(cases, /levels\[item\.id\]/);
  });
});

describe("display case turntable (collection-display-models T8)", () => {
  const TURN = 2 * Math.PI;

  it("turns an inspected model one full, steady turn per period", () => {
    assert.equal(DISPLAY_TURN.period, 20);
    let yaw = 0;
    const dt = 1 / 60;
    for (let i = 0; i < DISPLAY_TURN.period * 60; i++)
      yaw = displayTurnStep(yaw, dt, true);
    assert.ok(
      Math.abs(yaw) < 1e-6 || Math.abs(yaw - TURN) < 1e-6,
      `yaw ${yaw}`,
    );
    // Steady: the same step at any angle, and it stays within one turn.
    const step = displayTurnStep(1, 0.5, true) - 1;
    assert.ok(Math.abs(step - (TURN * 0.5) / DISPLAY_TURN.period) < 1e-12);
    assert.ok(displayTurnStep(6.2, 0.5, true) < TURN);
  });

  it("eases back to the front, the shorter way, once inspection ends", () => {
    let yaw = 1.2;
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 180; i++) {
      yaw = displayTurnStep(yaw, 1 / 60, false);
      assert.ok(yaw >= 0 && yaw <= previous, `monotone ${yaw}`);
      previous = yaw;
    }
    assert.ok(yaw < 0.05, `near the front after 3 s: ${yaw}`);
    // Past half a turn it finishes the turn rather than winding back.
    assert.ok(displayTurnStep(5.9, 0.1, false) > 5.9);
    // Close enough snaps exactly to the front, so the frame loop can stop.
    assert.equal(displayTurnStep(0.0005, 1 / 60, false), 0);
    assert.equal(displayTurnStep(TURN - 0.0005, 1 / 60, false), 0);
    assert.equal(displayTurnStep(0, 1 / 60, false), 0);
  });

  it("turns only the inspected model, and never under reduced motion", () => {
    const cases = readFileSync(
      new URL("../../src/components/world/DisplayCases.tsx", import.meta.url),
      "utf8",
    );
    assert.match(cases, /displayTurnStep\(/);
    assert.match(cases, /lifted=\{focused === item\.id\}/);
    assert.match(cases, /const turning = lifted && !reducedMotion;/);
    const scene = readFileSync(
      new URL("../../src/components/world/WorldScene.tsx", import.meta.url),
      "utf8",
    );
    assert.match(scene, /<DisplayCases[\s\S]*?reducedMotion=\{reducedMotion\}/);
  });
});

describe("display case lift (collection-display-models T9)", () => {
  it("lifts the inspected model 5 cm, still clear of the case light", () => {
    assert.equal(DISPLAY_LIFT.height, 0.05);
    const top =
      ITEM_FLOOR_Y + DISPLAY_CASE.itemFit.height + DISPLAY_LIFT.height;
    assert.ok(
      top < DISPLAY_CASE_LIGHT_Y - DISPLAY_CASE.puck.height - 0.04,
      `lifted top ${top} vs light ${DISPLAY_CASE_LIGHT_Y}`,
    );
  });

  it("rises smoothly on inspection and settles back down after", () => {
    let lift = 0;
    let previous = -1;
    for (let i = 0; i < 120; i++) {
      lift = displayLiftStep(lift, 1 / 60, true);
      assert.ok(
        lift >= previous && lift <= DISPLAY_LIFT.height,
        `rising ${lift}`,
      );
      previous = lift;
    }
    assert.ok(DISPLAY_LIFT.height - lift < 0.002, `up after 2 s: ${lift}`);
    // Snaps exactly onto either rest height, so the frame loop can stop.
    assert.equal(
      displayLiftStep(DISPLAY_LIFT.height - 1e-5, 1 / 60, true),
      DISPLAY_LIFT.height,
    );
    assert.equal(displayLiftStep(1e-5, 1 / 60, false), 0);
    let down = DISPLAY_LIFT.height;
    for (let i = 0; i < 120; i++) down = displayLiftStep(down, 1 / 60, false);
    assert.equal(down, 0);
  });

  it("lifts only the inspected model, and jumps without easing under reduced motion", () => {
    const cases = readFileSync(
      new URL("../../src/components/world/DisplayCases.tsx", import.meta.url),
      "utf8",
    );
    assert.match(cases, /displayLiftStep\(/);
    assert.match(cases, /lifted=\{focused === item\.id\}/);
    assert.match(cases, /const rest = lifted \? DISPLAY_LIFT\.height : 0;/);
    assert.match(cases, /reducedMotion\s*\?\s*rest\s*:\s*displayLiftStep/);
  });
});
