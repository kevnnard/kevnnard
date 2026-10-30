import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector2,
} from "three";
import { safeExternalUrl } from "../../src/lib/room/terminal.ts";
import { GUIDE } from "../../src/lib/world/camera.ts";
import {
  monitorFocus,
  projectScreen,
  screenSurface,
  type Viewport,
  visibleSpan,
} from "../../src/lib/world/monitor.ts";
import {
  BUFFERS,
  type BufferId,
  portfolioBuffers,
} from "../../src/lib/world/terminal-content.ts";
import {
  ASCII_SHARE,
  BODY,
  clampScroll,
  FONT,
  FULL_COLUMN,
  hitAt,
  revealScroll,
  SCREEN_H,
  SCREEN_W,
  type ScreenRegion,
  spanColumn,
  type TerminalLayout,
  terminalLayout,
  uvToCanvas,
} from "../../src/lib/world/terminal-layout.ts";
import experience from "../../src/utils/experience.json" with { type: "json" };
import projects from "../../src/utils/projects.json" with { type: "json" };

const content = portfolioBuffers({ projects, experience });
const BUFFER_IDS: BufferId[] = ["home", "a", "p", "e", "c"];
const VIEWPORTS: Viewport[] = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1080 },
  { width: 3440, height: 1440 },
];
const columnFor = (viewport: Viewport) => spanColumn(visibleSpan(viewport));
const layoutFor = (viewport: Viewport, id: BufferId) =>
  terminalLayout(content, id, columnFor(viewport), true);
const allRegions = (layout: TerminalLayout) => [
  ...layout.chrome.regions,
  ...layout.regions,
];
const center = (r: ScreenRegion) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The screen strip as a real three.js mesh, as MonitorScreen renders it. */
function screenMesh() {
  const surface = screenSurface();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(surface.positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(surface.uvs, 2));
  geometry.setIndex(surface.indices);
  return new Mesh(geometry, new MeshBasicMaterial());
}

/**
 * Casts a ray from the close-up camera through the viewport pixel where
 * canvas point (x, y) is drawn, and returns the UV the mesh reports.
 */
function castAt(viewport: Viewport, x: number, y: number) {
  const { position, target } = monitorFocus(viewport.width / viewport.height);
  const camera = new PerspectiveCamera(
    GUIDE.fov,
    viewport.width / viewport.height,
    0.1,
    200,
  );
  camera.position.set(...position);
  camera.lookAt(...target);
  camera.updateMatrixWorld();
  const pixel = projectScreen(x / SCREEN_W, 1 - y / SCREEN_H, viewport);
  const ndc = new Vector2(
    (pixel.x / viewport.width) * 2 - 1,
    1 - (pixel.y / viewport.height) * 2,
  );
  const raycaster = new Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const [hit] = raycaster.intersectObject(screenMesh());
  return { pixel, uv: hit?.uv };
}

describe("terminal canvas (T16, L66)", () => {
  it("keeps the screen's own aspect: no stretched texture", () => {
    assert.equal(SCREEN_W, 2048);
    assert.ok(Math.abs(SCREEN_W / SCREEN_H - 2.925) < 0.01);
    assert.equal(BODY.y + BODY.h + 76, SCREEN_H, "command and status below");
  });

  it("dashboard: name at most a quarter of the screen, all four entries visible without scrolling", () => {
    for (const viewport of VIEWPORTS) {
      const layout = layoutFor(viewport, "home");
      const ascii = layout.texts.filter((t) => t.color === "green" && t.bold);
      assert.equal(ascii.length, 6);
      const top = ascii[0].y - (ascii[0].size * 1.2) / 2;
      const bottom = ascii[5].y + (ascii[5].size * 1.2) / 2;
      assert.ok(
        bottom - top <= SCREEN_H * ASCII_SHARE + 0.5,
        `${viewport.width}`,
      );
      // Every column of the header fits the visible column.
      const width = layout.column.x1 - layout.column.x0 - 48;
      assert.ok(69 * 0.62 * ascii[0].size <= width + 0.5);
      const entries = layout.regions.filter((r) => r.kind === "entry");
      assert.deepEqual(
        entries.map((r) => r.key),
        ["a", "p", "e", "c"],
      );
      assert.equal(layout.maxScroll, 0, `${viewport.width} no scroll`);
      for (const r of entries)
        assert.ok(r.y + r.h <= BODY.h, `${viewport.width} ${r.key}`);
    }
  });

  it("every control and line of text sits inside the part of the screen the camera shows", () => {
    for (const viewport of VIEWPORTS) {
      const column = columnFor(viewport);
      for (const id of BUFFER_IDS) {
        const layout = layoutFor(viewport, id);
        for (const r of allRegions(layout)) {
          assert.ok(
            r.x >= column.x0 && r.x + r.w <= column.x1 + 0.5,
            `${viewport.width} ${id} ${r.id}`,
          );
          assert.ok(r.x >= 0 && r.x + r.w <= SCREEN_W);
        }
        for (const t of [...layout.texts, ...layout.chrome.texts]) {
          const w = [...t.text].length * t.size * 0.6;
          const x0 =
            t.align === "left"
              ? t.x
              : t.align === "right"
                ? t.x - w
                : t.x - w / 2;
          assert.ok(
            x0 >= column.x0 - 0.5 && x0 + w <= column.x1 + 0.5,
            `${viewport.width} ${id} "${t.text}"`,
          );
        }
        // Exit is on the screen itself, in view.
        assert.ok(layout.chrome.regions.some((r) => r.id === "exit"));
      }
    }
  });

  it("phones see the middle of the ultrawide, wide views the whole screen", () => {
    assert.deepEqual(columnFor({ width: 1440, height: 900 }), FULL_COLUMN);
    assert.deepEqual(columnFor({ width: 3440, height: 1440 }), FULL_COLUMN);
    for (const viewport of VIEWPORTS.slice(0, 3)) {
      const column = columnFor(viewport);
      assert.ok(
        column.x0 > 400 && column.x1 < SCREEN_W - 400,
        `${viewport.width}`,
      );
      assert.ok(Math.abs(column.x0 + column.x1 - SCREEN_W) < 8, "centred");
    }
  });

  it("body text reads at >= 14 CSS px from the close-up (analytic projection, not GPU pixels)", () => {
    for (const viewport of VIEWPORTS) {
      const a = projectScreen(0.49, 0.5, viewport);
      const b = projectScreen(0.51, 0.5, viewport);
      // The screen's middle is its farthest part: the smallest scale.
      const scale = (b.x - a.x) / (0.02 * SCREEN_W);
      assert.ok(
        FONT.text * scale >= 14,
        `${viewport.width}: ${FONT.text * scale}`,
      );
      assert.ok(FONT.small * scale >= 13.5, `${viewport.width} small`);
    }
  });

  it("idle shows the same dashboard without Exit; active adds Exit", () => {
    const idle = terminalLayout(content, "home");
    assert.equal(
      idle.chrome.regions.some((r) => r.id === "exit"),
      false,
    );
    assert.deepEqual(
      idle.regions.map((r) => r.id),
      terminalLayout(content, "home", FULL_COLUMN, true).regions.map(
        (r) => r.id,
      ),
    );
  });

  it("links are the buffers' validated URLs, one region each", () => {
    for (const id of ["a", "p", "e", "c"] as const) {
      const links = terminalLayout(
        content,
        id,
        FULL_COLUMN,
        true,
      ).regions.filter((r) => r.hit.type === "link");
      assert.ok(links.length > 0, id);
      for (const r of links) {
        assert.equal(r.hit.type, "link");
        if (r.hit.type === "link")
          assert.equal(safeExternalUrl(r.hit.href), r.hit.href);
      }
    }
    const project = terminalLayout(content, "p", FULL_COLUMN, true);
    for (const p of content.projects)
      for (const link of p.links)
        assert.ok(
          project.regions.some((r) => r.id === `link:${link.href}`),
          link.href,
        );
  });
});

describe("pointer on the curved screen (T16, L66)", () => {
  it("a ray through any facet reports the UV of the canvas point drawn there", () => {
    const viewport = { width: 1440, height: 900 };
    for (let i = 0; i < 12; i++)
      for (const y of [30, 350, 680]) {
        const x = ((i + 0.37) / 12) * SCREEN_W;
        const { uv } = castAt(viewport, x, y);
        assert.ok(uv, `facet ${i}`);
        const back = uvToCanvas(uv.x, uv.y);
        assert.ok(
          Math.abs(back.x - x) < 3 && Math.abs(back.y - y) < 3,
          `facet ${i} ${y}`,
        );
      }
    // Facet joins: no gap and no jump either side of each seam.
    for (let i = 1; i < 12; i++) {
      const x = (i / 12) * SCREEN_W;
      for (const dx of [-1.5, 1.5]) {
        const { uv } = castAt(viewport, x + dx, 350);
        assert.ok(
          uv && Math.abs(uvToCanvas(uv.x, uv.y).x - (x + dx)) < 3,
          `seam ${i}`,
        );
      }
    }
  });

  it("clicking each drawn control through the real ray hits that control, on wide and phone views", () => {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 1440, height: 900 },
      { width: 3440, height: 1440 },
    ]) {
      for (const id of BUFFER_IDS) {
        const layout = layoutFor(viewport, id);
        const shown = [
          ...layout.chrome.regions,
          ...layout.regions.filter((r) => r.y + r.h <= BODY.h),
        ];
        assert.ok(shown.length > 0);
        for (const region of shown) {
          const { x, y } = center(region);
          const canvasY = layout.chrome.regions.includes(region)
            ? y
            : y + BODY.y;
          const { pixel, uv } = castAt(viewport, x, canvasY);
          assert.ok(
            pixel.x > 0 && pixel.x < viewport.width,
            `${region.id} on the viewport`,
          );
          assert.ok(uv, region.id);
          const point = uvToCanvas(uv.x, uv.y);
          assert.equal(
            hitAt(layout, 0, point.x, point.y)?.id,
            region.id,
            `${viewport.width} ${id} ${region.id}`,
          );
        }
      }
    }
  });

  it("dashboard entries open their buffer and Exit leaves", () => {
    const layout = layoutFor({ width: 1440, height: 900 }, "home");
    for (const key of Object.keys(BUFFERS)) {
      const r = layout.regions.find((region) => region.id === `open:${key}`);
      assert.ok(r);
      const { x, y } = center(r);
      assert.deepEqual(hitAt(layout, 0, x, y + BODY.y)?.hit, {
        type: "open",
        buffer: key,
      });
    }
    const exit = layout.chrome.regions.find((r) => r.id === "exit");
    assert.ok(exit);
    assert.deepEqual(hitAt(layout, 0, center(exit).x, center(exit).y)?.hit, {
      type: "exit",
    });
    assert.equal(
      hitAt(layout, 0, 4, BODY.y + BODY.h - 4),
      null,
      "empty screen is no control",
    );
  });

  it("scrolls within bounds, and hidden content never takes a click", () => {
    const layout = layoutFor({ width: 375, height: 812 }, "p");
    assert.ok(layout.maxScroll > 1000);
    assert.equal(clampScroll(layout, -50), 0);
    assert.equal(clampScroll(layout, 1e9), layout.maxScroll);
    assert.equal(clampScroll(layout, Number.NaN), 0);
    const far = layout.regions.find(
      (r) => r.hit.type === "link" && r.y > BODY.h * 2,
    );
    assert.ok(far);
    // Not in view at the top: the same canvas point is buffer text or nothing.
    const { x, y } = center(far);
    assert.notEqual(hitAt(layout, 0, x, BODY.y + (y % BODY.h))?.id, far.id);
    // Scrolled to it, the click lands on it.
    const scroll = revealScroll(layout, 0, far.id);
    const shownY = BODY.y + y - scroll;
    assert.ok(shownY > BODY.y && shownY < BODY.y + BODY.h);
    assert.equal(hitAt(layout, scroll, x, shownY)?.id, far.id);
    // Scrolled content under the tab bar is clipped: the tab wins.
    const tab = layout.chrome.regions.find((r) => r.id === "tab:home");
    assert.ok(tab);
    assert.equal(
      hitAt(layout, scroll, center(tab).x, center(tab).y)?.id,
      "tab:home",
    );
  });

  it("keyboard focus reveals each control of a long buffer", () => {
    const layout = layoutFor({ width: 1440, height: 900 }, "e");
    let scroll = 0;
    for (const region of layout.regions) {
      scroll = revealScroll(layout, scroll, region.id);
      assert.ok(
        region.y >= scroll && region.y + region.h <= scroll + BODY.h,
        region.id,
      );
    }
  });
});

// L68: measured text. Monospace stand-ins for real canvas fonts: a 0.6 em
// SF Mono-like face and a wider 0.7 em fallback; non-ASCII as wide.
const mono = (em: number) => (text: string, size: number) =>
  [...text].length * size * em;
/** The renderer's entry geometry (MonitorScreen.tsx). */
const LABEL_X = 74;
const FILE_RIGHT = 16;
const SHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
];

describe("measured screen text (T16, L68)", () => {
  it("dashboard labels and file names never overlap: at least 1 em apart", () => {
    for (const em of [0.6, 0.7])
      for (const viewport of SHOT_VIEWPORTS) {
        const measure = mono(em);
        const layout = terminalLayout(
          content,
          "home",
          columnFor(viewport),
          true,
          measure,
        );
        const entries = layout.regions.filter((r) => r.kind === "entry");
        assert.equal(entries.length, 4);
        assert.equal(layout.maxScroll, 0, "all four without scrolling");
        for (const r of entries) {
          const labelEnd = r.x + LABEL_X + measure(r.label, r.size);
          assert.ok(
            labelEnd <= r.x + r.w - FILE_RIGHT,
            `${viewport.width} ${r.label} fits`,
          );
          if (!r.file) continue;
          const fileStart =
            r.x + r.w - FILE_RIGHT - measure(r.file, FONT.small);
          assert.ok(
            fileStart - labelEnd >= r.size,
            `${viewport.width} ${em} ${r.label} / ${r.file}`,
          );
        }
        assert.ok(entries.some((r) => r.label === "Experience"));
      }
  });

  it("wide screens keep the file names; phones drop them rather than squeeze", () => {
    const wide = terminalLayout(content, "home", FULL_COLUMN, true, mono(0.6));
    assert.ok(
      wide.regions.filter((r) => r.kind === "entry").every((r) => r.file),
    );
    const phone = terminalLayout(
      content,
      "home",
      columnFor({ width: 375, height: 812 }),
      true,
      mono(0.6),
    );
    assert.ok(
      phone.regions.filter((r) => r.kind === "entry").every((r) => !r.file),
    );
  });

  it("wrapped lines and the whole ASCII name stay inside the column by the measured width", () => {
    const measure = mono(0.7);
    for (const viewport of SHOT_VIEWPORTS) {
      const column = columnFor(viewport);
      for (const id of BUFFER_IDS) {
        const layout = terminalLayout(content, id, column, true, measure);
        for (const t of layout.texts) {
          const w = measure(t.text, t.size);
          const x0 =
            t.align === "left"
              ? t.x
              : t.align === "right"
                ? t.x - w
                : t.x - w / 2;
          assert.ok(
            x0 >= column.x0 - 0.5 && x0 + w <= column.x1 + 0.5,
            `${viewport.width} ${id} "${t.text}"`,
          );
        }
        if (id === "home") {
          const ascii = layout.texts.filter(
            (t) => t.color === "green" && t.bold,
          );
          assert.equal(ascii.length, 6, "the whole name, no row dropped");
          assert.ok(
            ascii.every((t) => t.size === ascii[0].size && t.x === ascii[0].x),
            "rows aligned",
          );
        }
      }
    }
    // Accented titles wrap at word boundaries, nothing lost.
    const about = terminalLayout(
      content,
      "a",
      columnFor({ width: 375, height: 812 }),
      true,
      measure,
    );
    const words = about.texts.map((t) => t.text).join(" ");
    assert.ok(words.includes("Londoño"));
  });
});
