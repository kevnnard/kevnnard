import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GUIDE } from "../../src/lib/world/camera.ts";
import {
  LIVING_MODELS,
  modelBounds,
  TV_PANEL,
  TV_SCREEN,
} from "../../src/lib/world/living.ts";
import { coverKey, TV_COVERS } from "../../src/lib/world/tv-covers.ts";
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
import {
  TV_TRAILERS,
  TV_VIDEOS,
  TV_YOUTUBE,
} from "../../src/lib/world/tv-media.ts";
import {
  initialTvHome,
  TV_SCREEN_H,
  TV_SCREEN_W,
  type TvHomeState,
  type TvScreenOptions,
  tvClock,
  tvCoverSrc,
  tvHitAt,
  tvHomeAction,
  tvImageSources,
  tvMove,
  tvScreenLayout,
  tvUvToCanvas,
} from "../../src/lib/world/tv-screen.ts";

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
  it("lists the apps of the chosen artboard and Live, in order", () => {
    assert.deepEqual(
      TV_APPS.map((entry) => entry.label),
      [
        "Movies & Series",
        "Games",
        "My videos",
        "Channels",
        "Live",
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

  it("lists the owner's YouTube channels and Twitch streamers", () => {
    const channels = app("channels");
    assert.equal(channels.sample, false);
    assert.deepEqual(
      channels.titles.map((entry) => entry.title),
      ["midudev", "Gentleman Programming", "Fazt", "Dalto", "Theo (t3.gg)"],
    );
    const live = app("live");
    assert.equal(live.sample, false);
    assert.deepEqual(
      live.titles.map((entry) => entry.title),
      ["Gentleman Programming", "midudev", "melenitasdev"],
    );
    assert.ok(live.titles.every((entry) => entry.app === "live"));
  });

  it("keeps no sample rows: every app holds the owner's picks (T10, S11)", () => {
    assert.deepEqual(
      TV_APPS.filter((entry) => entry.sample).map((entry) => entry.id),
      [],
    );
  });

  it("lists the best-known anime series and real highlights (T10, S11)", () => {
    assert.deepEqual(
      app("anime").titles.map((entry) => [entry.title, entry.year]),
      [
        ["Naruto", 2002],
        ["Naruto Shippuden", 2007],
        ["Dragon Ball Z", 1989],
        ["Demon Slayer: Kimetsu no Yaiba", 2019],
        ["One Piece", 1999],
      ],
    );
    assert.deepEqual(
      app("highlights").titles.map((entry) => entry.id),
      ["highlights-nfl", "highlights-jordan"],
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

  it("draws every cover from a motif and links nothing third-party", () => {
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
    assert.equal(appCount(app("live")), "3 on Twitch");
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

const IDLE: TvScreenOptions = {
  active: false,
  clock: "21:30",
  music: { playing: false, track: null },
  clipPlaying: false,
};
const ACTIVE: TvScreenOptions = { ...IDLE, active: true };
const center = (layout: ReturnType<typeof tvScreenLayout>, id: string) => {
  const region = layout.regions.find((entry) => entry.id === id);
  assert.ok(region, `missing region ${id}`);
  return [region.x + region.w / 2, region.y + region.h / 2] as const;
};
/** Presses region ids in turn from `state`, keeping the last effect. */
const press = (state: TvHomeState, ...ids: string[]) => {
  let effect: string | null = null;
  for (const id of ids) ({ state, effect } = tvHomeAction(state, id));
  return { state, effect };
};

describe("TV home screen on the panel (tv-home-screen T3, S6)", () => {
  it("covers the panel's glass in front of its old picture", () => {
    assert.ok(TV_SCREEN.width < TV_PANEL.width);
    assert.ok(TV_SCREEN.height < TV_PANEL.height);
    assert.equal(TV_SCREEN.center[0], TV_PANEL.center[0]);
    assert.ok(Math.abs(TV_SCREEN.center[1] - TV_PANEL.center[1]) < 0.02);
    // In front of the panel face and the glow picture drawn on it.
    assert.ok(TV_SCREEN.center[2] > TV_PANEL.center[2] + 0.0175);
    assert.ok(TV_SCREEN.center[2] < TV_PANEL.center[2] + 0.03);
  });

  it("lays the screen out at the glass's 16:9 proportions", () => {
    const ratio = TV_SCREEN_W / TV_SCREEN_H;
    assert.ok(
      Math.abs(ratio / (TV_SCREEN.width / TV_SCREEN.height) - 1) < 0.01,
    );
    assert.ok(Math.abs(ratio / (16 / 9) - 1) < 0.01);
    assert.deepEqual(tvUvToCanvas(0, 1), { x: 0, y: 0 });
    assert.deepEqual(tvUvToCanvas(1, 0), { x: TV_SCREEN_W, y: TV_SCREEN_H });
    assert.equal(tvClock(21.5), "21:30");
    assert.equal(tvClock(-0.25), "23:45");
  });

  it("shows the idle preview: dock, Ghost of Tsushima and a cover row", () => {
    const layout = tvScreenLayout(initialTvHome(), IDLE);
    assert.equal(layout.dock.length, 8);
    assert.equal(layout.hero.title, "Ghost of Tsushima");
    assert.match(layout.hero.kicker, /Games · my favourite/);
    assert.equal(layout.coversHeading, "Games");
    assert.ok(layout.covers.length >= 4);
    assert.ok(layout.continued.length >= 3);
    assert.equal(layout.ring, null, "no remote ring while idle");
    assert.match(layout.hint, /Click or tap the TV/);
    for (const region of layout.regions) {
      assert.ok(region.x >= 0 && region.y >= 0, region.id);
      assert.ok(region.x + region.w <= TV_SCREEN_W, region.id);
      assert.ok(region.y + region.h <= TV_SCREEN_H, region.id);
    }
  });

  it("rings the remote's position once the TV is in use", () => {
    const state = initialTvHome();
    const layout = tvScreenLayout(state, ACTIVE);
    assert.equal(layout.ring, `cover:${state.pos.col}`);
    assert.match(layout.hint, /Esc/);
  });

  it("hit-tests the drawn items from the screen's UV", () => {
    const layout = tvScreenLayout(initialTvHome(), ACTIVE);
    for (const id of ["back", "dock:0", "dock:7", "cover:1", "continue:0"]) {
      const [x, y] = center(layout, id);
      assert.equal(tvHitAt(layout, x, y), id);
    }
    assert.equal(tvHitAt(layout, 2, TV_SCREEN_H - 2), null);
  });

  it("switches apps from the dock and opens a collection twice-pressed", () => {
    let { state } = press(initialTvHome(), "dock:0");
    assert.equal(state.app, "movies");
    assert.deepEqual(state.pos, { row: 0, col: 0 });
    const layout = tvScreenLayout(state, ACTIVE);
    assert.equal(layout.hero.title, "Harry Potter");
    ({ state } = press(state, "cover:0"));
    assert.equal(state.opened, null, "the first press only picks it");
    ({ state } = press(state, "cover:0"));
    assert.equal(state.opened, "harry-potter");
    assert.deepEqual(state.pos, { row: 1, col: 1 });
    const opened = tvScreenLayout(state, ACTIVE);
    assert.equal(opened.covers[0].kind, "back");
    assert.equal(opened.covers.length, 9);
    ({ state } = press(state, "cover:3"));
    assert.equal(
      tvScreenLayout(state, ACTIVE).hero.title,
      "Harry Potter and the Prisoner of Azkaban",
    );
    ({ state } = press(state, "cover:0"));
    assert.equal(state.opened, null, "the back cover closes it");
  });

  it("opens a collection from the hero's primary button", () => {
    const { state } = press(initialTvHome(), "dock:1", "cover:3");
    const layout = tvScreenLayout(state, ACTIVE);
    assert.equal(layout.hero.primary, "Open collection");
    assert.equal(press(state, "primary").state.opened, "hitman");
  });

  it("plays the muted clip and the lo-fi radio through effects", () => {
    const clip = press(initialTvHome(), "continue:0");
    assert.equal(clip.effect, null);
    const layout = tvScreenLayout(clip.state, ACTIVE);
    assert.equal(layout.hero.title, "Carneros DC #32 · game clip");
    assert.equal(layout.hero.video, "/world/stories/carneros-dc-32-clip.mp4");
    assert.equal(layout.hero.primary, "Play clip · muted");
    assert.equal(
      tvScreenLayout(clip.state, { ...ACTIVE, clipPlaying: true }).hero.primary,
      "Pause clip",
    );
    assert.equal(tvHomeAction(clip.state, "primary").effect, "clip");
    assert.equal(tvHomeAction(clip.state, "continue:0").effect, "clip");
    const radio = press(initialTvHome(), "dock:7");
    assert.equal(
      tvScreenLayout(radio.state, ACTIVE).hero.primary,
      "Play on the speakers",
    );
    assert.equal(
      tvScreenLayout(radio.state, {
        ...ACTIVE,
        music: { playing: true, track: "Rain" },
      }).hero.primary,
      "Pause the speakers",
    );
    assert.equal(tvHomeAction(radio.state, "primary").effect, "music");
  });

  it("plays a film's or game's trailer from its secondary button", () => {
    const ghost = initialTvHome();
    const layout = tvScreenLayout(ghost, ACTIVE);
    assert.equal(layout.hero.secondary, "Watch trailer · YouTube");
    assert.equal(layout.hero.secondaryReady, true);
    assert.equal(layout.player, null, "nothing plays before a press");
    const { state, effect } = tvHomeAction(ghost, "secondary");
    assert.equal(effect, null);
    assert.deepEqual(state.player?.media, {
      kind: "trailer",
      youtube: TV_TRAILERS["ghost-of-tsushima"].youtube,
    });
    const playing = tvScreenLayout(state, ACTIVE).player;
    assert.ok(playing);
    assert.equal(playing.platform, "YouTube");
    assert.equal(playing.title, "Ghost of Tsushima · trailer");
    // An entry of an opened collection plays its own trailer.
    const azkaban = press(initialTvHome(), "dock:0", "cover:0", "cover:0");
    const entry = press(azkaban.state, "cover:3", "secondary").state;
    assert.deepEqual(entry.player?.media, {
      kind: "trailer",
      youtube:
        TV_TRAILERS[
          "harry-potter/harry-potter-and-the-prisoner-of-azkaban-2004"
        ].youtube,
    });
    // A closed collection opens instead; it has no trailer of its own.
    const closed = press(initialTvHome(), "dock:0").state;
    assert.equal(tvScreenLayout(closed, ACTIVE).hero.secondary, null);
    assert.equal(tvHomeAction(closed, "secondary").state.player, null);
  });

  it("plays a channel's uploads, and its live stream as a second option", () => {
    const channel = press(initialTvHome(), "dock:3").state;
    const layout = tvScreenLayout(channel, ACTIVE);
    assert.equal(layout.hero.title, "midudev");
    assert.equal(layout.hero.primary, "Play latest uploads · YouTube");
    assert.equal(layout.hero.secondary, "Live now · YouTube");
    const { channelId } = TV_YOUTUBE["channel-midudev"];
    const uploads = press(channel, "primary").state;
    assert.deepEqual(uploads.player?.media, { kind: "uploads", channelId });
    const player = tvScreenLayout(uploads, ACTIVE).player;
    assert.ok(player);
    assert.match(player.credit, /midudev/);
    assert.deepEqual(
      player.options.map((option) => [option.id, option.current]),
      [
        ["player:uploads", true],
        ["player:live", false],
      ],
    );
    const live = press(uploads, "player:live").state;
    assert.deepEqual(live.player?.media, { kind: "live", channelId });
    assert.deepEqual(press(channel, "secondary").state.player?.media, {
      kind: "live",
      channelId,
    });
    // Pressing the picked channel's cover again plays it too.
    assert.equal(
      press(channel, "cover:0", "cover:0").state.player?.media.kind,
      "uploads",
    );
  });

  it("plays a Twitch channel from the Live app, muted", () => {
    const live = press(initialTvHome(), "dock:4").state;
    const layout = tvScreenLayout(live, ACTIVE);
    assert.equal(layout.coversHeading, "Live");
    assert.equal(layout.hero.title, "Gentleman Programming");
    assert.equal(layout.hero.primary, "Watch on Twitch · muted");
    assert.equal(layout.hero.secondary, null);
    const { state } = press(live, "primary");
    assert.deepEqual(state.player?.media, {
      kind: "twitch",
      login: "gentleman_programming",
    });
    const player = tvScreenLayout(state, ACTIVE).player;
    assert.equal(player?.platform, "Twitch");
    assert.deepEqual(player?.options, []);
  });

  it("closes the player first on Esc, then leaves the TV", () => {
    const playing = press(initialTvHome(), "secondary").state;
    assert.ok(playing.player);
    const first = tvHomeAction(playing, "escape");
    assert.equal(first.effect, null, "Esc closes only the player");
    assert.equal(first.state.player, null);
    assert.equal(first.state.hero.id, "ghost-of-tsushima", "home as it was");
    assert.equal(tvHomeAction(first.state, "escape").effect, "exit");
    assert.equal(tvHomeAction(playing, "player:close").state.player, null);
    assert.equal(tvMove(playing, "ArrowLeft"), null, "the remote waits");
    // Another item on the screen or the companion closes it too.
    assert.equal(press(playing, "dock:0").state.player, null);
    assert.equal(tvHomeAction(initialTvHome(), "back").effect, "exit");
  });

  it("plays NFL's uploads and Jordan's highlights from Highlights (T10)", () => {
    const highlights = press(initialTvHome(), "dock:6").state;
    const nfl = tvScreenLayout(highlights, ACTIVE);
    assert.equal(nfl.hero.title, "NFL");
    assert.equal(nfl.hero.primary, "Play latest uploads · YouTube");
    assert.deepEqual(press(highlights, "primary").state.player?.media, {
      kind: "uploads",
      channelId: TV_YOUTUBE["highlights-nfl"].channelId,
    });
    const jordan = press(highlights, "cover:1").state;
    assert.equal(tvScreenLayout(jordan, ACTIVE).hero.primary, "Play · YouTube");
    const played = press(jordan, "primary").state;
    assert.deepEqual(played.player?.media, {
      kind: "video",
      youtube: TV_VIDEOS["highlights-jordan"].youtube,
    });
    assert.match(
      tvScreenLayout(played, ACTIVE).player?.credit ?? "",
      /YouTube · NBA/,
    );
  });

  it("plays each anime series' trailer (T10)", () => {
    const anime = press(initialTvHome(), "dock:5").state;
    const layout = tvScreenLayout(anime, ACTIVE);
    assert.equal(layout.hero.title, "Naruto");
    assert.equal(layout.hero.secondary, "Watch trailer · YouTube");
    assert.deepEqual(press(anime, "secondary").state.player?.media, {
      kind: "trailer",
      youtube: TV_TRAILERS.naruto.youtube,
    });
  });

  it("renders no player in any state reached without a play press", () => {
    const states = [
      initialTvHome(),
      ...TV_APPS.map((_, col) => press(initialTvHome(), `dock:${col}`).state),
    ];
    for (const state of states)
      for (const options of [IDLE, ACTIVE])
        assert.equal(tvScreenLayout(state, options).player, null);
    // Idle in the room the player never shows, even if it was open.
    const playing = press(initialTvHome(), "secondary").state;
    assert.equal(tvScreenLayout(playing, IDLE).player, null);
  });

  it("moves the remote with the arrows and keeps the ring in view", () => {
    let state = press(initialTvHome(), "dock:0", "cover:2", "cover:2").state;
    assert.equal(state.opened, "quentin-tarantino");
    for (let i = 0; i < 12; i++) state = tvMove(state, "ArrowRight") ?? state;
    assert.deepEqual(state.pos, { row: 1, col: 10 });
    const layout = tvScreenLayout(state, ACTIVE);
    const [x] = center(layout, "cover:10");
    assert.ok(x < TV_SCREEN_W, "the last film scrolls into view");
    assert.equal(
      layout.regions.some((r) => r.id === "cover:0"),
      false,
    );
    assert.deepEqual(tvMove(state, "ArrowUp")?.pos, { row: 0, col: 7 });
    assert.equal(tvMove(state, "Enter"), null);
  });

  it("names every item for the accessible companion", () => {
    const layout = tvScreenLayout(initialTvHome(), ACTIVE);
    for (const cover of [...layout.covers, ...layout.continued])
      assert.ok(cover.label.length > 0, cover.id);
    assert.match(
      layout.covers.find((cover) => cover.title === "Ghost of Tsushima")
        ?.label ?? "",
      /Ghost of Tsushima, 2020, my favourite/,
    );
  });
});

describe("Real covers on the TV screen (tv-home-screen T7, S7)", () => {
  const manifest = (key: string) =>
    Object.hasOwn(TV_COVERS, key) ? TV_COVERS[key].src : null;
  const opened = (id: string) => {
    const title = tvTitle(id);
    const appCol = TV_APPS.findIndex((entry) => entry.id === title.app);
    const col = app(title.app).titles.indexOf(title);
    return press(initialTvHome(), `dock:${appCol}`, `cover:${col}`, "primary")
      .state;
  };

  it("shows Ghost of Tsushima's cover in the idle preview's hero and row", () => {
    const layout = tvScreenLayout(initialTvHome(), IDLE);
    assert.equal(layout.hero.cover, TV_COVERS["ghost-of-tsushima"].src);
    for (const item of layout.covers) {
      const title = titled("games", item.title);
      assert.equal(item.cover, manifest(title.id), item.title);
      assert.ok(item.cover, `${item.title} has a cover`);
    }
  });

  it("resolves every Movies and Games cover to the manifest", () => {
    for (const appId of ["movies", "games"]) {
      const appCol = TV_APPS.findIndex((entry) => entry.id === appId);
      const state = press(initialTvHome(), `dock:${appCol}`).state;
      const layout = tvScreenLayout(state, ACTIVE);
      layout.covers.forEach((item, col) => {
        const title = app(appId).titles[col];
        assert.equal(item.cover, manifest(title.id), title.title);
        assert.ok(item.cover, `${title.title} has a cover`);
      });
    }
  });

  it("draws each film and game of an opened collection with its own cover", () => {
    for (const title of allTitles.filter((entry) => entry.films)) {
      const state = opened(title.id);
      assert.equal(state.opened, title.id);
      const layout = tvScreenLayout(state, ACTIVE);
      assert.equal(layout.covers[0].kind, "back");
      assert.equal(layout.covers[0].cover, null, "the back card is drawn");
      (title.films ?? []).forEach((entry, i) => {
        const key = coverKey(title.id, entry);
        assert.equal(layout.covers[i + 1].cover, manifest(key), key);
        assert.ok(layout.covers[i + 1].cover, `${key} has a cover`);
      });
      const picked = press(state, "cover:2").state;
      assert.equal(
        tvScreenLayout(picked, ACTIVE).hero.cover,
        manifest(coverKey(title.id, (title.films ?? [])[1])),
        "the hero shows the picked entry's cover",
      );
    }
  });

  it("shows each YouTube and Twitch channel's own art (T8)", () => {
    for (const [appId, note] of [
      ["channels", /channel art from YouTube · see Credits/],
      ["live", /channel art from Twitch · see Credits/],
    ] as const) {
      const appCol = TV_APPS.findIndex((entry) => entry.id === appId);
      const layout = tvScreenLayout(
        press(initialTvHome(), `dock:${appCol}`).state,
        ACTIVE,
      );
      assert.match(layout.coversNote, note);
      assert.equal(layout.hero.cover, manifest(app(appId).titles[0].id));
      layout.covers.forEach((item, col) => {
        const { id } = app(appId).titles[col];
        assert.ok(item.cover, `${id} has channel art`);
        assert.equal(item.cover, manifest(id));
      });
    }
    const idle = tvScreenLayout(initialTvHome(), IDLE);
    const midudev = TV_CONTINUE.indexOf("channel-midudev");
    assert.equal(idle.continued[midudev].cover, manifest("channel-midudev"));
  });

  it("keeps the drawn motif where no cover exists", () => {
    for (const appId of ["radio"]) {
      const appCol = TV_APPS.findIndex((entry) => entry.id === appId);
      const layout = tvScreenLayout(
        press(initialTvHome(), `dock:${appCol}`).state,
        ACTIVE,
      );
      assert.equal(layout.hero.cover, null, appId);
      for (const item of layout.covers) {
        assert.equal(item.cover, null, item.title);
        assert.ok(COVER_MOTIFS.includes(item.motif), item.title);
      }
    }
    const unknown: TvTitle = {
      id: "not-in-the-manifest",
      app: "movies",
      title: "Not in the manifest",
      motif: "moon",
    };
    assert.equal(tvCoverSrc(unknown), null);
    assert.equal(
      tvCoverSrc(tvTitle("harry-potter"), { title: "Unknown", year: 1999 }),
      null,
    );
  });

  it("gives the Continue row the clip's own poster and covers where they exist", () => {
    const layout = tvScreenLayout(initialTvHome(), IDLE);
    layout.continued.forEach((item, col) => {
      const title = tvTitle(TV_CONTINUE[col]);
      const expected = title.video?.poster ?? manifest(title.id);
      assert.equal(item.cover, expected, title.title);
    });
    assert.equal(
      layout.continued[0].cover,
      "/world/stories/carneros-dc-32-clip-poster.jpg",
    );
    const clip = press(initialTvHome(), "continue:0").state;
    const hero = tvScreenLayout(clip, ACTIVE).hero;
    assert.equal(hero.cover, null, "the clip's hero shows its frame or poster");
    assert.equal(hero.poster, "/world/stories/carneros-dc-32-clip-poster.jpg");
  });

  it("loads only shipped local images, never a third-party URL", () => {
    const states = [
      initialTvHome(),
      ...TV_APPS.map((_, col) => press(initialTvHome(), `dock:${col}`).state),
      ...allTitles.filter((entry) => entry.films).map((t) => opened(t.id)),
      press(initialTvHome(), "continue:0").state,
    ];
    const shipped = new Set([
      ...Object.values(TV_COVERS).map((cover) => cover.src),
      "/world/stories/carneros-dc-32-clip-poster.jpg",
    ]);
    const seen = new Set<string>();
    for (const state of states)
      for (const options of [IDLE, ACTIVE])
        for (const src of tvImageSources(tvScreenLayout(state, options))) {
          assert.ok(shipped.has(src), src);
          assert.doesNotMatch(src, /^(https?:)?\/\//);
          assert.ok(
            existsSync(new URL(`../../public${src}`, import.meta.url)),
            src,
          );
          seen.add(src);
        }
    assert.ok(seen.has(TV_COVERS["ghost-of-tsushima"].src));
    const idle = tvImageSources(tvScreenLayout(initialTvHome(), IDLE));
    assert.equal(new Set(idle).size, idle.length, "each image listed once");
    assert.ok(idle.includes(TV_COVERS.hitman.src), "the idle row's covers");
  });
});

describe("Every tile on the TV has a cover and an action (T10, S11)", () => {
  /** Lo-fi radio's art is drawn locally; the own clip has its poster. */
  const LOCAL_ART = new Set(["lofi-radio"]);
  const plays = (state: TvHomeState, id: string) => {
    const { state: next, effect } = tvHomeAction(state, id);
    return (
      Boolean(next.player) ||
      next.opened !== state.opened ||
      effect === "clip" ||
      effect === "music"
    );
  };

  it("draws a dock icon and switches app for every dock tile", () => {
    const screen = read("src/components/world/TvScreen.tsx");
    TV_APPS.forEach((entry, col) => {
      assert.match(
        screen,
        new RegExp(`\\b${entry.id}:\\s*\\n?\\s*"M`),
        entry.id,
      );
      assert.equal(press(initialTvHome(), `dock:${col}`).state.app, entry.id);
    });
  });

  it("covers every title of every app, and Enter twice plays or opens it", () => {
    TV_APPS.forEach((entry, appCol) => {
      const home = press(initialTvHome(), `dock:${appCol}`).state;
      const layout = tvScreenLayout(home, ACTIVE);
      entry.titles.forEach((title, col) => {
        const item = layout.covers[col];
        assert.equal(item.title, title.title);
        if (!LOCAL_ART.has(title.id))
          assert.ok(item.cover, `${title.id} cover`);
        const picked = press(home, `cover:${col}`).state;
        assert.ok(plays(picked, `cover:${col}`), `${title.id} does something`);
      });
    });
  });

  it("covers every film and game inside a collection, each playing its trailer", () => {
    for (const title of allTitles.filter((entry) => entry.films)) {
      const appCol = TV_APPS.findIndex((entry) => entry.id === title.app);
      const col = app(title.app).titles.indexOf(title);
      const opened = press(
        initialTvHome(),
        `dock:${appCol}`,
        `cover:${col}`,
        "primary",
      ).state;
      (title.films ?? []).forEach((film, i) => {
        const id = `cover:${i + 1}`;
        assert.ok(
          tvScreenLayout(opened, ACTIVE).covers[i + 1].cover,
          film.title,
        );
        const picked = press(opened, id).state;
        assert.ok(plays(picked, id), `${film.title} plays its trailer`);
      });
    }
  });

  it("covers every Continue tile and plays it", () => {
    const layout = tvScreenLayout(initialTvHome(), ACTIVE);
    TV_CONTINUE.forEach((id, col) => {
      if (!LOCAL_ART.has(id)) assert.ok(layout.continued[col].cover, id);
      const picked = press(initialTvHome(), `continue:${col}`).state;
      assert.ok(plays(picked, `continue:${col}`), `${id} does something`);
    });
  });

  it("shows the own clip's poster in its own row too", () => {
    const videos = TV_APPS.findIndex((entry) => entry.id === "videos");
    const layout = tvScreenLayout(
      press(initialTvHome(), `dock:${videos}`).state,
      ACTIVE,
    );
    assert.equal(
      layout.covers[0].cover,
      "/world/stories/carneros-dc-32-clip-poster.jpg",
    );
  });
});

describe("TV wiring (T3)", () => {
  const worldApp = read("src/components/world/WorldApp.tsx");
  const scene = read("src/components/world/WorldScene.tsx");
  const living = read("src/components/world/Living.tsx");
  const screen = read("src/components/world/TvScreen.tsx");
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

  it("starts no other close-up while the TV holds the camera", () => {
    assert.match(
      worldApp,
      /terminal=\{tv \? \{ \.\.\.screen, onEnter: undefined \} : screen\}/,
    );
    assert.match(
      worldApp,
      /portrait=\{\s*tv\s*\? \{ \.\.\.portraitControl, onEnter: undefined \}\s*: portraitControl\s*\}/,
    );
    assert.match(
      worldApp,
      /speakers=\{\s*tv \? \{ \.\.\.speakerControl, onFocus: undefined \} : speakerControl\s*\}/,
    );
    assert.match(
      worldApp,
      /ready && entered && !focus && !portrait && !speakers && !tv\s*\? setGalleryCase/,
    );
  });

  it("draws the home screen on the panel: a canvas texture, no overlay", () => {
    assert.match(living, /<TvScreen/);
    assert.match(screen, /name="living-tv-screen"/);
    assert.match(screen, /new CanvasTexture\(/);
    assert.match(screen, /tvHitAt\(/);
    assert.match(screen, /event\.delta > CLICK_SLOP/);
    assert.doesNotMatch(living, /living-tv-hitbox/);
    assert.doesNotMatch(home, /role="dialog"|aria-modal/);
    assert.doesNotMatch(css, /\.tv-home \{|position: fixed|z-index/);
    assert.doesNotMatch(css, /pointer-events: none/, "the screen takes clicks");
  });

  it("makes the screen interactive once the camera arrives, with a fallback", () => {
    assert.match(worldApp, /onArrive: arriveTv/);
    assert.match(worldApp, /setTimeout\(arriveTv, ARRIVAL_FALLBACK_MS\)/);
    assert.match(worldApp, /active: tvOpen/);
    assert.match(worldApp, /\{tvOpen && \(\s*<TvHome/);
    assert.match(worldApp, /onClose=\{leaveTv\}/);
  });

  it("hides the world header and controls like the monitor close-up", () => {
    assert.match(worldApp, /tv && "world-terminal-focus"/);
    assert.match(worldApp, /tv && "world-tv-focus"/);
    assert.match(css, /\.world-tv-focus > header \{\s*visibility: hidden;/);
  });

  it("moves the camera to the TV pose and reports arrival", () => {
    assert.match(scene, /"terminal" \| "portrait" \| "speakers" \| "tv"/);
    assert.match(scene, /tv\?\.focused\s*\? "tv"/);
    assert.match(scene, /closeUp === "tv" \? tvCameraFocus\(aspect\)/);
    assert.match(scene, /onTvArrive=\{tv\?\.onArrive\}/);
    assert.equal(scene.match(/<Living[^>]*tv=\{tv\}/g)?.length, 2);
  });

  it("keeps an offscreen keyboard companion with Esc and named items", () => {
    assert.match(home, /className="tv-companion"/);
    assert.match(css, /\.tv-companion \{[^}]*clip-path: inset\(50%\)/);
    assert.match(home, /event\.key === "Escape"/);
    assert.match(home, /aria-live="polite"/);
    assert.match(home, /data-region=/);
  });

  it("plays only the owner's muted clip, user-started, and nothing third-party", () => {
    assert.match(home, /<video[^>]*\bmuted\b/);
    assert.doesNotMatch(home + screen, /autoPlay|<iframe/);
    assert.match(worldApp, /tvVideo\.current/);
    assert.match(screen, /drawImage\(/);
    for (const source of [home, screen])
      assert.doesNotMatch(
        source,
        /https?:|youtube\.com|youtu\.be|ytimg|themoviedb|igdb\.com/i,
      );
    assert.match(
      screen + read("src/lib/world/tv-screen.ts"),
      /Sample picks · replace with yours/,
    );
  });

  it("plays YouTube and Twitch on the TV's glass only after a press (T8)", () => {
    const player = read("src/components/world/TvPlayer.tsx");
    const playerCss = read("src/components/world/tv-player.css");
    // The one iframe lives in TvPlayer, built from the pinned media.
    assert.equal(player.match(/<iframe/g)?.length, 1);
    assert.match(
      player,
      /tvEmbedSrc\(view\.media, window\.location\.hostname\)/,
    );
    assert.match(player, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.match(player, /data-region="player:close"/);
    assert.doesNotMatch(player, /https?:/, "URLs come from tv-media.ts");
    // Framed on the panel, mounted only while the close-up plays something.
    assert.match(screen, /\{active && layout\.player && \(\s*<Html/);
    assert.match(screen, /<TvPlayer/);
    assert.match(screen, /transform/);
    assert.match(playerCss, /\.tv-player \{/);
    // Esc goes through the remote: the player first, then the room.
    assert.match(home, /keys\.current\.onPress\("escape"\)/);
    assert.match(worldApp, /if \(effect === "exit"\) leaveTv\(\)/);
  });

  it("draws covers from a decoded image cache, with a scrim under the title", () => {
    assert.match(screen, /tvImageSources\(layout\)/);
    assert.match(screen, /new Map<string, /);
    assert.match(screen, /\.decode\(\)/);
    assert.match(
      screen,
      /drawCover\(ctx, item, false, lift\(item\.id\), image\(item\.cover\)\)/,
    );
    assert.match(screen, /shade\(ctx, area/);
  });

  it("redraws only on change, animating nothing but the started clip", () => {
    assert.match(screen, /if \(!active \|\| !clipPlaying\) return;/);
    assert.match(worldApp, /reducedMotion=\{reducedMotion\}/);
  });
});
