/**
 * Picture framing for the Fan Banner — where the picture sits behind the text,
 * like cropping a photo on a phone: drag it to choose what's kept, zoom to make
 * the subject bigger.
 *
 * The picture always fills the whole 1200×600 banner (no empty gaps), so the
 * position is stored as a 0–1 share of the "spare" picture that doesn't fit:
 *   panX 0 = picture's left edge on the banner's left edge, 1 = right edge on right edge
 *   panY 0 = picture's top on the banner's top,            1 = bottom on bottom
 *   0.5 / 0.5 = centred (the original behaviour).
 * Storing a share instead of pixels keeps the position valid at any zoom.
 */
import { FAN_H, FAN_W } from './layout';

export interface PictureFraming {
  /** 1 = just fills the banner; 2 = twice as big. */
  zoom: number;
  panX: number;
  panY: number;
}

export const CENTERED: PictureFraming = { zoom: 1, panX: 0.5, panY: 0.5 };
export const MAX_ZOOM = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2));

/** Where to draw the picture (banner pixels) so it fills the banner at this framing. */
export function placePicture(img: { w: number; h: number }, framing: PictureFraming): { x: number; y: number; w: number; h: number } {
  const zoom = clamp(framing.zoom, 1, MAX_ZOOM);
  const scale = Math.max(FAN_W / img.w, FAN_H / img.h) * zoom;
  const w = img.w * scale;
  const h = img.h * scale;
  return {
    // "+ 0" turns a -0 (negative × zero) into a plain 0.
    x: (FAN_W - w) * clamp(framing.panX, 0, 1) + 0,
    y: (FAN_H - h) * clamp(framing.panY, 0, 1) + 0,
    w,
    h,
  };
}

/**
 * New framing after the picture is dragged by (dx, dy) banner pixels. Stops at
 * the picture's edges, and leaves an axis alone when there's nothing spare to
 * move (e.g. sideways on a square picture at normal zoom).
 */
export function panAfterDrag(img: { w: number; h: number }, framing: PictureFraming, dx: number, dy: number): PictureFraming {
  const { w, h } = placePicture(img, framing);
  const spareX = w - FAN_W;
  const spareY = h - FAN_H;
  return {
    zoom: framing.zoom,
    panX: spareX > 0.5 ? clamp(framing.panX - dx / spareX, 0, 1) : framing.panX,
    panY: spareY > 0.5 ? clamp(framing.panY - dy / spareY, 0, 1) : framing.panY,
  };
}
