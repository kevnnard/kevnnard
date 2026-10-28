// Wheel normalization (T4i), as Bruno Simon's Navigation.js does it through
// the normalize-wheel package (Facebook's fixed-data-table logic). Ported
// here instead of adding the dependency: one notch is about the same zoom on
// every browser, mouse and trackpad.

const PIXEL_STEP = 10;
const LINE_HEIGHT = 40;
const PAGE_HEIGHT = 800;

/** The wheel fields read, legacy ones included (all optional). */
export interface WheelInput {
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  detail?: number;
  wheelDelta?: number;
  wheelDeltaX?: number;
  wheelDeltaY?: number;
  axis?: number;
  HORIZONTAL_AXIS?: number;
}

export interface NormalizedWheel {
  /** Notches, -1 or 1 per click on a legacy mouse. */
  spinX: number;
  spinY: number;
  /** Pixels, positive down and right. */
  pixelX: number;
  pixelY: number;
}

export function normalizeWheel(event: WheelInput): NormalizedWheel {
  let sX = 0;
  let sY = 0;
  if (event.detail !== undefined) sY = event.detail;
  if (event.wheelDelta !== undefined) sY = -event.wheelDelta / 120;
  if (event.wheelDeltaY !== undefined) sY = -event.wheelDeltaY / 120;
  if (event.wheelDeltaX !== undefined) sX = -event.wheelDeltaX / 120;
  // Old Firefox reports horizontal scroll on the vertical field.
  if (
    event.axis !== undefined &&
    event.HORIZONTAL_AXIS !== undefined &&
    event.axis === event.HORIZONTAL_AXIS
  ) {
    sX = sY;
    sY = 0;
  }
  let pX = sX * PIXEL_STEP;
  let pY = sY * PIXEL_STEP;
  if (event.deltaY !== undefined) pY = event.deltaY;
  if (event.deltaX !== undefined) pX = event.deltaX;
  if ((pX || pY) && event.deltaMode) {
    const unit = event.deltaMode === 1 ? LINE_HEIGHT : PAGE_HEIGHT;
    pX *= unit;
    pY *= unit;
  }
  if (pX && !sX) sX = pX < 1 ? -1 : 1;
  if (pY && !sY) sY = pY < 1 ? -1 : 1;
  return { spinX: sX, spinY: sY, pixelX: pX, pixelY: pY };
}

/** Share of the current distance one normalized pixel zooms. */
const ZOOM_PER_PIXEL = 0.0015;

/** Dolly for one wheel event (positive moves in), at most half the distance. */
export function wheelDolly(pixelY: number, distance: number): number {
  const share = Math.min(Math.max(-pixelY * ZOOM_PER_PIXEL, -0.5), 0.5);
  return share * distance;
}
