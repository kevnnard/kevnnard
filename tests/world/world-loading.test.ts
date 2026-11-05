// World entry loader (T2, S4): honest preparation progress. Critical
// resources are counted as they commit, capped at 99 until this canvas has
// rendered a prepared frame; only then 100 and one ready call. The frame
// barrier runs on mockable ports: these tests prove the lifecycle, not a
// real GPU frame (no browser or WebGL in Node).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DISPLAY_MODEL_FILES } from "../../src/lib/world/display-cases.ts";
import { LIVING_FILES, LIVING_MODELS } from "../../src/lib/world/living.ts";
import { MODEL_FILES, PROP_FILES } from "../../src/lib/world/models.ts";
import { BRUNO_FILES, BRUNO_MAPS } from "../../src/lib/world/setup.ts";
import { TEXTURE_URLS } from "../../src/lib/world/textures.ts";
import {
  bindWorldContextLoss,
  createWorldLoadTracker,
  type FramePorts,
  INITIAL_WORLD_LOAD_STATE,
  prepareFirstFrame,
  WORLD_MILESTONES,
  type WorldLoadState,
  type WorldMilestoneId,
  worldLoadError,
} from "../../src/lib/world/world-loading.ts";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const ASSETS: WorldMilestoneId[] = [
  "nature",
  "surfaces",
  "living",
  "steam",
  "chair",
  "display",
];

/** A tracker with every emission recorded. */
function recorded() {
  const tracker = createWorldLoadTracker();
  const states: WorldLoadState[] = [];
  let ready = 0;
  const unsubscribe = tracker.subscribe((state) => {
    states.push(state);
    if (state.phase === "ready" && tracker.takeReady()) ready++;
  });
  return { tracker, states, unsubscribe, ready: () => ready };
}

const last = (states: WorldLoadState[]) => states[states.length - 1];

describe("world loading: critical milestones", () => {
  it("orders scene, the critical asset groups, then compile and frame", () => {
    assert.deepEqual(
      WORLD_MILESTONES.map((m) => [m.id, m.phase]),
      [
        ["scene", "scene"],
        ["nature", "assets"],
        ["surfaces", "assets"],
        ["living", "assets"],
        ["steam", "assets"],
        ["chair", "assets"],
        ["display", "assets"],
        ["compile", "frame"],
        ["frame", "frame"],
      ],
    );
  });

  it("counts every critical file the scene loads, once", () => {
    const urls = (id: WorldMilestoneId) =>
      WORLD_MILESTONES.find((m) => m.id === id)?.urls ?? [];
    assert.deepEqual([...urls("nature")], Object.values(MODEL_FILES));
    assert.deepEqual([...urls("surfaces")], [...TEXTURE_URLS]);
    assert.deepEqual(
      [...urls("living")],
      [...new Set(LIVING_MODELS.map((model) => LIVING_FILES[model.kind]))],
    );
    assert.deepEqual([...urls("steam")], [PROP_FILES.coffeeSteam]);
    assert.deepEqual(
      [...urls("chair")],
      [
        BRUNO_FILES.chair,
        BRUNO_MAPS.day,
        BRUNO_MAPS.night,
        BRUNO_MAPS.neutral,
        BRUNO_MAPS.lightMap,
      ],
    );
    assert.deepEqual([...urls("display")], [...DISPLAY_MODEL_FILES]);
    for (const milestone of WORLD_MILESTONES)
      assert.equal(milestone.weight, Math.max(1, milestone.urls.length));
    const all = WORLD_MILESTONES.flatMap((m) => m.urls);
    assert.equal(new Set(all).size, all.length);
  });

  it("leaves DOM embeds, credits and music out of the visual gate", () => {
    const all = WORLD_MILESTONES.flatMap((m) => m.urls).join(" ");
    assert.doesNotMatch(all, /music|credits|youtube|\.mp3|\.ogg|\.json/i);
  });
});

describe("world loading: tracker state", () => {
  it("starts at 1 in the scene phase with no error", () => {
    assert.deepEqual(INITIAL_WORLD_LOAD_STATE, {
      progress: 1,
      phase: "scene",
      error: null,
    });
    const { states } = recorded();
    assert.deepEqual(states, [INITIAL_WORLD_LOAD_STATE]);
  });

  it("never reaches 100 because Nature finished alone", () => {
    const { tracker, states, ready } = recorded();
    tracker.complete("scene");
    tracker.complete("nature");
    const state = last(states);
    assert.equal(state.phase, "assets");
    assert.ok(state.progress > 1 && state.progress < 100, `${state.progress}`);
    assert.equal(ready(), 0);
  });

  it("climbs monotonically, holds 99 or less until the prepared frame, then 100 once", () => {
    const { tracker, states, ready } = recorded();
    tracker.complete("scene");
    for (const id of ASSETS) tracker.complete(id);
    assert.equal(last(states).phase, "frame");
    tracker.complete("compile");
    assert.equal(last(states).phase, "frame");
    assert.ok(last(states).progress <= 99);
    assert.equal(ready(), 0);
    tracker.complete("frame");
    assert.deepEqual(last(states), {
      progress: 100,
      phase: "ready",
      error: null,
    });
    assert.equal(ready(), 1);
    for (let i = 1; i < states.length; i++) {
      assert.ok(states[i].progress >= states[i - 1].progress);
      assert.notDeepEqual(states[i], states[i - 1]);
    }
    for (const state of states.slice(0, -1)) {
      assert.ok(state.progress >= 1 && state.progress <= 99);
      assert.notEqual(state.phase, "ready");
    }
  });

  it("ignores repeated completions (StrictMode effects run twice)", () => {
    const { tracker, states } = recorded();
    tracker.complete("scene");
    tracker.complete("nature");
    const count = states.length;
    tracker.complete("nature");
    tracker.complete("scene");
    assert.equal(states.length, count);
  });

  it("refuses frame milestones before every asset has committed", () => {
    const { tracker, states, ready } = recorded();
    tracker.complete("scene");
    tracker.complete("compile");
    tracker.complete("frame");
    assert.equal(last(states).phase, "assets");
    for (const id of ASSETS) tracker.complete(id);
    assert.equal(last(states).phase, "frame");
    assert.equal(ready(), 0);
  });

  it("jumps straight forward on a cached mount and reports ready once across resubscribes", () => {
    const tracker = createWorldLoadTracker();
    // Child effects run before the scene subscribes.
    for (const milestone of WORLD_MILESTONES) tracker.complete(milestone.id);
    const states: WorldLoadState[] = [];
    let ready = 0;
    const listen = () =>
      tracker.subscribe((state) => {
        states.push(state);
        if (state.phase === "ready" && tracker.takeReady()) ready++;
      });
    // StrictMode: subscribe, clean up, subscribe again.
    listen()();
    const stop = listen();
    assert.deepEqual(states, [
      { progress: 100, phase: "ready", error: null },
      { progress: 100, phase: "ready", error: null },
    ]);
    assert.equal(ready, 1);
    stop();
  });

  it("stops emitting after unsubscribe", () => {
    const { tracker, states, unsubscribe } = recorded();
    unsubscribe();
    tracker.complete("scene");
    tracker.fail(new Error("late"));
    assert.equal(states.length, 1);
  });
});

describe("world loading: failures", () => {
  it("surfaces a readable error and keeps the last honest progress", () => {
    const { tracker, states, ready } = recorded();
    tracker.complete("scene");
    tracker.complete("nature");
    const before = last(states);
    tracker.fail(new Error("Could not load /world/models/sofa.glb: 404"));
    assert.deepEqual(last(states), {
      progress: before.progress,
      phase: before.phase,
      error: "Could not load /world/models/sofa.glb: 404",
    });
    for (const milestone of WORLD_MILESTONES) tracker.complete(milestone.id);
    assert.ok(last(states).progress < 100);
    assert.notEqual(last(states).phase, "ready");
    assert.equal(ready(), 0);
    assert.equal(tracker.takeReady(), false);
  });

  it("keeps the first error", () => {
    const { tracker, states } = recorded();
    tracker.fail(new Error("first"));
    tracker.fail(new Error("second"));
    assert.equal(last(states).error, "first");
  });

  it("turns anything thrown into readable text", () => {
    assert.equal(worldLoadError(new Error("boom")), "boom");
    assert.equal(worldLoadError("plain"), "plain");
    const fallback = worldLoadError(undefined);
    assert.ok(fallback.length > 10);
    assert.equal(worldLoadError(new Error("")), fallback);
  });
});

/** Deterministic frame ports: a controllable compile and render feed. */
function ports() {
  let resolve: (() => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const listeners = new Set<() => void>();
  const log: string[] = [];
  const port: FramePorts = {
    compile: () => {
      log.push("compile");
      return new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
    },
    requestFrame: () => log.push("request"),
    onMainRender: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    port,
    log,
    listeners,
    resolve: () => resolve?.(),
    reject: (error: unknown) => reject?.(error),
    render: () => {
      for (const listener of [...listeners]) listener();
    },
  };
}

const flush = () => new Promise((res) => setImmediate(res));

function handlers() {
  const events: string[] = [];
  return {
    events,
    handlers: {
      onCompiled: () => events.push("compiled"),
      onFrame: () => events.push("frame"),
      onError: (error: unknown) =>
        events.push(`error:${worldLoadError(error)}`),
    },
  };
}

describe("world loading: first prepared frame", () => {
  it("compiles, then waits for a main render after the compile, never before", async () => {
    const io = ports();
    const { events, handlers: h } = handlers();
    prepareFirstFrame(io.port, h);
    assert.deepEqual(io.log, ["compile"]);
    io.render(); // a render while compiling proves nothing
    assert.deepEqual(events, []);
    io.resolve();
    await flush();
    assert.deepEqual(events, ["compiled"]);
    assert.deepEqual(io.log, ["compile", "request"]);
    io.render();
    assert.deepEqual(events, ["compiled", "frame"]);
    assert.equal(io.listeners.size, 0);
    io.render();
    assert.deepEqual(events, ["compiled", "frame"]);
  });

  it("drops a late compile after cancel (unmount)", async () => {
    const io = ports();
    const { events, handlers: h } = handlers();
    const barrier = prepareFirstFrame(io.port, h);
    barrier.cancel();
    io.resolve();
    await flush();
    io.render();
    assert.deepEqual(events, []);
    assert.deepEqual(io.log, ["compile"]);
    assert.equal(io.listeners.size, 0);
  });

  it("drops a late frame after cancel and unsubscribes", async () => {
    const io = ports();
    const { events, handlers: h } = handlers();
    const barrier = prepareFirstFrame(io.port, h);
    io.resolve();
    await flush();
    barrier.cancel();
    assert.equal(io.listeners.size, 0);
    io.render();
    assert.deepEqual(events, ["compiled"]);
  });

  it("lets only the surviving StrictMode run complete", async () => {
    const first = ports();
    const second = ports();
    const a = handlers();
    const b = handlers();
    prepareFirstFrame(first.port, a.handlers).cancel();
    prepareFirstFrame(second.port, b.handlers);
    first.resolve();
    second.resolve();
    await flush();
    first.render();
    second.render();
    assert.deepEqual(a.events, []);
    assert.deepEqual(b.events, ["compiled", "frame"]);
  });

  it("reports a rejected or throwing compile once and never a frame", async () => {
    const io = ports();
    const { events, handlers: h } = handlers();
    prepareFirstFrame(io.port, h);
    io.reject(new Error("shader link failed"));
    await flush();
    io.render();
    assert.deepEqual(events, ["error:shader link failed"]);

    const thrown = handlers();
    prepareFirstFrame(
      {
        ...io.port,
        compile: () => {
          throw new Error("context lost");
        },
      },
      thrown.handlers,
    );
    await flush();
    assert.deepEqual(thrown.events, ["error:context lost"]);
  });

  it("drives the tracker to ready only through the barrier", async () => {
    const { tracker, states, ready } = recorded();
    tracker.complete("scene");
    for (const id of ASSETS) tracker.complete(id);
    const io = ports();
    prepareFirstFrame(io.port, {
      onCompiled: () => tracker.complete("compile"),
      onFrame: () => tracker.complete("frame"),
      onError: (error) => tracker.fail(error),
    });
    io.resolve();
    await flush();
    assert.equal(last(states).phase, "frame");
    assert.equal(ready(), 0);
    io.render();
    assert.equal(last(states).progress, 100);
    assert.equal(ready(), 1);
  });
});

describe("world loading: scene wiring (source supplement)", () => {
  const scene = read("src/components/world/WorldScene.tsx");
  const setup = read("src/components/world/Setup.tsx");
  const cases = read("src/components/world/DisplayCases.tsx");

  it("reports ready from the tracker, not from Nature", () => {
    assert.match(scene, /onProgress\?: \(state: WorldLoadState\) => void/);
    assert.doesNotMatch(scene, /<Nature onReady/);
    assert.match(scene, /tracker\.takeReady\(\)/);
    // Nature keeps disposing its instanced groups on unmount.
    assert.match(
      scene,
      /\(mesh\.material as Material\)\.dispose\(\);\s*mesh\.dispose\(\);/,
    );
  });

  it("counts critical assets only in the textured branch, never the flat fallback", () => {
    const fallback = scene.slice(
      scene.indexOf("<Suspense\n        fallback"),
      scene.indexOf("<TexturedHouse"),
    );
    assert.doesNotMatch(fallback, /prepared|onPrepared/);
    const textured = scene.slice(scene.indexOf("function TexturedHouse"));
    assert.match(textured, /<Living[^>]*onPrepared=\{prepared\.living\}/);
    assert.match(textured, /prepared=\{prepared\}/);
    assert.match(
      textured,
      /<DisplayCases[^>]*onPrepared=\{prepared\.display\}/,
    );
    assert.match(setup, /<CoffeeSteam[^>]*onPrepared=\{prepared\?\.steam\}/);
    assert.match(setup, /<BrunoChair[\s\S]*?onPrepared=\{prepared\?\.chair\}/);
  });

  it("waits on this canvas's own main render, without global loader hooks", () => {
    assert.match(scene, /compileAsync\(scene, camera\)/);
    assert.match(scene, /onAfterRender/);
    assert.doesNotMatch(scene, /DefaultLoadingManager|new LoadingManager/);
    const examples = scene.match(/from "three\/examples\/[^"]+"/g) ?? [];
    assert.deepEqual(examples, [
      'from "three/examples/jsm/environments/RoomEnvironment.js"',
      'from "three/examples/jsm/loaders/GLTFLoader.js"',
    ]);
  });

  it("suspends the case meshes on their own, the lights always mounted", () => {
    assert.match(cases, /useLoader\(\s*GLTFLoader,\s*DISPLAY_MODEL_FILES/);
    assert.match(cases, /setMeshoptDecoder\(MeshoptDecoder\)/);
    assert.match(cases, /useEffect\(\(\) => onPrepared\(\), \[onPrepared\]\)/);
    const suspense = cases.slice(cases.indexOf("<Suspense"));
    assert.doesNotMatch(
      suspense.slice(0, suspense.indexOf("</Suspense>")),
      /pointLight/,
    );
  });

  it("rethrows scene failures to the parent boundary after reporting them", () => {
    assert.match(scene, /componentDidCatch/);
    assert.match(scene, /throw this\.state\.error/);
  });
});

describe("world WebGL context loss", () => {
  it("reports loss during asset preparation and refuses later readiness", () => {
    const target = new EventTarget();
    const tracker = createWorldLoadTracker();
    tracker.complete("scene");
    const before = tracker.getState().progress;
    const close = bindWorldContextLoss(target, tracker.fail);
    target.dispatchEvent(new Event("webglcontextlost"));
    assert.equal(
      tracker.getState().error,
      "The graphics context was lost. Try loading the world again.",
    );
    for (const milestone of WORLD_MILESTONES) tracker.complete(milestone.id);
    assert.equal(tracker.getState().progress, before);
    assert.equal(tracker.takeReady(), false);
    close();
  });
  it("removes the listener on cleanup and reports one loss at most", () => {
    const target = new EventTarget();
    const errors: string[] = [];
    const close = bindWorldContextLoss(target, (error) =>
      errors.push(error.message),
    );
    target.dispatchEvent(new Event("webglcontextlost"));
    target.dispatchEvent(new Event("webglcontextlost"));
    assert.equal(errors.length, 1);
    close();
    const closed = bindWorldContextLoss(target, (error) =>
      errors.push(error.message),
    );
    closed();
    target.dispatchEvent(new Event("webglcontextlost"));
    assert.equal(errors.length, 1);
  });
});
