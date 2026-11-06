import { GUIDE, type Vec3 } from "./camera.ts";
import {
  DISPLAY_CASE,
  DISPLAY_CASES,
  DISPLAY_LIFT,
  type GalleryItemId,
  ITEM_FLOOR_Y,
} from "./display-cases.ts";
import { KATANA_CENTRE, KATANA_EYE_OFFSET } from "./katana-shelf.ts";

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

/** The inspected model's centre and the eye's offset from it. */
function galleryView(id: GalleryItemId): { centre: Vec3; offset: Vec3 } {
  // The katanas on the wall shelf (katana-wall-shelf T5): static, framed
  // from the room at their own level.
  if (id === "katana")
    return { centre: KATANA_CENTRE, offset: KATANA_EYE_OFFSET };
  const item = DISPLAY_CASES.find((caseItem) => caseItem.id === id);
  if (!item) throw new RangeError("Unknown display case");
  const [x, y, z] = item.base;
  const centre =
    y + ITEM_FLOOR_Y + DISPLAY_CASE.itemFit.height / 2 + DISPLAY_LIFT.height;
  return { centre: [x, centre, z], offset: EYE_OFFSET };
}

/**
 * Only after clicking a case: look from inside the room, over the sofa, at the
 * model's own level (collection-display-models T8), aimed at its centre once
 * lifted off the riser (T9). `shift` slides eye and aim together toward
 * screen right (T12), so the model sits left of an open story card.
 */
export function galleryCaseFocus(
  id: GalleryItemId,
  shift = 0,
): {
  position: Vec3;
  target: Vec3;
  fov: number;
} {
  const { centre, offset } = galleryView(id);
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
    fov: GUIDE.fov,
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
  id: GalleryItemId = "football-helmet",
): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const distance = Math.hypot(...galleryView(id).offset);
  const halfWidth =
    distance * Math.tan(((GUIDE.fov / 2) * Math.PI) / 180) * aspect;
  return (card / width) * halfWidth;
}
