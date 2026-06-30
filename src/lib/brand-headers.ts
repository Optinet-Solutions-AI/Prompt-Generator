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

// Logo-FREE texture band (same image without the baked logo card) —
// `email-header-bg.png`. Lets the renderer overlay an editable logo card so the
// logo background becomes customisable while keeping the brand texture.
// (RocketSpin has no band asset, so it's omitted and falls back to the composite.)
const BG_ASSET_BRANDS = ['Roosterbet', 'FortunePlay', 'SpinJo', 'LuckyVibe', 'SpinsUp', 'PlayMojo', 'Lucky7even', 'NovaDreams', 'Rollero'];
export const BRAND_HEADER_BGS: Record<string, string> = Object.fromEntries(
  BG_ASSET_BRANDS.map((b) => [b, `${BASE}/${b.toLowerCase()}/email-header-bg.png`]),
);
const NORMALIZED_BG: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_HEADER_BGS).map(([name, url]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), url]),
);

// Absolutize against the current origin so the image resolves everywhere the
// HTML lands — the inline iframe, a blob: preview tab, the downloaded file, and
// (on the deployed domain) a real sent email. No query string: on Vercel the SPA
// rewrite (everything → index.html) can intercept the query-variant of an asset
// URL and return HTML instead of the PNG (broken image), so we keep the clean
// static path. New deploys still serve fresh pixels on the same path.
function absolutize(path: string): string {
  if (!path) return '';
  const o = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${o}${path}`;
}

export function getBrandHeader(brand?: string | null): string {
  if (!brand) return '';
  return absolutize(NORMALIZED[brand.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '');
}

// The logo-free texture band for this brand (empty if none on disk).
export function getBrandHeaderBg(brand?: string | null): string {
  if (!brand) return '';
  return absolutize(NORMALIZED_BG[brand.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '');
}
