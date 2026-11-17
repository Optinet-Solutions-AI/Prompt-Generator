import { describe, it, expect } from 'vitest';
import { BRANDS } from '@/types/prompt';
import { BRAND_PALETTES } from './brand-colors';
import { BRAND_STANDARDS } from './brand-standards';
import { BRAND_LOGOS } from './brand-logos';
import { BRAND_SCREEN_HINTS } from './ugc-video';
import { getFanBannerBrand } from './fan-banner/brands';
import { BRAND_KIT_DEFAULTS } from '@/components/sports-wizard/prompt-intelligence';
import { BRAND_LIGHTING_DEFAULTS, BRAND_LIGHTING_REASONS, LIGHTING_TONES } from '@/components/sports-wizard/scene-presets';

// Every brand you can pick in the app's dropdowns must have its look set up
// everywhere it's used — otherwise that brand silently gets generic colours,
// no Sports banner defaults, no video hint, or no Fun Banner style.
describe('every brand in the brand dropdown is fully set up', () => {
  it('includes RocketSpin', () => {
    expect(BRANDS).toContain('RocketSpin');
  });

  it.each([...BRANDS])('%s has colours, Sports banner defaults, a video hint, an email style, a Fun Banner style and a logo', (brand) => {
    expect(BRAND_PALETTES[brand], 'colour rules').toBeTruthy();
    expect(BRAND_KIT_DEFAULTS[brand], 'Sports banner kit colours').toBeTruthy();
    expect(LIGHTING_TONES.map((t) => t.id), 'Sports banner lighting is a real option').toContain(BRAND_LIGHTING_DEFAULTS[brand]);
    expect(BRAND_LIGHTING_REASONS[brand], 'Sports banner lighting tip').toBeTruthy();
    expect(BRAND_SCREEN_HINTS[brand], 'video phone-screen hint').toBeTruthy();
    expect(BRAND_STANDARDS[brand], 'email HTML style').toBeTruthy();
    expect(getFanBannerBrand(brand), 'Fun Banner style').not.toBeNull();
    expect(BRAND_LOGOS[brand], 'logo').toBeTruthy();
  });
});
