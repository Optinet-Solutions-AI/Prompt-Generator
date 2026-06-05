// Slugifies a brand name for use in Drive filenames (cosmetic — download naming).
// Matches the frontend getBrandOverlaySlug logic but is self-contained (api can't
// import from src/). The authoritative brand is stored raw in appProperties.brand.
export function brandSlug(brand: string | undefined | null): string {
  if (!brand) return '';
  return brand
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
