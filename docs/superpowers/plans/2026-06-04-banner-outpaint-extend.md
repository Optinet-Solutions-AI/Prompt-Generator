# Banner Outpaint/Extend Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wide 2:1 email banners never cut the subject by generating the subject as a square, AI-extending the sides with background only, then cropping to the exact size.

**Architecture:** New `api/_outpaint.ts` module owns the geometry (square→wide canvas + mask) and the gpt-image-1 `/images/edits` call. `api/generate-image.ts` gains a wide-banner branch: generate a 1:1 base, call `extendToWide()`, then the existing `resizeToExact()` crops to exact px. On any extend failure it falls back to today's generate+crop. A throwaway spike endpoint proves the outpaint quality on real images BEFORE the pipeline is touched.

**Tech Stack:** Vercel Node functions (TypeScript), `sharp` 0.34, gpt-image-1 (`/v1/images/generations` + `/v1/images/edits`), Node 24 global `fetch`/`FormData`/`Blob`, vitest 4.

**Spec:** `docs/superpowers/specs/2026-06-04-banner-outpaint-extend-design.md`

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `api/_outpaint.ts` | Pure geometry helpers (`shouldOutpaint`, `buildExtendCanvas`, `buildExtendMask`, `buildExtendPrompt`) + `extendToWide()` network call. | **New** |
| `api/_outpaint.test.ts` | Unit tests for geometry + `extendToWide` error/success (mocked fetch). | **New** |
| `api/_spike-outpaint.ts` | Throwaway isolated endpoint: POST `{imageUrl}` → `extendToWide` → return extended image. Deleted after the gate. | **New (temp)** |
| `scripts/spike-outpaint.mjs` | Spike runner: makes square bases via live API, calls the spike endpoint, saves results to `C:/tmp` for visual review. | **New (temp)** |
| `api/generate-image.ts` | Wide-banner branch: square base + `SQUARE_FRAMING` + `extendToWide` + fallback, in both the OpenAI and Cloud Run blocks. | **Modify** |

**Scope note (vs. spec):** the spec listed a square-composition cue in `generate-prompt.ts`. We instead apply square framing in `generate-image.ts` (the `SQUARE_FRAMING` constant in Task 5), keeping the user-facing prompt unchanged. The object-binding "ball in hands" nudge is deferred (YAGNI) — the square base is expected to fix coherence; revisit only if Task 6 still shows a floating object.

---

## Task 1: Geometry helpers in `api/_outpaint.ts`

**Files:**
- Create: `api/_outpaint.ts`
- Test: `api/_outpaint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_outpaint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  shouldOutpaint,
  buildExtendCanvas,
  buildExtendMask,
  buildExtendPrompt,
  EXTEND_W,
  EXTEND_H,
} from './_outpaint.js';

async function alphaAt(buf: Buffer, x: number, y: number): Promise<number> {
  const raw = await sharp(buf).ensureAlpha()
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw().toBuffer();
  return raw[3]; // RGBA → alpha is the 4th byte
}

describe('_outpaint geometry', () => {
  it('shouldOutpaint: true only for wide ratios (>= 1.7)', () => {
    expect(shouldOutpaint(2.0)).toBe(true);
    expect(shouldOutpaint(1.78)).toBe(true);
    expect(shouldOutpaint(1.5)).toBe(false);
    expect(shouldOutpaint(1.0)).toBe(false);
    expect(shouldOutpaint(NaN)).toBe(false);
  });

  it('canvas is EXTEND_W×EXTEND_H with transparent sides and an opaque centre', async () => {
    const square = await sharp({ create: {
      width: 1024, height: 1024, channels: 4,
      background: { r: 200, g: 0, b: 0, alpha: 255 },
    } }).png().toBuffer();
    const canvas = await buildExtendCanvas(square);
    const meta = await sharp(canvas).metadata();
    expect(meta.width).toBe(EXTEND_W);
    expect(meta.height).toBe(EXTEND_H);
    expect(await alphaAt(canvas, 10, 512)).toBe(0);             // left strip = transparent
    expect(await alphaAt(canvas, EXTEND_W - 10, 512)).toBe(0);  // right strip = transparent
    expect(await alphaAt(canvas, EXTEND_W / 2, 512)).toBe(255); // centre = subject (opaque)
  });

  it('mask keeps the centre opaque and the side strips transparent', async () => {
    const mask = await buildExtendMask();
    expect(await alphaAt(mask, 10, 512)).toBe(0);              // side = edit region
    expect(await alphaAt(mask, EXTEND_W / 2, 512)).toBe(255);  // centre = keep
  });

  it('extend prompt forbids new figures/objects/text and names the brand', () => {
    const p = buildExtendPrompt('Roosterbet');
    expect(p).toMatch(/background/i);
    expect(p).toContain('Roosterbet');
    expect(p).toMatch(/do not add any people/i);
    expect(p).toMatch(/no .*(text|letters)/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/_outpaint.test.ts`
Expected: FAIL — `Cannot find module './_outpaint.js'` (file not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `api/_outpaint.ts`:

```ts
import sharp from 'sharp';

// gpt-image-1's edit endpoint only emits its 3 fixed sizes; 1536×1024 is the
// widest. We extend a square subject into this size by outpainting BACKGROUND
// ONLY into the left/right strips, then the caller crops to the exact target.
export const EXTEND_W = 1536;
export const EXTEND_H = 1024;
export const BASE_SQUARE = 1024;
const SIDE = (EXTEND_W - BASE_SQUARE) / 2; // 256px transparent strip each side

// Wide banners (ratio >= 1.7) are the ones whose crop cuts the subject; only
// they need outpainting. Square/portrait keep the fast single-shot path.
export function shouldOutpaint(requestedRatio: number): boolean {
  return Number.isFinite(requestedRatio) && requestedRatio >= 1.7;
}

// Place the square subject centred on a transparent EXTEND_W×EXTEND_H canvas.
// The transparent side strips are what the model will paint into.
export async function buildExtendCanvas(squareBuffer: Buffer): Promise<Buffer> {
  const square = await sharp(squareBuffer)
    .resize(BASE_SQUARE, BASE_SQUARE, { fit: 'cover' })
    .png().toBuffer();
  return sharp({ create: {
    width: EXTEND_W, height: EXTEND_H, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  } })
    .composite([{ input: square, left: SIDE, top: 0 }])
    .png().toBuffer();
}

// Mask for /images/edits: TRANSPARENT areas get regenerated, OPAQUE areas are
// kept. Keep the centre square (opaque), regenerate the side strips (transparent).
export async function buildExtendMask(): Promise<Buffer> {
  const keep = await sharp({ create: {
    width: BASE_SQUARE, height: EXTEND_H, channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 255 },
  } }).png().toBuffer();
  return sharp({ create: {
    width: EXTEND_W, height: EXTEND_H, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  } })
    .composite([{ input: keep, left: SIDE, top: 0 }])
    .png().toBuffer();
}

// Background-only extend instruction. NO new figures/objects/text.
export function buildExtendPrompt(brand: string): string {
  const b = brand ? `${brand} ` : '';
  return `Extend this scene outward to the left and right, filling ONLY the empty side areas with a seamless, photorealistic continuation of the existing background and atmosphere — blurred crowd, arena lighting, sky, depth, and a subtle ${b}brand-colour glow. Do NOT add any people, players, figures, faces, animals, balls, objects, props, text, letters, numbers, logos, or watermarks in the extended areas. Keep the central subject exactly as it is. The result must look like one continuous wide photograph.`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run api/_outpaint.test.ts`
Expected: PASS (4 tests). If the canvas/mask alpha assertions fail, check that `sharp` composited with `channels: 4` (RGBA) — a 3-channel create would have no alpha.

- [ ] **Step 5: Commit**

```bash
git add api/_outpaint.ts api/_outpaint.test.ts
git commit -m "feat(outpaint): square→wide canvas/mask geometry helpers + tests"
```

---

## Task 2: `extendToWide()` network call

**Files:**
- Modify: `api/_outpaint.ts` (append `extendToWide`)
- Modify: `api/_outpaint.test.ts` (append error/success tests)

- [ ] **Step 1: Write the failing test**

Append to `api/_outpaint.test.ts`:

```ts
import { vi, afterEach } from 'vitest';
import { extendToWide } from './_outpaint.js';

afterEach(() => vi.unstubAllGlobals());

async function squareBuf(): Promise<Buffer> {
  return sharp({ create: {
    width: 1024, height: 1024, channels: 4,
    background: { r: 0, g: 100, b: 0, alpha: 255 },
  } }).png().toBuffer();
}

describe('extendToWide', () => {
  it('throws when the edits API returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(
      extendToWide({ squareBuffer: await squareBuf(), brand: 'Roosterbet', openaiKey: 'k' }),
    ).rejects.toThrow(/outpaint edits failed \(500\)/);
  });

  it('returns a decoded buffer at the EXTEND size on success', async () => {
    const fakePng = (await sharp({ create: {
      width: EXTEND_W, height: EXTEND_H, channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 255 },
    } }).png().toBuffer()).toString('base64');
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: fakePng }] }), { status: 200 })));
    const out = await extendToWide({ squareBuffer: await squareBuf(), brand: 'X', openaiKey: 'k' });
    expect(out.width).toBe(EXTEND_W);
    expect(out.height).toBe(EXTEND_H);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(EXTEND_W);
  });
});
```

(`Response`, `FormData`, `Blob` are global in Node 24 — no import needed.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/_outpaint.test.ts`
Expected: FAIL — `extendToWide is not a function` / export missing.

- [ ] **Step 3: Write the minimal implementation**

Append to `api/_outpaint.ts`:

```ts
// Outpaint the square into EXTEND_W×EXTEND_H via gpt-image-1 /images/edits.
// Throws on any failure so the caller can fall back to generate+crop.
export async function extendToWide(params: {
  squareBuffer: Buffer;
  brand: string;
  openaiKey: string;
}): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { squareBuffer, brand, openaiKey } = params;
  const canvas = await buildExtendCanvas(squareBuffer);
  const mask = await buildExtendMask();

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new Blob([new Uint8Array(canvas)], { type: 'image/png' }), 'image.png');
  form.append('mask', new Blob([new Uint8Array(mask)], { type: 'image/png' }), 'mask.png');
  form.append('prompt', buildExtendPrompt(brand));
  form.append('size', `${EXTEND_W}x${EXTEND_H}`);
  form.append('n', '1');
  form.append('quality', 'high');

  const resp = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`outpaint edits failed (${resp.status}): ${t.slice(0, 300)}`);
  }
  const data = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = data.data?.[0];
  let buffer: Buffer;
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    buffer = Buffer.from(await (await fetch(item.url)).arrayBuffer());
  } else {
    throw new Error('outpaint returned no image');
  }
  return { buffer, width: EXTEND_W, height: EXTEND_H };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run api/_outpaint.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add api/_outpaint.ts api/_outpaint.test.ts
git commit -m "feat(outpaint): extendToWide() via gpt-image-1 edits + mocked tests"
```

---

## Task 3: De-risk spike (GATE — visual review before touching the pipeline)

**Files:**
- Create: `api/_spike-outpaint.ts` (temporary, isolated endpoint — deleted in Task 6)
- Create: `scripts/spike-outpaint.mjs` (temporary)

**Goal:** prove on real images that the outpaint blends seamlessly and adds no stray figures, and measure timing — WITHOUT changing the working pipeline. The endpoint is isolated; `generate-image.ts` is untouched.

- [ ] **Step 1: Create the isolated spike endpoint**

Create `api/_spike-outpaint.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extendToWide } from './_outpaint.js';

// TEMPORARY spike endpoint — proves outpaint quality on a real image.
// POST { imageUrl, brand } → returns the extended image as a data URL + timing.
// Delete this file after the gate (Task 6).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { imageUrl, brand } = req.body || {};
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!imageUrl || !openaiKey) {
      return res.status(400).json({ error: 'imageUrl and OPENAI_API_KEY required' });
    }
    const squareBuffer = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
    const t0 = Date.now();
    const out = await extendToWide({ squareBuffer, brand: brand || '', openaiKey });
    const ms = Date.now() - t0;
    return res.status(200).json({
      ms,
      width: out.width,
      height: out.height,
      dataUrl: `data:image/png;base64,${out.buffer.toString('base64')}`,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
```

- [ ] **Step 2: Commit + deploy the spike endpoint**

```bash
git add api/_spike-outpaint.ts
git commit -m "spike: temporary isolated outpaint endpoint for visual gate"
git push origin main
```

Wait ~70s for Vercel to deploy.

- [ ] **Step 3: Create the spike runner**

Create `scripts/spike-outpaint.mjs`:

```js
import { writeFileSync } from 'fs';
import sharp from 'sharp';

const BASE = 'https://prompt-generator-virid-delta.vercel.app';

// Make a SQUARE base via the live generator (aspectRatio 1:1 → resizeToExact crops square).
async function squareBase(ref, provider) {
  const pr = await fetch(`${BASE}/api/generate-prompt`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand: 'Roosterbet', positive_prompt: ref, aspectRatio: '1:1',
      bannerDimensions: '1024 × 1024', theme: '', description: '', subjectPosition: 'Centered' }),
  });
  const prompt = (await pr.json()).prompt || ref;
  const r = await fetch(`${BASE}/api/generate-image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider, aspectRatio: '1:1', bannerDimensions: '1024 × 1024',
      backend: 'cloud-run', resolution: '1K', brand: 'Roosterbet' }),
  });
  return (await r.json()).public_url;
}

const CASES = [
  { tag: 'gpt-dunk',   provider: 'chatgpt', ref: 'A basketball player leaping for a slam dunk, full body, dynamic, arena' },
  { tag: 'gem-keeper', provider: 'gemini',  ref: 'A goalkeeper diving to catch a soccer ball, full body, stadium' },
  { tag: 'gem-rooster',provider: 'gemini',  ref: 'A golden rooster mascot in a tuxedo beside a roulette table in a luxury casino' },
  { tag: 'gpt-runner', provider: 'chatgpt', ref: 'A sprinter exploding off the blocks on a track, full body, stadium' },
];

for (const c of CASES) {
  const sq = await squareBase(c.ref, c.provider);
  if (!sq) { console.log(`${c.tag}: square FAILED`); continue; }
  writeFileSync(`C:/tmp/spike-${c.tag}-square.png`, Buffer.from(await (await fetch(sq)).arrayBuffer()));
  const ex = await fetch(`${BASE}/api/_spike-outpaint`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl: sq, brand: 'Roosterbet' }),
  });
  const j = await ex.json();
  if (!j.dataUrl) { console.log(`${c.tag}: extend FAILED ${JSON.stringify(j).slice(0,160)}`); continue; }
  const wide = Buffer.from(j.dataUrl.split(',')[1], 'base64');
  writeFileSync(`C:/tmp/spike-${c.tag}-wide.png`, wide);
  // Also crop to the real target so we judge the FINAL banner.
  const cropped = await sharp(wide).resize(1200, 600, { fit: 'cover', position: sharp.gravity.north }).png().toBuffer();
  writeFileSync(`C:/tmp/spike-${c.tag}-1200x600.png`, cropped);
  console.log(`${c.tag}: OK (${j.ms}ms, ${j.width}x${j.height})`);
}
```

- [ ] **Step 4: Run the spike**

Run: `node scripts/spike-outpaint.mjs`
Expected: each case prints `OK (<ms>, 1536x1024)`. Files land in `C:/tmp/spike-*`.

- [ ] **Step 5: VISUAL GATE — review with the user**

Open the `C:/tmp/spike-*-wide.png` and `C:/tmp/spike-*-1200x600.png` (use the Read tool to view them) and check:
1. **Seams** — do the painted sides blend into the original square with no visible vertical seam?
2. **Background only** — no stray extra figures, balls, text, or logos in the sides?
3. **Final 1200×600** — subject fully contained, nothing cut?
4. **Timing** — is `ms` comfortably under the Vercel function limit when doubled (base gen + extend)? Note the number.

**STOP. Present the images and findings to the user. Do not proceed to Task 4 until the user confirms the outpaint quality is acceptable.** If seams/quality are bad: try (a) flipping the mask polarity (opaque sides / transparent centre) in `buildExtendMask`, (b) sending only `image` with transparent sides and NO mask, (c) a stronger "seamless continuous photograph" prompt — re-run the spike after each. If still bad, report back and we pivot (the working app is untouched).

---

## Task 4: Compute the outpaint decision once in `generate-image.ts`

**Files:**
- Modify: `api/generate-image.ts` (near the existing `needsCrop`/`genResolution` block, ~line 348-356)

- [ ] **Step 1: Add the import**

At the top of `api/generate-image.ts`, after the existing imports, add:

```ts
import { extendToWide, shouldOutpaint } from './_outpaint.js';
```

- [ ] **Step 2: Compute `doOutpaint` once, in shared scope**

Find this existing block (~line 353-356):

```ts
    const reqRatioForRes = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;
    const needsCrop = exactSizeRequested || reqRatioForRes >= 1.7 || reqRatioForRes <= 0.6;
```

Immediately after it, add:

```ts
    // Outpaint path: wide banners get a SQUARE base + AI side-extend instead of a
    // cropped wide generation, so the subject is never cut. Needs the OpenAI key
    // (the extend uses gpt-image-1 edits). Falls back to generate+crop on failure.
    const doOutpaint = shouldOutpaint(reqRatioForRes) && !!process.env.OPENAI_API_KEY;
    console.log(`[generate-image] doOutpaint=${doOutpaint} (ratio=${reqRatioForRes.toFixed(3)})`);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usage yet, just the decision + import — `extendToWide` is imported but unused will be used in Task 5; if tsc flags unused, proceed — it's used next task. If it errors on unused import, temporarily skip the import line until Task 5).

- [ ] **Step 4: Commit**

```bash
git add api/generate-image.ts
git commit -m "feat(banners): compute doOutpaint decision for wide targets"
```

---

## Task 5: Wire the square base + extend into the OpenAI block

**Files:**
- Modify: `api/generate-image.ts` (OpenAI block, ~line 384-455)

- [ ] **Step 1: Add a SQUARE_FRAMING constant and switch framing for the base**

Find (~line 384-387):

```ts
    const WIDE_FRAMING = reqRatioForRes >= 1.7
      ? ' FRAMING: an ultra-wide, full-length establishing shot. ...nothing touches any edge.'
      : '';
    const finalPrompt = CHATGPT_PREFIX + enrichedPrompt + WIDE_FRAMING + NO_WATERMARKS;
```

Replace the `finalPrompt` line with framing that switches to square when outpainting (the base must be composed for a SQUARE, since the sides are added afterward):

```ts
    // When outpainting, the base is a SQUARE — compose the whole subject inside it
    // with margin; the wide look comes from the side-extend, not from the generation.
    const SQUARE_FRAMING = ' FRAMING: a centred square composition. The ENTIRE subject is fully visible with clear empty margin on all four sides — nothing touches any edge. Keep the background simple and uncluttered around the subject.';
    const framing = doOutpaint ? SQUARE_FRAMING : WIDE_FRAMING;
    const finalPrompt = CHATGPT_PREFIX + enrichedPrompt + framing + NO_WATERMARKS;
```

- [ ] **Step 2: Force a square base size when outpainting**

Find (~line 412-414):

```ts
      const outputSize = SUPPORTED.reduce((best, cur) =>
        Math.abs(cur.ratio - requestedRatio) < Math.abs(best.ratio - requestedRatio) ? cur : best
      ).size;
```

Immediately after it, add:

```ts
      // Outpaint base is always square; the wide size is reached by extendToWide.
      const baseSize = doOutpaint ? '1024x1024' : outputSize;
```

Then change the generation request body (~line 434) from `size: outputSize,` to:

```ts
          size: baseSize,
```

- [ ] **Step 3: Extend after fetching the bytes (with fallback)**

Find the block that decodes the OpenAI image into a buffer (~line 466-477), where `imageBuffer` is assigned from `imageUrl`. Immediately AFTER `imageBuffer` is populated (and before `const exact = await resizeToExact(...)` at ~line 481), insert:

```ts
          // Wide banner: extend the square base sideways so the final crop trims
          // only background, never the subject. On failure, fall back to a fresh
          // wide generation (today's behaviour) — never a hard error.
          if (doOutpaint) {
            try {
              const ext = await extendToWide({ squareBuffer: imageBuffer, brand: brand || '', openaiKey });
              imageBuffer = ext.buffer;
              console.log('[generate-image] outpaint OK (chatgpt)');
            } catch (err) {
              console.error('[generate-image] outpaint failed (chatgpt); regenerating wide', err);
              const fb = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({ model: 'gpt-image-1', prompt: finalPrompt, n: 1, size: outputSize, quality: outputQuality }),
              });
              if (fb.ok) {
                const fbData = await fb.json() as { data?: Array<{ b64_json?: string; url?: string }> };
                const fbItem = fbData.data?.[0];
                if (fbItem?.b64_json) imageBuffer = Buffer.from(fbItem.b64_json, 'base64');
                else if (fbItem?.url) imageBuffer = Buffer.from(await (await fetch(fbItem.url)).arrayBuffer());
              }
            }
          }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Confirm `imageBuffer` is declared with `let` (it is reassigned); if it was `const`, change its declaration to `let`.

- [ ] **Step 5: Commit**

```bash
git add api/generate-image.ts
git commit -m "feat(banners): square base + side-extend in the ChatGPT path, with fallback"
```

---

## Task 6: Wire the square base + extend into the Cloud Run (Gemini) block

**Files:**
- Modify: `api/generate-image.ts` (Cloud Run block, ~line 543-620)

- [ ] **Step 1: Request a square base from Cloud Run when outpainting**

Find (~line 543-544):

```ts
      const reqRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;
      const nativeRatio = nearestImagenRatio(reqRatio);
```

Replace with:

```ts
      const reqRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;
      // Outpaint base is square; otherwise snap to the closest Imagen-native ratio.
      const nativeRatio = doOutpaint ? '1:1' : nearestImagenRatio(reqRatio);
```

- [ ] **Step 2: Extend the fetched bytes before resizeToExact (with fallback)**

Find (~line 616-620):

```ts
                // Crop/resize to the exact requested size before saving, so the
                // stored Drive image and preview match the request (e.g. 1200×600).
                const exact   = await resizeToExact(rawBuf, bannerDimensions, aspectRatio);
                const imgBuf  = exact.buffer;
                const imgMime = exact.resized ? exact.mime : rawMime;
```

Replace with:

```ts
                // Wide banner: extend the square base sideways first, so the crop
                // trims only background. On failure, fall back to cropping the
                // square base (rare — only on outpaint API error).
                let preCrop = rawBuf;
                if (doOutpaint && process.env.OPENAI_API_KEY) {
                  try {
                    const ext = await extendToWide({ squareBuffer: rawBuf, brand: brand || '', openaiKey: process.env.OPENAI_API_KEY });
                    preCrop = ext.buffer;
                    console.log('[generate-image] outpaint OK (gemini)');
                  } catch (err) {
                    console.error('[generate-image] outpaint failed (gemini); cropping square base', err);
                  }
                }
                // Crop/resize to the exact requested size before saving, so the
                // stored Drive image and preview match the request (e.g. 1200×600).
                const exact   = await resizeToExact(preCrop, bannerDimensions, aspectRatio);
                const imgBuf  = exact.buffer;
                const imgMime = exact.resized ? exact.mime : rawMime;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add api/generate-image.ts
git commit -m "feat(banners): square base + side-extend in the Gemini/Cloud Run path"
```

---

## Task 7: Live end-to-end verification + spike cleanup

**Files:**
- Delete: `api/_spike-outpaint.ts`, `scripts/spike-outpaint.mjs`

- [ ] **Step 1: Deploy the integrated pipeline**

```bash
git push origin main
```

Wait ~70s for Vercel.

- [ ] **Step 2: Generate the four regression cases at 2:1**

Run a script (like the spike runner, but hitting `/api/generate-image` with `aspectRatio:'2:1'`, `bannerDimensions:'1200 × 600'`) for: ChatGPT goalkeeper, Gemini goalkeeper, standing casino rooster, basketball dunk. Save each to `C:/tmp/verify-*.png`.

- [ ] **Step 3: View and analyze each (screenshot-driven, per CLAUDE.md)**

Use the Read tool to view each `C:/tmp/verify-*.png`. Confirm for every one:
1. Exactly 1200×600.
2. Subject fully contained — head, hands, feet, ball, rim all inside, nothing clipped at any edge.
3. Extended sides are clean background only (no stray figures/text).
4. Coherent object placement (ball with the player, not floating).
5. Casino rooster did NOT regress (still composed, comb intact).

If any case fails, iterate on `buildExtendPrompt` / `SQUARE_FRAMING` and redeploy. Do NOT declare done until all four pass a visual check.

- [ ] **Step 4: Confirm non-wide sizes still use the fast path**

Generate a `1080 × 1080` (square) and a `1080 × 1920` (portrait) banner. Confirm in the Vercel logs they print `doOutpaint=false` and return as before (no second AI call, unchanged look).

- [ ] **Step 5: Remove the temporary spike artifacts**

```bash
git rm api/_spike-outpaint.ts scripts/spike-outpaint.mjs
git commit -m "chore: remove temporary outpaint spike artifacts"
git push origin main
```

- [ ] **Step 6: Final report**

Summarize in plain English (per the user's end-of-task report preference): what changed, the four verified cases (with the fact they were visually checked), the measured generation time, and the known trade-off (subject is smaller; ~2× time on wide banners only).

---

## Self-Review

**Spec coverage:**
- Square→extend→exact pipeline → Tasks 1, 2, 5, 6. ✓
- Background-only fill → `buildExtendPrompt` (Task 1), asserted in test. ✓
- Trigger only for wide (≥1.7) → `shouldOutpaint` + `doOutpaint` (Tasks 1, 4). ✓
- Both engines → OpenAI block (Task 5) + Cloud Run block (Task 6). ✓
- gpt-image-1 edit size constraint (1536×1024) handled then cropped → `EXTEND_W/H` + existing `resizeToExact`. ✓
- Fallback on extend failure → Task 5 (regenerate wide) + Task 6 (crop square). ✓
- De-risk spike gate BEFORE pipeline change → Task 3 (isolated endpoint, visual gate). ✓
- Square-composition cue → applied as `SQUARE_FRAMING` in `generate-image.ts` (Task 5), not `generate-prompt.ts` — documented scope decision. ✓
- Object-binding nudge → deliberately deferred (YAGNI), noted in File Structure. ✓
- Testing/verification → Tasks 3 (spike) + 7 (live). ✓
- Timeout/perf → measured in Task 3 Step 5; noted. ✓

**Placeholder scan:** No placeholders or malformed code — every step has the exact content to use.

**Type consistency:** `extendToWide({ squareBuffer, brand, openaiKey })` returns `{ buffer, width, height }` — used consistently in Tasks 2, 3, 5, 6. `shouldOutpaint(number): boolean`, `doOutpaint` boolean. `EXTEND_W=1536`, `EXTEND_H=1024` consistent across module, tests, spike, and the verification crop.
