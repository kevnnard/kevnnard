import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CASE_STORIES } from "../../src/lib/world/case-stories.ts";
import { DISPLAY_CASES } from "../../src/lib/world/display-cases.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("case story card (collection-display-models T10)", () => {
  it("tells the football helmet's Carneros DC story in the owner's words (T11)", () => {
    const story = CASE_STORIES["football-helmet"];
    assert.ok(story, "football helmet story");
    // Numbered by the rail's room order (katana-wall-shelf T14).
    assert.equal(story.kicker, "CASE 04 · FOOTBALL HELMET");
    assert.equal(story.title, "Carneros DC");
    assert.equal(story.subtitle, "Bogotá, Colombia · Defensive back");
    assert.deepEqual(story.player, {
      number: "#32",
      positions: [
        { code: "FS", label: "Free safety" },
        { code: "SS", label: "Strong safety" },
        { code: "CB", label: "Cornerback" },
      ],
      seasons: 12,
      joined: { date: "2022-01", label: "Jan 2022", team: "Carneros DC" },
    });
    assert.deepEqual(story.timeline, [
      { date: "2014", label: "2014", text: "First season" },
      { date: "2022-01", label: "JAN 2022", text: "Joined Carneros DC" },
      {
        date: "2024-10-26",
        label: "OCT 2024",
        text: "Bogotá Bowl vs USA All-Stars",
      },
      { date: "2026", label: "2026", text: "Season 12" },
    ]);
    // The timeline spans exactly the seasons played.
    const years = story.timeline.map((step) => Number(step.date.slice(0, 4)));
    assert.equal(years.at(-1)! - years[0], story.player?.seasons);
    assert.equal(
      story.lede,
      "Carneros means rams, so this helmet wears gold and black horns. Twelve years in, I line up deep at free or strong safety, or press at cornerback, always as #32.",
    );
    assert.deepEqual(story.link, {
      label: "@carneros_dc on Instagram",
      href: "https://www.instagram.com/carneros_dc/",
    });
  });

  it("shows the owner's photo and game clip above the position, framed (T13)", () => {
    const story = CASE_STORIES["football-helmet"];
    assert.deepEqual(story?.media, [
      {
        kind: "photo",
        src: "/world/stories/carneros-dc-32-photo.jpg",
        alt: "Kevnnard kneeling on the field in the gold Carneros DC helmet and black jersey",
        focus: "50% 22%",
      },
      {
        kind: "clip",
        src: "/world/stories/carneros-dc-32-clip.mp4",
        poster: "/world/stories/carneros-dc-32-clip-poster.jpg",
        alt: "Carneros DC game clip: the black and gold defense on the field in Bogotá",
        focus: "50% 60%",
      },
    ]);
    for (const media of story?.media ?? [])
      if (media.poster)
        assert.ok(
          existsSync(new URL(`../../public${media.poster}`, import.meta.url)),
          media.poster,
        );
    const card = source("src/components/world/CaseStory.tsx");
    assert.match(card, /objectPosition: media\.focus/);
  });

  it("keeps media inside their slot, never over the story (T13)", () => {
    const css = source("src/components/world/case-story.css");
    const block = css.match(/\.case-story-media \{[^}]*\}/)?.[0] ?? "";
    assert.match(block, /height: 160px;/);
    assert.match(block, /grid-template-rows: minmax\(0, 1fr\);/);
    assert.match(block, /overflow: hidden;/);
    assert.match(
      css,
      /\.case-story-media img,\s*\.case-story-media video \{[^}]*min-height: 0;/,
    );
  });

  it("tells the Jordan 1 story in the owner's words, without an image (katana-wall-shelf T13)", () => {
    const story = CASE_STORIES["jordan-1"];
    assert.ok(story && "paragraphs" in story, "wall-style story");
    assert.equal(story.kicker, "CASE 02 · AIR JORDAN 1");
    assert.equal(story.title, "My first Jordans");
    assert.deepEqual(story.paragraphs, [
      "I grew up watching the brand and the player behind it: Michael Jordan, one of the greatest athletes sport has ever seen, simply exceptional at what he did.",
      "The day I bought my first original pair of Jordans, that admiration turned into a passion. Jordan and Nike became my brand for everything: the clothes I wear, the shoes I walk in, the cleats I play in.",
    ]);
    assert.equal(story.image, undefined);
  });

  it("tells the Fox helmet story in the owner's words, without an image (katana-wall-shelf T13)", () => {
    const story = CASE_STORIES["moto-helmet"];
    assert.ok(story && "paragraphs" in story, "wall-style story");
    assert.equal(story.kicker, "CASE 03 · OFF-ROAD HELMET");
    assert.equal(story.title, "Fox V1 · F-A18");
    assert.deepEqual(story.paragraphs, [
      "Ever since I was a kid I wanted my first motorcycle to be a motocross bike, and I dreamed of racing. I never got the chance, but the love for it never left.",
      "So my first helmet was this one, the Fox V1 Sayak. It lives here in my museum corner, where I will keep it for good: a reminder of that kid's dream.",
    ]);
    assert.equal(story.image, undefined);
  });

  it("draws a paragraphs-only card when a story has no image (katana-wall-shelf T13)", () => {
    const card = source("src/components/world/CaseStory.tsx");
    assert.match(card, /story\.image \? \(/);
    assert.match(card, /katana-story-body-text/);
    const css = source("src/components/world/katana-story.css");
    assert.match(
      css,
      /\.katana-story-body\.katana-story-body-text \{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
    );
    // Every case now has a story; only the collection shelf has none yet.
    for (const item of DISPLAY_CASES) assert.ok(CASE_STORIES[item.id], item.id);
  });

  it("invents no story for the collection shelf, still being written (katana-wall-shelf T15)", () => {
    assert.equal(CASE_STORIES["collection-shelf"], null);
  });

  it("ships only real media files, never placeholder slots", () => {
    for (const story of Object.values(CASE_STORIES)) {
      for (const media of story && "media" in story ? story.media : []) {
        assert.match(media.src, /^\/world\/stories\//);
        assert.ok(
          existsSync(new URL(`../../public${media.src}`, import.meta.url)),
          media.src,
        );
        assert.ok(media.alt.trim(), `${media.src} alt text`);
      }
      if (story && "image" in story && story.image) {
        assert.match(story.image.src, /^\/world\/stories\//);
        assert.ok(
          existsSync(
            new URL(`../../public${story.image.src}`, import.meta.url),
          ),
          story.image.src,
        );
        assert.ok(story.image.alt.trim(), `${story.image.src} alt text`);
      }
    }
  });

  it("shows beside the inspected case with the rail, and can be hidden", () => {
    const app = source("src/components/world/WorldApp.tsx");
    // Kept mounted through its exit (card-motion T1).
    assert.match(
      app,
      /const cardsShown =\s*ready && entered && !focus && !portrait && !speakers;/,
    );
    assert.match(
      app,
      /useCardPresence\(\s*cardsShown && galleryCase && caseStory \? galleryCase : null,/,
    );
    assert.match(
      app,
      // Desk things (keyboard-card T1) have product cards, not stories.
      /const caseStory =\s*galleryCase && !isDeskItemId\(galleryCase\)\s*\? CASE_STORIES\[galleryCase\]\s*: null;/,
    );
    assert.match(
      app,
      /<CaseStory[\s\S]*?key=\{card\.key\}[\s\S]*?story=\{card\.value\}/,
    );
    const card = source("src/components/world/CaseStory.tsx");
    assert.match(card, /aria-labelledby="case-story-title"/);
    assert.match(card, /Hide story/);
    assert.match(card, /Show story/);
    assert.match(card, /target="_blank"/);
    assert.match(card, /rel="noopener noreferrer"/);
    assert.match(card, /opens in a new tab/);
    // A clip loops silently, and stays still under reduced motion.
    assert.match(card, /muted/);
    assert.match(card, /playsInline/);
    assert.match(card, /autoPlay=\{!reducedMotion\}/);
    // The revised card (T11): number, position diagram, seasons, timeline.
    assert.match(card, /className="case-story-number"/);
    assert.match(card, /aria-label=\{`Number \$\{/);
    assert.match(card, /role="img"/);
    assert.match(card, /two safeties deep, a cornerback on each side/);
    assert.match(card, /On the field/);
    assert.match(card, /aria-label="My football story"/);
    assert.doesNotMatch(card, /case-story-facts/);
  });

  it("styles the card with the design system's tokens", () => {
    const css = source("src/components/world/case-story.css");
    assert.match(css, /hsl\(var\(--border\)\)/);
    assert.match(css, /hsl\(var\(--background\) \/ 0\.9\)/);
    assert.match(css, /hsl\(var\(--muted-foreground\)\)/);
    assert.match(css, /var\(--radius-xl\)/);
    // The only literal color is the collection's emerald accent.
    const literals = new Set(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []);
    assert.deepEqual([...literals], ["#10b981"]);
    assert.match(css, /outline: 3px solid hsl\(var\(--ring\)\)/);
  });

  it("labels the helmet's rail tab with the team and number", () => {
    const rail = source("src/components/world/CollectionRail.tsx");
    assert.match(rail, /subtitle: "Carneros DC · #32"/);
    assert.doesNotMatch(rail, /Original SpeedFlex-inspired model/);
  });

  it("shows the collection rail as one compact row for every case (T11, T16)", () => {
    const app = source("src/components/world/WorldApp.tsx");
    const railTag = app.match(/<CollectionRail[\s\S]*?\/>/)?.[0] ?? "";
    assert.match(railTag, /\bcompact\b/);
    assert.doesNotMatch(railTag, /compact=\{/, "compact for every item");
    const rail = source("src/components/world/CollectionRail.tsx");
    assert.match(rail, /compact \? \(/);
    assert.match(rail, /05 OBJECTS/);
    assert.doesNotMatch(rail, /04 OBJECTS/);
    assert.match(rail, /collection-rail-compact/);
    const css = source("src/components/world/collection-rail.css");
    assert.match(css, /\.collection-rail-compact \{/);
  });
});
