// Portfolio launch (odd/tasks/portfolio-launch.md): /room redirects to
// /world, the 3D world and hotels-cheil are listed as open-source projects,
// and every skill in the stack shows as active.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { SIGN_PROFILE } from "../../src/lib/world/garden-sign.ts";
import experience from "../../src/utils/experience.json" with { type: "json" };
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

// Portfolio new projects (odd/tasks/portfolio-new-projects.md).
describe("portfolio new projects", () => {
  const byTitle = (title: string) => projects.find((p) => p.title === title);

  it("lists the seven new repositories, public ones linked (S1, S3)", () => {
    for (const [title, repo] of [
      ["devtrainer", "https://github.com/kevnnard/devtrainer"],
      ["english-teacher", "https://github.com/kevnnard/english-teacher"],
      ["lgswitch", "https://github.com/kevnnard/lgswitch"],
      ["watts", "https://github.com/kevnnard/watts"],
    ]) {
      const project = byTitle(title);
      assert.ok(project, title);
      assert.equal(project.isOpenSource, true, title);
      assert.ok(
        project.url.some((u) => u.url === repo),
        `${title} links ${repo}`,
      );
    }
    for (const title of ["Trading", "watts"]) {
      const project = byTitle(title);
      assert.equal(project?.status, "in_progress", title);
      assert.equal(project?.isWorkInProgress, true, title);
    }
  });

  it("shows private repositories marked private, with no link (S6)", () => {
    for (const title of ["Jarvis", "Trading", "Calls AI"]) {
      const project = byTitle(title);
      assert.ok(project, title);
      assert.ok("isPrivate" in project && project.isPrivate === true, title);
      assert.equal(project.isOpenSource, false, title);
      assert.equal(project.url.length, 0, title);
      assert.ok(project.tags.length > 0, title);
    }
    assert.match(
      source("src/components/page/Projects.astro"),
      /project\.isPrivate/,
    );
  });

  it("adds the new languages and technologies to the stack (S2)", () => {
    const skills = source("src/components/page/Skills.astro");
    const readme = source("README.md");
    for (const name of [
      "Go",
      "Swift",
      "Python",
      "Shell",
      "Bubble Tea",
      "SQLite",
      "WebSocket",
      "Core Audio",
      "Deepgram",
      "Anthropic Claude",
      "FSRS",
      "Homebrew",
      "systemd",
      "Binance API",
    ]) {
      assert.match(skills, new RegExp(`name: "${name}"`), name);
      assert.ok(readme.includes(`![${name}]`), `README ${name}`);
    }
    for (const chip of ["Go", "Swift"])
      assert.ok(SIGN_PROFILE.stack.includes(chip), chip);
  });

  it("keeps only Kevnnard Labs current, as an open source brand (S5)", () => {
    const current = experience.filter((e) => e.isCurrent);
    assert.equal(current.length, 1);
    assert.match(current[0].company, /Kevnnard Labs/);
    assert.match(current[0].description, /open source/);
    assert.match(current[0].description, /does not represent any company/);
    const three = experience.find((e) => e.company === "Three Labs S.A.S.");
    assert.equal(three?.isCurrent, false);
    assert.match(three?.duration ?? "", /August 2026$/);
  });

  it("keeps the README short and points to the portfolio (S4)", () => {
    const readme = source("README.md");
    assert.match(readme, /See all projects/);
    assert.match(readme, /href="https:\/\/kevnnard\.com"/);
    assert.doesNotMatch(readme, /^### Open Source$/m);
    assert.doesNotMatch(readme, /Three_Labs_S\.A\.S\.-Lead/);
  });
});
