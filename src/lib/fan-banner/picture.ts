/**
 * Picture framing for the Fan Banner — where the picture sits behind the text,
 * like cropping a photo on a phone: drag it to choose what's kept, zoom in to
 * make the subject bigger, or zoom out until the whole picture fits.
 *
 * Zoom 1 (100%) = the picture just fills the 1200×600 banner. Above 100% part
 * of it is trimmed; below 100% (down to minZoom, "whole picture fits") the
 * banner has empty space, which the drawing fills with the brand's dark colour.
 *
 * The position is stored as a 0–1 share of the difference between picture and
 * banner, on each axis:
 *   panX 0 = picture's left edge on the banner's left edge, 1 = right edge on right edge
 *   panY 0 = picture's top on the banner's top,            1 = bottom on bottom
 *   0.5 / 0.5 = centred.
 * That works the same whether the picture is bigger than the banner (trimmed)
 * or smaller (empty space), and stays valid at any zoom.
 */
import { FAN_H, FAN_W } from './layout';

export interface PictureFraming {
  /** 1 = just fills the banner; 2 = twice as big; below 1 = smaller, with empty space. */
  zoom: number;
  panX: number;
  panY: number;
}

export const CENTERED: PictureFraming = { zoom: 1, panX: 0.5, panY: 0.5 };
export const MAX_ZOOM = 3;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2));

const fillScale = (img: { w: number; h: number }) => Math.max(FAN_W / img.w, FAN_H / img.h);
const fitScale = (img: { w: number; h: number }) => Math.min(FAN_W / img.w, FAN_H / img.h);

/** The smallest zoom: the whole picture fits inside the banner (1 for a 2:1 picture, 0.5 for a square one). */
export function minZoom(img: { w: number; h: number }): number {
  return fitScale(img) / fillScale(img);
}

/** Where to draw the picture (banner pixels) at this framing. */
export function placePicture(img: { w: number; h: number }, framing: PictureFraming): { x: number; y: number; w: number; h: number } {
  const zoom = clamp(framing.zoom, minZoom(img), MAX_ZOOM);
  const scale = fillScale(img) * zoom;
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
 * the edges (the picture's own edges when it's bigger than the banner, the
 * banner's edges when it's smaller), and leaves an axis alone when picture and
 * banner are the same size on it (e.g. sideways on a square picture at 100%).
 */
export function panAfterDrag(img: { w: number; h: number }, framing: PictureFraming, dx: number, dy: number): PictureFraming {
  const { w, h } = placePicture(img, framing);
  const diffX = w - FAN_W; // > 0: picture is wider (trimmed); < 0: narrower (empty space)
  const diffY = h - FAN_H;
  return {
    zoom: framing.zoom,
    panX: Math.abs(diffX) > 0.5 ? clamp(framing.panX - dx / diffX, 0, 1) : framing.panX,
    panY: Math.abs(diffY) > 0.5 ? clamp(framing.panY - dy / diffY, 0, 1) : framing.panY,
  };
}
