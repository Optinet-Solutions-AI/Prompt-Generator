import { describe, it, expect } from 'vitest';
import {
  BRAND_PALETTES,
  BRAND_SCENE_MANDATES,
  buildBrandRules,
} from './_brand-rules';

describe('_brand-rules', () => {
  it('keeps the existing 9 brand palette entries', () => {
    const expected = [
      'FortunePlay','SpinJo','Roosterbet','LuckyVibe','SpinsUp',
      'PlayMojo','Lucky7even','NovaDreams','Rollero',
    ];
    for (const brand of expected) {
      expect(BRAND_PALETTES[brand], `palette for ${brand}`).toBeTruthy();
    }
  });

  it('adds RocketSpin palette and scene mandate', () => {
    expect(BRAND_PALETTES.RocketSpin).toMatch(/champagne gold/i);
    expect(BRAND_PALETTES.RocketSpin).toMatch(/glowing cyan/i);
    expect(BRAND_SCENE_MANDATES.RocketSpin).toMatch(/arc reactor/i);
    expect(BRAND_SCENE_MANDATES.RocketSpin).toMatch(/NEVER Pixar/i);
  });

  it('buildBrandRules returns palette + mandate for known brand', () => {
    const out = buildBrandRules('RocketSpin');
    expect(out.palette).toContain('#D4B26A');
    expect(out.mandate).toContain('arc reactor');
  });

  it('buildBrandRules returns palette null and empty mandate for unknown brand', () => {
    const out = buildBrandRules('NotARealBrand');
    expect(out.palette).toBeNull();
    expect(out.mandate).toBe('');
  });
});
