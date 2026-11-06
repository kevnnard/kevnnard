import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE } from "../../src/lib/world/camera.ts";
import {
  LIVING_MODELS,
  modelBounds,
  TV_PANEL,
} from "../../src/lib/world/living.ts";
import {
  moveRemote,
  TV_FOCUS,
  tvCameraFocus,
} from "../../src/lib/world/tv-focus.ts";
import {
  appCount,
  COVER_MOTIFS,
  TV_APPS,
  TV_CONTINUE,
  TV_FEATURED,
  type TvTitle,
  tvTitle,
} from "../../src/lib/world/tv-library.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const app = (id: string) => {
  const found = TV_APPS.find((entry) => entry.id === id);
  assert.ok(found, `missing app ${id}`);
  return found;
};
const titled = (appId: string, title: string): TvTitle => {
  const found = app(appId).titles.find((entry) => entry.title === title);
  assert.ok(found, `missing ${title} in ${appId}`);
  return found;
};
const allTitles = TV_APPS.flatMap((entry) => entry.titles);

describe("TV library content (tv-home-screen T2, S1, S3)", () => {
  it("lists the seven apps of the chosen artboard, in order", () => {
    assert.deepEqual(
      TV_APPS.map((entry) => entry.label),
      [
        "Movies & Series",
        "Games",
        "My videos",
        "Channels",
        "Anime",
        "Highlights",
        "Lo-fi radio",
      ],
    );
  });

  it("holds the owner's movies, with sagas as one collection each", () => {
    const movies = app("movies");
    assert.equal(movies.sample, false);
    const films = (title: string) => titled("movies", title).films ?? [];
    assert.equal(films("Harry Potter").length, 8);
    assert.equal(films("Pirates of the Caribbean").length, 5);
    assert.deepEqual(
      films("Quentin Tarantino").map((film) => film.title),
      [
        "Reservoir Dogs",
        "Pulp Fiction",
        "Jackie Brown",
        "Kill Bill: Vol. 1",
        "Kill Bill: Vol. 2",
        "Death Proof",
        "Inglourious Basterds",
        "Django Unchained",
        "The Hateful Eight",
        "Once Upon a Time in Hollywood",
      ],
    );
    assert.equal(
      titled("movies", "Quentin Tarantino").collectionNote,
      "all of them, favourites",
    );
    assert.equal(films("Jim Carrey").length, 9);
    assert.deepEqual(
      films("American football films").map((film) => film.title),
      [
        "Remember the Titans",
        "The Blind Side",
        "Any Given Sunday",
        "The Longest Yard",
      ],
    );
    assert.equal(
      titled("movies", "Perfume: The Story of a Murderer").year,
      2006,
    );
    assert.equal(titled("movies", "F1").year, 2025);
    assert.equal(titled("movies", "The Nightmare Before Christmas").year, 1993);
  });

  it("features Ghost of Tsushima among the owner's games", () => {
    const games = app("games");
    assert.equal(games.sample, false);
    assert.equal(TV_FEATURED, "ghost-of-tsushima");
    const ghost = tvTitle(TV_FEATURED);
    assert.equal(ghost.title, "Ghost of Tsushima");
    assert.equal(ghost.app, "games");
    assert.equal(ghost.favourite, true);
    assert.match(ghost.meta, /Sucker Punch · 2020/);
    titled("games", "Grand Theft Auto: San Andreas");
    titled("games", "God of War");
    assert.equal(titled("games", "Hitman").films?.length, 8);
  });

  it("lists the owner's channels, still without any embed", () => {
    const channels = app("channels");
    assert.equal(channels.sample, false);
    assert.deepEqual(
      channels.titles.map((entry) => entry.title),
      ["midudev", "Gentleman Programming", "Fazt", "Dalto", "Theo (t3.gg)"],
    );
  });

  it("marks only the rows still without the owner's picks as samples", () => {
    assert.deepEqual(
      TV_APPS.filter((entry) => entry.sample).map((entry) => entry.id),
      ["anime", "highlights"],
    );
  });

  it("keeps no confirm flags and invents no notes", () => {
    for (const title of allTitles) {
      assert.equal(title.confirm, undefined, title.title);
      assert.equal(title.note, undefined, title.title);
    }
  });

  it("plays the owner's own Carneros clip from My videos", () => {
    const [clip] = app("videos").titles;
    assert.ok(clip.video);
    assert.equal(clip.video.src, "/world/stories/carneros-dc-32-clip.mp4");
    assert.ok(
      existsSync(new URL(`../../public${clip.video.src}`, import.meta.url)),
    );
    assert.ok(
      existsSync(new URL(`../../public${clip.video.poster}`, import.meta.url)),
    );
  });

  it("draws every cover from a CSS motif and links nothing third-party", () => {
    for (const title of allTitles)
      assert.ok(COVER_MOTIFS.includes(title.motif), title.title);
    const text = JSON.stringify(TV_APPS);
    assert.doesNotMatch(text, /https?:/);
    // The only image is the owner's own clip poster, shipped locally.
    for (const image of text.match(/"[^"]*\.(jpe?g|png|webp)"/g) ?? [])
      assert.match(image, /^"\/world\/stories\/carneros-dc-32-clip-poster/);
  });

  it("gives every title a unique id and resolves the continue row", () => {
    const ids = allTitles.map((title) => title.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(TV_CONTINUE.length >= 3);
    for (const id of TV_CONTINUE) assert.ok(tvTitle(id));
    assert.throws(() => tvTitle("nope"), RangeError);
  });

  it("counts each app for the dock", () => {
    assert.equal(appCount(app("videos")), "1 clip");
    assert.equal(appCount(app("channels")), "5 channels");
    assert.equal(appCount(app("games")), "4 picks");
    assert.equal(appCount(app("radio")), "Five lo-fi loops");
  });
});

describe("TV camera framing (T2)", () => {
  const sofa = LIVING_MODELS.find((model) => model.kind === "sofa");
  assert.ok(sofa);
  const sofaFront = modelBounds(sofa).z0;

  for (const aspect of [1440 / 900, 1280 / 800, 390 / 844, 1])
    it(`looks straight at the panel from the room at aspect ${aspect.toFixed(2)}`, () => {
      const { position, target, fov } = tvCameraFocus(aspect);
      const [cx, cy, cz] = TV_PANEL.center;
      assert.deepEqual(target, TV_PANEL.center);
      assert.equal(position[0], cx);
      assert.equal(position[1], cy);
      assert.ok(position[2] > cz + TV_FOCUS.minDistance - 1e-9);
      assert.ok(position[2] < sofaFront, "the eye stays in front of the sofa");
      assert.equal(fov, GUIDE.fov);
    });

  it("fits the whole panel on landscape screens", () => {
    const aspect = 1440 / 900;
    const { position } = tvCameraFocus(aspect);
    const d = position[2] - TV_PANEL.center[2];
    const halfH = d * Math.tan(((GUIDE.fov / 2) * Math.PI) / 180);
    assert.ok(TV_PANEL.width / 2 <= halfH * aspect);
    assert.ok(TV_PANEL.height / 2 <= halfH);
  });

  it("rejects a bad aspect", () => {
    assert.throws(() => tvCameraFocus(0), RangeError);
    assert.throws(() => tvCameraFocus(Number.NaN), RangeError);
  });
});

describe("TV remote focus (T2)", () => {
  const rows = [7, 6, 4];
  it("moves within a row and stops at its ends", () => {
    assert.deepEqual(moveRemote({ row: 1, col: 0 }, "ArrowRight", rows), {
      row: 1,
      col: 1,
    });
    assert.deepEqual(moveRemote({ row: 1, col: 0 }, "ArrowLeft", rows), {
      row: 1,
      col: 0,
    });
    assert.deepEqual(moveRemote({ row: 1, col: 5 }, "ArrowRight", rows), {
      row: 1,
      col: 5,
    });
  });

  it("moves between rows keeping the column where it can", () => {
    assert.deepEqual(moveRemote({ row: 0, col: 6 }, "ArrowDown", rows), {
      row: 1,
      col: 5,
    });
    assert.deepEqual(moveRemote({ row: 1, col: 2 }, "ArrowUp", rows), {
      row: 0,
      col: 2,
    });
    assert.deepEqual(moveRemote({ row: 2, col: 1 }, "ArrowDown", rows), {
      row: 2,
      col: 1,
    });
  });

  it("skips empty rows and ignores other keys", () => {
    assert.deepEqual(moveRemote({ row: 0, col: 1 }, "ArrowDown", [7, 0, 3]), {
      row: 2,
      col: 1,
    });
    assert.equal(moveRemote({ row: 0, col: 0 }, "Enter", rows), null);
  });
});

describe("TV wiring (T2)", () => {
  const worldApp = read("src/components/world/WorldApp.tsx");
  const scene = read("src/components/world/WorldScene.tsx");
  const living = read("src/components/world/Living.tsx");
  const home = read("src/components/world/TvHome.tsx");
  const css = read("src/components/world/tv-home.css");

  it("opens the TV only from the room, closing any inspection", () => {
    assert.match(
      worldApp,
      /if \(!focus && !portrait && !speakers\) \{\s*setGalleryCase\(null\);\s*setTv\(true\)/,
    );
    assert.match(
      worldApp,
      /onEnter:\s*ready && entered && !focus && !portrait && !speakers\s*\? enterTv/,
    );
  });

  it("shows the overlay once the camera arrives, with a fallback", () => {
    assert.match(worldApp, /onArrive: arriveTv/);
    assert.match(worldApp, /setTimeout\(arriveTv, ARRIVAL_FALLBACK_MS\)/);
    assert.match(worldApp, /\{tvOpen && \(\s*<TvHome/);
    assert.match(worldApp, /onClose=\{leaveTv\}/);
  });

  it("hides the world controls like the other close-ups", () => {
    assert.match(worldApp, /tv && "world-terminal-focus"/);
    assert.match(worldApp, /tv && "world-tv-focus"/);
    assert.match(css, /\.world-tv-focus > header/);
    assert.match(
      css,
      /\.world-tv-focus > \.world-entry-scene \{\s*pointer-events: none;/,
    );
  });

  it("moves the camera to the TV pose and reports arrival", () => {
    assert.match(scene, /"terminal" \| "portrait" \| "speakers" \| "tv"/);
    assert.match(scene, /tv\?\.focused\s*\? "tv"/);
    assert.match(scene, /closeUp === "tv" \? tvCameraFocus\(aspect\)/);
    assert.match(scene, /onTvArrive=\{tv\?\.onArrive\}/);
  });

  it("passes the TV click to both Living branches", () => {
    assert.equal(scene.match(/<Living[^>]*tv=\{tv\}/g)?.length, 2);
    assert.match(living, /name="living-tv-hitbox"/);
    assert.match(living, /e\.stopPropagation\(\);\s*tv\.onEnter\(\)/);
    assert.match(living, /e\.delta > CLICK_SLOP/);
  });

  it("is a labelled modal with Esc, a muted clip and no third-party embeds", () => {
    assert.match(home, /role="dialog"/);
    assert.match(home, /aria-modal="true"/);
    assert.match(home, /event\.key === "Escape"/);
    assert.match(home, /<video[^>]*\bmuted\b/);
    assert.match(home, /<video[^>]*\bcontrols\b/);
    assert.doesNotMatch(home, /autoPlay/);
    assert.doesNotMatch(home, /<iframe/);
    assert.doesNotMatch(
      home,
      /https?:|youtube\.com|youtu\.be|ytimg|themoviedb|igdb\.com/i,
    );
    assert.match(home, /Sample picks · replace with yours/);
    assert.match(home, /coming soon/);
  });

  it("respects reduced motion and narrow screens", () => {
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /max-width: 767px/);
  });
});
