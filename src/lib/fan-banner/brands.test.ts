import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_STANDARDS } from '@/lib/brand-standards';
import { FAN_BANNER_BRANDS, getFanBannerBrand, googleFontsHref, fanBannerFilename } from './brands';

describe('fan banner brand styles', () => {
  it('has a style for every brand the app knows about', () => {
    for (const name of Object.keys(BRAND_STANDARDS)) {
      expect(FAN_BANNER_BRANDS[name], `missing fan banner style for ${name}`).toBeDefined();
    }
  });

  it('points every brand at a logo file that exists in public/', () => {
    for (const [name, style] of Object.entries(FAN_BANNER_BRANDS)) {
      const file = path.join(process.cwd(), 'public', style.logo);
      expect(fs.existsSync(file), `${name} logo not found at public${style.logo}`).toBe(true);
    }
  });

  it('finds a brand regardless of capitals or punctuation', () => {
    expect(getFanBannerBrand('spinsup')).toBe(FAN_BANNER_BRANDS.SpinsUp);
    expect(getFanBannerBrand('Rooster.Bet')).toBe(FAN_BANNER_BRANDS.Roosterbet);
    expect(getFanBannerBrand('Fortune Play')).toBe(FAN_BANNER_BRANDS.FortunePlay);
    expect(getFanBannerBrand('Unknown Casino')).toBeNull();
    expect(getFanBannerBrand(undefined)).toBeNull();
  });
});

describe('googleFontsHref', () => {
  it('requests every font family a brand uses, with the weights it needs', () => {
    const href = googleFontsHref(FAN_BANNER_BRANDS.Rollero);
    expect(href.startsWith('https://fonts.googleapis.com/css2?')).toBe(true);
    expect(href).toContain('family=Cinzel:wght@700');
    expect(href).toContain('family=Montserrat:wght@');
    expect(href).toContain('display=swap');
  });

  it('uses the ital,wght form when a brand needs an italic', () => {
    // SpinsUp's coloured line is italic; Google Fonts needs sorted (ital,wght) pairs.
    const href = googleFontsHref(FAN_BANNER_BRANDS.SpinsUp);
    expect(href).toMatch(/family=Poppins:ital,wght@0,\d{3}(;0,\d{3})*;1,800/);
  });

  it('asks for a single-style font without a weight axis', () => {
    // Kaushan Script only exists in one weight; asking for an axis would 400.
    const href = googleFontsHref(FAN_BANNER_BRANDS.Lucky7even);
    expect(href).toContain('family=Kaushan+Script&');
  });
});

describe('fanBannerFilename', () => {
  it('names the file after the brand and offer, at 1200x600', () => {
    expect(fanBannerFilename('SpinsUp', '250%', 'BONUS')).toBe('spinsup-250-bonus-1200x600.png');
    expect(fanBannerFilename('PlayMojo', '€15', '')).toBe('playmojo-15-1200x600.png');
    expect(fanBannerFilename('Rollero', '100', 'Giri gratuiti')).toBe('rollero-100-giri-gratuiti-1200x600.png');
  });
});
