# Brand-Encoded Images → Auto Brand-Shadow — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)
**Author:** Claude (with john@optinetsolutions.com)

## Problem

The Image Library can apply a per-brand "shadow" overlay to rounded-corner downloads
(`brandOverlays.ts` + `downloadImageRounded(...overlayUrl)`). But each image doesn't
carry its own brand: generated images are uploaded to Drive with a generic filename
(`chatgpt-<ts>.png` / `gemini-<ts>.png`) and `appProperties` of only
`{ provider, aspectRatio, resolution }` — no brand. When the Library lists images from
Drive (`list-drive-images` → `syncFromDrive`), the brand is unknown, so the shadow relies
on the user **manually picking a brand** at download time, or falling back to whichever
brand filter is active (which is wrong when browsing "all").

Goal: stamp each generated image with its brand at creation time, so the Library knows
each image's brand and **auto-applies the correct brand shadow** on download.

## Decisions (confirmed with user)

1. **Encode brand in BOTH** the Drive filename (slug prefix, for nicely-named downloads)
   AND `appProperties.brand` (raw brand name, the reliable source the Library reads).
2. **Auto-apply + keep override:** the default "Download (rounded)" auto-uses the image's
   own brand shadow; the existing dropdown stays as an override (another brand, or plain).
3. **New images only:** brand is encoded going forward. Existing Drive images (no brand)
   keep today's behavior (manual pick / active-filter fallback). No backfill.

## Data flow

```
Generation (api/generate-image.ts, both engines — already receive `brand`)
  └─ upload to Drive:
       filename     = `${brandSlug}-${provider}-${ts}.png`   (no prefix if brand empty)
       appProperties= { provider, aspectRatio, resolution, brand }   (brand omitted if empty)
        │
List (api/list-drive-images.ts)
  └─ return brand per file: appProperties.brand  ||  parse filename prefix  ||  ''
        │
Sync (src/pages/ImageLibrary.tsx → syncFromDrive → batchStoreImages)
  └─ carry `brand` into StoredImage.brand  (field already exists)
        │
Download (ImageModal in ImageLibrary.tsx)
  └─ default rounded download uses getBrandOverlayUrl(image.brand) → downloadImageRounded(...overlayUrl)
     dropdown override: pick another brand, or plain (no overlay)
```

## Components & changes

| File | Change |
|---|---|
| `api/_drive-upload.ts` (or wherever `uploadImageToDrive` lives) | Add optional `brand?: string` param; include `brand` in `appProperties` when non-empty. |
| `api/generate-image.ts` | Both engine paths: build `filename` with a brand-slug prefix when `brand` is set; pass `brand` to `uploadImageToDrive`. Add a tiny inline `brandSlug()` (lowercase, spaces→`-`, strip non-alphanumerics) — matches `getBrandOverlaySlug` logic but self-contained (api can't import `src/`). |
| `api/list-drive-images.ts` | Add `brand?` to the `appProperties` interface + the `fields` query already returns appProperties; `mapFile` returns `brand: appProperties.brand ?? parseFromFilename(name) ?? ''`. |
| `src/pages/ImageLibrary.tsx` | `syncFromDrive`: include `brand` in the `batchStoreImages` mapping. Default download path passes `image.brand` to the overlay lookup (auto), keep the override dropdown. |
| `src/lib/imageStore.ts` | No change — `StoredImage.brand?` already exists; `batchStoreImages` already spreads incoming fields. |

**Authoritative brand = `appProperties.brand` (raw string).** The frontend's existing
`getBrandOverlayUrl(brand)` slugifies it to find `/brand-overlays/<slug>.png`. The filename
slug is cosmetic (download naming) and is only a backup parse source in `list-drive-images`.

## Edge cases

- **No/empty brand:** no filename prefix, no `appProperties.brand`; download falls back to
  plain rounded / manual pick (unchanged).
- **Brand has no overlay PNG:** `downloadImageRounded` throws `BrandOverlayMissingError`,
  already caught → silent fallback to plain rounded.
- **Old Drive images:** no brand returned → unchanged behavior.
- **Filename parse backup:** only used if `appProperties.brand` is missing but the filename
  has a known slug prefix; tolerant (returns '' if it can't match a known brand).

## Testing

- **Unit:**
  - `brandSlug()` — "Roosterbet" → "roosterbet", "Lucky7even" → "lucky7even", "" → "".
  - `list-drive-images` brand extraction — appProperties.brand wins; filename-prefix parse as backup; '' when neither.
- **Live (screenshot-driven per CLAUDE.md):**
  1. Generate a Roosterbet banner → confirm the Drive file's filename is `roosterbet-…` and `appProperties.brand === "Roosterbet"` (via `list-drive-images` response).
  2. Open the Image Library → the image's default "Download (rounded)" auto-applies the Roosterbet shadow with **no manual pick**.
  3. Override to "plain / no shadow" → confirms the override still works.
  4. An old image (no brand) → still downloads plain / manual, unchanged.

## Out of scope

- Backfilling brand onto existing Drive images.
- Changing the overlay PNGs or the shadow compositing itself (reuse as-is).
- Per-user scoping of the library (separate concern; library is shared via Drive).

## Golden-rule compliance

- No n8n, no Airtable. Supabase (favorites) + Drive (images) + Vercel + OpenAI/GCP only.
- Generated images still go to the shared Google Drive folder; the Library still lists from Drive.
