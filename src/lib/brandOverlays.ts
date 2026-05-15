// Resolves the public URL for a brand's shadow overlay PNG.
// Drop files in public/brand-overlays/<slug>.png — see that folder's README
// for the naming convention.

export function getBrandOverlaySlug(brand: string | undefined | null): string | null {
  if (!brand) return null;
  const slug = brand
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return slug || null;
}

export function getBrandOverlayUrl(brand: string | undefined | null): string | null {
  const slug = getBrandOverlaySlug(brand);
  if (!slug) return null;
  return `/brand-overlays/${slug}.png`;
}
