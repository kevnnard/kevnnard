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
import { MODEL_FILES, PROP_FILES } from "../../src/lib/world/models.ts";
import { PUBLIC, shippedModels } from "./glb.ts";

const credits = (): Credits =>
  JSON.parse(readFileSync(new URL("credits.json", PUBLIC), "utf8"));

describe("credits.json (S4: every author is credited, even CC0)", () => {
  it("has an entry for every shipped model, and every entry ships", () => {
    const files = credits().assets.map((entry) => entry.file);
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
      [...Object.values(MODEL_FILES), ...Object.values(PROP_FILES)]
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
    for (const entry of credits().assets) {
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
  ];

  it("credits every ported file to Bruno Simon at the pinned commit, with its hash", () => {
    const data = credits();
    const used = [
      ...(data.ported ?? []).flatMap((entry) => entry.sourceFiles),
      ...data.assets
        .filter((entry) => entry.author === "Bruno Simon")
        .flatMap((entry) => entry.sourceFiles),
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
