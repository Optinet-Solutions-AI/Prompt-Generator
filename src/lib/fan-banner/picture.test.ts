import { describe, it, expect } from 'vitest';
import { placePicture, panAfterDrag, CENTERED, MAX_ZOOM } from './picture';

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

  it('never leaves an empty gap, whatever the position and zoom', () => {
    for (const img of [SQUARE, WIDE, { w: 600, h: 1400 }]) {
      for (const zoom of [0.2, 1, 1.7, MAX_ZOOM, 99]) {
        for (const pan of [-1, 0, 0.3, 1, 2]) {
          const p = placePicture(img, { zoom, panX: pan, panY: pan });
          expect(coversFrame(p), JSON.stringify({ img, zoom, pan, p })).toBe(true);
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

  it('does not zoom out past "fills the banner", or beyond the maximum', () => {
    expect(placePicture(SQUARE, { ...CENTERED, zoom: 0.5 })).toEqual(placePicture(SQUARE, CENTERED));
    expect(placePicture(SQUARE, { ...CENTERED, zoom: 50 }).w).toBeCloseTo(1200 * MAX_ZOOM);
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

  it('keeps the zoom unchanged', () => {
    expect(panAfterDrag(SQUARE, { zoom: 1.5, panX: 0.5, panY: 0.5 }, 40, 40).zoom).toBe(1.5);
  });
});
