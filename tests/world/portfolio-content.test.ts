// Portfolio launch (odd/tasks/portfolio-launch.md): /room redirects to
// /world, the 3D world and hotels-cheil are listed as open-source projects,
// and every skill in the stack shows as active.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SIGN_PROFILE } from "../../src/lib/world/garden-sign.ts";
import projects from "../../src/utils/projects.json" with { type: "json" };

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("portfolio launch", () => {
  it("redirects /room to /world and links the homepage to /world (S1)", () => {
    assert.match(source("astro.config.mjs"), /"\/room":\s*"\/world"/);
    assert.ok(
      !existsSync(new URL("../../src/pages/room.astro", import.meta.url)),
      "the room page is replaced by the redirect",
    );
    const home = source("src/pages/index.astro");
    assert.match(home, /href="\/world"/);
    assert.doesNotMatch(home, /href="\/room"/);
  });

  it("lists the 3D world and hotels-cheil as open-source projects (S2, S4)", () => {
    const world = projects.find((p) =>
      p.url.some((u) => u.url === "https://github.com/kevnnard/kevnnard"),
    );
    assert.ok(world, "the 3D world");
    assert.equal(world.isOpenSource, true);
    const worldTags = world.tags.map((t) => t.title);
    for (const tag of ["Three.js", "React Three Fiber", "Astro", "Blender"])
      assert.ok(worldTags.includes(tag), tag);

    const hotels = projects.find((p) =>
      p.url.some((u) => u.url === "https://github.com/kevnnard/hotels-cheil"),
    );
    assert.ok(hotels, "hotels-cheil");
    assert.equal(hotels.isOpenSource, true);
    const hotelTags = hotels.tags.map((t) => t.title);
    for (const tag of ["C#", "ASP.NET Core", "Angular", "Docker"])
      assert.ok(hotelTags.includes(tag), tag);
  });

  it("shows every skill as active and adds the new stack (S3, S4)", () => {
    const skills = source("src/components/page/Skills.astro");
    assert.doesNotMatch(skills, /familiar/, "no dimmed skills left");
    for (const name of [
      "Go",
      "Swift",
      "React Native",
      "C#",
      "ASP.NET Core",
      "Angular",
      "Three.js",
      "React Three Fiber",
      "Blender",
    ])
      assert.match(
        skills,
        new RegExp(`name: "${name.replace(/[.#+]/g, "\\$&")}"`),
        name,
      );
  });

  it("chips Three.js on the garden sign inside the world (S5)", () => {
    assert.ok(SIGN_PROFILE.stack.includes("Three.js"));
  });
});
