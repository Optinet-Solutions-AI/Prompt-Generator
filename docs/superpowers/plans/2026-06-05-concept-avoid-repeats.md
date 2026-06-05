# Never-Repeat Assistant Concepts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When regenerating concepts for the same brief, never repeat an idea already shown — the frontend remembers shown concepts and sends them, the backend tells the model to avoid them.

**Architecture:** Backend gains a pure `buildAvoidClause(avoid)` helper that `concepts.ts` appends to the prompt when the request carries an `avoid` list. Frontend gains pure `conceptGist`/`mergeAvoid` helpers; `AssistantPage` keeps a running avoid-list per brief (reset on brand/task change, capped at 15) and sends it each regenerate. Layers on top of the existing diversity prompt + rotating lens.

**Tech Stack:** Vercel Node functions (TypeScript) + React (Vite), OpenAI/Gemini via `api/_llm.ts`, vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-concept-avoid-repeats-design.md`

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `api/_assistant-prompts.ts` | Add pure `buildAvoidClause(avoid: string[])`. | **Modify** |
| `api/_assistant-prompts.test.ts` | Tests for `buildAvoidClause`. | **Modify** |
| `api/assistant/concepts.ts` | Accept `avoid?: string[]`; append the avoid clause to the prompt. | **Modify** |
| `src/lib/concept-avoid.ts` | Pure `conceptGist` + `mergeAvoid` (gist, de-dupe, cap). | **New** |
| `src/lib/concept-avoid.test.ts` | Tests for the pure helpers. | **New** |
| `src/lib/assistant-client.ts` | `requestConcepts` gains `avoid?: string[]`. | **Modify** |
| `src/pages/AssistantPage.tsx` | Track + send + accumulate + reset the avoid-list. | **Modify** |

---

## Task 1: `buildAvoidClause` (backend prompt helper)

**Files:**
- Modify: `api/_assistant-prompts.ts` (add export, e.g. after `pickConceptLens`)
- Test: `api/_assistant-prompts.test.ts`

- [ ] **Step 1: Write the failing tests** — add to `api/_assistant-prompts.test.ts`:

```ts
import { buildAvoidClause } from './_assistant-prompts.js';

describe('buildAvoidClause', () => {
  it('returns empty string for an empty or blank-only list', () => {
    expect(buildAvoidClause([])).toBe('');
    expect(buildAvoidClause(['  ', ''])).toBe('');
  });
  it('lists the items under a do-not-repeat header', () => {
    const out = buildAvoidClause(['Sky Ascent — hero in golden sky', 'Vault Reveal — hand in vault']);
    expect(out).toMatch(/do NOT repeat or lightly re-skin/i);
    expect(out).toContain('- Sky Ascent — hero in golden sky');
    expect(out).toContain('- Vault Reveal — hand in vault');
  });
});
```

(Make sure `buildAvoidClause` is added to the existing import line from `'./_assistant-prompts.js'` at the top of the test file.)

- [ ] **Step 2: Run to verify it fails** — `npx vitest run api/_assistant-prompts.test.ts` → FAIL (`buildAvoidClause` not exported).

- [ ] **Step 3: Implement** — add to `api/_assistant-prompts.ts` (e.g. right after `pickConceptLens`):

```ts
/** A prompt block listing ideas the model must NOT repeat. Empty list → '' (no block). */
export function buildAvoidClause(avoid: string[]): string {
  const items = (avoid || []).map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return '';
  return [
    'ALREADY-SHOWN IDEAS — do NOT repeat or lightly re-skin any of these. Every concept must be a brand-new direction not in this list:',
    ...items.map(s => `- ${s}`),
  ].join('\n');
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run api/_assistant-prompts.test.ts` → PASS (all existing + new).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add api/_assistant-prompts.ts api/_assistant-prompts.test.ts
git commit -m "feat(assistant): add buildAvoidClause prompt helper"
```

---

## Task 2: Accept `avoid` in the concepts endpoint

**Files:**
- Modify: `api/assistant/concepts.ts` (import ~line 4; `req.body` destructure ~line 16-19; user message ~line 38-40)

- [ ] **Step 1: Add `buildAvoidClause` to the import**

In `api/assistant/concepts.ts`, the import is:
```ts
import { buildConceptsSystemPrompt, CONCEPTS_JSON_SCHEMA, pickConceptLens } from '../_assistant-prompts.js';
```
Change it to:
```ts
import { buildConceptsSystemPrompt, CONCEPTS_JSON_SCHEMA, pickConceptLens, buildAvoidClause } from '../_assistant-prompts.js';
```

- [ ] **Step 2: Read `avoid` from the body**

Find:
```ts
  const { token, brand, task, description, model } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    model?: 'openai' | 'gemini' | 'claude';
  };
```
Replace with:
```ts
  const { token, brand, task, description, model, avoid } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    model?: 'openai' | 'gemini' | 'claude'; avoid?: string[];
  };
```

- [ ] **Step 3: Append the avoid clause to the user message**

Find:
```ts
    const lens = pickConceptLens();
    const user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}\n\nCREATIVE LENS for THIS set — use it to find a fresh angle and avoid repeating the obvious default: ${lens}`;
```
Replace with (note `let`, and the conditional append):
```ts
    const lens = pickConceptLens();
    let user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}\n\nCREATIVE LENS for THIS set — use it to find a fresh angle and avoid repeating the obvious default: ${lens}`;
    const avoidClause = buildAvoidClause(avoid ?? []);
    if (avoidClause) user += `\n\n${avoidClause}`;
```

- [ ] **Step 4: Typecheck + run the concepts test**

Run: `npx tsc --noEmit` → PASS.
Run: `npx vitest run api/assistant/concepts.test.ts` → PASS (existing test sends no `avoid`, so behavior is unchanged for it).

- [ ] **Step 5: Commit**

```bash
git add api/assistant/concepts.ts
git commit -m "feat(assistant): concepts endpoint accepts an avoid list and injects it"
```

---

## Task 3: Frontend pure helpers (`conceptGist` + `mergeAvoid`)

**Files:**
- Create: `src/lib/concept-avoid.ts`
- Test: `src/lib/concept-avoid.test.ts`

- [ ] **Step 1: Write the failing tests** — Create `src/lib/concept-avoid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { conceptGist, mergeAvoid } from './concept-avoid';

describe('conceptGist', () => {
  it('joins the title with a truncated description gist', () => {
    expect(
      conceptGist({ title: 'Sky Ascent', description: 'Hero stands atop a rocket in a golden sky with coins raining everywhere' }, 6),
    ).toBe('Sky Ascent — Hero stands atop a rocket in');
  });
  it('falls back to the title when the description is empty', () => {
    expect(conceptGist({ title: 'Vault', description: '' })).toBe('Vault');
  });
});

describe('mergeAvoid', () => {
  it('appends new gists, de-dupes case-insensitively', () => {
    const next = mergeAvoid(['A — alpha'], [
      { title: 'A', description: 'alpha' },        // dup
      { title: 'B', description: 'beta gamma' },
    ]);
    expect(next).toEqual(['A — alpha', 'B — beta gamma']);
  });
  it('keeps only the last `cap` entries', () => {
    const prev = Array.from({ length: 15 }, (_, i) => `P${i} — x`);
    const next = mergeAvoid(prev, [{ title: 'NEW', description: 'one' }], 15);
    expect(next).toHaveLength(15);
    expect(next[14]).toBe('NEW — one');
    expect(next[0]).toBe('P1 — x'); // P0 dropped
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/concept-avoid.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — Create `src/lib/concept-avoid.ts`:

```ts
import type { AssistantConcept } from './assistant-types';

/** Compact "title — first words of description" descriptor used to tell the model what to avoid. */
export function conceptGist(c: { title: string; description: string }, words = 12): string {
  const title = (c.title || '').trim();
  const gist = (c.description || '').trim().split(/\s+/).filter(Boolean).slice(0, words).join(' ');
  return gist ? `${title} — ${gist}` : title;
}

/** Append new concepts' gists to the running avoid-list, de-dupe (case-insensitive), keep the last `cap`. */
export function mergeAvoid(prev: string[], concepts: AssistantConcept[], cap = 15): string[] {
  const seen = new Set(prev.map(s => s.toLowerCase()));
  const out = [...prev];
  for (const c of concepts) {
    const g = conceptGist(c);
    const key = g.toLowerCase();
    if (!seen.has(key)) { out.push(g); seen.add(key); }
  }
  return out.slice(-cap);
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/lib/concept-avoid.test.ts` → PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/concept-avoid.ts src/lib/concept-avoid.test.ts
git commit -m "feat(assistant): conceptGist + mergeAvoid helpers for the avoid-list"
```

---

## Task 4: Wire the avoid-list through the Assistant UI

**Files:**
- Modify: `src/lib/assistant-client.ts` (`requestConcepts` ~line 24-32)
- Modify: `src/pages/AssistantPage.tsx` (imports; state ~line 33-43; `onSuggest` ~line 59-68)

- [ ] **Step 1: Add `avoid` to `requestConcepts`**

In `src/lib/assistant-client.ts`, change:
```ts
export function requestConcepts(args: {
  token: string;
  brand: string;
  task: string;
  description?: string;
  model: AssistantProvider;
}) {
  return postJson<ConceptsResponse>('/api/assistant/concepts', args);
}
```
to:
```ts
export function requestConcepts(args: {
  token: string;
  brand: string;
  task: string;
  description?: string;
  model: AssistantProvider;
  avoid?: string[];
}) {
  return postJson<ConceptsResponse>('/api/assistant/concepts', args);
}
```

- [ ] **Step 2: Import the helper + React `useRef` in `AssistantPage.tsx`**

Ensure `useRef` is in the React import (e.g. `import { useState, useRef } from 'react';` — add `useRef` if missing). Add the helper import near the other `@/lib` imports:
```ts
import { mergeAvoid } from '@/lib/concept-avoid';
```

- [ ] **Step 3: Add the avoid state + key ref**

In `AssistantPage.tsx`, near the other `useState` declarations (~line 33-43), add:
```ts
  const [avoid, setAvoid] = useState<string[]>([]);
  const avoidKeyRef = useRef<string>('');
```

- [ ] **Step 4: Send + accumulate + reset in `onSuggest`**

Replace the existing `onSuggest`:
```ts
  async function onSuggest() {
    setError(null); setLoading(true); setConcepts(null);
    setGenerated(null); setPickedConcept(null);
    try {
      const r = await requestConcepts({ token: token!, brand, task, description, model });
      setConcepts(r.concepts);
      setRecommendation(r.recommendation);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
```
with:
```ts
  async function onSuggest() {
    setError(null); setLoading(true); setConcepts(null);
    setGenerated(null); setPickedConcept(null);
    // Reset the avoid-list when the brief (brand+task) changes; otherwise accumulate
    // so each regenerate avoids every idea already shown for this brief.
    const key = `${brand}␟${task}`;
    const base = key === avoidKeyRef.current ? avoid : [];
    avoidKeyRef.current = key;
    try {
      const r = await requestConcepts({ token: token!, brand, task, description, model, avoid: base });
      setConcepts(r.concepts);
      setRecommendation(r.recommendation);
      setAvoid(mergeAvoid(base, r.concepts));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit` → PASS.
Run: `npm run build` → builds successfully.

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant-client.ts src/pages/AssistantPage.tsx
git commit -m "feat(assistant): UI sends + accumulates the avoid-list per brief (reset on brand/task change)"
```

---

## Task 5: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npx vitest run` → all green (incl. new `buildAvoidClause` + `concept-avoid` tests).
Run: `npx tsc --noEmit` → PASS.
Run: `npm run build` → success.

- [ ] **Step 2: Deploy**

```bash
git push origin main
```
Wait ~75s for Vercel.

- [ ] **Step 3: Live smoke test (no-repeat across regenerations)**

Write a short script that reads the token from `.env.local` (`VITE_ASSISTANT_TOKENS`, first comma-separated value) and, for brand `RocketSpin` + a fixed task, calls `/api/assistant/concepts` 5 times in a row, each time **sending the accumulating `avoid` list** (mimicking the frontend: after each call, append the returned concepts' gists — reuse the same gist shape `"<title> — <first 12 words>"`). Collect all titles.
Expected: **no title repeats across the 5 runs** (status 200 each, no MAX_TOKENS errors). Then change the task and call once with `avoid: []` → confirm it returns fresh concepts (reset works; overlap with the prior brief is allowed).

- [ ] **Step 4: Report**

Plain-English: regenerating the same brief now returns brand-new ideas each time (the model is told exactly what to avoid); changing the brief resets it.

---

## Self-Review

**Spec coverage:**
- `buildAvoidClause` (empty → '', non-empty → do-not-repeat block) → Task 1 + tests. ✓
- concepts.ts accepts `avoid`, appends clause only when non-empty → Task 2. ✓
- `conceptGist` (title + gist) + `mergeAvoid` (append, de-dupe, cap 15) → Task 3 + tests. ✓
- `requestConcepts` carries `avoid` → Task 4 Step 1. ✓
- AssistantPage accumulates per brief, resets on brand/task change, caps via `mergeAvoid` → Task 4 Steps 3-4. ✓
- First draft (empty avoid) behaves as today → Task 1 empty-list test + Task 2 conditional append. ✓
- Testing: unit (Tasks 1, 3) + live no-repeat smoke (Task 5). ✓
- Out of scope (persistence across reload, schema/UI layout changes) → none added. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. Task 5 Step 3 describes the smoke script precisely (token source, 5 runs, accumulate gists, expected no-repeat) rather than pasting a full script — acceptable for a verification-only step.

**Type consistency:** `AssistantConcept = { title: string; description: string }` (confirmed) used by `conceptGist`/`mergeAvoid` (Task 3) and `requestConcepts` (Task 4). `buildAvoidClause(avoid: string[]): string` (Task 1) called with `avoid ?? []` in Task 2. `avoid?: string[]` consistent across the request type (Task 4), the endpoint body (Task 2), and the page state (Task 4). The page sends `avoid: base` (a `string[]`), and `mergeAvoid(base, r.concepts)` returns `string[]`.
