import { describe, it, expect } from 'vitest';
import { brandKit } from './_video-brand';

// The logo for the video corner badge + end card is read from public/ on disk.
describe('brandKit — video logo and end card per brand', () => {
  it.each(['Roosterbet', 'NovaDreams', 'RocketSpin'])('%s has a kit with its logo', async (brand) => {
    const kit = await brandKit(brand, 'http://localhost');
    expect(kit, `${brand} kit`).not.toBeNull();
    expect(kit!.logo?.length ?? 0).toBeGreaterThan(100);
  });

  it("puts RocketSpin's logo on the dark end card with white lettering (its website logo has dark grey text)", async () => {
    const kit = await brandKit('RocketSpin', 'http://localhost');
    const paths = [...kit!.logo!.toString('utf8').matchAll(/<path\b[^>]*>/g)].map(([tag]) => ({
      x: parseFloat(tag.match(/\bd="M\s*([\d.]+)/)?.[1] ?? '0'),
      fill: tag.match(/fill="([^"]+)"/)?.[1]?.toUpperCase(),
    }));
    const lettering = paths.filter((p) => p.x > 24 && p.fill !== '#45B9EA'); // "ROCKET" (SPIN is cyan)
    expect(lettering.length).toBeGreaterThan(0);
    expect(lettering.every((p) => p.fill === '#FFFFFF'), 'ROCKET lettering is white').toBe(true);
    expect(paths.some((p) => p.x <= 24 && p.fill === '#2D2D2D'), 'face icon keeps its dark details').toBe(true);
    expect(paths.some((p) => p.fill === '#45B9EA'), 'cyan parts stay').toBe(true);
  });
});
