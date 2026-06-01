import { describe, it, expect } from 'vitest';
import { nearestAspectToken, parseDimensions } from './aspectRatio';

describe('nearestAspectToken', () => {
  it('snaps common banner sizes to the expected token', () => {
    expect(nearestAspectToken(1200, 600)).toBe('2:1');   // email banner
    expect(nearestAspectToken(1080, 1080)).toBe('1:1');  // square
    expect(nearestAspectToken(1080, 1920)).toBe('9:16'); // story
    expect(nearestAspectToken(1920, 1080)).toBe('16:9'); // wide
  });
  it('snaps near-misses to the closest supported token', () => {
    expect(nearestAspectToken(1200, 628)).toBe('2:1');   // 1.91 → closest is 2:1
  });
  it('falls back to 16:9 for invalid input', () => {
    expect(nearestAspectToken(0, 0)).toBe('16:9');
  });
});

describe('parseDimensions', () => {
  it('parses the " × " separator and plain x', () => {
    expect(parseDimensions('1200 × 600')).toEqual({ width: 1200, height: 600 });
    expect(parseDimensions('1200x600')).toEqual({ width: 1200, height: 600 });
  });
  it('returns null for empty/invalid', () => {
    expect(parseDimensions('')).toBeNull();
    expect(parseDimensions('edited')).toBeNull();
    expect(parseDimensions(undefined)).toBeNull();
  });
});
