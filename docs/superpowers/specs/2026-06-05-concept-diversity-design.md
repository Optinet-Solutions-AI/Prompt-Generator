# Diverse Assistant Concepts — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)
**Author:** Claude (with john@optinetsolutions.com)

## Problem

The Assistant's concept generator (`api/assistant/concepts.ts`) returns 3 concept
"options" per task, but they come out as **near-duplicates** — slightly different
wordings of the same visual idea — so the final generations all look alike. Observed
strongly on **RocketSpin**: no matter the task, the three options are the same centered
armored hero with a different backdrop.

### Root cause (verified in code)

1. **Weak diversity instruction.** `buildConceptsSystemPrompt` (`api/_assistant-prompts.ts`)
   contains a single line: *"Each concept must be visually distinct (different setting,
   action, or framing)."* — easily overpowered.
2. **The brand block locks composition.** `brandBlock()` is injected into every concept
   and instructs *"Apply these rules to every concept."* For RocketSpin the brand mandate
   is a rigid, fully-specified character + composition (*"Hero centered, facing camera,
   symmetrical framing"*), so all three concepts collapse to the same centered hero. The
   same `brandBlock` is also used by `buildGenerateSystemPrompt`, so the final image prompt
   re-applies the lock too.
3. **No temperature.** `chat()` in `api/_llm.ts` never sets a temperature, so there is no
   extra sampling spread to push the three apart.

## Guiding intent

The assistant's job is to **expand the user's creative thinking — give them more and new
ideas — not narrow their mindset.** The three concepts should open *different doors*: fresh,
non-obvious directions the user might not have considered, not three safe takes on the same
obvious idea. Brand identity is the guardrail (palette, character, style stay intact), but
within it the assistant should think broadly and surprise the user with range. "Distinct"
is the floor; **mind-expanding** is the goal.

## Decision (confirmed with user — Approach A)

Strengthen the concepts prompt so it acts as a creative **expander** (fresh, non-obvious,
anti-cliché directions that broaden the user's thinking), decouple brand **identity** from
**composition** (so identity stays mandatory but composition/scene varies), and add a
temperature to the concepts LLM call. Backend-only; no schema or frontend change.

## Changes

### 1. `api/_assistant-prompts.ts` — `brandBlock()`: identity vs composition
Add a clause (used by BOTH the concepts and generate stages) that separates what is
mandatory (identity) from what should vary (composition):

- The brand rules define the brand's **IDENTITY** — colour palette, character look, and
  style — and MUST be applied to every concept/image (do not drop them).
- They are **NOT a fixed composition.** Vary the setting, shot scale (wide establishing vs
  tight hero vs product-forward), framing, camera angle, action/moment, and mood across
  concepts.
- Any specific composition the brand suggests (e.g. a centered hero, symmetrical framing)
  is **one option to draw from, not a requirement for every image.**

Rationale: identity stays strong (brand fidelity was an earlier problem and must not
regress); only the composition lock loosens, which is what was flattening the three.

### 2. `api/_assistant-prompts.ts` — `buildConceptsSystemPrompt()`: creative expansion
Replace the single distinctness line with instructions that make the model a creative
**expander**, not a safe-default generator:

- **Goal — open new doors.** Act as a creative partner whose job is to give the user *more
  and newer* ideas than they arrived with. Propose fresh, non-obvious directions they may
  not have considered; avoid the most predictable/clichéd take on the brief.
- The 3 concepts MUST each take a **genuinely different visual direction**, differing on
  **different axes** — e.g. a different environment/setting, a different shot scale (wide
  establishing vs tight hero), a different action/moment, a different mood / time-of-day,
  a different conceptual angle.
- **Span a range of boldness:** at least one concept should be a safe, on-brief direction
  and at least one should be a bolder, more unexpected stretch — so the set always widens
  the user's options rather than narrowing them.
- Explicit rule: **do NOT return the same scene or subject with only minor changes.** If
  two concepts could share one background, they are too similar — push them apart.
- Keep: exactly 3 concepts, the JSON shape, 2–3 sentence scannable descriptions, and the
  one-sentence `recommendation`.

### 3. `api/_llm.ts` — thread an optional `temperature`
- Add `temperature?: number` to `ChatOptions`.
- OpenAI path (`chatOpenAI`): include `temperature` in the request body when defined.
- Gemini path (`chatGemini`): include `temperature` under `generationConfig` when defined.
- When `temperature` is omitted, behavior is unchanged (provider default) — no other
  caller is affected.

### 4. `api/assistant/concepts.ts` — use the temperature
Pass `temperature: 0.9` to the `chat()` call (concepts only). 0.9 gives meaningful spread
while staying coherent; the picked-concept → final-prompt (`generate`) call is left at its
default.

## What is NOT changing

- No change to `CONCEPTS_JSON_SCHEMA` (still `{concepts:[{title,description}]×3, recommendation}`).
- No frontend change (the Assistant UI already renders whatever concepts come back).
- No change to the brand rules in `_brand-rules.ts` themselves — the identity/composition
  decoupling lives in `brandBlock` (the assistant prompt layer), so the brand's stated
  composition becomes a soft default there without editing each brand mandate.

## Testing

- **Unit:**
  - `api/_assistant-prompts.test.ts` — assert `buildConceptsSystemPrompt(brand)` contains
    the orthogonal-diversity rules (e.g. "different visual direction", "do NOT return the
    same scene") AND the identity-vs-composition clause (e.g. brand defines identity, not a
    fixed composition). Assert brand identity is still present (palette/mandate for a known
    brand like RocketSpin).
  - `api/_llm.test.ts` — assert that when `chat({ temperature })` is called, the value is
    threaded into the request body (OpenAI `temperature`, Gemini `generationConfig.temperature`),
    and that omitting it leaves the body without a temperature key.
- **Live (per CLAUDE.md):**
  - Call `/api/assistant/concepts` for RocketSpin 2–3 times with the same task →
    confirm the three concepts are genuinely different directions (different
    setting/shot/mood), not minor variants, and still read as RocketSpin (palette + hero
    identity intact). Repeat for one non-RocketSpin brand (e.g. Roosterbet) to confirm no
    regression.

## Risks / notes

- Loosening composition must not loosen **identity** — the wording keeps palette/character/
  style mandatory. Verify in the live check that brand fidelity holds.
- The `generate` stage (final prompt) inherits the same `brandBlock` change, so a diverse
  picked concept is honored in the final image rather than re-centered. This is intended.
- `temperature: 0.9` is a starting value; can be tuned if concepts get incoherent or still
  too samey.

## Golden-rule compliance

- No n8n, no Airtable. OpenAI/Gemini via the existing `_llm` wrapper; no stack changes.
