# Dissect a Pasted Prompt into a Reference

**Date:** 2026-08-25
**Status:** Awaiting review

## Goal

Let someone paste a finished prompt — one written elsewhere, e.g. in ChatGPT — and save it as a reference without hand-filling the eight dissected fields. An AI call extracts the fields; the user checks and corrects them; the existing save path writes the row.

## Why this is a gap, not a new idea

The capability used to exist. `src/hooks/usePromptGenerator.ts` still contains:

```ts
body: JSON.stringify({
  brand:            formData.brand,
  generated_prompt: generatedPrompt, // n8n sends this to GPT for dissection
})
```

n8n did the dissection. When n8n was removed from the stack the dissection was never reimplemented, but the caller still posts the n8n-shaped body. `api/[action].ts`'s `save-as-reference` handler does not destructure `generated_prompt` at all — it reads `title`, `brand_name`, `prompt_category` and the eight fields individually. So that call currently writes a row with an empty `prompt_name` and all eight columns `null`, and reports success.

Two things follow: the feature is a restoration, and there is a live silent-corruption path to remove as part of it.

## Verified facts

Read from the code on 2026-08-25:

- **The eight fields** are `format_layout`, `primary_object`, `subject`, `lighting`, `mood`, `background`, `positive_prompt`, `negative_prompt`. `api/[action].ts:819-851` writes them to the `web_image_analysis` table alongside `prompt_name`, `brand_name`, `prompt_category` and `image_name`.
- **Nothing in the codebase dissects a prompt into fields.** The only match for the concept is the stale n8n comment above.
- **Save-as-Reference already works** from a generated prompt: `src/components/ResultDisplay.tsx:219-245` posts all eight fields from `metadata`, which is populated because the tool generated that prompt and knows its parts. The dialog is at `ResultDisplay.tsx:795`.
- **The closest existing pattern is `api/assistant/generate.ts`** — 70 lines: build a system prompt, pass a JSON schema, call `chat()`, parse. That is the same shape as a dissection with the direction reversed.
- **Main-app AI endpoints are ungated.** `api/generate-prompt.ts` calls OpenAI directly with `OPENAI_API_KEY`, no token validation and no spend cap. Token gating and the spend cap exist only on `api/assistant/*`, which are keyed on a tester token this feature does not have.
- `api/generate-prompt.ts` is still pinned to `gpt-4o` while the Assistant runs `gpt-5.2`. Noted, out of scope.
- `chat()` in `api/_llm.ts` already provides retry-on-5xx, Gemini JSON-schema sanitisation, provider switching and usage reporting.
- `gemini-3.7-flash` is priced in `LLM_PRICING` ($0.75 in / $3.75 out per 1M), measured at 7s for a comparable call, and is the cheapest model verified working with the `thinkingBudget: 0` that `_llm.ts` injects for flash-named models.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Review before save | **Yes — show the 8 fields editable, save on confirm** | A wrong `subject` or `lighting` saved into a reference silently poisons every prompt later generated from it, and the reference dropdown is the tool's core reusable asset. One extra click is cheap insurance. |
| Brand | **User picks from the dropdown** | Brand drives the mandatory colour and style rules. A wrong guess there is worse than a wrong guess on any other field, and LuckyVibe vs FortunePlay both key on warm gold tones — exactly the confusion an inference would make. |
| Placement | **Extend the existing Save-as-Reference dialog** | Smallest new surface; reuses the flow and the endpoint that already writes to Supabase. |
| Endpoint style | **New `api/dissect-prompt.ts` using `chat()`** | `chat()` already solved retries, schema sanitisation and usage. The alternative — an action inside `api/[action].ts` — would mean inlining an AI call in a 900+ line file whose own comment says cross-file imports are deliberately avoided there. |

## Design

### 1. Prompt and schema

New in `api/_assistant-prompts.ts`, beside the existing generate prompt:

```ts
export function buildDissectSystemPrompt(brand: string): string
export const DISSECT_JSON_SCHEMA
```

`DISSECT_JSON_SCHEMA` requires all eight fields as strings, `additionalProperties: false`, matching the shape of the existing `GENERATE_JSON_SCHEMA`.

The system prompt's defining instruction is **extract, do not invent**. Where the pasted prompt genuinely does not state something — many prompts say nothing about `format_layout` — the field must say so plainly (e.g. "Not specified in the source prompt") rather than confabulate a plausible value. A confabulated field is worse than an empty one here, because it looks authoritative in the reference panel and silently steers later generations.

`positive_prompt` is the pasted text itself, lightly normalised (trimmed) rather than rewritten — the user pasted a prompt they already like, and rewriting it would defeat the purpose.

`negative_prompt` is extracted only if the source contains explicit exclusions; otherwise it states none were specified.

The brand is passed so the dissection can note where the prompt already aligns with brand rules, but it must NOT rewrite fields to fit the brand — this is a description of what was pasted, not a brand-conformed version of it.

### 2. The endpoint

New `api/dissect-prompt.ts`:

- `POST { prompt: string, brand: string }` → `200 { fields: DissectedFields, usage }`
- `400` when `prompt` is missing or blank; `500` with the underlying detail on model or parse failure.
- Ungated — no token validation, no spend cap — matching `api/generate-prompt.ts` and the rest of the main app.
- Model: `gemini-3.7-flash` via `chat()`, `json: true`, `jsonSchema: DISSECT_JSON_SCHEMA`, `maxTokens: 4000`.
- `export const config = { maxDuration: 60 };` — every other slow route in this repo declares one, and the one that did not (`api/generate-image.ts`) was killed at the 60s default until it was fixed.

Why `gemini-3.7-flash`: already priced, cheapest of the verified-working options at roughly $0.005 per dissection, fastest measured, and compatible with the `thinkingBudget: 0` that `_llm.ts` injects for flash-named models — unlike `gemini-3.5-flash-lite`, which returns 400 for exactly that config.

**4000 tokens, not less.** Gemini's output budget includes thinking tokens, and the concepts stage was truncating mid-JSON at 1200 for precisely this reason. A dissection returns eight prose fields, one of which is the whole source prompt.

### 3. The dialog

`src/components/ResultDisplay.tsx`'s Save-as-Reference dialog gains two modes:

- **From this prompt** — today's behaviour, unchanged. Title in, eight fields taken from `metadata`, save.
- **Paste a finished prompt** — a textarea, a brand picker, and a **Dissect** button. On success the eight fields render as editable inputs, pre-filled, alongside the title field. **Save** posts to the existing `/api/save-as-reference` with the edited values.

No new save endpoint. The dissection only produces the values the existing POST already accepts.

`prompt_category` is sent as null in paste mode. There is no category control to reuse: `ResultDisplay.tsx:104` derives `resultSelectedCategory` from the *selected reference's* category (`resultAvailableReferences.find(r => r.id === metadata?.reference)?.category`), and a pasted prompt has no selected reference, so that derivation yields `''`. The handler already stores `prompt_category || null`, so null is a supported value. Adding a category picker is deliberately out of scope — it is a separate question about how references are organised.

While dissecting, the button shows progress and is disabled. A failed dissection shows the error and leaves the pasted text intact so it can be retried without re-pasting.

### 4. Remove the dead path

**This is not dead code — it is a live button that corrupts data on every click.**

`src/pages/Index.tsx:269` wires `onSave={handleSave}` to `SavePromptModal`'s "Save Prompt" button — the modal that asks "Save this prompt?" after a generation. That calls `handleSave` → `savePrompt` → posts `{ brand, generated_prompt }`. The `save-as-reference` handler does not destructure `generated_prompt`, so **every click writes a `web_image_analysis` row with an empty `prompt_name` and eight null columns**, then reports success and sets the UI to `SAVED`.

So the reference table likely already contains junk rows from this, and the user has been told each one saved.

The fix has two parts:

1. **Point that button at a save that works.** `SavePromptModal`'s save must post the real body shape — the same eight fields from `metadata` that `handleSaveAsRef` already sends — rather than the n8n shape. It needs a `prompt_name`; the modal currently collects nothing, so it must either prompt for a title or be replaced by the Save-as-Reference dialog, which already collects one. **Replacing it with the existing dialog is the smaller, safer change** and removes a second half-working save path rather than repairing it.
2. **Delete `savePrompt` and its `handleSave` caller** from `usePromptGenerator.ts`, along with the now-unused export at line 382 and the `Index.tsx` wiring.

Existing junk rows are not cleaned up by this change. They are visible in the reference dropdown as blank-titled entries and can be removed with the existing `remove-reference` action; automating that is out of scope and would risk deleting a legitimately blank-titled row.

## Testing

Unit (`vitest`, `environment: 'node'`, `globals: false` — no jsdom, so no component rendering):

- `DISSECT_JSON_SCHEMA` requires exactly the eight fields, all strings, `additionalProperties: false`.
- `buildDissectSystemPrompt` includes the brand, and contains the extract-don't-invent instruction.
- `api/dissect-prompt.ts` with `chat()` mocked: returns parsed fields on success; 400 on a missing or blank prompt; 400 on a missing brand; 500 with detail when `chat()` rejects; 500 when the model returns unparseable JSON.

Manual (needs a Vercel preview — `npm run dev` does not serve `/api`):

- Paste a real ChatGPT-authored prompt, dissect, confirm the eight fields are plausible and that `positive_prompt` is the pasted text rather than a rewrite.
- Paste a prompt that says nothing about lighting; confirm the `lighting` field says so rather than inventing one. **This is the check that matters most** — it is the difference between a useful reference and a poisoned one.
- Edit a field, save, and confirm the edited value is what lands in Supabase.
- Confirm the saved reference appears in the reference dropdown and that selecting it populates the Reference Prompt Data panel.
- Confirm the generated-prompt mode of the dialog still works unchanged.

## Risks

1. **Confabulation is the core risk.** The model will be tempted to fill every field with something plausible. The prompt instruction is the only defence, and it is verified by the manual check above, not by a unit test — a mocked `chat()` proves nothing about what a real model does with a real prompt.
2. **Dissect spend is not logged.** The Cost Tracker reads only the assistant tables, and this endpoint is ungated with no tester token, so its cost is invisible — the same gap `api/generate-prompt.ts` already has. At roughly $0.005 per call this is accepted, not solved.
3. **Ungated endpoint.** Anyone who can reach the deployed app can call it. That matches every other main-app endpoint, and the app is an internal team tool, but it is a real property worth stating.
4. **The `savePrompt` fix is a user-visible change to a working-looking button.** `SavePromptModal`'s "Save Prompt" is reachable today and reports success. Replacing it with the Save-as-Reference dialog means the post-generation save now asks for a title where it previously asked for nothing — a small extra step in exchange for a save that actually stores the prompt. Worth stating because it will look like a regression to anyone who does not know the old one was writing empty rows.

5. **Existing junk rows are not cleaned up.** However many times that button has been clicked, `web_image_analysis` holds that many blank-titled, all-null rows. They will appear in the reference dropdown. Removing them is a manual step via the existing `remove-reference` action, deliberately not automated here.

## Out of scope

- Dissecting an image into fields (the table is named `web_image_analysis`, which suggests that history; this spec handles text only).
- Guessing the brand.
- Logging dissect cost, or gating the endpoint.
- Updating `api/generate-prompt.ts`'s stale `gpt-4o` pin.
- Bulk import of several prompts at once.
