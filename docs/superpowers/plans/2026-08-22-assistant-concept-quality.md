# AI Concept Assistant — Concept Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Assistant's three concept directions less obvious and genuinely different in kind, by drawing each from a separate model call under a different creative lens, on a stronger model tier, with a token budget that doesn't truncate.

**Architecture:** `POST /api/assistant/concepts` changes from one model call producing three concepts to **three parallel calls each producing one concept under a distinct creative lens**, plus one cheap synthesis call for the recommendation sentence. The HTTP response shape is unchanged, so the entire change lands behind the endpoint and no frontend file is touched.

**Tech Stack:** Vercel serverless API routes (`api/*.ts`), TypeScript, vitest 4, Gemini Developer API + OpenAI via the existing `chat()` helper, Supabase REST for cost logging.

**Spec:** `docs/superpowers/specs/2026-08-22-assistant-concept-quality-design.md`

## Global Constraints

- **Relative imports inside `api/` use the `.js` extension** even though the files are `.ts`. Follow it.
- `api/_pricing.ts` and `src/lib/pricing.ts` are **intentional mirrors** — `api/` cannot import from `src/`. Any change to one MUST be applied to the other. In `api/` import with `.js`; in `src/lib/` import with no extension.
- **No frontend file may be modified.** The response shape `{ concepts, recommendation, usage }` is contractual. If a task seems to need a frontend edit, stop and ask.
- **No invented numbers.** Every rate below is from the official published rate card, captured 2026-08-22. Do not add a model without a verified rate.
- `vitest.config.ts` uses `globals: false` and `environment: 'node'` — import `describe/it/expect/vi/beforeEach/afterEach` explicitly from `'vitest'`.
- Tests: `npm test` (vitest run). **The suite is currently at 158 passing — do not regress it.**
- Also run `npx tsc --noEmit -p tsconfig.json` on every task.
- **Never auto-commit.** Project rule (CLAUDE.md): propose the commit message and wait for approval. The `git commit` steps here are the *proposed* commit.
- Developer is a beginner with no coding background — write comments that explain *why*.
- **Do not change any prompt string's meaning** beyond what a task explicitly specifies. `PERSONALITY`, `SUBJECT_NEUTRALITY`, `brandBlock`, and the brand rules in `api/_brand-rules.ts` are off limits.

### Verified facts (do not re-derive or "correct")

Measured live 2026-08-22 with this project's keys:

| Model | Latency (one concepts-style call) | Input /1M | Output /1M (incl. thinking) |
|---|---|---|---|
| `gemini-3.5-flash` (current) | 8s | $1.50 | $9.00 |
| `gemini-3.7-flash` | 7s | $0.75 (→$1.50 on 2027-01-01) | $3.75 (→$7.50) |
| `gemini-3.1-pro-preview` | 17s | $2.00 | $12.00 |
| `gemini-3.5-flash-lite` | — | $0.30 | $2.50 |
| `gpt-5.2` | — | $1.75 (cached $0.175) | $14.00 |

A production `/api/generate-image` call succeeded at **27 seconds**, so the Vercel function budget is at least that — the "10s function timeout" comments in the codebase are stale.

---

## File Structure

**Modify:**
- `api/_assistant-prompts.ts` — add `pickConceptLenses`, `buildSingleConceptSystemPrompt`, `SINGLE_CONCEPT_JSON_SCHEMA`, `buildRecommendationPrompt`. Existing exports stay.
- `api/_assistant-prompts.test.ts` — extend.
- `api/_assistant-models.ts` — new `recommend` stage, concepts model + token bump, fix the stale comment.
- `api/_assistant-models.test.ts` — extend.
- `api/_assistant-log.ts` — widen `AssistantStep`.
- `api/_llm.ts` — fix a second stale 10s comment (comment only, no logic).
- `api/_pricing.ts` + `src/lib/pricing.ts` — add verified LLM rates.
- `api/_pricing.test.ts` — extend, plus a guard test.
- `api/assistant/concepts.ts` — the fan-out.
- `api/assistant/concepts.test.ts` — rewrite for fan-out.

**Create:** nothing. This plan adds no new files.

---

## Task 1: Distinct lens selection

**Files:**
- Modify: `api/_assistant-prompts.ts` (add `pickConceptLenses` next to the existing `pickConceptLens`)
- Test: `api/_assistant-prompts.test.ts` (append)

**Interfaces:**
- Consumes: `CONCEPT_LENSES: string[]` (already exported, 7 entries).
- Produces: `pickConceptLenses(n: number, rand?: () => number): string[]` — returns `n` DISTINCT lenses. If `n >= CONCEPT_LENSES.length`, returns all of them (shuffled). Never returns a duplicate.

**Why:** this is the mechanism that makes the three concepts vary on three different axes instead of one. Today one lens is applied to all three concepts, so they diverge only along that single axis.

- [ ] **Step 1: Write the failing test**

Append to `api/_assistant-prompts.test.ts`:

```ts
import { CONCEPT_LENSES, pickConceptLenses } from './_assistant-prompts.js';

describe('pickConceptLenses', () => {
  it('returns the requested number of lenses', () => {
    expect(pickConceptLenses(3)).toHaveLength(3);
  });

  it('never returns a duplicate — this is the whole point of the function', () => {
    // Run many times because the failure mode is probabilistic.
    for (let i = 0; i < 200; i++) {
      const picked = pickConceptLenses(3);
      expect(new Set(picked).size).toBe(3);
    }
  });

  it('only ever returns real lenses from the pool', () => {
    for (const lens of pickConceptLenses(3)) {
      expect(CONCEPT_LENSES).toContain(lens);
    }
  });

  it('returns the whole pool when asked for more than exists, still without duplicates', () => {
    const picked = pickConceptLenses(CONCEPT_LENSES.length + 5);
    expect(picked).toHaveLength(CONCEPT_LENSES.length);
    expect(new Set(picked).size).toBe(CONCEPT_LENSES.length);
  });

  it('returns an empty array for n <= 0 rather than throwing', () => {
    expect(pickConceptLenses(0)).toEqual([]);
    expect(pickConceptLenses(-1)).toEqual([]);
  });

  it('is deterministic under a seeded rand, so tests can pin the selection', () => {
    // A rand that always returns 0 must take the pool in order.
    const zero = () => 0;
    expect(pickConceptLenses(3, zero)).toEqual([
      CONCEPT_LENSES[0], CONCEPT_LENSES[1], CONCEPT_LENSES[2],
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: FAIL — `pickConceptLenses is not a function`

- [ ] **Step 3: Implement**

Add to `api/_assistant-prompts.ts`, directly below the existing `pickConceptLens`:

```ts
/**
 * Pick `n` DISTINCT creative lenses.
 *
 * The concepts endpoint fires one model call per concept, and each call gets a
 * different lens from this list. That is what makes the three concepts differ
 * in KIND — one may be an unexpected setting, another an emotional beat,
 * another an unusual camera angle. Picking the same lens twice would waste a
 * call, so selection is without replacement.
 */
export function pickConceptLenses(n: number, rand: () => number = Math.random): string[] {
  if (n <= 0) return [];
  const pool = [...CONCEPT_LENSES];
  const out: string[] = [];
  // Draw from a shrinking pool — guarantees distinctness without a retry loop.
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rand() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc clean; suite ≥ 158 + 6 new, zero failures

- [ ] **Step 6: Commit (propose — do not run unattended)**

```bash
git add api/_assistant-prompts.ts api/_assistant-prompts.test.ts
git commit -m "feat: pick distinct creative lenses for concept fan-out"
```

---

## Task 2: Single-concept prompt, schema, and recommendation prompt

**Files:**
- Modify: `api/_assistant-prompts.ts`
- Test: `api/_assistant-prompts.test.ts` (append)

**Interfaces:**
- Consumes: `PERSONALITY`, `brandBlock(brand)`, `SUBJECT_NEUTRALITY` — all module-private in `_assistant-prompts.ts`; use them in place, do not export them.
- Produces:
  - `buildSingleConceptSystemPrompt(brand: string): string`
  - `SINGLE_CONCEPT_JSON_SCHEMA` — object schema, `concepts` array with exactly 1 item, `recommendation` NOT required
  - `buildRecommendationPrompt(concepts: Array<{ title: string; description: string }>): { system: string; user: string }`

**Why:** the existing `buildConceptsSystemPrompt` spends several lines instructing the model how to make three concepts differ from each other. In a one-concept call those lines are noise, and the lens must be stated as the defining constraint rather than one option among many.

Leave `buildConceptsSystemPrompt` and `CONCEPTS_JSON_SCHEMA` exactly as they are. They become unused by the endpoint but are deliberately retained as the revert path while the fan-out's benefit is unproven (spec risk 1).

- [ ] **Step 1: Write the failing test**

Append to `api/_assistant-prompts.test.ts`:

```ts
import {
  buildSingleConceptSystemPrompt,
  SINGLE_CONCEPT_JSON_SCHEMA,
  buildRecommendationPrompt,
} from './_assistant-prompts.js';

describe('buildSingleConceptSystemPrompt', () => {
  it('keeps the brand block so brand identity still applies', () => {
    const p = buildSingleConceptSystemPrompt('Roosterbet');
    expect(p).toContain('Roosterbet');
    expect(p).toMatch(/COLOR PALETTE/);
  });

  it('keeps the subject-neutrality guard', () => {
    expect(buildSingleConceptSystemPrompt('Roosterbet')).toMatch(/DO NOT ASSUME/);
  });

  it('asks for exactly ONE concept', () => {
    const p = buildSingleConceptSystemPrompt('Roosterbet');
    expect(p).toMatch(/exactly ONE concept/i);
  });

  it('drops the inter-concept diversity instructions, which are meaningless for one concept', () => {
    const p = buildSingleConceptSystemPrompt('Roosterbet');
    expect(p).not.toMatch(/could share one background/);
    expect(p).not.toMatch(/Return exactly 3 concepts/);
  });

  it('still tells the model to avoid the predictable take', () => {
    expect(buildSingleConceptSystemPrompt('Roosterbet')).toMatch(/EXPAND/i);
  });

  it('handles a brand with no registered rules without throwing', () => {
    expect(() => buildSingleConceptSystemPrompt('NoSuchBrand')).not.toThrow();
    expect(buildSingleConceptSystemPrompt('NoSuchBrand')).toContain('NoSuchBrand');
  });
});

describe('SINGLE_CONCEPT_JSON_SCHEMA', () => {
  it('requires exactly one concept', () => {
    const s = SINGLE_CONCEPT_JSON_SCHEMA as any;
    expect(s.properties.concepts.minItems).toBe(1);
    expect(s.properties.concepts.maxItems).toBe(1);
  });

  it('does not require a recommendation — that comes from a separate call', () => {
    expect((SINGLE_CONCEPT_JSON_SCHEMA as any).required).toEqual(['concepts']);
  });

  it('requires title and description on the concept', () => {
    const item = (SINGLE_CONCEPT_JSON_SCHEMA as any).properties.concepts.items;
    expect(item.required).toEqual(['title', 'description']);
  });
});

describe('buildRecommendationPrompt', () => {
  const concepts = [
    { title: 'Sky Strike', description: 'Hero dives through a gold coin storm.' },
    { title: 'Vault Heist', description: 'Hero stands inside a cyan-lit vault.' },
    { title: 'Cloud Throne', description: 'Hero perched atop golden cumulus.' },
  ];

  it('puts every concept title in the user message so the model can compare them', () => {
    const { user } = buildRecommendationPrompt(concepts);
    for (const c of concepts) expect(user).toContain(c.title);
  });

  it('includes the descriptions, not just titles', () => {
    const { user } = buildRecommendationPrompt(concepts);
    expect(user).toContain('gold coin storm');
  });

  it('asks for one short sentence', () => {
    expect(buildRecommendationPrompt(concepts).system).toMatch(/one short sentence/i);
  });

  it('handles a single surviving concept (partial fan-out failure)', () => {
    const { user } = buildRecommendationPrompt([concepts[0]]);
    expect(user).toContain('Sky Strike');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: FAIL — `buildSingleConceptSystemPrompt is not a function`

- [ ] **Step 3: Implement**

Add to `api/_assistant-prompts.ts`:

```ts
/**
 * System prompt for a SINGLE concept.
 *
 * The endpoint fires three of these in parallel, each with a different lens.
 * Compared with buildConceptsSystemPrompt this deliberately DROPS all the
 * "make the three concepts differ from each other" instructions — there is
 * only one concept in this call, so those lines would be wasted tokens and
 * confusing. Divergence is now guaranteed structurally by giving each call a
 * different lens, instead of asking one call to diverge from itself.
 */
export function buildSingleConceptSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    SUBJECT_NEUTRALITY,
    '',
    "YOUR JOB IS TO EXPAND THE USER'S THINKING, NOT NARROW IT: propose a fresh, non-obvious direction they may not have considered. Avoid the most predictable or clichéd take on the brief.",
    '',
    'Return exactly ONE concept as strict JSON: {"concepts":[{"title":"...","description":"..."}]}.',
    'The CREATIVE LENS in the user message is the defining constraint for this concept — obey it, do not treat it as one option among many.',
    'Description must be 2-3 sentences, practical and scannable: someone should be able to picture the finished banner from it.',
  ].join('\n');
}

export const SINGLE_CONCEPT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
} as const;

/**
 * Prompt for the recommendation sentence.
 *
 * This needs to see all three concepts at once to compare them, so it cannot
 * be folded into the parallel single-concept calls. It runs on the cheapest
 * model tier because it is a short judgement, not ideation.
 */
export function buildRecommendationPrompt(
  concepts: Array<{ title: string; description: string }>,
): { system: string; user: string } {
  const system = [
    PERSONALITY,
    '',
    'You are choosing between concept directions for a creative director.',
    'Reply with ONE short sentence naming the concept you would pick and why.',
    'No preamble, no list, no restating the options. Just the pick and the reason.',
  ].join('\n');
  const user = [
    'Here are the concept directions:',
    '',
    ...concepts.map((c, i) => `${i + 1}. ${c.title} — ${c.description}`),
    '',
    'Which would you pick, and why?',
  ].join('\n');
  return { system, user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc clean; suite green

- [ ] **Step 6: Commit (propose)**

```bash
git add api/_assistant-prompts.ts api/_assistant-prompts.test.ts
git commit -m "feat: add single-concept and recommendation prompts"
```

---

## Task 3: Model registry — new stage, stronger tier, token fix, stale comments

**Files:**
- Modify: `api/_assistant-models.ts`
- Modify: `api/_assistant-log.ts:14` (widen `AssistantStep`)
- Modify: `api/_llm.ts:36-39` (comment only)
- Test: `api/_assistant-models.test.ts` (append)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `AssistantStage` becomes `'concepts' | 'generate' | 'refine' | 'recommend'`
  - `ASSISTANT_MODELS.recommend` exists for both providers
  - `AssistantStep` (in `_assistant-log.ts`) becomes `'concepts' | 'generate' | 'refine' | 'concepts-recommend'`

**Why three things in one task:** they are one coherent change to the model configuration and cannot be tested apart — adding the `recommend` stage without widening `AssistantStage` will not compile, and the token bump is the fix for a truncation bug in the same table.

- [ ] **Step 1: Write the failing test**

Append to `api/_assistant-models.test.ts`:

```ts
describe('concepts stage is configured for quality, not a 10s budget', () => {
  it('uses the Pro tier for Gemini concepts', () => {
    expect(ASSISTANT_MODELS.concepts.gemini.model).toBe('gemini-3.1-pro-preview');
  });

  it('gives concepts enough tokens that a long brand mandate cannot truncate the JSON', () => {
    // Reproduced at 1200: a long mandate (LuckyVibe, Roosterbet) truncated the
    // response mid-string and JSON.parse threw. Gemini counts thinking tokens
    // against this budget, so the visible text is only part of the spend.
    expect(ASSISTANT_MODELS.concepts.gemini.maxTokens).toBeGreaterThanOrEqual(4000);
    expect(ASSISTANT_MODELS.concepts.openai.maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it('gives OpenAI concepts some reasoning effort', () => {
    expect(ASSISTANT_MODELS.concepts.openai.effort).toBe('low');
  });
});

describe('recommend stage', () => {
  it('exists for both providers', () => {
    expect(ASSISTANT_MODELS.recommend.gemini.model).toBeTruthy();
    expect(ASSISTANT_MODELS.recommend.openai.model).toBeTruthy();
  });

  it('uses the cheapest Gemini tier — it is a short judgement, not ideation', () => {
    expect(ASSISTANT_MODELS.recommend.gemini.model).toBe('gemini-3.5-flash-lite');
  });

  it('keeps the recommendation budget small', () => {
    expect(ASSISTANT_MODELS.recommend.gemini.maxTokens).toBeLessThanOrEqual(1000);
  });
});

describe('every stage is fully configured', () => {
  it('has both providers with a model and a positive token budget', () => {
    for (const [stage, providers] of Object.entries(ASSISTANT_MODELS)) {
      for (const [provider, cfg] of Object.entries(providers)) {
        expect(cfg.model, `${stage}.${provider}`).toBeTruthy();
        expect(cfg.maxTokens, `${stage}.${provider}`).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_assistant-models.test.ts`
Expected: FAIL — `ASSISTANT_MODELS.recommend` is undefined; concepts model is still `gemini-3.5-flash`

- [ ] **Step 3: Update the stage type and registry**

In `api/_assistant-models.ts`, replace the stale header comment (lines 1-4) with:

```ts
// Single source of truth for the assistant's per-stage model tiering.
// Tiering axes: Gemini model tier, and OpenAI reasoning_effort.
//
// Budget: a production /api/generate-image call was measured succeeding at 27
// seconds on 2026-08-22, so the function budget is at least that — NOT the 10s
// this file previously assumed. That stale assumption is why the concepts stage
// sat on a Flash tier with reasoning off. Entries are now chosen for quality
// within roughly 30s.
```

Change `AssistantStage`:

```ts
export type AssistantStage = 'concepts' | 'generate' | 'refine' | 'recommend';
```

Change the `concepts` entry and add `recommend`:

```ts
  // Ideation. This is the stage the user reported as "obvious / clichéd", so it
  // gets the strongest tier that fits the budget: gemini-3.1-pro-preview
  // measured 17s for one concept, and the three concept calls run in parallel.
  // Fallback if that ever becomes too slow: gemini-3.7-flash (7s, and cheaper
  // than the gemini-3.5-flash this replaced) — a one-field change.
  concepts: {
    openai: { model: 'gpt-5.2', effort: 'low', maxTokens: 4000 },
    gemini: { model: 'gemini-3.1-pro-preview', maxTokens: 4000 },
  },
```

```ts
  // Picks which of the drafted concepts to recommend. A short comparative
  // judgement over text already written, so it runs on the cheapest tier.
  recommend: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 600 },
    gemini: { model: 'gemini-3.5-flash-lite', maxTokens: 600 },
  },
```

Leave the `generate` and `refine` entries exactly as they are.

- [ ] **Step 4: Widen the log step type**

In `api/_assistant-log.ts:14`:

```ts
export type AssistantStep = 'concepts' | 'generate' | 'refine' | 'concepts-recommend';
```

- [ ] **Step 5: Fix the second stale timeout comment**

In `api/_llm.ts`, the retry comment around lines 36-39 currently reads "Kept conservative — Vercel hobby has a 10s function timeout, so we can't afford long retry chains." That claim is stale for the same reason. Replace only that sentence with:

```ts
// Kept conservative — one retry, short backoff. The function budget is larger
// than the 10s this comment used to assume (a production image call succeeded
// at 27s on 2026-08-22), but a long retry chain still risks stacking latency on
// top of an already slow model call.
```

Do NOT change `RETRIABLE_STATUSES`, `RETRY_DELAY_MS`, or any retry logic.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run api/_assistant-models.test.ts && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: all pass, tsc clean

- [ ] **Step 7: Commit (propose)**

```bash
git add api/_assistant-models.ts api/_assistant-models.test.ts api/_assistant-log.ts api/_llm.ts
git commit -m "feat: move concepts to Pro tier, add recommend stage, fix token truncation"
```

---

## Task 4: LLM pricing entries and a guard against the gap recurring

**Files:**
- Modify: `api/_pricing.ts` (add to `LLM_PRICING`)
- Modify: `src/lib/pricing.ts` (same addition — mirror)
- Test: `api/_pricing.test.ts` (append)

**Interfaces:**
- Consumes: `ASSISTANT_MODELS` from `./_assistant-models.js` (Task 3) — only in the test.
- Produces: `LLM_PRICING` entries for `gemini-3.5-flash`, `gemini-3.7-flash`, `gemini-3.1-pro-preview`, `gemini-3.5-flash-lite`, `gpt-5.2`.

**Why:** every LLM row in the Cost Tracker currently reads "price unknown" because `LLM_PRICING` has no entry for any model the Assistant actually runs. Changing the concepts model tier is unmeasurable without this — and measuring cost against quality is the whole point of the exercise.

**Do NOT modify or remove any existing entry** (`gemini-2.5-flash`, `gemini-2.5-pro`, `gpt-4o`, `gpt-4o-mini`, `test-cache-model`). Historical logged rows price against those.

- [ ] **Step 1: Write the failing test**

Append to `api/_pricing.test.ts`:

```ts
import { ASSISTANT_MODELS } from './_assistant-models.js';

describe('LLM_PRICING covers the models the assistant actually runs', () => {
  // This is the guard. The Cost Tracker showed "price unknown" for every LLM
  // call because the models in ASSISTANT_MODELS had no pricing entry. This test
  // fails the next time a stage's model changes without its rate being added.
  it('has an entry for every model referenced by ASSISTANT_MODELS', () => {
    const missing: string[] = [];
    for (const providers of Object.values(ASSISTANT_MODELS)) {
      for (const cfg of Object.values(providers)) {
        if (!LLM_PRICING[cfg.model]) missing.push(cfg.model);
      }
    }
    expect(missing).toEqual([]);
  });

  it('prices those entries with real numbers, not nulls', () => {
    for (const providers of Object.values(ASSISTANT_MODELS)) {
      for (const cfg of Object.values(providers)) {
        const p = LLM_PRICING[cfg.model];
        expect(p.input_per_million, cfg.model).toBeGreaterThan(0);
        expect(p.output_per_million, cfg.model).toBeGreaterThan(0);
      }
    }
  });
});

describe('newly added LLM rates match the official rate card', () => {
  it('gemini-3.1-pro-preview', () => {
    expect(LLM_PRICING['gemini-3.1-pro-preview'].input_per_million).toBe(2.00);
    expect(LLM_PRICING['gemini-3.1-pro-preview'].output_per_million).toBe(12.00);
  });

  it('gemini-3.5-flash', () => {
    expect(LLM_PRICING['gemini-3.5-flash'].input_per_million).toBe(1.50);
    expect(LLM_PRICING['gemini-3.5-flash'].output_per_million).toBe(9.00);
  });

  it('gemini-3.7-flash — cheaper AND newer than the 3.5-flash it can replace', () => {
    expect(LLM_PRICING['gemini-3.7-flash'].input_per_million).toBe(0.75);
    expect(LLM_PRICING['gemini-3.7-flash'].output_per_million).toBe(3.75);
  });

  it('gemini-3.5-flash-lite', () => {
    expect(LLM_PRICING['gemini-3.5-flash-lite'].input_per_million).toBe(0.30);
    expect(LLM_PRICING['gemini-3.5-flash-lite'].output_per_million).toBe(2.50);
  });

  it('gpt-5.2, including its cached-input discount', () => {
    expect(LLM_PRICING['gpt-5.2'].input_per_million).toBe(1.75);
    expect(LLM_PRICING['gpt-5.2'].cached_input_per_million).toBe(0.175);
    expect(LLM_PRICING['gpt-5.2'].output_per_million).toBe(14.00);
  });

  it('computes a realistic concept-set cost from those rates', () => {
    // 3 concept calls at ~150 in / ~400 out on the Pro tier.
    const per = computeLlmCost('gemini-3.1-pro-preview', {
      input_tokens: 150, cached_input_tokens: 0, output_tokens: 400,
    })!;
    // (150*2.00 + 400*12.00) / 1e6 = 0.00510
    expect(per).toBeCloseTo(0.00510, 5);
    expect(per * 3).toBeLessThan(0.02); // a whole set stays under two cents
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_pricing.test.ts`
Expected: FAIL — `missing` contains `gemini-3.1-pro-preview` and `gemini-3.5-flash-lite` and `gpt-5.2`

- [ ] **Step 3: Add the rates to api/_pricing.ts**

Insert these entries into the `LLM_PRICING` object in `api/_pricing.ts`, after the existing `gemini-2.5-pro` entry:

```ts
  // ── Models the AI Assistant actually runs ─────────────────────────────
  // Verified against ai.google.dev/gemini-api/docs/pricing on 2026-08-22.
  // NOTE: Gemini output prices INCLUDE thinking tokens, which is why the
  // assistant's token budgets look generous relative to visible output.
  'gemini-3.5-flash': {
    input_per_million: 1.50,
    cached_input_per_million: null,
    output_per_million: 9.00,
    last_updated: '2026-08-22',
    source: 'ai.google.dev/gemini-api/docs/pricing',
  },
  'gemini-3.7-flash': {
    input_per_million: 0.75,
    cached_input_per_million: null,
    output_per_million: 3.75,
    last_updated: '2026-08-22',
    // Promotional rate: rises to $1.50 in / $7.50 out on 2027-01-01.
    source: 'ai.google.dev/gemini-api/docs/pricing — rate rises 2027-01-01',
  },
  'gemini-3.1-pro-preview': {
    input_per_million: 2.00,
    cached_input_per_million: null,
    output_per_million: 12.00,
    last_updated: '2026-08-22',
    // Rates shown are for prompts <= 200k tokens ($4.00 / $18.00 above that).
    source: 'ai.google.dev/gemini-api/docs/pricing — prompts <= 200k tokens',
  },
  'gemini-3.5-flash-lite': {
    input_per_million: 0.30,
    cached_input_per_million: null,
    output_per_million: 2.50,
    last_updated: '2026-08-22',
    source: 'ai.google.dev/gemini-api/docs/pricing',
  },
  'gpt-5.2': {
    input_per_million: 1.75,
    cached_input_per_million: 0.175,
    output_per_million: 14.00,
    last_updated: '2026-08-22',
    source: 'developers.openai.com/api/docs/pricing',
  },
```

- [ ] **Step 4: Mirror into src/lib/pricing.ts**

Apply the identical addition to `src/lib/pricing.ts`, matching that file's existing one-line-per-entry formatting style. The values must be identical — a drift means the frontend Cost Tracker and the backend cost log disagree.

Verify parity:

Run: `diff <(grep -o "'gemini-3[^']*': *{[^}]*}" api/_pricing.ts) <(grep -o "'gemini-3[^']*': *{[^}]*}" src/lib/pricing.ts) || echo "formatting differs — compare values by hand"`
Expected: the numbers match even if whitespace does not

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run api/_pricing.test.ts && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: all pass

- [ ] **Step 6: Commit (propose)**

```bash
git add api/_pricing.ts src/lib/pricing.ts api/_pricing.test.ts
git commit -m "feat: add verified LLM rates for assistant models with a coverage guard"
```

---

## Task 5: Fan out the concepts endpoint

**Files:**
- Modify: `api/assistant/concepts.ts` (the whole handler body after validation)
- Test: `api/assistant/concepts.test.ts` (rewrite the success cases; keep the 401 and 405 tests)

**Interfaces:**
- Consumes: `pickConceptLenses` (Task 1); `buildSingleConceptSystemPrompt`, `SINGLE_CONCEPT_JSON_SCHEMA`, `buildRecommendationPrompt` (Task 2); `ASSISTANT_MODELS.concepts` and `ASSISTANT_MODELS.recommend` (Task 3); existing `chat(opts: ChatOptions): Promise<ChatResult>`, `logLlmCall(testUserId, step, usage)`, `validateToken`, `checkSpendCap`, `buildAvoidClause`.
- Produces: unchanged HTTP response `{ concepts: Array<{title,description}>, recommendation: string, usage: { provider, model, input_tokens, cached_input_tokens, output_tokens } }`.

**Two decisions the spec left open, settled here:**

1. **The `usage` field.** There are now four calls but one `usage` field. Return the **sum** of all four calls' tokens, with `model` set to the concepts model. This keeps the response shape and type intact. It is lossy about the cheap synthesis call's model, which is acceptable because (a) the frontend does not consume the concepts `usage` at all — `AssistantPage.tsx:54` only stores usage from the *generate* response — and (b) accurate per-model cost lives in the four `logLlmCall` rows, which is what the Cost Tracker reads.
2. **`temperature`.** Keep `0.9`, as today. Diversity now comes structurally from the distinct lenses, but a high temperature still helps each individual concept avoid its own most-likely completion.

- [ ] **Step 1: Write the failing test**

Replace the "returns 3 concepts + usage on a valid Gemini call" test in `api/assistant/concepts.test.ts` with the block below, and keep the existing 401 and 405 tests untouched. Note this mocks `chat` rather than `global.fetch`, because the point is to assert how many calls are made and with which lenses.

```ts
import { vi } from 'vitest';

const chatMock = vi.fn();
vi.mock('../_llm.js', () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

const logMock = vi.fn();
vi.mock('../_assistant-log.js', () => ({ logLlmCall: (...args: unknown[]) => logMock(...args) }));

vi.mock('../_spend-cap.js', () => ({
  checkSpendCap: async () => ({ allowed: true, spent_today_usd: 0, cap_usd: 1 }),
}));

function conceptReply(title: string) {
  return {
    text: JSON.stringify({ concepts: [{ title, description: `${title} description here.` }] }),
    usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 200 },
  };
}

const validBody = {
  token: 'tester-her-x9k2',
  brand: 'RocketSpin',
  task: 'banner for weekend rocket boost',
  model: 'gemini' as const,
};

describe('concepts fan-out', () => {
  beforeEach(() => {
    chatMock.mockReset();
    logMock.mockReset();
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });

  it('makes 3 concept calls plus 1 recommendation call', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'I would pick One.', usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 10 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(chatMock).toHaveBeenCalledTimes(4);
    const body = res.body as any;
    expect(body.concepts).toHaveLength(3);
    expect(body.recommendation).toBe('I would pick One.');
  });

  it('gives each concept call a DIFFERENT lens — this is the core of the design', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    // Extract the lens line from each of the 3 concept calls' user messages.
    const lenses = chatMock.mock.calls.slice(0, 3).map(c => {
      const m = String((c[0] as any).user).match(/CREATIVE LENS[^\n]*/);
      return m ? m[0] : '';
    });
    expect(new Set(lenses).size).toBe(3);
  });

  it('uses the Pro concepts model for the concept calls and the cheap tier for the recommendation', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect((chatMock.mock.calls[0][0] as any).model).toBe('gemini-3.1-pro-preview');
    expect((chatMock.mock.calls[3][0] as any).model).toBe('gemini-3.5-flash-lite');
  });

  it('sums usage across all four calls', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 10 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    // 3 x (100 in / 200 out) + 1 x (50 in / 10 out)
    expect((res.body as any).usage.input_tokens).toBe(350);
    expect((res.body as any).usage.output_tokens).toBe(610);
  });

  it('logs one row per call — four rows', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(logMock).toHaveBeenCalledTimes(4);
    const steps = logMock.mock.calls.map(c => c[1]);
    expect(steps.filter(s => s === 'concepts')).toHaveLength(3);
    expect(steps.filter(s => s === 'concepts-recommend')).toHaveLength(1);
  });

  it('returns the survivors when one concept call fails, instead of failing everything', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).concepts).toHaveLength(2);
  });

  it('500s only when every concept call fails', async () => {
    chatMock
      .mockRejectedValueOnce(new Error('boom a'))
      .mockRejectedValueOnce(new Error('boom b'))
      .mockRejectedValueOnce(new Error('boom c'));

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
  });

  it('still returns concepts when only the recommendation call fails', async () => {
    chatMock
      .mockResolvedValueOnce(conceptReply('One'))
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockRejectedValueOnce(new Error('synthesis down'));

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).concepts).toHaveLength(3);
    expect((res.body as any).recommendation).toBe('');
  });

  it('survives a concept call returning unparseable JSON', async () => {
    chatMock
      .mockResolvedValueOnce({ text: 'not json at all', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } })
      .mockResolvedValueOnce(conceptReply('Two'))
      .mockResolvedValueOnce(conceptReply('Three'))
      .mockResolvedValueOnce({ text: 'pick', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });

    const { req, res } = mockReqRes(validBody);
    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.body as any).concepts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/assistant/concepts.test.ts`
Expected: FAIL — `chatMock` called once, not four times

- [ ] **Step 3: Implement the fan-out**

Replace everything in `api/assistant/concepts.ts` from `const stage = ASSISTANT_MODELS.concepts[model];` to the end of the `try`/`catch` with:

```ts
  const stage = ASSISTANT_MODELS.concepts[model];
  const recStage = ASSISTANT_MODELS.recommend[model];
  const CONCEPT_COUNT = 3;

  try {
    const system = buildSingleConceptSystemPrompt(brand);
    const avoidClause = buildAvoidClause(avoid ?? []);

    // One call per concept, each under a DIFFERENT creative lens. Three
    // concepts from ONE call converge on a single strong direction and come
    // back as variations of each other; three independent calls under
    // different constraints diverge structurally instead of being asked to.
    const lenses = pickConceptLenses(CONCEPT_COUNT);

    const settled = await Promise.allSettled(lenses.map(async (lens) => {
      let user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}\n\nCREATIVE LENS for this concept — obey it, it is the whole point of this concept: ${lens}`;
      if (avoidClause) user += `\n\n${avoidClause}`;
      const r = await chat({
        provider: model,
        model: stage.model,
        system,
        user,
        json: true,
        jsonSchema: SINGLE_CONCEPT_JSON_SCHEMA,
        reasoningEffort: stage.effort,
        maxTokens: stage.maxTokens,
        // Diversity across the set is now structural (the lenses), but a high
        // temperature still pushes each concept off its own likeliest answer.
        temperature: 0.9,
      });
      const parsed = JSON.parse(r.text) as { concepts?: Array<{ title: string; description: string }> };
      const concept = parsed.concepts?.[0];
      if (!concept?.title) throw new Error('no concept in response');
      return { concept, usage: r.usage };
    }));

    const ok = settled.filter(
      (s): s is PromiseFulfilledResult<{ concept: { title: string; description: string }; usage: typeof settled[0] extends never ? never : { input_tokens: number; cached_input_tokens: number; output_tokens: number } }> =>
        s.status === 'fulfilled',
    );
    for (const s of settled) {
      if (s.status === 'rejected') console.error('assistant/concepts: one concept call failed:', s.reason);
    }

    // Only a total wipeout is an error. Losing one of three still gives the
    // user something to work with, which beats a 500.
    if (ok.length === 0) {
      const first = settled.find(s => s.status === 'rejected') as PromiseRejectedResult | undefined;
      throw new Error(first ? String(first.reason) : 'all concept calls failed');
    }

    const concepts = ok.map(s => s.value.concept);

    // Cost is logged per call so the Cost Tracker attributes each model
    // correctly — the aggregated `usage` in the response is only a summary.
    for (const s of ok) {
      await logLlmCall(auth.test_user_id, 'concepts', {
        provider: model, model: stage.model, ...s.value.usage,
      });
    }

    // The recommendation needs to compare all the concepts, so it cannot be
    // folded into the parallel calls. A failure here is not worth losing the
    // concepts over — fall back to an empty string, which the UI handles.
    let recommendation = '';
    let recUsage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
    try {
      const { system: recSystem, user: recUser } = buildRecommendationPrompt(concepts);
      const r = await chat({
        provider: model,
        model: recStage.model,
        system: recSystem,
        user: recUser,
        reasoningEffort: recStage.effort,
        maxTokens: recStage.maxTokens,
      });
      recommendation = r.text.trim();
      recUsage = r.usage;
      await logLlmCall(auth.test_user_id, 'concepts-recommend', {
        provider: model, model: recStage.model, ...r.usage,
      });
    } catch (recErr) {
      console.error('assistant/concepts: recommendation call failed (non-fatal):', recErr);
    }

    // Summed across every call. `model` names the concepts model because that
    // is the dominant spend; the per-call log rows carry the exact breakdown.
    const usage = {
      provider: model,
      model: stage.model,
      input_tokens: ok.reduce((n, s) => n + s.value.usage.input_tokens, 0) + recUsage.input_tokens,
      cached_input_tokens: ok.reduce((n, s) => n + s.value.usage.cached_input_tokens, 0) + recUsage.cached_input_tokens,
      output_tokens: ok.reduce((n, s) => n + s.value.usage.output_tokens, 0) + recUsage.output_tokens,
    };

    return res.status(200).json({ concepts, recommendation, usage });
  } catch (err) {
    console.error('assistant/concepts error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

Update the imports at the top of the file:

```ts
import {
  buildSingleConceptSystemPrompt,
  SINGLE_CONCEPT_JSON_SCHEMA,
  buildRecommendationPrompt,
  pickConceptLenses,
  buildAvoidClause,
} from '../_assistant-prompts.js';
```

`buildConceptsSystemPrompt`, `CONCEPTS_JSON_SCHEMA` and `pickConceptLens` are no longer imported here. Leave them exported from `_assistant-prompts.ts` — they are the deliberate revert path (spec risk 1).

> Implementer note: the `ok` filter's type predicate above is verbose. If TypeScript is satisfied by a simpler form, simplify it — the requirement is that `ok` is typed as the fulfilled results, not that the predicate is written exactly this way. Do not use `as any` to get there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/assistant/concepts.test.ts`
Expected: PASS (all fan-out tests plus the retained 401 and 405 tests)

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc clean; suite green with no frontend file modified

- [ ] **Step 6: Confirm no frontend file was touched**

Run: `git diff --name-only | grep '^src/' || echo "no frontend files changed — correct"`
Expected: `no frontend files changed — correct` (Task 4's `src/lib/pricing.ts` is already committed by then)

- [ ] **Step 7: Commit (propose)**

```bash
git add api/assistant/concepts.ts api/assistant/concepts.test.ts
git commit -m "feat: fan out concepts into parallel single-concept calls with distinct lenses"
```

---

## Post-implementation verification (Vercel preview)

`npm run dev` does not serve `/api` routes, so the real check needs a preview deploy. **This is the gate the spec's risk 1 names, not a formality** — the diversity claim rests on one A/B sample.

- [ ] Confirm `GEMINI_API_KEY` is set in the Vercel project environment.
- [ ] Run **3–4 concept sets across two or three of Lena's real brands**, including at least one heavy-mandate brand (LuckyVibe or Roosterbet) and one lighter one. For each set record:
  - Do the three concepts differ in **kind** — shot type, human presence, emotional register — or only in setting?
  - Is any concept obviously clichéd?
- [ ] Run the same briefs against the previous behaviour for comparison before merging. If the fan-out does not visibly improve variety-in-kind, say so: the model-tier and truncation fixes stand on their own, and the fan-out should be reconsidered rather than kept on faith.
- [ ] Confirm the Cost Tracker now shows real figures for concept calls instead of "price unknown", and that a set costs roughly **$0.017**.
- [ ] Confirm a heavy-mandate brand no longer truncates (the bug that produced a JSON parse error at `maxTokens: 1200`).
- [ ] Record wall-clock time for a concept set. Expect ~17–20s. If it exceeds ~30s, switch `concepts.gemini` to `gemini-3.7-flash` — one field, and it is cheaper and faster than the model this replaced.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Fan-out in the concepts endpoint | Task 5 |
| §2 Distinct lens selection | Task 1 |
| §3 Single-concept prompt and schema | Task 2 |
| §4 Recommendation synthesis | Task 2 (prompt) + Task 5 (call) |
| §5 Model registry | Task 3 |
| §6 Cost visibility | Task 4 |
| §7 Error handling | Task 5 |
| Testing section | Every task + the preview checklist |
| Risk 1 (one-sample evidence) | Preview checklist, framed as a gate; revert path preserved in Task 2 |
| Risk 2 (brand mandates dominate) | Out of scope by design; called out in the preview checklist's brand selection |
| Risk 3 (4 calls widen failure surface) | Task 5 error handling + tests |
| Risk 4 (Pro latency) | Task 3 comment names the fallback; preview checklist measures it |
| Risk 5 (preview model may be withdrawn) | Task 3 pins the explicit id; fallback documented |

**Two additions beyond the spec**, both recorded here so they are not silent:
1. `api/_llm.ts` carries a **second** stale "10s function timeout" claim (line-wrapped, which is why the spec's grep missed it). Task 3 Step 5 fixes the comment only — no retry logic changes.
2. `AssistantStep` in `api/_assistant-log.ts` must be widened for the new `concepts-recommend` step. The spec named the step but not the type that gates it. Task 3 Step 4.

**Placeholder scan:** no TBD/TODO. Every code step carries real code. The one judgement call left to the implementer (the `ok` type predicate) is explicitly bounded with a stated requirement and a prohibition on `as any`.

**Type consistency:** `pickConceptLenses(n, rand?)` is defined in Task 1 and consumed in Task 5 with the same name and arity. `buildSingleConceptSystemPrompt(brand)`, `SINGLE_CONCEPT_JSON_SCHEMA` and `buildRecommendationPrompt(concepts)` are defined in Task 2 and consumed in Task 5 with matching signatures. `ASSISTANT_MODELS.recommend` is added in Task 3 and read in Task 5. `AssistantStage` gains `'recommend'` (Task 3) while `AssistantStep` gains `'concepts-recommend'` (Task 3) — deliberately different strings: one names a model-config stage, the other a Supabase log value. Task 4's guard test imports `ASSISTANT_MODELS`, so Task 3 must land first.
