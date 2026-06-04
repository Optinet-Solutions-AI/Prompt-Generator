# Banner Outpaint/Extend Pipeline — Design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)
**Author:** Claude (with john@optinetsolutions.com)

## Problem

Wide email banners (especially **1200×600 / 2:1**) keep coming out with the subject **cut**:

- **ChatGPT (gpt-image-1)** ignores composition instructions ("keep the subject small with margin"). It composes the subject edge-to-edge, so a diving goalkeeper's leg is sliced off at the frame edge. No prompt wording fixes this — the model structurally will not leave horizontal margin.
- **Gemini (Imagen)** composes well and stays uncut, but in a forced wide strip it sometimes places objects incoherently (e.g. a soccer ball floating away from the player's hands).

The root cause is shared: **we force the model to compose a subject directly into a wide strip — the shape both engines are worst at — then crop to exact size, and the crop (or the bad composition) cuts the subject.**

Prompt tuning has been tried repeatedly and does not solve it. This design changes the *pipeline*, not the prompt.

## Decisions (confirmed with user)

1. **Approach = outpaint/extend** (not crop-only, not just engine-routing). Generate the subject where it fits whole, then AI-extend the sides to reach the wide target. Structurally cannot cut the subject.
2. **Extended side space = background / atmosphere only** — crowd blur, lights, sky, brand-colour glow. No additional people, no objects, no text. Keeps it clean and leaves natural space for text/logos.
3. **Subject may be smaller** in the final banner — acceptable trade-off for "never cut."
4. **De-risk before refactor** — prove the extend step on real images before changing the main pipeline.

## Core idea: "square → extend → exact"

```
STEP 1  generate SUBJECT as a SQUARE (engine's best shape)
        ┌───────────┐
        │  margin   │
        │  ( o o )  │   full subject, centered,
        │  /|||\    │   ~15–20% margin all around
        │  margin   │
        └───────────┘

STEP 2  place square centered on a WIDER canvas; AI paints
        BACKGROUND ONLY into the new side strips (mask = sides)
        ┌───────────────────────────┐
        │ lights ( o o )  crowd      │
        │ blur   /|||\    blur       │   1536×1024 (gpt edit max)
        │ ~glow~ margin   ~glow~     │
        └───────────────────────────┘

STEP 3  cover-crop to the EXACT target (1200×600 / 2:1)
        subject sat in the middle with margin, sides are pure
        background → the crop trims ONLY background, never the subject
```

The subject is never asked to fit a wide frame and is never cropped through. That is what removes the cutting.

## Components

Each is small, single-purpose, independently testable.

| Component | Responsibility | Location | Depends on |
|---|---|---|---|
| `generateSquareBase()` | Call the chosen engine (gpt-image-1 or Imagen/Cloud Run) for a **1:1** image, subject centered with ~15–20% margin all around. | `api/generate-image.ts` | existing OpenAI / Cloud Run paths |
| `extendToWide()` | Place the square centered on a wider transparent canvas, build a mask of the side strips, call gpt-image-1 **`/v1/images/edits`** with a "background/atmosphere only" prompt. Returns the extended image buffer. | new `api/_outpaint.ts` | `OPENAI_API_KEY`, `sharp` |
| `resizeToExact()` | **Exists.** Cover-crop the extended image to the exact target pixels (e.g. 1200×600). Keeps current north-gravity safety. | `api/generate-image.ts` | `sharp` |
| Drive save + return | **Exists, unchanged.** Upload to Google Drive, make public, return Drive URL. | `api/generate-image.ts` | GCP |
| Square-composition cue | **Small addition.** When the base step runs, prompt builder adds "square composition, subject fully contained with margin." | `api/generate-prompt.ts` | — |

### `extendToWide()` interface (new module `api/_outpaint.ts`)

```ts
// Extends a square subject image horizontally into a wider image by
// outpainting BACKGROUND ONLY into the left/right strips via gpt-image-1 edits.
export async function extendToWide(params: {
  squareBuffer: Buffer;      // the 1:1 base subject (e.g. 1024×1024)
  brand: string;             // for brand-colour glow in the extended area
  openaiKey: string;
}): Promise<{ buffer: Buffer; width: number; height: number }>;
// Returns 1536×1024 (gpt-image-1 edit max wide size). Throws on API failure
// so the caller can fall back to the single-shot path.
```

## Data flow

```
POST /api/generate-image  (wide target, ratio ≥ ~1.7)
  → generateSquareBase()       // engine makes 1:1 subject
  → extendToWide()             // gpt-image-1 edits → 1536×1024, bg-only sides
  → resizeToExact()            // cover-crop → exact 1200×600
  → upload to Drive + return   // unchanged
```

One HTTP request, two sequential AI calls.

## Trigger rules

- **Outpaint path runs only when the target is wide:** requested ratio ≥ ~1.7 (2:1 email banners, leaderboards). Derived from `bannerDimensions` first, then `aspectRatio` (dimensions are the reliable source — preset ratio strings are sometimes wrong).
- **Square / portrait / near-target sizes** keep today's single-shot generate+crop path — no second AI call, no added latency where it isn't needed.
- Applies to **both** the Custom Prompt flow and the Sports wizard, and to **both** engines (the user picks the engine; the extend step always uses gpt-image-1 edits as the reliable default).

## Honest constraint: engine output sizes

gpt-image-1 (generate *and* edit) only emits 3 fixed sizes — `1024×1024`, `1536×1024` (1.5:1, the widest), `1024×1536`. So:

- The extend step lands at **1536×1024 (1.5:1)**, not a native 2:1.
- The final `resizeToExact` cover-crop from 1.5:1 → 2:1 trims **height** (top/bottom). Because the square base keeps ~15–20% top/bottom margin and the extended sides are pure background, this trims only background — the subject stays intact.
- **Imagen/Cloud Run may support native outpainting to wider ratios.** If the Cloud Run service exposes an outpaint/edit mask mode, we prefer it for the Gemini engine (fewer crops). If it does not, the gpt-image-1 edit path is the reliable default for both engines. *This is verified during the spike, not assumed.*

## Coherence fix (the floating ball)

The square base also addresses incoherent object placement: composing the action in a normal square is far more reliable than in a forced wide strip. Plus a small base-prompt nudge — e.g. "the ball is in contact with / held by the player's hands" — to bind the object to the subject.

## Error handling

- **`extendToWide` fails or times out → fall back to today's single-shot generate+crop path.** Worst case equals current behaviour; never a hard failure. The fallback path is logged.
- **Square base generation fails →** return the existing error response (unchanged behaviour).
- Every branch logs which path ran (`outpaint` vs `fallback`) and the chosen sizes, for debugging.

## Performance / timeout

- Wide banners now cost **~2× generation time** (two AI calls). Square/portrait unchanged.
- Vercel function duration must accommodate two gpt-image-1 calls. The spike measures real wall-clock time. If a single request exceeds the limit, the fallback is split into two requests (base, then extend) in a later iteration — out of scope for v1 unless the spike shows it's necessary.

## De-risk spike (FIRST implementation step)

Before touching the main pipeline:

1. Build **only `extendToWide()`** as a standalone, runnable test (a small script, not wired into the app).
2. Run it on **4–5 real generated square images** across brands (Roosterbet sports, a casino rooster, a non-sports scene).
3. **Review the seams and the background-only fill together** with the user.
4. Measure wall-clock time per call.

**Gate:** proceed to the full pipeline refactor only if the outpaint blends cleanly and timing is acceptable. If not, we pivot with zero risk to the working app.

## Testing / verification

Per `CLAUDE.md` (screenshot-driven, test before claiming fixed):

1. **Spike:** visually inspect 4–5 extended images for clean seams, background-only sides, no stray figures.
2. **Live, post-integration:** generate 2:1 banners for: ChatGPT goalkeeper (was cut), Gemini goalkeeper (floating ball), a standing casino rooster (must not regress), a dunk. Confirm: exact 1200×600, subject fully contained, clean extended background, coherent objects.
3. **Regression:** confirm square (1080×1080) and portrait (1080×1920) outputs are unchanged (still use the single-shot path).
4. **Fallback:** simulate an extend failure (bad key / forced throw) and confirm it falls back to a cropped image rather than erroring.
5. Screenshot before/after; self-review.

## Out of scope (v1)

- Splitting generation into two HTTP requests (only if the spike proves the single request is too slow).
- Native-wider Imagen outpainting if the Cloud Run service doesn't already expose it (no Cloud Run service changes in v1).
- Persisting Drive file IDs / brand / size to Supabase (separate parked task).
- Brand-encoded filename → auto-shadow feature (separate parked task).

## Files touched (summary)

- `api/_outpaint.ts` — **new**, `extendToWide()`.
- `api/generate-image.ts` — `generateSquareBase()`, wire the wide-path branch, keep fallback.
- `api/generate-prompt.ts` — square-composition cue for the base step; object-binding nudge.
- (No frontend changes required for v1 — the API returns the same exact-size image it does today.)

## Golden-rule compliance

- No n8n, no Airtable. Supabase + Google Drive + Vercel + OpenAI + GCP only.
- Generated images still go to Google Drive, cached in localStorage. Favorites still in Supabase.
- No hardcoded prompts; reference data still from Supabase.
