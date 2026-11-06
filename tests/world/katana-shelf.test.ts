import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASE_STORIES } from "../../src/lib/world/case-stories.ts";
import type { Credits } from "../../src/lib/world/credits.ts";
import { DISPLAY_CASE } from "../../src/lib/world/display-cases.ts";
import {
  galleryCaseFocus,
  galleryStoryShift,
  STORY_CARD,
} from "../../src/lib/world/gallery-camera.ts";
import { HOUSE, type Vec3, WALLS } from "../../src/lib/world/house.ts";
import {
  KATANA_CENTRE,
  KATANA_LIGHT_POSITION,
  KATANA_MODEL,
  KATANA_SHELF,
  KATANA_SHELF_HITBOX,
  KATANA_SPOTS,
  KATANA_UPLIGHT_POSITION,
  katanaLightLevel,
  katanaModelFit,
  SHELF_INTERIOR_X,
} from "../../src/lib/world/katana-shelf.ts";
import {
  LIVING_MODELS,
  modelBounds,
  TV_PANEL,
} from "../../src/lib/world/living.ts";
import { SOFA_LAMP, SOFA_LAMPS } from "../../src/lib/world/sofa-lamps.ts";
import { glbInfo, PUBLIC } from "./glb.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/** Blossom Katana's own bounds (glTF axes), measured in Blender. */
const SOURCE_BOX = {
  min: [-2.9646, 0, -0.581] as [number, number, number],
  max: [3.0142, 2.5054, 0.5518] as [number, number, number],
};

/** The source box after the model's `frontYaw` about +y. */
function turned(yaw: number) {
  const corners: [number, number, number][] = [];
  for (const x of [SOURCE_BOX.min[0], SOURCE_BOX.max[0]])
    for (const z of [SOURCE_BOX.min[2], SOURCE_BOX.max[2]])
      for (const y of [SOURCE_BOX.min[1], SOURCE_BOX.max[1]])
        corners.push([
          x * Math.cos(yaw) + z * Math.sin(yaw),
          y,
          -x * Math.sin(yaw) + z * Math.cos(yaw),
        ]);
  return {
    min: [0, 1, 2].map((k) => Math.min(...corners.map((c) => c[k]))) as [
      number,
      number,
      number,
    ],
    max: [0, 1, 2].map((k) => Math.max(...corners.map((c) => c[k]))) as [
      number,
      number,
      number,
    ],
  };
}

const wall = WALLS.find((item) => item.id === "main-right");
const floor = HOUSE.floorY;

describe("katana wall shelf placement (katana-wall-shelf T4)", () => {
  it("hangs on the interior face of the window wall", () => {
    assert.ok(wall);
    assert.equal(KATANA_SHELF.wall, "main-right");
    assert.ok(
      Math.abs(SHELF_INTERIOR_X - (wall.at - HOUSE.wall / 2)) < 1e-9,
      `interior face ${SHELF_INTERIOR_X}`,
    );
  });

  it("is centred on the free stretch between the back corner and the window", () => {
    assert.ok(wall);
    const back = wall.from;
    const pane = wall.openings.find((opening) => opening.kind === "window");
    assert.ok(pane);
    const z0 = KATANA_SHELF.centreZ - KATANA_SHELF.length / 2;
    const z1 = KATANA_SHELF.centreZ + KATANA_SHELF.length / 2;
    assert.ok(Math.abs(KATANA_SHELF.centreZ - (back + pane.u0) / 2) < 1e-9);
    assert.ok(z0 - back >= 0.25, `corner gap ${z0 - back}`);
    assert.ok(pane.u0 - z1 >= 0.25, `window gap ${pane.u0 - z1}`);
  });

  it("sits a little under eye height, the katanas' middle at ~1.45 m (S4)", () => {
    const top = KATANA_SHELF.topY - floor;
    assert.ok(top > 1.1 && top < 1.25, `board top ${top}`);
    const middle = KATANA_CENTRE[1] - floor;
    assert.ok(middle >= 1.35 && middle <= 1.5, `katana middle ${middle}`);
    assert.ok(wall);
    const lightTop = KATANA_LIGHT_POSITION[1] - floor;
    assert.ok(lightTop < wall.height, `light ${lightTop} under the wall top`);
  });

  it("stays clear of the TV, the sofa and the sofa lamps", () => {
    const x0 = SHELF_INTERIOR_X - KATANA_SHELF.depth;
    const z0 = KATANA_SHELF.centreZ - KATANA_SHELF.length / 2;
    const z1 = KATANA_SHELF.centreZ + KATANA_SHELF.length / 2;
    const y0 = KATANA_SHELF.topY - KATANA_SHELF.bracket.height;
    // The TV on the back wall: left of the shelf or under it.
    const tvRight = TV_PANEL.center[0] + TV_PANEL.width / 2;
    const tvTop = TV_PANEL.center[1] + TV_PANEL.height / 2;
    assert.ok(tvRight < x0 || tvTop < y0, `TV ${tvRight}, ${tvTop}`);
    for (const model of LIVING_MODELS) {
      const box = modelBounds(model);
      const overlaps = box.x1 > x0 && box.z1 > z0 && box.z0 < z1 && box.y1 > y0;
      assert.ok(!overlaps, `${model.kind} under the shelf`);
    }
    for (const lamp of SOFA_LAMPS) {
      const reach = SOFA_LAMP.shade.bottom;
      const lampOverlaps =
        lamp.base[0] + reach > x0 &&
        lamp.base[2] + reach > z0 &&
        lamp.base[2] - reach < z1;
      assert.ok(!lampOverlaps, `${lamp.id} lamp`);
    }
  });
});

describe("Blossom Katana on the shelf (katana-wall-shelf T3, T4)", () => {
  it("turns the stand's front (+z in the source) into the room (-x)", () => {
    const yaw = KATANA_MODEL.frontYaw;
    const front = [Math.sin(yaw), 0, Math.cos(yaw)];
    assert.ok(Math.abs(front[0] + 1) < 1e-9, `front ${front}`);
  });

  it("fits the katanas to the shelf length, uniformly, resting on the board", () => {
    const box = turned(KATANA_MODEL.frontYaw);
    const { scale, offset } = katanaModelFit(box);
    const length = (box.max[2] - box.min[2]) * scale;
    const depth = (box.max[0] - box.min[0]) * scale;
    assert.ok(Math.abs(length - KATANA_MODEL.length) < 1e-9, `${length}`);
    assert.ok(length < KATANA_SHELF.length, "inside the board's length");
    assert.ok(depth < KATANA_SHELF.depth, `depth ${depth}`);
    assert.ok(Math.abs(box.min[1] * scale + offset[1]) < 1e-9, "on the board");
    const middle = ((box.min[2] + box.max[2]) / 2) * scale + offset[2];
    assert.ok(Math.abs(middle) < 1e-9, "centred along the shelf");
    // Its back stays off the wall, its front on the board.
    const back = box.max[0] * scale + offset[0];
    const front = box.min[0] * scale + offset[0];
    assert.ok(back <= 0 && back > -0.05, `back ${back}`);
    assert.ok(front >= -KATANA_SHELF.depth, `front ${front}`);
  });

  it("ships a small meshopt GLB with WebP textures from the pinned source", () => {
    const info = glbInfo("models/wall-katana.glb");
    assert.equal(KATANA_MODEL.url, "/world/models/wall-katana.glb");
    assert.ok(info.bytes < 2_200_000, `bytes ${info.bytes}`);
    assert.equal(info.triangles, 122438, "no geometry dropped");
    assert.ok(info.extensions.includes("EXT_meshopt_compression"));
    assert.ok(info.extensions.includes("EXT_texture_webp"));
    const script = source("scripts/prepare-wall-katana.mjs");
    assert.match(
      script,
      /9197c171c39c29c4bc8a676f439860e49d5c5457e6dffcc30f9530949bf99a60/,
    );
    assert.match(script, /blossom-katana-original\.glb/);
    assert.match(script, /"--instance", "false"/);
  });

  it("credits Mitchell Bekke (CC BY 4.0) with his profile link", () => {
    const credits: Credits & {
      assets: (Credits["assets"][number] & { triangles?: number })[];
    } = JSON.parse(readFileSync(new URL("credits.json", PUBLIC), "utf8"));
    const entry = credits.assets.find(
      (item) => item.file === "models/wall-katana.glb",
    );
    assert.ok(entry, "credited asset");
    assert.equal(entry.author, "Mitchell Bekke");
    assert.equal(entry.license, "CC-BY-4.0");
    assert.equal(
      entry.source,
      "https://sketchfab.com/3d-models/blossom-katana-6cff8d381e2948ef9527d3d99e80520c",
    );
    assert.match(entry.asset, /Blossom Katana/);
    assert.deepEqual(
      entry.sourceFiles.map((file) => [file.bytes, file.sha256]),
      [
        [
          13358436,
          "9197c171c39c29c4bc8a676f439860e49d5c5457e6dffcc30f9530949bf99a60",
        ],
      ],
    );
    const pack = credits.packs.find((item) => item.id === entry.pack);
    assert.equal(pack?.author, "Mitchell Bekke");
    assert.equal(pack?.authorUrl, "https://sketchfab.com/MitchellBekke");
    assert.match(
      pack?.licenseEvidence.quote ?? "",
      /"title": "Blossom Katana"/,
    );
    const world = source("scripts/prepare-world.py");
    const gallery = world.match(/gallery_files = \{([^}]*)\}/)?.[1] ?? "";
    assert.match(gallery, /"models\/wall-katana\.glb"/);
  });
});

describe("katana night light (katana-wall-shelf T4)", () => {
  it("lights the katanas only at night, and only while switched on and powered", () => {
    assert.equal(katanaLightLevel(true, 12), 0);
    assert.equal(katanaLightLevel(true, 21), 1);
    assert.equal(katanaLightLevel(true, 3), 1);
    assert.equal(katanaLightLevel(false, 21), 0);
    assert.equal(katanaLightLevel(true, 21, false), 0);
  });

  it("lights the stand with two case-like spots, one per half (S6, S7)", () => {
    assert.ok(KATANA_LIGHT_POSITION[1] > KATANA_CENTRE[1]);
    assert.ok(KATANA_LIGHT_POSITION[0] < SHELF_INTERIOR_X);
    const { light } = KATANA_SHELF;
    assert.ok(light.out <= 0.25, `arm ${light.out}`);
    assert.equal(KATANA_SPOTS.length, 2);
    const quarter = KATANA_MODEL.length / 4;
    const lux = (from: Vec3, to: Vec3) =>
      light.intensity /
      ((from[0] - to[0]) ** 2 +
        (from[1] - to[1]) ** 2 +
        (from[2] - to[2]) ** 2);
    for (const [index, spot] of KATANA_SPOTS.entries()) {
      const side = index === 0 ? -1 : 1;
      assert.deepEqual(spot.aim, [
        KATANA_CENTRE[0],
        KATANA_CENTRE[1],
        KATANA_CENTRE[2] + side * quarter,
      ]);
      assert.ok(spot.position[1] > spot.aim[1]);
      // The cases' key: ~23 lx on the item it aims at.
      const own = lux(spot.position, spot.aim);
      assert.ok(own >= 20 && own <= 26, `spot ${index}: ${own} lx`);
    }
    // Even along the whole stand: hilts, middle and tips.
    const along = [-2, -1, 0, 1, 2].map((step) => {
      const point: Vec3 = [
        KATANA_CENTRE[0],
        KATANA_CENTRE[1],
        KATANA_CENTRE[2] + (step * KATANA_MODEL.length) / 4,
      ];
      return KATANA_SPOTS.reduce(
        (sum, spot) => sum + lux(spot.position, point),
        0,
      );
    });
    const ratio = Math.max(...along) / Math.min(...along);
    assert.ok(ratio <= 2, `brightest/dimmest ${ratio}`);
    assert.equal(light.penumbra, DISPLAY_CASE.spotPenumbra);
    assert.ok(light.distance <= 1.2, `range ${light.distance}`);
    assert.ok(light.emissive <= DISPLAY_CASE.puckEmissive, "bar glow");
    assert.equal(light.upIntensity, DISPLAY_CASE.upIntensity);
    assert.equal(light.upDistance, DISPLAY_CASE.upDistance);
    assert.ok(KATANA_UPLIGHT_POSITION[1] < KATANA_CENTRE[1]);
    assert.ok(
      KATANA_UPLIGHT_POSITION[0] < SHELF_INTERIOR_X - KATANA_SHELF.depth,
    );
  });

  it("keeps its lights mounted at zero intensity when off", () => {
    const shelf = source("src/components/world/KatanaShelf.tsx");
    assert.match(
      shelf,
      /intensity=\{KATANA_SHELF\.light\.intensity \* level\}/,
    );
    assert.doesNotMatch(shelf, /level > 0 &&\s*<spotLight/);
    assert.match(shelf, /KATANA_SPOTS\.map\(/);
    assert.match(shelf, /displayCaseEnvIntensity\(level, hours\)/);
  });
});

describe("katana inspection and story (katana-wall-shelf T5)", () => {
  it("clicks into inspection like the cases, then toggles the light", () => {
    const shelf = source("src/components/world/KatanaShelf.tsx");
    assert.match(
      shelf,
      /if \(focused\) toggle\(\);\s*else onInspect\?\.\("katana"\)/,
    );
    const scene = source("src/components/world/WorldScene.tsx");
    assert.match(
      scene,
      /<KatanaShelf[\s\S]*?focused=\{galleryCase === "katana"\}/,
    );
    assert.ok(
      KATANA_SHELF_HITBOX.size.every((v) => v > 0),
      "a click target around the shelf",
    );
  });

  it("frames the katanas from the room, level with them", () => {
    const { position, target } = galleryCaseFocus("katana");
    assert.deepEqual(target, KATANA_CENTRE);
    assert.ok(position[0] < SHELF_INTERIOR_X - 1, "inside the room");
    assert.ok(Math.abs(position[1] - target[1]) <= 0.08, "level");
    const sofa = LIVING_MODELS.find((model) => model.kind === "sofa");
    assert.ok(sofa);
    assert.ok(position[0] > HOUSE.main.x0 + 0.3, "not in the left wall");
  });

  it("keeps the whole stand in the free space left of the story card", () => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [1280, 800],
    ]) {
      const aspect = width / height;
      const shift = galleryStoryShift(width, aspect, "katana");
      const { position, target, fov } = galleryCaseFocus("katana", shift);
      const distance = Math.hypot(...target.map((v, i) => v - position[i]));
      const halfWidth =
        distance * Math.tan(((fov / 2) * Math.PI) / 180) * aspect;
      const card =
        width <= STORY_CARD.narrowBelow
          ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
          : STORY_CARD.width + STORY_CARD.inset;
      const free = 2 * halfWidth * (1 - card / width);
      assert.ok(
        free > KATANA_MODEL.length * 1.1,
        `${width}x${height}: ${free} m free for ${KATANA_MODEL.length}`,
      );
    }
  });

  it("tells only what the owner said, with the author's credit link", () => {
    const story = CASE_STORIES.katana;
    assert.ok(story && "credit" in story, "wall story");
    assert.equal(story.title, "Blossom Katana");
    assert.equal(story.kicker, "WALL · KATANA");
    assert.equal(
      story.lede,
      "I love Eastern culture, Japanese culture above all.",
    );
    assert.deepEqual(story.credit, {
      text: "3D model by",
      name: "Mitchell Bekke",
      href: "https://sketchfab.com/MitchellBekke",
    });
    const card = source("src/components/world/CaseStory.tsx");
    assert.match(card, /className="katana-story"/);
    assert.match(card, /href=\{story\.credit\.href\}/);
  });

  it("styles the wall card like the lo-fi console", () => {
    const css = source("src/components/world/katana-story.css");
    assert.match(css, /background: rgb\(9 9 11 \/ 0\.3\)/);
    assert.match(css, /border: 1px solid rgb\(212 212 216 \/ 0\.2\)/);
    assert.match(css, /backdrop-filter: blur\(4px\)/);
    assert.match(css, /border-radius: 12px/);
    assert.match(css, /#10b981/);
    assert.match(css, /ui-monospace/);
    // Same footprint as the case card, so the camera frames left of it.
    assert.match(css, new RegExp(`width: ${STORY_CARD.width}px`));
    assert.match(css, new RegExp(`right: ${STORY_CARD.inset}px`));
    assert.match(css, new RegExp(`width: ${STORY_CARD.narrowWidth}px`));
    assert.match(css, new RegExp(`max-width: ${STORY_CARD.stackBelow}px`));
  });

  it("lists the katana as the fourth object in the compact rail", () => {
    const rail = source("src/components/world/CollectionRail.tsx");
    assert.match(rail, /04 OBJECTS/);
    assert.match(rail, /katana: \{\s*title: "Blossom Katana"/);
  });
});
