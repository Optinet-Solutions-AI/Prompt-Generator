# Brand-Encoded Images → Auto Brand-Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp each generated image with its brand (Drive filename + `appProperties.brand`) so the Image Library knows each image's brand and auto-applies the correct brand shadow on download.

**Architecture:** On upload, `generate-image.ts` writes the brand into the Drive file's `appProperties` and prefixes the filename with a brand slug. `list-drive-images.ts` returns that brand; `ImageLibrary.tsx` carries it into the stored image and the default rounded download auto-uses it via the existing `getBrandOverlayUrl` + `downloadImageRounded` overlay path. The manual brand dropdown stays as an override. New images only.

**Tech Stack:** Vercel Node functions (TypeScript), Google Drive API (multipart upload + files.list), React (Image Library), vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-brand-encoded-filenames-design.md`

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `api/_brand-slug.ts` | Pure `brandSlug(brand)` helper (used for the filename prefix). | **New** |
| `api/_brand-slug.test.ts` | Unit tests for `brandSlug`. | **New** |
| `api/generate-image.ts` | `uploadImageToDrive` gains `brand?` → `appProperties.brand`; both upload sites build a brand-prefixed filename and pass `brand`. | **Modify** |
| `api/list-drive-images.ts` | Return `brand` per file from `appProperties.brand` (+ self-contained filename-prefix backup). | **Modify** |
| `src/pages/ImageLibrary.tsx` | `syncFromDrive` carries `brand`; download dropdown gets an auto "this image's brand" item. | **Modify** |

`StoredImage.brand?` already exists in `src/lib/imageStore.ts` and `batchStoreImages` spreads incoming fields — no change there.

---

## Task 1: `brandSlug()` helper

**Files:**
- Create: `api/_brand-slug.ts`
- Test: `api/_brand-slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_brand-slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { brandSlug } from './_brand-slug.js';

describe('brandSlug', () => {
  it('lowercases and keeps alphanumerics', () => {
    expect(brandSlug('Roosterbet')).toBe('roosterbet');
    expect(brandSlug('Lucky7even')).toBe('lucky7even');
  });
  it('turns spaces into single dashes', () => {
    expect(brandSlug('Fortune Play')).toBe('fortune-play');
    expect(brandSlug('  Nova   Dreams ')).toBe('nova-dreams');
  });
  it('strips punctuation and symbols', () => {
    expect(brandSlug('Spin&Jo!')).toBe('spinjo');
  });
  it('returns empty string for empty/nullish input', () => {
    expect(brandSlug('')).toBe('');
    expect(brandSlug(undefined)).toBe('');
    expect(brandSlug(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/_brand-slug.test.ts`
Expected: FAIL — `Cannot find module './_brand-slug.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `api/_brand-slug.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run api/_brand-slug.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_brand-slug.ts api/_brand-slug.test.ts
git commit -m "feat(brand): add brandSlug() helper for Drive filenames"
```

---

## Task 2: Write brand into Drive on upload (`generate-image.ts`)

**Files:**
- Modify: `api/generate-image.ts` (`uploadImageToDrive` ~line 182-188; ChatGPT upload ~line 562-574; Gemini upload ~line 647-658)

- [ ] **Step 1: Import the slug helper**

At the top of `api/generate-image.ts`, with the other imports, add:

```ts
import { brandSlug } from './_brand-slug.js';
```

- [ ] **Step 2: Add `brand` to `uploadImageToDrive`**

Find (~line 182-188):

```ts
async function uploadImageToDrive(params: {
  imageBuffer: Buffer; mimeType: string; filename: string;
  folderId: string; provider: string; aspectRatio: string;
  resolution: string; accessToken: string;
}): Promise<string> {
  const { imageBuffer, mimeType, filename, folderId, provider, aspectRatio, resolution, accessToken } = params;
  const metadata = { name: filename, parents: [folderId], appProperties: { provider, aspectRatio, resolution } };
```

Replace with (adds `brand?` param and conditionally includes it in `appProperties`):

```ts
async function uploadImageToDrive(params: {
  imageBuffer: Buffer; mimeType: string; filename: string;
  folderId: string; provider: string; aspectRatio: string;
  resolution: string; accessToken: string; brand?: string;
}): Promise<string> {
  const { imageBuffer, mimeType, filename, folderId, provider, aspectRatio, resolution, accessToken, brand } = params;
  const appProperties: Record<string, string> = { provider, aspectRatio, resolution };
  if (brand && brand.trim()) appProperties.brand = brand.trim();
  const metadata = { name: filename, parents: [folderId], appProperties };
```

- [ ] **Step 3: Brand-prefix the ChatGPT filename + pass brand**

Find the ChatGPT upload (~line 562-574):

```ts
          const ext      = imageMime.split('/')[1] || 'png';
          const filename = `chatgpt-${Date.now()}.${ext}`;

          const fileId = await uploadImageToDrive({
            imageBuffer,
            mimeType:    imageMime,
            filename,
            folderId,
            provider:    'chatgpt',
            aspectRatio: aspectRatio || '16:9',
            resolution:  resolution  || '1K',
            accessToken,
          });
```

Replace with:

```ts
          const ext      = imageMime.split('/')[1] || 'png';
          const slug     = brandSlug(brand);
          const filename = `${slug ? slug + '-' : ''}chatgpt-${Date.now()}.${ext}`;

          const fileId = await uploadImageToDrive({
            imageBuffer,
            mimeType:    imageMime,
            filename,
            folderId,
            provider:    'chatgpt',
            aspectRatio: aspectRatio || '16:9',
            resolution:  resolution  || '1K',
            accessToken,
            brand,
          });
```

- [ ] **Step 4: Brand-prefix the Gemini filename + pass brand**

Find the Gemini upload (~line 647-658):

```ts
                const ext     = imgMime.split('/')[1] || 'png';

                const geminiFileId = await uploadImageToDrive({
                  imageBuffer: imgBuf,
                  mimeType:    imgMime,
                  filename:    `gemini-${Date.now()}.${ext}`,
                  folderId:    geminiFolder,
                  provider:    'gemini',
                  aspectRatio: aspectRatio || '16:9',
                  resolution:  resolution  || '1K',
                  accessToken: geminiAccessToken,
                });
```

Replace with:

```ts
                const ext     = imgMime.split('/')[1] || 'png';
                const gSlug   = brandSlug(brand);

                const geminiFileId = await uploadImageToDrive({
                  imageBuffer: imgBuf,
                  mimeType:    imgMime,
                  filename:    `${gSlug ? gSlug + '-' : ''}gemini-${Date.now()}.${ext}`,
                  folderId:    geminiFolder,
                  provider:    'gemini',
                  aspectRatio: aspectRatio || '16:9',
                  resolution:  resolution  || '1K',
                  accessToken: geminiAccessToken,
                  brand,
                });
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). `brand` is already destructured from `req.body` earlier in the handler, so it's in scope at both upload sites.

- [ ] **Step 6: Commit**

```bash
git add api/generate-image.ts
git commit -m "feat(brand): write brand to Drive appProperties + filename prefix on upload"
```

---

## Task 3: Return brand from `list-drive-images.ts`

**Files:**
- Modify: `api/list-drive-images.ts` (`DriveFile` interface ~line 14-24; `mapFile` ~line 86-96; merge map ~line 130-138)
- Test: `api/list-drive-images.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `api/list-drive-images.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { brandFromDriveFile } from './list-drive-images.js';

describe('brandFromDriveFile', () => {
  it('prefers appProperties.brand', () => {
    expect(brandFromDriveFile('roosterbet-chatgpt-123.png', { brand: 'Roosterbet' })).toBe('Roosterbet');
  });
  it('falls back to a known slug parsed from the filename prefix', () => {
    expect(brandFromDriveFile('roosterbet-chatgpt-123.png', {})).toBe('Roosterbet');
    expect(brandFromDriveFile('fortuneplay-gemini-9.png', undefined)).toBe('FortunePlay');
  });
  it('returns empty string when there is no brand and no known prefix', () => {
    expect(brandFromDriveFile('chatgpt-123.png', {})).toBe('');
    expect(brandFromDriveFile('gemini-123.png', undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/list-drive-images.test.ts`
Expected: FAIL — `brandFromDriveFile is not a function` / not exported.

- [ ] **Step 3: Add `brand` to the interface and an exported `brandFromDriveFile`**

In `api/list-drive-images.ts`, change the `DriveFile.appProperties` interface (~line 19-23) from:

```ts
  appProperties?: {
    provider?:    string;
    aspectRatio?: string;
    resolution?:  string;
  };
```

to:

```ts
  appProperties?: {
    provider?:    string;
    aspectRatio?: string;
    resolution?:  string;
    brand?:       string;
  };
```

Then add this exported helper near the top of the file (after the `DriveFile` interface). It is self-contained (no imports), per this file's convention. The known-brand list lets a filename-prefix map back to the correctly-cased brand name:

```ts
// The 10 brands in the system, keyed by their slug, for filename-prefix fallback.
const BRAND_BY_SLUG: Record<string, string> = {
  roosterbet: 'Roosterbet', fortuneplay: 'FortunePlay', spinjo: 'SpinJo',
  luckyvibe: 'LuckyVibe', spinsup: 'SpinsUp', playmojo: 'PlayMojo',
  lucky7even: 'Lucky7even', novadreams: 'NovaDreams', rollero: 'Rollero',
  rocketspin: 'RocketSpin',
};

/** Resolve a file's brand: appProperties.brand wins; else parse a known slug prefix. */
export function brandFromDriveFile(
  name: string,
  appProperties?: { brand?: string },
): string {
  if (appProperties?.brand) return appProperties.brand;
  const prefix = (name.split('-')[0] || '').toLowerCase();
  return BRAND_BY_SLUG[prefix] || '';
}
```

- [ ] **Step 4: Use it in `mapFile` and the merge map**

Change `mapFile` (~line 86-96) to include `brand`:

```ts
function mapFile(f: DriveFile, defaultProvider: string) {
  return {
    id:           f.id,
    filename:     f.name,
    created_at:   f.createdTime,
    provider:     f.appProperties?.provider    || defaultProvider,
    aspect_ratio: f.appProperties?.aspectRatio || '16:9',
    resolution:   f.appProperties?.resolution  || '1K',
    brand:        brandFromDriveFile(f.name, f.appProperties),
    public_url:   `https://lh3.googleusercontent.com/d/${f.id}`,
  };
}
```

(The merge map at ~line 133-138 already calls `mapFile(f, provider)`, so it picks up `brand` automatically — no change needed there.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run api/list-drive-images.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add api/list-drive-images.ts api/list-drive-images.test.ts
git commit -m "feat(brand): return brand from list-drive-images (appProperties + filename fallback)"
```

---

## Task 4: Carry brand through the Library + auto-apply the shadow

**Files:**
- Modify: `src/pages/ImageLibrary.tsx` (`syncFromDrive` response type ~line 92-97 + `batchStoreImages` map ~line 111-117; download dropdown ~line 1094-1112)

- [ ] **Step 1: Carry `brand` through `syncFromDrive`**

In `src/pages/ImageLibrary.tsx`, change the `syncFromDrive` response type (~line 92-97) to include `brand`:

```ts
    const data = await res.json() as {
      files: Array<{
        id: string; public_url: string; provider: string;
        aspect_ratio: string; resolution: string; filename: string; created_at: string; brand?: string;
      }>;
    };
```

Then change the `batchStoreImages` mapping (~line 111-117) to pass `brand` through:

```ts
    return batchStoreImages(newFiles.map(f => ({
      public_url:   f.public_url,
      provider:     (f.provider || 'chatgpt').toLowerCase(),
      aspect_ratio: f.aspect_ratio || '16:9',
      resolution:   f.resolution   || '1K',
      filename:     f.filename     || `image-${f.id}.png`,
      brand:        f.brand || undefined,
    })));
```

- [ ] **Step 2: Add an auto "this image's brand" download item**

In the download dropdown (`DropdownMenuContent`, ~line 1094-1112), the image's own brand is `image.brand_name || image.brand`. Add an auto item at the top of the rounded options — between the "no shadow" item and the manual `DropdownMenuSub`. Find:

```tsx
                <DropdownMenuItem onClick={() => handleDownloadRounded(null)} className="gap-2">
                  <Download className="w-4 h-4" /> Rounded corners (no shadow)
                </DropdownMenuItem>
                <DropdownMenuSub>
```

Replace with (adds the auto item, shown only when the image knows its brand):

```tsx
                <DropdownMenuItem onClick={() => handleDownloadRounded(null)} className="gap-2">
                  <Download className="w-4 h-4" /> Rounded corners (no shadow)
                </DropdownMenuItem>
                {(image.brand_name || image.brand) && (
                  <DropdownMenuItem
                    onClick={() => handleDownloadRounded((image.brand_name || image.brand) as string)}
                    className="gap-2 font-medium"
                  >
                    <Download className="w-4 h-4" /> Rounded + {image.brand_name || image.brand} shadow (auto)
                  </DropdownMenuItem>
                )}
                <DropdownMenuSub>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run build`
Expected: built successfully.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ImageLibrary.tsx
git commit -m "feat(brand): carry brand from Drive into Library + auto brand-shadow download item"
```

---

## Task 5: Live verification

**Files:** none (verification only)

- [ ] **Step 1: Deploy**

```bash
git push origin main
```

Wait ~75s for Vercel.

- [ ] **Step 2: Generate a Roosterbet banner and confirm the brand reached Drive**

Run a script that POSTs to the live `/api/generate-prompt` then `/api/generate-image` (provider `gemini`, `brand: 'Roosterbet'`, `aspectRatio: '2:1'`, `bannerDimensions: '1200 × 600'`), then GETs `/api/list-drive-images` and prints the newest file's `filename` and `brand`.
Expected: the newest file's `filename` starts with `roosterbet-` and its `brand` is `"Roosterbet"`.

- [ ] **Step 3: Visual check in the Library (screenshot-driven, per CLAUDE.md)**

Open the live site → Image Library. For the just-generated Roosterbet image, open the download dropdown and confirm:
1. An item reads **"Rounded + Roosterbet shadow (auto)"** (the brand was auto-detected).
2. Clicking it downloads a rounded PNG with the Roosterbet shadow applied — no manual brand pick.
3. The manual "Rounded + brand shadow" submenu still works as an override, and "Rounded corners (no shadow)" still downloads with no overlay.
4. An older image with no brand shows no "(auto)" item — unchanged behavior.

- [ ] **Step 4: Report**

Plain-English summary: brand now travels generation → Drive → Library, the auto-shadow item appears and works, overrides intact, old images unaffected.

---

## Self-Review

**Spec coverage:**
- Encode brand in filename + appProperties → Task 2. ✓
- Auto-apply on default rounded download + keep override → Task 4 Step 2 (auto item added; existing no-shadow + manual-brand submenu kept). ✓
- New images only / old unchanged → no backfill; `brandFromDriveFile` returns '' for un-prefixed old files (Task 3), auto item hidden when no brand (Task 4). ✓
- `appProperties.brand` authoritative; filename parse as backup → Task 3 `brandFromDriveFile`. ✓
- Reuse `getBrandOverlayUrl` + `downloadImageRounded` → unchanged; `handleDownloadRounded` already does this, called with the image's brand. ✓
- Edge cases (empty brand, missing overlay PNG) → empty brand: no prefix/prop + auto item hidden; missing overlay: existing `BrandOverlayMissingError` fallback (unchanged). ✓
- Testing (unit slug + list extraction; live) → Tasks 1, 3, 5. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code.

**Type consistency:** `brandSlug(brand?) : string` (Task 1) used in Task 2. `brandFromDriveFile(name, appProperties?) : string` (Task 3) used in `mapFile`. `brand?` added to `uploadImageToDrive` params (Task 2), `DriveFile.appProperties` (Task 3), `syncFromDrive` response + `batchStoreImages` input (Task 4). `image.brand_name || image.brand` matches the existing `GeneratedImage`/`StoredImage` fields. Consistent throughout.
