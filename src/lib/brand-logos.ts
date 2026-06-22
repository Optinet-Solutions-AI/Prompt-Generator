/**
 * brand-logos.ts — per-brand logo image (PURE, no I/O).
 *
 * Points at the LOCAL scraped brand logo served from
 * /public/brand-references/<slug>/scraped/<file>. Used as the header fallback
 * (when no composite header) and anywhere a bare logo is needed. Empty string
 * falls back to the per-email override, then the styled wordmark text.
 *
 * Note: SVG logos render in browsers/Apple Mail but not Gmail/Outlook — the
 * composite header (brand-headers.ts) is preferred for inbox-safe headers.
 */
const BASE = '/brand-references';

// Brands with a scraped logo on disk (others fall back to a wordmark/override).
const ASSET_BRANDS = ['Roosterbet', 'FortunePlay', 'SpinJo', 'LuckyVibe', 'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero', 'RocketSpin'];

// Most brands expose scraped/logo-1.svg; a couple use a "long" lockup.
const LOGO_FILE: Record<string, string> = {
  novadreams: 'scraped/logo-long.svg',
  rollero: 'scraped/logo-long.svg',
  rocketspin: 'scraped/logo-long.svg', // scraped from rocketspin.com (dark text + cyan icon)
};

export const BRAND_LOGOS: Record<string, string> = Object.fromEntries(
  ASSET_BRANDS.map((b) => {
    const slug = b.toLowerCase();
    return [b, `${BASE}/${slug}/${LOGO_FILE[slug] || 'scraped/logo-1.svg'}`];
  }),
);

const NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_LOGOS).map(([name, url]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), url]),
);

function absolutize(path: string): string {
  if (!path) return '';
  const o = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return o ? `${o}${path}` : path;
}

export function getBrandLogo(brand?: string | null): string {
  if (!brand) return '';
  return absolutize(NORMALIZED[brand.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '');
}
