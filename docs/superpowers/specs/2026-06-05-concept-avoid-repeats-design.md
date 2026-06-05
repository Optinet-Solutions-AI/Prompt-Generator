# Assistant Concepts — Never Repeat (Avoid Past Ideas) — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)
**Author:** Claude (with john@optinetsolutions.com)

## Problem

The concept generator now produces 3 diverse, on-brand options and a rotating creative
lens spreads them across regenerations — but each `/api/assistant/concepts` call is
**stateless**, so the model can still re-derive an idea it already showed (e.g. "Zenith
Oasis" reappeared across runs). The user wants a genuine **"always a new idea"** guarantee:
when regenerating for the same brief, never repeat an idea already shown.

The rotating lens (commit `b8a89e8`) gives *reliable variety, not a guarantee*. This adds
the guarantee by telling the model exactly which ideas to avoid.

## Decision (confirmed with user — "Option B": remember + avoid)

The frontend remembers the concepts already shown for the current brief and sends them with
each request; the backend injects a "do NOT repeat these" block into the prompt. Layers on
top of the existing diversity prompt + rotating lens.

### Confirmed defaults
1. **Remembered as:** each concept's **title + a short gist** (title + the first part of its
   description) — catches "same idea, new title" re-skins, not just exact-title matches.
2. **Resets when:** the **brand or task changes** (a new brief starts fresh; different briefs
   may legitimately overlap). While regenerating the same brief, it accumulates.
3. **Cap:** keep the **last 15** remembered ideas (bounds prompt growth in long sessions).

## Components & changes

### Backend

**`api/_assistant-prompts.ts` — `buildAvoidClause(avoid: string[]): string` (new, exported)**
- Empty/whitespace-only list → returns `''` (no clause).
- Non-empty → returns a block like:
  ```
  ALREADY-SHOWN IDEAS — do NOT repeat or lightly re-skin any of these. Every concept must be a brand-new direction not in this list:
  - <gist 1>
  - <gist 2>
  ```
- Pure, testable, no imports.

**`api/assistant/concepts.ts`**
- Read `avoid?: string[]` from `req.body` (default `[]`).
- Append `buildAvoidClause(avoid)` to the `user` message (after the task/description/lens),
  only when it returns a non-empty string.
- No schema change; `avoid` is request-only input.

### Frontend

**`src/lib/concept-avoid.ts` (new) — pure helpers**
- `conceptGist(c: { title: string; description: string }): string` → `"<title> — <first ~12 words of description>"`.
- `mergeAvoid(prev: string[], concepts: AssistantConcept[], cap = 15): string[]` → append each
  concept's gist, de-duplicate (case-insensitive), keep the **last `cap`**.

**`src/lib/assistant-client.ts`**
- `requestConcepts` args gain `avoid?: string[]`, passed straight through in the POST body.

**`src/pages/AssistantPage.tsx`**
- New state `avoid: string[]` (the running list) and a remembered `avoidKey` (the
  `brand + '␟' + task` it belongs to).
- In `onSuggest()`:
  - Compute `key = brand + '␟' + task`. If `key !== avoidKey`, start fresh
    (`base = []`) and set `avoidKey = key`; else `base = avoid`.
  - Call `requestConcepts({ ..., avoid: base })`.
  - On success: `setAvoid(mergeAvoid(base, r.concepts))`.
- No UI change beyond behavior (the existing "Draft 3 concepts" button is the regenerate
  trigger). The picked-concept/generate flow is untouched.

## Data flow

```
Draft/regenerate (same brand+task)
  → send avoid = [gists shown so far this brief]
  → concepts.ts appends buildAvoidClause(avoid) to the prompt
  → model returns 3 NEW concepts (not in the avoid list)
  → frontend merges their gists into avoid (cap 15) for the next regenerate
Change brand or task → avoid resets to [] (fresh brief)
```

## Edge cases

- **First draft of a brief:** `avoid` is `[]` → `buildAvoidClause` returns `''` → prompt
  unchanged → behaves exactly as today.
- **Long session:** cap keeps only the last 15 gists, so the prompt stays bounded.
- **maxTokens:** the avoid block adds prompt *input* tokens (cheap); output budget is the
  concepts JSON, already raised to 1200 (commit `39c5f2d`) — unaffected.
- **Model still repeats despite the list:** the rotating lens + explicit avoid make this
  rare; not a hard cryptographic guarantee, but it removes the systematic re-derivation of
  the same anchor. (If a dup ever slips, the next regenerate's avoid list will include it.)

## Testing

- **Unit:**
  - `api/_assistant-prompts.test.ts` — `buildAvoidClause([])` → `''`; `buildAvoidClause(['A — x','B — y'])`
    contains "do NOT repeat", and both items as `- A — x` / `- B — y`.
  - `src/lib/concept-avoid.test.ts` — `conceptGist` truncates the description to a gist and
    joins with the title; `mergeAvoid` appends, de-dupes case-insensitively, and keeps only
    the last 15.
- **Live smoke test (per CLAUDE.md):** regenerate the SAME RocketSpin brief 4–5 times via
  `/api/assistant/concepts` (sending the accumulating `avoid`) → confirm **no repeated
  titles/ideas** across runs. Then change the task → confirm the list resets (fresh ideas,
  overlap allowed).

## Out of scope

- Persisting the avoid list across page reloads / devices (it's per in-memory session).
- Changing the concepts JSON schema, the generate/refine stages, or any UI layout.

## Golden-rule compliance

- No n8n, no Airtable. OpenAI/Gemini via the existing `_llm` wrapper; Supabase/Drive untouched.
