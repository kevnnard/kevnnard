// World speaker music (T2, S1-S5): the shelf speakers' hit areas, distance
// fade, single/double click arbitration and the speaker close-up with its
// temporary lens, checked with real three.js cameras.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { GUIDE, type Vec3 } from "../../src/lib/world/camera.ts";
import { HOUSE } from "../../src/lib/world/house.ts";
import {
  LIVING_MODELS,
  livingMeshes,
  modelBounds,
} from "../../src/lib/world/living.ts";
import { monitorFocus } from "../../src/lib/world/monitor.ts";
import { portraitFocus } from "../../src/lib/world/portrait.ts";
import {
  MAIN_ROOM,
  partBounds,
  SETUP,
  setupMeshes,
} from "../../src/lib/world/setup.ts";
import { shelfParts, shelfWorldBounds } from "../../src/lib/world/shelf.ts";
import {
  CLICK_DELAY,
  canReachSpeakers,
  clickArbiter,
  lensKeeper,
  SPEAKER_AUDIO,
  SPEAKER_BOXES,
  SPEAKER_FOCUS,
  SPEAKER_PAIR,
  speakerDistance,
  speakerFocus,
  speakerGain,
} from "../../src/lib/world/speaker.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

type Box = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
};

const VIEWPORTS = {
  phone: { width: 375, height: 812 },
  phoneWide: { width: 390, height: 844 },
  laptop: { width: 1440, height: 900 },
  desktop: { width: 1920, height: 1080 },
} as const;

function corners(box: { min: Vec3; max: Vec3 }) {
  const out: Vector3[] = [];
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) out.push(new Vector3(x, y, z));
  return out;
}

function lens(
  pose: { position: Vec3; target: Vec3 },
  fov: number,
  { width, height }: { width: number; height: number },
) {
  const camera = new PerspectiveCamera(fov, width / height, 0.1, 200);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** Largest |NDC| of both cabinets' corners: <= 1 means every corner shows. */
function extent(camera: PerspectiveCamera) {
  let most = 0;
  for (const box of SPEAKER_BOXES)
    for (const corner of corners(box)) {
      const p = corner.clone().project(camera);
      if (p.z > 1 || p.z < -1) return Infinity;
      most = Math.max(most, Math.abs(p.x), Math.abs(p.y));
    }
  return most;
}

/** Ray-box slab test on the open segment from `a` to `b`. */
function crosses(a: Vector3, b: Vector3, box: Box) {
  let t0 = 0.001;
  let t1 = 0.999;
  const lo = [box.x0, box.y0, box.z0];
  const hi = [box.x1, box.y1, box.z1];
  const from = a.toArray();
  const d = b.clone().sub(a).toArray();
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (from[i] < lo[i] || from[i] > hi[i]) return false;
      continue;
    }
    const ta = (lo[i] - from[i]) / d[i];
    const tb = (hi[i] - from[i]) / d[i];
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return false;
  }
  return true;
}

const setup = setupMeshes();
const living = livingMeshes();
/** Everything in the house that could stand between the camera and the speakers. */
const OBSTACLES: Box[] = [
  ...[...setup.solid, ...setup.glow, ...setup.glass, ...setup.hull]
    .filter((part) => part.item !== "speaker" && part.item !== "shelf")
    .map(partBounds),
  ...[...living.solid, ...living.glow].map(partBounds),
  ...LIVING_MODELS.map(modelBounds),
  ...shelfParts().map(shelfWorldBounds),
];

describe("speaker cabinets (T2)", () => {
  it("derives two hit boxes from the merged setup's speaker parts", () => {
    assert.equal(SPEAKER_BOXES.length, 2);
    const speakerParts = setup.solid.filter((part) => part.item === "speaker");
    for (const box of SPEAKER_BOXES) {
      const mine = speakerParts.filter(
        (part) => Math.abs(part.center[2] - box.center[2]) < 0.1,
      );
      assert.equal(mine.length, 7, "base, cabinet, rings, cones, grille");
      const bounds = mine.map(partBounds);
      assert.ok(
        Math.abs(Math.min(...bounds.map((b) => b.x0)) - box.min[0]) < 1e-9,
      );
      assert.ok(
        Math.abs(Math.max(...bounds.map((b) => b.x1)) - box.max[0]) < 1e-9,
      );
      assert.ok(
        Math.abs(Math.max(...bounds.map((b) => b.y1)) - box.max[1]) < 1e-9,
      );
      for (const i of [0, 1, 2])
        assert.ok(
          Math.abs(box.center[i] - (box.min[i] + box.max[i]) / 2) < 1e-9,
        );
    }
    assert.ok(SPEAKER_BOXES[0].center[2] < SPEAKER_BOXES[1].center[2]);
    // The cabinets are 0.2 x 0.28 x 0.16 m; the boxes add only the
    // front grille and cones, never room around them.
    for (const box of SPEAKER_BOXES) {
      assert.ok(box.size[0] < 0.25 && box.size[1] < 0.31 && box.size[2] < 0.17);
    }
  });

  it("puts the music source at the pair's midpoint, facing the room", () => {
    const [a, b] = SPEAKER_BOXES;
    for (const i of [0, 1, 2])
      assert.ok(
        Math.abs(SPEAKER_PAIR.center[i] - (a.center[i] + b.center[i]) / 2) <
          1e-9,
      );
    assert.deepEqual(SPEAKER_PAIR.normal, SETUP.facing);
    assert.equal(SPEAKER_PAIR.front, Math.max(a.max[0], b.max[0]));
  });

  it("offers clicks only from the room side, once the walls have dissolved", () => {
    const [x, y, z] = SPEAKER_PAIR.center;
    assert.equal(canReachSpeakers([x + 2, y, z]), true);
    assert.equal(canReachSpeakers([x - 0.5, y, z]), false, "behind the wall");
    assert.equal(canReachSpeakers([x + 30, y + 10, z]), false, "far away");
    assert.equal(canReachSpeakers([Number.NaN, y, z]), false);
  });
});

describe("distance fade (T2)", () => {
  it("plays at full level near, fades smoothly and is silent from 6 m", () => {
    assert.equal(SPEAKER_AUDIO.near, 1.5);
    assert.equal(SPEAKER_AUDIO.far, 6);
    assert.equal(speakerGain(0), 1);
    assert.equal(speakerGain(1.5), 1);
    const mid = speakerGain(3.75);
    assert.ok(mid > 0.45 && mid < 0.55, `mid ${mid}`);
    assert.equal(speakerGain(6), 0);
    assert.equal(speakerGain(40), 0);
    assert.equal(speakerGain(Number.NaN), 0);
    let last = 1;
    for (let d = 1.5; d <= 6; d += 0.05) {
      const g = speakerGain(d);
      assert.ok(g <= last + 1e-12, "never rises with distance");
      assert.ok(last - g < 0.03, "no step: a smooth curve");
      last = g;
    }
  });

  it("measures from the nearest point between the two cabinets", () => {
    const [a, b] = SPEAKER_BOXES;
    assert.ok(speakerDistance(a.center) < 1e-9);
    assert.ok(speakerDistance(b.center) < 1e-9);
    assert.ok(speakerDistance(SPEAKER_PAIR.center) < 1e-9);
    const [x, y, z] = a.center;
    assert.ok(Math.abs(speakerDistance([x + 2, y, z]) - 2) < 1e-9);
    assert.ok(Math.abs(speakerDistance([x, y, z - 3]) - 3) < 1e-9);
  });
});

describe("speaker close-up (T2)", () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    it(`fits both cabinets from inside the room at ${name} ${viewport.width}x${viewport.height}`, () => {
      const pose = speakerFocus(viewport.width / viewport.height);
      const camera = lens(pose, pose.fov, viewport);
      assert.ok(extent(camera) <= 1, `extent ${extent(camera)}`);
      // Inside the main room, clear of the desk, chair and walls.
      const [x, y, z] = pose.position;
      const margin = SPEAKER_FOCUS.margin;
      assert.ok(x > SETUP.chairBack + 0.3 && x <= MAIN_ROOM.x1 - margin + 1e-9);
      assert.ok(z > MAIN_ROOM.z0 + margin && z < MAIN_ROOM.z1 - margin);
      assert.ok(y > HOUSE.floorY + 0.5 && y < HOUSE.floorY + HOUSE.main.height);
      // Face-on: the cabinets' fronts look straight at the camera.
      assert.ok(Math.abs(z - SPEAKER_PAIR.center[2]) < 1e-9);
      assert.deepEqual(pose.target, SPEAKER_PAIR.center);
      // Nothing in the house blocks a line to any cabinet corner.
      const eye = new Vector3(...pose.position);
      for (const box of SPEAKER_BOXES)
        for (const corner of corners(box))
          for (const obstacle of OBSTACLES)
            assert.equal(crosses(eye, corner, obstacle), false);
    });
  }

  it("keeps the guide's lens on desktop views", () => {
    for (const viewport of [VIEWPORTS.laptop, VIEWPORTS.desktop]) {
      assert.equal(
        speakerFocus(viewport.width / viewport.height).fov,
        GUIDE.fov,
      );
    }
  });

  it("widens the lens on phones only as far as the cabinets need", () => {
    for (const viewport of [VIEWPORTS.phone, VIEWPORTS.phoneWide]) {
      const pose = speakerFocus(viewport.width / viewport.height);
      assert.ok(pose.fov > GUIDE.fov, `fov ${pose.fov}`);
      assert.ok(pose.fov <= SPEAKER_FOCUS.maxFov);
      // Half a degree narrower and a cabinet corner leaves the fill margin.
      const tighter = lens(pose, pose.fov - 0.5, viewport);
      assert.ok(extent(tighter) > SPEAKER_FOCUS.fill, "minimal widening");
    }
  });

  it("caps the lens on tiny viewports and stays inside the house", () => {
    const pose = speakerFocus(0.25);
    assert.equal(pose.fov, SPEAKER_FOCUS.maxFov);
    assert.ok(pose.position[0] <= MAIN_ROOM.x1 - SPEAKER_FOCUS.margin + 1e-9);
    assert.throws(() => speakerFocus(0), RangeError);
    assert.throws(() => speakerFocus(Number.NaN), RangeError);
  });

  it("leaves the guide, the terminal and the portrait close-ups as they were", () => {
    assert.equal(GUIDE.fov, 35);
    const terminal = monitorFocus(1.6);
    const portrait = portraitFocus({ width: 1440, height: 900 });
    speakerFocus(375 / 812);
    assert.deepEqual(monitorFocus(1.6), terminal);
    assert.deepEqual(portraitFocus({ width: 1440, height: 900 }), portrait);
  });
});

describe("close-up lens (T2)", () => {
  const keeper = (fov = GUIDE.fov) => {
    const camera = new PerspectiveCamera(fov, 375 / 812, 0.1, 200);
    let renders = 0;
    const keep = lensKeeper(camera, () => {
      renders++;
    });
    return { camera, keep, renders: () => renders };
  };

  it("saves the pre-entry lens once and restores it exactly on exit", () => {
    const { camera, keep, renders } = keeper();
    const before = camera.projectionMatrix.clone();
    keep.focus(speakerFocus(375 / 812).fov);
    assert.ok(camera.fov > 35);
    assert.equal(renders(), 1);
    // Resizing while focused refits; the saved lens stays the first one.
    camera.aspect = 390 / 844;
    keep.focus(speakerFocus(390 / 844).fov);
    assert.equal(renders(), 2);
    keep.focus(speakerFocus(390 / 844).fov);
    assert.equal(renders(), 2, "an unchanged lens never re-renders");
    camera.aspect = 375 / 812;
    keep.release();
    assert.equal(camera.fov, 35);
    assert.ok(camera.projectionMatrix.equals(before));
    keep.release();
    assert.equal(camera.fov, 35);
  });

  it("restores a non-default lens, and other close-ups keep the saved one", () => {
    const { camera, keep } = keeper(42);
    keep.focus(speakerFocus(375 / 812).fov);
    // Switching to the terminal or portrait while still focused: their
    // math assumes the original lens.
    keep.focus(null);
    assert.equal(camera.fov, 42);
    keep.focus(speakerFocus(375 / 812).fov);
    keep.release();
    assert.equal(camera.fov, 42);
  });

  it("is restored by the final release, however fast the switches", () => {
    const { camera, keep } = keeper();
    for (let i = 0; i < 5; i++) {
      keep.focus(60 + i);
      if (i % 2) keep.release();
    }
    keep.release();
    assert.equal(camera.fov, 35);
  });
});

/** A fake clock: timers fire only when the test advances time. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  return {
    set(run: () => void, ms: number) {
      const id = next++;
      pending.set(id, { at: now + ms, run });
      return id;
    },
    clear(id: unknown) {
      pending.delete(id as number);
    },
    advance(ms: number) {
      now += ms;
      for (const [id, timer] of [...pending].sort((a, b) => a[1].at - b[1].at))
        if (timer.at <= now) {
          pending.delete(id);
          timer.run();
        }
    },
    get size() {
      return pending.size;
    },
  };
}

describe("speaker click arbitration (T2)", () => {
  const arbiter = () => {
    const timers = fakeTimers();
    const calls: string[] = [];
    const clicks = clickArbiter(
      { single: () => calls.push("toggle"), double: () => calls.push("focus") },
      timers,
    );
    return { timers, calls, clicks };
  };

  it("waits 250-300 ms, then a single click toggles once", () => {
    assert.ok(CLICK_DELAY >= 250 && CLICK_DELAY <= 300);
    const { timers, calls, clicks } = arbiter();
    clicks.click();
    timers.advance(CLICK_DELAY - 1);
    assert.deepEqual(calls, []);
    timers.advance(1);
    assert.deepEqual(calls, ["toggle"]);
    timers.advance(1000);
    assert.deepEqual(calls, ["toggle"]);
  });

  it("a double click focuses once and never toggles", () => {
    const { timers, calls, clicks } = arbiter();
    // Browsers send click, click, dblclick.
    clicks.click();
    timers.advance(120);
    clicks.click();
    clicks.dblclick();
    timers.advance(1000);
    assert.deepEqual(calls, ["focus"]);
  });

  it("swallows a third quick click, and a lone dblclick still focuses once", () => {
    const { timers, calls, clicks } = arbiter();
    clicks.click();
    clicks.click();
    timers.advance(100);
    clicks.click();
    timers.advance(1000);
    assert.deepEqual(calls, ["focus"]);
    clicks.dblclick();
    clicks.dblclick();
    timers.advance(1000);
    assert.deepEqual(calls, ["focus", "focus"]);
  });

  it("two slow clicks are two toggles", () => {
    const { timers, calls, clicks } = arbiter();
    clicks.click();
    timers.advance(CLICK_DELAY + 50);
    clicks.click();
    timers.advance(CLICK_DELAY + 50);
    assert.deepEqual(calls, ["toggle", "toggle"]);
  });

  it("cancel drops a pending toggle and clears its timer", () => {
    const { timers, calls, clicks } = arbiter();
    clicks.click();
    clicks.cancel();
    assert.equal(timers.size, 0);
    timers.advance(1000);
    assert.deepEqual(calls, []);
  });
});

describe("speaker wiring (T2)", () => {
  const scene = read("src/components/world/WorldScene.tsx");
  const app = read("src/components/world/WorldApp.tsx");

  it("only the terminal close-up reports arrival", () => {
    assert.match(
      scene,
      /onArrive=\{closeUp === "terminal" \? onMonitorArrive : undefined\}/,
    );
    assert.match(scene, /"terminal" \| "portrait" \| "speakers"/);
  });

  it("keeps the close-ups mutually exclusive", () => {
    assert.match(app, /if \(!focus && !portrait\) setSpeakers\(true\)/);
    assert.match(app, /if \(!speakers\) setFocus\(true\)/);
    assert.match(app, /onEnter: ready && !focus && !speakers \? enterPortrait/);
    assert.match(
      app,
      /onFocus: ready && !focus && !portrait \? enterSpeakers : undefined/,
    );
  });

  it("hides the world controls the way the other close-ups do", () => {
    assert.match(
      app,
      /inert=\{!entered \|\| focus \|\| portrait \|\| speakers\}/,
    );
    assert.match(app, /speakers && "world-terminal-focus"/);
  });
});

describe("persistent music wiring (world-persistent-settings T1, S1-S2)", () => {
  const app = read("src/components/world/WorldApp.tsx");
  /** Source index of a pattern, failing loudly when it is missing. */
  const at = (pattern: RegExp) => {
    const index = app.search(pattern);
    assert.ok(index >= 0, `missing ${pattern}`);
    return index;
  };

  it("starts volume, range and play intent from the stored preferences", () => {
    assert.match(
      app,
      /useState\(\(\) =>\s*loadMusicPreferences\(browserStorage\(\)\),?\s*\)/,
    );
    assert.match(app, /useState\(storedMusic\.volume\)/);
    assert.match(app, /useState\(storedMusic\.range\)/);
    assert.match(app, /useState\(storedMusic\.enabled\)/);
    assert.doesNotMatch(app, /const \[volume, setVolume\] = useState\(1\)/);
    assert.doesNotMatch(app, /const \[range, setRange\] = useState\(0\)/);
    assert.match(app, /saveMusicPreferences/);
  });

  it("routes physical speaker clicks through the same persisted transport", () => {
    const zone = read("src/components/world/SpeakerZone.tsx");
    assert.match(zone, /onToggle: \(\) => void;/);
    assert.match(zone, /single: \(\) => \{\s*latest\.current\.onToggle\(\);/);
    assert.doesNotMatch(zone, /latest\.current\.music\.toggle\(/);
    assert.match(app, /onToggle: playMusic/);
    assert.match(
      app,
      /\[music, speakers, ready, focus, portrait, enterSpeakers, playMusic\]/,
    );
  });

  it("each explicit transport unlocks, acts, then saves the music's intent", () => {
    for (const [name, call] of [
      ["playMusic", "toggle"],
      ["previousTrack", "previous"],
      ["nextTrack", "next"],
    ])
      assert.match(
        app,
        new RegExp(
          `const ${name} = useCallback\\(\\(\\) => \\{\\s*music\\.unlock\\(\\);\\s*music\\.${call}\\(\\);\\s*setMusicEnabled\\(music\\.getWanted\\(\\)\\);\\s*\\}, \\[music\\]\\);`,
        ),
        name,
      );
    // Only those three actions write the intent: never playback state,
    // errors, the hidden tab or dispose.
    assert.equal(app.split("setMusicEnabled(").length - 1, 3);
    assert.doesNotMatch(app, /setMusicEnabled\(song\./);
  });

  it("binds the gentle resume after volume and reach, only when ready, measured and wanted", () => {
    assert.match(
      app,
      /import \{ bindMusicResume \} from "@\/lib\/world\/speaker-resume\.ts";/,
    );
    const volume = at(
      /useEffect\(\(\) => music\.setVolume\(volume\), \[music, volume\]\);/,
    );
    const reach = at(
      /music\.setReach\(limits \? rangeReach\(limits, range\) : null\)/,
    );
    const bind = at(
      /useEffect\(\(\) => \{\s*if \(!entered \|\| !ready \|\| !limits \|\| !musicEnabled\) return;\s*return bindMusicResume\(music, document\);\s*\}, \[music, entered, ready, limits, musicEnabled\]\);/,
    );
    assert.ok(volume < reach && reach < bind, "volume, reach, then resume");
    // Cleanup only drops the resume listeners: pausing there would stop the
    // music on every focus or resize. Unmount still disposes the music.
    assert.doesNotMatch(app, /music\.pause\(\)/);
    assert.match(
      app,
      /useEffect\(\(\) => \(\) => music\.dispose\(\), \[music\]\);/,
    );
    assert.match(app, /useState\(\(\) => new SpeakerMusic\(\)\)/);
  });
});
