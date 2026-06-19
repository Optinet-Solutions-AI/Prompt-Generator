/**
 * brand-headers.ts — per-brand composite header image (PURE, no I/O).
 *
 * Points at the LOCAL pre-composited header band (texture + logo + torn edge)
 * served from /public/brand-references/<slug>/email-header.png. This single
 * full-width image is the recommended, email-client-safe header — it renders
 * identically everywhere and gives the clean "logo header" look (no big text).
 */
import { BRAND_NAMES } from './brand-standards';

const BASE = '/brand-references';

// Bucket folders are the lowercased brand name (e.g. "FortunePlay" -> "fortuneplay").
export const BRAND_HEADERS: Record<string, string> = Object.fromEntries(
  BRAND_NAMES.map((b) => [b, `${BASE}/${b.toLowerCase()}/email-header.png`]),
);

const NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_HEADERS).map(([name, url]) => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), url]),
);

export function getBrandHeader(brand?: string | null): string {
  if (!brand) return '';
  return NORMALIZED[brand.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? '';
}
