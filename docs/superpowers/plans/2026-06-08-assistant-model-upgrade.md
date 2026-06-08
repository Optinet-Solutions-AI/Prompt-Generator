# Assistant Model Upgrade (Tiered) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the AI Concept Assistant's three LLM stages to current-gen models, tiered per stage, while staying inside Vercel's 10s timeout.

**Architecture:** A single shared model map (`api/_assistant-models.ts`) defines per-stage, per-provider `{model, effort, maxTokens}`. The three endpoints read from it. `api/_llm.ts` gains a `reasoningEffort` option and stops sending a custom `temperature` to `gpt-5.x` models (which reject it). No flow or UX changes.

**Tech Stack:** Vercel serverless functions (TypeScript, ESM with `.js` import specifiers), OpenAI Chat Completions API, Gemini `generateContent` API, Vitest (fetch mocked).

**Tiered map being implemented:**

| Stage | OpenAI | Gemini |
|---|---|---|
| concepts | `gpt-5.2` @ `effort=none` | `gemini-3.5-flash` |
| generate | `gpt-5.2` @ `effort=none` | `gemini-3.1-flash-lite` |
| refine | `gpt-5.2` @ `effort=low` | `gemini-3.5-flash` |

**Spec:** `docs/superpowers/specs/2026-06-08-assistant-model-upgrade-design.md`

---

## File Structure

- `api/_llm.ts` (modify) — add `reasoningEffort` to `ChatOptions`; in `chatOpenAI` send `reasoning_effort` and skip custom `temperature` for `gpt-5.x`.
- `api/_assistant-models.ts` (create) — single source of truth for per-stage/provider model + effort + maxTokens.
- `api/assistant/concepts.ts` (modify) — read model from the shared map; pass `reasoningEffort`.
- `api/assistant/generate.ts` (modify) — same.
- `api/assistant/refine.ts` (modify) — same.
- Test files updated alongside each (`*.test.ts`).

Run a single test file with: `npx vitest run <path>`. Run all with: `npx vitest run`.

---

## Task 1: `_llm.ts` — reasoningEffort + gpt-5.x parameter handling

**Files:**
- Modify: `api/_llm.ts` (`ChatOptions` interface ~line 3-12; `chatOpenAI` ~line 138-156)
- Test: `api/_llm.test.ts`

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the `describe('_llm.chat — OpenAI', ...)` block in `api/_llm.test.ts`:

```ts
  it('sends reasoning_effort for gpt-5.2 when reasoningEffort is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'openai', model: 'gpt-5.2', system: 's', user: 'u', maxTokens: 100, reasoningEffort: 'low' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reasoning_effort).toBe('low');
  });

  it('omits a custom temperature for gpt-5.x models even when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'openai', model: 'gpt-5.2', system: 's', user: 'u', maxTokens: 100, temperature: 0.9 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_llm.test.ts`
Expected: the two new tests FAIL (`reasoning_effort` is `undefined`; `temperature` is `0.9` not `undefined`).

- [ ] **Step 3: Implement the change**

In `api/_llm.ts`, add the field to `ChatOptions` (after `temperature?: number;`):

```ts
  temperature?: number;
  /** OpenAI gpt-5.x reasoning control. Ignored by Gemini and non-5.x models. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
```

In `chatOpenAI`, replace the temperature line:

```ts
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
```

with:

```ts
  // gpt-5.x reasoning models reject a custom temperature — only send it for non-5.x.
  const isGpt5 = opts.model.startsWith('gpt-5');
  if (opts.temperature !== undefined && !isGpt5) body.temperature = opts.temperature;
  // reasoning_effort is a gpt-5.x control (none|low|medium|high). Send when provided.
  if (opts.reasoningEffort !== undefined) body.reasoning_effort = opts.reasoningEffort;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_llm.test.ts`
Expected: PASS — all OpenAI + Gemini tests green, including the pre-existing "includes temperature ... when provided, omits it otherwise" (it uses `gpt-4o-mini`, which is not `gpt-5.x`, so temperature is still sent).

- [ ] **Step 5: Commit**

```bash
git add api/_llm.ts api/_llm.test.ts
git commit -m "feat(assistant): add reasoningEffort + gpt-5.x temperature handling to _llm"
```

---

## Task 2: Create `api/_assistant-models.ts`

**Files:**
- Create: `api/_assistant-models.ts`
- Test: `api/_assistant-models.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_assistant-models.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ASSISTANT_MODELS } from './_assistant-models.js';

describe('ASSISTANT_MODELS tiered map', () => {
  it('uses gpt-5.2 on every OpenAI stage with the right reasoning effort', () => {
    expect(ASSISTANT_MODELS.concepts.openai).toMatchObject({ model: 'gpt-5.2', effort: 'none' });
    expect(ASSISTANT_MODELS.generate.openai).toMatchObject({ model: 'gpt-5.2', effort: 'none' });
    expect(ASSISTANT_MODELS.refine.openai).toMatchObject({ model: 'gpt-5.2', effort: 'low' });
  });

  it('tiers Gemini: flash for concepts/refine, flash-lite for generate', () => {
    expect(ASSISTANT_MODELS.concepts.gemini.model).toBe('gemini-3.5-flash');
    expect(ASSISTANT_MODELS.generate.gemini.model).toBe('gemini-3.1-flash-lite');
    expect(ASSISTANT_MODELS.refine.gemini.model).toBe('gemini-3.5-flash');
  });

  it('raises refine OpenAI maxTokens to cover reasoning tokens', () => {
    expect(ASSISTANT_MODELS.refine.openai.maxTokens).toBeGreaterThanOrEqual(2500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_assistant-models.test.ts`
Expected: FAIL — `Cannot find module './_assistant-models.js'`.

- [ ] **Step 3: Create the module**

Create `api/_assistant-models.ts`:

```ts
// Single source of truth for the assistant's per-stage model tiering.
// Tiering axes: Gemini model tier, and OpenAI reasoning_effort.
// Constraint: every entry must return within Vercel's 10s function timeout —
// that is why no Pro/flagship tier appears here and reasoning effort stays low.

export type AssistantStage = 'concepts' | 'generate' | 'refine';
export type AssistantProvider = 'openai' | 'gemini';

export interface ProviderModel {
  model: string;
  /** OpenAI reasoning_effort. Omitted for Gemini entries. */
  effort?: 'none' | 'low' | 'medium' | 'high';
  maxTokens: number;
}

export const ASSISTANT_MODELS: Record<AssistantStage, Record<AssistantProvider, ProviderModel>> = {
  // Creativity + diversity, fast. Diversity comes from the rotating lens + avoid-list
  // (gpt-5.x ignores the temperature lever; Gemini still honours it in the endpoint).
  concepts: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 1200 },
    gemini: { model: 'gemini-3.5-flash', maxTokens: 1200 },
  },
  // Templated 8-field structured JSON — cheapest/fastest current tier is enough.
  generate: {
    openai: { model: 'gpt-5.2', effort: 'none', maxTokens: 1200 },
    gemini: { model: 'gemini-3.1-flash-lite', maxTokens: 2000 },
  },
  // Intent disambiguation (clarify vs refine, "not-X = add-X") benefits from light
  // reasoning. maxTokens raised so reasoning tokens don't truncate the JSON output.
  refine: {
    openai: { model: 'gpt-5.2', effort: 'low', maxTokens: 3000 },
    gemini: { model: 'gemini-3.5-flash', maxTokens: 2000 },
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_assistant-models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_assistant-models.ts api/_assistant-models.test.ts
git commit -m "feat(assistant): add shared tiered model map"
```

---

## Task 3: Wire `concepts.ts` to the shared map

**Files:**
- Modify: `api/assistant/concepts.ts` (`CONCEPTS_MODEL` const ~line 8-11; `chat(...)` call ~line 46-59)
- Test: `api/assistant/concepts.test.ts` (usage assertion ~line 68-74)

- [ ] **Step 1: Update the test to expect the new Gemini model**

In `api/assistant/concepts.test.ts`, change the `body.usage` expectation in the
"returns 3 concepts + usage on a valid Gemini call" test from `model: 'gemini-2.5-flash'`
to:

```ts
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      input_tokens: 350,
      cached_input_tokens: 0,
      output_tokens: 180,
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/assistant/concepts.test.ts`
Expected: FAIL — received `gemini-2.5-flash`, expected `gemini-3.5-flash`.

- [ ] **Step 3: Implement the change**

In `api/assistant/concepts.ts`:

1. Replace the `CONCEPTS_MODEL` constant block:

```ts
const CONCEPTS_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};
```

with an import at the top of the file (next to the other `../` imports):

```ts
import { ASSISTANT_MODELS } from '../_assistant-models.js';
```

2. Replace `const chosenModel = CONCEPTS_MODEL[model];` with:

```ts
  const stage = ASSISTANT_MODELS.concepts[model];
  const chosenModel = stage.model;
```

3. Update the `chat({...})` call to pass effort + maxTokens from the map (keep
   `temperature: 0.9` — Gemini still uses it; `_llm` drops it for gpt-5.x):

```ts
    const result = await chat({
      provider: model,
      model: chosenModel,
      reasoningEffort: stage.effort,
      system,
      user,
      json: true,
      jsonSchema: CONCEPTS_JSON_SCHEMA,
      maxTokens: stage.maxTokens,
      temperature: 0.9,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/assistant/concepts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/assistant/concepts.ts api/assistant/concepts.test.ts
git commit -m "feat(assistant): tier concepts to gpt-5.2 + gemini-3.5-flash"
```

---

## Task 4: Wire `generate.ts` to the shared map

**Files:**
- Modify: `api/assistant/generate.ts` (`GENERATE_MODEL` + `MAX_TOKENS` consts ~line 8-20; `chat(...)` call ~line 57-65)
- Test: `api/assistant/generate.test.ts` (usage assertion ~line 67-73)

- [ ] **Step 1: Update the test to expect the new Gemini model**

In `api/assistant/generate.test.ts`, change the `body.usage` expectation in the
"returns structured fields + usage on valid Gemini call" test from `model: 'gemini-2.5-flash'`
to:

```ts
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
      input_tokens: 800,
      cached_input_tokens: 0,
      output_tokens: 400,
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/assistant/generate.test.ts`
Expected: FAIL — received `gemini-2.5-flash`, expected `gemini-3.1-flash-lite`.

- [ ] **Step 3: Implement the change**

In `api/assistant/generate.ts`:

1. Delete both constant blocks:

```ts
const GENERATE_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
};

const MAX_TOKENS: Record<'openai' | 'gemini', number> = {
  openai: 1200,
  gemini: 2000,
};
```

(including the multi-line comment above the `gemini` line) and add the import at the top:

```ts
import { ASSISTANT_MODELS } from '../_assistant-models.js';
```

2. Replace `const chosenModel = GENERATE_MODEL[model];` with:

```ts
  const stage = ASSISTANT_MODELS.generate[model];
  const chosenModel = stage.model;
```

3. Update the `chat({...})` call:

```ts
    const result = await chat({
      provider: model,
      model: chosenModel,
      reasoningEffort: stage.effort,
      system,
      user,
      json: true,
      jsonSchema: GENERATE_JSON_SCHEMA,
      maxTokens: stage.maxTokens,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/assistant/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/assistant/generate.ts api/assistant/generate.test.ts
git commit -m "feat(assistant): tier generate to gpt-5.2 + gemini-3.1-flash-lite"
```

---

## Task 5: Wire `refine.ts` to the shared map

**Files:**
- Modify: `api/assistant/refine.ts` (`REFINE_MODEL` + `MAX_TOKENS` consts ~line 8-16; `chat(...)` call ~line 140-151)
- Test: `api/assistant/refine.test.ts` (usage assertion ~line 85-91)

- [ ] **Step 1: Update the test to expect the new Gemini model**

In `api/assistant/refine.test.ts`, change the `body.usage` expectation in the
"returns action=refine ..." test from `model: 'gemini-2.5-flash'` to:

```ts
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash',
      input_tokens: 600,
      cached_input_tokens: 0,
      output_tokens: 300,
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/assistant/refine.test.ts`
Expected: FAIL — received `gemini-2.5-flash`, expected `gemini-3.5-flash`.

- [ ] **Step 3: Implement the change**

In `api/assistant/refine.ts`:

1. Delete both constant blocks:

```ts
const REFINE_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
};

const MAX_TOKENS: Record<'openai' | 'gemini', number> = {
  openai: 1200,
  gemini: 2000,
};
```

and add the import near the other `../` imports:

```ts
import { ASSISTANT_MODELS } from '../_assistant-models.js';
```

2. Replace `const chosenModel = REFINE_MODEL[model];` with:

```ts
  const stage = ASSISTANT_MODELS.refine[model];
  const chosenModel = stage.model;
```

3. Update the `chat({...})` call to pass effort + maxTokens from the map (keep `json: true`,
   no `jsonSchema` — refine uses lenient JSON mode):

```ts
    const result = await chat({
      provider: model,
      model: chosenModel,
      reasoningEffort: stage.effort,
      system,
      user,
      json: true,
      maxTokens: stage.maxTokens,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/assistant/refine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/assistant/refine.ts api/assistant/refine.test.ts
git commit -m "feat(assistant): tier refine to gpt-5.2(effort=low) + gemini-3.5-flash"
```

---

## Task 6: Full verification + live smoke test

**Files:** none (verification only)

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors. (If `ASSISTANT_MODELS[stage][provider]` indexing complains, ensure
the endpoint's `model` variable is typed `'openai' | 'gemini'` at the indexing site — it
already is, since the `claude` case returns 400 earlier.)

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all green, including `_llm.test.ts`, `_assistant-models.test.ts`, and the three
endpoint tests.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Pre-flight — confirm the exact model slugs exist**

The slugs `gpt-5.2`, `gemini-3.5-flash`, `gemini-3.1-flash-lite` must match what the live
APIs accept. Verify before relying on the UI (a wrong slug returns a model-not-found error):

```bash
# OpenAI — should list an id matching gpt-5.2
curl -s https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | grep -i "gpt-5.2"
# Gemini — should list the flash + flash-lite ids
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | grep -iE "gemini-3.5-flash|gemini-3.1-flash-lite"
```

If a slug differs, update only `api/_assistant-models.ts` (and the matching test
assertion), re-run `npx vitest run`, and commit.

- [ ] **Step 5: Live smoke test (local dev)**

Run: `npm run dev`, open `http://localhost:5173/assistant/<token>` (token from
`VITE_ASSISTANT_TOKENS` in `.env.local`). On **Roosterbet**, for **both** OpenAI and Gemini:

1. **concepts** — generate 3 concepts; confirm they are distinct + on-brand, then
   regenerate and confirm the new set is fresh (diversity holds without the OpenAI
   temperature lever).
2. **generate** — pick one; confirm all 8 fields populate and the brand palette/mandate
   shows through.
3. **refine** — give a clear instruction (should refine), a vague one (should clarify),
   and "this is not a casino scene like I told you" (should ADD a casino scene, not remove).
4. **Watch latency:** confirm each call returns under ~10s — especially `refine` on OpenAI
   (`effort=low`). If `refine` exceeds the budget, change `refine.openai.effort` to `'none'`
   in `api/_assistant-models.ts`, re-run `npx vitest run`, and commit.
5. Watch the dev console / network tab for any Gemini error mentioning `thinkingConfig`
   on the 3.x flash models. If present, guard the `thinkingBudget: 0` block in
   `api/_llm.ts` so it is only sent to models known to accept it, then re-test.

- [ ] **Step 6: Final commit (if any fixes were made in Step 4-5)**

```bash
git add -A
git commit -m "chore(assistant): finalize model slugs + effort after live smoke test"
```

- [ ] **Step 7: Deploy — ONLY on explicit user approval**

Per project rule (never auto-deploy): propose the deploy and wait. On approval:

```bash
git push origin main   # Vercel auto-deploys
```

Then repeat the Step 5 smoke test against the live URL to confirm parity.

---

## Self-Review notes

- **Spec coverage:** `_llm` reasoningEffort + temperature guard (Task 1), shared model map
  (Task 2), all three stages tiered (Tasks 3-5), 10s-timeout + slug + thinking-guard
  verification (Task 6). All spec sections covered.
- **Type consistency:** `ASSISTANT_MODELS[stage][provider]` returns `ProviderModel`
  ({model, effort?, maxTokens}); every endpoint uses `stage.model` / `stage.effort` /
  `stage.maxTokens`; `chat()` consumes `reasoningEffort` added in Task 1. Names match across tasks.
- **No placeholders:** every code step shows the exact code; every run step shows the
  command + expected result.
