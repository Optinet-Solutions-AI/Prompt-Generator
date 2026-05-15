import { describe, it, expect } from 'vitest';
import {
  BRAND_PALETTES,
  BRAND_SCENE_MANDATES,
  buildBrandRules,
} from './_brand-rules';

describe('_brand-rules', () => {
  it('keeps the existing 9 brand palette entries verbatim (distinctive substrings)', () => {
    const distinctive: Record<string, string> = {
      FortunePlay: 'NEVER use blue, purple, cyan, neon, or cold tones',
      SpinJo:      'NEVER use gold, warm amber, orange, or earthy warm tones',
      Roosterbet:  'NEVER use pastel, soft pink, or muted tones',
      LuckyVibe:   'NEVER use cold blue, purple, or neon tones',
      SpinsUp:     'NEVER use muted earthy tones or pastels',
      PlayMojo:    'NEVER use warm gold, pastel, or cheerful bright colors',
      Lucky7even:  'NEVER use flat grey, earthy tones, or muted colors',
      NovaDreams:  'NEVER use warm orange, red, gold, or earthy tones',
      Rollero:     'NEVER use pastel, neon, or soft warm tones',
    };
    for (const [brand, fragment] of Object.entries(distinctive)) {
      expect(BRAND_PALETTES[brand], `palette content for ${brand}`).toContain(fragment);
    }
  });

  it('keeps the existing 3 brand scene mandates verbatim (distinctive substrings)', () => {
    expect(BRAND_SCENE_MANDATES.Roosterbet).toContain('FIRE IS MANDATORY AND MUST ORIGINATE FROM THE PLAYER');
    expect(BRAND_SCENE_MANDATES.FortunePlay).toContain('GOLD IS MANDATORY');
    expect(BRAND_SCENE_MANDATES.LuckyVibe).toContain('BEACH/SUNSET IS MANDATORY');
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
