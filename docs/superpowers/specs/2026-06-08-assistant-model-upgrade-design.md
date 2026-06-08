# Assistant Model Upgrade — Tiered by Stage

- **Date:** 2026-06-08
- **Status:** Design — awaiting user review
- **Author:** Claude (brainstorm with John)
- **Topic:** Upgrade the AI Concept Assistant's LLMs to current-generation models, tiered per stage.

## Context

The AI Concept Assistant (`api/assistant/{concepts,generate,refine}.ts`, fronted by
`src/pages/AssistantPage.tsx`, token-gated at `/assistant/<token>`) is a 3-stage flow:

```
concepts  → user picks one → generate (structured fields) → user iterates → refine
```

It currently runs on **prior-generation models**:

| Stage | OpenAI (current) | Gemini (current) |
|-------|------------------|------------------|
| concepts | `gpt-4o-mini` | `gemini-2.5-flash` |
| generate | `gpt-4o` | `gemini-2.5-flash` |
| refine | `gpt-4o` | `gemini-2.5-flash` |

The text LLMs are wrapped by `api/_llm.ts` (`chat()`), which talks to OpenAI Chat
Completions and the Gemini `generateContent` endpoint, with one-shot retry on 5xx.

## Problem / Goal

**Goal:** raise the assistant's output quality ("overall model power") by moving to
current-gen models, **tiered by stage** so the strongest reasoning is applied only
where it pays off, while respecting the platform's hard constraints.

**Non-goals:**
- Not touching the main prompt generator (`api/generate-prompt.ts`) — separate path.
- Not wiring the stubbed `claude` provider (explicitly deferred by user).
- Not changing the image-generation pipeline.
- Not changing the assistant UX/flow — only the models behind it.

## Hard constraints (these shaped every decision)

1. **Vercel hobby 10s function timeout.** `api/assistant/generate.ts` already documents
   that `gemini-2.5-pro` takes 14–18s and blows past this. Any model on any stage must
   return within ~10s. This rules out Pro/flagship tiers and high reasoning effort.
2. **Spend cap.** `api/_spend-cap.ts` (`checkSpendCap`) enforces a daily USD cap per test
   user. Stronger models cost more per token.
3. **Concepts diversity mechanism.** Concepts relies on `temperature: 0.9` plus a rotating
   creative lens (`pickConceptLens`) and an avoid-list (`buildAvoidClause`) to keep the 3
   ideas distinct and fresh across regenerations. The lens + avoid-list are the primary
   drivers; temperature is a secondary spread lever.

## Verified facts (June 2026)

- **OpenAI `gpt-5.2`**: $1.75/M input, $14/M output. Supports `reasoning_effort` =
  `none` (default), `low`, `medium`, `high`, `xhigh`. At `effort=none` it is the
  low-latency path (substantially faster than 5.1/4.1). Supports structured outputs
  (strict `json_schema`). Available in the Chat Completions API — **no Responses API
  rewrite needed.** Custom `temperature` support on the reasoning model is unconfirmed in
  docs; design assumes it may be rejected.
- **Gemini**: `gemini-3.5-flash` (frontier + speed, current top Flash) and
  `gemini-3.1-flash-lite` (cheapest/fastest tier). Flash tier stays fast → timeout-safe.
  Pro tier (`gemini-3.1-pro`) is the slow/expensive one we continue to avoid.
- Exact Gemini model slugs (`gemini-3.5-flash`, `gemini-3.1-flash-lite`) must be confirmed
  against the live `models` endpoint during implementation.

## Decision — tiered model map

Tiering runs on two axes: **model tier** (Gemini) and **`reasoning_effort`** (OpenAI).

| Stage | Need | OpenAI (new) | Gemini (new) |
|-------|------|--------------|--------------|
| **concepts** | creativity + diversity, fast | `gpt-5.2` @ `effort=none` | `gemini-3.5-flash` |
| **generate** | templated 8-field JSON, cheap/fast | `gpt-5.2` @ `effort=none` | `gemini-3.1-flash-lite` |
| **refine** | intent reasoning (clarify vs refine, "not-X = add-X") | `gpt-5.2` @ `effort=low` | `gemini-3.5-flash` |

**Resolved sub-decisions:**
- `generate` Gemini = `gemini-3.1-flash-lite` (cheapest tier; bump back to `3.5-flash`
  only if brand adherence visibly drops in testing).
- `concepts` diversity: **drop the custom temperature for `gpt-5.2`** and rely on the
  existing lens-rotation + avoid-list. (Keep `temperature` for the Gemini path, which
  still accepts it.)

## Code changes

### 1. `api/_llm.ts`
- Add optional `reasoningEffort?: 'none' | 'low' | 'medium' | 'high'` to `ChatOptions`.
- In `chatOpenAI`:
  - When `reasoningEffort` is set, include `reasoning_effort` in the request body.
  - **Do not send a custom `temperature` for `gpt-5.x` models** (guard by model-id prefix,
    e.g. `model.startsWith('gpt-5')`). Continue sending `temperature` for non-5.x models
    and for Gemini.
  - Keep `max_completion_tokens`. Because `effort=low` (refine) consumes reasoning tokens
    that count toward this budget, raise refine's OpenAI `maxTokens` headroom (e.g.
    1200 → ~3000) so output is not truncated.
  - Keep using the Chat Completions endpoint.
- In `chatGemini`: the existing `thinkingBudget: 0` is applied to any model whose id
  includes `flash`. Verify `gemini-3.5-flash` and `gemini-3.1-flash-lite` accept
  `thinkingConfig.thinkingBudget = 0`; if a 3.x flash model rejects it, guard so the key
  is only sent to models known to support it.

### 2. New `api/_assistant-models.ts`
- Single source of truth for the per-stage, per-provider model map **and** the per-stage
  `reasoning_effort`, replacing the three separate `*_MODEL` / `MAX_TOKENS` constants now
  hardcoded in `concepts.ts`, `generate.ts`, `refine.ts`.
- Shape (illustrative):
  ```ts
  export const ASSISTANT_MODELS = {
    concepts: { openai: { model: 'gpt-5.2', effort: 'none' }, gemini: { model: 'gemini-3.5-flash' } },
    generate: { openai: { model: 'gpt-5.2', effort: 'none' }, gemini: { model: 'gemini-3.1-flash-lite' } },
    refine:   { openai: { model: 'gpt-5.2', effort: 'low'  }, gemini: { model: 'gemini-3.5-flash' } },
  } as const;
  export const ASSISTANT_MAX_TOKENS = { /* per stage/provider, with refine OpenAI raised */ };
  ```
- The three endpoints import from here instead of defining their own maps.

### 3. The three endpoints
- `concepts.ts`, `generate.ts`, `refine.ts`: read model + effort + maxTokens from
  `_assistant-models.ts`; pass `reasoningEffort` through to `chat()`. No flow changes.

## Cost & spend cap

- Per-call token counts are small (concepts ~1.2k out, generate ~1.2–2k out, refine
  ~1.2–3k out), so absolute cost per call stays low even at `gpt-5.2` rates.
- `checkSpendCap` continues to guard the daily total. Revisit the cap value after the
  upgrade if real usage trips it (out of scope to change the number now; flag if needed).

## Testing & verification

1. `npx tsc --noEmit`
2. `npx vitest run` — existing tests: `concepts.test.ts`, `generate.test.ts`,
   `refine.test.ts`, `_llm.test.ts`, `_assistant-prompts.test.ts`. Update any that assert
   specific model ids.
3. `npm run build`
4. **Live smoke test** at `/assistant/<token>` (token in `.env.local`,
   `VITE_ASSISTANT_TOKENS`) on **Roosterbet**, both providers:
   - concepts: 3 distinct, on-brand ideas; regenerate gives fresh ones (diversity intact
     without the OpenAI temperature lever).
   - generate: 8 fields populated, brand palette/mandate applied.
   - refine: a clear instruction refines; a vague one clarifies; "this is not X like I
     told you" ADDS X. **Confirm each call returns under the 10s timeout** — especially
     `refine @ effort=low`. If refine is slow, fall back to `effort=none`.
- Unit tests mock fetch and miss platform/latency/LLM issues, so the live test is required
  before claiming done.

## Rollout

- Branch, implement, verify locally, then `git push origin main` → Vercel auto-deploys
  (only on user approval, per project rule — never auto-deploy).
- The auto-commit hook commits each edit as "auto: Claude edit"; pushing is the deploy gate.

## Risks / open items

- **Latency of `refine @ effort=low`** vs the 10s timeout — primary risk; mitigated by the
  `effort=none` fallback and live measurement.
- **Custom temperature rejection** by `gpt-5.2` — mitigated by dropping it for 5.x and
  leaning on lens + avoid-list (already the main diversity driver).
- **Gemini 3.x flash + `thinkingBudget:0`** compatibility — verify; guard if needed.
- **Exact Gemini model slugs** — confirm against the live models endpoint before shipping.
