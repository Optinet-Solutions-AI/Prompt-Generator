/**
 * brand-headers.ts — per-brand composite header image (PURE, no I/O).
 *
 * Points at the LOCAL pre-composited header band (texture + logo + torn edge)
 * served from /public/brand-references/<slug>/email-header.png. This single
 * full-width image is the recommended, email-client-safe header — it renders
 * identically everywhere and gives the clean "logo header" look (no big text).
 */
const BASE = '/brand-references';

// Brands that actually have a composite header asset on disk. Others (e.g.
// RocketSpin) fall back to a wordmark/logo-override so no broken image shows.
const ASSET_BRANDS = ['Roosterbet', 'FortunePlay', 'SpinJo', 'LuckyVibe', 'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero', 'RocketSpin'];

// Bucket folders are the lowercased brand name (e.g. "FortunePlay" -> "fortuneplay").
export const BRAND_HEADERS: Record<string, string> = Object.fromEntries(
  ASSET_BRANDS.map((b) => [b, `${BASE}/${b.toLowerCase()}/email-header.png`]),
);

const NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_HEADERS).map(([name, url]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), url]),
);

// Bump when a header image's pixels change, so browsers/CDN don't serve a stale
// cached copy (the filename stays the same).
const ASSET_V = '6';

// Absolutize against the current origin so the image resolves everywhere the
// HTML lands — the inline iframe, a blob: preview tab, the downloaded file, and
// (on the deployed domain) a real sent email.
function absolutize(path: string): string {
  if (!path) return '';
  const o = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${o}${path}?v=${ASSET_V}`;
}

export function getBrandHeader(brand?: string | null): string {
  if (!brand) return '';
  return absolutize(NORMALIZED[brand.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '');
}
