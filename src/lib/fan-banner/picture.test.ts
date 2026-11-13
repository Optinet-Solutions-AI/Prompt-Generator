import { describe, it, expect } from 'vitest';
import { placePicture, panAfterDrag, minZoom, CENTERED, MAX_ZOOM } from './picture';

const W = 1200;
const H = 600;
const SQUARE = { w: 1024, h: 1024 }; // e.g. a 1:1 library picture
const WIDE = { w: 1600, h: 800 };    // exactly the banner's 2:1 shape

function coversFrame(p: { x: number; y: number; w: number; h: number }) {
  return p.x <= 0.001 && p.y <= 0.001 && p.x + p.w >= W - 0.001 && p.y + p.h >= H - 0.001;
}

describe('placePicture', () => {
  it('centres and fills the banner by default, like before', () => {
    // A square picture fills the 1200px width, so 300px is trimmed top and bottom.
    expect(placePicture(SQUARE, CENTERED)).toEqual({ x: 0, y: -300, w: 1200, h: 1200 });
    expect(placePicture(WIDE, CENTERED)).toEqual({ x: 0, y: 0, w: 1200, h: 600 });
  });

  it('shows the very top of the picture when moved all the way down, and the bottom when moved up', () => {
    expect(placePicture(SQUARE, { ...CENTERED, panY: 0 }).y).toBe(0);
    const bottom = placePicture(SQUARE, { ...CENTERED, panY: 1 });
    expect(bottom.y + bottom.h).toBe(H);
  });

  it('never leaves an empty gap at 100% zoom or more, whatever the position', () => {
    for (const img of [SQUARE, WIDE, { w: 600, h: 1400 }]) {
      for (const zoom of [1, 1.7, MAX_ZOOM, 99]) {
        for (const pan of [-1, 0, 0.3, 1, 2]) {
          const p = placePicture(img, { zoom, panX: pan, panY: pan });
          expect(coversFrame(p), JSON.stringify({ img, zoom, pan, p })).toBe(true);
        }
      }
    }
  });

  it('when zoomed out, keeps the whole picture inside the banner on the side that has room', () => {
    // On each axis the picture either covers the banner or sits fully inside it —
    // never cut off on one side while leaving empty space on the other.
    const axisOk = (pos: number, size: number, frame: number) =>
      (pos <= 0.001 && pos + size >= frame - 0.001) || (pos >= -0.001 && pos + size <= frame + 0.001);
    for (const img of [SQUARE, WIDE, { w: 600, h: 1400 }, { w: 1800, h: 600 }]) {
      for (const zoom of [0, 0.2, 0.5, 0.8, 1]) {
        for (const pan of [-1, 0, 0.3, 1, 2]) {
          const p = placePicture(img, { zoom, panX: pan, panY: pan });
          const ctx = JSON.stringify({ img, zoom, pan, p });
          expect(axisOk(p.x, p.w, W), ctx).toBe(true);
          expect(axisOk(p.y, p.h, H), ctx).toBe(true);
        }
      }
    }
  });

  it('zooming in makes the picture bigger and lets it move sideways', () => {
    const normal = placePicture(SQUARE, CENTERED);
    const zoomed = placePicture(SQUARE, { zoom: 2, panX: 0, panY: 0.5 });
    expect(zoomed.w).toBeCloseTo(normal.w * 2);
    expect(zoomed.x).toBe(0); // panX 0 = left edge of the picture at the banner's left edge
    const right = placePicture(SQUARE, { zoom: 2, panX: 1, panY: 0.5 });
    expect(right.x + right.w).toBeCloseTo(W);
  });

  it('zooms out until the whole picture fits, and no further', () => {
    // Square picture: whole picture visible at 600×600 (50% of "fills the banner").
    expect(minZoom(SQUARE)).toBeCloseTo(0.5);
    expect(placePicture(SQUARE, { zoom: 0.5, panX: 0.5, panY: 0.5 })).toMatchObject({ w: 600, h: 600 });
    expect(placePicture(SQUARE, { zoom: 0.1, panX: 0.5, panY: 0.5 })).toEqual(placePicture(SQUARE, { zoom: 0.5, panX: 0.5, panY: 0.5 }));
    // A 2:1 picture already fits exactly, so it can't zoom out.
    expect(minZoom(WIDE)).toBeCloseTo(1);
    expect(placePicture(SQUARE, { ...CENTERED, zoom: 50 }).w).toBeCloseTo(1200 * MAX_ZOOM);
  });

  it('a zoomed-out picture slides between the left and right edges', () => {
    const left = placePicture(SQUARE, { zoom: 0.5, panX: 0, panY: 0.5 });
    const right = placePicture(SQUARE, { zoom: 0.5, panX: 1, panY: 0.5 });
    expect(left.x).toBe(0);
    expect(right.x + right.w).toBeCloseTo(W);
    expect(left.y).toBe(0); // fits the height exactly
  });
});

describe('panAfterDrag', () => {
  it('moves the picture with the pointer', () => {
    // Square picture at normal zoom: 600px of spare height. Dragging DOWN 150px
    // moves the picture down, showing more of its top: panY 0.5 → 0.25.
    const next = panAfterDrag(SQUARE, CENTERED, 0, 150);
    expect(next.panY).toBeCloseTo(0.25);
    expect(next.panX).toBe(0.5); // no spare width → sideways drag does nothing
  });

  it('stops at the picture edge instead of opening a gap', () => {
    expect(panAfterDrag(SQUARE, CENTERED, 0, 5000).panY).toBe(0);
    expect(panAfterDrag(SQUARE, CENTERED, 0, -5000).panY).toBe(1);
  });

  it('moves sideways once zoomed in', () => {
    const next = panAfterDrag(SQUARE, { zoom: 2, panX: 0.5, panY: 0.5 }, -300, 0);
    expect(next.panX).toBeGreaterThan(0.5); // dragging left reveals more of the right side
  });

  it('moves a zoomed-out picture with the pointer and stops at the banner edges', () => {
    // Square at 50%: 600px picture in a 1200px banner → 600px of room to slide.
    const start = { zoom: 0.5, panX: 0.5, panY: 0.5 };
    expect(panAfterDrag(SQUARE, start, -150, 0).panX).toBeCloseTo(0.25); // drag left → moves left
    expect(panAfterDrag(SQUARE, start, -5000, 0).panX).toBe(0);           // stops at the left edge
    expect(panAfterDrag(SQUARE, start, 5000, 0).panX).toBe(1);            // stops at the right edge
    expect(panAfterDrag(SQUARE, start, 0, 200).panY).toBe(0.5);           // fits the height: no vertical room
  });

  it('keeps the zoom unchanged', () => {
    expect(panAfterDrag(SQUARE, { zoom: 1.5, panX: 0.5, panY: 0.5 }, 40, 40).zoom).toBe(1.5);
  });
});
