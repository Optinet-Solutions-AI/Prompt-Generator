import { describe, it, expect } from 'vitest';
import { resolveTargetDims } from './imageDownload';

// resolveTargetDims is the pure size-resolution logic behind exact-dimension
// downloads (e.g. 1200×600 CRM banners). The canvas drawing needs a browser,
// but this math is the part most likely to be wrong, so we test it directly.
describe('resolveTargetDims', () => {
  it('parses an explicit pixel string with the " × " separator', () => {
    expect(resolveTargetDims({ bannerDimensions: '1200 × 600' })).toEqual({ width: 1200, height: 600 });
  });

  it('parses "1200x600" and "1200 x 600" too', () => {
    expect(resolveTargetDims({ bannerDimensions: '1200x600' })).toEqual({ width: 1200, height: 600 });
    expect(resolveTargetDims({ bannerDimensions: '1080 x 1920' })).toEqual({ width: 1080, height: 1920 });
  });

  it('prefers explicit pixels over aspect ratio', () => {
    expect(
      resolveTargetDims({ bannerDimensions: '1200 × 600', aspectRatio: '1:1', sourceWidth: 1024, sourceHeight: 1024 }),
    ).toEqual({ width: 1200, height: 600 });
  });

  it('derives a wider-than-source ratio by keeping full width (no upscaling)', () => {
    // 16:9 (1.778) is wider than a 1536×1024 (1.5) source → keep width, shrink height.
    expect(resolveTargetDims({ aspectRatio: '16:9', sourceWidth: 1536, sourceHeight: 1024 })).toEqual({
      width: 1536,
      height: 864, // round(1536 / (16/9))
    });
  });

  it('derives a taller-than-source ratio by keeping full height', () => {
    // 9:16 (0.5625) is taller than a 1024×1536 (0.667) source → keep height, shrink width.
    expect(resolveTargetDims({ aspectRatio: '9:16', sourceWidth: 1024, sourceHeight: 1536 })).toEqual({
      width: 864, // round(1536 * (9/16))
      height: 1536,
    });
  });

  it('returns null when there is nothing reliable to resize to', () => {
    expect(resolveTargetDims({})).toBeNull();
    expect(resolveTargetDims({ bannerDimensions: '' })).toBeNull();
    expect(resolveTargetDims({ bannerDimensions: 'edited' })).toBeNull();
    expect(resolveTargetDims({ aspectRatio: '16:9' })).toBeNull(); // ratio but no source
    expect(resolveTargetDims({ aspectRatio: 'edited', sourceWidth: 1024, sourceHeight: 1024 })).toBeNull();
  });
});
