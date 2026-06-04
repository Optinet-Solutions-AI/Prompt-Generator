import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  shouldOutpaint,
  buildExtendCanvas,
  buildExtendMask,
  buildExtendPrompt,
  EXTEND_W,
  EXTEND_H,
  BASE_SQUARE,
} from './_outpaint.js';

async function alphaAt(buf: Buffer, x: number, y: number): Promise<number> {
  const raw = await sharp(buf).ensureAlpha()
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw().toBuffer();
  return raw[3]; // RGBA → alpha is the 4th byte
}

describe('_outpaint geometry', () => {
  it('shouldOutpaint: true only for wide ratios (>= 1.7)', () => {
    expect(shouldOutpaint(2.0)).toBe(true);
    expect(shouldOutpaint(1.78)).toBe(true);
    expect(shouldOutpaint(1.5)).toBe(false);
    expect(shouldOutpaint(1.0)).toBe(false);
    expect(shouldOutpaint(NaN)).toBe(false);
  });

  it('canvas is EXTEND_W×EXTEND_H with transparent sides and an opaque centre', async () => {
    const square = await sharp({ create: {
      width: 1024, height: 1024, channels: 4,
      background: { r: 200, g: 0, b: 0, alpha: 255 },
    } }).png().toBuffer();
    const canvas = await buildExtendCanvas(square);
    const meta = await sharp(canvas).metadata();
    expect(meta.width).toBe(EXTEND_W);
    expect(meta.height).toBe(EXTEND_H);
    expect(await alphaAt(canvas, 10, 512)).toBe(0);             // left strip = transparent
    expect(await alphaAt(canvas, EXTEND_W - 10, 512)).toBe(0);  // right strip = transparent
    expect(await alphaAt(canvas, EXTEND_W / 2, 512)).toBe(255); // centre = subject (opaque)
  });

  it('mask keeps the centre opaque and the side strips transparent', async () => {
    const mask = await buildExtendMask();
    expect(await alphaAt(mask, 10, 512)).toBe(0);              // side = edit region
    expect(await alphaAt(mask, EXTEND_W / 2, 512)).toBe(255);  // centre = keep
  });

  it('extend prompt forbids new figures/objects/text and names the brand', () => {
    const p = buildExtendPrompt('Roosterbet');
    expect(p).toMatch(/background/i);
    expect(p).toContain('Roosterbet');
    expect(p).toMatch(/do not add any people/i);
    expect(p).toMatch(/no .*(text|letters)/i);
  });
});
