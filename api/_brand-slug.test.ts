import { describe, it, expect } from 'vitest';
import { brandSlug } from './_brand-slug.js';

describe('brandSlug', () => {
  it('lowercases and keeps alphanumerics', () => {
    expect(brandSlug('Roosterbet')).toBe('roosterbet');
    expect(brandSlug('Lucky7even')).toBe('lucky7even');
  });
  it('turns spaces into single dashes', () => {
    expect(brandSlug('Fortune Play')).toBe('fortune-play');
    expect(brandSlug('  Nova   Dreams ')).toBe('nova-dreams');
  });
  it('strips punctuation and symbols', () => {
    expect(brandSlug('Spin&Jo!')).toBe('spinjo');
  });
  it('returns empty string for empty/nullish input', () => {
    expect(brandSlug('')).toBe('');
    expect(brandSlug(undefined)).toBe('');
    expect(brandSlug(null)).toBe('');
  });
});
