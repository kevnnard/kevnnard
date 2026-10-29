// T13 (S26-S27): wider, softer coloured coverage from the same sliders.
// `irradiance` mirrors three r186's spot and distance attenuation
// (lights_pars_begin: smoothstep spot cone, 1 / max(d^decay, 0.01) and the
// (1 - (d / distance)^4)^2 window) times Lambert's n.l. It is a deterministic
// proxy for comparing fixtures on the real receiver planes, not GPU proof.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HOUSE, type Vec3 } from "../../src/lib/world/house.ts";
import {
  BOUNCE_FIXTURES,
  CHANNEL_FIXTURES,
  DEFAULT_LIGHTS,
  fixtureOutputs,
  INTERIOR_FIXTURES,
  LIGHT_FIXTURES,
  LIGHT_IDS,
  LIGHTBAR_FIXTURE,
  type LightFixture,
  type SpotFixture,
  updateLight,
  WALL_ALBEDO,
} from "../../src/lib/world/lights.ts";
import { TV_PANEL } from "../../src/lib/world/living.ts";
import {
  DESK_TOP,
  KEYBOARD,
  MAIN_MONITOR,
  MAIN_ROOM,
  MOUSE,
} from "../../src/lib/world/setup.ts";

const at = (h: number, m: number) => h + m / 60;
const night = at(23, 0);

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

function irradiance(f: LightFixture, p: Vec3, n: Vec3): number {
  const l = f.position.map((v, i) => v - p[i]) as Vec3;
  const d = Math.hypot(...l);
  const ndl = (n[0] * l[0] + n[1] * l[1] + n[2] * l[2]) / d;
  if (ndl <= 0) return 0;
  let spot = 1;
  if (f.kind === "spot") {
    const a = f.target.map((v, i) => v - f.position[i]);
    const cos = -(a[0] * l[0] + a[1] * l[1] + a[2] * l[2]) / Math.hypot(...a);
    spot = smooth(
      Math.cos(f.angle),
      Math.cos(f.angle * (1 - f.penumbra)),
      cos / d,
    );
  }
  const window = Math.max(0, 1 - (d / f.distance) ** 4) ** 2;
  return (f.intensity * spot * window * ndl) / Math.max(d ** f.decay, 0.01);
}

interface Plane {
  axis: 0 | 1 | 2;
  at: number;
  normal: Vec3;
  u: readonly [0 | 1 | 2, number, number];
  v: readonly [0 | 1 | 2, number, number];
  /** Points hidden behind a panel, left out of the visible coverage. */
  hidden?: (p: Vec3) => boolean;
}

const STEP = 0.02;
function survey(fixtures: readonly LightFixture[], plane: Plane, tau: number) {
  let area = 0;
  let peak = 0;
  let flux = 0;
  for (let u = plane.u[1]; u <= plane.u[2]; u += STEP)
    for (let v = plane.v[1]; v <= plane.v[2]; v += STEP) {
      const p: Vec3 = [0, 0, 0];
      p[plane.axis] = plane.at;
      p[plane.u[0]] = u;
      p[plane.v[0]] = v;
      const e = fixtures.reduce(
        (s, f) => s + irradiance(f, p, plane.normal),
        0,
      );
      flux += e * STEP * STEP;
      if (plane.hidden?.(p)) continue;
      peak = Math.max(peak, e);
      if (e >= tau) area += STEP * STEP;
    }
  return { area, peak, flux };
}

/** T12 fixtures as shipped in ea0d4aa, on today's live positions. */
const OLD = {
  tv: {
    ...LIGHT_FIXTURES.tv,
    angle: 1.25,
    penumbra: 0.7,
    intensity: 0.6,
    distance: 1.6,
    decay: 2,
  },
  setup: {
    ...LIGHT_FIXTURES.setup,
    angle: 1.25,
    penumbra: 0.7,
    intensity: 0.25,
    distance: 1.4,
    decay: 2,
  },
  lampLeft: {
    ...LIGHT_FIXTURES.lampLeft,
    angle: 0.6,
    penumbra: 0.6,
    intensity: 0.3,
    distance: 1.5,
    decay: 2,
  },
  lampRight: {
    ...LIGHT_FIXTURES.lampRight,
    angle: 0.6,
    penumbra: 0.6,
    intensity: 0.3,
    distance: 1.5,
    decay: 2,
  },
  lightbar: {
    ...LIGHTBAR_FIXTURE,
    angle: 0.55,
    penumbra: 0.6,
    intensity: 0.35,
    distance: 1.2,
    decay: 2,
  },
} satisfies Record<string, SpotFixture>;

const [tx, ty] = TV_PANEL.center;
const WALLS = {
  tv: {
    axis: 2,
    at: MAIN_ROOM.z0,
    normal: [0, 0, 1],
    u: [0, MAIN_ROOM.x0, MAIN_ROOM.x1],
    v: [1, HOUSE.floorY, HOUSE.floorY + HOUSE.main.height],
    hidden: ([x, y]) =>
      Math.abs(x - tx) < TV_PANEL.width / 2 &&
      Math.abs(y - ty) < TV_PANEL.height / 2,
  },
  setup: {
    axis: 0,
    at: MAIN_ROOM.x0,
    normal: [1, 0, 0],
    u: [2, MAIN_ROOM.z0, MAIN_ROOM.z1],
    v: [1, HOUSE.floorY, HOUSE.floorY + HOUSE.main.height],
    hidden: ([, y, z]) =>
      Math.abs(z - MAIN_MONITOR.center[2]) < MAIN_MONITOR.size[2] / 2 &&
      Math.abs(y - MAIN_MONITOR.center[1]) < MAIN_MONITOR.size[1] / 2,
  },
} satisfies Record<string, Plane>;
const DESK: Plane = {
  axis: 1,
  at: DESK_TOP.y,
  normal: [0, 1, 0],
  u: [0, DESK_TOP.x0, DESK_TOP.x1],
  v: [2, DESK_TOP.z0, DESK_TOP.z1],
};
/** The TV bench top in front of the TV and the floor of the living area. */
const LIVING_FLOOR: Plane = {
  axis: 1,
  at: HOUSE.floorY + 0.04,
  normal: [0, 1, 0],
  u: [0, tx - 1.2, MAIN_ROOM.x1],
  v: [2, MAIN_ROOM.z0, MAIN_ROOM.z0 + 2.4],
};
const SETUP_FLOOR: Plane = {
  axis: 1,
  at: HOUSE.floorY + 0.04,
  normal: [0, 1, 0],
  u: [0, MAIN_ROOM.x0, MAIN_ROOM.x0 + 2],
  v: [2, MAIN_ROOM.z0, DESK_TOP.z1 + 0.4],
};

/** Visible colour starts here (0.25 lux-like units at 100 %). */
const TAU = 0.25;
/** A faint but readable tint on room surfaces. */
const TINT = 0.08;
/** Soft ceiling for any visible part of a coloured halo at 100 %. */
const HALO_PEAK = 2.6;

describe("T13 coverage premise (S26 screenshot)", () => {
  it("reproduces the narrow pool of the T12 backlights", () => {
    for (const id of ["tv", "setup"] as const) {
      const old = survey([OLD[id]], WALLS[id], TAU);
      assert.ok(old.area < 0.1, `${id} ${old.area.toFixed(3)} m² visible`);
    }
    for (const plane of [DESK, LIVING_FLOOR]) {
      const tint = survey([OLD.tv, OLD.setup], plane, TINT).area;
      assert.ok(tint < 0.02, `almost no channel colour: ${tint.toFixed(3)} m²`);
    }
    const lamps = irradiance(OLD.lampLeft, OLD.lampLeft.target, [0, 1, 0]);
    assert.ok(lamps < 0.4, `T12 lamp pool only ${lamps.toFixed(2)}`);
  });
});

describe("T13 backlight washes (TV and setup)", () => {
  for (const id of ["tv", "setup"] as const) {
    const wall = WALLS[id];
    const fixture = LIGHT_FIXTURES[id];
    it(`${id}: covers several times more visible wall, centre no brighter`, () => {
      const old = survey([OLD[id]], wall, TAU);
      const next = survey([fixture], wall, TAU);
      assert.ok(next.area >= 0.2, `${id} ${next.area.toFixed(3)} m²`);
      assert.ok(next.area >= 2.5 * old.area + 0.05, id);
      const centre = (f: LightFixture) =>
        f.kind === "spot" ? irradiance(f, f.target, wall.normal) : 0;
      assert.ok(centre(fixture) <= centre(OLD[id]) + 1e-9, `${id} centre`);
      // Outside the panel the halo stays soft: no blown-out wall.
      assert.ok(
        next.peak <= HALO_PEAK,
        `${id} visible peak ${next.peak.toFixed(2)}`,
      );
    });

    it(`${id}: fades smoothly from the panel edge outward`, () => {
      const edge = id === "tv" ? TV_PANEL.width / 2 : MAIN_MONITOR.size[2] / 2;
      const [, y] = fixture.position;
      const samples: number[] = [];
      for (let s = edge; s <= edge + 0.6; s += 0.05) {
        const p: Vec3 =
          id === "tv"
            ? [tx + s, y, MAIN_ROOM.z0]
            : [MAIN_ROOM.x0, y, MAIN_MONITOR.center[2] - s];
        samples.push(irradiance(fixture, p, wall.normal));
      }
      assert.ok(samples[0] >= TAU, `${id} lit at the edge`);
      for (let i = 1; i < samples.length; i++) {
        assert.ok(samples[i] <= samples[i - 1] + 1e-12, `${id} monotonic`);
        assert.ok(samples[i] >= 0.5 * samples[i - 1], `${id} no hard edge`);
      }
    });

    it(`${id}: still aimed only at its wall, never into the room`, () => {
      assert.equal(fixture.kind, "spot");
      if (fixture.kind !== "spot") return;
      assert.ok(fixture.angle < Math.PI / 2, "cone stays on the wall side");
      assert.equal(fixture.castShadow, false);
    });
  }
});

describe("T13 bounce fill (one per RGB channel)", () => {
  const walls = {
    tv: { axis: 2, inner: MAIN_ROOM.z0, sign: 1 },
    setup: { axis: 0, inner: MAIN_ROOM.x0, sign: 1 },
  } as const;

  for (const id of ["tv", "setup"] as const) {
    const bounce = BOUNCE_FIXTURES[id];
    const { axis, inner, sign } = walls[id];
    it(`${id}: sits inside its wall, faces the room, lights neither face`, () => {
      const depth = sign * (inner - bounce.position[axis]);
      assert.ok(depth > 0 && depth < HOUSE.wall, `${id} inside the wall`);
      const d = bounce.target.map((v, i) => v - bounce.position[i]);
      assert.ok((sign * d[axis]) / Math.hypot(...d) > 0.85, "into the room");
      assert.ok(bounce.angle < Math.PI / 2 - 0.2, "front hemisphere only");
      const [mx, , mz] = [bounce.target[0], 0, bounce.target[2]];
      assert.ok(mx > MAIN_ROOM.x0 && mx < MAIN_ROOM.x1, "target in the room");
      assert.ok(mz > MAIN_ROOM.z0 && mz < MAIN_ROOM.z1, "target in the room");
      const normal: Vec3 = [0, 0, 0];
      for (const [face, s] of [
        [inner, sign],
        [inner - sign * HOUSE.wall, -sign],
      ] as const) {
        normal[axis] = s;
        const wall = { ...WALLS[id], at: face, normal: [...normal] as Vec3 };
        assert.equal(survey([bounce], wall, 0).flux, 0, `${id} face ${face}`);
      }
      assert.equal(bounce.castShadow, false);
    });

    it(`${id}: carries no more than the wall reflects, no doubled hotspot`, () => {
      const main = LIGHT_FIXTURES[id];
      const flux = survey([main], WALLS[id], 0).flux;
      assert.ok(
        bounce.intensity <= (WALL_ALBEDO * flux) / Math.PI,
        `${id} ${bounce.intensity} vs ${((WALL_ALBEDO * flux) / Math.PI).toFixed(3)}`,
      );
      if (main.kind === "spot")
        assert.equal(irradiance(bounce, main.target, WALLS[id].normal), 0);
    });
  }

  it("tints the desk and the living floor where T12 left them dark", () => {
    const desk = survey(
      [LIGHT_FIXTURES.setup, BOUNCE_FIXTURES.setup],
      DESK,
      TINT,
    );
    assert.ok(desk.area >= 0.4, `desk ${desk.area.toFixed(3)} m²`);
    // Brightest where the wall halo meets the desk, never above the halo.
    assert.ok(desk.peak <= HALO_PEAK, `desk tint peak ${desk.peak.toFixed(2)}`);
    const living = survey(
      [LIGHT_FIXTURES.tv, BOUNCE_FIXTURES.tv],
      LIVING_FLOOR,
      TINT,
    );
    assert.ok(living.area >= 0.1, `living floor ${living.area.toFixed(3)} m²`);
    const floor = survey([BOUNCE_FIXTURES.setup], SETUP_FLOOR, 0);
    assert.ok(floor.peak < 0.3, "the floor only gets a faint fill");
  });

  it("leaks nothing noticeable onto the ground outside the house", () => {
    const M = HOUSE.main;
    for (const bounce of Object.values(BOUNCE_FIXTURES)) {
      let peak = 0;
      for (let x = M.x0 - 2.5; x <= M.x1 + 2.5; x += 0.05)
        for (let z = M.z0 - 2.5; z <= M.z1 + 2.5; z += 0.05) {
          if (x > M.x0 && x < M.x1 && z > M.z0 && z < M.z1) continue;
          peak = Math.max(
            peak,
            irradiance(bounce, [x, HOUSE.floorY - 0.1, z], [0, 1, 0]),
          );
        }
      assert.ok(peak < 0.02, `outside peak ${peak.toFixed(4)}`);
    }
  });
});

describe("T13 desk downlights (S27: lamps and light bar)", () => {
  const down = [
    LIGHT_FIXTURES.lampLeft,
    LIGHT_FIXTURES.lampRight,
    LIGHTBAR_FIXTURE,
  ];

  it("lights most of the desk, nearly twice the T12 area", () => {
    const old = survey([OLD.lampLeft, OLD.lampRight, OLD.lightbar], DESK, TAU);
    const next = survey(down, DESK, TAU);
    const deskArea = (DESK_TOP.x1 - DESK_TOP.x0) * (DESK_TOP.z1 - DESK_TOP.z0);
    assert.ok(next.area >= 1.8 * old.area, `${next.area} vs ${old.area}`);
    assert.ok(next.area >= 0.75 * deskArea, `${next.area} of ${deskArea}`);
    // Soft, controlled maximum where the pools overlap.
    assert.ok(next.peak <= 2, `desk peak ${next.peak.toFixed(2)}`);
  });

  it("is brighter at each target than T12, but capped", () => {
    for (const [f, old] of [
      [LIGHT_FIXTURES.lampLeft, OLD.lampLeft],
      [LIGHT_FIXTURES.lampRight, OLD.lampRight],
      [LIGHTBAR_FIXTURE, OLD.lightbar],
    ] as const) {
      if (f.kind !== "spot") continue;
      const e = irradiance(f, f.target, [0, 1, 0]);
      assert.ok(e >= 1.1 * irradiance(old, old.target, [0, 1, 0]), "brighter");
      assert.ok(e <= 1.2, `target ${e.toFixed(2)} stays soft`);
      const d = f.target.map((v, i) => v - f.position[i]);
      assert.ok(d[1] / Math.hypot(...d) < -0.85, "still aimed down");
    }
    // The light bar's keyboard and mouse stay lit.
    for (const p of [KEYBOARD.center, MOUSE.center])
      assert.ok(irradiance(LIGHTBAR_FIXTURE, p, [0, 1, 0]) >= TAU);
  });
});

describe("T13 channel outputs: slider, gate, master, colours", () => {
  it("drives seven interior lights from the same four settings", () => {
    assert.equal(LIGHT_IDS.length, 4);
    assert.equal(CHANNEL_FIXTURES.length, 7);
    assert.deepEqual(
      CHANNEL_FIXTURES.map((c) => c.fixture),
      [...INTERIOR_FIXTURES],
    );
    const per = (id: string) =>
      CHANNEL_FIXTURES.filter((c) => c.channel === id).length;
    assert.deepEqual(LIGHT_IDS.map(per), [2, 3, 1, 1]);
    for (const { fixture } of CHANNEL_FIXTURES) {
      assert.equal(fixture.castShadow, false);
      assert.ok(fixture.distance > 0 && fixture.distance <= 2.4);
    }
    // 7 interior + 4 lanterns + sun/moon + hemisphere fill.
    assert.ok(CHANNEL_FIXTURES.length + 4 + 2 <= 13);
  });

  it("maps 0 / 25 / 50 / 100 % monotonically, 0 is off, 100 is full", () => {
    let previous: number[] | undefined;
    for (const pct of [0, 25, 50, 100]) {
      let settings = DEFAULT_LIGHTS;
      for (const id of LIGHT_IDS)
        settings = updateLight(settings, id, { intensity: pct });
      const out = fixtureOutputs(settings, night).map((o) => o.intensity);
      out.forEach((v, i) => {
        const full = CHANNEL_FIXTURES[i].fixture.intensity;
        assert.ok(Math.abs(v - (full * pct) / 100) < 1e-12);
        if (previous) assert.ok(v > previous[i]);
      });
      previous = out;
    }
  });

  it("is off by day, at the gate edges, with the master or the switch off", () => {
    for (const hours of [at(17, 59), at(6, 0), at(12, 0)])
      for (const o of fixtureOutputs(DEFAULT_LIGHTS, hours))
        assert.equal(o.intensity, 0, `${o.id} at ${hours}`);
    for (const hours of [at(18, 0), at(5, 59)])
      for (const o of fixtureOutputs(DEFAULT_LIGHTS, hours))
        assert.ok(o.intensity > 0, `${o.id} at ${hours}`);
    for (const o of fixtureOutputs(DEFAULT_LIGHTS, night, false))
      assert.equal(o.intensity, 0, `${o.id} with the master off`);
    for (const id of LIGHT_IDS) {
      const off = updateLight(DEFAULT_LIGHTS, id, { enabled: false });
      for (const o of fixtureOutputs(off, night))
        assert.equal(o.intensity === 0, o.channel === id, `${o.id} / ${id}`);
    }
  });

  it("keeps TV and setup independent and the light bar white", () => {
    const custom = updateLight(
      updateLight(DEFAULT_LIGHTS, "tv", { color: "#ff3366", intensity: 30 }),
      "setup",
      { color: "#22ff88", intensity: 90 },
    );
    const out = Object.fromEntries(
      fixtureOutputs(custom, night).map((o) => [o.id, o]),
    );
    assert.equal(out.tv.color, "#ff3366");
    assert.equal(out["tv-bounce"].color, "#ff3366");
    assert.equal(out.setup.color, "#22ff88");
    assert.equal(out["setup-bounce"].color, "#22ff88");
    assert.equal(out.lightbar.color, "#ffffff", "no setup colour in the bar");
    assert.ok(
      Math.abs(out.tv.intensity - 0.3 * LIGHT_FIXTURES.tv.intensity) < 1e-12,
    );
    assert.ok(
      Math.abs(out.setup.intensity - 0.9 * LIGHT_FIXTURES.setup.intensity) <
        1e-12,
    );
    for (const id of ["lampLeft", "lampRight"] as const)
      assert.equal(out[id].color, custom[id].color);
  });

  it("is mounted by NightLights for every channel fixture", () => {
    const source = readFileSync(
      new URL("../../src/components/world/NightLights.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /CHANNEL_FIXTURES/);
    assert.match(source, /fixtureOutputs\(/);
    assert.doesNotMatch(source, /castShadow = true[^;]*light/i);
    // Owned materials and geometries are still disposed on unmount.
    assert.match(source, /material\.dispose\(\)/);
    assert.match(source, /geometry\.dispose\(\)/);
  });
});
