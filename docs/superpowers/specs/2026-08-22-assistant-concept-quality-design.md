# AI Concept Assistant — Concept Idea Quality

**Date:** 2026-08-22
**Status:** Awaiting review
**Scope:** Sub-project A of 3 in the AI Concept Assistant upgrade.

## Goal

Lena reports two distinct problems with the three directions the Assistant drafts:

1. **Obvious / clichéd** — each concept is distinct enough from the others, but they are all predictable takes on the brief.
2. **Too similar to each other** — the three read like one idea rendered three ways.

These have different root causes and need different fixes. This spec addresses both.

Explicitly NOT in this spec: the workflow restructuring (sub-project C — branching, comparing, going back), the missing capabilities (sub-project B — the hardcoded 16:9/1K, reference-image input), and loosening brand mandates (a brand decision, not a code change).

## Root causes

### "Too similar" is structural, not a prompting failure

All three concepts come from **one model call with one creative lens**. `api/assistant/concepts.ts` picks a single lens via `pickConceptLens()` and asks for three concepts in one response. A single call asked to produce three distinct items converges on one strong direction and generates variations of it.

The existing prompt already fights this in prose — "if two concepts could share one background, they are too similar; push them apart" — and the code already rotates lenses per request and maintains an avoid-list of the last 15 concept gists. Those levers are pulled. What is missing is a structural guarantee.

Observed head-to-head on a real brand (LuckyVibe, "weekend cashback boost"), same model (`gemini-3.5-flash`):

| Design | Concepts produced | Axes varied |
|---|---|---|
| Current (1 call, 1 lens = "unexpected setting") | Golden Foundry (brutalist warehouse) / Alpine Solstice (mountain ridge) / Retro-Futuristic Solarium (glass dome) | Setting only — all three are environment shots, no people, no action |
| Fan-out (3 calls, 3 distinct lenses) | Concrete Crucible (skatepark, skater mid-air) / Golden Relief (two friends leaping into surf) / Golden Splash (worm's-eye, hand catching a coin) | Setting, shot type, human presence, emotional register |

The current design varies along **one** axis because one lens spans all three concepts. Fan-out varies along **three** axes because each concept is drawn under a different constraint.

Fan-out was also faster: 5s wall-clock versus 8s, because the calls run concurrently with smaller outputs each.

**Evidence strength: one sample per variant.** The mechanism is sound and the difference is visible, but this is not proven. See Verification.

### "Obvious" is a handicapped model tier

`api/_assistant-models.ts:3` states:

> Constraint: every entry must return within Vercel's 10s function timeout — that is why no Pro/flagship tier appears here and reasoning effort stays low.

That constraint is stale. A production `/api/generate-image` call was measured succeeding at **27 seconds** on 2026-08-22, so the real budget is at least that and almost certainly 60s. The concepts stage therefore runs on a Flash model with reasoning effectively off to fit a budget roughly 6x smaller than what exists.

### A latent truncation bug

`ASSISTANT_MODELS.concepts.gemini.maxTokens` is 1200. With a long brand mandate in the system prompt (LuckyVibe's and Roosterbet's run to several hundred words), the response truncates mid-JSON. `JSON.parse(result.text)` then throws and the handler returns 500. Reproduced while testing: an unterminated-string parse error at 1200 tokens that disappeared at 4000.

The refine stage already learned this — its comment reads "maxTokens raised so reasoning tokens don't truncate the JSON output" — but concepts never got the same treatment. Gemini output pricing explicitly includes thinking tokens, which is why the budget is consumed faster than the visible output suggests.

## Verified facts

Measured against live APIs on 2026-08-22 with this project's `GEMINI_API_KEY`, and against the official published rate cards.

### Latency

| Model | Single concepts-style call |
|---|---|
| `gemini-3.5-flash` (current) | 8s |
| `gemini-3.7-flash` | 7s |
| `gemini-3.1-pro-preview` | 17s |

All fit the real budget. Three parallel calls cost roughly the latency of the slowest one.

### Official text rates (per 1M tokens)

| Model | Input | Output (includes thinking) |
|---|---|---|
| `gemini-3.5-flash` | $1.50 | $9.00 |
| `gemini-3.7-flash` | $0.75 (rises to $1.50 on 2027-01-01) | $3.75 (rises to $7.50) |
| `gemini-3.1-pro-preview` | $2.00 (prompts <= 200k) | $12.00 (prompts <= 200k) |
| `gemini-3.5-flash-lite` | $0.30 | $2.50 |
| `gpt-5.2` | $1.75 (cached $0.175) | $14.00 |

Source: ai.google.dev/gemini-api/docs/pricing and developers.openai.com/api/docs/pricing, captured 2026-08-22.

### Cost per concept set

Estimating ~150 input and ~400 output tokens per concept call, plus a synthesis call:

- On `gemini-3.1-pro-preview`: **~$0.017 per set of three**
- On `gemini-3.7-flash`: **~$0.006 per set of three**

Both are negligible against a single image render ($0.039 on 2.5 Flash Image, $0.134 on 3 Pro Image). Cost is therefore not a constraint on this choice, which is why the more capable tier is the default.

### Models available on this key

`gemini-3.1-pro-preview`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-pro`, plus others. The currently-configured `gemini-3.5-flash` is neither the newest nor the cheapest Flash tier available.

## Design

### 1. Fan-out in the concepts endpoint

`api/assistant/concepts.ts` changes from one call to four:

- **3 parallel calls**, each with a different lens, each asked for exactly ONE concept.
- **1 synthesis call** that sees all three and returns the recommendation sentence.

The HTTP response shape is unchanged — `{ concepts: AssistantConcept[], recommendation: string, usage }` — so `src/pages/AssistantPage.tsx`, `src/lib/assistant-types.ts`, `src/lib/concept-avoid.ts` and `mergeAvoid` need no edits. The entire change is behind the endpoint.

Latency: ~17-20s for the parallel Pro calls plus ~3s synthesis. Within budget, and comparable to today once the model tier rises.

### 2. Distinct lens selection

New in `api/_assistant-prompts.ts`:

```ts
export function pickConceptLenses(n: number, rand?: () => number): string[]
```

Samples `n` DISTINCT lenses without replacement from `CONCEPT_LENSES` (7 entries). If `n` exceeds the pool size, returns the whole pool shuffled — never a duplicate. This is the mechanism that guarantees the three concepts vary on different axes.

`pickConceptLens()` (single) is replaced; its only caller is this endpoint.

### 3. Single-concept prompt and schema

New in `api/_assistant-prompts.ts`:

```ts
export function buildSingleConceptSystemPrompt(brand: string): string
export const SINGLE_CONCEPT_JSON_SCHEMA
```

The single-concept prompt keeps `PERSONALITY`, `brandBlock(brand)`, `SUBJECT_NEUTRALITY`, and the expand-thinking instruction. It DROPS the inter-concept diversity paragraph, which is meaningless when the call produces one concept, and states that the supplied lens is the defining constraint for this concept rather than one suggestion among many.

`SINGLE_CONCEPT_JSON_SCHEMA` requires `concepts` with exactly 1 item and does not require `recommendation`.

`buildConceptsSystemPrompt` and `CONCEPTS_JSON_SCHEMA` are retained unchanged — they are the fallback path (see Error handling) and removing them would widen the change unnecessarily.

### 4. Recommendation synthesis

New in `api/_assistant-prompts.ts`:

```ts
export function buildRecommendationPrompt(concepts: AssistantConcept[]): { system: string; user: string }
```

Returns one sentence naming which concept to pick and why, matching the existing `recommendation` field's tone and length. It needs the cross-concept view, so it cannot be folded into the parallel calls. Runs on the cheapest tier.

### 5. Model registry

`api/_assistant-models.ts`:

- Replace the stale 10s comment with the measured reality: a production image-generation call succeeded at 27s on 2026-08-22, so the budget is at least that; entries are chosen for quality within roughly 30s, not 10s.
- `concepts.gemini`: `gemini-3.5-flash` -> `gemini-3.1-pro-preview`, `maxTokens` 1200 -> 4000.
- `concepts.openai`: keep `gpt-5.2`; raise `effort` from `'none'` to `'low'` and `maxTokens` to 4000.
- Add a new stage `recommend`, using `gemini-3.5-flash-lite` (Gemini) and `gpt-5.2` with `effort: 'none'` (OpenAI), `maxTokens: 600`.

`AssistantStage` becomes `'concepts' | 'generate' | 'refine' | 'recommend'`.

Documenting the fallback explicitly: if Pro latency proves a problem in practice, `gemini-3.7-flash` is a one-field change and is both cheaper and faster than the model in use today.

### 6. Cost visibility

`LLM_PRICING` in `api/_pricing.ts` and its mirror `src/lib/pricing.ts` has no entry for any model the Assistant actually runs, which is why every LLM row in the Cost Tracker reads "price unknown". A model change is unmeasurable without this.

Add entries with the verified rates above for: `gemini-3.5-flash`, `gemini-3.7-flash`, `gemini-3.1-pro-preview`, `gemini-3.5-flash-lite`, `gpt-5.2`. Existing entries stay untouched so historical rows keep pricing.

Add a test asserting **every model referenced by `ASSISTANT_MODELS` has an `LLM_PRICING` entry**. That structurally prevents this class of gap recurring the next time a stage's model changes.

Note `gemini-3.7-flash` has a scheduled price rise on 2027-01-01; record it in the entry's `source`/`last_updated` so it does not silently go stale.

### 7. Error handling — an improvement over today

Today one failed call fails the whole request. Fan-out allows graceful degradation:

- **1 or 2 of 3 calls fail** -> return the concepts that succeeded. `AssistantConcept[]` has no length constraint in the type and the UI maps over it, so two concepts render correctly. Log the failures.
- **All 3 fail** -> 500 with the underlying error detail, as today.
- **Synthesis fails** -> return the concepts with `recommendation: ''`. Non-fatal; the UI already handles an empty string.
- **Spend cap** is checked once before the fan-out, as today.
- Each of the 4 calls logs its own `logLlmCall` row so cost stays accurate. The three concept calls log step `concepts`; the synthesis call logs step `concepts-recommend`.

## Testing

Unit:

- `pickConceptLenses` — returns `n` distinct lenses; never duplicates; `n` greater than the pool returns the whole pool; deterministic under a seeded `rand`.
- `SINGLE_CONCEPT_JSON_SCHEMA` — requires exactly one concept; does not require `recommendation`.
- `buildSingleConceptSystemPrompt` — includes the brand block and subject-neutrality guard; does NOT include the inter-concept diversity paragraph.
- `api/assistant/concepts.ts` (mocking `chat`) — fans out to exactly 3 calls with 3 DIFFERENT lenses; a partial failure returns the surviving concepts rather than 500; all-fail returns 500; synthesis failure yields an empty recommendation; four `logLlmCall` rows are written.
- `api/_pricing.test.ts` — every model in `ASSISTANT_MODELS` has an `LLM_PRICING` entry; the new rates match the figures in this spec.

Manual (`npm run dev` does not serve `/api`, so this needs a Vercel preview):

- **The evidence this spec is missing.** Run 3-4 concept sets across two or three of Lena's real brands (at minimum one with a heavy mandate such as LuckyVibe or Roosterbet, and one with a light one). For each set, record: do the three concepts differ in KIND (shot type, human presence, emotional register) rather than only in setting? Are any obviously clichéd? Compare against the current design on the same briefs before merging.
- Confirm the Cost Tracker now shows real figures for concept calls instead of "price unknown", and that a set costs roughly the $0.017 estimated above.
- Confirm a long-mandate brand no longer truncates.

## Risks

1. **The diversity claim rests on one sample.** The mechanism is sound and the observed difference was clear, but a single A/B is not proof. The manual verification above is the gate, not a formality — if the fan-out does not visibly improve variety-in-kind on real brands, the model-tier and truncation fixes still stand on their own and the fan-out should be reconsidered.
2. **Brand mandates still dominate.** LuckyVibe mandates sunset lighting for any scene; FortunePlay mandates gold dust. No amount of lens variety escapes a mandated palette and light source. If Lena's "too similar" complaint is partly about that, the real fix is editing the mandates, which is out of scope here and is a brand decision.
3. **4 calls instead of 1** widens the failure surface and the spend-cap accounting. Mitigated by graceful degradation and by the cap being checked before any call fires.
4. **Pro-tier latency** at 17s per call is well inside the measured budget but is roughly double today's. If a future stage is added to the same request, the total needs re-measuring.
5. **`gemini-3.1-pro-preview` is a preview model.** Preview ids can be withdrawn. The registry pins it explicitly rather than using an alias so a withdrawal fails loudly; `gemini-3.7-flash` is the documented fallback.

## Out of scope

- Sub-project B — the Assistant's hardcoded `aspectRatio: '16:9'` / `resolution: '1K'`, reference-image input, variations from the Assistant page.
- Sub-project C — workflow restructuring: branching, comparing concepts side by side, blending, going back.
- Loosening or rewriting brand mandates.
- Changing the concept count from three.
- The stale `"OpenAI (gpt-4o)"` label in `src/components/assistant/ModelSelect.tsx:6` (the model is really `gpt-5.2`) and the unused `src/hooks/useAssistantImageGen.ts` — both trivial cleanups, noted for a follow-up.
