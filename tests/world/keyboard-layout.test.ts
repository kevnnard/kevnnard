import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BOARD_UNITS,
  KEY_ROWS,
  keyCaps,
  LEGEND_ATLAS,
} from "../../src/lib/world/keyboard-layout.ts";
import { roundedBox } from "../../src/lib/world/rounded.ts";
import {
  KEYBOARD,
  keyboardLegendQuads,
  setupMeshes,
} from "../../src/lib/world/setup.ts";
import { PUBLIC } from "./glb.ts";

// keyboard-faithful T1 (S1): the owner's NuPhy Air75 V2, cap by cap.
const EPS = 1e-9;
const caps = keyCaps();

/** Canvas size of a WebP (VP8L or VP8X header). */
function webpSize(bytes: Buffer) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  assert.equal(chunk, "VP8L", "lossless or extended WebP");
  const bits = bytes.readUInt32LE(21);
  return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
}

describe("Air75 V2 layout", () => {
  it("has 84 keys in six rows that each fill the 16-unit board", () => {
    assert.equal(caps.length, 84);
    assert.deepEqual(
      KEY_ROWS.map((row) => row.length),
      [16, 15, 15, 14, 14, 10],
    );
    for (const row of KEY_ROWS)
      assert.ok(
        Math.abs(row.reduce((n, key) => n + key.units, 0) - BOARD_UNITS) < EPS,
      );
  });

  it("uses the V2's widths: 2u backspace, 2.25u left shift and enter, 6.25u space", () => {
    const width = (main: string) =>
      caps.filter((c) => c.legend?.main === main).map((c) => c.units);
    assert.deepEqual(width("BACKSPACE"), [2]);
    assert.deepEqual(width("TAB"), [1.5]);
    assert.deepEqual(width("CAPS"), [1.75]);
    assert.deepEqual(width("ENTER"), [2.25]);
    assert.deepEqual(width("SHIFT"), [2.25, 1.75]);
    const space = caps.filter((c) => c.role === "space");
    assert.equal(space.length, 1);
    assert.equal(space[0].units, 6.25);
    assert.equal(caps[0].legend?.main, "ESC");
    assert.equal(caps[0].role, "esc");
    // The navigation column ends rows 0-4; the arrows end the bottom row.
    assert.deepEqual(
      KEY_ROWS.map(
        (row) => row[row.length - 1].legend?.main || row.at(-1)?.legend?.icon,
      ),
      ["DEL", "PGUP", "PGDN", "HOME", "END", "right"],
    );
  });

  it("never overlaps two caps", () => {
    for (const a of caps)
      for (const b of caps)
        if (a !== b && a.row === b.row)
          assert.ok(a.x + a.units <= b.x + EPS || b.x + b.units <= a.x + EPS);
  });

  it("gives every printed cap its own atlas cell; only the space is blank", () => {
    const blank = caps.filter((c) => c.legend === null);
    assert.deepEqual(
      blank.map((c) => c.role),
      ["space"],
    );
    for (const c of caps) {
      const { u0, u1, v0, v1 } = c.cell;
      assert.ok(0 <= u0 && u0 < u1 && u1 <= 1 + EPS);
      assert.ok(0 <= v0 && v0 < v1 && v1 <= 1 + EPS);
      assert.ok(
        c.legend === null || c.legend.main !== "" || c.legend.icon,
        "text or icon",
      );
    }
    const number = caps.find((c) => c.legend?.main === "1");
    assert.equal(number?.legend?.sub, "!", "shifted symbol above");
  });
});

describe("Air75 V2 legend atlas", () => {
  it("ships one small WebP the size of the board at 128 px a unit", () => {
    const file = new URL("keyboard/keyboard-legends.webp", PUBLIC);
    assert.ok(LEGEND_ATLAS.file.endsWith("keyboard-legends.webp"));
    const bytes = readFileSync(file);
    assert.ok(statSync(file).size <= LEGEND_ATLAS.maxBytes, `${bytes.length}`);
    assert.deepEqual(webpSize(bytes), {
      width: LEGEND_ATLAS.width,
      height: LEGEND_ATLAS.height,
    });
    assert.equal(LEGEND_ATLAS.width, 2048);
  });

  it("maps a legend quad over each printed cap's top, facing up", () => {
    const quads = keyboardLegendQuads();
    const printed = caps.filter((c) => c.legend !== null);
    assert.equal(quads.positions.length, printed.length * 4 * 3);
    assert.equal(quads.uvs.length, printed.length * 4 * 2);
    assert.equal(quads.indices.length, printed.length * 6);
    const [cx, cy, cz] = KEYBOARD.center;
    const top = cy + KEYBOARD.size[1] / 2;
    for (let i = 0; i < quads.positions.length; i += 3) {
      const [x, y, z] = quads.positions.slice(i, i + 3);
      assert.ok(Math.abs(x - cx) < KEYBOARD.size[0] / 2);
      assert.ok(Math.abs(z - cz) < KEYBOARD.size[2] / 2);
      assert.ok(y > top && y < top + 0.001, "just above the caps");
    }
    // Each triangle's normal points up.
    const p = (n: number) => quads.positions.slice(n * 3, n * 3 + 3);
    for (let t = 0; t < quads.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((j) => p(quads.indices[t + j]));
      const e1 = [b[0] - a[0], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[2] - a[2]];
      // y of (b - a) x (c - a)
      assert.ok(e1[1] * e2[0] - e1[0] * e2[1] > 0);
    }
    // Esc's quad: back-left of the board (seated you face -x, right is -z)
    // samples the atlas's top-left cell.
    const esc = caps[0].cell;
    const u = quads.uvs.slice(0, 8);
    assert.deepEqual(
      [Math.min(u[0], u[2], u[4], u[6]), Math.max(u[1], u[3], u[5], u[7])],
      [esc.u0, esc.v1],
    );
    assert.ok(p(0)[0] < cx && p(0)[2] > cz);
  });

  it("keeps the keyboard under 10k triangles", (t) => {
    const parts = setupMeshes().solid.filter((s) => s.item === "keyboard");
    assert.equal(parts.filter((s) => s.material === "keycap").length, 84);
    assert.ok(parts.length <= 84 + 4, `${parts.length} parts`);
    let triangles = keyboardLegendQuads().indices.length / 3;
    for (const p of parts) {
      assert.equal(p.shape, "rounded");
      triangles +=
        roundedBox(p.size, p.radius ?? 0, p.segments).index.length / 3;
    }
    t.diagnostic(`keyboard triangles ${triangles}`);
    assert.ok(triangles <= 10_000, `${triangles} triangles`);
  });
});
