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
import { BRAND_NAMES } from './brand-standards';

const BASE = '/brand-references';

// Most brands expose scraped/logo-1.svg; a couple use a "long" lockup.
const LOGO_FILE: Record<string, string> = {
  novadreams: 'scraped/logo-long.svg',
  rollero: 'scraped/logo-long.svg',
};

export const BRAND_LOGOS: Record<string, string> = Object.fromEntries(
  BRAND_NAMES.map((b) => {
    const slug = b.toLowerCase();
    return [b, `${BASE}/${slug}/${LOGO_FILE[slug] || 'scraped/logo-1.svg'}`];
  }),
);

const NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_LOGOS).map(([name, url]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), url]),
);

export function getBrandLogo(brand?: string | null): string {
  if (!brand) return '';
  return NORMALIZED[brand.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '';
}
