import { GUIDE, type Vec3 } from "./camera.ts";
import {
  DISPLAY_CASE,
  DISPLAY_CASES,
  DISPLAY_LIFT,
  type DisplayItemId,
  ITEM_FLOOR_Y,
} from "./display-cases.ts";

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
 * Only after clicking a case: look from inside the room, over the sofa, at the
 * model's own level (collection-display-models T8), aimed at its centre once
 * lifted off the riser (T9). `shift` slides eye and aim together toward
 * screen right (T12), so the model sits left of an open story card.
 */
export function galleryCaseFocus(
  id: DisplayItemId,
  shift = 0,
): {
  position: Vec3;
  target: Vec3;
  fov: number;
} {
  const item = DISPLAY_CASES.find((caseItem) => caseItem.id === id);
  if (!item) throw new RangeError("Unknown display case");
  const [x, y, z] = item.base;
  const centre =
    y + ITEM_FLOOR_Y + DISPLAY_CASE.itemFit.height / 2 + DISPLAY_LIFT.height;
  // Screen right: the level view direction turned a quarter toward -x.
  const [vx, , vz] = EYE_OFFSET.map((v) => -v);
  const level = Math.hypot(vx, vz);
  const right = [-vz / level, 0, vx / level];
  const slide = right.map((v) => v * shift);
  const target: Vec3 = [x + slide[0], centre, z + slide[2]];
  return {
    target,
    position: [
      target[0] + EYE_OFFSET[0],
      target[1] + EYE_OFFSET[1],
      target[2] + EYE_OFFSET[2],
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
export function galleryStoryShift(width: number, aspect: number): number {
  if (width <= STORY_CARD.stackBelow) return 0;
  const card =
    width <= STORY_CARD.narrowBelow
      ? STORY_CARD.narrowWidth + STORY_CARD.narrowInset
      : STORY_CARD.width + STORY_CARD.inset;
  const distance = Math.hypot(...EYE_OFFSET);
  const halfWidth =
    distance * Math.tan(((GUIDE.fov / 2) * Math.PI) / 180) * aspect;
  return (card / width) * halfWidth;
}
