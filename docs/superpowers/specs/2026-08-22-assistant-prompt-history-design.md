# AI Concept Assistant — Versioned Prompt History

**Date:** 2026-08-22
**Status:** Awaiting review
**Scope:** Sub-project C of 3 in the AI Concept Assistant upgrade.

## Goal

Lena reported the Assistant's flow is "too rigid — can't iterate": no way to go back, branch, or compare. This spec makes prompt state non-destructive so those become possible.

## What is actually rigid (and what is not)

Reading `src/pages/AssistantPage.tsx` first changed the shape of this work. Two things Lena might reasonably think are missing already work:

- **Switching concepts.** The three concept cards stay rendered after a pick (`{concepts && ...}` and `{generated && concepts && ...}` are siblings), and each card's `onClick={() => onPick(c)}` still fires. Clicking a different card regenerates from it.
- **Getting fresh ideas.** `onSuggest()` re-rolls three new concepts and merges the old ones into a running `avoid` list, so repeat presses explore new ground rather than repeating.

The genuine problem is narrower and sharper: **prompt state is single-slot and destructive.**

- `const [generated, setGenerated] = useState<(GeneratedFields & { brand: string }) | null>(null)` holds exactly ONE prompt.
- `onPick` overwrites it. Switching concepts to look at an alternative therefore destroys the prompt you had.
- Refining overwrites it too. `RefineChat` hands back refined fields and they replace the current ones with no way back.

So every exploratory action costs you the thing you were exploring from. That is what "can't iterate" means in practice.

## Design decision: build the primitive, not the UX

The obvious readings of "branch, compare, go back" each imply a different interface — a version timeline, a side-by-side diff, a tree. Choosing between them without watching Lena work would be guessing, and this spec deliberately does not guess.

Instead it builds the one thing all three need: **non-destructive, versioned prompt state.** Every generate and every refine appends a version rather than replacing one. A minimal switcher makes them reachable.

Explicitly NOT in this spec:

- **Side-by-side compare panels.** A layout decision that should follow from watching someone use the history, not precede it.
- **Concept blending.** Already exists in this app — `src/components/CreateBlendedPromptDialog.tsx` and `api/create-blended-prompt.ts`. Rebuilding it inside the Assistant would duplicate a working feature.
- **Branching trees.** The version list is linear by design. If Lena turns out to want true branches, the version records already carry `concept`, so grouping them into branches later is additive.
- Anything in sub-projects A (concept quality — shipped) or B (output size — shipped; reference-image input parked pending requirements).

## Design

### 1. The version record

New type in `src/lib/assistant-types.ts`:

```ts
export interface PromptVersion {
  /** Stable id for React keys and selection. */
  id: string;
  fields: GeneratedFields & { brand: string };
  /** Which concept direction this version came from. */
  concept: AssistantConcept;
  /** How this version came to exist. */
  source: 'generated' | 'refined';
  /** Token usage for the call that produced it; null for refines that failed to report. */
  usage: AssistantUsage | null;
  createdAt: number;
}
```

`source` and `concept` are what make the list readable — a version is identifiable as "refined from Neon Astronaut" rather than an anonymous entry.

### 2. State change in AssistantPage

Replace the single slot:

```ts
// before
const [generated, setGenerated] = useState<(GeneratedFields & { brand: string }) | null>(null);
const [pickedConcept, setPickedConcept] = useState<AssistantConcept | null>(null);
const [generatedUsage, setGeneratedUsage] = useState<AssistantUsage | null>(null);

// after
const [versions, setVersions] = useState<PromptVersion[]>([]);
const [activeIndex, setActiveIndex] = useState(0);
```

`pickedConcept` and `generatedUsage` are absorbed into the active version — they are per-version facts, and keeping them as separate top-level state is what allowed them to drift out of sync with `generated` in the first place.

A derived `active = versions[activeIndex] ?? null` replaces every read of `generated`. Everywhere that currently checks `generated &&` becomes `active &&`, so the render structure does not change shape.

### 3. Appending instead of replacing

- `onPick(c)` appends a version with `source: 'generated'` and sets `activeIndex` to it. Picking a second concept no longer destroys the first prompt.
- The refine path appends with `source: 'refined'`, carrying the same `concept` as the version it refined from, and sets `activeIndex` to the new entry.

Both keep the newest version active, so the default experience is unchanged: you generate or refine and see the result immediately. History is opt-in.

### 4. The version switcher

A new `src/components/assistant/VersionStrip.tsx`:

```ts
interface Props {
  versions: PromptVersion[];
  activeIndex: number;
  onSelect: (index: number) => void;
}
```

Renders nothing when `versions.length <= 1` — the control must not appear before it has a purpose. Otherwise a horizontal row of small buttons, one per version, newest last, each labelled with its ordinal and origin (e.g. `2 · refined`), the active one visually distinct. Selecting one sets `activeIndex`.

Kept deliberately plain: this is the affordance that makes history reachable, not a designed timeline.

### 5. Where GeneratedPromptPanel changes

It currently receives `fields`, `pickedConcept`, `usage` as separate props and owns `currentFields` internal state that the refine flow mutates.

It will receive the active `PromptVersion` plus an `onNewVersion(fields, usage)` callback, and stop owning mutable field state — the parent owns history, the panel renders the active version and reports refinements upward. This is the part of the change that makes the whole thing work: as long as the panel keeps its own mutable copy, refining cannot be non-destructive no matter what the parent does.

Its existing size/resolution/model controls, save, like, and image rendering are untouched.

## Verified facts

Read from the current code on 2026-08-22:

- `src/pages/AssistantPage.tsx` is 238 lines; `GeneratedPromptPanel.tsx` is 351; `RefineChat.tsx` is 217.
- `AssistantPage` holds 12 `useState` calls; three of them (`generated`, `pickedConcept`, `generatedUsage`) are the single-slot prompt state this spec replaces.
- Concept re-picking already works — the concept cards remain mounted and clickable after a pick.
- `avoid` already accumulates shown concepts via `mergeAvoid` (capped at 15) so re-rolling explores new ground.
- Blending already exists at `src/components/CreateBlendedPromptDialog.tsx` and `api/create-blended-prompt.ts`.
- `vitest.config.ts` uses `environment: 'node'` with no jsdom, so component rendering cannot be unit-tested in this repo. Testing must target pure functions.

## Testing

Because there is no jsdom, the testable surface is the version-list logic, so the design puts that logic in pure functions rather than inline in the component:

New `src/lib/prompt-versions.ts`:

```ts
export function appendVersion(versions: PromptVersion[], next: Omit<PromptVersion, 'id' | 'createdAt'>): PromptVersion[]
export function versionLabel(v: PromptVersion, index: number): string
```

`appendVersion` supplies the two fields the caller should not have to think about: `id` from `crypto.randomUUID()` (available in browsers and in Node 18+, so it works under the node-environment test runner) and `createdAt` from `Date.now()`. Tests assert that ids are unique across appends, never that a specific id or timestamp is produced. `VersionStrip` renders its button text via `versionLabel`, so the label format has exactly one definition.

Unit tests (`src/lib/prompt-versions.test.ts`):

- `appendVersion` returns a NEW array and does not mutate the input — the whole point is non-destructive state.
- Appending assigns a unique id; ids remain unique across many appends.
- A generated version and a refined version from the same concept both retain that concept.
- `versionLabel` renders the ordinal and source (`'1 · generated'`, `'2 · refined'`).
- Appending to an empty list yields a single version.

Manual verification (`npm run dev` serves the UI but not `/api`, so the Assistant's flow needs a Vercel preview):

- Generate a prompt, pick a second concept, confirm the first prompt is still reachable and unchanged.
- Refine twice, step back to version 1, confirm its fields are the original ones.
- Confirm the strip is absent with a single version and appears at two.
- Confirm save, like, and image rendering still act on the version on screen.

## Risks

1. **This is a state-shape change in the page's core flow.** Every read of `generated` must become a read of `active`, and a missed one renders stale data. Mitigated by the derived-value approach (one definition, many readers) rather than parallel state.
2. **Moving mutable field state out of `GeneratedPromptPanel` touches the refine path**, which is the most intricate flow on the page. If refine regresses, the feature is worse than before. The manual checks above exercise it directly.
3. **The requirement is inferred, not gathered.** Lena said "too rigid"; this spec's reading of that is history, not compare-panels or trees. That reading could be wrong. It is chosen because it is the cheapest thing that makes any of the richer readings possible later, and because it is strictly additive — nothing that works today is removed. If she wanted side-by-side comparison specifically, this is a foundation for it rather than the thing itself.
4. **No rendering tests exist or can exist** without adding jsdom, which is out of scope. The pure-function split is the mitigation; the component wiring is covered only by the manual checks.
