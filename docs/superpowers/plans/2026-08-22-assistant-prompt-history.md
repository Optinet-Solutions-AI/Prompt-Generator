# Assistant Versioned Prompt History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI Concept Assistant's prompt state non-destructive — every generate and every refine appends a version instead of overwriting the single slot — so nothing you were exploring from is lost.

**Architecture:** `AssistantPage` swaps three pieces of single-slot state (`generated`, `pickedConcept`, `generatedUsage`) for `versions: PromptVersion[]` plus `activeIndex`, with a derived `active`. The append/label logic lives in pure functions so it can be unit-tested in a repo with no jsdom. `GeneratedPromptPanel` stops owning a mutable copy of the fields and instead renders the active version and reports refinements upward.

**Tech Stack:** Vite + React 18, TypeScript, vitest 4 (`environment: 'node'`, no jsdom), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-22-assistant-prompt-history-design.md`

## Global Constraints

- Files in `src/` import with **no** extension and use the `@/` alias. (`api/` uses `.js` — irrelevant here, this plan touches no backend file.)
- `vitest.config.ts` uses `globals: false` and `environment: 'node'` — import `describe/it/expect` explicitly from `'vitest'`, and **component rendering cannot be tested**. Do not add jsdom. Tests target pure functions only.
- Tests: `npm test`. **The suite is currently at 215 passing — do not regress it.** Also run `npx tsc --noEmit -p tsconfig.json` and `npm run build` on every task.
- **Never auto-commit.** Project rule (CLAUDE.md): propose the commit message and wait for approval. The `git commit` steps here are the *proposed* commit.
- Developer is a beginner with no coding background — comments explain *why*.
- **No backend file changes.** No `api/` file, no endpoint, no prompt string.
- **Nothing outside the version flow changes.** The concepts stage, the brief form, `onSuggest`, the avoid-list, `SavedPromptsPanel`, the cost tracker, image rendering, save, and like all keep working exactly as they do.

### Two facts read from the code that shape this plan

1. **`GeneratedPromptPanel.tsx:79` is `const [currentFields, setCurrentFields] = useState(fields);`** — `useState(initial)` only reads its argument on first mount. This works today purely because `onPick` calls `setGenerated(null)` before fetching, which makes `{generated && ...}` short-circuit, **unmounting** the panel; it then remounts with the new fields. Once versions keep the panel mounted while switching, that internal copy goes stale. Removing it is required for the feature to work, not a cleanup.
2. **Concept re-picking and idea re-rolling already work.** The concept cards stay mounted and clickable after a pick, and `onSuggest` merges shown concepts into a capped `avoid` list. Do not rebuild either.

### Scope decision recorded here so it is not re-litigated

Generated **images and refine-chat turns stay panel-level state**, not per-version. Switching versions changes the displayed prompt fields only; the images and chat you have accumulated this session remain. Making those per-version is a bigger behavioural question and is out of scope.

---

## File Structure

**Create:**
- `src/lib/prompt-versions.ts` — pure append + label logic. No React, no I/O. This is the whole testable surface.
- `src/lib/prompt-versions.test.ts`
- `src/components/assistant/VersionStrip.tsx` — the switcher. Presentational only.

**Modify:**
- `src/lib/assistant-types.ts` — add the `PromptVersion` interface.
- `src/pages/AssistantPage.tsx` — state shape, `onPick`, the panel's props.
- `src/components/assistant/GeneratedPromptPanel.tsx` — props change; drop the internal mutable field copy.

---

## Task 1: PromptVersion type and pure version logic

**Files:**
- Modify: `src/lib/assistant-types.ts` (append the interface)
- Create: `src/lib/prompt-versions.ts`
- Create: `src/lib/prompt-versions.test.ts`

**Interfaces:**
- Consumes: `GeneratedFields`, `AssistantConcept`, `AssistantUsage` — all already exported from `src/lib/assistant-types.ts`.
- Produces:
  - `PromptVersion` (in `assistant-types.ts`)
  - `appendVersion(versions: PromptVersion[], next: Omit<PromptVersion, 'id' | 'createdAt'>): PromptVersion[]`
  - `versionLabel(v: PromptVersion, index: number): string`

**Why pure functions:** this repo's vitest runs with `environment: 'node'` and no jsdom, so a React component cannot be rendered in a test. Putting the list logic here is what makes any of this testable at all.

- [ ] **Step 1: Write the failing test**

Create `src/lib/prompt-versions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appendVersion, versionLabel } from './prompt-versions';
import type { PromptVersion } from './assistant-types';

const CONCEPT = { title: 'Neon Astronaut', description: 'Hero beside a glowing wheel.' };

const FIELDS = {
  brand: 'RocketSpin',
  format_layout: 'Wide cinematic frame',
  primary_object: 'A glowing wheel',
  subject: 'An astronaut',
  lighting: 'Neon rim light',
  mood: 'Mysterious',
  background: 'Dark industrial bay',
  positive_prompt: 'A cinematic banner',
  negative_prompt: 'no text',
};

function seed(): PromptVersion[] {
  return appendVersion([], {
    fields: FIELDS, concept: CONCEPT, source: 'generated', usage: null,
  });
}

describe('appendVersion', () => {
  it('adds a version to an empty list', () => {
    const out = seed();
    expect(out).toHaveLength(1);
    expect(out[0].fields.brand).toBe('RocketSpin');
    expect(out[0].source).toBe('generated');
  });

  it('does NOT mutate the input array — non-destructive state is the whole point', () => {
    const before = seed();
    const after = appendVersion(before, {
      fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(before).toHaveLength(1);   // unchanged
    expect(after).toHaveLength(2);
    expect(after).not.toBe(before);   // new array reference
  });

  it('appends to the end so the newest version is last', () => {
    const out = appendVersion(seed(), {
      fields: { ...FIELDS, subject: 'A diver' }, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(out[0].fields.subject).toBe('An astronaut');
    expect(out[1].fields.subject).toBe('A diver');
  });

  it('assigns a unique id to every version', () => {
    let list = seed();
    for (let i = 0; i < 25; i++) {
      list = appendVersion(list, {
        fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
      });
    }
    const ids = list.map(v => v.id);
    expect(ids).toHaveLength(26);
    expect(new Set(ids).size).toBe(26);
    for (const id of ids) expect(id).toBeTruthy();
  });

  it('stamps createdAt as a number', () => {
    expect(typeof seed()[0].createdAt).toBe('number');
  });

  it('keeps the originating concept on both a generated and a refined version', () => {
    const out = appendVersion(seed(), {
      fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(out[0].concept.title).toBe('Neon Astronaut');
    expect(out[1].concept.title).toBe('Neon Astronaut');
  });

  it('preserves a usage object when one is given, and null when not', () => {
    const usage = {
      provider: 'gemini' as const, model: 'gemini-3.5-flash',
      input_tokens: 10, cached_input_tokens: 0, output_tokens: 20,
    };
    const withUsage = appendVersion([], {
      fields: FIELDS, concept: CONCEPT, source: 'generated', usage,
    });
    expect(withUsage[0].usage?.model).toBe('gemini-3.5-flash');
    expect(seed()[0].usage).toBeNull();
  });
});

describe('versionLabel', () => {
  it('shows a 1-based ordinal and the source', () => {
    const list = appendVersion(seed(), {
      fields: FIELDS, concept: CONCEPT, source: 'refined', usage: null,
    });
    expect(versionLabel(list[0], 0)).toBe('1 · generated');
    expect(versionLabel(list[1], 1)).toBe('2 · refined');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/prompt-versions.test.ts`
Expected: FAIL — cannot resolve `./prompt-versions`

- [ ] **Step 3: Add the type**

Append to `src/lib/assistant-types.ts`:

```ts
/**
 * One prompt in the Assistant's history.
 *
 * The Assistant used to hold exactly ONE generated prompt, so picking a
 * different concept — or refining — destroyed whatever you were exploring
 * from. Every generate and every refine now appends one of these instead.
 *
 * `concept` and `source` are what make the list readable: a version is
 * identifiable as "refined from Neon Astronaut" rather than an anonymous entry.
 */
export interface PromptVersion {
  /** Stable id, used for React keys and selection. */
  id: string;
  fields: GeneratedFields & { brand: string };
  /** The concept direction this version came from. */
  concept: AssistantConcept;
  /** How this version came to exist. */
  source: 'generated' | 'refined';
  /** Usage for the call that produced it; null when the call reported none. */
  usage: AssistantUsage | null;
  createdAt: number;
}
```

- [ ] **Step 4: Write the pure logic**

Create `src/lib/prompt-versions.ts`:

```ts
import type { PromptVersion } from './assistant-types';

/**
 * Append a version, returning a NEW array.
 *
 * Never mutates the input — that is the entire point of this module. The
 * Assistant's prompt state used to be a single slot that generate and refine
 * both overwrote, so every exploratory click cost you the thing you were
 * exploring from.
 *
 * `id` and `createdAt` are supplied here so callers do not have to think about
 * them. crypto.randomUUID() exists in browsers and in Node 18+, so it also
 * works under this repo's node-environment test runner.
 */
export function appendVersion(
  versions: PromptVersion[],
  next: Omit<PromptVersion, 'id' | 'createdAt'>,
): PromptVersion[] {
  return [
    ...versions,
    { ...next, id: crypto.randomUUID(), createdAt: Date.now() },
  ];
}

/**
 * Button text for the version switcher. One definition, so the strip and any
 * future consumer cannot drift apart.
 */
export function versionLabel(v: PromptVersion, index: number): string {
  return `${index + 1} · ${v.source}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/prompt-versions.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Typecheck and full suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: tsc clean; suite 215 + 8 new, zero failures

- [ ] **Step 7: Commit (propose — do not run unattended)**

```bash
git add src/lib/assistant-types.ts src/lib/prompt-versions.ts src/lib/prompt-versions.test.ts
git commit -m "feat: add PromptVersion type and non-destructive append logic"
```

---

## Task 2: VersionStrip switcher

**Files:**
- Create: `src/components/assistant/VersionStrip.tsx`

**Interfaces:**
- Consumes: `PromptVersion` from `@/lib/assistant-types`; `versionLabel` from `@/lib/prompt-versions` (Task 1).
- Produces: `<VersionStrip versions={PromptVersion[]} activeIndex={number} onSelect={(i: number) => void} />`

**No unit test for this task, and that is deliberate:** vitest runs with `environment: 'node'` and no jsdom, so this component cannot be rendered in a test. Its only logic — the label text — is already covered by `versionLabel`'s tests in Task 1. Do not add jsdom to test it, and do not invent a pure helper just to have something to assert.

- [ ] **Step 1: Write the component**

Create `src/components/assistant/VersionStrip.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { versionLabel } from '@/lib/prompt-versions';
import type { PromptVersion } from '@/lib/assistant-types';

interface Props {
  versions: PromptVersion[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Lets you step back to an earlier prompt.
 *
 * Renders NOTHING with one version or none — the control must not appear
 * before it has a purpose, which is the common case (generate once, render,
 * done). It only shows up once there is actually somewhere to go back to.
 */
export function VersionStrip({ versions, activeIndex, onSelect }: Props) {
  if (versions.length <= 1) return null;

  return (
    <div className="mb-3">
      <p className="text-xs text-muted-foreground mb-1">Versions</p>
      <div className="flex flex-wrap gap-2">
        {versions.map((v, i) => (
          <Button
            key={v.id}
            type="button"
            size="sm"
            variant={i === activeIndex ? 'default' : 'outline'}
            onClick={() => onSelect(i)}
            className={i === activeIndex ? 'gradient-primary' : ''}
            title={`${v.concept.title} — ${new Date(v.createdAt).toLocaleTimeString()}`}
          >
            {versionLabel(v, i)}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: both succeed

- [ ] **Step 3: Full suite (must not regress)**

Run: `npm test`
Expected: 223 passing, zero failures

- [ ] **Step 4: Commit (propose)**

```bash
git add src/components/assistant/VersionStrip.tsx
git commit -m "feat: add version switcher for Assistant prompt history"
```

---

## Task 3: Wire history through AssistantPage and GeneratedPromptPanel

**Files:**
- Modify: `src/pages/AssistantPage.tsx` (state at ~lines 41-44, `onPick` at ~48-61, panel props at ~221-232)
- Modify: `src/components/assistant/GeneratedPromptPanel.tsx` (`interface Props`, the `currentFields` state at ~line 79, `onFieldsRefined` at ~182, and every `currentFields` read)

**Interfaces:**
- Consumes: `PromptVersion` (Task 1), `appendVersion` (Task 1), `VersionStrip` (Task 2).
- Produces: nothing consumed by a later task — this is the final task.

**This is the integration task.** Read both files fully before editing either.

- [ ] **Step 1: Replace the single-slot state in AssistantPage**

In `src/pages/AssistantPage.tsx`, delete these three `useState` lines:

```ts
const [generated, setGenerated] = useState<(GeneratedFields & { brand: string }) | null>(null);
const [pickedConcept, setPickedConcept] = useState<AssistantConcept | null>(null);
const [generatedUsage, setGeneratedUsage] = useState<AssistantUsage | null>(null);
```

and add:

```ts
  // Prompt history. This used to be a single `generated` slot plus two
  // side-tables (pickedConcept, generatedUsage) that could drift out of sync
  // with it. Those are per-version facts, so they live on the version now.
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // One definition, many readers — every place that used to read `generated`
  // reads this instead, so a missed site is a type error rather than stale data.
  const active = versions[activeIndex] ?? null;
```

Add `PromptVersion` to the existing type import from `@/lib/assistant-types`, and import `appendVersion` from `@/lib/prompt-versions` and `VersionStrip` from `@/components/assistant/VersionStrip`.

- [ ] **Step 2: Make onPick append instead of overwrite**

Replace the body of `onPick`:

```ts
  async function onPick(c: AssistantConcept) {
    setError(null); setGenerating(true);
    try {
      const r = await requestGenerate({ token: token!, brand, task, description, model, pickedConcept: c });
      // Append rather than replace: picking a second concept to look at an
      // alternative must not destroy the prompt you already had.
      setVersions(prev => {
        const next = appendVersion(prev, {
          fields: r.metadata, concept: c, source: 'generated', usage: r.usage,
        });
        setActiveIndex(next.length - 1);   // newest stays active
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }
```

Note the removed `setGenerated(null)` and `setPickedConcept(c)`. Dropping the `null` is deliberate: it existed only to blank the panel while loading, and it is exactly what unmounted the panel and hid the stale-`currentFields` bug described in the Global Constraints.

- [ ] **Step 3: Render the strip and pass the active version**

Replace the `{generated && concepts && (...)}` block with:

```tsx
        {active && concepts && (
          <>
            <VersionStrip
              versions={versions}
              activeIndex={activeIndex}
              onSelect={setActiveIndex}
            />
            <GeneratedPromptPanel
              key={active.concept.title}
              version={active}
              token={token!}
              task={task}
              description={description}
              allConcepts={concepts}
              refineModel={model}
              onNewVersion={(fields, usage) => {
                setVersions(prev => {
                  const next = appendVersion(prev, {
                    fields, concept: active.concept, source: 'refined', usage,
                  });
                  setActiveIndex(next.length - 1);
                  return next;
                });
              }}
            />
          </>
        )}
```

`fields`, `pickedConcept` and `usage` props are gone — the panel reads them off `version`.

- [ ] **Step 4: Change the panel's props and drop its mutable copy**

In `src/components/assistant/GeneratedPromptPanel.tsx`, replace `interface Props`:

```ts
interface Props {
  version: PromptVersion;
  token: string;
  task: string;
  description?: string;
  allConcepts: AssistantConcept[];
  refineModel: AssistantProvider;
  /** Report a refinement upward — the parent owns history, not this panel. */
  onNewVersion: (fields: GeneratedFields & { brand: string }, usage: AssistantUsage | null) => void;
}
```

Delete `const [currentFields, setCurrentFields] = useState(fields);` and replace every `currentFields` read with `version.fields`. There are reads at roughly lines 121, 126, 137, 138, 166, 183, 191, 198 and 323-330 — **grep for `currentFields` and confirm zero remain**.

Replace `onFieldsRefined`:

```ts
  // Refining no longer mutates this panel's own copy — it appends a new
  // version in the parent. That is what makes stepping back possible: a
  // component-local copy would go stale the moment the parent switched
  // versions without unmounting us.
  function onFieldsRefined(refined: GeneratedFields) {
    onNewVersion({ ...refined, brand: version.fields.brand }, null);
  }
```

Where `usage` was previously read from the `usage` prop, read `version.usage` — and handle `null`, since a refined version legitimately has none. If a child requires a non-null usage, pass through only when present rather than asserting with `!`.

- [ ] **Step 5: Verify no stale references remain**

Run: `grep -n "currentFields\|pickedConcept\|generatedUsage\|\bgenerated\b" src/pages/AssistantPage.tsx src/components/assistant/GeneratedPromptPanel.tsx`
Expected: no `currentFields`; no `generatedUsage`; `pickedConcept` only as the name of the argument passed into `requestGenerate`; `generated` only inside unrelated words such as `generated_fields`

- [ ] **Step 6: Typecheck, suite, build**

Run: `npx tsc --noEmit -p tsconfig.json && npm test && npm run build`
Expected: tsc clean; 223 passing; build succeeds

- [ ] **Step 7: Commit (propose)**

```bash
git add src/pages/AssistantPage.tsx src/components/assistant/GeneratedPromptPanel.tsx
git commit -m "feat: Assistant keeps prompt history instead of one overwritten slot"
```

---

## Post-implementation verification (Vercel preview)

`npm run dev` serves the UI but not `/api`, so the Assistant flow needs a preview deploy.

- [ ] Generate a prompt from concept 1. Confirm no Versions strip appears (one version).
- [ ] Pick concept 2. Confirm the strip appears with two entries and the first prompt is still reachable and unchanged — this is the bug being fixed.
- [ ] Refine twice. Confirm two more entries appear labelled `refined`, and stepping back to version 1 shows the original fields.
- [ ] Confirm save, like, and image rendering all act on the version currently on screen.
- [ ] Confirm the refine chat still works after switching versions (it is panel-level state and is expected to persist across switches — see the scope decision in the Global Constraints).

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 The version record | Task 1 |
| §2 State change in AssistantPage | Task 3 Steps 1-2 |
| §3 Appending instead of replacing | Task 3 Steps 2-3 |
| §4 The version switcher | Task 2, rendered in Task 3 Step 3 |
| §5 Where GeneratedPromptPanel changes | Task 3 Step 4 |
| Testing (pure functions) | Task 1 |
| Manual verification | Preview checklist |
| Risk 1 (missed `generated` read) | Task 3 Step 5's grep, plus the derived-`active` approach making misses type errors |
| Risk 2 (refine path regression) | Preview checklist exercises refine directly |
| Risk 3 (inferred requirement) | Out of scope to resolve; the design is additive so nothing existing is lost |
| Risk 4 (no rendering tests) | Task 2 states the limitation explicitly rather than faking coverage |

**Placeholder scan:** no TBD/TODO. Task 2 has no test, and the reason is stated in the task rather than left implicit.

**Type consistency:** `PromptVersion` is defined in Task 1 and consumed by name in Tasks 2 and 3. `appendVersion(versions, next)` and `versionLabel(v, index)` keep the same signatures across all three tasks. `onNewVersion(fields, usage)` is declared in Task 3 Step 4's Props and called with exactly two arguments in Task 3 Step 3. The panel's removed props (`fields`, `pickedConcept`, `usage`) are removed in both the parent (Step 3) and the child (Step 4) in the same task, so there is no intermediate broken state.

**One deliberate addition beyond the spec:** Task 3 Step 3 puts `key={active.concept.title}` on the panel. Switching to a version from a *different concept* should reset the panel's chat and image state, because those belong to a different line of exploration; switching between versions of the same concept keeps them. Without the key the panel would carry another concept's chat across, which reads as a bug. It is noted here rather than hidden because it is a behavioural choice the spec did not make.
