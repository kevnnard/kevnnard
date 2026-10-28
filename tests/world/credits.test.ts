import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ALLOWED_LICENSES,
  type Credits,
  creditProblems,
  ORIGINAL_LICENSE,
} from "../../src/lib/world/credits.ts";
import { MODEL_FILES } from "../../src/lib/world/models.ts";
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

  it("credits original procedural work, the flowers, clouds and house, to the project", () => {
    const original = credits().original ?? [];
    for (const id of ["flowers", "clouds", "house"]) {
      const entry = original.find((item) => item.id === id);
      assert.ok(entry, `${id} credited`);
      assert.equal(entry.license, ORIGINAL_LICENSE);
      assert.ok(entry.author.trim());
      assert.ok(existsSync(new URL(`../../${entry.source}`, import.meta.url)));
    }
  });

  it("credits exactly the models the runtime loads", () => {
    assert.deepEqual(
      Object.values(MODEL_FILES)
        .map((url) => url.replace("/world/", ""))
        .sort(),
      shippedModels(),
    );
  });

  it("names author, pack, asset, an allowed license and an official https source", () => {
    const data = credits();
    assert.deepEqual(creditProblems(data), []);
    for (const entry of data.assets) {
      assert.ok(ALLOWED_LICENSES.includes(entry.license), entry.file);
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
    const used = new Set(data.assets.map((entry) => entry.pack));
    assert.deepEqual(
      data.packs.map((pack) => pack.id).sort(),
      [...used].sort(),
    );
    for (const pack of data.packs) {
      assert.ok(ALLOWED_LICENSES.includes(pack.license), pack.id);
      assert.match(pack.licenseEvidence.url, /^https:\/\//);
      assert.ok(pack.licenseEvidence.quote.trim(), `${pack.id} quote`);
    }
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
});
