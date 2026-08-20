# Image Model Selection — Design

**Date:** 2026-08-20
**Status:** Approved scope, ready for implementation plan
**Scope:** Sub-project 1 of 3 from the Lena model-review meeting.

## Goal

Two things, both aimed at answering "is the better model worth the money":

1. Move OpenAI image generation onto the current model (`gpt-image-2`).
2. Give Gemini a two-entry model dropdown — the existing model and the latest —
   with the **price shown on the new one** so Lena can measure whether the
   quality gain justifies the cost.

Everything is driven from one model registry so a model id and its price are
never written down in two places.

Explicitly NOT in this spec: the AI Concept Assistant upgrade (its own
brainstorm), and choosing a non-Google/non-OpenAI image provider.

## Decisions taken

| Decision | Choice |
|---|---|
| Build order | Model plumbing first; Assistant upgrade separate |
| Dropdown covers | Generate + Edit + Variations (all three) |
| Gemini dropdown entries | **2** — `gemini-2.5-flash-image` (current) + `gemini-3-pro-image` (latest) |
| OpenAI | Pinned to `gpt-image-2`, no dropdown |
| Price display | Shown on the new Gemini model only; current model shows "(current)" |
| Transport | Direct Gemini API from this repo; Cloud Run kept as fallback |
| Dropdown placement | Main app + Assistant page (shared component) |
| Mirror-extend | Request native ratio; keep `resizeToExact` as a self-disabling safety net |

## Verified facts

Checked against live APIs on 2026-08-20 using the project's own keys, and
against the official published rate cards. These supersede the third-party
pricing pages consulted earlier, which did not reconcile.

### Model access — CONFIRMED by real generation

`GEMINI_API_KEY` (Developer API, `generativelanguage.googleapis.com`) lists and
successfully generates with `gemini-2.5-flash-image`, `gemini-3.1-flash-image`,
`gemini-3-pro-image`, `gemini-3.1-flash-lite-image` (plus `-preview` aliases).

`OPENAI_API_KEY` lists `gpt-image-2`, `gpt-image-2-2026-04-21`,
`gpt-image-1.5`, `gpt-image-1-mini`, `gpt-image-1`, `chatgpt-image-latest`.

Real generation calls returned HTTP 200 with image bytes for
`gemini-3.1-flash-image`, `gemini-3-pro-image`, `gpt-image-2` and `gpt-image-1`.
Entitlement is proven, not merely catalogued.

### Official token rates

| Model | text input /M | image output /M |
|---|---|---|
| `gemini-2.5-flash-image` | $0.30 | $30.00 |
| `gemini-3-pro-image` | $2.00 | $120.00 |
| `gpt-image-2` | $5.00 | $30.00 |
| `gpt-image-1` | $5.00 | $40.00 |

### Measured cost per image

| Path | Model | Size / quality | Observed output tokens | Cost per image |
|---|---|---|---|---|
| OpenAI today | `gpt-image-1` | 1536x1024 high | 6208 | **$0.2484** |
| OpenAI new | `gpt-image-2` | 2048x1024 high | 4720 | **$0.1417** |
| OpenAI new, preview | `gpt-image-2` | 2048x1024 low | 132 | **$0.0040** |
| Gemini today | `gemini-2.5-flash-image` | 1024x1024 | 1290 (official) | **$0.039** |
| Gemini new | `gemini-3-pro-image` | 2K | 1120 | **$0.134** |

The OpenAI move is a straight win: 43% cheaper, larger output, and native 2:1.
The Gemini move is the actual cost-vs-quality question — 3.4x the current price.

Token count multiplied by the official rate reproduces Google's own published
per-image figure to the cent (1120 x $120/M = $0.1344 vs published $0.134;
1680 x $60/M = $0.1008 vs published $0.101). Usage-based costing is therefore
exact, not an estimate.

### Aspect ratios — Gemini cannot do 2:1

The Gemini API rejects `2:1` and enumerates its supported set:

```
1:1, 1:4, 1:8, 2:3, 3:2, 3:4, 4:1, 4:3, 4:5, 5:4, 8:1, 9:16, 16:9, 21:9
```

Wide email banners are 2:1. Distance from 2.0: `16:9` = 0.222, `21:9` = 0.357.
**16:9 remains the correct snap for 2:1**, so the existing `nearestImagenRatio`
approach stays — it only needs the expanded ratio list. Mirror-extend is NOT
removable on the Gemini path.

### gpt-image-2 does 2:1 natively

`size: "2048x1024"` returned exactly 2048x1024 (ratio 2.000). Both edges must be
multiples of 16; total pixels between 655,360 and 8,294,400. So the OpenAI path
can generate at the target ratio and reach an exact banner size (e.g. 1200x600)
through a plain lossless cover downscale — `resizeToExact` hits its 2% ratio
check and never mirrors.

### Output format — Gemini returns JPEG

Both new Gemini models returned `image/jpeg`. `resizeToExact` currently ends
every branch with `.png()`, which would re-encode a 2.5MB JPEG into a
substantially larger PNG on every Drive upload.

## Design

### 1. Model registry

New `api/_image-models.ts`, mirrored by `src/lib/image-models.ts` — same
duplication convention as `api/_pricing.ts` / `src/lib/pricing.ts`, because api/
and src/ cannot import across the boundary.

```ts
export interface ImageModelSpec {
  id: string;                        // literal API model id
  label: string;                     // dropdown label
  transport: 'gemini-api' | 'openai' | 'vertex';
  isCurrent?: boolean;               // renders "(current)", price hidden
  inDropdown: boolean;               // false = available but not surfaced
  supportedAspectRatios: string[];
  outputMime: 'image/jpeg' | 'image/png';
  textInputRatePerMillion: number;
  imageOutputRatePerMillion: number;
  // Headline figure shown in the dropdown, from the official rate card.
  displayPricePerImage: number | null;
  rateSource: string;
  lastVerified: string;
}
```

Dropdown entries: `gemini-2.5-flash-image` (`isCurrent`, no price shown) and
`gemini-3-pro-image` (`displayPricePerImage: 0.134`).

`gemini-3.1-flash-image` and `gemini-3.1-flash-lite-image` are in the registry
with `inDropdown: false`, so promoting either is a one-field change if Pro turns
out not to be worth it.

`DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'` — behaviour is
byte-identical to today until Lena actively picks something else.

### 2. Transport helper

New `api/_gemini-image.ts` exposing one function used by all three Gemini
operations:

```ts
generateGeminiImage({ modelId, prompt, aspectRatio, imageSize, inlineImage? })
  -> { bytes, mime, usage }
```

`inlineImage` present = edit/variation; absent = fresh generation. It resolves
the endpoint from the registry, so the caller never builds a URL. Replaces the
hardcoded `us-central1` URLs at `api/edit-image.ts:176` and
`api/generate-variations-imagen.ts:331`.

Auth: Developer API via `GEMINI_API_KEY` — the path proven to work above, needing
no OIDC. The existing Vertex/OIDC call is retained behind the registry's
`transport: 'vertex'` for `gemini-2.5-flash-image`, so current Edit behaviour is
untouched unless the new model is selected.

### 3. Gemini generation path

`api/generate-image.ts` gains a Gemini branch that calls `generateGeminiImage()`
and then reuses the existing chain unchanged: `resizeToExact` ->
`uploadImageToDrive` -> `makeFilePublic` -> `logAssistantImageGen`. Cloud Run
stays reachable via `backend: 'cloud-run'`; the new default is
`backend: 'gemini-api'`.

`nearestImagenRatio` is renamed and re-pointed at the registry's
`supportedAspectRatios` for the selected model, so ratio snapping follows the
model rather than a hardcoded list.

### 4. resizeToExact — preserve JPEG

The final encode becomes conditional on the source mime: JPEG in, JPEG out
(quality 92); PNG in, PNG out. Prevents JPEG->PNG size inflation on every Gemini
upload. Mirror-extend and the 2%-ratio passthrough are unchanged.

### 5. OpenAI path

- Model string -> `gpt-image-2` at all four call sites:
  `api/generate-image.ts:461`, `api/edit-image.ts:272`,
  `api/generate-variations.ts:390`, `api/[action].ts:933`.
- The three-entry `SUPPORTED` size table at `api/generate-image.ts:429` is
  replaced by: derive the target ratio, pick a multiple-of-16 pixel size at that
  exact ratio inside the pixel budget, request it. 2:1 banners become native.
- `resizeToExact` is left in place and self-disables via its 2% check.
- `WIDE_FRAMING` (`api/generate-image.ts:411`) is KEPT for now. It was tuned to
  compensate for a crop that will no longer happen, so it is flagged for removal
  after visual comparison — not removed silently in this change.
- The existing `qualityMap` (1K -> low, >=2K -> high) is unchanged, so banners
  stay on `high`. That is the $0.1417 figure above.

### 6. Cost tracking

- `computeImageCost()` gains a `model` parameter and prices from returned image
  token counts against the registry rates. The existing
  `(provider, size, quality)` lookup is retained as a fallback so already-logged
  rows still price.
- `api/generate-image.ts:665` currently logs the literal string `'imagen'`
  instead of a model id, which is why Gemini image spend cannot be attributed
  today. It will log the real model id and the returned usage.
- `CostTrackerPanel` gains a per-model image breakdown so Lena can read actual
  cost-per-render per model and compare it against the dropdown's headline
  figure.

### 7. UI

New `src/components/ImageModelSelect.tsx` — Gemini only, two entries:

```
Gemini model
┌──────────────────────────────────────┐
│ 2.5 Flash Image   (current)       ✓  │
│ 3 Pro Image       $0.134 / image     │
└──────────────────────────────────────┘
```

Rendered next to the Gemini button in `src/components/ResultDisplay.tsx:871` and
in `src/components/assistant/GeneratedPromptPanel.tsx`. Selection persists to
localStorage and is sent as `geminiModel` in the `/api/generate-image` body.

## Testing

Unit:

- `api/_image-models.test.ts` — every entry has transport, ratios, mime, rates;
  dropdown entries are a subset of the registry; exactly one `isCurrent`.
- `api/_gemini-image.test.ts` — endpoint resolution per transport; JPEG passthrough.
- extend `api/_pricing.test.ts` — usage-based costing reproduces the published
  per-image figures ($0.134 for 1120 tokens at $120/M); legacy fallback intact.
- extend `api/generate-image.test.ts` — multiple-of-16 sizing, ratio snapping
  against the verified Gemini ratio list, `2:1` never sent to Gemini.

Manual (`npm run dev` does not serve `/api`, so real calls need a Vercel preview):

- Locally, with before/after screenshots: dropdown renders both entries, shows
  the price on the new one only, persists across reload, and surfaces a clear
  error when a model call fails.
- On preview: 2 Gemini models x {1:1, 16:9, 2:1} plus gpt-image-2 x the same =
  9 renders. Screenshot each, record cost from the tracker, confirm the 2:1
  OpenAI render is un-mirrored and the Gemini 2:1 renders are still clean.

## Risks

1. **Edit-path drift.** Applying `gemini-3-pro-image` to the tuned
   strict-preservation edit prompt may change edit behaviour. Accepted by the
   user during brainstorming. The prompt is left byte-identical, and Edit can be
   pinned back to `gemini-2.5-flash-image` independently via the registry.
2. **`-preview` aliases exist alongside stable ids.** The registry pins the
   non-preview ids; if a stable id is later withdrawn the dropdown must fail
   loudly rather than silently fall back.
3. **`imageSize` semantics are loose.** `"2K"` returned 3168px wide. Returned
   dimensions will be logged so unexpected sizes are visible. Note the published
   Pro price is flat across 1K and 2K ($0.134), so this does not change cost.
4. **Rate drift.** `displayPricePerImage` is a published figure captured
   2026-08-20 and carries `lastVerified`. Usage-based costing is computed from
   the same registry rates, so the dropdown figure and the tracker cannot
   disagree — but both go stale together if Google or OpenAI reprice.
5. **Image spend is outside the spend cap.** `api/_spend-cap.ts:12` documents
   that only LLM calls are capped. Moving to a $0.134/image model widens that
   gap. Out of scope here; worth a follow-up.

## Out of scope

- AI Concept Assistant upgrade (separate brainstorm)
- Adding image cost to the daily spend cap
- Non-Google/non-OpenAI providers
- A cheap `gpt-image-2` low-quality draft mode ($0.0040/image, 10x cheaper than
  current Gemini) — a real opportunity surfaced by the cost measurements, but a
  separate feature
- The stale `"OpenAI (gpt-4o)"` label in
  `src/components/assistant/ModelSelect.tsx:6` (that is the text model, really
  `gpt-5.2`) — one-line fix, include on request
