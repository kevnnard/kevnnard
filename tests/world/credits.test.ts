import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type Credits,
  creditProblems,
  licenseAllowed,
  ORIGINAL_LICENSE,
  PERMISSION_LICENSE,
} from "../../src/lib/world/credits.ts";
import { DISPLAY_MODEL_FILES } from "../../src/lib/world/display-cases.ts";
import { MODEL_FILES, PROP_FILES } from "../../src/lib/world/models.ts";
import { BRUNO_CHAIR, BRUNO_MAPS } from "../../src/lib/world/setup.ts";
import { PUBLIC, shippedModels } from "./glb.ts";

const credits = (): Credits =>
  JSON.parse(readFileSync(new URL("credits.json", PUBLIC), "utf8"));

/** An original-work credit for a shipped file built in this repository. */
type OriginalFile = {
  id: string;
  file?: string;
  bytes?: number;
  sha256?: string;
};
const originalFiles = (data: Credits) =>
  (data.original ?? []).filter(
    (entry): entry is typeof entry & Required<OriginalFile> =>
      typeof (entry as OriginalFile).file === "string",
  );

describe("credits.json (S4: every author is credited, even CC0)", () => {
  it("has an entry for every shipped model, and every entry ships", () => {
    const data = credits();
    const files = [
      ...data.assets.map((entry) => entry.file),
      ...originalFiles(data).map((entry) => entry.file),
    ];
    assert.deepEqual([...files].sort(), shippedModels());
    for (const file of files)
      assert.ok(existsSync(new URL(file, PUBLIC)), `${file} is credited`);
  });

  it("ships the CC0 bush and no cloud models: clouds are original (S5)", () => {
    const files = shippedModels();
    assert.ok(files.includes("models/bush.glb"), "bush");
    assert.ok(!files.some((file) => file.includes("cloud")), "cloud models");
    const packs = credits().assets.map((entry) => [entry.file, entry.pack]);
    assert.deepEqual(packs.filter(([file]) => file === "models/bush.glb")[0], [
      "models/bush.glb",
      "kaykit-city-builder-bits",
    ]);
  });

  it("credits original procedural work, the flowers, clouds, house and gaming setup, to the project", () => {
    const original = credits().original ?? [];
    for (const id of ["flowers", "clouds", "house", "setup"]) {
      const entry = original.find((item) => item.id === id);
      assert.ok(entry, `${id} credited`);
      assert.equal(entry.license, ORIGINAL_LICENSE);
      assert.ok(entry.author.trim());
      assert.ok(existsSync(new URL(`../../${entry.source}`, import.meta.url)));
    }
  });

  it("credits exactly the models the runtime loads", () => {
    assert.deepEqual(
      [
        ...Object.values(MODEL_FILES),
        ...Object.values(PROP_FILES),
        ...DISPLAY_MODEL_FILES,
      ]
        .map((url) => url.replace("/world/", ""))
        .sort(),
      shippedModels(),
    );
  });

  it("names author, pack, asset, an allowed license and an official https source", () => {
    const data = credits();
    assert.deepEqual(creditProblems(data), []);
    for (const entry of data.assets) {
      assert.ok(licenseAllowed(entry), entry.file);
      assert.ok(entry.author.trim(), `${entry.file} author`);
      assert.ok(entry.asset.trim(), `${entry.file} asset`);
      assert.ok(entry.sourceFiles.length > 0, `${entry.file} source files`);
    }
  });

  it("records the shipped bytes and hash, so a re-export cannot drift from its credit", () => {
    const data = credits();
    for (const entry of [...data.assets, ...originalFiles(data)]) {
      const data = readFileSync(new URL(entry.file, PUBLIC));
      assert.equal(entry.bytes, data.length, entry.file);
      assert.equal(
        entry.sha256,
        createHash("sha256").update(data).digest("hex"),
        entry.file,
      );
    }
  });

  it("keeps license evidence for every pack", () => {
    const data = credits();
    const used = new Set(
      [...data.assets, ...(data.textures ?? [])].map((entry) => entry.pack),
    );
    assert.deepEqual(
      data.packs.map((pack) => pack.id).sort(),
      [...used].sort(),
    );
    for (const pack of data.packs) {
      assert.ok(licenseAllowed(pack), pack.id);
      assert.match(pack.licenseEvidence.url, /^https:\/\//);
      assert.ok(pack.licenseEvidence.quote.trim(), `${pack.id} quote`);
    }
  });
});

describe("display case meshes (collection-display-models T2)", () => {
  it("credits Exodusks' SpeedFlex football helmet under CC BY 4.0, repainted (T7)", () => {
    const data = credits();
    const file = "models/display-football-helmet.glb";
    assert.equal(
      originalFiles(data).find((item) => item.file === file),
      undefined,
      "no longer original work",
    );
    assert.ok(
      !data.packs.some((pack) => pack.id === "poly-pizza-football-helmet"),
      "the generic Poly Pizza helmet is gone",
    );
    const entry = data.assets.find((asset) => asset.file === file);
    assert.ok(entry, "credited as a downloaded mesh");
    assert.match(entry.asset, /Riddell SpeedFlex/);
    assert.match(entry.changes, /Bills decals removed/);
    assert.match(entry.changes, /Rams-style horn/);
    assert.match(entry.changes, /no NFL or team logo/);
    assert.equal(
      entry.graphicReference?.url,
      "https://commons.wikimedia.org/wiki/File:LA_RAMS_Helmet.jpg",
    );
    assert.match(entry.graphicReference?.note ?? "", /not shipped/);
    const pack = data.packs.find((item) => item.id === entry.pack);
    assert.equal(
      pack?.authorUrl,
      "https://sketchfab.com/IwontUseThisAccountLOL",
    );
    assert.match(
      pack?.licenseEvidence.quote ?? "",
      /"title": "Buffalo Bills Helmet"/,
    );
    // Regenerating base-world credits keeps this CC BY credit, like the other
    // gallery meshes, and no original-work record for the file comes back.
    const script = readFileSync(
      new URL("../../scripts/prepare-world.py", import.meta.url),
      "utf8",
    );
    const gallery = script.match(/gallery_files = \{([^}]*)\}/)?.[1] ?? "";
    assert.match(gallery, /display-offroad-helmet\.glb/);
    assert.match(gallery, /display-football-helmet\.glb/);
    assert.match(gallery, /display-jordan-1\.glb/);
    assert.doesNotMatch(script, /"id": "football-helmet"/);
    assert.doesNotMatch(script, /poly-pizza-football-helmet|8Htf9hrbXkE/);
  });

  const SOURCES = {
    "models/display-football-helmet.glb": {
      pack: "sketchfab-exodusks-buffalo-bills-helmet",
      author: "Exodusks",
      license: "CC-BY-4.0",
      source:
        "https://sketchfab.com/3d-models/buffalo-bills-helmet-fd471344bf9c4900b8cc0f59fedb8093",
      url: "https://sketchfab.com/3d-models/buffalo-bills-helmet-fd471344bf9c4900b8cc0f59fedb8093",
      sha256:
        "064297188d088fdcdcbdd2081ab367b48268e82abc281aab1f06918b08a0bccc",
    },
    "models/display-jordan-1.glb": {
      pack: "sketchfab-makoto-air-jordan-1",
      author: "makoto",
      license: "CC-BY-4.0",
      source:
        "https://github.com/sceneview/sceneview/blob/0b96f5009a86d39e513aa9609e634d4ebaa3290f/assets/manifest.json",
      url: "https://github.com/sceneview/sceneview/releases/download/assets-v1/3537837022a6e852e21e1408e4d8684b056c486d909e23e18204026bda9ce53e",
      sha256:
        "3537837022a6e852e21e1408e4d8684b056c486d909e23e18204026bda9ce53e",
    },
  } as const;

  it("credits each mesh to its author under CC BY, with the exact source bytes", () => {
    const data = credits();
    for (const [file, expected] of Object.entries(SOURCES)) {
      const entry = data.assets.find((asset) => asset.file === file);
      assert.ok(entry, `${file} credited`);
      assert.equal(entry.pack, expected.pack);
      assert.equal(entry.author, expected.author);
      assert.equal(entry.license, expected.license);
      assert.equal(entry.source, expected.source);
      assert.deepEqual(
        entry.sourceFiles.map((file) => [file.url, file.sha256]),
        [[expected.url, expected.sha256]],
      );
      const pack = data.packs.find((item) => item.id === expected.pack);
      assert.ok(pack, `${expected.pack} pack`);
      assert.equal(pack.license, expected.license);
      assert.match(
        pack.licenseEvidence.quote,
        /Creative Commons Attribution|CC-BY/,
      );
    }
  });

  it("names the original Sketchfab work behind the SceneView redistribution", () => {
    const pack = credits().packs.find(
      (item) => item.id === "sketchfab-makoto-air-jordan-1",
    );
    assert.ok(pack);
    assert.equal(pack.authorUrl, "https://sketchfab.com/lu87813");
    assert.match(
      pack.licenseEvidence.quote,
      /air-jordan-1-a4b434181fbb48008ad460722fd53725/,
    );
  });
});

describe("Bruno Simon's my-room-in-3d (T4i, L25: used with permission)", () => {
  const COMMIT = "5d00b3f870da81f103e901e0d12e20bbcc816834";
  const FILES = [
    "src/Experience/CoffeeSteam.js",
    "src/Experience/TopChair.js",
    "src/Experience/GoogleLeds.js",
    "src/Experience/BouncingLogo.js",
    "src/Experience/Navigation.js",
    "src/Experience/shaders/coffeeSteam/vertex.glsl",
    "src/Experience/shaders/coffeeSteam/fragment.glsl",
    "src/Experience/shaders/partials/perlin2d.glsl",
    "static/assets/coffeeSteamModel.glb",
    // T4k: his chair with its baked shader, and the desk overlays.
    "src/Experience/Baked.js",
    "src/Experience/shaders/baked/vertex.glsl",
    "src/Experience/shaders/baked/fragment.glsl",
    "src/Experience/ElgatoLight.js",
    "src/Experience/LoupedeckButtons.js",
    "static/assets/topChairModel.glb",
    "static/assets/elgatoLightModel.glb",
    "static/assets/googleHomeLedsModel.glb",
    "static/assets/loupedeckButtonsModel.glb",
    "static/assets/bakedDay.jpg",
    "static/assets/bakedNight.jpg",
    "static/assets/bakedNeutral.jpg",
    "static/assets/lightMap.jpg",
    "static/assets/googleHomeLedMask.png",
  ];
  const BRUNO_MODELS = [
    "models/bruno-chair.glb",
    "models/bruno-elgato-light.glb",
    "models/bruno-google-home-leds.glb",
    "models/bruno-loupedeck-buttons.glb",
  ];

  it("credits every ported file to Bruno Simon at the pinned commit, with its hash", () => {
    const data = credits();
    const used = [
      ...(data.ported ?? []).flatMap((entry) => entry.sourceFiles),
      ...data.assets
        .filter((entry) => entry.author === "Bruno Simon")
        .flatMap((entry) => entry.sourceFiles),
      ...(data.maps ?? []).flatMap((entry) => entry.sourceFiles),
    ];
    for (const file of FILES) {
      const url = `https://raw.githubusercontent.com/brunosimon/my-room-in-3d/${COMMIT}/${file}`;
      const source = used.find((item) => item.url === url);
      assert.ok(source, `${file} credited`);
      assert.match(source.sha256, /^[0-9a-f]{64}$/);
      assert.ok(source.bytes > 0);
    }
    for (const entry of data.ported ?? []) {
      assert.equal(entry.author, "Bruno Simon");
      assert.equal(entry.license, PERMISSION_LICENSE);
      assert.ok(entry.source.includes(COMMIT), entry.id);
      assert.ok(existsSync(new URL(`../../${entry.port}`, import.meta.url)));
    }
    const steam = data.assets.find(
      (entry) => entry.file === "models/coffee-steam.glb",
    );
    assert.equal(steam?.author, "Bruno Simon");
    assert.equal(steam?.license, PERMISSION_LICENSE);
  });

  it("ships his chair and desk overlays as meshopt GLBs credited to him (T4k)", () => {
    const data = credits();
    for (const file of BRUNO_MODELS) {
      const entry = data.assets.find((item) => item.file === file);
      assert.ok(entry, `${file} credited`);
      assert.equal(entry.author, "Bruno Simon");
      assert.equal(entry.license, PERMISSION_LICENSE);
      assert.ok(entry.source.includes(COMMIT), file);
      assert.ok(shippedModels().includes(file), `${file} ships`);
    }
  });

  it("ships the chair's cropped baked maps under 600 KB, hashed and credited", () => {
    const maps = credits().maps ?? [];
    assert.deepEqual(
      maps.map((entry) => entry.file).sort(),
      Object.values(BRUNO_MAPS)
        .map((url) => url.replace("/world/", ""))
        .sort(),
    );
    let chair = 0;
    for (const entry of maps) {
      const data = readFileSync(new URL(entry.file, PUBLIC));
      assert.equal(entry.bytes, data.length, entry.file);
      assert.equal(
        entry.sha256,
        createHash("sha256").update(data).digest("hex"),
        entry.file,
      );
      assert.equal(entry.author, "Bruno Simon");
      assert.ok(licenseAllowed(entry), entry.file);
      if (entry.file.includes("chair-")) {
        chair += data.length;
        assert.equal(data.toString("latin1", 8, 12), "WEBP", entry.file);
      }
    }
    assert.ok(chair > 0 && chair <= 600_000, `${chair} bytes`);
  });

  it("sways the chair hull measured from the shipped model", () => {
    const chair = credits().assets.find(
      (entry) => entry.file === "models/bruno-chair.glb",
    ) as { hull?: number[][] } | undefined;
    assert.deepEqual(chair?.hull, BRUNO_CHAIR.hull);
  });

  it("accepts the permission license only for Bruno Simon's repository", () => {
    const bruno = {
      license: PERMISSION_LICENSE,
      author: "Bruno Simon",
      source: `https://github.com/brunosimon/my-room-in-3d/tree/${COMMIT}`,
    };
    assert.ok(licenseAllowed(bruno));
    assert.ok(!licenseAllowed({ ...bruno, author: "Someone Else" }));
    assert.ok(
      !licenseAllowed({
        ...bruno,
        source: "https://github.com/brunosimon/folio-2019",
      }),
    );
    assert.ok(
      !licenseAllowed({
        ...bruno,
        source: "https://example.com/my-room-in-3d",
      }),
    );
  });
});

describe("creditProblems", () => {
  const entry = {
    file: "models/x.glb",
    asset: "x",
    pack: "p",
    author: "A",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: "https://github.com/KayKit-Game-Assets/x",
    bytes: 1,
    sha256: "0",
    sourceFiles: [{ url: "https://github.com/x", bytes: 1, sha256: "0" }],
  };
  const pack = {
    id: "p",
    pack: "P",
    author: "A",
    authorUrl: "https://example.com",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    source: "https://github.com/x",
    licenseEvidence: { url: "https://github.com/x/LICENSE.txt", quote: "CC0" },
  };

  it("accepts a complete CC0 entry", () => {
    assert.deepEqual(creditProblems({ packs: [pack], assets: [entry] }), []);
  });

  it("rejects missing authors, unknown licenses, unknown packs and non-https or unofficial sources", () => {
    const problems = creditProblems({
      packs: [pack],
      assets: [
        { ...entry, file: "models/a.glb", author: " " },
        { ...entry, file: "models/b.glb", license: "CC-BY-NC-4.0" },
        { ...entry, file: "models/c.glb", pack: "missing" },
        { ...entry, file: "models/d.glb", source: "http://github.com/x" },
        { ...entry, file: "models/e.glb", source: "https://example.com/x" },
      ],
    });
    assert.equal(problems.length, 5, problems.join("\n"));
    for (const name of ["a", "b", "c", "d", "e"])
      assert.ok(problems.some((problem) => problem.includes(`${name}.glb`)));
  });

  it("rejects a file credited twice", () => {
    assert.equal(
      creditProblems({ packs: [pack], assets: [entry, entry] }).length,
      1,
    );
  });

  it("rejects the permission license from any other author or repository", () => {
    const problems = creditProblems({
      packs: [pack],
      assets: [{ ...entry, license: PERMISSION_LICENSE }],
      ported: [
        {
          id: "x",
          asset: "x",
          author: "A",
          license: PERMISSION_LICENSE,
          source: "https://github.com/x",
          port: "src/lib/world/motion.ts",
          sourceFiles: [{ url: "https://github.com/x", bytes: 1, sha256: "0" }],
        },
      ],
    });
    assert.equal(problems.length, 2, problems.join("\n"));
  });
});
