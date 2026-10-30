// T18 (S31, S32): the official YouTube loop above the official NestJS
// Controllers docs on the left portrait monitor, bound to its flat screen
// (no floating window).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PerspectiveCamera, Vector3 } from "three";
import { GUIDE } from "../../src/lib/world/camera.ts";
import {
  type Credits,
  creditProblems,
  ORIGINAL_LICENSE,
} from "../../src/lib/world/credits.ts";
import { CUTAWAY } from "../../src/lib/world/cutaway.ts";
import { HOUSE_FOCUS } from "../../src/lib/world/house.ts";
import { MONITOR_FOCUS, MONITOR_SCREEN } from "../../src/lib/world/monitor.ts";
import { CHAIR_SWAY } from "../../src/lib/world/motion.ts";
import {
  isPortraitCodeGlow,
  PLAYER_MIN_PX,
  PORTRAIT_DOCS,
  PORTRAIT_IFRAME,
  PORTRAIT_LINKS,
  PORTRAIT_PAGE,
  PORTRAIT_VIDEO,
  playerCorners,
  playerPixels,
  portraitDocsSrc,
  portraitEmbedUrl,
  portraitFocus,
  portraitMode,
  portraitSrc,
  projectedSize,
} from "../../src/lib/world/portrait.ts";
import {
  MAIN_ROOM,
  partBounds,
  SETUP_PROPS,
  type SetupPart,
  SIDE_MONITOR,
  setupMeshes,
  swivelPart,
} from "../../src/lib/world/setup.ts";

type V = readonly [number, number, number];
type Viewport = { width: number; height: number };
const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const EPS = 1e-9;
/** Phone portrait (375), laptop (1440) and desktop (1920) viewports. */
const VIEWPORTS: Viewport[] = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

function camera(position: V, target: V, viewport: Viewport) {
  const cam = new PerspectiveCamera(
    GUIDE.fov,
    viewport.width / viewport.height,
    0.1,
    200,
  );
  cam.position.set(...position);
  cam.lookAt(...target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}
/** A camera `out` metres along the screen normal, looking at the page. */
function outFront(out: number, viewport: Viewport, side = 0) {
  const { center, normal } = PORTRAIT_PAGE;
  const position: V = [
    center[0] + normal[0] * out + normal[2] * side,
    center[1],
    center[2] + normal[2] * out - normal[0] * side,
  ];
  return camera(position, center, viewport);
}
const at = (cam: PerspectiveCamera): V =>
  cam.position.toArray() as unknown as V;
/** Raw pixel corners of the player, unclipped. */
function rawCorners(cam: PerspectiveCamera, viewport: Viewport) {
  return playerCorners().map((corner) => {
    const p = new Vector3(...corner).project(cam);
    return [
      ((p.x + 1) / 2) * viewport.width,
      ((1 - p.y) / 2) * viewport.height,
    ];
  });
}

/** Whether segment a-b crosses a part's axis-aligned box (slab test). */
function crosses(a: V, b: V, part: SetupPart) {
  const box = partBounds(part);
  const lo = [box.x0, box.y0, box.z0];
  const hi = [box.x1, box.y1, box.z1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < 1e-12) {
      if (a[i] < lo[i] || a[i] > hi[i]) return false;
      continue;
    }
    let near = (lo[i] - a[i]) / d;
    let far = (hi[i] - a[i]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

describe("T18 official YouTube loop (S31)", () => {
  it("builds the one requested privacy-enhanced loop URL", () => {
    assert.equal(PORTRAIT_VIDEO.id, "NN6vlDRjg5Y");
    const url = new URL(portraitEmbedUrl(true));
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "www.youtube-nocookie.com");
    assert.equal(url.pathname, "/embed/NN6vlDRjg5Y");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      playlist: "NN6vlDRjg5Y",
      loop: "1",
      start: "0",
      end: "10",
      autoplay: "1",
      mute: "1",
      playsinline: "1",
      controls: "1",
      rel: "0",
    });
    assert.equal(
      new URL(portraitEmbedUrl(false)).searchParams.get("autoplay"),
      "0",
    );
  });

  it("asks only for playback permissions and keeps the referrer YouTube needs", () => {
    assert.equal(
      PORTRAIT_IFRAME.allow,
      "autoplay; encrypted-media; picture-in-picture",
    );
    assert.doesNotMatch(PORTRAIT_IFRAME.allow, /camera|microphone|geoloc/);
    assert.equal(
      PORTRAIT_IFRAME.referrerPolicy,
      "strict-origin-when-cross-origin",
    );
    assert.equal(
      PORTRAIT_LINKS.video,
      "https://www.youtube.com/watch?v=NN6vlDRjg5Y",
    );
    assert.equal(
      PORTRAIT_LINKS.channel,
      "https://www.youtube.com/c/GentlemanProgramming",
    );
    assert.equal(PORTRAIT_LINKS.docs, "https://docs.nestjs.com/controllers");
  });
});

describe("T18 page on the left portrait screen", () => {
  it("sits on the portrait's screen, facing out of it, on the seated left", () => {
    const { center, rotationY, normal, size } = PORTRAIT_PAGE;
    assert.deepEqual(center, SETUP_PROPS.sideScreen.center);
    assert.ok(Math.abs(rotationY - (Math.PI / 2 + SIDE_MONITOR.yaw)) < EPS);
    // A plane faces +z: turned by rotationY it faces the screen normal.
    const turned = new Vector3(0, 0, 1).applyAxisAngle(
      new Vector3(0, 1, 0),
      rotationY,
    );
    const yaw = SIDE_MONITOR.yaw;
    for (const [i, value] of [Math.cos(yaw), 0, -Math.sin(yaw)].entries()) {
      assert.ok(Math.abs(turned.getComponent(i) - value) < EPS);
      assert.ok(Math.abs(normal[i] - value) < EPS);
    }
    // Seated left is +z, past the ultrawide.
    assert.ok(center[2] > MONITOR_SCREEN.center[2] + 0.5);
    // The visible screen, inside the bezel.
    assert.deepEqual(size, SIDE_MONITOR.screen);
    assert.ok(size[0] < SIDE_MONITOR.size[2] && size[1] < SIDE_MONITOR.size[1]);
  });

  it("maps the CSS page onto the screen exactly (drei: 1px = distanceFactor/400 m)", () => {
    const { width, height, distanceFactor, size, player } = PORTRAIT_PAGE;
    assert.ok(Math.abs((width * distanceFactor) / 400 - size[0]) < 1e-6);
    assert.ok(Math.abs((height * distanceFactor) / 400 - size[1]) < 0.002);
    // The player's own viewport meets YouTube's 480x270 recommendation.
    assert.ok(player.width >= 480 && player.height >= 270);
    assert.ok(player.top + player.height < height);
    for (const [x, y, z] of playerCorners()) {
      const d = [x, y, z].map((c, i) => c - PORTRAIT_PAGE.center[i]);
      const along =
        d[0] * PORTRAIT_PAGE.normal[0] + d[2] * PORTRAIT_PAGE.normal[2];
      assert.ok(Math.abs(along) < EPS, "corners on the screen plane");
      assert.ok(Math.abs(d[1]) <= size[1] / 2 + EPS);
      assert.ok(Math.hypot(d[0], d[2]) <= size[0] / 2 + EPS);
    }
  });

  it("drops only the old code lines, keeping the portrait's screen backing", () => {
    const glow = setupMeshes().glow.filter((p) => p.item === "portrait");
    const kept = glow.filter((p) => !isPortraitCodeGlow(p));
    assert.equal(kept.length, 1);
    assert.equal(kept[0].size[1], SIDE_MONITOR.screen[1]);
    assert.ok(glow.length > kept.length);
  });

  it("measures the player conservatively: shortest edges, clipped to the viewport", () => {
    const viewport = { width: 1280, height: 800 };
    const tilted = projectedSize(
      [
        [100, 100],
        [400, 120],
        [400, 380],
        [100, 400],
      ],
      viewport,
    );
    assert.ok(Math.abs(tilted.width - Math.hypot(300, 20)) < EPS);
    assert.ok(Math.abs(tilted.height - 260) < EPS);
    const clipped = projectedSize(
      [
        [-500, 0],
        [300, 0],
        [300, 300],
        [-500, 300],
      ],
      viewport,
    );
    assert.equal(clipped.width, 300);
    // Behind the camera nothing is measured.
    const behind = outFront(0.5, viewport);
    behind.lookAt(
      behind.position.clone().add(new Vector3(...PORTRAIT_PAGE.normal)),
    );
    behind.updateMatrixWorld();
    assert.deepEqual(playerPixels(behind, viewport), { width: 0, height: 0 });
  });
});

describe("T18 portrait close-up: the official player reaches 200x200", () => {
  const meshes = setupMeshes();
  const swayed = [-CHAIR_SWAY, 0, CHAIR_SWAY].flatMap((angle) =>
    [...meshes.hull, ...meshes.solid.filter((p) => p.rig === "swivel")].map(
      (p) => swivelPart(p, angle),
    ),
  );
  const fixed = meshes.solid.filter(
    (p) => p.rig !== "swivel" && p.item !== "portrait",
  );

  it("fits the whole player, unclipped, at >=200x200 on phone, laptop and desktop", () => {
    for (const viewport of VIEWPORTS) {
      const pose = portraitFocus(viewport);
      assert.ok(pose.fits, `${viewport.width}`);
      const cam = camera(pose.position, pose.target, viewport);
      const pixels = playerPixels(cam, viewport);
      assert.ok(
        pixels.width >= PLAYER_MIN_PX && pixels.height >= PLAYER_MIN_PX,
        `${viewport.width}: ${pixels.width}x${pixels.height}`,
      );
      for (const [x, y] of rawCorners(cam, viewport)) {
        assert.ok(x >= 0 && x <= viewport.width, `${viewport.width} x ${x}`);
        assert.ok(y >= 0 && y <= viewport.height, `${viewport.width} y ${y}`);
      }
      assert.equal(
        portraitMode({
          powered: true,
          terminal: false,
          focused: true,
          camera: pose.position,
          pixels,
        }),
        "player",
      );
    }
  });

  it("looks at the screen face-on from inside the room, clear of the chair and desk", () => {
    for (const viewport of VIEWPORTS) {
      const { position, target } = portraitFocus(viewport);
      const d = position.map((c, i) => c - target[i]);
      const distance = Math.hypot(...d);
      const facing =
        (d[0] * PORTRAIT_PAGE.normal[0] + d[2] * PORTRAIT_PAGE.normal[2]) /
        distance;
      assert.ok(facing > 0.99, `face-on ${facing}`);
      assert.ok(distance >= MONITOR_FOCUS.limits.minDistance);
      assert.ok(distance <= MONITOR_FOCUS.limits.maxDistance);
      assert.ok(position[0] > MAIN_ROOM.x0 && position[0] < MAIN_ROOM.x1);
      assert.ok(position[2] > MAIN_ROOM.z0 && position[2] < MAIN_ROOM.z1);
      for (const corner of playerCorners())
        for (const part of [...swayed, ...fixed])
          assert.ok(
            !crosses(position, corner, part),
            `${part.item} hides the player at ${viewport.width}`,
          );
    }
  });

  it("shows a clear fallback, not a clipped player, when a viewport is too small", () => {
    const tiny = { width: 240, height: 180 };
    const pose = portraitFocus(tiny);
    assert.equal(pose.fits, false);
    const pixels = playerPixels(camera(pose.position, pose.target, tiny), tiny);
    assert.equal(
      portraitMode({
        powered: true,
        terminal: false,
        focused: true,
        camera: pose.position,
        pixels,
      }),
      "preview",
    );
  });

  it("never plays from the ordinary orbit, focused or not", () => {
    const viewport = VIEWPORTS[2];
    const orbit = outFront(4, viewport);
    const pixels = playerPixels(orbit, viewport);
    assert.ok(pixels.height < PLAYER_MIN_PX, `${pixels.height}`);
    for (const focused of [false, true])
      assert.notEqual(
        portraitMode({
          powered: true,
          terminal: false,
          focused,
          camera: at(orbit),
          pixels,
        }),
        "player",
      );
    // A grazing view shrinks the measured player.
    const face = playerPixels(outFront(0.9, viewport), viewport);
    const grazing = playerPixels(outFront(0.3, viewport, 0.9), viewport);
    assert.ok(grazing.width < face.width);
  });
});

describe("T18 power, terminal, distance and reduced motion", () => {
  const big = { width: 600, height: 450 };
  const front = at(outFront(0.9, VIEWPORTS[1]));
  const base = {
    powered: true,
    terminal: false,
    focused: true,
    camera: front,
    pixels: big,
  };

  it("goes dark with the night master and rests during the terminal close-up", () => {
    assert.equal(portraitMode(base), "player");
    assert.equal(portraitMode({ ...base, powered: false }), "off");
    assert.equal(portraitMode({ ...base, terminal: true }), "idle");
    assert.equal(
      portraitMode({ ...base, terminal: true, focused: false }),
      "idle",
    );
    // Not focused, near and in front: the still preview, clickable to enter.
    assert.equal(portraitMode({ ...base, focused: false }), "preview");
  });

  it("rests from behind, from far away and from under the floor", () => {
    const { center, normal } = PORTRAIT_PAGE;
    const behind: V = [center[0] - normal[0], center[1], center[2] - normal[2]];
    const away = HOUSE_FOCUS.map((c, i) =>
      i === 0 ? c + CUTAWAY.wall.gone + 1 : c,
    ) as unknown as V;
    const under: V = [front[0], -5, front[2]];
    for (const camera of [behind, away, under, [Number.NaN, 0, 0] as V])
      for (const focused of [false, true])
        assert.equal(portraitMode({ ...base, focused, camera }), "idle");
  });

  it("mounts the iframe only to play; reduced motion never autoplays", () => {
    for (const mode of ["off", "idle", "preview"] as const)
      assert.equal(portraitSrc(mode, false), null);
    assert.equal(portraitSrc("player", false), portraitEmbedUrl(true));
    assert.equal(portraitSrc("player", true), portraitEmbedUrl(false));
  });
});

describe("T18 official NestJS docs (S32)", () => {
  it("frames the one fixed official Controllers page, no proxy or mirror", () => {
    const url = new URL(PORTRAIT_DOCS.url);
    assert.equal(url.href, "https://docs.nestjs.com/controllers");
    assert.equal(PORTRAIT_DOCS.url, PORTRAIT_LINKS.docs);
    assert.equal(PORTRAIT_DOCS.title, "NestJS official documentation");
    assert.equal(
      PORTRAIT_DOCS.referrerPolicy,
      "strict-origin-when-cross-origin",
    );
  });

  it("loads only in the powered portrait close-up; off, idle and unfocused never", () => {
    for (const mode of ["player", "preview"] as const)
      assert.equal(portraitDocsSrc(mode, true), PORTRAIT_DOCS.url);
    for (const mode of ["off", "idle"] as const)
      assert.equal(portraitDocsSrc(mode, true), null);
    for (const mode of ["off", "idle", "preview", "player"] as const)
      assert.equal(portraitDocsSrc(mode, false), null);
  });

  it("replaces the local preview with a contained, permission-free iframe and an outside link", () => {
    const page = read("src/components/world/PortraitScreen.tsx");
    assert.doesNotMatch(page, /CatsController|GET<\/b>/);
    const docs = page.match(/<iframe\b[^>]*PORTRAIT_DOCS[^>]*>/)?.[0] ?? "";
    assert.match(docs, /src=\{docs\}/);
    assert.match(docs, /title=\{PORTRAIT_DOCS\.title\}/);
    assert.match(docs, /referrerPolicy=\{PORTRAIT_DOCS\.referrerPolicy\}/);
    assert.doesNotMatch(docs, /allow|sandbox|srcDoc/);
    assert.match(page, /portraitDocsSrc\(mode, focused\)/);
    // The native link sits outside the frame, always.
    assert.match(page, /Open NestJS documentation/);
    const css = read("src/components/world/portrait-screen.css");
    assert.match(css, /\.portrait-docs iframe\s*\{[^}]*border: 0/);
  });
});

describe("T18 wiring: one surface-bound page and a reversible close-up", () => {
  it("mounts the page once in Setup and threads the close-up through both Suspense branches", () => {
    const setup = read("src/components/world/Setup.tsx");
    assert.equal(setup.match(/<PortraitScreen\b/g)?.length, 1);
    assert.match(setup, /!isPortraitCodeGlow\(part\)/);
    assert.doesNotMatch(setup, /logoMesh|placeLogo/);
    const scene = read("src/components/world/WorldScene.tsx");
    const setups = scene.match(/<Setup\b[\s\S]*?\/>/g) ?? [];
    assert.equal(setups.length, 2);
    for (const element of setups)
      assert.match(element, /portrait=\{portrait\}/);
  });

  it("projects with drei's transform and depth blending, no modal or fixed layer", () => {
    const page = read("src/components/world/PortraitScreen.tsx");
    assert.match(page, /<Html\b[\s\S]*?\btransform\b/);
    assert.match(page, /occlude="blending"/);
    // A sized hole from the first frame: never drei's default 1 m plane.
    assert.match(page, /geometry=\{/);
    assert.doesNotMatch(page, /fullscreen|<dialog|showModal|createPortal/);
    assert.doesNotMatch(page, /<textarea|<input/);
    assert.match(page, /rel="noopener noreferrer"/);
    const css = read("src/components/world/portrait-screen.css");
    assert.doesNotMatch(css, /position:\s*fixed|100vw|100vh|::backdrop/);
    // The canvas stays isolated, so its blending z-index never covers the UI.
    assert.match(
      read("src/components/world/WorldScene.tsx"),
      /isolation: "isolate"/,
    );
  });

  it("enters and exits the portrait like the terminal, never both at once", () => {
    const app = read("src/components/world/WorldApp.tsx");
    assert.match(app, /Watch video/);
    assert.match(app, /Exit portrait/);
    assert.match(app, /menuButton\.current\?\.focus\(\)/);
    // Each close-up only opens from the room.
    assert.match(app, /if \(!focus\) setPortrait\(true\)/);
    assert.match(app, /onEnter: ready && !portrait \? enter : undefined/);
    const scene = read("src/components/world/WorldScene.tsx");
    assert.match(scene, /portraitFocus\(/);
    // Only the terminal close-up reports arrival to the terminal.
    assert.match(
      scene,
      /onArrive=\{closeUp === "terminal" \? onMonitorArrive : undefined\}/,
    );
  });
});

describe("T18 credit", () => {
  const shipped = JSON.parse(read("public/world/credits.json")) as Credits;

  it("declares external player requests in both the manifest and generator", () => {
    assert.equal(
      JSON.parse(read("public/world/credits.json")).runtimeExternalRequests,
      true,
    );
    assert.match(
      read("scripts/prepare-world.py"),
      /"runtimeExternalRequests": True/,
    );
  });

  it("credits the original page and references the video, channel and docs", () => {
    assert.deepEqual(creditProblems(shipped), []);
    const entry = shipped.original?.find((item) => item.id === "portrait-page");
    assert.ok(entry);
    assert.equal(entry.license, ORIGINAL_LICENSE);
    assert.equal(entry.source, "src/components/world/PortraitScreen.tsx");
    assert.deepEqual(entry.references, [
      PORTRAIT_LINKS.video,
      PORTRAIT_LINKS.channel,
      PORTRAIT_LINKS.docs,
    ]);
    assert.match(entry.asset, /never downloaded/);
    assert.match(entry.asset, /official NestJS Controllers documentation/);
    assert.doesNotMatch(entry.asset, /documentation preview/);
  });

  it("regenerates the same entry from scripts/prepare-world.py", () => {
    // Reads ORIGINAL statically (ast.literal_eval): no import, no downloads.
    const script = fileURLToPath(
      new URL("../../scripts/prepare-world.py", import.meta.url),
    );
    const out = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import ast, json, sys",
          "tree = ast.parse(open(sys.argv[1], encoding='utf-8').read())",
          "node = next(n.value for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, 'id', None) == 'ORIGINAL' for t in n.targets))",
          "print(json.dumps(ast.literal_eval(node)))",
        ].join("\n"),
        script,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), shipped.original);
  });
});
