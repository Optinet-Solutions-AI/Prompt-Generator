# Diverse Assistant Concepts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Assistant's 3 concept suggestions genuinely diverse and mind-expanding (fresh, non-obvious directions across different axes, spanning a range of boldness) instead of near-duplicate variations of the same idea — while keeping brand identity intact.

**Architecture:** Pure prompt + LLM-config change. `brandBlock` (shared by the concepts and generate stages) gains an identity-vs-composition clause so brand identity stays mandatory but composition/scene varies. `buildConceptsSystemPrompt` is rewritten to act as a creative expander. `chat()` gains an optional `temperature`, and the concepts call uses `0.9`. Backend only; no schema or frontend change.

**Tech Stack:** Vercel Node functions (TypeScript), OpenAI + Gemini via the `api/_llm.ts` wrapper, vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-concept-diversity-design.md`

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `api/_llm.ts` | Add optional `temperature` to `ChatOptions`; thread into OpenAI + Gemini request bodies. | **Modify** |
| `api/_llm.test.ts` | Add temperature-threading tests (both providers). | **Modify** |
| `api/_assistant-prompts.ts` | `brandBlock` identity-vs-composition clause; rewrite `buildConceptsSystemPrompt` for creative expansion. | **Modify** |
| `api/_assistant-prompts.test.ts` | Update the stale "visually distinct" assertion; add expansion / range / identity-vs-composition assertions. | **Modify** |
| `api/assistant/concepts.ts` | Pass `temperature: 0.9` to the `chat()` call. | **Modify** |

---

## Task 1: Thread an optional `temperature` through `chat()`

**Files:**
- Modify: `api/_llm.ts` (`ChatOptions` ~line 3-11; `chatGemini` `generationConfig` ~line 79-93; `chatOpenAI` `body` ~line 140-153)
- Test: `api/_llm.test.ts`

- [ ] **Step 1: Write the failing tests**

In `api/_llm.test.ts`, add this test inside the existing `describe('_llm.chat — OpenAI', ...)` block:

```ts
  it('includes temperature in the OpenAI body when provided, omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 0 } } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'openai', model: 'gpt-4o-mini', system: 's', user: 'u', maxTokens: 100, temperature: 0.9 });
    let body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBe(0.9);

    fetchMock.mockClear();
    await chat({ provider: 'openai', model: 'gpt-4o-mini', system: 's', user: 'u', maxTokens: 100 });
    body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.temperature).toBeUndefined();
  });
```

And this test inside the existing `describe('_llm.chat — Gemini', ...)` block:

```ts
  it('includes temperature in the Gemini generationConfig when provided, omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await chat({ provider: 'gemini', model: 'gemini-2.5-flash', system: 's', user: 'u', maxTokens: 100, temperature: 0.9 });
    let body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.temperature).toBe(0.9);

    fetchMock.mockClear();
    await chat({ provider: 'gemini', model: 'gemini-2.5-flash', system: 's', user: 'u', maxTokens: 100 });
    body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.generationConfig.temperature).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run api/_llm.test.ts`
Expected: the two new tests FAIL (body has no `temperature` yet).

- [ ] **Step 3: Implement — add `temperature` to `ChatOptions`**

In `api/_llm.ts`, change the `ChatOptions` interface (~line 3-11) to add `temperature?`:

```ts
export interface ChatOptions {
  provider: Provider;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  json?: boolean;
  jsonSchema?: object;
  temperature?: number;
}
```

- [ ] **Step 4: Implement — thread it into the Gemini body**

In `chatGemini`, find (~line 90-93):

```ts
  if (opts.json) {
    generationConfig.responseMimeType = 'application/json';
    if (opts.jsonSchema) generationConfig.responseSchema = sanitizeSchemaForGemini(opts.jsonSchema);
  }
```

Immediately AFTER that block, add:

```ts
  if (opts.temperature !== undefined) generationConfig.temperature = opts.temperature;
```

- [ ] **Step 5: Implement — thread it into the OpenAI body**

In `chatOpenAI`, find (~line 149-153):

```ts
  if (opts.json) {
    body.response_format = opts.jsonSchema
      ? { type: 'json_schema', json_schema: { name: 'assistant_output', strict: true, schema: opts.jsonSchema } }
      : { type: 'json_object' };
  }
```

Immediately AFTER that block, add:

```ts
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run api/_llm.test.ts`
Expected: PASS (all existing tests + the 2 new ones).

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add api/_llm.ts api/_llm.test.ts
git commit -m "feat(assistant): thread optional temperature through chat() (both providers)"
```

---

## Task 2: Rewrite the concepts prompt for creative expansion + decouple identity/composition

**Files:**
- Modify: `api/_assistant-prompts.ts` (`brandBlock` ~line 16-30; `buildConceptsSystemPrompt` ~line 32-43)
- Test: `api/_assistant-prompts.test.ts`

- [ ] **Step 1: Update + add the failing tests**

In `api/_assistant-prompts.test.ts`, REPLACE the existing test (currently asserting `/visually distinct/i`):

```ts
  it('instructs the model to return exactly 3 visually distinct concepts as JSON', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/exactly 3 concepts/i);
    expect(out).toMatch(/visually distinct/i);
  });
```

with these tests:

```ts
  it('instructs the model to return exactly 3 genuinely-different concepts as JSON', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/exactly 3 concepts/i);
    expect(out).toMatch(/genuinely different visual direction/i);
    expect(out).toMatch(/do NOT return the same scene/i);
  });

  it('frames the assistant as a creative expander (more/newer, non-obvious)', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/expand the user'?s thinking/i);
    expect(out).toMatch(/more and newer ideas/i);
    expect(out).toMatch(/non-obvious/i);
  });

  it('requires a range of boldness (a safe direction and a bolder stretch)', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/range of boldness/i);
    expect(out).toMatch(/bolder/i);
  });

  it('decouples brand identity from composition', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/IDENTITY vs COMPOSITION/i);
    expect(out).toMatch(/not a fixed composition/i);
    expect(out).toMatch(/one option to draw from/i);
  });
```

Also add this to the existing `describe('buildGenerateSystemPrompt', ...)` block (the generate stage shares `brandBlock`, so it must inherit the clause too):

```ts
  it('inherits the identity-vs-composition clause from the brand block', () => {
    const out = buildGenerateSystemPrompt('RocketSpin');
    expect(out).toMatch(/IDENTITY vs COMPOSITION/i);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: the new/updated tests FAIL (current prompt lacks this wording).

- [ ] **Step 3: Implement — add the identity-vs-composition clause to `brandBlock`**

In `api/_assistant-prompts.ts`, replace the `brandBlock` function (~line 16-30) with:

```ts
function brandBlock(brand: string): string {
  const { palette, mandate } = buildBrandRules(brand);
  if (!palette) {
    return `The brand for this work is ${brand}. (No brand-specific rules registered — match the provided task and description faithfully.)`;
  }
  return [
    `The brand for this work is ${brand}. Apply these rules to every concept:`,
    '',
    'COLOR PALETTE:',
    palette,
    '',
    mandate ? 'STYLE MANDATE:' : '',
    mandate,
    '',
    'IDENTITY vs COMPOSITION: The rules above define the brand IDENTITY — colour palette,',
    'character look, and style — and MUST be applied to every concept. They are NOT a fixed',
    'composition: vary the setting, shot scale (wide establishing vs tight hero vs',
    'product-forward), framing, camera angle, action/moment, and mood across concepts. Any',
    'specific composition a rule suggests (e.g. a centered hero or symmetrical framing) is',
    'ONE option to draw from, not a requirement for every image.',
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 4: Implement — rewrite `buildConceptsSystemPrompt`**

Replace `buildConceptsSystemPrompt` (~line 32-43) with:

```ts
export function buildConceptsSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    "YOUR JOB IS TO EXPAND THE USER'S THINKING, NOT NARROW IT: give them more and newer",
    'ideas than they arrived with. Propose fresh, non-obvious directions they may not have',
    'considered. Avoid the most predictable or clichéd take on the brief.',
    '',
    'Return exactly 3 concepts as strict JSON: {"concepts":[{"title","description"}],"recommendation"}.',
    'The 3 concepts must each open a GENUINELY DIFFERENT visual direction, differing on',
    'different axes — a different environment/setting, a different shot scale (wide',
    'establishing vs tight hero), a different action/moment, a different mood or time of day,',
    'or a different conceptual angle. Do NOT return the same scene or subject with only minor',
    'changes — if two concepts could share one background, they are too similar; push them apart.',
    'Span a range of boldness: at least one concept is a safe, on-brief direction and at least',
    'one is a bolder, more unexpected stretch that widens the options.',
    'Description must be 2-3 sentences, practical, scannable.',
    'The "recommendation" field is one short sentence: which concept you would pick and why.',
  ].join('\n');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: PASS — the new concepts tests, the generate-stage clause test, AND the pre-existing tests that assert brand identity still present (`/champagne gold/i`, `/chest reactor/i`) and the personality preamble.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add api/_assistant-prompts.ts api/_assistant-prompts.test.ts
git commit -m "feat(assistant): concepts prompt expands ideas; decouple brand identity from composition"
```

---

## Task 3: Use the temperature in the concepts call

**Files:**
- Modify: `api/assistant/concepts.ts` (the `chat(...)` call ~line 41-49)

- [ ] **Step 1: Add `temperature: 0.9` to the concepts `chat()` call**

In `api/assistant/concepts.ts`, find:

```ts
    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: CONCEPTS_JSON_SCHEMA,
      maxTokens: 600,
    });
```

Replace with (adds the temperature; comment explains why):

```ts
    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: CONCEPTS_JSON_SCHEMA,
      maxTokens: 600,
      // Higher temperature widens the spread between the 3 concepts (diversity).
      temperature: 0.9,
    });
```

- [ ] **Step 2: Typecheck + run the concepts test**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npx vitest run api/assistant/concepts.test.ts`
Expected: PASS — the existing test mocks `fetch` and checks the response, so adding `temperature` does not break it.

- [ ] **Step 3: Commit**

```bash
git add api/assistant/concepts.ts
git commit -m "feat(assistant): concepts call uses temperature 0.9 for more diverse options"
```

---

## Task 4: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npx vitest run` → expect all green (includes the new `_llm` + `_assistant-prompts` tests).
Run: `npx tsc --noEmit` → expect PASS.
Run: `npm run build` → expect a successful build.

- [ ] **Step 2: Deploy**

```bash
git push origin main
```

Wait ~75s for Vercel.

- [ ] **Step 3: Functional / qualitative check**

The `/api/assistant/concepts` endpoint is token-gated (`VITE_ASSISTANT_TOKENS`), so the qualitative "are the 3 genuinely diverse and on-brand?" judgement is best confirmed by the user in the live Assistant UI. Confirm with the user:
- For RocketSpin, run the same task 2–3 times → the three concepts should be clearly different directions (different setting/shot/mood), with at least one bold/unexpected stretch, and all still recognisably RocketSpin (champagne-gold/cyan palette, hero identity).
- Repeat for one non-RocketSpin brand (e.g. Roosterbet) → still diverse and on-brand, no regression.

If a valid assistant token + LLM key is available to the implementer, optionally script a direct call to `/api/assistant/concepts` (POST `{token, brand:'RocketSpin', task, model:'gemini'}`) twice and eyeball the returned `concepts` for diversity; otherwise hand to the user.

- [ ] **Step 4: Report**

Plain-English summary: the concept generator now expands ideas (3 genuinely different directions, a range of boldness, brand identity kept as a guardrail), temperature 0.9 adds spread, and the change also flows into the final image prompt via the shared brand block.

---

## Self-Review

**Spec coverage:**
- Guiding intent (expand thinking, more/newer ideas) → Task 2 concepts prompt ("EXPAND THE USER'S THINKING", "more and newer ideas", "non-obvious"). ✓
- Identity vs composition decoupling (shared by both stages) → Task 2 `brandBlock` clause + generate-stage inheritance test. ✓
- Orthogonal diversity + "don't repeat the same scene" → Task 2 concepts prompt. ✓
- Range of boldness (safe + bold stretch) → Task 2 concepts prompt + test. ✓
- Temperature 0.9 on concepts, threaded through chat() for both providers, omitted when unset → Tasks 1 + 3 + tests. ✓
- No schema/frontend change → none touched. ✓
- Testing (unit prompt content + temperature threading; live qualitative) → Tasks 1, 2, 4. ✓
- Brand fidelity not regressed → Task 2 keeps palette/mandate; pre-existing identity tests retained; live check confirms. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code.

**Type consistency:** `temperature?: number` added to `ChatOptions` (Task 1) and passed in `concepts.ts` (Task 3). `buildConceptsSystemPrompt(brand: string)` / `buildGenerateSystemPrompt(brand: string)` / `brandBlock(brand: string)` signatures unchanged. Test imports (`buildConceptsSystemPrompt`, `buildGenerateSystemPrompt`, `chat`) match existing exports.
