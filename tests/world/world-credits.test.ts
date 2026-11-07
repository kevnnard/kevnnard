// Curated credits for the world guide (world-game-menu T1, S4/L4): the
// user-facing list thanks gentle-stream, Bruno Simon and every external asset
// author from the real manifest, and leaves the site's own procedural work
// out of the acknowledgements without touching the manifest.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Credits } from "../../src/lib/world/credits.ts";
import {
  BRUNO_INSPIRATION,
  creditSections,
  type WorldCredits,
} from "../../src/lib/world/world-credits.ts";

const shipped = (): WorldCredits =>
  JSON.parse(
    readFileSync(
      new URL("../../public/world/credits.json", import.meta.url),
      "utf8",
    ),
  );

describe("curated world credits", () => {
  it("leads with the gentle-stream engine: Alan Buscaglia, MIT, its repository and the tracks", () => {
    const data = shipped();
    const [music] = creditSections(data).music;
    const source = data.music?.[0];
    assert.ok(music && source);
    assert.equal(music.name, "gentle-stream");
    assert.match(music.author, /Alan Buscaglia/);
    assert.match(music.author, /Gentleman Programming/);
    assert.equal(music.license, "MIT");
    assert.equal(music.engineUrl, source.engine);
    assert.equal(music.licenseUrl, `/world/${source.engineLicenseFile}`);
    assert.equal(music.manifestUrl, `/world/${source.manifest}`);
    assert.deepEqual(music.tracks, [
      "Cafe Drift",
      "Ambient Focus",
      "Velvet Jazz",
      "Soft Circuit",
      "Midnight Code",
    ]);
  });

  it("credits Bruno Simon for inspiration on parts, and for the reused room files", () => {
    const sections = creditSections(shipped());
    assert.match(BRUNO_INSPIRATION.note, /parts of this world/);
    assert.doesNotMatch(BRUNO_INSPIRATION.note, /\ball\b|entire|whole/i);
    const bruno = sections.assets.find(
      (pack) => pack.id === "bruno-my-room-in-3d",
    );
    assert.ok(bruno);
    assert.equal(bruno.author, "Bruno Simon");
    // The private permission is reported as recorded, never as a public license.
    assert.match(bruno.license, /permission/);
    assert.doesNotMatch(bruno.license, /CC0|MIT|CC-BY/);
    for (const file of ["chair", "bakedDay", "googleHomeLedMask"])
      assert.ok(
        bruno.used.some((name) => name.includes(file)),
        `${file} listed`,
      );
    for (const port of ["Coffee steam", "Chair sway", "Normalized wheel zoom"])
      assert.ok(
        bruno.used.some((name) => name.startsWith(port)),
        `${port} listed`,
      );
  });

  it("lists every external pack once with its real author, license and source", () => {
    const data = shipped();
    const assets = creditSections(data).assets;
    assert.deepEqual(
      assets.map((pack) => pack.id).sort(),
      data.packs.map((pack) => pack.id).sort(),
    );
    for (const pack of assets) {
      const source = data.packs.find((entry) => entry.id === pack.id);
      assert.ok(source);
      assert.equal(pack.author, source.author);
      assert.equal(pack.license, source.license);
      assert.equal(pack.source, source.source);
      assert.ok(pack.used.length > 0, `${pack.id} has shipped files`);
    }
  });

  it("leaves the site's own procedural work out of the acknowledgements", () => {
    const data = shipped();
    assert.ok((data.original ?? []).length > 0, "manifest keeps them");
    const text = JSON.stringify(creditSections(data));
    for (const entry of data.original ?? [])
      assert.ok(!text.includes(entry.asset), entry.id);
    assert.doesNotMatch(text, /Original work \(repository license\)/);
  });

  it("credits the four CC0 ambient sounds with author, license and source", () => {
    const data = shipped();
    const ambient = creditSections(data).ambient.filter((sound) =>
      sound.file.includes("/ambient/"),
    );
    assert.equal(ambient.length, 4);
    assert.deepEqual(
      ambient.map((sound) => sound.name),
      ["Night owl", "Wake-up rooster", "Midday birds", "Night crickets"],
    );
    for (const sound of ambient) {
      assert.ok(sound.author.length > 0, `${sound.name} has an author`);
      assert.equal(sound.license, "CC0-1.0");
      assert.equal(
        sound.licenseUrl,
        "https://creativecommons.org/publicdomain/zero/1.0/",
      );
      assert.match(sound.source, /^https:\/\//);
      assert.match(sound.file, /^\/world\/audio\/ambient\/[\w-]+\.mp3$/);
    }
  });

  it("does not mutate the manifest it reads", () => {
    const data = shipped();
    const before = JSON.stringify(data);
    creditSections(data);
    assert.equal(JSON.stringify(data), before);
  });

  it("handles a manifest without music, ports or maps", () => {
    const data = shipped();
    const bare: Credits = { packs: data.packs, assets: data.assets };
    const sections = creditSections(bare);
    assert.deepEqual(sections.music, []);
    assert.deepEqual(sections.ambient, []);
    assert.ok(sections.assets.length > 0);
  });
});
