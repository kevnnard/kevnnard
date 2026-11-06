import { GUIDE, type Vec3 } from "./camera.ts";
import { CHERRY_SPOTS } from "./cherry.ts";
import { cherryView } from "./cherry-shot.ts";
import { COFFEE_VIEW } from "./coffee-shot.ts";
import {
  DISPLAY_CASE,
  DISPLAY_CASES,
  DISPLAY_LIFT,
  type GalleryItemId,
  type InspectItemId,
  ITEM_FLOOR_Y,
  isDeskItemId,
} from "./display-cases.ts";
import { KATANA_CENTRE, KATANA_EYE_OFFSET } from "./katana-shelf.ts";
import { KEYBOARD_VIEW } from "./keyboard-shot.ts";
import { SHELF_VIEW } from "./shelf.ts";

/** Eye height above the model's centre: level with it, just over the middle. */
const EYE_LIFT = 0.05;
/** Eye offset from the model in the room: right of it, in front of the sofa. */
const EYE_OFFSET: Vec3 = [0.25, EYE_LIFT, -1.38];

/**
 * The story card's footprint, in CSS pixels (src/components/world/
 * case-story.css): width and right inset, narrower below `narrowBelow`, and
 * stacked above the model at `stackBelow` and under.
 */
export const STORY_CARD = {
  width: 500,
  inset: 32,
  narrowWidth: 420,
  narrowInset: 16,
  narrowBelow: 1100,
  stackBelow: 700,
} as const;

/**
 * The desk keyboard (keyboard-card T1): the end pose of its cinematic
 * product shot (keyboard-shot.ts, T2), a low 3/4 view from the typist's
 * front-left, 0.7 m out and 27 degrees down, beside the chair.
 */
export { KEYBOARD_VIEW };

/** The inspected model's centre, the eye's offset from it and the lens. */
function galleryView(id: GalleryItemId): {
  centre: Vec3;
  offset: Vec3;
  fov: number;
} {
  // The katanas on the wall shelf (katana-wall-shelf T5): static, framed
  // from the room at their own level.
  if (id === "katana")
    return { centre: KATANA_CENTRE, offset: KATANA_EYE_OFFSET, fov: GUIDE.fov };
  // The collection shelf (T15): static, the whole shelf from the room, with
  // a wider lens so the eye stays clear of the sofa and the cases.
  if (id === "collection-shelf") return SHELF_VIEW;
  const item = DISPLAY_CASES.find((caseItem) => caseItem.id === id);
  if (!item) throw new RangeError("Unknown display case");
  const [x, y, z] = item.base;
  const centre =
    y + ITEM_FLOOR_Y + DISPLAY_CASE.itemFit.height / 2 + DISPLAY_LIFT.height;
  return { centre: [x, centre, z], offset: EYE_OFFSET, fov: GUIDE.fov };
}

/**
 * Any inspected thing's view: a gallery item's, a desk thing's, or
 * Cherry's at her first spot (the scene frames her at the day's spot
 * through cherry-shot.ts).
 */
function inspectView(id: InspectItemId): ReturnType<typeof galleryView> {
  if (id === "coffee") return COFFEE_VIEW;
  if (id === "cherry") return cherryView(CHERRY_SPOTS[0]);
  return isDeskItemId(id) ? KEYBOARD_VIEW : galleryView(id);
}

/**
 * Only after clicking a case: look from inside the room, over the sofa, at the
 * model's own level (collection-display-models T8), aimed at its centre once
 * lifted off the riser (T9). `shift` slides eye and aim together toward
 * screen right (T12), so the model sits left of an open story card.
 */
export function galleryCaseFocus(
  id: InspectItemId,
  shift = 0,
): {
  position: Vec3;
  target: Vec3;
  fov: number;
} {
  const { centre, offset, fov } = inspectView(id);
  // Screen right: the level view direction turned a quarter toward -x.
  const [vx, , vz] = offset.map((v) => -v);
  const level = Math.hypot(vx, vz);
  const right = [-vz / level, 0, vx / level];
  const slide = right.map((v) => v * shift);
  const target: Vec3 = [centre[0] + slide[0], centre[1], centre[2] + slide[2]];
  return {
    target,
    position: [
      target[0] + offset[0],
      target[1] + offset[1],
      target[2] + offset[2],
    ],
    fov,
  };
}

/**
 * How far to slide the inspection view (metres) so the model sits at the
 * centre of the screen left of the open story card: the card's share of the
 * width, in the half-width the view spans at the model. Zero once the card
 * stacks above the model.
 */
export function galleryStoryShift(
  width: number,
  aspect: number,
  id: InspectItemId = "football-helmet",
): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const { offset, fov } = inspectView(id);
  const distance = Math.hypot(...offset);
  const halfWidth = distance * Math.tan(((fov / 2) * Math.PI) / 180) * aspect;
  return (card / width) * halfWidth;
}
