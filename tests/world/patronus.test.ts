import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DISPLAY_CASE,
  DISPLAY_CASES,
} from "../../src/lib/world/display-cases.ts";
import { HOUSE } from "../../src/lib/world/house.ts";
import { LIVING_MODELS, modelBounds } from "../../src/lib/world/living.ts";
import {
  PATRONUS,
  PATRONUS_PATH,
  patronusAt,
} from "../../src/lib/world/patronus.ts";
import { SHELF_HITBOX } from "../../src/lib/world/shelf.ts";
import { SPELL, WAND_TIP } from "../../src/lib/world/wand.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const FLOOR = HOUSE.floorY + 0.04;

describe("ghost lion patronus (patronus T1)", () => {
  it("stays on screen for 6 to 8 seconds, like a film patronus", () => {
    assert.ok(PATRONUS.duration >= 6 && PATRONUS.duration <= 8);
    assert.ok(PATRONUS.start > 0 && PATRONUS.start < SPELL.words[1]);
    assert.equal(patronusAt(PATRONUS.start - 0.01), null);
    assert.equal(patronusAt(PATRONUS.start + PATRONUS.duration + 0.01), null);
  });

  it("bursts from the wand tip, then runs at floor level", () => {
    const first = patronusAt(PATRONUS.start);
    assert.ok(first);
    assert.ok(
      Math.hypot(...first.position.map((v, i) => v - WAND_TIP[i])) < 0.05,
    );
    assert.ok(first.scale < 0.4, "grows out of the tip");
    const mid = patronusAt(PATRONUS.start + PATRONUS.duration * 0.5);
    assert.ok(mid);
    assert.ok(Math.abs(mid.position[1] - FLOOR) < 0.05, "on the floor");
    assert.equal(mid.scale, 1);
    assert.ok(mid.opacity > 0.8);
    assert.ok(mid.dissolve === 0);
    const last = patronusAt(PATRONUS.start + PATRONUS.duration - 0.01);
    assert.ok(last);
    assert.ok(last.dissolve > 0.9, "dissolves into particles");
  });

  it("stays in the living room, clear of the furniture", () => {
    const m = HOUSE.main;
    const keepOut = [
      ...LIVING_MODELS.filter(
        (x) => x.kind !== "rug" && x.kind !== "books",
      ).map(modelBounds),
      ...DISPLAY_CASES.map(({ base }) => ({
        x0: base[0] - DISPLAY_CASE.plinth.width / 2,
        x1: base[0] + DISPLAY_CASE.plinth.width / 2,
        z0: base[2] - DISPLAY_CASE.plinth.depth / 2,
        z1: base[2] + DISPLAY_CASE.plinth.depth / 2,
      })),
    ];
    const t0 = PATRONUS.start + PATRONUS.duration * 0.3;
    for (let t = t0; t < PATRONUS.start + PATRONUS.duration; t += 0.05) {
      const s = patronusAt(t);
      assert.ok(s);
      const [x, , z] = s.position;
      assert.ok(
        x > m.x0 + 0.3 && x < m.x1 - 0.3 && z > m.z0 + 0.3 && z < m.z1 - 0.3,
      );
      for (const b of keepOut)
        assert.ok(
          !(
            x > b.x0 - 0.15 &&
            x < b.x1 + 0.15 &&
            z > b.z0 - 0.15 &&
            z < b.z1 + 0.15
          ),
          `in the furniture at ${x.toFixed(2)} ${z.toFixed(2)}`,
        );
    }
    // Out of the shelf right away.
    const [sx] = SHELF_HITBOX.center;
    const out = patronusAt(PATRONUS.start + 0.4);
    assert.ok(out && out.position[0] > sx + SHELF_HITBOX.size[0] / 2);
    assert.ok(PATRONUS_PATH.length >= 5, "a curved path");
  });

  it("faces where it runs", () => {
    const a = patronusAt(PATRONUS.start + 1.5);
    const b = patronusAt(PATRONUS.start + 1.55);
    assert.ok(a && b);
    const dx = b.position[0] - a.position[0];
    const dz = b.position[2] - a.position[2];
    const heading = Math.atan2(dx, dz);
    const diff = Math.atan2(
      Math.sin(heading - a.heading),
      Math.cos(heading - a.heading),
    );
    assert.ok(Math.abs(diff) < 0.2);
  });

  it("is keh's lion, drawn in the ghost material, under 1 m at the shoulder", () => {
    assert.equal(PATRONUS.lion, "/world/models/patronus-lion.glb");
    const file = new URL(
      "../../public/world/models/patronus-lion.glb",
      import.meta.url,
    );
    assert.ok(existsSync(file));
    const bytes = readFileSync(file);
    assert.ok(bytes.length < 400_000, "small: no textures");
    const json = JSON.parse(
      bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
    );
    assert.equal(json.images?.length ?? 0, 0, "textures dropped");
    assert.equal(json.skins?.length, 1, "rigged");
    assert.equal(json.animations?.length, 1, "its clip kept");
    const shoulder = PATRONUS.lionHeight * PATRONUS.lionShoulder;
    assert.ok(
      shoulder > 0.7 && shoulder < 0.9,
      `room-sized: shoulder ${shoulder}`,
    );
    assert.ok(
      FLOOR + PATRONUS.lionHeight < HOUSE.floorY + HOUSE.main.height,
      "under the walls' top",
    );
    const view = source("src/components/world/Patronus.tsx");
    assert.match(view, /PatronusModel/);
    assert.match(view, /AdditiveBlending/);
    assert.match(view, /fresnel/i);
    assert.match(view, /AnimationMixer/);
    assert.doesNotMatch(view, /placeholder/i, "no placeholder left");
  });
});
