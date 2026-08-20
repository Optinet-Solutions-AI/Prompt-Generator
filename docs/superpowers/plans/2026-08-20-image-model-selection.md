# Image Model Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move OpenAI image generation to `gpt-image-2`, and give Gemini a two-entry model dropdown (current + latest) that displays the new model's price, so Lena can measure whether the quality gain is worth the cost.

**Architecture:** One registry file holds every image model's id, transport, supported aspect ratios, output mime and token rates. A single helper performs all Gemini image calls (generate, edit, variations) through the Gemini Developer API. Cost is computed from the token usage each API returns, multiplied by the registry's official rates — so the dropdown's headline price and the Cost Tracker's actual figure come from the same numbers and cannot disagree.

**Tech Stack:** Vite + React 18, TypeScript, Vercel serverless API routes (`api/*.ts`), vitest 4, sharp 0.34, shadcn/ui `Select`, Supabase REST, Google Drive.

**Spec:** `docs/superpowers/specs/2026-08-20-image-model-selection-design.md`

## Global Constraints

- **Never auto-commit.** Project rule (CLAUDE.md): after changes, propose the commit message and wait for user approval. The `git commit` steps in this plan are the *proposed* commit — present it, do not run it unattended.
- **Backend/frontend duplication is deliberate.** `api/_*.ts` cannot import from `src/`, and vice versa. `api/_image-models.ts` and `src/lib/image-models.ts` are intentional mirrors, exactly like the existing `api/_pricing.ts` / `src/lib/pricing.ts` pair. Any edit to one MUST be applied to the other.
- **Relative imports inside `api/` use the `.js` extension** (e.g. `from './_pricing.js'`) even though the files are `.ts`. Follow the existing convention.
- **Run tests with** `npm test` (vitest run) or `npx vitest run api/_image-models.test.ts` for one file.
- **`npm run dev` does NOT serve `/api` routes** (except image-proxy). Real model calls only work on a Vercel deploy. Local verification is limited to UI, state and error paths.
- **Preserve all existing functionality.** Default behaviour must be byte-identical until a user actively selects the new model.
- **No invented numbers.** Every rate below is from the official published rate card, captured 2026-08-20. Do not add a model without a verified rate.
- **Verified Gemini aspect ratios (the API rejects anything else):** `1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9`. There is no `2:1`.
- **Verified gpt-image-2 pixel constraints:** both edges multiples of 16, max edge 3840, total pixels between 655,360 and 8,294,400, ratio within 3:1.
- **Developer is a beginner with no coding background.** Write clear comments explaining *why*, not just *what*.

---

## File Structure

**Create:**
- `api/_image-models.ts` — the registry: model ids, transports, ratios, rates. Pure data + lookups, no I/O.
- `api/_image-models.test.ts`
- `src/lib/image-models.ts` — frontend mirror of the registry (dropdown needs labels + prices).
- `api/_gemini-image.ts` — the single Gemini image call used by generate, edit and variations.
- `api/_gemini-image.test.ts`
- `src/components/ImageModelSelect.tsx` — the two-entry dropdown.

**Modify:**
- `api/_pricing.ts` + `src/lib/pricing.ts` — add usage-based image costing.
- `api/_pricing.test.ts` — extend.
- `api/generate-image.ts` — JPEG-preserving resize, OpenAI sizing, Gemini branch, exact cost logging.
- `api/generate-image.test.ts` — extend.
- `api/edit-image.ts`, `api/generate-variations.ts`, `api/generate-variations-imagen.ts`, `api/[action].ts` — model ids.
- `src/components/ResultDisplay.tsx` — dropdown + pass `geminiModel`.
- `src/components/assistant/GeneratedPromptPanel.tsx` — dropdown + pass `geminiModel`.
- `src/components/assistant/CostTrackerPanel.tsx` — group image spend by model.

---

## Task 1: Model registry

**Files:**
- Create: `api/_image-models.ts`
- Create: `api/_image-models.test.ts`
- Create: `src/lib/image-models.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ImageTransport = 'gemini-api' | 'openai' | 'vertex'`
  - `interface ImageModelSpec` (fields below)
  - `IMAGE_MODELS: Record<string, ImageModelSpec>`
  - `DEFAULT_GEMINI_IMAGE_MODEL: string` (`'gemini-2.5-flash-image'`)
  - `OPENAI_IMAGE_MODEL: string` (`'gpt-image-2'`)
  - `getImageModel(id: string): ImageModelSpec | null`
  - `geminiDropdownModels(): ImageModelSpec[]`
  - `resolveGeminiModel(requested: string | undefined): ImageModelSpec`
  - `nearestSupportedRatio(modelId: string, requestedRatio: number): string`

- [ ] **Step 1: Write the failing test**

Create `api/_image-models.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  IMAGE_MODELS,
  DEFAULT_GEMINI_IMAGE_MODEL,
  OPENAI_IMAGE_MODEL,
  getImageModel,
  geminiDropdownModels,
  resolveGeminiModel,
  nearestSupportedRatio,
} from './_image-models.js';

describe('IMAGE_MODELS registry', () => {
  it('pins the current Gemini model as the default so behaviour is unchanged', () => {
    expect(DEFAULT_GEMINI_IMAGE_MODEL).toBe('gemini-2.5-flash-image');
    expect(IMAGE_MODELS[DEFAULT_GEMINI_IMAGE_MODEL].isCurrent).toBe(true);
  });

  it('pins OpenAI to gpt-image-2', () => {
    expect(OPENAI_IMAGE_MODEL).toBe('gpt-image-2');
    expect(IMAGE_MODELS['gpt-image-2'].transport).toBe('openai');
  });

  it('carries the official token rates for gemini-3-pro-image', () => {
    const m = IMAGE_MODELS['gemini-3-pro-image'];
    expect(m.textInputRatePerMillion).toBe(2.00);
    expect(m.imageOutputRatePerMillion).toBe(120.00);
    expect(m.displayPricePerImage).toBe(0.134);
  });

  it('carries the official token rates for the current Gemini model', () => {
    const m = IMAGE_MODELS['gemini-2.5-flash-image'];
    expect(m.textInputRatePerMillion).toBe(0.30);
    expect(m.imageOutputRatePerMillion).toBe(30.00);
    // The current model shows "(current)", never a price.
    expect(m.displayPricePerImage).toBeNull();
  });

  it('carries the official OpenAI rates for both image models', () => {
    expect(IMAGE_MODELS['gpt-image-2'].imageOutputRatePerMillion).toBe(30.00);
    expect(IMAGE_MODELS['gpt-image-2'].textInputRatePerMillion).toBe(5.00);
    // gpt-image-1 is kept ONLY so already-logged historical rows still price.
    expect(IMAGE_MODELS['gpt-image-1'].imageOutputRatePerMillion).toBe(40.00);
  });

  it('every entry has a rate, a source and a verification date', () => {
    for (const [id, m] of Object.entries(IMAGE_MODELS)) {
      expect(m.id, id).toBe(id);
      expect(m.imageOutputRatePerMillion, id).toBeGreaterThan(0);
      expect(m.textInputRatePerMillion, id).toBeGreaterThan(0);
      expect(m.rateSource, id).toBeTruthy();
      expect(m.lastVerified, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.outputMime, id).toMatch(/^image\/(jpeg|png)$/);
    }
  });

  it('exposes exactly two Gemini models in the dropdown, current first', () => {
    const d = geminiDropdownModels();
    expect(d.map(m => m.id)).toEqual(['gemini-2.5-flash-image', 'gemini-3-pro-image']);
  });

  it('keeps gemini-3.1-flash-image available but hidden from the dropdown', () => {
    expect(IMAGE_MODELS['gemini-3.1-flash-image'].inDropdown).toBe(false);
    expect(IMAGE_MODELS['gemini-3.1-flash-image'].imageOutputRatePerMillion).toBe(60.00);
  });

  it('has exactly one model flagged isCurrent', () => {
    expect(Object.values(IMAGE_MODELS).filter(m => m.isCurrent)).toHaveLength(1);
  });
});

describe('getImageModel', () => {
  it('returns the spec for a known id', () => {
    expect(getImageModel('gemini-3-pro-image')?.label).toBe('3 Pro Image');
  });

  it('returns null for an unknown id rather than guessing', () => {
    expect(getImageModel('gemini-99-imaginary')).toBeNull();
  });
});

describe('resolveGeminiModel', () => {
  it('falls back to the current model when nothing is requested', () => {
    expect(resolveGeminiModel(undefined).id).toBe('gemini-2.5-flash-image');
  });

  it('falls back to the current model when an unknown id is requested', () => {
    expect(resolveGeminiModel('gemini-99-imaginary').id).toBe('gemini-2.5-flash-image');
  });

  it('honours a valid requested id', () => {
    expect(resolveGeminiModel('gemini-3-pro-image').id).toBe('gemini-3-pro-image');
  });

  it('refuses an OpenAI id on the Gemini path', () => {
    expect(resolveGeminiModel('gpt-image-2').id).toBe('gemini-2.5-flash-image');
  });
});

describe('nearestSupportedRatio', () => {
  // The Gemini API has NO 2:1. Distance from 2.0: 16:9 = 0.222, 21:9 = 0.333.
  // So a 2:1 email banner must snap to 16:9, not 21:9.
  it('snaps a 2:1 banner to 16:9', () => {
    expect(nearestSupportedRatio('gemini-3-pro-image', 2)).toBe('16:9');
  });

  it('returns an exact match unchanged', () => {
    expect(nearestSupportedRatio('gemini-3-pro-image', 1)).toBe('1:1');
    expect(nearestSupportedRatio('gemini-3-pro-image', 16 / 9)).toBe('16:9');
  });

  it('snaps a tall portrait to 9:16', () => {
    expect(nearestSupportedRatio('gemini-3-pro-image', 0.56)).toBe('9:16');
  });

  it('never returns a ratio the API rejects', () => {
    const allowed = IMAGE_MODELS['gemini-3-pro-image'].supportedAspectRatios;
    for (const r of [0.1, 0.5, 1, 1.5, 2, 2.4, 5, 9]) {
      expect(allowed).toContain(nearestSupportedRatio('gemini-3-pro-image', r));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_image-models.test.ts`
Expected: FAIL — `Failed to resolve import "./_image-models.js"`

- [ ] **Step 3: Write the registry**

Create `api/_image-models.ts`:

```ts
// Single source of truth for IMAGE generation models.
//
// KEEP IN SYNC with src/lib/image-models.ts. The two files duplicate the same
// constants so the backend (choosing a model, costing a call) and the frontend
// (the dropdown label + price) agree without importing across the api/src
// boundary. This mirrors the existing _pricing.ts / pricing.ts pair.
//
// Every rate below is from the official published rate card, captured
// 2026-08-20 and confirmed by real API calls. Do NOT add a model without a
// verified rate — a wrong number here silently misleads the cost comparison
// this whole feature exists to support.

export type ImageTransport =
  | 'gemini-api'   // generativelanguage.googleapis.com, auth via GEMINI_API_KEY
  | 'openai'       // api.openai.com, auth via OPENAI_API_KEY
  | 'vertex';      // *-aiplatform.googleapis.com, auth via GCP workload identity

export interface ImageModelSpec {
  /** Literal model id sent to the API. */
  id: string;
  /** Short human label for the dropdown. */
  label: string;
  transport: ImageTransport;
  /** The model in use before this feature. Shows "(current)", never a price. */
  isCurrent: boolean;
  /** false = usable via the registry but not offered in the UI. */
  inDropdown: boolean;
  /**
   * Aspect ratio tokens the API accepts. For Gemini this list is exhaustive —
   * the API returns 400 INVALID_ARGUMENT for anything else. Empty for OpenAI,
   * which takes explicit pixel sizes instead (see pickOpenAiImageSize).
   */
  supportedAspectRatios: string[];
  /** What the API actually returns. Gemini image models return JPEG. */
  outputMime: 'image/jpeg' | 'image/png';
  textInputRatePerMillion: number;
  imageOutputRatePerMillion: number;
  /**
   * Headline price shown in the dropdown, from the official rate card.
   * null = do not show a price (the current model, and models not offered).
   */
  displayPricePerImage: number | null;
  rateSource: string;
  lastVerified: string;
}

/** The 14 aspect ratios the Gemini image API accepts. Note: NO 2:1. */
const GEMINI_RATIOS = [
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1',
  '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9',
];

export const IMAGE_MODELS: Record<string, ImageModelSpec> = {
  // ── Gemini ────────────────────────────────────────────────────────────
  'gemini-2.5-flash-image': {
    id: 'gemini-2.5-flash-image',
    label: '2.5 Flash Image',
    transport: 'vertex',          // keeps the existing, already-tuned code path
    isCurrent: true,
    inDropdown: true,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/jpeg',
    textInputRatePerMillion: 0.30,
    imageOutputRatePerMillion: 30.00,
    displayPricePerImage: null,   // "(current)" — no price shown
    rateSource: 'ai.google.dev/gemini-api/docs/pricing ($0.039/image, 1290 tokens @ $30/M)',
    lastVerified: '2026-08-20',
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    label: '3 Pro Image',
    transport: 'gemini-api',
    isCurrent: false,
    inDropdown: true,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/jpeg',
    textInputRatePerMillion: 2.00,
    imageOutputRatePerMillion: 120.00,
    displayPricePerImage: 0.134,  // official: $0.134 per 1K/2K image
    rateSource: 'ai.google.dev/gemini-api/docs/pricing ($0.134 per 1K/2K, $0.24 per 4K)',
    lastVerified: '2026-08-20',
  },
  // Available but hidden. If 3 Pro is judged not worth 3.4x, flip inDropdown
  // to true here and this becomes the middle option — no other code changes.
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    label: '3.1 Flash Image',
    transport: 'gemini-api',
    isCurrent: false,
    inDropdown: false,
    supportedAspectRatios: GEMINI_RATIOS,
    outputMime: 'image/jpeg',
    textInputRatePerMillion: 0.50,
    imageOutputRatePerMillion: 60.00,
    displayPricePerImage: 0.101,  // official: $0.067 @1K, $0.101 @2K, $0.151 @4K
    rateSource: 'ai.google.dev/gemini-api/docs/pricing',
    lastVerified: '2026-08-20',
  },

  // ── OpenAI ────────────────────────────────────────────────────────────
  'gpt-image-2': {
    id: 'gpt-image-2',
    label: 'GPT Image 2',
    transport: 'openai',
    isCurrent: false,
    inDropdown: false,            // OpenAI is pinned, not user-selectable
    supportedAspectRatios: [],    // uses explicit pixel sizes instead
    outputMime: 'image/png',
    textInputRatePerMillion: 5.00,
    imageOutputRatePerMillion: 30.00,
    displayPricePerImage: null,
    rateSource: 'developers.openai.com/api/docs/pricing',
    lastVerified: '2026-08-20',
  },
  // Retained ONLY so historical assistant_image_gens rows still price correctly.
  // Not selectable and not used for new generations.
  'gpt-image-1': {
    id: 'gpt-image-1',
    label: 'GPT Image 1 (retired)',
    transport: 'openai',
    isCurrent: false,
    inDropdown: false,
    supportedAspectRatios: [],
    outputMime: 'image/png',
    textInputRatePerMillion: 5.00,
    imageOutputRatePerMillion: 40.00,
    displayPricePerImage: null,
    rateSource: 'developers.openai.com/api/docs/pricing',
    lastVerified: '2026-08-20',
  },
};

export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';

export function getImageModel(id: string): ImageModelSpec | null {
  return IMAGE_MODELS[id] ?? null;
}

/** The Gemini models offered in the UI, current model first. */
export function geminiDropdownModels(): ImageModelSpec[] {
  return Object.values(IMAGE_MODELS)
    .filter(m => m.inDropdown && m.transport !== 'openai')
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
}

/**
 * Turn a possibly-missing, possibly-bogus requested model id into a real
 * Gemini spec. Anything unrecognised (or an OpenAI id sent by mistake) falls
 * back to the current model, so a bad request can never change what the user
 * is billed for without them choosing it.
 */
export function resolveGeminiModel(requested: string | undefined): ImageModelSpec {
  const m = requested ? IMAGE_MODELS[requested] : undefined;
  if (m && m.transport !== 'openai') return m;
  return IMAGE_MODELS[DEFAULT_GEMINI_IMAGE_MODEL];
}

/** Parse "16:9" → 1.777… */
function ratioValue(token: string): number {
  const [w, h] = token.split(':').map(Number);
  return w / h;
}

/**
 * Snap any requested ratio to the closest one the model actually accepts.
 * Sending an unsupported ratio makes the Gemini API return 400, and sending a
 * far-off one means resizeToExact has to mirror-extend a large gap. A 2:1
 * banner lands on 16:9 (distance 0.222) rather than 21:9 (0.333).
 */
export function nearestSupportedRatio(modelId: string, requestedRatio: number): string {
  const spec = getImageModel(modelId);
  const list = spec?.supportedAspectRatios?.length ? spec.supportedAspectRatios : GEMINI_RATIOS;
  return list.reduce((best, cur) =>
    Math.abs(ratioValue(cur) - requestedRatio) < Math.abs(ratioValue(best) - requestedRatio)
      ? cur
      : best
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_image-models.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Create the frontend mirror**

Create `src/lib/image-models.ts` with the **identical** content as `api/_image-models.ts`, changing only the header comment to say `KEEP IN SYNC with api/_image-models.ts`. The frontend needs `geminiDropdownModels()`, `DEFAULT_GEMINI_IMAGE_MODEL` and the labels/prices for the dropdown.

Verify it compiles:

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `image-models`

- [ ] **Step 6: Commit (propose — do not run unattended)**

```bash
git add api/_image-models.ts api/_image-models.test.ts src/lib/image-models.ts
git commit -m "feat: add image model registry with official token rates"
```

---

## Task 2: Usage-based image costing

**Files:**
- Modify: `api/_pricing.ts` (append; leave existing exports untouched)
- Modify: `src/lib/pricing.ts` (same append)
- Test: `api/_pricing.test.ts` (append a new describe block)

**Interfaces:**
- Consumes: `IMAGE_MODELS` from Task 1.
- Produces:
  - `interface ImageUsage { text_input_tokens: number; image_output_tokens: number }`
  - `computeImageCostFromUsage(modelId: string, usage: ImageUsage): number | null`

- [ ] **Step 1: Write the failing test**

Append to `api/_pricing.test.ts`:

```ts
import { computeImageCostFromUsage } from './_pricing.js';

describe('computeImageCostFromUsage', () => {
  // These two assertions are the whole point of usage-based costing: token
  // count x official rate reproduces Google's own published per-image price.
  it('reproduces the published $0.134 for gemini-3-pro-image', () => {
    const cost = computeImageCostFromUsage('gemini-3-pro-image', {
      text_input_tokens: 10,
      image_output_tokens: 1120,
    });
    // 10 * 2.00/1M + 1120 * 120.00/1M = 0.00002 + 0.1344 = 0.13442
    expect(cost).toBeCloseTo(0.13442, 5);
  });

  it('reproduces the published $0.101 for gemini-3.1-flash-image at 2K', () => {
    const cost = computeImageCostFromUsage('gemini-3.1-flash-image', {
      text_input_tokens: 10,
      image_output_tokens: 1680,
    });
    // 10 * 0.50/1M + 1680 * 60.00/1M = 0.000005 + 0.1008
    expect(cost).toBeCloseTo(0.100805, 6);
  });

  it('computes the measured gpt-image-2 high-quality banner cost', () => {
    const cost = computeImageCostFromUsage('gpt-image-2', {
      text_input_tokens: 15,
      image_output_tokens: 4720,
    });
    // 15 * 5.00/1M + 4720 * 30.00/1M = 0.000075 + 0.1416 = 0.141675
    expect(cost).toBeCloseTo(0.141675, 6);
  });

  it('computes the measured gpt-image-1 baseline so old rows still price', () => {
    const cost = computeImageCostFromUsage('gpt-image-1', {
      text_input_tokens: 15,
      image_output_tokens: 6208,
    });
    // 15 * 5.00/1M + 6208 * 40.00/1M = 0.000075 + 0.24832
    expect(cost).toBeCloseTo(0.248395, 6);
  });

  it('returns null for an unknown model rather than guessing a rate', () => {
    expect(computeImageCostFromUsage('gemini-99-imaginary', {
      text_input_tokens: 10,
      image_output_tokens: 1000,
    })).toBeNull();
  });

  it('returns 0 when no tokens were used', () => {
    expect(computeImageCostFromUsage('gpt-image-2', {
      text_input_tokens: 0,
      image_output_tokens: 0,
    })).toBe(0);
  });
});

describe('computeImageCost (legacy) still works', () => {
  it('prices an old per-image row unchanged', () => {
    expect(computeImageCost('openai', '1024x1024', 'standard', 1)).toBeCloseTo(0.040, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_pricing.test.ts`
Expected: FAIL — `computeImageCostFromUsage is not a function`

- [ ] **Step 3: Implement in api/_pricing.ts**

Append to `api/_pricing.ts`:

```ts
import { getImageModel } from './_image-models.js';

/** Token usage returned by an image generation call. */
export interface ImageUsage {
  text_input_tokens: number;
  image_output_tokens: number;
}

/**
 * Exact cost of one image, computed from the tokens the API actually reported
 * multiplied by the model's official rate.
 *
 * This is preferred over the flat per-image IMAGE_PRICING table because it is
 * exact rather than an estimate — token count x official rate reproduces the
 * providers' own published per-image prices to the cent. Returns null for an
 * unknown model so the UI can say "unknown" instead of showing a wrong number.
 */
export function computeImageCostFromUsage(
  modelId: string,
  usage: ImageUsage,
): number | null {
  const m = getImageModel(modelId);
  if (!m) return null;
  return (
    usage.text_input_tokens * m.textInputRatePerMillion +
    usage.image_output_tokens * m.imageOutputRatePerMillion
  ) / 1_000_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_pricing.test.ts`
Expected: PASS

- [ ] **Step 5: Mirror into the frontend**

Apply the same addition to `src/lib/pricing.ts`, importing from `'./image-models'` (no `.js` extension — frontend files use the Vite resolver, matching the existing imports in that file).

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `pricing`

- [ ] **Step 6: Commit (propose)**

```bash
git add api/_pricing.ts api/_pricing.test.ts src/lib/pricing.ts
git commit -m "feat: compute image cost from reported token usage"
```

---

## Task 3: Gemini image transport helper

**Files:**
- Create: `api/_gemini-image.ts`
- Create: `api/_gemini-image.test.ts`

**Interfaces:**
- Consumes: `getImageModel`, `nearestSupportedRatio` from Task 1.
- Produces:
  - `interface GeminiImageResult { bytes: Buffer; mime: string; usage: ImageUsage }`
  - `generateGeminiImage(args): Promise<GeminiImageResult>` where args is
    `{ modelId: string; prompt: string; aspectRatio?: string; imageSize?: '1K'|'2K'|'4K'; inlineImage?: { mimeType: string; base64: string }; temperature?: number }`

- [ ] **Step 1: Write the failing test**

Create `api/_gemini-image.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateGeminiImage } from './_gemini-image.js';

const fetchMock = vi.fn();

// A minimal successful Gemini image response: one inlineData part + usage.
function okResponse(imageB64 = 'AAAA', mime = 'image/jpeg', imageTokens = 1120) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: mime, data: imageB64 } }] } }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: imageTokens }],
      },
    }),
  };
}

describe('generateGeminiImage', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.GEMINI_API_KEY = 'test-key';
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('calls the Developer API endpoint for the requested model', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain('models/gemini-3-pro-image:generateContent');
    expect(url).toContain('key=test-key');
  });

  it('returns decoded bytes, the real mime, and parsed usage', async () => {
    fetchMock.mockResolvedValue(okResponse('SGVsbG8=', 'image/jpeg', 1120));
    const r = await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    expect(r.bytes.toString()).toBe('Hello');
    expect(r.mime).toBe('image/jpeg');
    expect(r.usage).toEqual({ text_input_tokens: 10, image_output_tokens: 1120 });
  });

  it('snaps an unsupported 2:1 ratio to 16:9 before sending', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({
      modelId: 'gemini-3-pro-image', prompt: 'banner', aspectRatio: '2:1',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
  });

  it('passes a supported ratio through untouched', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({
      modelId: 'gemini-3-pro-image', prompt: 'banner', aspectRatio: '21:9',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('21:9');
  });

  it('requests both IMAGE and TEXT modalities (IMAGE alone is rejected)', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE', 'TEXT']);
  });

  it('sends text only when no inlineImage is given (fresh generation)', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'a cat' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.contents[0].parts).toEqual([{ text: 'a cat' }]);
  });

  it('sends the source image first when editing, so the model sees it as context', async () => {
    fetchMock.mockResolvedValue(okResponse());
    await generateGeminiImage({
      modelId: 'gemini-3-pro-image',
      prompt: 'make it blue',
      inlineImage: { mimeType: 'image/png', base64: 'QUJD' },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'QUJD' },
    });
    expect(body.contents[0].parts[1]).toEqual({ text: 'make it blue' });
  });

  it('throws a readable error when the API returns a failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 400,
      text: async () => '{"error":{"message":"aspect_ratio must be one of ..."}}',
    });
    await expect(
      generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' })
    ).rejects.toThrow(/gemini-3-pro-image.*400/);
  });

  it('throws when the response carries no image part', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'refused' }] } }] }),
    });
    await expect(
      generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' })
    ).rejects.toThrow(/no image/i);
  });

  it('throws a clear error when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(
      generateGeminiImage({ modelId: 'gemini-3-pro-image', prompt: 'x' })
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it('refuses a model that is not on the gemini-api transport', async () => {
    await expect(
      generateGeminiImage({ modelId: 'gpt-image-2', prompt: 'x' })
    ).rejects.toThrow(/transport/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_gemini-image.test.ts`
Expected: FAIL — `Failed to resolve import "./_gemini-image.js"`

- [ ] **Step 3: Implement the helper**

Create `api/_gemini-image.ts`:

```ts
// One function for every Gemini IMAGE call — fresh generation, edit, and
// variations all go through here. Centralising it means the model id, the
// endpoint and the usage parsing exist in exactly one place.
//
// Auth: the Gemini Developer API with GEMINI_API_KEY. Chosen over Vertex
// because it needs no OIDC (Vertex workload identity only works on Vercel,
// so it cannot be exercised locally or in tests), and because access to the
// newer image models was confirmed working on this key.

import { getImageModel, nearestSupportedRatio } from './_image-models.js';
import type { ImageUsage } from './_pricing.js';

export interface GeminiImageResult {
  bytes: Buffer;
  mime: string;
  usage: ImageUsage;
}

export interface GeminiImageArgs {
  modelId: string;
  prompt: string;
  /** Any ratio string; snapped to one the model accepts. */
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  /** Present for edits/variations, absent for fresh generation. */
  inlineImage?: { mimeType: string; base64: string };
  temperature?: number;
}

/** Parse "16:9" / "1200 x 600" / "2:1" → numeric ratio, or null. */
function ratioFromString(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*[:x×*]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!w || !h) return null;
  return w / h;
}

/** Pull the image token count out of Gemini's usageMetadata. */
function parseUsage(meta: Record<string, unknown> | undefined): ImageUsage {
  const details = (meta?.candidatesTokensDetails as Array<{ modality?: string; tokenCount?: number }>) ?? [];
  const image = details.find(d => d.modality === 'IMAGE');
  return {
    text_input_tokens: Number(meta?.promptTokenCount ?? 0),
    // Fall back to the total candidate count if the per-modality breakdown is
    // missing, so cost is never silently reported as zero.
    image_output_tokens: Number(image?.tokenCount ?? meta?.candidatesTokenCount ?? 0),
  };
}

export async function generateGeminiImage(args: GeminiImageArgs): Promise<GeminiImageResult> {
  const spec = getImageModel(args.modelId);
  if (!spec || spec.transport !== 'gemini-api') {
    throw new Error(
      `generateGeminiImage: "${args.modelId}" is not on the gemini-api transport`
    );
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured');

  // The API rejects any ratio outside its supported list, so always snap.
  const requested = ratioFromString(args.aspectRatio);
  const aspectRatio = requested !== null
    ? nearestSupportedRatio(spec.id, requested)
    : '1:1';

  const parts: Array<Record<string, unknown>> = [];
  // Source image first when editing — the model treats earlier parts as the
  // context the instruction applies to.
  if (args.inlineImage) {
    parts.push({ inlineData: { mimeType: args.inlineImage.mimeType, data: args.inlineImage.base64 } });
  }
  parts.push({ text: args.prompt });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${spec.id}:generateContent?key=${key}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        // IMAGE alone is rejected — TEXT must be requested alongside it.
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio,
          ...(args.imageSize ? { imageSize: args.imageSize } : {}),
        },
        ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        maxOutputTokens: 16384,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Gemini image call failed for ${spec.id} (${resp.status}): ${detail}`);
  }

  const data = await resp.json();
  for (const c of data.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      if (p.inlineData?.data) {
        return {
          bytes: Buffer.from(p.inlineData.data, 'base64'),
          mime: p.inlineData.mimeType || spec.outputMime,
          usage: parseUsage(data.usageMetadata),
        };
      }
    }
  }
  throw new Error(`Gemini returned no image for ${spec.id} (possibly blocked by a safety filter)`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_gemini-image.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (propose)**

```bash
git add api/_gemini-image.ts api/_gemini-image.test.ts
git commit -m "feat: add shared Gemini image transport helper"
```

---

## Task 4: resizeToExact preserves JPEG

**Files:**
- Modify: `api/generate-image.ts:13-79` (the `resizeToExact` function) — add `export`
- Test: `api/generate-image.test.ts` (append a describe block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `resizeToExact(buffer, bannerDimensions?, aspectRatio?)` becomes **exported**, same signature and return shape `{ buffer, mime, resized }`.

**Why:** Both new Gemini models return `image/jpeg`. Today every branch of `resizeToExact` ends in `.png()`, so a 2.5MB JPEG becomes a much larger PNG on every Drive upload.

- [ ] **Step 1: Write the failing test**

Append to `api/generate-image.test.ts`:

```ts
import sharp from 'sharp';
import { resizeToExact } from './generate-image.js';

// Build a real image in memory so we exercise sharp for real, not a mock.
async function makeImage(w: number, h: number, format: 'jpeg' | 'png') {
  const img = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } },
  });
  return format === 'jpeg' ? img.jpeg().toBuffer() : img.png().toBuffer();
}

describe('resizeToExact output format', () => {
  it('keeps a JPEG input as JPEG so Gemini images are not inflated to PNG', async () => {
    const src = await makeImage(1600, 900, 'jpeg');
    const out = await resizeToExact(src, '1200 × 600');
    expect(out.resized).toBe(true);
    expect(out.mime).toBe('image/jpeg');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(600);
  });

  it('keeps a PNG input as PNG', async () => {
    const src = await makeImage(1600, 900, 'png');
    const out = await resizeToExact(src, '1200 × 600');
    expect(out.mime).toBe('image/png');
    expect((await sharp(out.buffer).metadata()).format).toBe('png');
  });

  it('mirror-extends to the exact size when the ratio differs', async () => {
    // 16:9 source (1.778) into a 2:1 target — the gap must be filled, not cropped.
    const src = await makeImage(1600, 900, 'jpeg');
    const out = await resizeToExact(src, '1200 × 600');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(600);
  });

  it('does a plain lossless resize when the ratio already matches (no mirroring)', async () => {
    // A true 2:1 source into a 2:1 target — this is the gpt-image-2 case, where
    // the mirror-extend workaround must NOT kick in.
    const src = await makeImage(2048, 1024, 'png');
    const out = await resizeToExact(src, '1200 × 600');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(600);
    expect(out.resized).toBe(true);
  });

  it('returns the original bytes untouched when no target size is derivable', async () => {
    const src = await makeImage(800, 800, 'png');
    const out = await resizeToExact(src, undefined, undefined);
    expect(out.resized).toBe(false);
    expect(out.buffer).toBe(src);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/generate-image.test.ts`
Expected: FAIL — `resizeToExact is not exported` / JPEG assertion fails with `'png'`

- [ ] **Step 3: Implement**

In `api/generate-image.ts`, change the function signature at line 13 from
`async function resizeToExact(` to `export async function resizeToExact(`.

Then, inside the function, immediately after `const srcRatio = sw / sh;` add:

```ts
    // Preserve the input format. Gemini image models return JPEG; re-encoding
    // that to PNG would inflate a ~2.5MB photo several times over on every
    // Drive upload. `encode` is applied at every return point below.
    const isJpeg = meta.format === 'jpeg';
    const outMime = isJpeg ? 'image/jpeg' : 'image/png';
    const encode = (p: import('sharp').Sharp) => (isJpeg ? p.jpeg({ quality: 92 }) : p.png());
```

Replace the two encode-and-return sites:

```ts
    // was: .png().toBuffer(); return { buffer: out, mime: 'image/png', resized: true };
    const out = await encode(
      sharp(buffer).resize(width, height, { fit: 'cover', position: sharp.gravity.centre })
    ).toBuffer();
    return { buffer: out, mime: outMime, resized: true };
```

and

```ts
    // was: .png().toBuffer(); return { buffer: out, mime: 'image/png', resized: true };
    const out = await encode(
      sharp(fitted).extend({ left, right: padX - left, top, bottom: padY - top, extendWith: 'mirror' })
    ).toBuffer();
    console.log(`[generate-image] mirror-extend to ${width}x${height} (src ${sw}x${sh}, tgt=${tgtRatio.toFixed(3)} src=${srcRatio.toFixed(3)}, ${outMime})`);
    return { buffer: out, mime: outMime, resized: true };
```

Leave the three early `return { buffer, mime: 'image/png', resized: false }` paths alone — they return the original bytes, and callers already prefer the raw response mime when `resized` is false.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/generate-image.test.ts`
Expected: PASS (new block plus the 4 pre-existing `logAssistantImageGen` tests)

- [ ] **Step 5: Commit (propose)**

```bash
git add api/generate-image.ts api/generate-image.test.ts
git commit -m "fix: preserve JPEG through resizeToExact instead of re-encoding to PNG"
```

---

## Task 5: OpenAI → gpt-image-2 with native pixel sizing

**Files:**
- Modify: `api/generate-image.ts:425-465` (replace the 3-entry `SUPPORTED` table; add `pickOpenAiImageSize`)
- Modify: `api/edit-image.ts:272`
- Modify: `api/generate-variations.ts:390`
- Modify: `api/[action].ts:933`
- Test: `api/generate-image.test.ts` (append)

**Interfaces:**
- Consumes: `OPENAI_IMAGE_MODEL` from Task 1.
- Produces: `pickOpenAiImageSize(requestedRatio: number, resolution: string): string` returning e.g. `"2048x1024"`.

**Why:** `gpt-image-1` supported only 1024×1024 / 1536×1024 / 1024×1536, which is the entire reason mirror-extend exists. `gpt-image-2` accepts any multiple-of-16 size up to 3840 per edge, so a 2:1 banner is generated natively and `resizeToExact` becomes a lossless downscale. It is also 43% cheaper ($0.1417 vs $0.2484 measured at high quality).

- [ ] **Step 1: Write the failing test**

Append to `api/generate-image.test.ts`:

```ts
import { pickOpenAiImageSize } from './generate-image.js';

describe('pickOpenAiImageSize', () => {
  // gpt-image-2 constraints, confirmed against the live API:
  // both edges multiples of 16, max edge 3840, 655,360 <= w*h <= 8,294,400.
  const parse = (s: string) => s.split('x').map(Number);

  it('produces an exact 2:1 for a wide banner at 2K — the size verified working', () => {
    expect(pickOpenAiImageSize(2, '2K')).toBe('2048x1024');
  });

  it('produces a square at 1K', () => {
    expect(pickOpenAiImageSize(1, '1K')).toBe('1024x1024');
  });

  it('produces an exact 2:1 at 1K for cheap previews', () => {
    expect(pickOpenAiImageSize(2, '1K')).toBe('1440x720');
  });

  it('always returns multiples of 16 on both edges', () => {
    for (const r of [1, 1.5, 16 / 9, 2, 0.667, 0.5625, 2.35]) {
      for (const res of ['1K', '2K', '3K', '4K']) {
        const [w, h] = parse(pickOpenAiImageSize(r, res));
        expect(w % 16, `${r} ${res} width`).toBe(0);
        expect(h % 16, `${r} ${res} height`).toBe(0);
      }
    }
  });

  it('always stays inside the pixel budget and edge limit', () => {
    for (const r of [0.34, 0.5, 1, 1.78, 2, 2.9]) {
      for (const res of ['1K', '2K', '3K', '4K']) {
        const [w, h] = parse(pickOpenAiImageSize(r, res));
        expect(w * h, `${r} ${res} pixels`).toBeGreaterThanOrEqual(655360);
        expect(w * h, `${r} ${res} pixels`).toBeLessThanOrEqual(8294400);
        expect(Math.max(w, h), `${r} ${res} edge`).toBeLessThanOrEqual(3840);
      }
    }
  });

  it('keeps the delivered ratio within 2% of the request so resizeToExact never mirrors', () => {
    for (const r of [1, 1.5, 16 / 9, 2, 0.667]) {
      const [w, h] = parse(pickOpenAiImageSize(r, '2K'));
      expect(Math.abs(w / h - r) / r, `ratio ${r}`).toBeLessThan 0.02;
    }
  });

  it('clamps a ratio beyond 3:1 rather than sending an invalid request', () => {
    const [w, h] = parse(pickOpenAiImageSize(8, '2K'));
    expect(w / h).toBeLessThanOrEqual(3.001);
  });

  it('falls back to the 2K budget for an unknown resolution string', () => {
    expect(pickOpenAiImageSize(2, 'nonsense')).toBe('2048x1024');
  });
});
```

> Note for the implementer: the line `expect(...).toBeLessThan 0.02;` above is a typo — write it as `expect(Math.abs(w / h - r) / r).toBeLessThan(0.02);`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/generate-image.test.ts`
Expected: FAIL — `pickOpenAiImageSize is not a function`

- [ ] **Step 3: Implement the sizing helper**

In `api/generate-image.ts`, add near `nearestImagenRatio`:

```ts
// gpt-image-2 accepts any size whose edges are multiples of 16, up to 3840 per
// edge, with total pixels between 655,360 and 8,294,400 and a ratio within 3:1.
// That means (unlike gpt-image-1) we can ask for the banner's real shape — a
// 2:1 email banner comes back as a true 2:1, so resizeToExact only has to do a
// lossless downscale instead of mirror-extending a gap.
const OPENAI_STEP     = 16;
const OPENAI_MIN_PX   = 655_360;
const OPENAI_MAX_PX   = 8_294_400;
const OPENAI_MAX_EDGE = 3840;

// Pixel budget per resolution tier. Cost scales with output tokens, which scale
// with pixels, so tying this to the user's resolution choice keeps spend
// predictable rather than always generating at maximum size.
const OPENAI_TARGET_PX: Record<string, number> = {
  '1K': 1_048_576,
  '2K': 2_097_152,
  '3K': 4_194_304,
  '4K': 8_294_400,
};

export function pickOpenAiImageSize(requestedRatio: number, resolution: string): string {
  const snap = (v: number) => Math.max(OPENAI_STEP, Math.round(v / OPENAI_STEP) * OPENAI_STEP);
  // The API refuses ratios beyond 3:1 in either direction.
  const r = Math.min(3, Math.max(1 / 3, requestedRatio));
  const target = OPENAI_TARGET_PX[resolution] ?? OPENAI_TARGET_PX['2K'];

  let h = snap(Math.sqrt(target / r));
  let w = snap(h * r);

  // Respect the per-edge cap, re-deriving the other edge from the ratio.
  if (w > OPENAI_MAX_EDGE) { w = OPENAI_MAX_EDGE; h = snap(w / r); }
  if (h > OPENAI_MAX_EDGE) { h = OPENAI_MAX_EDGE; w = snap(h * r); }

  // Walk into the pixel budget in 16px steps, keeping the ratio.
  while (w * h > OPENAI_MAX_PX && h > OPENAI_STEP) { h -= OPENAI_STEP; w = snap(h * r); }
  while (w * h < OPENAI_MIN_PX && Math.max(w, h) < OPENAI_MAX_EDGE) {
    h += OPENAI_STEP;
    w = snap(h * r);
  }

  return `${w}x${h}`;
}
```

- [ ] **Step 4: Use it in the OpenAI branch**

In `api/generate-image.ts`, delete the `SUPPORTED` array and the `outputSize` reduce (around lines 429-440) and replace with:

```ts
      // Ask gpt-image-2 for the banner's real shape. Prefer the ratio from
      // explicit pixel dimensions ("1200 × 600") since preset aspectRatio
      // strings are sometimes inaccurate.
      const requestedRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1.5;
      const outputSize = pickOpenAiImageSize(requestedRatio, genResolution);
```

Then change the request body `model` field from `'gpt-image-1'` to `OPENAI_IMAGE_MODEL`, adding the import at the top of the file:

```ts
import { OPENAI_IMAGE_MODEL, DEFAULT_GEMINI_IMAGE_MODEL, resolveGeminiModel, nearestSupportedRatio } from './_image-models.js';
```

- [ ] **Step 5: Swap the model string at the other three call sites**

- `api/edit-image.ts:272` — `form.append('model', 'gpt-image-1');` → `form.append('model', OPENAI_IMAGE_MODEL);` and add `import { OPENAI_IMAGE_MODEL } from './_image-models.js';`
- `api/generate-variations.ts:390` — same change, same import.
- `api/[action].ts:933` — same change, same import.

Confirm none remain:

Run: `grep -rn "gpt-image-1'" api/ --include=*.ts | grep -v test | grep -v _image-models`
Expected: no output

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. The pre-existing `generate-image.test.ts` tests pass `'gpt-image-1'` as a literal *argument* to `logAssistantImageGen`, which is unaffected — leave them as they are, they now double as coverage that historical rows still price.

- [ ] **Step 7: Commit (propose)**

```bash
git add api/generate-image.ts api/generate-image.test.ts api/edit-image.ts api/generate-variations.ts "api/[action].ts"
git commit -m "feat: move OpenAI image generation to gpt-image-2 with native sizing"
```

---

## Task 6: Gemini generation honours the selected model

**Files:**
- Modify: `api/generate-image.ts` — accept `geminiModel` from the body, add the `gemini-api` branch, log real model + exact cost
- Modify: `api/generate-image.ts:114-146` (`logAssistantImageGen`) — accept optional usage
- Test: `api/generate-image.test.ts` (append)

**Interfaces:**
- Consumes: `generateGeminiImage` (Task 3), `resolveGeminiModel` (Task 1), `computeImageCostFromUsage` (Task 2), `resizeToExact` (Task 4).
- Produces: `logAssistantImageGen(req, fileId, provider, model, size, quality, usage?)` — a 7th **optional** parameter, so all existing callers keep working.

- [ ] **Step 1: Write the failing test**

Append to `api/generate-image.test.ts`:

```ts
describe('logAssistantImageGen with token usage', () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ data: null, error: null });
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('stores the exact cost computed from usage when usage is supplied', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'f1', 'gemini', 'gemini-3-pro-image', '16:9', null, {
      text_input_tokens: 10,
      image_output_tokens: 1120,
    });
    const row = insertMock.mock.calls[0][0];
    expect(row.model).toBe('gemini-3-pro-image');
    expect(row.cost_usd).toBeCloseTo(0.13442, 5);
  });

  it('falls back to the legacy per-image table when no usage is supplied', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'f2', 'openai', 'gpt-image-2', '1024x1024', 'standard');
    const row = insertMock.mock.calls[0][0];
    expect(row.cost_usd).toBeCloseTo(0.040, 6);
  });

  it('never logs the placeholder model name "imagen"', async () => {
    const req = { body: { source: 'assistant', test_user_id: 'tester-her' } } as any;
    await logAssistantImageGen(req, 'f3', 'gemini', 'gemini-2.5-flash-image', '16:9', null, {
      text_input_tokens: 8,
      image_output_tokens: 1290,
    });
    expect(insertMock.mock.calls[0][0].model).not.toBe('imagen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/generate-image.test.ts`
Expected: FAIL — `cost_usd` is `null` (the 7th argument is ignored)

- [ ] **Step 3: Extend logAssistantImageGen**

In `api/generate-image.ts`, change the signature and the `cost_usd` line:

```ts
export async function logAssistantImageGen(
  req: VercelRequest,
  fileId: string,
  provider: string,
  model: string,
  size: string,
  quality: string | null,
  // Present for providers that report token usage. When given, cost is exact
  // rather than a per-image estimate.
  usage?: { text_input_tokens: number; image_output_tokens: number },
): Promise<void> {
```

and inside the insert:

```ts
    const { computeImageCost, computeImageCostFromUsage } = await import('./_pricing.js');
    // ...
      cost_usd: usage
        ? computeImageCostFromUsage(model, usage)
        : computeImageCost(provider, size, quality, 1),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/generate-image.test.ts`
Expected: PASS

- [ ] **Step 5: Add the Gemini branch**

In `api/generate-image.ts`, add `geminiModel` to the destructure at line 360:

```ts
    const { prompt, provider, aspectRatio, imageSize, backend, resolution, brand, bannerDimensions, geminiModel } = req.body;
```

Then, immediately **before** the `if (backend === 'cloud-run')` block at line 556, insert:

```ts
    // ── Gemini direct generation ────────────────────────────────────────
    // Runs whenever the caller selected a model on the gemini-api transport.
    // The current model (gemini-2.5-flash-image) stays on 'vertex' and so
    // falls through to the existing Cloud Run path below — meaning default
    // behaviour is completely unchanged until a user picks the new model.
    const geminiSpec = resolveGeminiModel(geminiModel);
    if (provider === 'gemini' && geminiSpec.transport === 'gemini-api') {
      console.log(`[generate-image] Using Gemini direct generation: ${geminiSpec.id}`);

      const { generateGeminiImage } = await import('./_gemini-image.js');
      const reqRatio = ratioFromString(bannerDimensions) ?? ratioFromString(aspectRatio) ?? 1;

      const gen = await generateGeminiImage({
        modelId: geminiSpec.id,
        prompt: geminiPrompt,
        // Pass the raw requested ratio — the helper snaps it to a supported one.
        aspectRatio: bannerDimensions || aspectRatio || '1:1',
        imageSize: (genResolution === '3K' ? '2K' : genResolution) as '1K' | '2K' | '4K',
      });

      console.log(`[generate-image] ${geminiSpec.id} returned ${gen.bytes.length} bytes ${gen.mime}, ` +
        `${gen.usage.image_output_tokens} image tokens (requested ratio ${reqRatio.toFixed(3)})`);

      const exact  = await resizeToExact(gen.bytes, bannerDimensions, aspectRatio);
      const imgBuf = exact.buffer;
      const imgMime = exact.resized ? exact.mime : gen.mime;
      const ext    = imgMime.split('/')[1] || 'jpeg';
      const gSlug  = brandSlug(brand);

      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!folderId) {
        return res.status(500).json({ error: 'GOOGLE_DRIVE_FOLDER_ID is not configured' });
      }
      const accessToken = await getGoogleAccessToken();
      const fileId = await uploadImageToDrive({
        imageBuffer: imgBuf,
        mimeType:    imgMime,
        filename:    `${gSlug ? gSlug + '-' : ''}gemini-${Date.now()}.${ext}`,
        folderId,
        provider:    'gemini',
        aspectRatio: aspectRatio || '16:9',
        resolution:  resolution  || '1K',
        accessToken,
        brand,
      });
      await makeFilePublic(fileId, accessToken);
      await logAssistantImageGen(
        req, fileId, 'gemini', geminiSpec.id, aspectRatio || '1:1', null, gen.usage,
      );

      const driveUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
      return res.status(200).json({
        fileId,
        public_url: driveUrl,
        imageUrl:   driveUrl,
        url:        driveUrl,
        model:      geminiSpec.id,
        usage:      gen.usage,
      });
    }
```

- [ ] **Step 6: Fix the placeholder model name on the Cloud Run path**

At `api/generate-image.ts:665`, change:

```ts
await logAssistantImageGen(req, geminiFileId, 'gemini', 'imagen', aspectRatio || '1:1', null);
```

to:

```ts
// Was the literal string 'imagen', which made Gemini image spend impossible
// to attribute to a model in the Cost Tracker.
await logAssistantImageGen(req, geminiFileId, 'gemini', geminiSpec.id, aspectRatio || '1:1', null);
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit (propose)**

```bash
git add api/generate-image.ts api/generate-image.test.ts
git commit -m "feat: generate Gemini images with the selected model and log exact cost"
```

---

## Task 7: Edit and Variations honour the selected model

**Files:**
- Modify: `api/edit-image.ts:164-200` (`editViaGemini`) and its call site
- Modify: `api/generate-variations-imagen.ts:330-331`

**Interfaces:**
- Consumes: `resolveGeminiModel`, `generateGeminiImage`.
- Produces: nothing new.

**Constraint:** the strict-preservation prompt from `buildGeminiEditPrompt` must stay **byte-identical**. Only the transport and model id change. The user accepted the risk of edit drift; keeping the prompt untouched means the model is the only variable.

- [ ] **Step 1: Route editViaGemini through the shared helper**

In `api/edit-image.ts`, change `editViaGemini` to take a model id and branch on transport:

```ts
async function editViaGemini(
  imgArrayBuffer: ArrayBuffer,
  mimeType: string,
  editInstructions: string,
  req: VercelRequest,
  modelId: string,
): Promise<{ imageUrl: string }> {
  const prompt = buildGeminiEditPrompt(editInstructions);   // UNCHANGED
  const spec   = resolveGeminiModel(modelId);

  // New models run on the Developer API. The current model keeps the existing
  // Vertex path untouched, so today's edit behaviour is unchanged by default.
  if (spec.transport === 'gemini-api') {
    const { generateGeminiImage } = await import('./_gemini-image.js');
    const out = await generateGeminiImage({
      modelId: spec.id,
      prompt,
      inlineImage: { mimeType, base64: Buffer.from(imgArrayBuffer).toString('base64') },
      // Low temperature enforces strict preservation — minimises creative drift.
      temperature: 0.1,
    });
    return { imageUrl: `data:${out.mime};base64,${out.bytes.toString('base64')}` };
  }

  // ── existing Vertex path below, unchanged ──
  const accessToken = await getGCPAccessToken(req);
  // ...rest of the current implementation stays exactly as-is...
}
```

Add the import at the top:

```ts
import { resolveGeminiModel } from './_image-models.js';
```

- [ ] **Step 2: Pass the model from the request body**

Find the `editViaGemini(...)` call site (in the `provider === 'gemini'` branch around line 414) and add the 5th argument, reading from the body alongside the other fields:

```ts
const { geminiModel } = req.body;
// ...
return await editViaGemini(imgArrayBuffer, mimeType, editInstructions, req, geminiModel);
```

- [ ] **Step 3: Make variations use the selected model**

In `api/generate-variations-imagen.ts`, replace line 330:

```ts
    const geminiModel = 'gemini-2.5-flash-image';
```

with:

```ts
    // Honour the model the user picked in the dropdown; falls back to the
    // current model when absent or unrecognised.
    const spec = resolveGeminiModel(req.body?.geminiModel);
    const geminiModel = spec.id;
```

and add `import { resolveGeminiModel } from './_image-models.js';` at the top.

Leave the Vertex URL construction as-is for now — variations still run on Vertex for the current model, and the registry's `transport` field records which models can move.

- [ ] **Step 4: Verify nothing else hardcodes a Gemini image model**

Run: `grep -rn "gemini-2.5-flash-image" api/ --include=*.ts | grep -v test | grep -v _image-models`
Expected: only the Vertex URL template lines, no bare model-name assignments

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit (propose)**

```bash
git add api/edit-image.ts api/generate-variations-imagen.ts
git commit -m "feat: edit and variations use the selected Gemini model"
```

---

## Task 8: ImageModelSelect component

**Files:**
- Create: `src/components/ImageModelSelect.tsx`
- Test: `src/components/ImageModelSelect.test.tsx`

**Interfaces:**
- Consumes: `geminiDropdownModels`, `DEFAULT_GEMINI_IMAGE_MODEL` from `src/lib/image-models`.
- Produces: `<ImageModelSelect value={string} onChange={(id: string) => void} />`, plus
  `GEMINI_MODEL_STORAGE_KEY = 'promptgen.geminiImageModel'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ImageModelSelect.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { geminiDropdownModels, DEFAULT_GEMINI_IMAGE_MODEL } from '@/lib/image-models';
import { optionLabelFor, GEMINI_MODEL_STORAGE_KEY } from './ImageModelSelect';

describe('ImageModelSelect labels', () => {
  it('shows "(current)" and no price for the current model', () => {
    expect(optionLabelFor(DEFAULT_GEMINI_IMAGE_MODEL)).toBe('2.5 Flash Image (current)');
  });

  it('shows the price for the new model so the cost is visible at the point of choice', () => {
    expect(optionLabelFor('gemini-3-pro-image')).toBe('3 Pro Image — $0.134 / image');
  });

  it('offers exactly the two dropdown models', () => {
    expect(geminiDropdownModels()).toHaveLength(2);
  });

  it('uses a stable storage key so the choice survives a reload', () => {
    expect(GEMINI_MODEL_STORAGE_KEY).toBe('promptgen.geminiImageModel');
  });

  it('falls back to a plain label for an unknown id instead of crashing', () => {
    expect(optionLabelFor('gemini-99-imaginary')).toBe('gemini-99-imaginary');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ImageModelSelect.test.tsx`
Expected: FAIL — cannot resolve `./ImageModelSelect`

- [ ] **Step 3: Implement the component**

Create `src/components/ImageModelSelect.tsx`:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { geminiDropdownModels, getImageModel, DEFAULT_GEMINI_IMAGE_MODEL } from '@/lib/image-models';

/** localStorage key — keeps the tester's choice across reloads. */
export const GEMINI_MODEL_STORAGE_KEY = 'promptgen.geminiImageModel';

/**
 * Build the dropdown text. The current model is marked "(current)" with no
 * price; the newer model shows its per-image cost, because the whole reason
 * this dropdown exists is to make that trade-off visible at the moment of
 * choosing.
 */
export function optionLabelFor(modelId: string): string {
  const m = getImageModel(modelId);
  if (!m) return modelId;
  if (m.isCurrent) return `${m.label} (current)`;
  if (m.displayPricePerImage === null) return m.label;
  return `${m.label} — $${m.displayPricePerImage.toFixed(3)} / image`;
}

/** Read the saved choice, guarding against a stale or tampered value. */
export function loadSavedGeminiModel(): string {
  try {
    const saved = localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
    if (saved && getImageModel(saved)?.inDropdown) return saved;
  } catch {
    // localStorage can throw in private-browsing modes — fall through.
  }
  return DEFAULT_GEMINI_IMAGE_MODEL;
}

interface Props {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ImageModelSelect({ value, onChange, disabled }: Props) {
  const models = geminiDropdownModels();
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Gemini model</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {models.map(m => (
            <SelectItem key={m.id} value={m.id}>{optionLabelFor(m.id)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ImageModelSelect.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit (propose)**

```bash
git add src/components/ImageModelSelect.tsx src/components/ImageModelSelect.test.tsx
git commit -m "feat: add Gemini image model dropdown with visible pricing"
```

---

## Task 9: Wire the dropdown into the main app

**Files:**
- Modify: `src/components/ResultDisplay.tsx` — state, persistence, render, request body

**Interfaces:**
- Consumes: `ImageModelSelect`, `loadSavedGeminiModel`, `GEMINI_MODEL_STORAGE_KEY` (Task 8).
- Produces: `geminiModel` in the `/api/generate-image` request body.

- [ ] **Step 1: Add state and persistence**

In `src/components/ResultDisplay.tsx`, add the import:

```tsx
import { ImageModelSelect, loadSavedGeminiModel, GEMINI_MODEL_STORAGE_KEY } from '@/components/ImageModelSelect';
```

and next to the existing `generatingImage` state (line ~180):

```tsx
  // Which Gemini image model to use. Restored from localStorage so a tester's
  // choice survives a page reload mid-comparison.
  const [geminiModel, setGeminiModel] = useState<string>(loadSavedGeminiModel);

  const handleGeminiModelChange = (id: string) => {
    setGeminiModel(id);
    try {
      localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, id);
    } catch {
      // Non-fatal — the choice just won't persist.
    }
  };
```

- [ ] **Step 2: Send it with the request**

In `handleGenerateImage` (line ~382), add one field to the JSON body:

```tsx
          backend: "cloud-run",
          resolution,
          brand: metadata?.brand || "",
          // Ignored by the OpenAI path; selects the model on the Gemini path.
          geminiModel,
```

- [ ] **Step 3: Render the dropdown next to the Gemini button**

Wrap the button row (line ~851) so the dropdown sits above it:

```tsx
        <div className="flex justify-center mb-3">
          <ImageModelSelect
            value={geminiModel}
            onChange={handleGeminiModelChange}
            disabled={generatingImage.gemini}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
          {/* ...existing ChatGPT / Gemini / Generate Both buttons unchanged... */}
        </div>
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both succeed

- [ ] **Step 5: Screenshot before/after (project rule: screenshot-driven development)**

Start the dev server and capture the prompt result view:

```bash
npm run dev
```

Then use the `webapp-testing` skill (or the `seo-visual` agent) against `http://localhost:5173` to screenshot the generate-buttons area. Self-check the screenshot:
- Both entries appear in the dropdown.
- The current model reads "2.5 Flash Image (current)" with no price.
- The new model reads "3 Pro Image — $0.134 / image".
- The dropdown does not push the buttons out of alignment on a narrow viewport.

Iterate until it looks right. Note that clicking Generate will fail locally — `/api` routes are not served by `npm run dev`. Confirm the error message renders cleanly rather than leaving a stuck spinner.

- [ ] **Step 6: Commit (propose)**

```bash
git add src/components/ResultDisplay.tsx
git commit -m "feat: expose Gemini model dropdown in the main generator"
```

---

## Task 10: Wire the dropdown into the Assistant and group cost by model

**Files:**
- Modify: `src/components/assistant/GeneratedPromptPanel.tsx`
- Modify: `src/components/assistant/CostTrackerPanel.tsx`

**Interfaces:**
- Consumes: `ImageModelSelect`, `loadSavedGeminiModel`, `GEMINI_MODEL_STORAGE_KEY` (Task 8); `ImageGen` rows from `useCostTracker`.
- Produces: nothing new.

- [ ] **Step 1: Thread the model through callImageGen**

In `src/components/assistant/GeneratedPromptPanel.tsx`, extend the args of `callImageGen` (line 30) and its body:

```tsx
async function callImageGen(args: {
  positivePrompt: string;
  brand: string;
  provider: ImageProvider;
  token: string;
  geminiModel: string;
}): Promise<string> {
```

and inside the JSON body add:

```tsx
      source: 'assistant',
      test_user_id: args.token,
      geminiModel: args.geminiModel,
```

- [ ] **Step 2: Add state and the dropdown**

Add the import and state alongside `imageBusy` (line ~68):

```tsx
import { ImageModelSelect, loadSavedGeminiModel, GEMINI_MODEL_STORAGE_KEY } from '@/components/ImageModelSelect';
// ...
  const [geminiModel, setGeminiModel] = useState<string>(loadSavedGeminiModel);

  const handleGeminiModelChange = (id: string) => {
    setGeminiModel(id);
    try { localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, id); } catch { /* non-fatal */ }
  };
```

Pass `geminiModel` at both `callImageGen(...)` call sites (lines ~91 and ~115), and render the dropdown just above the render buttons (line ~195):

```tsx
              <ImageModelSelect
                value={geminiModel}
                onChange={handleGeminiModelChange}
                disabled={imageBusy}
              />
```

- [ ] **Step 3: Group image spend by model in the Cost Tracker**

In `src/components/assistant/CostTrackerPanel.tsx`, after the existing `imgRows` (line ~38), add a per-model rollup and render it above the recent-renders list:

```tsx
  // Per-model rollup. This is the number Lena is actually comparing: real
  // spend and real average cost per render for each model she has tried.
  const byModel = Object.values(
    imgRows.reduce<Record<string, { model: string; count: number; usd: number }>>((acc, { i, usd }) => {
      const key = i.model ?? 'unknown';
      acc[key] ??= { model: key, count: 0, usd: 0 };
      acc[key].count += i.image_count ?? 1;
      acc[key].usd   += usd ?? 0;
      return acc;
    }, {})
  ).sort((a, b) => b.usd - a.usd);
```

Render it as a small table:

```tsx
      {byModel.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Image spend by model</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1">Model</th>
                <th className="py-1 text-right">Renders</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">Avg / render</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map(r => (
                <tr key={r.model} className="border-t border-border/40">
                  <td className="py-1 font-mono">{r.model}</td>
                  <td className="py-1 text-right tabular-nums">{r.count}</td>
                  <td className="py-1 text-right tabular-nums">${r.usd.toFixed(4)}</td>
                  <td className="py-1 text-right tabular-nums">
                    ${(r.count ? r.usd / r.count : 0).toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 4: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both succeed

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Screenshot the Assistant page**

With `npm run dev` running, screenshot the Assistant's generated-prompt panel and the Cost Tracker. Self-check:
- The dropdown appears above the two Render buttons and reads correctly.
- The Cost Tracker's new "Image spend by model" table renders without layout breakage (it will be empty with no data — confirm the empty case is hidden, not a bare header).

- [ ] **Step 7: Commit (propose)**

```bash
git add src/components/assistant/GeneratedPromptPanel.tsx src/components/assistant/CostTrackerPanel.tsx
git commit -m "feat: model dropdown in Assistant plus per-model image spend"
```

---

## Post-implementation verification (on a Vercel preview)

`npm run dev` cannot exercise `/api`, so the real comparison happens on a preview deploy. Run this once everything is merged to a preview branch:

- [ ] Confirm `GEMINI_API_KEY` is set in the Vercel project's environment variables (it exists in `.env.local`; it must also exist in Vercel or the new models will 500).
- [ ] 9-render matrix — 3 providers/models × 3 ratios:

| Model | 1:1 | 16:9 | 2:1 (1200×600) |
|---|---|---|---|
| `gemini-2.5-flash-image` (current) | ☐ | ☐ | ☐ |
| `gemini-3-pro-image` | ☐ | ☐ | ☐ |
| `gpt-image-2` (ChatGPT button) | ☐ | ☐ | ☐ |

- [ ] For each render, record the Cost Tracker figure and screenshot the image.
- [ ] Confirm the 2:1 `gpt-image-2` render shows **no mirrored band** at the edges (native 2:1 means `resizeToExact` should only downscale).
- [ ] Confirm the 2:1 Gemini renders still look clean — they DO still mirror-extend, because Gemini has no 2:1.
- [ ] Confirm Drive files for Gemini renders are `.jpeg`, not `.png`, and are not larger than the API response.
- [ ] Reconcile one `gemini-3-pro-image` render against the GCP billing console and one `gpt-image-2` render against the OpenAI usage dashboard. If either differs from the tracker, update `rateSource` / rates in **both** registry mirrors.
- [ ] Decide on `WIDE_FRAMING` (`api/generate-image.ts:411`): compare a 2:1 `gpt-image-2` render with and without it. It was tuned to compensate for a crop that no longer happens on that path.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Model registry | Task 1 |
| §2 Transport helper | Task 3 |
| §3 Gemini generation path | Task 6 |
| §4 resizeToExact preserves JPEG | Task 4 |
| §5 OpenAI path | Task 5 |
| §6 Cost tracking | Tasks 2, 6, 10 |
| §7 UI | Tasks 8, 9, 10 |
| Testing section | Every task + the preview matrix above |
| Risk 1 (edit drift) | Task 7 keeps the prompt byte-identical and notes the pin-back |
| Risk 2 (`-preview` aliases) | Task 1 pins non-preview ids; `resolveGeminiModel` falls back rather than guessing |
| Risk 3 (`imageSize` loose) | Task 6 logs returned byte size and token count |
| Risk 4 (rate drift) | Task 1 stores `rateSource` + `lastVerified`; preview checklist reconciles |
| Risk 5 (image spend uncapped) | Out of scope per spec; not planned |

**Deviation from spec:** the spec listed `gemini-3.1-flash-lite-image` as a hidden registry spare. It is **omitted** — no official rate for it was verified, and the Global Constraints forbid unverified numbers. `gemini-3.1-flash-image` (rates confirmed) serves as the hidden spare instead.

**Type consistency check:** `ImageUsage` is defined once in `_pricing.ts` (Task 2) and imported by `_gemini-image.ts` (Task 3) and used structurally by `logAssistantImageGen` (Task 6) — same field names `text_input_tokens` / `image_output_tokens` throughout. `resolveGeminiModel` returns `ImageModelSpec` in Tasks 1, 6, 7. `pickOpenAiImageSize(ratio, resolution)` has the same two-arg signature in Task 5's definition, test and call site. `GEMINI_MODEL_STORAGE_KEY` and `loadSavedGeminiModel` are defined in Task 8 and imported unchanged in Tasks 9 and 10.

**Known typo to fix during execution:** Task 5 Step 1 contains `expect(...).toBeLessThan 0.02;` — write `expect(Math.abs(w / h - r) / r).toBeLessThan(0.02);`.
