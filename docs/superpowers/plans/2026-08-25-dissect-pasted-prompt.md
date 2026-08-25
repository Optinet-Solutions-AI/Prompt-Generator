# Dissect a Pasted Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone paste a finished prompt written elsewhere, have an AI extract the eight reference fields from it, correct anything wrong, and save it as a reference — and remove a live button that has been silently writing empty rows.

**Architecture:** A new `api/dissect-prompt.ts` mirrors `api/assistant/generate.ts` with the direction reversed — instead of composing eight fields from a brief, it extracts them from finished prose. It uses the existing `chat()` helper (retries, Gemini schema sanitisation, usage reporting) and is ungated like every other main-app endpoint. The existing Save-as-Reference dialog gains a paste mode; the save itself reuses the `/api/save-as-reference` POST unchanged.

**Tech Stack:** Vercel serverless API routes (`api/*.ts`), Vite + React 18, TypeScript, vitest 4 (`environment: 'node'`, no jsdom), shadcn/ui, Supabase REST.

**Spec:** `docs/superpowers/specs/2026-08-25-dissect-pasted-prompt-design.md`

## Global Constraints

- **Relative imports inside `api/` use the `.js` extension** even though files are `.ts`. Files in `src/` use **no** extension and the `@/` alias.
- `vitest.config.ts` uses `globals: false` and `environment: 'node'` — import `describe/it/expect/vi` explicitly from `'vitest'`, and **component rendering cannot be tested**. Do not add jsdom.
- Tests: `npm test`. **The suite is currently at 223 passing — do not regress it.** Also run `npx tsc --noEmit -p tsconfig.json` and `npm run build` on every task.
- **Never auto-commit.** Project rule (CLAUDE.md): propose the commit message and wait for approval. The `git commit` steps here are the *proposed* commit.
- Developer is a beginner with no coding background — comments explain *why*.
- **The eight fields, exactly:** `format_layout`, `primary_object`, `subject`, `lighting`, `mood`, `background`, `positive_prompt`, `negative_prompt`.
- **No new save endpoint.** `api/[action].ts`'s `save-as-reference` already accepts `title`, `brand_name`, `prompt_category` and the eight fields, and writes to `web_image_analysis`. Do not add another.
- **Do not change `api/[action].ts`.** It is 900+ lines and its own comment says cross-file imports are deliberately avoided there.
- **Do not change `api/generate-prompt.ts`** — its stale `gpt-4o` pin is a known, separate issue.

### Verified facts (do not re-derive)

- `chat()` in `api/_llm.ts` takes `{ provider, model, system, user, maxTokens, json?, jsonSchema?, temperature?, reasoningEffort? }` and returns `{ text, usage: { input_tokens, cached_input_tokens, output_tokens } }`.
- `gemini-3.7-flash` is priced in `LLM_PRICING` ($0.75 in / $3.75 out per 1M), measured at ~7s, and is compatible with the `thinkingBudget: 0` that `_llm.ts` injects for any model matching `/flash/`. **`gemini-3.5-flash-lite` returns HTTP 400 for that exact config — do not use it.**
- Main-app endpoints are ungated: `api/generate-prompt.ts` has no token validation and no spend cap. Token gating and the spend cap exist only on `api/assistant/*`, keyed on a tester token this feature does not have.
- **`SavePromptModal`'s save is a live corruption path.** `src/pages/Index.tsx:269` passes `onSave={handleSave}` down through `ResultDisplay` to `SavePromptModal`. `handleSave` → `savePrompt` posts `{ brand, generated_prompt }`; the handler never destructures `generated_prompt`, so every click writes a row with an empty `prompt_name` and eight nulls, then reports success.
- `resultSelectedCategory` (`ResultDisplay.tsx:104`) is **derived** from the selected reference's category, not a user control. A pasted prompt has no selected reference, so paste mode sends `prompt_category: null`, which the handler already stores as null.

---

## File Structure

**Create:**
- `api/dissect-prompt.ts` — the endpoint. One responsibility: prompt in, eight fields out.
- `api/dissect-prompt.test.ts`

**Modify:**
- `api/_assistant-prompts.ts` — add `buildDissectSystemPrompt` and `DISSECT_JSON_SCHEMA` beside the existing generate prompt.
- `api/_assistant-prompts.test.ts` — extend.
- `src/components/ResultDisplay.tsx` — paste mode in the Save-as-Reference dialog; retire the `SavePromptModal` save.
- `src/hooks/usePromptGenerator.ts` — delete `savePrompt` and `handleSave`.
- `src/pages/Index.tsx` — drop the `onSave` wiring.

---

## Task 1: Dissect prompt and schema

**Files:**
- Modify: `api/_assistant-prompts.ts` (append)
- Test: `api/_assistant-prompts.test.ts` (append)

**Interfaces:**
- Consumes: `PERSONALITY`, `brandBlock(brand)` — module-private in that file; use in place, do not export.
- Produces: `buildDissectSystemPrompt(brand: string): string`, `DISSECT_JSON_SCHEMA`

**The whole feature turns on one instruction.** A model asked to fill eight fields will fill eight fields. If the pasted prompt says nothing about lighting, the useful answer is "not specified" and the harmful one is a plausible invention — because an invented value looks authoritative in the Reference Prompt Data panel and silently steers every prompt later generated from it. Extract, never invent.

- [ ] **Step 1: Write the failing test**

Append to `api/_assistant-prompts.test.ts`:

```ts
import { buildDissectSystemPrompt, DISSECT_JSON_SCHEMA } from './_assistant-prompts.js';

describe('DISSECT_JSON_SCHEMA', () => {
  const FIELDS = [
    'format_layout', 'primary_object', 'subject', 'lighting',
    'mood', 'background', 'positive_prompt', 'negative_prompt',
  ];

  it('requires exactly the eight reference fields', () => {
    expect([...(DISSECT_JSON_SCHEMA as any).required].sort()).toEqual([...FIELDS].sort());
  });

  it('types every field as a string', () => {
    const props = (DISSECT_JSON_SCHEMA as any).properties;
    for (const f of FIELDS) expect(props[f], f).toEqual({ type: 'string' });
  });

  it('forbids extra properties so the model cannot invent columns', () => {
    expect((DISSECT_JSON_SCHEMA as any).additionalProperties).toBe(false);
  });
});

describe('buildDissectSystemPrompt', () => {
  it('names the brand so the dissection has context', () => {
    expect(buildDissectSystemPrompt('Roosterbet')).toContain('Roosterbet');
  });

  it('instructs the model to EXTRACT and not invent — the core guard', () => {
    const p = buildDissectSystemPrompt('Roosterbet');
    expect(p).toMatch(/do NOT invent/i);
    expect(p).toMatch(/not specified/i);
  });

  it('tells the model to keep positive_prompt as the pasted text, not a rewrite', () => {
    expect(buildDissectSystemPrompt('Roosterbet')).toMatch(/do NOT rewrite/i);
  });

  it('forbids conforming the fields to the brand', () => {
    // The brand is context for reading the prompt, not a target to rewrite toward.
    expect(buildDissectSystemPrompt('Roosterbet')).toMatch(/describe what was pasted/i);
  });

  it('handles a brand with no registered rules without throwing', () => {
    expect(() => buildDissectSystemPrompt('NoSuchBrand')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: FAIL — `buildDissectSystemPrompt is not a function`

- [ ] **Step 3: Implement**

Append to `api/_assistant-prompts.ts`:

```ts
/**
 * System prompt for dissecting a FINISHED prompt into the eight reference
 * fields.
 *
 * This is the inverse of buildGenerateSystemPrompt: that one composes eight
 * fields from a brief, this one reads them back out of prose someone already
 * wrote (typically in ChatGPT).
 *
 * The extract-don't-invent rule below is the whole feature. A model asked for
 * eight fields will produce eight fields, and a confidently invented "lighting"
 * looks authoritative in the Reference Prompt Data panel — then silently steers
 * every prompt later generated from that reference. An honest "not specified"
 * is far more useful than a plausible guess.
 */
export function buildDissectSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    'YOUR JOB: read the prompt the user pasted and DESCRIBE WHAT WAS PASTED by splitting it into the eight reference fields. You are documenting an existing prompt, not writing a new one.',
    '',
    'EXTRACT, DO NOT INVENT. If the pasted prompt does not state something — many prompts say nothing about format or layout — write exactly "Not specified in the source prompt" for that field. Do NOT invent a plausible value to fill the gap. A wrong value here is worse than an empty one, because it will be reused as if it were true.',
    '',
    'Do NOT rewrite the prompt to fit the brand. The brand rules above are context for understanding what you are reading, not a target to conform the fields to. If the pasted prompt contradicts the brand palette, describe what it actually says.',
    '',
    'positive_prompt: the pasted text itself, trimmed of surrounding whitespace. Do NOT rewrite, shorten, improve or re-order it — the user pasted a prompt they already like.',
    'negative_prompt: only what the source explicitly excludes. If it names no exclusions, write "Not specified in the source prompt".',
    '',
    'Return strict JSON with exactly these keys: format_layout, primary_object, subject, lighting, mood, background, positive_prompt, negative_prompt.',
  ].join('\n');
}

export const DISSECT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'format_layout', 'primary_object', 'subject', 'lighting', 'mood',
    'background', 'positive_prompt', 'negative_prompt',
  ],
  properties: {
    format_layout:   { type: 'string' },
    primary_object:  { type: 'string' },
    subject:         { type: 'string' },
    lighting:        { type: 'string' },
    mood:            { type: 'string' },
    background:      { type: 'string' },
    positive_prompt: { type: 'string' },
    negative_prompt: { type: 'string' },
  },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_assistant-prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc clean; 223 + 8 new, zero failures

- [ ] **Step 6: Commit (propose — do not run unattended)**

```bash
git add api/_assistant-prompts.ts api/_assistant-prompts.test.ts
git commit -m "feat: add dissect prompt and schema for extracting reference fields"
```

---

## Task 2: The dissect endpoint

**Files:**
- Create: `api/dissect-prompt.ts`
- Create: `api/dissect-prompt.test.ts`

**Interfaces:**
- Consumes: `buildDissectSystemPrompt`, `DISSECT_JSON_SCHEMA` (Task 1); `chat` from `./_llm.js`.
- Produces: `POST /api/dissect-prompt` with body `{ prompt: string, brand: string }` → `200 { fields, usage }`.

**Ungated deliberately.** No token validation, no spend cap — matching `api/generate-prompt.ts` and the rest of the main app. The cap is keyed on a tester token this feature does not have.

- [ ] **Step 1: Write the failing test**

Create `api/dissect-prompt.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chatMock } = vi.hoisted(() => ({ chatMock: vi.fn() }));
vi.mock('./_llm.js', () => ({ chat: (...args: unknown[]) => chatMock(...args) }));

import handler from './dissect-prompt.js';

function mockReqRes(body: unknown, method = 'POST') {
  const req = { method, body } as any;
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(p: unknown) { this.body = p; return this; },
  };
  return { req, res };
}

const FIELDS = {
  format_layout: 'Wide cinematic frame',
  primary_object: 'A glowing wheel',
  subject: 'An astronaut',
  lighting: 'Not specified in the source prompt',
  mood: 'Mysterious',
  background: 'Dark industrial bay',
  positive_prompt: 'A cinematic banner of an astronaut',
  negative_prompt: 'Not specified in the source prompt',
};

const OK = {
  text: JSON.stringify(FIELDS),
  usage: { input_tokens: 120, cached_input_tokens: 0, output_tokens: 300 },
};

describe('POST /api/dissect-prompt', () => {
  beforeEach(() => {
    chatMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns the eight extracted fields and the usage', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'A cinematic banner of an astronaut', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.fields.subject).toBe('An astronaut');
    expect(body.usage.output_tokens).toBe(300);
  });

  it('passes the pasted prompt as the user message and the schema to chat()', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'MY PASTED PROMPT', brand: 'RocketSpin' });
    await handler(req, res as any);
    const opts = chatMock.mock.calls[0][0] as any;
    expect(opts.user).toContain('MY PASTED PROMPT');
    expect(opts.json).toBe(true);
    expect(opts.jsonSchema).toBeTruthy();
  });

  it('uses gemini-3.7-flash — flash-lite returns 400 for the thinkingBudget the llm helper injects', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect((chatMock.mock.calls[0][0] as any).model).toBe('gemini-3.7-flash');
  });

  it('gives the model enough tokens that a long prompt cannot truncate the JSON', async () => {
    chatMock.mockResolvedValue(OK);
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect((chatMock.mock.calls[0][0] as any).maxTokens).toBeGreaterThanOrEqual(4000);
  });

  it('405s on GET', async () => {
    const { req, res } = mockReqRes({}, 'GET');
    await handler(req, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('400s when prompt is missing', async () => {
    const { req, res } = mockReqRes({ brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('400s when prompt is only whitespace — do not spend money on an empty call', async () => {
    const { req, res } = mockReqRes({ prompt: '   \n  ', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('400s when brand is missing', async () => {
    const { req, res } = mockReqRes({ prompt: 'x' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(400);
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('500s with the underlying detail when the model call fails', async () => {
    chatMock.mockRejectedValue(new Error('model unavailable'));
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(500);
    expect(String((res.body as any).error)).toMatch(/model unavailable/);
  });

  it('500s when the model returns unparseable JSON', async () => {
    chatMock.mockResolvedValue({ text: 'not json', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
    const { req, res } = mockReqRes({ prompt: 'x', brand: 'RocketSpin' });
    await handler(req, res as any);
    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/dissect-prompt.test.ts`
Expected: FAIL — cannot resolve `./dissect-prompt.js`

- [ ] **Step 3: Implement**

Create `api/dissect-prompt.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chat } from './_llm.js';
import { buildDissectSystemPrompt, DISSECT_JSON_SCHEMA } from './_assistant-prompts.js';

// Every slow route in this repo declares its budget. api/generate-image.ts was
// the one that did not, and its renders were killed at the 60s plan default
// until that was fixed — so this one says so up front.
export const config = { maxDuration: 60 };

// Cheapest model verified working for this shape of call: ~$0.005 per
// dissection, ~7s. NOT gemini-3.5-flash-lite — it returns HTTP 400 for the
// thinkingBudget: 0 that _llm.ts injects for any model matching /flash/.
const DISSECT_MODEL = 'gemini-3.7-flash';

// Gemini's output budget includes thinking tokens, and one of the eight fields
// is the entire source prompt echoed back. The concepts stage truncated
// mid-JSON at 1200 for exactly this reason.
const DISSECT_MAX_TOKENS = 4000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, brand } = (req.body ?? {}) as { prompt?: string; brand?: string };

  // Validate before calling the model — a blank prompt would cost money and
  // return eight invented fields.
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'prompt is required' });
  if (!brand) return res.status(400).json({ error: 'brand is required' });

  try {
    const result = await chat({
      provider: 'gemini',
      model: DISSECT_MODEL,
      system: buildDissectSystemPrompt(brand),
      user: `Dissect this prompt:\n\n${prompt.trim()}`,
      json: true,
      jsonSchema: DISSECT_JSON_SCHEMA,
      maxTokens: DISSECT_MAX_TOKENS,
    });

    const fields = JSON.parse(result.text);
    return res.status(200).json({ fields, usage: result.usage });
  } catch (err) {
    console.error('dissect-prompt error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/dissect-prompt.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Typecheck, suite, build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
Expected: all pass

- [ ] **Step 6: Commit (propose)**

```bash
git add api/dissect-prompt.ts api/dissect-prompt.test.ts
git commit -m "feat: add endpoint that dissects a pasted prompt into reference fields"
```

---

## Task 3: Paste mode in the Save-as-Reference dialog

**Files:**
- Modify: `src/components/ResultDisplay.tsx` (the dialog at ~line 795, `handleSaveAsRef` at ~219)

**Interfaces:**
- Consumes: `POST /api/dissect-prompt` (Task 2).
- Produces: nothing consumed by a later task.

The dialog gets two modes. **From this prompt** is today's behaviour and must be untouched. **Paste a finished prompt** adds a textarea, a brand picker, a Dissect button, and — once dissected — the eight fields as editable inputs. Save posts to the existing `/api/save-as-reference` with whatever is in those inputs.

- [ ] **Step 1: Add state for paste mode**

In `src/components/ResultDisplay.tsx`, alongside the existing `saveAsRefOpen` / `refTitle` / `isRefSaving` / `refSaveError` state:

```tsx
  // Paste mode: save a prompt written elsewhere (e.g. in ChatGPT) as a
  // reference. The eight fields are extracted by /api/dissect-prompt and then
  // shown editable — a wrong field saved here is reused as if it were true,
  // so the user confirms before it lands.
  const [refMode, setRefMode] = useState<'generated' | 'paste'>('generated');
  const [pastedPrompt, setPastedPrompt] = useState('');
  const [pasteBrand, setPasteBrand] = useState<string>(metadata?.brand || '');
  const [isDissecting, setIsDissecting] = useState(false);
  const [dissected, setDissected] = useState<Record<string, string> | null>(null);
```

- [ ] **Step 2: Add the dissect call**

```tsx
  const REF_FIELD_KEYS = [
    'format_layout', 'primary_object', 'subject', 'lighting',
    'mood', 'background', 'positive_prompt', 'negative_prompt',
  ] as const;

  const handleDissect = async () => {
    if (!pastedPrompt.trim()) { setRefSaveError('Paste a prompt first.'); return; }
    if (!pasteBrand) { setRefSaveError('Pick a brand.'); return; }
    setIsDissecting(true);
    setRefSaveError('');
    try {
      const response = await fetch('/api/dissect-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: pastedPrompt, brand: pasteBrand }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Dissect failed (${response.status}): ${detail}`);
      }
      const data = await response.json();
      setDissected(data.fields);
    } catch (e) {
      // Leave pastedPrompt intact so it can be retried without re-pasting.
      setRefSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsDissecting(false);
    }
  };
```

- [ ] **Step 3: Make the save handle both modes**

Extend `handleSaveAsRef` so paste mode posts the edited fields. Keep the generated-mode branch byte-identical to what it does today:

```tsx
  const handleSaveAsRef = async () => {
    if (!refTitle.trim()) { setRefSaveError('Please enter a title.'); return; }
    if (refMode === 'paste' && !dissected) { setRefSaveError('Dissect the prompt first.'); return; }
    if (refMode === 'generated' && !metadata) return;
    setIsRefSaving(true);
    setRefSaveError('');
    try {
      // Paste mode sends the (possibly edited) dissected fields and no
      // category — resultSelectedCategory is derived from the selected
      // reference, and a pasted prompt has none. The handler stores null.
      const body = refMode === 'paste'
        ? {
            title:           refTitle.trim(),
            brand_name:      pasteBrand,
            prompt_category: null,
            ...Object.fromEntries(REF_FIELD_KEYS.map(k => [k, dissected![k] || ''])),
          }
        : {
            title:           refTitle.trim(),
            brand_name:      metadata!.brand,
            prompt_category: resultSelectedCategory,
            format_layout:   metadata!.format_layout   || '',
            primary_object:  metadata!.primary_object  || '',
            subject:         metadata!.subject         || '',
            lighting:        metadata!.lighting        || '',
            mood:            metadata!.mood            || '',
            background:      metadata!.background      || '',
            positive_prompt: metadata!.positive_prompt || '',
            negative_prompt: metadata!.negative_prompt || '',
          };

      const response = await fetch('/api/save-as-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to save reference');
      setSaveAsRefOpen(false);
      setRefTitle('');
      setPastedPrompt('');
      setDissected(null);
      setRefMode('generated');
      refetch();
    } catch (e) {
      setRefSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRefSaving(false);
    }
  };
```

- [ ] **Step 4: Add the UI**

In the Save-as-Reference dialog (around line 795), widen it to `sm:max-w-2xl` and add above the Title field a two-button mode switch (`From this prompt` / `Paste a finished prompt`) following the same active-button pattern used elsewhere in this file — `variant="default"` plus `gradient-primary` for the active one, `variant="outline"` otherwise.

When `refMode === 'paste'`, render below the switch:
- a `Textarea` bound to `pastedPrompt` (import from `@/components/ui/textarea`), placeholder "Paste the full prompt you want to save…", ~8 rows;
- a brand `Select`. **Reuse whatever brand list the main prompt form already uses** — read `src/components/PromptForm.tsx` and use the same source rather than hardcoding a new array. Bound to `pasteBrand`;
- a **Dissect** button calling `handleDissect`, disabled while `isDissecting` or when the textarea is empty, showing a spinner and "Dissecting…" while running;
- when `dissected` is non-null, the eight fields as labelled `Textarea`s (2 rows each, except `positive_prompt` at 4) bound to `dissected[key]`, each `onChange` doing `setDissected(d => ({ ...d!, [key]: e.target.value }))`. Label them in the order listed in `REF_FIELD_KEYS`, with human-readable labels (Format layout, Primary object, Subject, Lighting, Mood, Background, Positive prompt, Negative prompt).

Keep the Title field visible in both modes. Keep the existing Cancel/Save footer; disable Save in paste mode until `dissected` is non-null.

The generated-mode branch of the dialog must look and behave exactly as it does now.

- [ ] **Step 5: Typecheck, suite, build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
Expected: tsc clean; 231 passing (unchanged by this task — it adds no tests, since components cannot be rendered under `environment: 'node'`); build succeeds

- [ ] **Step 6: Screenshot the dialog**

Project convention requires a before/after screenshot for UI changes. Start `npm run dev` — it serves on **http://localhost:8080** (NOT 5173; the config sets 8080) — and capture the Save-as-Reference dialog in both modes.

Note the Dissect button will fail locally: `npm run dev` does not serve `/api` routes. Confirm the error surfaces cleanly in `refSaveError` and that the pasted text survives the failure, then say so. **If you cannot capture a screenshot, say so plainly and describe what you verified instead — do not describe a screenshot you did not take.**

- [ ] **Step 7: Commit (propose)**

```bash
git add src/components/ResultDisplay.tsx
git commit -m "feat: paste a finished prompt and save it as a reference"
```

---

## Task 4: Remove the save path that writes empty rows

**Files:**
- Modify: `src/hooks/usePromptGenerator.ts` (delete `savePrompt` ~line 74, `handleSave` ~line 206, the export ~line 382)
- Modify: `src/pages/Index.tsx` (the `onSave` wiring ~line 269)
- Modify: `src/components/ResultDisplay.tsx` (the `SavePromptModal` render and its `onSave` prop)

**Interfaces:**
- Consumes: the Save-as-Reference dialog (Task 3) as the replacement entry point.
- Produces: nothing.

**This is not dead-code cleanup.** `savePrompt` posts `{ brand, generated_prompt }` — the n8n body shape. `api/[action].ts`'s handler never destructures `generated_prompt`, so **every click of `SavePromptModal`'s "Save Prompt" writes a `web_image_analysis` row with an empty `prompt_name` and eight null columns, then reports success.** The reference table likely already holds junk rows from this.

- [ ] **Step 1: Trace what opens SavePromptModal**

Run: `grep -n "SavePromptModal\|onSave\|onDontSave\|setShowSaveModal\|saveModalOpen" src/components/ResultDisplay.tsx src/pages/Index.tsx`

Read the result before editing. You need to know which control opens it so the replacement points somewhere sensible. Report what you found.

- [ ] **Step 2: Point that control at the working dialog**

Whatever opens `SavePromptModal` should instead open the Save-as-Reference dialog (`setSaveAsRefOpen(true)`), which already collects a title and posts the correct body. Remove the `SavePromptModal` render and its `onSave` / `onDontSave` props from `ResultDisplay`.

If `SavePromptModal` ends up with no remaining usages, leave the component file itself in place — deleting it is a separate cleanup and not required here. Report whether it still has any usage.

- [ ] **Step 3: Delete the corrupting code**

In `src/hooks/usePromptGenerator.ts`: delete the `savePrompt` function, the `handleSave` callback, and `handleSave` from the returned object. In `src/pages/Index.tsx`: remove `handleSave` from the destructured hook result and the `onSave={handleSave}` prop.

Check whether `handleDontSave` and the `SAVING` / `SAVED` app states become unused. If a state value is now unreachable, leave the type alone but say so in your report — narrowing a shared state union is a wider change than this task should make.

- [ ] **Step 4: Verify nothing references the removed symbols**

Run: `grep -rn "savePrompt\|handleSave\b" src/ | grep -v "handleSaveAsRef" | grep -v CreateBlendedPromptDialog`
Expected: no output. (`CreateBlendedPromptDialog` has its own unrelated `handleSave` — leave it alone.)

- [ ] **Step 5: Typecheck, suite, build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
Expected: tsc clean; 231 passing; build succeeds

- [ ] **Step 6: Commit (propose)**

```bash
git add src/hooks/usePromptGenerator.ts src/pages/Index.tsx src/components/ResultDisplay.tsx
git commit -m "fix: remove save path that silently wrote empty reference rows"
```

---

## Post-implementation verification (Vercel preview)

`npm run dev` does not serve `/api`, so the real checks need a preview deploy.

- [ ] Paste a real ChatGPT-authored prompt, pick a brand, Dissect. Confirm the eight fields are plausible and that `positive_prompt` is the pasted text rather than a rewrite.
- [ ] **The check that matters most:** paste a prompt that says nothing about lighting. Confirm the `lighting` field reads "Not specified in the source prompt" rather than an invented value. This is the difference between a useful reference and a poisoned one, and no unit test can verify it — a mocked `chat()` proves nothing about real model behaviour.
- [ ] Edit a field, save, and confirm the edited value is what lands in Supabase.
- [ ] Confirm the saved reference appears in the reference dropdown and that selecting it populates the Reference Prompt Data panel.
- [ ] Confirm the generated-prompt mode of the dialog still works unchanged.
- [ ] Confirm the control that used to open `SavePromptModal` now opens the Save-as-Reference dialog.
- [ ] Check `web_image_analysis` for existing blank-titled rows with null fields — those are the junk this bug wrote. Remove them with the existing `remove-reference` action if any are found. Not automated here: auto-deleting blank-titled rows could take out a legitimate one.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Prompt and schema | Task 1 |
| §2 The endpoint | Task 2 |
| §3 The dialog | Task 3 |
| §4 Remove the dead path | Task 4 |
| Testing (unit) | Tasks 1, 2 |
| Testing (manual) | Preview checklist |
| Risk 1 (confabulation) | Task 1's prompt instruction; preview checklist names it as the key check |
| Risk 2 (spend not logged) | Accepted, not solved — stated in the spec |
| Risk 3 (ungated endpoint) | Accepted, matches every main-app endpoint |
| Risk 4 (user-visible change to a working-looking button) | Task 4 Step 2 |
| Risk 5 (existing junk rows) | Preview checklist's last item |

**Placeholder scan:** no TBD/TODO. Task 3 Step 4 describes markup rather than pasting a full JSX block, and deliberately tells the implementer to read `PromptForm.tsx` for the brand list rather than hardcoding one — that is a real instruction with a concrete source, not a placeholder. Task 3 adds no tests, and the reason (no jsdom) is stated.

**Type consistency:** `buildDissectSystemPrompt(brand)` and `DISSECT_JSON_SCHEMA` are defined in Task 1 and imported by name in Task 2. The eight field names are identical in Task 1's schema, Task 1's test, Task 2's test fixture, and Task 3's `REF_FIELD_KEYS`. `POST /api/dissect-prompt` returns `{ fields, usage }` in Task 2 and Task 3 reads `data.fields`. Task 3's `handleSaveAsRef` posts the same key names `api/[action].ts` already destructures.
