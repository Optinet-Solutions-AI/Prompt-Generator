# AI Concept Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hidden `/assistant/:token`-gated page where a single tester enters a task topic, gets three AI-proposed visual concepts, picks one, and receives a structured RocketSpin-branded prompt + images — all logged with accurate per-call cost.

**Architecture:** Two new Vercel API endpoints (`concepts`, `generate`) backed by a provider-abstracted LLM module (OpenAI + Gemini active, Claude stub). Shared brand rules extracted from the existing `generate-prompt.ts` into `api/_brand-rules.ts` so the main app and new endpoints use the same data. Token gate via env-var allowlist. Two new Supabase tables (`assistant_prompts`, `assistant_image_gens`) scoped by `test_user_id`. New React page at `/assistant/:token` mirrors the existing UI style.

**Tech Stack:** Vite + React + shadcn/ui + react-router-dom + @tanstack/react-query (existing). Vercel serverless functions (`@vercel/node`). Supabase JS client. New: `vitest` for unit tests, `gemini-2.5-flash` / `gemini-2.5-pro` via Generative Language API.

**Reference spec:** [docs/superpowers/specs/2026-05-15-ai-concept-assistant-design.md](../specs/2026-05-15-ai-concept-assistant-design.md)

---

## Project rules to follow during execution

These come from [CLAUDE.md](../../../CLAUDE.md) and override the default plan commit steps:

1. **Never auto-commit.** Every "Commit" step in this plan means: stage the files, show the user the proposed commit message, **wait for explicit approval**, then run the commit. Do not run `git commit` without that approval.
2. **Screenshot every UI change.** Before and after each UI-affecting task, take a screenshot of `http://localhost:5173/assistant/dev-token-local` (or the relevant route) using Playwright or the `seo-visual` agent. Self-analyze the screenshot before declaring the task done.
3. **Run `gitnexus_impact` before editing existing symbols.** Specifically before changing [api/generate-prompt.ts](../../../api/generate-prompt.ts), [api/generate-image.ts](../../../api/generate-image.ts), and [src/App.tsx](../../../src/App.tsx). Warn the user if risk is HIGH or CRITICAL.
4. **Run `gitnexus_detect_changes` before each commit.** Verify the scope matches what the task intended.
5. **Preserve all existing functionality.** After the plan is done, the main app at `/` must still generate prompts and images exactly as before.

---

## Phase A: Foundation

### Task 0: Install vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest as a dev dependency**

Run:
```bash
npm install --save-dev vitest@latest
```
Expected: `package.json` has `"vitest"` under `devDependencies`. No code uses it yet.

- [ ] **Step 2: Add `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['api/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules/**', 'dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add `test` and `test:watch` scripts to package.json**

Edit `scripts` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add a sample test to verify the setup**

Create `api/_pricing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test, expect 1 passing**

Run: `npm test`
Expected: `1 passed (1)`

- [ ] **Step 6: Commit**

Propose commit message to the user:
```
chore: add vitest for unit tests

- vitest@latest as devDep
- vitest.config.ts (node env, @ alias)
- npm test / npm run test:watch scripts
```
Wait for approval, then commit.

---

### Task 1: Supabase migration — assistant tables

**Files:**
- Create: `supabase/migrations/2026-05-15-assistant-tables.sql`

- [ ] **Step 1: Confirm migrations directory layout**

Run: `ls supabase/migrations/ 2>/dev/null || echo "no migrations dir yet"`

If the directory does not exist, create it with `mkdir -p supabase/migrations`. If the existing project uses a different migration tool, ask the user before proceeding.

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migrations/2026-05-15-assistant-tables.sql`:
```sql
-- AI Concept Assistant — new tables
-- These are isolated from the main app's tables.

create table if not exists assistant_prompts (
  id                  uuid primary key default gen_random_uuid(),
  test_user_id        text not null,
  brand               text not null,
  task                text,
  description         text,
  provider            text,
  model               text,
  all_concepts        jsonb,
  picked_concept      jsonb,
  generated_fields    jsonb,
  image_drive_ids     text[],
  liked               boolean default false,
  input_tokens        integer,
  cached_input_tokens integer,
  output_tokens       integer,
  created_at          timestamptz default now()
);

create index if not exists idx_assistant_prompts_user
  on assistant_prompts(test_user_id, created_at desc);

create table if not exists assistant_image_gens (
  id              uuid primary key default gen_random_uuid(),
  prompt_id       uuid references assistant_prompts(id) on delete cascade,
  test_user_id    text not null,
  provider        text not null,
  model           text,
  size            text,
  quality         text,
  image_count     integer default 1,
  drive_file_id   text,
  cost_usd        numeric(10,6),
  created_at      timestamptz default now()
);

create index if not exists idx_assistant_image_gens_user
  on assistant_image_gens(test_user_id, created_at desc);
```

- [ ] **Step 3: Apply the migration to Supabase**

If the project uses the Supabase CLI:
```bash
supabase db push
```
Otherwise: open the Supabase dashboard SQL editor, paste the contents of the migration file, run it. Verify both tables appear in the Table Editor.

- [ ] **Step 4: Verify the tables exist**

In Supabase SQL editor run:
```sql
select column_name, data_type from information_schema.columns
where table_name in ('assistant_prompts','assistant_image_gens')
order by table_name, ordinal_position;
```
Expected: rows for every column listed in the migration.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(db): add assistant_prompts + assistant_image_gens tables
```
Wait for approval, then commit.

---

### Task 2: Extract brand rules + add RocketSpin

**Files:**
- Create: `api/_brand-rules.ts`
- Create: `api/_brand-rules.test.ts`
- Modify: `api/generate-prompt.ts` (replace inline constants with imports)

- [ ] **Step 1: Run gitnexus impact on `generate-prompt.ts` symbols**

Run:
```
gitnexus_impact({ target: 'BRAND_PALETTES', direction: 'upstream' })
gitnexus_impact({ target: 'BRAND_SCENE_MANDATES', direction: 'upstream' })
```
Report the blast radius. Stop and warn the user if HIGH/CRITICAL. Expected: only `api/generate-prompt.ts` references these constants (they're file-local today).

- [ ] **Step 2: Write the failing test for `_brand-rules.ts`**

Create `api/_brand-rules.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  BRAND_PALETTES,
  BRAND_SCENE_MANDATES,
  buildBrandRules,
} from './_brand-rules';

describe('_brand-rules', () => {
  it('keeps the existing 9 brand palette entries', () => {
    const expected = [
      'FortunePlay','SpinJo','Roosterbet','LuckyVibe','SpinsUp',
      'PlayMojo','Lucky7even','NovaDreams','Rollero',
    ];
    for (const brand of expected) {
      expect(BRAND_PALETTES[brand], `palette for ${brand}`).toBeTruthy();
    }
  });

  it('adds RocketSpin palette and scene mandate', () => {
    expect(BRAND_PALETTES.RocketSpin).toMatch(/champagne gold/i);
    expect(BRAND_PALETTES.RocketSpin).toMatch(/glowing cyan/i);
    expect(BRAND_SCENE_MANDATES.RocketSpin).toMatch(/arc reactor/i);
    expect(BRAND_SCENE_MANDATES.RocketSpin).toMatch(/NEVER Pixar/i);
  });

  it('buildBrandRules returns palette + mandate for known brand', () => {
    const out = buildBrandRules('RocketSpin');
    expect(out.palette).toContain('#D4B26A');
    expect(out.mandate).toContain('arc reactor');
  });

  it('buildBrandRules returns palette null and empty mandate for unknown brand', () => {
    const out = buildBrandRules('NotARealBrand');
    expect(out.palette).toBeNull();
    expect(out.mandate).toBe('');
  });
});
```

- [ ] **Step 3: Run the test, expect FAIL ("cannot resolve _brand-rules")**

Run: `npm test -- _brand-rules`
Expected: failure because the module does not exist yet.

- [ ] **Step 4: Create `_brand-rules.ts` with the extracted + new entries**

Create `api/_brand-rules.ts`:
```ts
export const BRAND_PALETTES: Record<string, string> = {
  FortunePlay: 'Yellow, orange, gold, warm amber, warm casino lighting. NEVER use blue, purple, cyan, neon, or cold tones.',
  SpinJo:      'Purple, violet, magenta, neon-blue, electric cyan, deep space black. Sci-fi/futuristic palette. NEVER use gold, warm amber, orange, or earthy warm tones.',
  Roosterbet:  'Red, crimson, fiery orange, black, bold white. High-energy sports palette. NEVER use pastel, soft pink, or muted tones.',
  LuckyVibe:   'Golden hour warm tones, sunset orange, tropical coral, soft amber, warm backlight. NEVER use cold blue, purple, or neon tones.',
  SpinsUp:     'Neon purple, electric magenta, showman gold accents, deep black, circus-bright. Magical/mystical palette. NEVER use muted earthy tones or pastels.',
  PlayMojo:    'Dark noir black, bold white, sharp red accent. Sleek, cinematic. NEVER use warm gold, pastel, or cheerful bright colors.',
  Lucky7even:  'Deep purple, electric violet, metallic gold accents, black. Rich premium palette. NEVER use flat grey, earthy tones, or muted colors.',
  NovaDreams:  'Cosmic blue, electric cyan, white, deep navy black. Space/futuristic palette. NEVER use warm orange, red, gold, or earthy tones.',
  Rollero:     'Crimson red, dark charcoal grey, black, sharp white highlight. Warrior/combat palette. NEVER use pastel, neon, or soft warm tones.',
  RocketSpin:
    'Pristine white (#F5F5F0), champagne gold (#D4B26A), glowing cyan (#00BFFF), ' +
    'sky blue. Setting almost always bright sky with massive sun-lit cumulus ' +
    'clouds during golden hour, occasionally a premium futuristic interior. ' +
    'NEVER use dark moody tones, pastel washes, muted greys, or anime/cartoon ' +
    'colour styling.',
};

export const BRAND_SCENE_MANDATES: Record<string, string> = {
  Roosterbet:  'FIRE IS MANDATORY AND MUST ORIGINATE FROM THE PLAYER: Fire and flames MUST burst outward FROM the athlete — erupting from their feet, legs, arms, or movement trail as they perform the action. The player should appear to be GENERATING the fire through their athletic intensity and power. Do NOT place fire only in the background or floor — it must come FROM the player\'s body and movement. Make the fire dynamic, explosive, and visually striking — an extension of the player\'s energy. This is the Roosterbet signature.',
  FortunePlay: 'GOLD IS MANDATORY: The scene MUST include gold accents AND gold dust/particles — floating golden light, golden sparkles, or shimmering gold dust in the air. This is the FortunePlay signature. If the base prompt lacks these, ADD them to the atmosphere or lighting.',
  LuckyVibe:   'BEACH/SUNSET IS MANDATORY: The scene MUST feature sunset lighting as the primary light source, AND sand must be visible somewhere in the frame (even if the setting is a stadium with grass, add sand at the edges or as a foreground element). Palm trees MUST appear in the background. This is the LuckyVibe signature. If the base prompt lacks these, ADD them naturally.',
  RocketSpin:
    'STYLE MANDATE: Hyperrealistic cinematic CGI at the quality of a live-action ' +
    'Marvel film (Unreal Engine 5 / MCU-grade). NEVER Pixar style, NEVER anime, ' +
    'NEVER cartoon, NEVER plastic skin, NEVER oversized head/eyes. ' +
    'HERO MANDATE: Athletic male, age 28-32, Hollywood casting type (Henry Cavill ' +
    '/ Chris Evans), short tousled brown hair, light stubble, piercing blue eyes. ' +
    'Amber/orange-tinted aviator-style tactical goggles with a thin champagne-gold ' +
    'frame. Sleek white-and-gold Iron Man-style armor with a circular glowing cyan ' +
    'arc reactor centered on the chest, gold pauldrons, gold wrist cuffs. ' +
    'Female variant: long-haired blonde, same armor. ' +
    'BRAND OBJECTS (use at least one when relevant): gold coins engraved "RS", ' +
    'white rockets with golden thrusters, blue holographic UI elements, white gift ' +
    'boxes with gold ribbons, sparkling particles, confetti. ' +
    'COMPOSITION: Hero centered, facing camera, symmetrical framing, negative ' +
    'space on the sides for text. Lighting always warm and soft, with volumetric ' +
    'god rays and lens flare. ' +
    'MOOD: Premium, aspirational, optimistic, victorious, cinematic.',
};

export interface BrandRules {
  palette: string | null;
  mandate: string;
}

export function buildBrandRules(brand: string): BrandRules {
  return {
    palette: BRAND_PALETTES[brand] ?? null,
    mandate: BRAND_SCENE_MANDATES[brand] ?? '',
  };
}
```

- [ ] **Step 5: Run the test, expect PASS**

Run: `npm test -- _brand-rules`
Expected: 4 passing tests.

- [ ] **Step 6: Refactor `generate-prompt.ts` to import from `_brand-rules.ts`**

Edit [api/generate-prompt.ts](../../../api/generate-prompt.ts):
- Delete the inline `BRAND_PALETTES` and `BRAND_SCENE_MANDATES` constants (currently at lines ~23-41).
- Add at the top of the file (after the existing import):
  ```ts
  import { BRAND_PALETTES, BRAND_SCENE_MANDATES } from './_brand-rules';
  ```
- Leave the rest of the handler unchanged.

- [ ] **Step 7: Run `gitnexus_detect_changes`**

Run: `gitnexus_detect_changes({ scope: 'all' })`
Expected: only `api/_brand-rules.ts`, `api/_brand-rules.test.ts`, and `api/generate-prompt.ts` affected.

- [ ] **Step 8: Manually verify the main app still works**

Start dev server: `npm run dev`
Open `http://localhost:5173/`, select a known brand (e.g. FortunePlay), click "Regenerate Prompt".
Expected: prompt comes back with FortunePlay-style colour rules applied (gold accents). No change in behaviour from before.

- [ ] **Step 9: Commit**

Propose commit message:
```
refactor: extract brand rules to api/_brand-rules.ts; add RocketSpin

- moves BRAND_PALETTES + BRAND_SCENE_MANDATES out of generate-prompt.ts
- adds RocketSpin palette + style mandate
- main app behaviour unchanged (verified with FortunePlay test)
```
Wait for approval, then commit.

---

### Task 3: Pricing config + cost helpers

**Files:**
- Replace: `api/_pricing.ts` (overwriting the sample test from Task 0)
- Create: `api/_pricing.test.ts` (alongside the new module)

- [ ] **Step 1: Write the failing test**

Replace `api/_pricing.test.ts` with:
```ts
import { describe, it, expect } from 'vitest';
import { LLM_PRICING, IMAGE_PRICING, computeLlmCost, computeImageCost } from './_pricing';

describe('LLM_PRICING table', () => {
  it('has Gemini Flash and Pro filled with sourced values', () => {
    expect(LLM_PRICING['gemini-2.5-flash'].input_per_million).toBe(0.30);
    expect(LLM_PRICING['gemini-2.5-flash'].output_per_million).toBe(2.50);
    expect(LLM_PRICING['gemini-2.5-pro'].input_per_million).toBe(1.25);
    expect(LLM_PRICING['gemini-2.5-pro'].output_per_million).toBe(10.00);
  });

  it('flags OpenAI rates as TODO (intentionally null)', () => {
    expect(LLM_PRICING['gpt-4o'].input_per_million).toBeNull();
    expect(LLM_PRICING['gpt-4o'].output_per_million).toBeNull();
    expect(LLM_PRICING['gpt-4o'].source).toMatch(/TODO/);
  });
});

describe('computeLlmCost', () => {
  it('computes Gemini Pro cost from token usage', () => {
    const cost = computeLlmCost('gemini-2.5-pro', {
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 500,
    });
    // (1000 * 1.25 + 500 * 10.00) / 1_000_000 = 0.00625
    expect(cost).toBeCloseTo(0.00625, 8);
  });

  it('returns null when a price is missing', () => {
    const cost = computeLlmCost('gpt-4o', {
      input_tokens: 1000,
      cached_input_tokens: 0,
      output_tokens: 500,
    });
    expect(cost).toBeNull();
  });

  it('discounts cached input tokens when cached_input_per_million is set', () => {
    const cost = computeLlmCost('test-cache-model', {
      input_tokens: 2000,
      cached_input_tokens: 1500,
      output_tokens: 0,
    });
    // 500 billable @ $1/M + 1500 cached @ $0.50/M = (500 + 750) / 1_000_000
    expect(cost).toBeCloseTo(0.00125, 8);
  });
});

describe('computeImageCost', () => {
  it('returns null until image rates are filled', () => {
    expect(computeImageCost('1024x1024', 'standard', 1)).toBeNull();
  });
});
```

Note: the cached-input test uses a `test-cache-model` entry. Add it to LLM_PRICING below as a clearly-labelled test fixture so the test passes without touching real model prices.

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- _pricing`
Expected: failures because `_pricing.ts` is just the sample placeholder from Task 0.

- [ ] **Step 3: Replace `api/_pricing.ts` with the real module**

Replace the file contents with:
```ts
export interface ModelPrice {
  input_per_million: number | null;
  cached_input_per_million: number | null;
  output_per_million: number | null;
  last_updated: string | null;
  source: string;
}

export const LLM_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-flash': {
    input_per_million: 0.30,
    cached_input_per_million: null,
    output_per_million: 2.50,
    last_updated: '2026-05-14',
    source: 'ai.google.dev/pricing',
  },
  'gemini-2.5-pro': {
    input_per_million: 1.25,
    cached_input_per_million: null,
    output_per_million: 10.00,
    last_updated: '2026-05-14',
    source: 'ai.google.dev/pricing',
  },
  'gpt-4o': {
    input_per_million: null,
    cached_input_per_million: null,
    output_per_million: null,
    last_updated: null,
    source: 'openai.com/api/pricing — TODO fill in before going live',
  },
  'gpt-4o-mini': {
    input_per_million: null,
    cached_input_per_million: null,
    output_per_million: null,
    last_updated: null,
    source: 'openai.com/api/pricing — TODO fill in before going live',
  },
  // Test fixture only — referenced by _pricing.test.ts to verify cache discount math.
  'test-cache-model': {
    input_per_million: 1.00,
    cached_input_per_million: 0.50,
    output_per_million: 0.00,
    last_updated: '2026-05-15',
    source: 'test fixture',
  },
};

export interface ImagePrice {
  cost_per_image_usd: number | null;
  size: string;
  quality: string | null;
  last_updated: string | null;
  source: string;
}

export const IMAGE_PRICING: ImagePrice[] = [
  { cost_per_image_usd: null, size: '1024x1024', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1024x1024', quality: 'hd',       last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1536x1024', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1024x1536', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
];

export function computeLlmCost(
  model: string,
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number }
): number | null {
  const p = LLM_PRICING[model];
  if (!p || p.input_per_million === null || p.output_per_million === null) return null;
  const billableInput = usage.input_tokens - usage.cached_input_tokens;
  const cachedRate = p.cached_input_per_million ?? p.input_per_million;
  return (
    billableInput * p.input_per_million +
    usage.cached_input_tokens * cachedRate +
    usage.output_tokens * p.output_per_million
  ) / 1_000_000;
}

export function computeImageCost(size: string, quality: string | null, count: number): number | null {
  const entry = IMAGE_PRICING.find(p => p.size === size && (p.quality ?? null) === quality);
  if (!entry || entry.cost_per_image_usd === null) return null;
  return entry.cost_per_image_usd * count;
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npm test -- _pricing`
Expected: all tests pass.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(api): add _pricing.ts with verified Gemini rates + cost helpers

- Gemini Flash/Pro rates sourced from ai.google.dev (2026-05-14)
- OpenAI rates intentionally null until filled from official dashboard
- computeLlmCost / computeImageCost helpers with unit tests
```
Wait for approval, then commit.

---

### Task 4: Token validator

**Files:**
- Create: `api/_assistant-token.ts`
- Create: `api/_assistant-token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/_assistant-token.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToken } from './_assistant-token';

describe('validateToken', () => {
  const ORIGINAL = process.env.VITE_ASSISTANT_TOKENS;

  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2,tester-john-q7p1';
  });
  afterEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = ORIGINAL;
  });

  it('accepts a token in the allowlist', () => {
    expect(validateToken('tester-her-x9k2')).toEqual({ test_user_id: 'tester-her-x9k2' });
  });

  it('rejects a token not in the allowlist', () => {
    expect(validateToken('random-guess')).toBeNull();
  });

  it('rejects an empty token', () => {
    expect(validateToken('')).toBeNull();
  });

  it('rejects when env var is missing', () => {
    delete process.env.VITE_ASSISTANT_TOKENS;
    expect(validateToken('tester-her-x9k2')).toBeNull();
  });

  it('trims whitespace in the env var entries', () => {
    process.env.VITE_ASSISTANT_TOKENS = ' tester-her-x9k2 , tester-john-q7p1 ';
    expect(validateToken('tester-her-x9k2')).toEqual({ test_user_id: 'tester-her-x9k2' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- _assistant-token`
Expected: failures because the module does not exist.

- [ ] **Step 3: Implement the module**

Create `api/_assistant-token.ts`:
```ts
export interface TokenValidation {
  test_user_id: string;
}

export function validateToken(token: string | undefined | null): TokenValidation | null {
  if (!token) return null;
  const raw = process.env.VITE_ASSISTANT_TOKENS;
  if (!raw) return null;
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(token) ? { test_user_id: token } : null;
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- _assistant-token`
Expected: 5 passing tests.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(api): add _assistant-token.ts (env-allowlist gate for /assistant/:token)
```
Wait for approval, then commit.

---

## Phase B: LLM abstraction

### Task 5: `_llm.ts` — OpenAI branch

**Files:**
- Create: `api/_llm.ts`
- Create: `api/_llm.test.ts`

- [ ] **Step 1: Write the failing test (mocks `fetch`)**

Create `api/_llm.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chat } from './_llm';

const originalFetch = global.fetch;

describe('_llm.chat — OpenAI', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls OpenAI chat completions with the expected body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"concepts":[]}' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 0 } },
      }),
    });
    global.fetch = fetchMock as any;

    const result = await chat({
      provider: 'openai',
      model: 'gpt-4o-mini',
      system: 'sys',
      user: 'usr',
      maxTokens: 600,
      json: true,
      jsonSchema: { type: 'object', properties: { concepts: { type: 'array' } }, required: ['concepts'] },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_completion_tokens).toBe(600);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('sys');
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toBe('usr');
    expect(body.response_format.type).toBe('json_schema');

    expect(result.text).toBe('{"concepts":[]}');
    expect(result.usage).toEqual({ input_tokens: 120, cached_input_tokens: 0, output_tokens: 30 });
  });

  it('captures cached_tokens when OpenAI returns them', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 2000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 1500 } },
      }),
    }) as any;
    const r = await chat({ provider: 'openai', model: 'gpt-4o', system: 's', user: 'u', maxTokens: 100 });
    expect(r.usage.cached_input_tokens).toBe(1500);
  });

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'err' }) as any;
    await expect(
      chat({ provider: 'openai', model: 'gpt-4o', system: 's', user: 'u', maxTokens: 100 })
    ).rejects.toThrow(/OpenAI/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- _llm`
Expected: failures because `_llm.ts` does not exist.

- [ ] **Step 3: Implement OpenAI branch only**

Create `api/_llm.ts`:
```ts
export type Provider = 'openai' | 'gemini' | 'claude';

export interface ChatOptions {
  provider: Provider;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  json?: boolean;
  jsonSchema?: object;
}

export interface ChatResult {
  text: string;
  usage: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  switch (opts.provider) {
    case 'openai':
      return chatOpenAI(opts);
    case 'gemini':
      throw new Error('Gemini provider not yet implemented');
    case 'claude':
      throw new Error('Claude provider not yet wired');
  }
}

async function chatOpenAI(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user',   content: opts.user },
    ],
    max_completion_tokens: opts.maxTokens,
  };

  if (opts.json) {
    body.response_format = opts.jsonSchema
      ? { type: 'json_schema', json_schema: { name: 'assistant_output', strict: true, schema: opts.jsonSchema } }
      : { type: 'json_object' };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    text: data.choices[0]?.message?.content ?? '',
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      cached_input_tokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- _llm`
Expected: 3 passing tests.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(api): add _llm.ts with OpenAI branch (Gemini/Claude stubs throw)
```
Wait for approval, then commit.

---

### Task 6: `_llm.ts` — Gemini branch

**Files:**
- Modify: `api/_llm.ts`
- Modify: `api/_llm.test.ts`

- [ ] **Step 1: Add failing tests for Gemini**

Append to `api/_llm.test.ts`:
```ts
describe('_llm.chat — Gemini', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls the Gemini generateContent endpoint with system + user content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"concepts":[]}' }] } }],
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
      }),
    });
    global.fetch = fetchMock as any;

    const result = await chat({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      system: 'sys',
      user: 'usr',
      maxTokens: 600,
      json: true,
      jsonSchema: { type: 'object', properties: { concepts: { type: 'array' } }, required: ['concepts'] },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    expect(url).toContain('key=test-gemini-key');

    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0].text).toBe('usr');
    expect(body.generationConfig.maxOutputTokens).toBe(600);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toBeDefined();

    expect(result.text).toBe('{"concepts":[]}');
    expect(result.usage).toEqual({ input_tokens: 120, cached_input_tokens: 0, output_tokens: 30 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL ("Gemini provider not yet implemented")**

Run: `npm test -- _llm`
Expected: the new Gemini test fails with that error message.

- [ ] **Step 3: Implement the Gemini branch in `_llm.ts`**

Replace the `'gemini'` case in `chat()` and add `chatGemini()`:
```ts
case 'gemini':
  return chatGemini(opts);
```

Then add this function below `chatOpenAI`:
```ts
async function chatGemini(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens,
  };
  if (opts.json) {
    generationConfig.responseMimeType = 'application/json';
    if (opts.jsonSchema) generationConfig.responseSchema = opts.jsonSchema;
  }

  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: 'user', parts: [{ text: opts.user }] }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    usage: {
      input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      cached_input_tokens: 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- _llm`
Expected: all OpenAI + Gemini tests pass.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(api): add Gemini branch to _llm (Flash/Pro with JSON schema mode)
```
Wait for approval, then commit.

---

## Phase C: New API endpoints

### Task 7: `api/assistant/concepts.ts`

**Files:**
- Create: `api/assistant/concepts.ts`
- Create: `api/assistant/concepts.test.ts`
- Create: `api/_assistant-prompts.ts` (shared personality + system-prompt helpers)
- Create: `api/_assistant-prompts.test.ts`

- [ ] **Step 1: Write the failing test for the shared system-prompt builders**

Create `api/_assistant-prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildConceptsSystemPrompt, buildGenerateSystemPrompt } from './_assistant-prompts';

describe('buildConceptsSystemPrompt', () => {
  it('includes the partner personality preamble', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/visual concept partner/i);
    expect(out).toMatch(/Forbidden phrases/);
    expect(out).toMatch(/Great question/);
  });

  it('includes the brand palette and mandate', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/champagne gold/i);
    expect(out).toMatch(/arc reactor/i);
  });

  it('instructs the model to return exactly 3 visually distinct concepts as JSON', () => {
    const out = buildConceptsSystemPrompt('RocketSpin');
    expect(out).toMatch(/exactly 3 concepts/i);
    expect(out).toMatch(/visually distinct/i);
  });
});

describe('buildGenerateSystemPrompt', () => {
  it('includes the personality + brand rules + structured-field instructions', () => {
    const out = buildGenerateSystemPrompt('RocketSpin');
    expect(out).toMatch(/visual concept partner/i);
    expect(out).toMatch(/champagne gold/i);
    expect(out).toMatch(/positive_prompt/);
    expect(out).toMatch(/negative_prompt/);
    expect(out).toMatch(/format_layout/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- _assistant-prompts`
Expected: module-not-found failures.

- [ ] **Step 3: Implement `_assistant-prompts.ts`**

Create `api/_assistant-prompts.ts`:
```ts
import { buildBrandRules } from './_brand-rules';

const PERSONALITY = `
You are a senior visual concept partner working with a creative director.
Speak in first person. Be direct. Have opinions. Recommend the choice you
would make and say why in one short sentence.

Forbidden phrases (these reduce quality and waste tokens):
  "Great question", "I'd be happy to help", "Certainly", "Of course",
  "As an AI", "Here is", any preamble before the actual answer.

You are a collaborator, not a chatbot. Output the work, not commentary
about the work.
`.trim();

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
  ].filter(Boolean).join('\n');
}

export function buildConceptsSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    'Return exactly 3 concepts as strict JSON: {"concepts":[{"title","description"}],"recommendation"}.',
    'Each concept must be visually distinct (different setting, action, or framing).',
    'Description must be 2-3 sentences, practical, scannable.',
    'The "recommendation" field is one short sentence: which concept you would pick and why.',
  ].join('\n');
}

export function buildGenerateSystemPrompt(brand: string): string {
  return [
    PERSONALITY,
    '',
    brandBlock(brand),
    '',
    'You will receive a picked concept (title + description) plus the original task and description.',
    'Produce the structured prompt fields for a downstream image generator.',
    '',
    'Return strict JSON with exactly these keys:',
    '  format_layout, primary_object, subject, lighting, mood, background,',
    '  positive_prompt, negative_prompt',
    '',
    'positive_prompt should be a single rich paragraph the image model can use directly.',
    'negative_prompt should be a comma-separated list of things to exclude (text, logos, watermarks, etc.).',
    'Apply the brand colour palette and style mandate to every field.',
  ].join('\n');
}

export const CONCEPTS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts', 'recommendation'],
  properties: {
    concepts: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    recommendation: { type: 'string' },
  },
} as const;

export const GENERATE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'format_layout','primary_object','subject','lighting','mood',
    'background','positive_prompt','negative_prompt',
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

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- _assistant-prompts`
Expected: 4 passing tests.

- [ ] **Step 5: Write the failing test for the concepts endpoint**

Create `api/assistant/concepts.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './concepts';

function mockReqRes(body: unknown) {
  const req = { method: 'POST', body } as any;
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return { req, res };
}

const originalFetch = global.fetch;

describe('POST /api/assistant/concepts', () => {
  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 401 on invalid token', async () => {
    const { req, res } = mockReqRes({ token: 'nope', brand: 'RocketSpin', task: 't', model: 'gemini' });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 405 on GET', async () => {
    const { req, res } = mockReqRes({});
    req.method = 'GET';
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 3 concepts + usage on a valid Gemini call', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          concepts: [
            { title: 'Sky Strike',   description: 'Hero dives through gold coin storm.' },
            { title: 'Vault Heist',  description: 'Hero stands inside cyan-lit vault.' },
            { title: 'Cloud Throne', description: 'Hero perched atop golden cumulus.' },
          ],
          recommendation: 'I would pick Sky Strike for the strongest negative space.',
        }) }] } }],
        usageMetadata: { promptTokenCount: 350, candidatesTokenCount: 180 },
      }),
    }) as any;

    const { req, res } = mockReqRes({
      token: 'tester-her-x9k2',
      brand: 'RocketSpin',
      task: 'banner for weekend rocket boost',
      model: 'gemini',
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.concepts).toHaveLength(3);
    expect(body.recommendation).toMatch(/Sky Strike/);
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      input_tokens: 350,
      cached_input_tokens: 0,
      output_tokens: 180,
    });
  });
});
```

- [ ] **Step 6: Run, expect FAIL**

Run: `npm test -- assistant/concepts`
Expected: module-not-found failures.

- [ ] **Step 7: Implement the endpoint**

Create `api/assistant/concepts.ts`:
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token';
import { chat } from '../_llm';
import { buildConceptsSystemPrompt, CONCEPTS_JSON_SCHEMA } from '../_assistant-prompts';

const CONCEPTS_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, brand, task, description, model } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    model?: 'openai' | 'gemini' | 'claude';
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !task || !model) {
    return res.status(400).json({ error: 'brand, task, and model are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const chosenModel = CONCEPTS_MODEL[model];

  try {
    const system = buildConceptsSystemPrompt(brand);
    const user = `Task topic: ${task}\nExtra detail: ${description ?? '(none)'}`;
    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: CONCEPTS_JSON_SCHEMA,
      maxTokens: 600,
    });

    const parsed = JSON.parse(result.text);
    return res.status(200).json({
      concepts: parsed.concepts,
      recommendation: parsed.recommendation,
      usage: { provider: model, model: chosenModel, ...result.usage },
    });
  } catch (err) {
    console.error('assistant/concepts error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 8: Run, expect PASS**

Run: `npm test -- assistant/concepts`
Expected: 3 passing tests.

- [ ] **Step 9: Commit**

Propose commit message:
```
feat(api): POST /api/assistant/concepts (3-concept brainstorm)

- shared personality + brand-rule system prompt builder
- Gemini Flash for concept brainstorm, gpt-4o-mini for OpenAI path
- strict JSON schema for response (3 concepts + recommendation)
- env-allowlist token gate
```
Wait for approval, then commit.

---

### Task 8: `api/assistant/generate.ts`

**Files:**
- Create: `api/assistant/generate.ts`
- Create: `api/assistant/generate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `api/assistant/generate.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './generate';

function mockReqRes(body: unknown) {
  const req = { method: 'POST', body } as any;
  const res: any = {
    statusCode: 200,
    body: null as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return { req, res };
}

const originalFetch = global.fetch;
const STRUCTURED = {
  format_layout: 'Wide cinematic banner (16:9), hero centered.',
  primary_object: 'White-and-gold Iron Man-style armor.',
  subject: 'Athletic male hero, late 20s, blue eyes, tousled brown hair.',
  lighting: 'Warm golden-hour rays, volumetric god rays, soft cyan rim from chest reactor.',
  mood: 'Premium, victorious, cinematic.',
  background: 'Massive sunlit cumulus clouds during golden hour.',
  positive_prompt: 'Cinematic CGI of RocketSpin hero diving through a storm of gold coins…',
  negative_prompt: 'no text, no logos, no watermarks, no cartoon, no anime, no plastic skin.',
};

describe('POST /api/assistant/generate', () => {
  beforeEach(() => {
    process.env.VITE_ASSISTANT_TOKENS = 'tester-her-x9k2';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
  });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns 401 on invalid token', async () => {
    const { req, res } = mockReqRes({ token: 'no', brand: 'RocketSpin', task: 't', model: 'gemini', pickedConcept: { title: 'x', description: 'y' } });
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns structured fields + usage on valid Gemini call', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(STRUCTURED) }] } }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 400 },
      }),
    }) as any;

    const { req, res } = mockReqRes({
      token: 'tester-her-x9k2',
      brand: 'RocketSpin',
      task: 'banner for weekend rocket boost',
      pickedConcept: { title: 'Sky Strike', description: 'Hero dives through gold coin storm.' },
      model: 'gemini',
    });
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as any;
    expect(body.metadata).toMatchObject({
      brand: 'RocketSpin',
      format_layout: STRUCTURED.format_layout,
      positive_prompt: STRUCTURED.positive_prompt,
      negative_prompt: STRUCTURED.negative_prompt,
    });
    expect(body.prompt).toBe(STRUCTURED.positive_prompt);
    expect(body.usage).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      input_tokens: 800,
      cached_input_tokens: 0,
      output_tokens: 400,
    });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- assistant/generate`

- [ ] **Step 3: Implement the endpoint**

Create `api/assistant/generate.ts`:
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { validateToken } from '../_assistant-token';
import { chat } from '../_llm';
import { buildGenerateSystemPrompt, GENERATE_JSON_SCHEMA } from '../_assistant-prompts';

const GENERATE_MODEL: Record<'openai' | 'gemini', string> = {
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-pro',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, brand, task, description, pickedConcept, model } = (req.body ?? {}) as {
    token?: string; brand?: string; task?: string; description?: string;
    pickedConcept?: { title: string; description: string };
    model?: 'openai' | 'gemini' | 'claude';
  };

  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: 'Invalid token' });

  if (!brand || !task || !model || !pickedConcept) {
    return res.status(400).json({ error: 'brand, task, model, and pickedConcept are required' });
  }
  if (model === 'claude') {
    return res.status(400).json({ error: 'Claude provider is not yet available' });
  }

  const chosenModel = GENERATE_MODEL[model];

  try {
    const system = buildGenerateSystemPrompt(brand);
    const user = [
      `Task topic: ${task}`,
      `Extra detail: ${description ?? '(none)'}`,
      `Picked concept title: ${pickedConcept.title}`,
      `Picked concept description: ${pickedConcept.description}`,
    ].join('\n');

    const result = await chat({
      provider: model,
      model: chosenModel,
      system,
      user,
      json: true,
      jsonSchema: GENERATE_JSON_SCHEMA,
      maxTokens: 1200,
    });

    const fields = JSON.parse(result.text);
    return res.status(200).json({
      success: true,
      prompt: fields.positive_prompt,
      metadata: { brand, ...fields },
      usage: { provider: model, model: chosenModel, ...result.usage },
    });
  } catch (err) {
    console.error('assistant/generate error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npm test -- assistant/generate`
Expected: 2 passing tests.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(api): POST /api/assistant/generate (structured prompt from picked concept)

- gpt-4o / gemini-2.5-pro on the premium tier
- response shape matches existing generate-prompt.ts so the UI can reuse components
```
Wait for approval, then commit.

---

## Phase D: Image gen opt-in extension

### Task 9: Extend `api/generate-image.ts` to log assistant image gens

**Files:**
- Modify: `api/generate-image.ts`

- [ ] **Step 1: Run gitnexus impact**

Run: `gitnexus_impact({ target: 'generate-image handler', direction: 'upstream' })`
Report blast radius. Expected: main app's `useImageGeneration` (or similar) hook calls this. Warn the user before proceeding if HIGH/CRITICAL.

- [ ] **Step 2: Read the file and find the success path**

Read [api/generate-image.ts](../../../api/generate-image.ts) and locate the point where the Drive file ID is known (i.e. after upload to Drive completes).

- [ ] **Step 3: Add the opt-in logging block**

Immediately after the Drive file ID is available — and before the response is returned — add this block. Do NOT change any existing behaviour outside this block.

```ts
// Optional: log to assistant_image_gens when called by the AI Assistant page.
// Existing callers (main app) do NOT send `source: 'assistant'` and skip this entirely.
if (req.body?.source === 'assistant' && req.body?.test_user_id) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const { computeImageCost } = await import('./_pricing');

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const size    = req.body?.size    ?? '1024x1024';
    const quality = req.body?.quality ?? 'standard';
    const provider = req.body?.provider ?? 'openai';
    const model    = req.body?.model    ?? 'gpt-image-1';
    const count    = 1;
    const cost     = computeImageCost(size, quality, count);

    await supabase.from('assistant_image_gens').insert({
      prompt_id:     req.body?.assistant_prompt_id ?? null,
      test_user_id:  req.body.test_user_id,
      provider,
      model,
      size,
      quality,
      image_count:   count,
      drive_file_id: driveFileId, // adjust to match the actual variable name in this file
      cost_usd:      cost,
    });
  } catch (logErr) {
    // Cost logging must NEVER break the main flow.
    console.error('assistant_image_gens log failed:', logErr);
  }
}
```

Note: when applying this patch, replace `driveFileId` with whatever the local variable is actually called in [api/generate-image.ts](../../../api/generate-image.ts). Find that variable first by reading the file.

- [ ] **Step 4: Manually verify the main app's image gen path still works**

Start dev server: `npm run dev`
Open `http://localhost:5173/`, generate a prompt, click "ChatGPT" image gen.
Expected: image returns and saves to Drive as before. No row in `assistant_image_gens` (verify in Supabase).

- [ ] **Step 5: Run `gitnexus_detect_changes`**

Run: `gitnexus_detect_changes({ scope: 'all' })`
Expected: only `api/generate-image.ts` changed in this task.

- [ ] **Step 6: Commit**

Propose commit message:
```
feat(api): generate-image opt-in cost logging when source='assistant'

- main-app callers see zero behaviour change
- failures inside the logging block are caught and logged, never thrown
```
Wait for approval, then commit.

---

## Phase E: Frontend foundation

### Task 10: Types + typed client

**Files:**
- Create: `src/lib/assistant-types.ts`
- Create: `src/lib/assistant-client.ts`

- [ ] **Step 1: Create the shared types**

Create `src/lib/assistant-types.ts`:
```ts
export type AssistantProvider = 'openai' | 'gemini' | 'claude';

export interface AssistantConcept {
  title: string;
  description: string;
}

export interface AssistantUsage {
  provider: AssistantProvider;
  model: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface ConceptsResponse {
  concepts: AssistantConcept[];     // exactly 3
  recommendation: string;
  usage: AssistantUsage;
}

export interface GeneratedFields {
  format_layout: string;
  primary_object: string;
  subject: string;
  lighting: string;
  mood: string;
  background: string;
  positive_prompt: string;
  negative_prompt: string;
}

export interface GenerateResponse {
  success: true;
  prompt: string;
  metadata: GeneratedFields & { brand: string };
  usage: AssistantUsage;
}
```

- [ ] **Step 2: Create the typed client**

Create `src/lib/assistant-client.ts`:
```ts
import type {
  AssistantConcept,
  AssistantProvider,
  ConceptsResponse,
  GenerateResponse,
} from './assistant-types';

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${url} (${res.status}): ${err}`);
  }
  return res.json() as Promise<T>;
}

export function requestConcepts(args: {
  token: string;
  brand: string;
  task: string;
  description?: string;
  model: AssistantProvider;
}) {
  return postJson<ConceptsResponse>('/api/assistant/concepts', args);
}

export function requestGenerate(args: {
  token: string;
  brand: string;
  task: string;
  description?: string;
  pickedConcept: AssistantConcept;
  model: AssistantProvider;
}) {
  return postJson<GenerateResponse>('/api/assistant/generate', args);
}
```

- [ ] **Step 3: Commit**

Propose commit message:
```
feat(client): add typed assistant API client + shared types
```
Wait for approval, then commit.

---

### Task 11: Add the `/assistant/:token` route

**Files:**
- Modify: `src/App.tsx`
- Create: `src/pages/AssistantPage.tsx` (skeleton only — full content in Task 12)

- [ ] **Step 1: Run gitnexus impact on App routing**

Run: `gitnexus_impact({ target: 'App', direction: 'upstream' })`
Expected: only `main.tsx` mounts App. LOW risk.

- [ ] **Step 2: Create a stub `AssistantPage.tsx`**

Create `src/pages/AssistantPage.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import NotFound from './NotFound';

function isAllowed(token: string | undefined): boolean {
  if (!token) return false;
  const raw = import.meta.env.VITE_ASSISTANT_TOKENS as string | undefined;
  if (!raw) return false;
  return raw.split(',').map(s => s.trim()).includes(token);
}

export default function AssistantPage() {
  const { token } = useParams();
  if (!isAllowed(token)) return <NotFound />;

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">AI Concept Assistant</h1>
      <p className="mt-2 text-muted-foreground">
        Hello, <span className="font-mono">{token}</span>. Page under construction.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Add the route**

Edit [src/App.tsx](../../../src/App.tsx). Add the import alongside the existing page imports:
```tsx
import AssistantPage from './pages/AssistantPage';
```
Add the route ABOVE the `<Route path="*" element={<NotFound />} />` line:
```tsx
<Route path="/assistant/:token" element={<AssistantPage />} />
```

- [ ] **Step 4: Verify routing behaviour**

Add `VITE_ASSISTANT_TOKENS=tester-her-x9k2,dev-token-local` to `.env.local`.
Start dev server: `npm run dev`.
Open `http://localhost:5173/assistant/dev-token-local` — expected: skeleton page renders.
Open `http://localhost:5173/assistant/invalid` — expected: NotFound page renders.

- [ ] **Step 5: Screenshot both states**

Use the `seo-visual` agent or Playwright to capture `/assistant/dev-token-local` (skeleton) and `/assistant/invalid` (NotFound). Self-analyze: NotFound matches the project's existing NotFound page, skeleton renders the token text.

- [ ] **Step 6: Run `gitnexus_detect_changes`**

Run: `gitnexus_detect_changes({ scope: 'all' })`
Expected: only `src/App.tsx` and `src/pages/AssistantPage.tsx`.

- [ ] **Step 7: Commit**

Propose commit message:
```
feat(ui): add hidden /assistant/:token route (skeleton)

- token gate via VITE_ASSISTANT_TOKENS env allowlist
- invalid token renders NotFound
```
Wait for approval, then commit.

---

## Phase F: Frontend feature components

### Task 12: AssistantPage — input form + model select + brand select

**Files:**
- Modify: `src/pages/AssistantPage.tsx`
- Create: `src/components/assistant/ModelSelect.tsx`

- [ ] **Step 1: Create the model select component**

Create `src/components/assistant/ModelSelect.tsx`:
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssistantProvider } from '@/lib/assistant-types';

const OPTIONS: { value: AssistantProvider; label: string; disabled?: boolean }[] = [
  { value: 'gemini', label: 'Gemini (Flash → Pro)' },
  { value: 'openai', label: 'OpenAI (4o-mini → 4o)' },
  { value: 'claude', label: 'Claude (coming soon)', disabled: true },
];

interface Props {
  value: AssistantProvider;
  onChange: (v: AssistantProvider) => void;
}

export function ModelSelect({ value, onChange }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssistantProvider)}>
      <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {OPTIONS.map(o => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Replace the skeleton AssistantPage with the input form**

Replace `src/pages/AssistantPage.tsx`:
```tsx
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import NotFound from './NotFound';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelect } from '@/components/assistant/ModelSelect';
import { requestConcepts } from '@/lib/assistant-client';
import type { AssistantProvider, AssistantConcept } from '@/lib/assistant-types';

function isAllowed(token: string | undefined): boolean {
  if (!token) return false;
  const raw = import.meta.env.VITE_ASSISTANT_TOKENS as string | undefined;
  if (!raw) return false;
  return raw.split(',').map(s => s.trim()).includes(token);
}

const AVAILABLE_BRANDS = ['RocketSpin'];

export default function AssistantPage() {
  const { token } = useParams();
  if (!isAllowed(token)) return <NotFound />;

  const [model, setModel] = useState<AssistantProvider>('gemini');
  const [brand, setBrand] = useState<string>('RocketSpin');
  const [task, setTask] = useState('');
  const [description, setDescription] = useState('');
  const [concepts, setConcepts] = useState<AssistantConcept[] | null>(null);
  const [recommendation, setRecommendation] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSuggest() {
    setError(null); setLoading(true); setConcepts(null);
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

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">AI Concept Assistant</h1>
        <ModelSelect value={model} onChange={setModel} />
      </header>

      <section className="space-y-4 rounded-lg border p-6 bg-card">
        <div>
          <Label htmlFor="brand">Brand</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger id="brand" className="w-[240px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AVAILABLE_BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="task">Task topic</Label>
          <Input id="task" value={task} onChange={(e) => setTask(e.target.value)}
                 placeholder="e.g. banner for weekend rocket boost" />
        </div>

        <div>
          <Label htmlFor="desc">Extra detail (optional)</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder="Anything that nudges the concepts in a direction…" rows={3} />
        </div>

        <Button onClick={onSuggest} disabled={loading || !task.trim()}>
          {loading ? 'Thinking…' : 'Suggest 3 concepts'}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {concepts && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-2">Concepts</h2>
          {recommendation && (
            <p className="text-sm text-muted-foreground mb-4 italic">{recommendation}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {concepts.map((c, i) => (
              <article key={i} className="rounded-lg border p-4 bg-card">
                <h3 className="font-medium">{c.title}</h3>
                <p className="text-sm text-muted-foreground mt-2">{c.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
```

The concept cards do NOT yet have a "Pick" button — that's added in Task 13 when we hook up generate.

- [ ] **Step 3: Manual verification**

`npm run dev`, open `http://localhost:5173/assistant/dev-token-local`.
Enter a task topic ("banner for weekend rocket boost"), click "Suggest 3 concepts".
Expected: 3 RocketSpin-themed concept cards render with the recommendation line above them. Check Network panel — `/api/assistant/concepts` returned 200 with 3 items.

If you hit "GEMINI_API_KEY is not configured", add the key to `.env.local` first.

- [ ] **Step 4: Screenshot before-after**

Use `seo-visual` or Playwright to capture the page in two states: empty form, and after concepts return. Self-analyze: layout matches the existing app's card patterns, no overflow, dropdowns readable.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(ui): assistant page input form + concept cards rendering
```
Wait for approval, then commit.

---

### Task 13: Wire concept Pick → generate + structured prompt display

**Files:**
- Modify: `src/pages/AssistantPage.tsx`
- Create: `src/components/assistant/GeneratedPromptPanel.tsx`

- [ ] **Step 1: Create the prompt display panel**

Create `src/components/assistant/GeneratedPromptPanel.tsx`:
```tsx
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { GeneratedFields } from '@/lib/assistant-types';

interface Props {
  fields: GeneratedFields & { brand: string };
}

const FIELD_ORDER: (keyof GeneratedFields)[] = [
  'format_layout', 'primary_object', 'subject', 'lighting',
  'mood', 'background', 'positive_prompt', 'negative_prompt',
];

export function GeneratedPromptPanel({ fields }: Props) {
  const { toast } = useToast();

  function copyAll() {
    navigator.clipboard.writeText(fields.positive_prompt);
    toast({ title: 'Copied positive prompt' });
  }

  return (
    <section className="mt-8 rounded-lg border p-6 bg-card">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Generated prompt ({fields.brand})</h2>
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Copy className="h-4 w-4 mr-1" />Copy positive prompt
        </Button>
      </header>

      <Accordion type="multiple" defaultValue={['positive_prompt']}>
        {FIELD_ORDER.map(key => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="capitalize">{key.replace('_', ' ')}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{fields[key]}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
```

- [ ] **Step 2: Update AssistantPage to handle Pick → generate**

Modify `src/pages/AssistantPage.tsx`:

Add at the top alongside the other imports:
```tsx
import { requestGenerate } from '@/lib/assistant-client';
import type { GeneratedFields } from '@/lib/assistant-types';
import { GeneratedPromptPanel } from '@/components/assistant/GeneratedPromptPanel';
```

Add state and handler inside the component (next to the existing useState block):
```tsx
const [generated, setGenerated] = useState<(GeneratedFields & { brand: string }) | null>(null);
const [generating, setGenerating] = useState(false);

async function onPick(c: AssistantConcept) {
  setError(null); setGenerating(true); setGenerated(null);
  try {
    const r = await requestGenerate({ token: token!, brand, task, description, model, pickedConcept: c });
    setGenerated(r.metadata);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setGenerating(false);
  }
}
```

Replace the concept-card JSX (added in Task 12) with the version that includes a Pick button:
```tsx
{concepts.map((c, i) => (
  <article key={i} className="rounded-lg border p-4 bg-card flex flex-col">
    <h3 className="font-medium">{c.title}</h3>
    <p className="text-sm text-muted-foreground mt-2 flex-1">{c.description}</p>
    <Button className="mt-4" size="sm" disabled={generating} onClick={() => onPick(c)}>
      {generating ? 'Generating…' : 'Pick →'}
    </Button>
  </article>
))}
```

Below the concepts section, render the generated panel:
```tsx
{generated && <GeneratedPromptPanel fields={generated} />}
```

- [ ] **Step 3: Manual verification**

`npm run dev`, full flow: task → suggest → pick concept → see structured fields render in accordion.
Network: `/api/assistant/generate` returns 200 with `metadata` populated.

- [ ] **Step 4: Screenshot the generated panel**

Capture and self-analyze.

- [ ] **Step 5: Commit**

Propose commit message:
```
feat(ui): pick concept → generate structured prompt panel
```
Wait for approval, then commit.

---

### Task 14: Wire image generation (ChatGPT + Gemini buttons)

**Files:**
- Modify: `src/components/assistant/GeneratedPromptPanel.tsx`
- Create: `src/hooks/useAssistantImageGen.ts`

- [ ] **Step 1: Inspect the existing image-gen call site**

Read [src/pages/Index.tsx](../../../src/pages/Index.tsx) and find how it calls `/api/generate-image` for both ChatGPT and Gemini variants. Note the request body shape — we must match it exactly, plus add `source: 'assistant'` and `test_user_id`.

- [ ] **Step 2: Create the assistant-scoped hook**

Create `src/hooks/useAssistantImageGen.ts`:
```ts
import { useState } from 'react';

interface Args {
  token: string;
  positivePrompt: string;
  negativePrompt: string;
  brand: string;
  provider: 'openai' | 'gemini';
}

export function useAssistantImageGen(token: string) {
  const [loading, setLoading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function generate(args: Args) {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // — match the existing main app's image-gen body shape here —
          prompt: args.positivePrompt,
          negative_prompt: args.negativePrompt,
          brand: args.brand,
          provider: args.provider,
          size: '1024x1024',
          quality: 'standard',
          // — assistant opt-in fields (new) —
          source: 'assistant',
          test_user_id: token,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setImageUrls(prev => [...prev, data.imageUrl ?? data.url].filter(Boolean));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return { loading, imageUrls, error, generate };
}
```

Adjust the request body fields to match exactly what `Index.tsx` sends — if it uses different field names (e.g. `positive_prompt` instead of `prompt`), mirror those.

- [ ] **Step 3: Add image-gen buttons to `GeneratedPromptPanel`**

Modify `GeneratedPromptPanel.tsx` to accept `token` as a prop and render two buttons + a grid of returned image URLs:
```tsx
import { useAssistantImageGen } from '@/hooks/useAssistantImageGen';
// …

interface Props {
  fields: GeneratedFields & { brand: string };
  token: string;
}

export function GeneratedPromptPanel({ fields, token }: Props) {
  const { generate, loading, imageUrls, error } = useAssistantImageGen(token);
  // existing copyAll() and accordion code stays unchanged
  // After </Accordion>:
  return (
    <section ...>
      {/* existing header + accordion */}

      <div className="mt-6 flex gap-2">
        <Button onClick={() => generate({
          token,
          positivePrompt: fields.positive_prompt,
          negativePrompt: fields.negative_prompt,
          brand: fields.brand,
          provider: 'openai',
        })} disabled={loading}>
          {loading ? 'Generating…' : 'ChatGPT 🎨'}
        </Button>
        <Button variant="secondary" onClick={() => generate({
          token,
          positivePrompt: fields.positive_prompt,
          negativePrompt: fields.negative_prompt,
          brand: fields.brand,
          provider: 'gemini',
        })} disabled={loading}>
          {loading ? 'Generating…' : 'Gemini 🎨'}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mt-2">{error}</p>}

      {imageUrls.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {imageUrls.map((url, i) => (
            <img key={i} src={url} alt={`generated ${i+1}`} className="rounded border" />
          ))}
        </div>
      )}
    </section>
  );
}
```

Update `AssistantPage.tsx` to pass `token` down:
```tsx
{generated && <GeneratedPromptPanel fields={generated} token={token!} />}
```

- [ ] **Step 4: Manual verification**

Full flow: task → suggest → pick → ChatGPT button.
Expected: image appears below the panel. Supabase: row in `assistant_image_gens` with `test_user_id` = your token and `cost_usd` = null (until image rates are filled).

Also verify the main app at `/` still works for image gen — go there, generate an image. Expected: no row written to `assistant_image_gens` (because main app doesn't send `source: 'assistant'`).

- [ ] **Step 5: Screenshot**

Capture and self-analyze.

- [ ] **Step 6: Commit**

Propose commit message:
```
feat(ui): assistant page image generation (ChatGPT + Gemini, opt-in cost log)
```
Wait for approval, then commit.

---

### Task 15: Save (heart) to Supabase

**Files:**
- Create: `src/lib/assistant-storage.ts`
- Modify: `src/components/assistant/GeneratedPromptPanel.tsx`

- [ ] **Step 1: Create the Supabase helper**

Create `src/lib/assistant-storage.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import type { AssistantConcept, GeneratedFields, AssistantUsage } from './assistant-types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export interface SaveArgs {
  test_user_id: string;
  brand: string;
  task: string;
  description?: string;
  provider: string;
  model: string;
  all_concepts?: AssistantConcept[];
  picked_concept?: AssistantConcept;
  generated_fields?: GeneratedFields;
  usage?: Omit<AssistantUsage, 'provider' | 'model'>;
  image_drive_ids?: string[];
  liked: boolean;
}

export async function saveAssistantPrompt(args: SaveArgs) {
  const row = {
    test_user_id: args.test_user_id,
    brand: args.brand,
    task: args.task,
    description: args.description ?? null,
    provider: args.provider,
    model: args.model,
    all_concepts: args.all_concepts ?? null,
    picked_concept: args.picked_concept ?? null,
    generated_fields: args.generated_fields ?? null,
    image_drive_ids: args.image_drive_ids ?? [],
    liked: args.liked,
    input_tokens: args.usage?.input_tokens ?? null,
    cached_input_tokens: args.usage?.cached_input_tokens ?? null,
    output_tokens: args.usage?.output_tokens ?? null,
  };
  const { data, error } = await supabase
    .from('assistant_prompts')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Add the heart button + state**

Pass the necessary info to `GeneratedPromptPanel`:
```tsx
interface Props {
  fields: GeneratedFields & { brand: string };
  token: string;
  task: string;
  description?: string;
  pickedConcept: AssistantConcept;
  allConcepts: AssistantConcept[];
  usage: { provider: string; model: string; input_tokens: number; cached_input_tokens: number; output_tokens: number };
}
```

Add `Heart` import from `lucide-react`. Add liked state and onLike handler that calls `saveAssistantPrompt({...})` with `liked: true`. Show a small "Saved ✓" indicator on success.

(Full code block — paste verbatim into the panel:)
```tsx
import { Heart } from 'lucide-react';
import { saveAssistantPrompt } from '@/lib/assistant-storage';
// …
const [liked, setLiked] = useState(false);
const [saveError, setSaveError] = useState<string | null>(null);

async function onLike() {
  setSaveError(null);
  try {
    await saveAssistantPrompt({
      test_user_id: token,
      brand: fields.brand,
      task,
      description,
      provider: usage.provider,
      model: usage.model,
      all_concepts: allConcepts,
      picked_concept: pickedConcept,
      generated_fields: fields,
      usage,
      image_drive_ids: imageUrls,
      liked: true,
    });
    setLiked(true);
  } catch (e) {
    setSaveError(e instanceof Error ? e.message : String(e));
  }
}
```

In the header, alongside the Copy button:
```tsx
<Button variant="outline" size="sm" onClick={onLike} disabled={liked}>
  <Heart className={`h-4 w-4 mr-1 ${liked ? 'fill-current' : ''}`} />
  {liked ? 'Saved' : 'Save'}
</Button>
```

Update AssistantPage to pass the new props through.

- [ ] **Step 3: Manual verification**

Run the full flow, click Save. Check Supabase `assistant_prompts` — new row exists with your `test_user_id`, populated `picked_concept`, `generated_fields`, `liked = true`, token counts present.

Verify main app at `/`: like an image there → confirm it goes to `liked_images` (existing table), NOT `assistant_prompts`.

- [ ] **Step 4: Commit**

Propose commit message:
```
feat(ui): heart-to-save assistant prompts into Supabase
```
Wait for approval, then commit.

---

## Phase G: Cost tracker

### Task 16: Cost tracker hook + panel

**Files:**
- Create: `src/hooks/useCostTracker.ts`
- Create: `src/components/assistant/CostTrackerPanel.tsx`
- Modify: `src/pages/AssistantPage.tsx`

- [ ] **Step 1: Create the data hook**

Create `src/hooks/useCostTracker.ts`:
```ts
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export interface LlmCall {
  id: string;
  created_at: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
}

export interface ImageGen {
  id: string;
  created_at: string;
  provider: string;
  model: string | null;
  size: string | null;
  quality: string | null;
  image_count: number;
  cost_usd: number | null;
}

export function useCostTracker(testUserId: string) {
  const [llm, setLlm] = useState<LlmCall[]>([]);
  const [images, setImages] = useState<ImageGen[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: l } = await supabase
        .from('assistant_prompts')
        .select('id,created_at,provider,model,input_tokens,cached_input_tokens,output_tokens')
        .eq('test_user_id', testUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      const { data: i } = await supabase
        .from('assistant_image_gens')
        .select('id,created_at,provider,model,size,quality,image_count,cost_usd')
        .eq('test_user_id', testUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      setLlm((l ?? []) as LlmCall[]);
      setImages((i ?? []) as ImageGen[]);
    }
    load();
  }, [testUserId, refreshKey]);

  return { llm, images, refresh: () => setRefreshKey(k => k + 1) };
}
```

- [ ] **Step 2: Create a frontend-side mirror of the pricing tables**

The Vite frontend should not reach into the `api/` directory (different tsconfig
project, different build output). Create `src/lib/pricing.ts` that mirrors
`api/_pricing.ts`:

```ts
// MUST be kept in sync with api/_pricing.ts.
// Both files define the same constants so frontend (Cost Tracker) and
// backend (cost-at-write-time logging) compute the same numbers.

export interface ModelPrice {
  input_per_million: number | null;
  cached_input_per_million: number | null;
  output_per_million: number | null;
  last_updated: string | null;
  source: string;
}

export const LLM_PRICING: Record<string, ModelPrice> = {
  'gemini-2.5-flash': { input_per_million: 0.30, cached_input_per_million: null, output_per_million: 2.50, last_updated: '2026-05-14', source: 'ai.google.dev/pricing' },
  'gemini-2.5-pro':   { input_per_million: 1.25, cached_input_per_million: null, output_per_million: 10.00, last_updated: '2026-05-14', source: 'ai.google.dev/pricing' },
  'gpt-4o':           { input_per_million: null, cached_input_per_million: null, output_per_million: null, last_updated: null, source: 'openai.com/api/pricing — TODO fill in before going live' },
  'gpt-4o-mini':      { input_per_million: null, cached_input_per_million: null, output_per_million: null, last_updated: null, source: 'openai.com/api/pricing — TODO fill in before going live' },
};

export function computeLlmCost(model: string, usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number }): number | null {
  const p = LLM_PRICING[model];
  if (!p || p.input_per_million === null || p.output_per_million === null) return null;
  const billableInput = usage.input_tokens - usage.cached_input_tokens;
  const cachedRate = p.cached_input_per_million ?? p.input_per_million;
  return (billableInput * p.input_per_million + usage.cached_input_tokens * cachedRate + usage.output_tokens * p.output_per_million) / 1_000_000;
}
```

- [ ] **Step 3: Create the panel**

Create `src/components/assistant/CostTrackerPanel.tsx`:
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import { useCostTracker, type LlmCall, type ImageGen } from '@/hooks/useCostTracker';
import { LLM_PRICING, computeLlmCost } from '@/lib/pricing';

function llmCostFor(c: LlmCall): number | null {
  if (!c.model || c.input_tokens === null || c.output_tokens === null) return null;
  return computeLlmCost(c.model, {
    input_tokens: c.input_tokens,
    cached_input_tokens: c.cached_input_tokens ?? 0,
    output_tokens: c.output_tokens,
  });
}

function isToday(iso: string) {
  const d = new Date(iso); const now = new Date();
  return d.toDateString() === now.toDateString();
}
function isThisMonth(iso: string) {
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

interface Props { testUserId: string }

export function CostTrackerPanel({ testUserId }: Props) {
  const { llm, images } = useCostTracker(testUserId);

  const llmCosts  = llm.map(c => ({ c, usd: llmCostFor(c) }));
  const imgCosts  = images.map(i => ({ i, usd: i.cost_usd }));

  const sum = (xs: { usd: number | null }[], filter: (x: any) => boolean = () => true) =>
    xs.filter(filter).reduce((acc, x) => acc + (x.usd ?? 0), 0);

  const todayLlm   = sum(llmCosts.filter(x => isToday(x.c.created_at)));
  const monthLlm   = sum(llmCosts.filter(x => isThisMonth(x.c.created_at)));
  const todayImg   = sum(imgCosts.filter(x => isToday(x.i.created_at)));
  const monthImg   = sum(imgCosts.filter(x => isThisMonth(x.i.created_at)));

  const latestPriceDate =
    Object.values(LLM_PRICING).map(p => p.last_updated).filter(Boolean).sort().pop() ?? 'unknown';

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm"><Wallet className="h-4 w-4 mr-1" />Cost</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>Cost Tracker</SheetTitle></SheetHeader>

        <div className="text-sm mt-4 space-y-3">
          <div>
            <div className="font-medium">Today</div>
            <div>${(todayLlm + todayImg).toFixed(4)}
              <span className="text-muted-foreground"> (LLM ${todayLlm.toFixed(4)} · Img ${todayImg.toFixed(4)})</span>
            </div>
          </div>
          <div>
            <div className="font-medium">This month</div>
            <div>${(monthLlm + monthImg).toFixed(4)}</div>
          </div>

          <div className="pt-4 border-t">
            <div className="font-medium mb-1">Recent LLM calls</div>
            <ul className="space-y-1 text-xs">
              {llmCosts.slice(0, 10).map(({ c, usd }) => (
                <li key={c.id} className="flex justify-between">
                  <span>{new Date(c.created_at).toLocaleTimeString()} · {c.model ?? '?'}</span>
                  <span>{usd === null ? 'price unknown' : `$${usd.toFixed(5)}`}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-4 border-t">
            <div className="font-medium mb-1">Recent image gens</div>
            <ul className="space-y-1 text-xs">
              {imgCosts.slice(0, 10).map(({ i, usd }) => (
                <li key={i.id} className="flex justify-between">
                  <span>{new Date(i.created_at).toLocaleTimeString()} · {i.provider} {i.size}</span>
                  <span>{usd === null ? 'price unknown' : `$${usd.toFixed(5)}`}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Prices as of {latestPriceDate}. Some rows show "price unknown" until <code>api/_pricing.ts</code> is filled in.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Mount the panel in AssistantPage**

Add `<CostTrackerPanel testUserId={token!} />` to the page header next to the model dropdown.

- [ ] **Step 4: Manual verification**

Open the page, run two LLM calls and one image gen. Open the Cost Tracker — expected: today total reflects the calls. Gemini calls show non-null cost. OpenAI calls show "price unknown" (until pricing is filled).

- [ ] **Step 5: Screenshot**

Capture and self-analyze the slide-over.

- [ ] **Step 6: Commit**

Propose commit message:
```
feat(ui): cost tracker side panel (LLM + image gen, today/month/all)
```
Wait for approval, then commit.

---

## Phase H: Saved prompts panel

### Task 17: Saved prompts list

**Files:**
- Create: `src/components/assistant/SavedPromptsPanel.tsx`
- Modify: `src/pages/AssistantPage.tsx`

- [ ] **Step 1: Create the panel component**

Create `src/components/assistant/SavedPromptsPanel.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

interface SavedRow {
  id: string;
  brand: string;
  task: string;
  picked_concept: { title: string; description: string } | null;
  created_at: string;
}

export function SavedPromptsPanel({ testUserId }: { testUserId: string }) {
  const [rows, setRows] = useState<SavedRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('assistant_prompts')
        .select('id,brand,task,picked_concept,created_at')
        .eq('test_user_id', testUserId)
        .eq('liked', true)
        .order('created_at', { ascending: false })
        .limit(30);
      setRows((data ?? []) as SavedRow[]);
    })();
  }, [testUserId]);

  if (rows.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold mb-3">Your saved prompts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(r => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">{r.picked_concept?.title ?? r.task}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>{r.brand} · {new Date(r.created_at).toLocaleString()}</div>
              {r.picked_concept?.description && <div>{r.picked_concept.description}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it at the bottom of AssistantPage**

```tsx
import { SavedPromptsPanel } from '@/components/assistant/SavedPromptsPanel';
// …
<SavedPromptsPanel testUserId={token!} />
```

- [ ] **Step 3: Manual verification**

Save a prompt (via the heart button from Task 15), reload the page. Expected: the saved card appears in "Your saved prompts" with title + brand + timestamp.

Confirm scope: open the page under a different valid token (add one to `VITE_ASSISTANT_TOKENS` for testing) — expected: no rows show, because they belong to the other tester.

- [ ] **Step 4: Commit**

Propose commit message:
```
feat(ui): saved prompts panel (per-tester scope, hearted rows only)
```
Wait for approval, then commit.

---

## Phase I: Sign-off

### Task 18: Full end-to-end manual test + regression check

**Files:** none

- [ ] **Step 1: Run the full assistant flow**

`npm run dev`, open `http://localhost:5173/assistant/dev-token-local`.
- Type: "banner for weekend rocket boost"
- Click Suggest 3 concepts (Gemini)
- Click Pick on the recommended concept
- Click ChatGPT 🎨 image generation
- Click Heart to save
- Open Cost Tracker — verify both LLM call and image call appear

Expected: all steps succeed without console errors.

- [ ] **Step 2: Run the same with OpenAI**

Switch model dropdown to OpenAI. Re-run the full flow.
Expected: still works. Cost tracker shows the OpenAI call as "price unknown" (because gpt-4o pricing is null in `_pricing.ts` until you fill it in).

- [ ] **Step 3: Main-app regression check**

Open `http://localhost:5173/` (the main app).
- Pick a brand, pick a reference prompt, regenerate the prompt
- Generate an image (ChatGPT)
- Heart an image

Verify in Supabase:
- New row in `liked_images` (existing table)
- No new row in `assistant_prompts` or `assistant_image_gens`

Expected: main app behaves identically to before this plan.

- [ ] **Step 4: Bad-token check**

Open `http://localhost:5173/assistant/totally-invalid`.
Expected: NotFound page.

- [ ] **Step 5: Take final screenshots**

Capture the assistant page in its complete state (after a full flow) and the main app's home, side by side. Save as visual proof that both work.

- [ ] **Step 6: Document one outstanding item**

In the spec's "Open items" section (Section 16 of [docs/superpowers/specs/2026-05-15-ai-concept-assistant-design.md](../specs/2026-05-15-ai-concept-assistant-design.md)) add a bullet:
- "Fill `gpt-4o` and `gpt-4o-mini` rates in `api/_pricing.ts` from openai.com/api/pricing."
- "Fill `IMAGE_PRICING` rates in `api/_pricing.ts` from openai.com (gpt-image-1 size/quality tiers)."

These TODOs are surfaced in the UI as "price unknown" until done.

- [ ] **Step 7: Commit the spec doc update**

Propose commit message:
```
docs(spec): track price-config TODOs surfaced from implementation
```
Wait for approval, then commit.

---

## Done

All tasks complete. The feature is live at `/assistant/:token` for tokens listed in `VITE_ASSISTANT_TOKENS`. Main app behaviour is preserved.

Before opening this URL to additional testers:
1. Fill in the OpenAI rows in `api/_pricing.ts`.
2. Fill in `IMAGE_PRICING` rows.
3. Replace the URL-token gate with real authentication.
