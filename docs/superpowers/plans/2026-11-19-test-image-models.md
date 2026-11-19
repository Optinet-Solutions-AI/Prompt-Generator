# Test Image Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user can choose GPT Image 2.6 (test) for ChatGPT images and Nano Banana 2.1 (test)
for Gemini images, with prices shown and costs recorded correctly. Defaults stay unchanged.

**Architecture:**
- Both models become entries in the existing image-model registry (`api/_image-models.ts`, mirrored
  in `src/lib/image-models.ts`).
- A new `resolveOpenAiModel` lets the three OpenAI routes accept a client-chosen model safely, the
  same way `resolveGeminiModel` already does for Gemini.
- `ImageModelSelect` gains a ChatGPT variant shown next to the Gemini one in `ResultDisplay`.
- The saved choice is sent with generate, edit and variation requests, exactly as `geminiModel`
  already is.

**Tech Stack:** Vite + React + TS, Vercel serverless routes, Vitest (node env, no DOM), Playwright for UI QA.

**Spec:** `docs/superpowers/specs/2026-11-19-test-image-models-design.md`

## Global Constraints

- Worktree `C:\Users\User\pg-test-models`, branch `feat/test-image-models`. Never edit
  `C:\Users\User\Prompt-Generator`, which auto-commits and is shared with another session.
- Run Vitest from the worktree with an uppercase drive letter:
  `Set-Location 'C:\Users\User\pg-test-models'; npx.cmd vitest run <files>`
- Model ids, verbatim: `gpt-image-2.6-flare` and `gemini-nano-banana-2.1`. The default ids stay
  `gpt-image-2` (`OPENAI_IMAGE_MODEL`) and `gemini-2.5-flash-image` (`DEFAULT_GEMINI_IMAGE_MODEL`).
- Labels, verbatim: `GPT Image 2.6 (test)` and `Nano Banana 2.1 (test)`.
  - Dropdown text: `GPT Image 2 (current)`, `GPT Image 2.6 (test) — $0.042 / image`,
    `Nano Banana 2.1 (test) — $0.050 / image`.
- Rates, verbatim from the official pages checked on 2026-11-19:
  - `gpt-image-2.6-flare`: text input 5.00, image output 30.00, `displayPricePerImage` 0.042
    (measured), `outputMime` `image/png`.
  - `gemini-nano-banana-2.1`: text input 1.50, image output 30.00, `displayPricePerImage` 0.050,
    `outputMime` `image/jpeg`, ratios `GEMINI_RATIOS`.
- localStorage key for the ChatGPT choice: `promptgen.openaiImageModel`. The Gemini key
  `promptgen.geminiImageModel` is unchanged.
- An unknown, missing, retired (`gpt-image-1`) or wrong-provider model id always resolves to the
  current default, on the server and in the browser.
- The AI Assistant tester page (`AssistantPage`, `GeneratedPromptPanel`, `useAssistantImageGen`)
  is not modified.
- No `any`, `@ts-ignore` or `eslint-disable`. Lint is compared per changed file against `origin/main`.
- Commits go on the local feature branch only. Never push or deploy without John's go-ahead.
  Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A stale or tampered saved choice** (e.g. `gpt-image-1`, a Gemini id in the ChatGPT key, or
   localStorage throwing) silently becomes the default. Tests in Task 2.
2. **Editing an image from the other provider:** a Gemini image is edited with Gemini even when a
   ChatGPT test model is chosen, and the other way round. Test in Task 3.
3. **Nano Banana 2.1 with a portrait ratio** (9:16): the shared ratio list must be accepted by this
   model. Real call in Task 5.
4. **"Generate Both" with mixed choices:** each request carries its own provider's model.
   Asserted by the QA script in Task 4.
5. **Two dropdowns at phone width** wrap without horizontal scroll. Screenshot at 390px in Task 4.

---

### Task 1: Registry entries and the OpenAI resolver

**Files:**
- Modify: `api/_image-models.ts`
- Modify: `src/lib/image-models.ts` (identical from `export const IMAGE_MODELS` to the end of the
  file)
- Test: `api/_image-models.test.ts`

**Interfaces:**
- Produces:
  - `openaiDropdownModels(): ImageModelSpec[]` returns the OpenAI models with `inDropdown`,
    current first.
  - `resolveOpenAiModel(requested: string | undefined): ImageModelSpec` accepts only an OpenAI
    entry with `inDropdown: true`. Anything else returns `IMAGE_MODELS[OPENAI_IMAGE_MODEL]`.
  - Both functions are exported from both registry files.
- Registry changes:
  - `gpt-image-2` becomes `isCurrent: true, inDropdown: true`.
  - New entries `gpt-image-2.6-flare` and `gemini-nano-banana-2.1` take the Global Constraints
    values, with `lastVerified: '2026-11-19'` and a `rateSource` naming the pricing page.

- [ ] **Step 1: Update and add the failing tests in `api/_image-models.test.ts`**
  - Replace `has exactly one model flagged isCurrent` with
    `has exactly one current model per provider`:

    ```ts
    const cur = Object.values(IMAGE_MODELS).filter(m => m.isCurrent);
    expect(cur.filter(m => m.transport === 'openai').map(m => m.id)).toEqual(['gpt-image-2']);
    expect(cur.filter(m => m.transport !== 'openai').map(m => m.id)).toEqual(['gemini-2.5-flash-image']);
    ```

    This is a spec change, not a weakened test: there are now two dropdowns, so each has one
    "current" model.
  - Replace `exposes exactly two Gemini models…` with
    `exposes three Gemini models in the dropdown, current first`. It expects
    `['gemini-2.5-flash-image', 'gemini-3-pro-image', 'gemini-nano-banana-2.1']`.
  - Add `carries the official rates for the two test models`:
    - 2.6 Flare: 5.00 / 30.00 / 0.042, label `GPT Image 2.6 (test)`.
    - Nano Banana 2.1: 1.50 / 30.00 / 0.050, label `Nano Banana 2.1 (test)`.
  - Add `describe('openaiDropdownModels')`: ids are `['gpt-image-2', 'gpt-image-2.6-flare']`.
  - Add `describe('resolveOpenAiModel')`:
    - `'gpt-image-2.6-flare'` → itself.
    - `undefined` → `gpt-image-2`.
    - `'gpt-image-99'` → `gpt-image-2`.
    - `'gemini-nano-banana-2.1'` → `gpt-image-2`.
    - `'gpt-image-1'` → `gpt-image-2`, because retired models are not selectable.
  - Add `resolveGeminiModel('gpt-image-2.6-flare')` → `gemini-2.5-flash-image`.
  - Add `the browser registry mirrors the server registry`: read both files with `fs`, slice each
    from `export const IMAGE_MODELS` to the end, and expect them to be equal.

- [ ] **Step 2: Run the file and confirm the new or changed tests fail**
  - Run: `npx.cmd vitest run api/_image-models.test.ts`
  - Expected: FAIL on the new resolver/dropdown/rate tests (functions missing, entries missing).

- [ ] **Step 3: Make the registry changes and add the two functions in `api/_image-models.ts`**
  - Copy the same text into `src/lib/image-models.ts` from `export const IMAGE_MODELS` down.
  - Update the `gpt-image-2` comment "OpenAI is pinned, not user-selectable" to reflect the new
    dropdown.

- [ ] **Step 4: Run the file and the two consumers' tests**
  - Run: `npx.cmd vitest run api/_image-models.test.ts api/_pricing.test.ts api/_image-usage.test.ts`
  - Expected: all PASS.

- [ ] **Step 5: Commit** — `Image models: add GPT Image 2.6 and Nano Banana 2.1 as test options in the registry`

### Task 2: ChatGPT model dropdown and saved choice

**Files:**
- Modify: `src/components/ImageModelSelect.tsx`
- Test: `src/components/ImageModelSelect.test.tsx`

**Interfaces:**
- Consumes: `openaiDropdownModels`, `geminiDropdownModels`, `getImageModel` and
  `OPENAI_IMAGE_MODEL` from `@/lib/image-models` (Task 1).
- Produces:
  - `OPENAI_MODEL_STORAGE_KEY = 'promptgen.openaiImageModel'`.
  - `loadSavedOpenAiModel(): string` accepts a saved id only if it is an OpenAI model with
    `inDropdown`; otherwise it returns `OPENAI_IMAGE_MODEL`.
  - `ImageModelSelect` gains a prop `provider?: 'gemini' | 'chatgpt'`, defaulting to `'gemini'`.
    It picks the list, the visible label and the `aria-label`: "Gemini model" or "ChatGPT model".
  - `loadSavedGeminiModel()` now also rejects OpenAI ids.

- [ ] **Step 1: Failing tests in `ImageModelSelect.test.tsx`**
  - Labels:
    - `optionLabelFor('gpt-image-2')` → `'GPT Image 2 (current)'`.
    - `optionLabelFor('gpt-image-2.6-flare')` → `'GPT Image 2.6 (test) — $0.042 / image'`.
    - `optionLabelFor('gemini-nano-banana-2.1')` → `'Nano Banana 2.1 (test) — $0.050 / image'`.
  - Change `offers exactly the two dropdown models` to expect 3. This is a spec change.
  - `OPENAI_MODEL_STORAGE_KEY` is `'promptgen.openaiImageModel'`.
  - With `vi.stubGlobal('localStorage', { getItem: (k) => store[k] ?? null })`:
    - ChatGPT key `'gpt-image-2.6-flare'` → returned.
    - ChatGPT key `'gemini-3-pro-image'` → `'gpt-image-2'`.
    - ChatGPT key `'gpt-image-1'` → `'gpt-image-2'`.
    - A `getItem` that throws → `'gpt-image-2'`.
    - Gemini key `'gpt-image-2.6-flare'` → `'gemini-2.5-flash-image'`.

- [ ] **Step 2: Run and confirm the failures**
  - Run: `npx.cmd vitest run src/components/ImageModelSelect.test.tsx`
  - Expected: FAIL (missing exports and the new labels).

- [ ] **Step 3: Implement the exports and the `provider` prop in `ImageModelSelect.tsx`**

- [ ] **Step 4: Run again**
  - Run: `npx.cmd vitest run src/components/ImageModelSelect.test.tsx`
  - Expected: PASS.

- [ ] **Step 5: Commit** — `Image model picker: a ChatGPT variant and a remembered ChatGPT choice`

### Task 3: The three OpenAI routes use the chosen model

**Files:**
- Modify: `api/generate-image.ts`, `api/edit-image.ts`, `api/generate-variations.ts`
- Test (create): `api/openai-model-choice.test.ts`

**Interfaces:**
- Consumes: `resolveOpenAiModel` from `./_image-models.js` (Task 1).
- Produces:
  - Each route reads `openaiModel` from `req.body` and resolves it once with
    `resolveOpenAiModel`.
  - The resolved `.id` replaces `OPENAI_IMAGE_MODEL` everywhere in that request:
    - the OpenAI request's `model` field (JSON body in `generate-image`, multipart `model` in the
      other two),
    - `recordImageUsage({ model })`,
    - and `logAssistantImageGen` in `generate-image`.
  - `editViaOpenAI` gains a final parameter `modelId: string`.
  - The Gemini and Cloud Run paths are untouched.

- [ ] **Step 1: Write `api/openai-model-choice.test.ts`**
  - Mock what the handlers touch:
    - `./_session.js`: `guard` resolves true, `requireUser` resolves a profile; keep `AuthError`
      real via `importActual`.
    - `./_user-drive.js` and `./_image-usage.js`: `recordImageUsage` is a spy; keep the token
      helpers real.
    - Anything else the generate path needs to finish after the OpenAI call.
  - Stub `fetch`:
    - Capture the `api.openai.com` request.
    - Reply `{ data: [{ b64_json: <1×1 PNG base64> }], usage: { input_tokens: 10, output_tokens: 100 } }`.
  - Send source images as `data:` URLs so no download happens.
  - Tests:
    - `generate-image sends and records the chosen ChatGPT test model`:
      `openaiModel: 'gpt-image-2.6-flare'` → the captured JSON body `model` and
      `recordImageUsage`'s `model` are both `gpt-image-2.6-flare`.
    - `generate-image uses gpt-image-2 when no ChatGPT model is sent`.
    - `generate-image ignores a Gemini id sent as the ChatGPT model`:
      `openaiModel: 'gemini-nano-banana-2.1'` → `gpt-image-2`.
    - `edit-image sends and records the chosen ChatGPT test model`: the multipart
      `(init.body as FormData).get('model')` is the chosen model.
    - `edit-image uses gpt-image-2 when no ChatGPT model is sent`.
    - `edit-image keeps a Gemini image on Gemini even when a ChatGPT test model is chosen`:
      `provider: 'gemini'` plus `openaiModel` set → no request to `api.openai.com`.
    - `generate-variations sends the chosen model on every variation and records it once`, with
      `count: 2`.
    - `generate-variations uses gpt-image-2 when no ChatGPT model is sent`.

- [ ] **Step 2: Run and confirm the failures**
  - Run: `npx.cmd vitest run api/openai-model-choice.test.ts`
  - Expected: the "chosen model" tests FAIL (the routes still send `gpt-image-2`). The default and
    Gemini tests may already pass.

- [ ] **Step 3: Wire `resolveOpenAiModel` into the three routes**
  - Update comments that say the OpenAI path ignores the model choice.

- [ ] **Step 4: Run the new file plus the existing route tests**
  - Run: `npx.cmd vitest run api/openai-model-choice.test.ts api/generate-image.test.ts`
  - Expected: all PASS.

- [ ] **Step 5: Commit** — `Image routes: ChatGPT images, edits and variations use the picked model`

### Task 4: Show the ChatGPT dropdown and send the choice from the app

**Files:**
- Modify: `src/components/ResultDisplay.tsx`.
  - Add state and handler that mirror `geminiModel` and `handleGeminiModelChange`.
  - Add `<ImageModelSelect provider="chatgpt" …>` in the same row as the Gemini one, with
    `flex flex-wrap justify-center gap-3`.
  - Add `openaiModel` to the `/api/generate-image` body.
- Modify: `src/components/ImageModal.tsx`, `src/components/LikedImagesPanel.tsx` and
  `src/pages/ImageLibrary.tsx`.
  - Add `openaiModel: loadSavedOpenAiModel()` next to every `geminiModel: loadSavedGeminiModel()`
    (ImageModal: edit and variations; LikedImagesPanel: edit; ImageLibrary: edit and variations).
  - Fix the comments that say OpenAI ignores the field.
- Test (scratchpad, not committed): `scratchpad\tools\test_models_qa.mjs`. It is a Playwright
  script against `npm run dev` on `http://localhost:8080`.
  - It fakes `/api/*` and the login using the fakes in memory `reference_qa_live_without_login`.

**Interfaces:**
- Consumes:
  - From Task 2: `ImageModelSelect` with `provider`, `loadSavedOpenAiModel` and
    `OPENAI_MODEL_STORAGE_KEY`.
  - From Task 3: the routes read `openaiModel`.

- [ ] **Step 1: Before screenshots**
  - Capture the generated-prompt panel's image section on the unchanged branch at 1280px and
    390px.
  - Save them to `scratchpad\models\ui\before-*.png`.

- [ ] **Step 2: Write the QA script.** It asserts:
  - A "ChatGPT model" dropdown exists, showing `GPT Image 2 (current)`.
  - Pick `GPT Image 2.6 (test) — $0.042 / image`, then click ChatGPT. The intercepted
    `/api/generate-image` body has `openaiModel: 'gpt-image-2.6-flare'`.
  - Pick `Nano Banana 2.1 (test) — $0.050 / image` in the Gemini dropdown, then click
    Generate Both. One body is `{provider:'chatgpt', openaiModel:'gpt-image-2.6-flare'}` and the
    other is `{provider:'gemini', geminiModel:'gemini-nano-banana-2.1'}`.
  - After a reload, both dropdowns still show the test models.
  - In the Library:
    - Edit on a ChatGPT image sends `openaiModel: 'gpt-image-2.6-flare'` to `/api/edit-image`.
    - Variations send it to `/api/generate-variations`.
  - At 390px the page has no horizontal scroll: `scrollWidth <= clientWidth`.

- [ ] **Step 3: Run it and confirm it fails**
  - Expected: FAIL at "ChatGPT model dropdown exists".

- [ ] **Step 4: Make the `ResultDisplay` and call-site changes**

- [ ] **Step 5: Run the QA script and take after screenshots**
  - Expected: every assertion PASSES.
  - Save `after-*.png` at 1280px and 390px, with the dropdown open on each, and look at them.

- [ ] **Step 6: Commit** — `Generate panel: pick the ChatGPT model, and edits/variations follow the choice`

### Task 5: Full checks and real calls

- [ ] **Step 1: Full suite**
  - Run: `npx.cmd vitest run > scratchpad\models\suite.txt` and read the tail.
  - Expected: all pass. Report the count.

- [ ] **Step 2: Types**
  - Run: `npx.cmd tsc --noEmit -p tsconfig.app.json`
  - Expected: only the 2 errors that exist before this change:
    - `ResultDisplay.tsx(405,…)` TS2353 `resolution`. The line number may shift.
    - `ImageLibrary.tsx(502,…)` TS2339 `then`.

- [ ] **Step 3: Lint per file**
  - Run `npx.cmd eslint <each changed file>` on this branch and on `origin/main` (via a
    `git show` copy) and compare.
  - Expected: no new problems in any file.

- [ ] **Step 4: Build**
  - Run: `npx.cmd vite build`
  - Expected: success.

- [ ] **Step 5: Real calls through the real handlers**
  - Use a temporary `api/zz-real-models.test.ts`. Delete it afterwards; never commit it.
  - It mocks `guard`/`requireUser`/Drive like earlier sessions, loads `.env.local`, and spies on
    `recordImageUsage`. About $0.30 in total.
  - Calls:
    - generate, `gpt-image-2.6-flare`, 2:1 banner, 2K.
    - generate, `gemini-nano-banana-2.1`, 9:16, 2K.
    - edit, `gpt-image-2.6-flare`.
    - edit, `gemini-nano-banana-2.1`.
    - variations, `gpt-image-2.6-flare`, `count: 1`.
  - Save each image to `scratchpad\models\real\` and look at every one.
  - Cost check: each recorded usage priced by the registry is $0.03–$0.08.

- [ ] **Step 6: Ledger the results.** Push and deploy wait for John's go-ahead.
