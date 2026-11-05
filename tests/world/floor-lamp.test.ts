import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLampSwitch,
  FLOOR_LAMP,
  floorLampAim,
  floorLampHeadPosition,
  floorLampLevel,
  floorLampLightTarget,
  LAMP_SWITCH_URL,
} from "../../src/lib/world/floor-lamp.ts";
import { HOUSE } from "../../src/lib/world/house.ts";
import { FOOTBALL, SHELF } from "../../src/lib/world/shelf.ts";

const shelfTop = SHELF.base[1] + SHELF.height;
const shelfFront = SHELF.base[0] + SHELF.depth / 2;
const shelfZ0 = SHELF.base[2] - SHELF.width / 2;
const shelfZ1 = SHELF.base[2] + SHELF.width / 2;
const wallX = HOUSE.main.x0 + HOUSE.wall;

describe("wall lamp mount and arm", () => {
  it("is screwed to the left wall face above the shelf", () => {
    const [mx, my, mz] = FLOOR_LAMP.mount;
    assert.equal(mx, wallX);
    assert.ok(my > shelfTop + 0.2, "plate sits above the shelf top");
    assert.ok(mz > shelfZ0 && mz < shelfZ1, "plate is over the shelf span");
  });

  it("sits centred on the shelf, straight along its centre line", () => {
    const { mount, shoulder, elbow, head } = FLOOR_LAMP;
    for (const p of [mount, shoulder, elbow, head])
      assert.equal(p[2], SHELF.base[2], `joint at z ${p[2]} on the centre`);
    assert.equal(shoulder[1], mount[1], "bracket is level");
    assert.equal(elbow[1], shoulder[1], "arm is level, not tilted");
    assert.equal(head[0], elbow[0], "drop to the head is vertical");
    assert.ok(head[1] < elbow[1], "head hangs below the elbow");
  });

  it("stays under the eave", () => {
    const eave = HOUSE.floorY + HOUSE.main.height;
    for (const p of [FLOOR_LAMP.mount, FLOOR_LAMP.elbow, FLOOR_LAMP.head])
      assert.ok(p[1] < eave - 0.03, `joint at y ${p[1]} below ${eave}`);
  });

  it("keeps the arm clear of the football on top of the shelf", () => {
    const ballZ = SHELF.base[2] - FOOTBALL.center[0];
    const ballHalf = FOOTBALL.length / 2 + 0.03;
    const ballTop = SHELF.base[1] + FOOTBALL.center[1] + FOOTBALL.radius;
    for (const p of [FLOOR_LAMP.mount, FLOOR_LAMP.shoulder, FLOOR_LAMP.elbow])
      assert.ok(
        Math.abs(p[2] - ballZ) > ballHalf || p[1] > ballTop + 0.05,
        "joint clears the ball",
      );
  });

  it("reaches out past the shelf front so the shade faces the items", () => {
    const [hx, hy] = FLOOR_LAMP.head;
    assert.ok(hx > shelfFront + 0.25, "head hangs well in front of the shelf");
    assert.ok(hy > shelfTop, "head is above the shelf top");
    const [sx] = FLOOR_LAMP.shoulder;
    const [ex] = FLOOR_LAMP.elbow;
    assert.ok(sx > wallX && ex > sx, "arm runs out from the wall");
  });
});

describe("wall lamp aim", () => {
  it("targets the centre of the shelf's front face, mid height", () => {
    const [tx, ty, tz] = floorLampLightTarget();
    assert.equal(tx, shelfFront);
    assert.equal(ty, SHELF.base[1] + SHELF.height / 2);
    assert.equal(tz, SHELF.base[2]);
  });

  it("tilts the shade down and back toward the shelf, without sideways lean", () => {
    const [ax, ay, az] = floorLampAim();
    assert.ok(ay < -0.7, "mostly downward");
    assert.ok(ax < 0, "back toward the wall and the shelf");
    assert.equal(az, 0, "symmetric across the shelf's width");
    assert.ok(Math.abs(Math.hypot(...floorLampAim()) - 1) < 1e-9);
  });

  it("puts the bulb inside the shade, along the aim", () => {
    const head = FLOOR_LAMP.head;
    const bulb = floorLampHeadPosition();
    const d = Math.hypot(
      bulb[0] - head[0],
      bulb[1] - head[1],
      bulb[2] - head[2],
    );
    assert.ok(d > 0 && d < FLOOR_LAMP.shade.length);
    assert.ok(bulb[1] < head[1]);
  });

  it("casts a cone over the football, both shelf ends and the bottom corners", () => {
    const bulb = floorLampHeadPosition();
    const aim = floorLampAim();
    const eyeLevel = SHELF.base[1] + 1.2;
    const corners = [
      [SHELF.base[0], SHELF.base[1] + FOOTBALL.center[1], SHELF.base[2]],
      [shelfFront, eyeLevel, shelfZ0],
      [shelfFront, eyeLevel, shelfZ1],
      [shelfFront, SHELF.base[1] + 0.05, SHELF.base[2]],
      [shelfFront, SHELF.base[1] + 0.05, shelfZ0],
      [shelfFront, SHELF.base[1] + 0.05, shelfZ1],
    ];
    for (const c of corners) {
      const v = [c[0] - bulb[0], c[1] - bulb[1], c[2] - bulb[2]];
      const len = Math.hypot(...v);
      const cos = (v[0] * aim[0] + v[1] * aim[1] + v[2] * aim[2]) / len;
      assert.ok(
        Math.acos(cos) < FLOOR_LAMP.spotAngle,
        `shelf point ${c} inside the cone`,
      );
      assert.ok(len < FLOOR_LAMP.spotDistance, "within the spot's reach");
    }
  });
});

describe("wall lamp light", () => {
  it("stays in the scene's fixture range instead of blowing out", () => {
    assert.ok(FLOOR_LAMP.spotIntensity >= 1);
    assert.ok(FLOOR_LAMP.spotIntensity <= 2.5);
    assert.ok(FLOOR_LAMP.pointIntensity < FLOOR_LAMP.spotIntensity);
    assert.ok(FLOOR_LAMP.bulbEmissive <= 0.8);
    assert.equal(FLOOR_LAMP.lightDecay, 2);
  });

  it("is full at night, completely off by day and dark when off", () => {
    assert.equal(floorLampLevel(true, 21), 1);
    assert.equal(floorLampLevel(true, 3), 1);
    assert.equal(floorLampLevel(true, 18), 1);
    assert.equal(floorLampLevel(true, 5.99), 1);
    assert.equal(FLOOR_LAMP.dayLevel, 0);
    for (const h of [6, 9, 12, 15, 17.99])
      assert.equal(floorLampLevel(true, h), 0, `off at ${h}h`);
    assert.equal(floorLampLevel(false, 21), 0);
    assert.equal(floorLampLevel(true, 21, false), 0);
  });
});

/** A fake AudioContext recording what the switch player does with it. */
function fakeAudio({ fail = false } = {}) {
  const log = { contexts: 0, fetches: 0, decodes: 0, starts: 0, resumes: 0 };
  const buffer = {} as AudioBuffer;
  const noop = () => undefined;
  const node = () => ({ connect: noop, disconnect: noop });
  const createContext = () => {
    log.contexts += 1;
    return {
      state: "suspended",
      currentTime: 0,
      destination: {},
      resume() {
        log.resumes += 1;
        return Promise.resolve();
      },
      decodeAudioData() {
        log.decodes += 1;
        return fail
          ? Promise.reject(new Error("bad"))
          : Promise.resolve(buffer);
      },
      createGain: () => ({ ...node(), gain: { setValueAtTime: noop } }),
      createBufferSource: () => ({
        ...node(),
        buffer: null,
        onended: null,
        start() {
          log.starts += 1;
        },
      }),
    } as unknown as AudioContext;
  };
  const fetcher = ((url: string) => {
    log.fetches += 1;
    assert.equal(url, LAMP_SWITCH_URL);
    return Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
  }) as unknown as typeof fetch;
  return { log, createContext, fetch: fetcher };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("lamp switch sound", () => {
  it("creates nothing until the first click", () => {
    const audio = fakeAudio();
    createLampSwitch(audio);
    assert.equal(audio.log.contexts, 0);
    assert.equal(audio.log.fetches, 0);
  });

  it("shares one context and one decoded buffer across clicks", async () => {
    const audio = fakeAudio();
    const play = createLampSwitch(audio);
    play();
    play();
    await settle();
    play();
    await settle();
    assert.equal(audio.log.contexts, 1);
    assert.equal(audio.log.fetches, 1);
    assert.equal(audio.log.decodes, 1);
    assert.equal(audio.log.starts, 3);
    assert.ok(audio.log.resumes >= 1, "resumes the suspended context");
  });

  it("goes quiet without throwing when decoding fails", async () => {
    const audio = fakeAudio({ fail: true });
    const play = createLampSwitch(audio);
    play();
    await settle();
    assert.doesNotThrow(play);
    await settle();
    assert.equal(audio.log.starts, 0);
    assert.equal(audio.log.decodes, 1);
  });

  it("never throws without Web Audio", () => {
    const play = createLampSwitch({ createContext: () => null });
    assert.doesNotThrow(play);
    assert.doesNotThrow(play);
  });
});
