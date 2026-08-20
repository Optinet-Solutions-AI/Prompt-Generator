# Image Model Selection — Design

**Date:** 2026-08-20
**Status:** Awaiting review
**Scope:** Sub-project 1 of 3 from the Lena model-review meeting.

## Goal

Let Lena run a real cost-vs-quality comparison across Gemini image models, and move OpenAI image generation onto the current model. Everything is driven from one model registry so a model id and its price are never written down in two places.

Explicitly NOT in this spec: the AI Concept Assistant upgrade (its own brainstorm), and choosing a non-Google/non-OpenAI image provider.

## Decisions taken (from brainstorming)

| Decision | Choice |
|---|---|
| Build order | Model plumbing first; Assistant upgrade separate |
| Dropdown covers | Generate + Edit + Variations (all three) |
| Gemini dropdown entries | 2.5-flash-image (current) / 3.1-flash-image / 3-pro-image |
| OpenAI | Pinned to latest, no dropdown |
| Transport | Direct Gemini API from this repo; Cloud Run kept as fallback |
| Dropdown placement | Main app + Assistant page (shared component) |
| Mirror-extend | Request native ratio; keep `resizeToExact` as a self-disabling safety net |

## Verified facts

All checked against live APIs on 2026-08-20 using the project's own keys. These supersede the third-party pricing/capability pages consulted earlier.

### Model access — CONFIRMED

`GEMINI_API_KEY` (Developer API, `generativelanguage.googleapis.com`) lists and successfully generates with:

- `gemini-2.5-flash-image` (current)
- `gemini-3.1-flash-image` (+ `-preview`)
- `gemini-3-pro-image` (+ `-preview`)
- `gemini-3.1-flash-lite-image`

`OPENAI_API_KEY` lists `gpt-image-2`, `gpt-image-2-2026-04-21`, `gpt-image-1.5`, `gpt-image-1-mini`, `gpt-image-1`, `chatgpt-image-latest`.

Real generation calls returned HTTP 200 with image bytes for `gemini-3.1-flash-image`, `gemini-3-pro-image`, and `gpt-image-2`. Entitlement is proven, not merely catalogued.

### Aspect ratios — Gemini cannot do 2:1

The Gemini API rejects `2:1` and enumerates its supported set:

```
1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9
```

Wide email banners are 2:1. Distance from 2.0: `16:9` = 0.222, `21:9` = 0.357. **16:9 remains the correct snap for 2:1**, so the existing `nearestImagenRatio` approach stays — it only needs the expanded ratio list. Mirror-extend is NOT removable on the Gemini path.

### gpt-image-2 does 2:1 natively

`size: "2048x1024"` returned exactly 2048x1024 (ratio 2.000). Both edges must be multiples of 16; total pixels between 655,360 and 8,294,400. So the OpenAI path can generate at the target ratio and reach an exact banner size (e.g. 1200x600) through a plain lossless cover downscale — `resizeToExact` hits its 2% ratio check and never mirrors.

### Output format — Gemini returns JPEG

Both new Gemini models returned `image/jpeg`. `resizeToExact` currently ends every branch with `.png()`, which would re-encode a 2.5MB JPEG into a substantially larger PNG on every Drive upload.

### Pricing must come from usage, not constants

Observed image output tokens for comparable 2K renders:

| Model | image output tokens | other |
|---|---|---|
| `gpt-image-2` (2048x1024) | 132 | 15 text input |
| `gemini-3.1-flash-image` (21:9) | 1680 | — |
| `gemini-3-pro-image` (21:9) | 1120 | +142 thinking |

These tokenizations are not comparable across providers and none of them reconcile cleanly with the per-image figures on third-party pricing pages. Both providers DO return image token counts. Therefore image cost is computed from returned usage, mirroring `computeLlmCost`, rather than from a flat per-image constant.

## Design

### 1. Model registry

New `api/_image-models.ts`, mirrored by `src/lib/image-models.ts` — same duplication convention as `api/_pricing.ts` / `src/lib/pricing.ts`, because api/ and src/ cannot import across the boundary.

```ts
export interface ImageModelSpec {
  id: string;                    // literal API model id
  label: string;                 // dropdown label
  transport: 'gemini-api' | 'openai' | 'vertex';
  isCurrent?: boolean;           // renders "(current)", price hidden
  supportedAspectRatios: string[];
  outputMime: 'image/jpeg' | 'image/png';
  // null = no verified rate yet; UI shows "cost tracked from usage"
  imageTokenRatePerMillion: number | null;
  rateSource: string;
  lastVerified: string;
}
```

`DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'` — behaviour is byte-identical to today until Lena actively picks something else.

`gemini-3.1-flash-lite-image` is in the registry but not surfaced in the dropdown, so it can be enabled without a code change.

### 2. Transport helper

New `api/_gemini-image.ts` exposing one function used by all three Gemini operations:

```ts
generateGeminiImage({ modelId, prompt, aspectRatio, imageSize, inlineImage? })
  -> { bytes, mime, usage }
```

`inlineImage` present = edit/variation; absent = fresh generation. It resolves the endpoint from the registry, so the caller never builds a URL. Replaces the hardcoded `us-central1` URLs at `api/edit-image.ts:176` and `api/generate-variations-imagen.ts:331`.

Auth: Developer API via `GEMINI_API_KEY`, which is the path proven to work above and needs no OIDC. The existing Vertex/OIDC call is retained behind the registry's `transport: 'vertex'` for `gemini-2.5-flash-image`, so current Edit behaviour is untouched unless a new model is selected.

### 3. Gemini generation path

`api/generate-image.ts` gains a Gemini branch that calls `generateGeminiImage()` and then reuses the existing chain unchanged: `resizeToExact` → `uploadImageToDrive` → `makeFilePublic` → `logAssistantImageGen`. Cloud Run stays reachable via `backend: 'cloud-run'`; the new default is `backend: 'gemini-api'`.

`nearestImagenRatio` is renamed and re-pointed at the registry's `supportedAspectRatios` for the selected model, so ratio snapping follows the model rather than a hardcoded list.

### 4. resizeToExact — preserve JPEG

The final encode becomes conditional on the source mime: JPEG in, JPEG out (quality 92); PNG in, PNG out. Prevents JPEG→PNG size inflation on every Gemini upload. The mirror-extend and 2%-ratio-passthrough logic is unchanged.

### 5. OpenAI path

- Model string → `gpt-image-2` at all four call sites: `api/generate-image.ts:461`, `api/edit-image.ts:272`, `api/generate-variations.ts:390`, `api/[action].ts:933`.
- The three-entry `SUPPORTED` size table at `api/generate-image.ts:429` is replaced by: derive the target ratio, pick a multiple-of-16 pixel size at that exact ratio inside the pixel budget, request it. 2:1 banners become native.
- `resizeToExact` is left in place and self-disables via its 2% check.
- `WIDE_FRAMING` (`api/generate-image.ts:411`) is KEPT for now. It was tuned to compensate for a crop that will no longer happen, so it is flagged for removal after visual comparison — not removed silently in this change.

### 6. Cost tracking

- `computeImageCost()` gains a `model` parameter and an overload that prices from returned image token counts. The existing `(provider, size, quality)` lookup is retained as a fallback so already-logged rows still price.
- When a model's `imageTokenRatePerMillion` is `null`, `computeImageCost()` returns `null` and the tracker displays the raw token count with "rate pending" rather than a dollar figure. It never guesses a rate. Filling in a verified rate is a one-line registry edit that immediately backfills cost for every already-logged row, since the token counts are stored.
- `api/generate-image.ts:665` currently logs the literal string `'imagen'` instead of a model id, which is why Gemini image spend cannot be attributed today. It will log the real model id and the returned usage.
- `CostTrackerPanel` gains a per-model image breakdown so Lena can read cost-per-render per model directly.

### 7. UI

New `src/components/ImageModelSelect.tsx` — Gemini only. Shows `(current)` on 2.5-flash-image with no price, and for the new models either a verified rate or "cost tracked from usage" where no rate is confirmed. No invented numbers.

Rendered next to the Gemini button in `src/components/ResultDisplay.tsx:871` and in `src/components/assistant/GeneratedPromptPanel.tsx`. Selection persists to localStorage and is sent as `geminiModel` in the `/api/generate-image` body.

## Testing

Unit:

- `api/_image-models.test.ts` — every entry has transport, ratios, mime; the dropdown set is a subset of the registry.
- `api/_gemini-image.test.ts` — endpoint resolution per transport; JPEG passthrough.
- extend `api/_pricing.test.ts` — usage-based costing plus legacy fallback.
- extend `api/generate-image.test.ts` — multiple-of-16 sizing, ratio snapping against the verified Gemini ratio list, `2:1` never sent to Gemini.

Manual (`npm run dev` does not serve `/api`, so real calls need a Vercel preview):

- Locally, with screenshots before/after: dropdown renders, persists, and shows a clear error when a model call fails.
- On preview: 3 Gemini models × {1:1, 16:9, 2:1} plus gpt-image-2 × the same = 12 renders. Screenshot each, record cost from the tracker, confirm the 2:1 OpenAI render is un-mirrored and the Gemini 2:1 renders are still clean.

## Risks

1. **No verified per-image rates.** Third-party figures did not reconcile with observed usage. Mitigated by pricing from returned tokens and labelling unverified rates honestly in the UI. Reconcile against the GCP and OpenAI billing consoles after the 12-render batch.
2. **`-preview` aliases exist alongside stable ids.** The registry pins the non-preview ids; if a stable id is later withdrawn the dropdown must fail loudly rather than silently fall back.
3. **Edit-path drift.** Applying a new model to the tuned strict-preservation edit prompt may change edit behaviour. Accepted by the user during brainstorming. The prompt is left byte-identical, and Edit can be pinned back to 2.5-flash-image independently via the registry.
4. **`imageSize` semantics are loose.** `"2K"` returned 3168px wide. Returned dimensions will be logged so unexpected sizes are visible.
5. **Image spend is outside the spend cap.** `api/_spend-cap.ts:12` documents that only LLM calls are capped. A pricier image model widens that gap. Out of scope here; worth a follow-up.

## Out of scope

- AI Concept Assistant upgrade (separate brainstorm)
- Adding image cost to the daily spend cap
- Non-Google/non-OpenAI providers
- The stale `"OpenAI (gpt-4o)"` label in `src/components/assistant/ModelSelect.tsx:6` (that is the text model, really `gpt-5.2`) — one-line fix, include on request
