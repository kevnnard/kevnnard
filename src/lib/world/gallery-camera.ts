import { GUIDE, type Vec3 } from "./camera.ts";
import { DISPLAY_CASES, type DisplayItemId } from "./display-cases.ts";

/** Only after clicking a case: look from inside the room over the sofa. */
export function galleryCaseFocus(id: DisplayItemId): {
  position: Vec3;
  target: Vec3;
  fov: number;
} {
  const item = DISPLAY_CASES.find((caseItem) => caseItem.id === id);
  if (!item) throw new RangeError("Unknown display case");
  const [x, y, z] = item.base;
  return {
    target: [x, y + 1, z],
    position: [x + 0.25, y + 1.78, z - 1.38],
    fov: GUIDE.fov,
  };
}
