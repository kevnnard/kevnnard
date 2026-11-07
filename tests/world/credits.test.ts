import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CHERRY_MODEL } from "../../src/lib/world/cherry.ts";
import {
  type Credits,
  creditProblems,
  licenseAllowed,
  ORIGINAL_LICENSE,
  PERMISSION_LICENSE,
} from "../../src/lib/world/credits.ts";
import { DISPLAY_MODEL_FILES } from "../../src/lib/world/display-cases.ts";
import { KATANA_MODEL } from "../../src/lib/world/katana-shelf.ts";
import { MODEL_FILES, PROP_FILES } from "../../src/lib/world/models.ts";
import { BRUNO_CHAIR, BRUNO_MAPS } from "../../src/lib/world/setup.ts";
import { TV_COVERS } from "../../src/lib/world/tv-covers.ts";
import { WAND_MODEL } from "../../src/lib/world/wand.ts";
import {
  creditSections,
  type WorldCredits,
} from "../../src/lib/world/world-credits.ts";
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
        KATANA_MODEL.url,
        CHERRY_MODEL.url,
        WAND_MODEL.url,
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

  it("ships no non-commercial asset: the dream truck is gone (dream-truck T4)", () => {
    const data = credits();
    for (const entry of [...data.packs, ...data.assets])
      assert.doesNotMatch(
        entry.license,
        /NC/,
        JSON.stringify(entry).slice(0, 80),
      );
    assert.doesNotMatch(
      readFileSync(
        new URL("../../src/lib/world/credits.ts", import.meta.url),
        "utf8",
      ),
      /NONCOMMERCIAL|ford-f150/,
    );
    // Even the old truck's own source is refused now.
    assert.equal(
      licenseAllowed({
        license: "CC-BY-NC-4.0",
        author: "Outlaw Games",
        source:
          "https://sketchfab.com/3d-models/ford-f150-raptor-5bde9684bf6d40e0902ee8e482ad1063",
        sourceFiles: [],
      }),
      false,
    );
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

  it("credits every shipped story image as public domain, with its Commons page and hashes (katana-wall-shelf T11)", () => {
    const images = (credits() as WorldCredits).images ?? [];
    assert.ok(images.length > 0, "image credits");
    for (const image of images) {
      const data = readFileSync(new URL(image.file, PUBLIC));
      assert.equal(image.bytes, data.length, image.file);
      assert.equal(
        image.sha256,
        createHash("sha256").update(data).digest("hex"),
        image.file,
      );
      assert.equal(image.license, "Public domain");
      assert.ok(image.title.trim() && image.artist.trim() && image.date.trim());
      assert.match(
        image.source,
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      );
      assert.equal(image.licenseEvidence.url, image.source);
      assert.match(image.licenseEvidence.quote, /public domain/i);
      assert.ok(image.sourceFiles.length > 0, `${image.file} source files`);
      for (const file of image.sourceFiles)
        assert.match(file.url, /^https:\/\/upload\.wikimedia\.org\//);
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
    assert.match(gallery, /desk-mug\.glb/);
    assert.match(gallery, /cherry\.glb/);
    assert.doesNotMatch(script, /"id": "football-helmet"/);
    assert.doesNotMatch(script, /poly-pizza-football-helmet|8Htf9hrbXkE/);
    // T15: the off-road helmet is senoaji's; Pieter Ferreira's mesh is retired.
    assert.doesNotMatch(
      script,
      /Ferreira|Badboy17Aiden|off-road-helmet-c9d968/,
    );
    assert.doesNotMatch(
      JSON.stringify(data),
      /Ferreira|Badboy17Aiden|off-road-helmet-c9d968/,
    );
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
    "models/display-offroad-helmet.glb": {
      pack: "sketchfab-senoaji-fox-x-supreme-helmet",
      author: "Muhammad Seno Aji (senoaji)",
      license: "CC-BY-4.0",
      source:
        "https://sketchfab.com/3d-models/fox-x-supreme-helmet-ac680d32d02b4a9cb769d29f4f545609",
      url: "https://sketchfab.com/3d-models/fox-x-supreme-helmet-ac680d32d02b4a9cb769d29f4f545609",
      sha256:
        "fa74e45ffc828a418163ba9c8ac3dc0ee1ca77a791c0ebffe1731107c4bd2935",
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
    "models/desk-mug.glb": {
      pack: "sketchfab-aoblue-moon-jack-skellington-cup",
      author: "AoBlue_Moon",
      license: "CC-BY-4.0",
      source:
        "https://sketchfab.com/3d-models/jack-skellington-cup-6142a5564edb4a7ba1c948673460afe0",
      url: "https://sketchfab.com/3d-models/jack-skellington-cup-6142a5564edb4a7ba1c948673460afe0",
      sha256:
        "da2bed61e78406817431f3f7453e442ae08d918ea87c27fe90d95a7dd0a598e9",
    },
    "models/cherry.glb": {
      pack: "sketchfab-3d-creator-miniature-pinscher",
      author: "3D Creator",
      license: "CC-BY-4.0",
      source:
        "https://sketchfab.com/3d-models/5db9e974fb344f39b9d1baafbdbe264c",
      url: "https://sketchfab.com/3d-models/5db9e974fb344f39b9d1baafbdbe264c",
      sha256:
        "51c00e2139ae94cb1a208375f03ea78f1fb44c78f28b1b790c11a840c8fa277f",
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

describe("credits rebuild (katana-wall-shelf T16)", () => {
  it("keeps the gallery models, the story images and the ambient sounds on a full rebuild", () => {
    // Runs only the pure merge function from scripts/prepare-world.py, read
    // with ast: no download, no optimization, nothing written.
    const script = fileURLToPath(
      new URL("../../scripts/prepare-world.py", import.meta.url),
    );
    const previous = {
      packs: [{ id: "gallery-pack" }, { id: "old-base" }],
      assets: [
        { file: "models/wall-katana.glb", pack: "gallery-pack" },
        { file: "models/tree.glb", pack: "old-base" },
      ],
      ambient: [{ id: "owl-hoot", file: "/world/audio/ambient/owl-hoot.mp3" }],
      images: [{ file: "stories/katana-ukiyoe.webp" }],
      services: [
        { id: "tmdb", files: "tv/covers/" },
        { id: "igdb", files: "tv/covers/" },
      ],
    };
    const rebuilt = {
      packs: [{ id: "base" }],
      assets: [{ file: "models/tree.glb", pack: "base" }],
    };
    const run = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import ast, json, sys",
          "tree = ast.parse(open(sys.argv[1]).read())",
          "node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'kept_credits')",
          "scope = {}",
          "exec(compile(ast.Module(body=[node], type_ignores=[]), 'kept_credits', 'exec'), scope)",
          "print(json.dumps(scope['kept_credits'](json.loads(sys.argv[2]), json.loads(sys.argv[3]))))",
        ].join("\n"),
        script,
        JSON.stringify(rebuilt),
        JSON.stringify(previous),
      ],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    const kept = JSON.parse(run.stdout);
    assert.deepEqual(kept.ambient, previous.ambient);
    assert.deepEqual(kept.images, previous.images);
    assert.deepEqual(kept.services, previous.services);
    assert.deepEqual(
      kept.assets.map((asset: { file: string }) => asset.file),
      ["models/tree.glb", "models/wall-katana.glb"],
    );
    assert.deepEqual(
      kept.packs.map((pack: { id: string }) => pack.id),
      ["base", "gallery-pack"],
    );
    // write_credits merges through it before writing.
    const source = readFileSync(script, "utf8");
    assert.match(
      source,
      /previous = json\.loads\(path\.read_text\(encoding="utf-8"\)\)\s*credits = kept_credits\(credits, previous\)/,
    );
    // The shipped file still lists both.
    const data = credits() as unknown as Record<string, unknown[]>;
    assert.ok(data.ambient?.length, "ambient");
    assert.ok(data.images?.length, "images");
    assert.ok(data.services?.length, "services");
  });
});

/** Distinct shipped cover files from one source, by its id field. */
const shippedFrom = (field: "tmdbId" | "igdbId") =>
  new Set(
    Object.values(TV_COVERS)
      .filter((cover) => field in cover)
      .map((cover) => cover.src),
  ).size;

describe("TMDB attribution (tv-home-screen T4, S7)", () => {
  const NOTICE =
    "This product uses the TMDB API but is not endorsed or certified by TMDB.";

  it("credits TMDB with its exact notice, its site and the shipped posters", () => {
    const services = (credits() as WorldCredits).services ?? [];
    const tmdb = services.find((entry) => entry.id === "tmdb");
    assert.ok(tmdb, "TMDB service credit");
    assert.equal(tmdb.name, "TMDB");
    assert.equal(tmdb.notice, NOTICE);
    assert.equal(tmdb.url, "https://www.themoviedb.org");
    assert.equal(tmdb.files, "tv/covers/");
    assert.match(tmdb.rights, /rights holders/);
    assert.match(tmdb.rights, /non-commercial/);
    assert.equal(tmdb.label, "Film posters");
    assert.equal(tmdb.count, shippedFrom("tmdbId"), "the shipped posters");
  });

  it("shows the notice and the link in the menu's Credits", () => {
    const sections = creditSections(credits() as WorldCredits);
    const tmdb = sections.services.find((entry) => entry.name === "TMDB");
    assert.ok(tmdb);
    assert.equal(tmdb.notice, NOTICE);
    assert.equal(tmdb.url, "https://www.themoviedb.org");
    const dialog = readFileSync(
      new URL("../../src/components/world/CreditsDialog.tsx", import.meta.url),
      "utf8",
    );
    assert.match(dialog, /credits\.services\.map/);
    assert.match(dialog, /service\.notice/);
    assert.match(dialog, /href=\{service\.url\}/);
  });
});

describe("IGDB attribution (tv-home-screen T5, S7)", () => {
  it("credits IGDB for the game covers, next to TMDB", () => {
    const services = (credits() as WorldCredits).services ?? [];
    assert.deepEqual(
      services.map((entry) => entry.id),
      ["tmdb", "igdb", "youtube", "twitch"],
    );
    const igdb = services[1];
    assert.equal(igdb.name, "IGDB");
    assert.equal(igdb.label, "Game covers");
    assert.equal(igdb.url, "https://www.igdb.com");
    assert.match(igdb.notice, /IGDB/);
    assert.match(igdb.usage, /game/i);
    assert.match(igdb.usage, /no requests to IGDB/);
    assert.match(igdb.rights, /publishers/);
    assert.match(igdb.rights, /non-commercial/);
    assert.equal(igdb.files, "tv/covers/");
    assert.equal(igdb.script, "scripts/prepare-tv-covers.mjs");
    assert.equal(igdb.count, shippedFrom("igdbId"), "the shipped covers");
    // Every shipped file is credited to exactly one of them.
    const shipped = readdirSync(new URL("tv/covers/", PUBLIC)).length;
    assert.equal(
      services.reduce((sum, entry) => sum + entry.count, 0),
      shipped,
    );
  });

  it("shows each service under its own heading in the menu's Credits", () => {
    const sections = creditSections(credits() as WorldCredits);
    assert.deepEqual(
      sections.services.map((entry) => [entry.label, entry.name, entry.url]),
      [
        ["Film posters", "TMDB", "https://www.themoviedb.org"],
        ["Game covers", "IGDB", "https://www.igdb.com"],
        ["Videos on the TV", "YouTube", "https://www.youtube.com"],
        ["Live streams on the TV", "Twitch", "https://www.twitch.tv"],
      ],
    );
    const dialog = readFileSync(
      new URL("../../src/components/world/CreditsDialog.tsx", import.meta.url),
      "utf8",
    );
    assert.match(dialog, /\{service\.label\}/);
    assert.doesNotMatch(dialog, />Film posters</, "no fixed heading");
  });
});

describe("Cherry's credit (dog-rig T3)", () => {
  it("credits 3D Creator's Miniature Pinscher, rigged, animated and decimated here", () => {
    const data = credits();
    // The shipped record also carries the derivation notes and counts.
    const entry = data.assets.find(
      (asset) => asset.file === "models/cherry.glb",
    ) as
      | (Credits["assets"][number] & { changes?: string; triangles?: number })
      | undefined;
    assert.ok(entry);
    assert.equal(
      entry.asset.startsWith("Dog (Miniature Pinscher 小鹿犬)"),
      true,
    );
    assert.match(entry.changes ?? "", /rigged/i);
    assert.match(entry.changes ?? "", /animated/i);
    assert.match(entry.changes ?? "", /decimated/i);
    assert.ok((entry.triangles ?? 0) > 0);
    const pack = data.packs.find((item) => item.id === entry.pack);
    assert.equal(pack?.authorUrl, "https://sketchfab.com/3DChuang-Ke-Ji");
  });
});

describe("Elder Wand credit (patronus T1)", () => {
  it("credits Heniqueish's Elder Wand under CC BY 4.0, with the fan-tribute note", () => {
    const data = credits();
    const entry = data.assets.find(
      (asset) => asset.file === "models/elder-wand.glb",
    ) as
      | (Credits["assets"][number] & {
          note?: string;
          bytes?: number;
          sha256?: string;
        })
      | undefined;
    assert.ok(entry, "credited");
    assert.equal(entry.author, "Heniqueish");
    assert.equal(entry.license, "CC-BY-4.0");
    assert.equal(
      entry.source,
      "https://sketchfab.com/3d-models/elder-wand-37cee9fb76494799b743aea2fe41fd26",
    );
    assert.deepEqual(
      entry.sourceFiles.map((file) => file.sha256),
      ["0c1fc4f8e5ea652fe60207cf4ba1f3c35a522727b9bdd0e3d355951902671c0f"],
    );
    assert.equal(
      entry.note,
      "Harry Potter, the Elder Wand and Expecto Patronum belong to Warner Bros. and J.K. Rowling; fan tribute, no affiliation.",
    );
    const shipped = readFileSync(new URL("models/elder-wand.glb", PUBLIC));
    assert.equal(entry.bytes, shipped.length);
    assert.equal(
      entry.sha256,
      createHash("sha256").update(shipped).digest("hex"),
    );
    assert.ok(shipped.length < 1_000_000, "under 1 MB");
    const pack = data.packs.find((item) => item.id === entry.pack);
    assert.equal(pack?.authorUrl, "https://sketchfab.com/Heniqueish");
    const script = readFileSync(
      new URL("../../scripts/prepare-world.py", import.meta.url),
      "utf8",
    );
    const gallery = script.match(/gallery_files = \{([^}]*)\}/)?.[1] ?? "";
    assert.match(gallery, /elder-wand\.glb/);
  });
});
