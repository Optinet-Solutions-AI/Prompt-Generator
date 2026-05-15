# AI Concept Assistant — Design Spec

**Date:** 2026-05-15
**Status:** Draft — pending user review
**Scope:** Test-phase feature, single tester, RocketSpin brand only at launch

---

## 1. Goal

Add a new mode to the Multi Brand Prompt Generator where the user provides a task
topic instead of selecting a reference prompt. The AI then proposes several visual
concepts; the user picks one; the system generates the structured prompt fields and
runs image generation as in the existing flow.

The tone of the AI should feel like a collaborator (an "engineer / partner") rather
than a standard assistant: direct, opinionated, first-person, no filler phrases.

This is the first step toward broader AI-led concept selection. For now it is
gated to a single tester via an obscure URL token and writes to its own database
table, so nothing about it touches the main app or its data.

## 2. Non-goals

- No real user authentication (URL token only — clearly insufficient for production).
- No public link from the main app's nav.
- No new brands beyond RocketSpin at launch.
- No edits to the structured fields after concept pick (v1 generates and submits).
- No changes to how the main app handles its `liked_images` favorites.

## 3. User flow

```
1. User opens /assistant/<token>  (token validated against env allowlist)
   ↓
2. Page shows: model dropdown (OpenAI / Gemini / Claude-disabled),
   brand select (RocketSpin only), task topic input, optional extra detail.
   ↓
3. User clicks "Suggest 3 concepts".
   → POST /api/assistant/concepts
   → AI returns 3 visually distinct concept ideas (title + 2-3 sentence description).
   ↓
4. Concepts render as 3 side-by-side cards.
   User clicks "Pick" on one.
   ↓
5. → POST /api/assistant/generate
   → AI returns the structured prompt fields (same shape as existing reference rows:
     format_layout, primary_object, subject, lighting, mood, background,
     positive_prompt, negative_prompt).
   ↓
6. Generated prompt panel renders in the same UI style as the existing main page
   (accordion field display, copy / refresh / save / heart actions, image-gen
   buttons for ChatGPT and Gemini).
   ↓
7. User clicks an image-gen button.
   → POST /api/generate-image  (existing endpoint, called with source: 'assistant')
   → Drive file ID returned and stored alongside the prompt row.
   ↓
8. User hearts to save. Insert/update row in assistant_prompts (scoped to her
   test_user_id derived from the URL token).
```

## 4. Architecture

```
                          ┌──────────────────────┐
                          │  Vite + React (new   │
                          │  /assistant/<token>  │
                          │  page only)          │
                          └──────────┬───────────┘
                                     │
   ┌─────────────────────────────────┼─────────────────────────────────┐
   │                                 │                                 │
   ▼                                 ▼                                 ▼
┌─────────────────┐         ┌─────────────────┐               ┌─────────────────┐
│ /api/assistant/ │         │ /api/assistant/ │               │ /api/generate-  │
│ concepts.ts     │         │ generate.ts     │               │ image.ts        │
│ (NEW)           │         │ (NEW)           │               │ (existing +     │
│                 │         │                 │               │  small opt-in   │
│                 │         │                 │               │  extension)     │
└────────┬────────┘         └────────┬────────┘               └────────┬────────┘
         │                           │                                 │
         └──────────┬────────────────┘                                 │
                    ▼                                                  ▼
         ┌─────────────────┐                                ┌─────────────────┐
         │ /api/_llm.ts    │                                │ Supabase        │
         │ (NEW)           │                                │ assistant_      │
         │ provider switch │                                │ prompts +       │
         │ openai/gemini/  │                                │ assistant_      │
         │ claude          │                                │ image_gens      │
         └─────────────────┘                                │ (NEW tables)    │
                    │                                       └─────────────────┘
                    ├─ uses /api/_brand-rules.ts (NEW, shared with existing
                    │   api/generate-prompt.ts after refactor)
                    └─ uses /api/_assistant-token.ts (NEW, token allowlist)
                    └─ uses /api/_pricing.ts (NEW, pricing config)
```

## 5. Routing & access gate

- New SPA route: `/assistant/:token`.
- Route handler reads `:token` from URL.
- On mount, the client POSTs the token to `/api/assistant/validate-token` (or
  equivalently, the API routes themselves return 401 on invalid token — for v1 we
  do client-side validation against `import.meta.env.VITE_ASSISTANT_TOKENS` AND
  server-side validation on every API call). If invalid, render `<NotFound />`.
- The token IS the `test_user_id` (or maps 1:1 to one via the same env var).
  For v1: env var `VITE_ASSISTANT_TOKENS` is a comma-separated list. Each entry
  becomes both the URL token and the saved-row scope.
- To onboard another tester later, add a new token to the env var — no code change.

**Security disclosure:** Obscure URL + env-allowlist is sufficient for a single
trusted tester. It is NOT a real authentication boundary. If this URL leaks, anyone
who has it can read/write that tester's saved prompts. Before opening this up,
replace with real auth (Supabase Auth magic links, GitHub OAuth, or similar).

## 6. AI personality (system prompt)

Both endpoints share a personality preamble:

```
You are a senior visual concept partner working with a creative director.
Speak in first person. Be direct. Have opinions. Recommend the choice you
would make and say why in one short sentence.

Forbidden phrases (these reduce quality and waste tokens):
  "Great question", "I'd be happy to help", "Certainly", "Of course",
  "As an AI", "Here is", any preamble before the actual answer.

You are a collaborator, not a chatbot. Output the work, not commentary
about the work.
```

This preamble is appended in front of the brand rules and the task-specific
instructions for each endpoint.

## 7. Endpoint contracts

### `POST /api/assistant/concepts`

**Request:**
```ts
{
  token: string;
  brand: string;            // 'RocketSpin'
  task: string;             // e.g. 'banner for weekend rocket boost'
  description?: string;
  model: 'openai' | 'gemini' | 'claude';
  // sub-model is chosen server-side:
  //   openai → gpt-4o-mini, gemini → gemini-2.5-flash
}
```

**Response:**
```ts
{
  concepts: [
    { title: string, description: string },   // exactly 3
    { title: string, description: string },
    { title: string, description: string }
  ],
  recommendation: string;   // "I'd lean toward concept #2 because…"
  usage: {
    provider: 'openai' | 'gemini',
    model: string,
    input_tokens: number,
    cached_input_tokens: number,   // 0 for Gemini
    output_tokens: number
  };
}
```

**Server work:**
1. `validateToken(req.body.token)` → returns `test_user_id` or 401.
2. Load brand rules via `buildBrandRules('RocketSpin')`.
3. Build the system prompt: personality preamble + brand rules + concept
   instructions (return exactly 3 visually distinct concepts, JSON schema mode).
4. Call `_llm.chat({provider, system, user, json: true, max_tokens: 600})`.
5. Return the parsed concepts + usage metadata.

### `POST /api/assistant/generate`

**Request:**
```ts
{
  token: string;
  brand: string;
  task: string;
  description?: string;
  pickedConcept: { title: string, description: string };
  model: 'openai' | 'gemini' | 'claude';
  // sub-model: openai → gpt-4o, gemini → gemini-2.5-pro
}
```

**Response:** matches the existing `generate-prompt.ts` response shape, so the UI
can render it with the same components used today.
```ts
{
  success: true,
  prompt: string,                      // positive_prompt text
  metadata: {
    brand, format_layout, primary_object, subject, lighting, mood, background,
    positive_prompt, negative_prompt
  },
  usage: { provider, model, input_tokens, cached_input_tokens, output_tokens }
}
```

**Server work:**
1. Validate token.
2. Load brand rules.
3. Build a system prompt that takes the picked concept and brand rules and tells
   the model: "build the structured prompt fields. Return strict JSON with the
   exact keys listed."
4. Call `_llm.chat` with JSON-schema mode, `max_tokens: 1200`.
5. Return structured response.

### `POST /api/generate-image` (existing — small opt-in extension)

Existing call path is unchanged when called without the new fields. When the
request body contains `source: 'assistant'` AND `test_user_id`:
- After the image is generated and stored in Drive, insert a row into
  `assistant_image_gens` with computed cost.
- The image gen response shape is unchanged.

This is the only change to existing code outside the new files. The main app does
not send `source: 'assistant'`, so it sees no behaviour change.

## 8. Data model

### `assistant_prompts`

```sql
create table assistant_prompts (
  id                  uuid primary key default gen_random_uuid(),
  test_user_id        text not null,
  brand               text not null,
  task                text,
  description         text,
  provider            text,             -- 'openai' | 'gemini' | 'claude'
  model               text,             -- e.g. 'gpt-4o', 'gemini-2.5-pro'
  all_concepts        jsonb,            -- the 3 concepts returned
  picked_concept      jsonb,            -- the one she clicked
  generated_fields    jsonb,            -- same shape as existing reference rows
  image_drive_ids     text[],           -- Drive file IDs (image gen results)
  liked               boolean default false,
  input_tokens        int,              -- from API usage
  cached_input_tokens int,              -- from API usage (OpenAI; 0 for Gemini)
  output_tokens       int,              -- from API usage
  created_at          timestamptz default now()
);

create index idx_assistant_prompts_user
  on assistant_prompts(test_user_id, created_at desc);
```

### `assistant_image_gens`

```sql
create table assistant_image_gens (
  id              uuid primary key default gen_random_uuid(),
  prompt_id       uuid references assistant_prompts(id) on delete cascade,
  test_user_id    text not null,
  provider        text not null,         -- 'openai' (gpt-image-1) | 'gemini'
  model           text,                  -- 'gpt-image-1', 'imagen-3', etc.
  size            text,                  -- '1024x1024', '1536x1024', etc.
  quality         text,                  -- 'standard' | 'hd' (openai); null for gemini
  image_count     int default 1,
  drive_file_id   text,
  cost_usd        numeric(10,6),         -- computed at insert time from _pricing
  created_at      timestamptz default now()
);

create index idx_assistant_image_gens_user
  on assistant_image_gens(test_user_id, created_at desc);
```

### Access control

No row-level security at this stage. All reads/writes flow through the new API
routes, which validate the URL token first. Documented limitation: a leaked URL
exposes that tester's rows. Replace with real auth before broadening access.

## 9. Brand rules

The inline `BRAND_PALETTES` and `BRAND_SCENE_MANDATES` constants currently sitting
in [api/generate-prompt.ts](../../../api/generate-prompt.ts) get extracted to a
new shared module `api/_brand-rules.ts`. The existing route imports from there —
zero behaviour change for the main app.

The new module also adds:

```ts
BRAND_PALETTES.RocketSpin =
  'Pristine white (#F5F5F0), champagne gold (#D4B26A), glowing cyan (#00BFFF), ' +
  'sky blue. Setting almost always bright sky with massive sun-lit cumulus ' +
  'clouds during golden hour, occasionally a premium futuristic interior. ' +
  'NEVER use dark moody tones, pastel washes, muted greys, or anime/cartoon ' +
  'colour styling.';

BRAND_SCENE_MANDATES.RocketSpin =
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
  'MOOD: Premium, aspirational, optimistic, victorious, cinematic.';
```

## 10. LLM provider abstraction

`api/_llm.ts`:

```ts
type Provider = 'openai' | 'gemini' | 'claude';

interface ChatOptions {
  provider: Provider;
  model: string;
  system: string;
  user: string;
  json?: boolean;            // if true, force JSON-schema output
  jsonSchema?: object;       // schema to enforce
  maxTokens: number;
}

interface ChatResult {
  text: string;              // raw text or stringified JSON
  usage: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
  };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> { … }
```

Implementation notes:
- **OpenAI branch:** `response_format: { type: 'json_schema', json_schema: opts.jsonSchema }` when `json: true`. Uses Chat Completions endpoint. Token usage from `data.usage.prompt_tokens`, `data.usage.prompt_tokens_details.cached_tokens`, `data.usage.completion_tokens`.
- **Gemini branch:** `generationConfig.responseSchema` when `json: true`, calling `v1beta/models/<model>:generateContent`. Token usage from `data.usageMetadata.promptTokenCount`, `candidatesTokenCount`. `cached_input_tokens = 0`.
- **Claude branch:** throws `Error('Claude provider not yet wired')`. The frontend dropdown disables this option; this is a safety net only.

## 11. Pricing config

`api/_pricing.ts`:

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
    source: 'ai.google.dev/pricing'
  },
  'gemini-2.5-pro': {
    input_per_million: 1.25,
    cached_input_per_million: null,
    output_per_million: 10.00,
    last_updated: '2026-05-14',
    source: 'ai.google.dev/pricing'
  },
  'gpt-4o': {
    input_per_million: null,         // TODO fill from openai.com dashboard
    cached_input_per_million: null,
    output_per_million: null,
    last_updated: null,
    source: 'openai.com/api/pricing — TODO'
  },
  'gpt-4o-mini': {
    input_per_million: null,         // TODO
    cached_input_per_million: null,
    output_per_million: null,
    last_updated: null,
    source: 'openai.com/api/pricing — TODO'
  }
};

export interface ImagePrice {
  cost_per_image_usd: number | null;
  size: string;
  quality?: string;
  last_updated: string | null;
  source: string;
}

export const IMAGE_PRICING: ImagePrice[] = [
  // TODO fill from official docs:
  { cost_per_image_usd: null, size: '1024x1024', quality: 'standard', last_updated: null, source: 'openai.com — TODO' },
  { cost_per_image_usd: null, size: '1024x1024', quality: 'hd',       last_updated: null, source: 'openai.com — TODO' },
];

export function computeLlmCost(model: string, usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number }): number | null {
  const p = LLM_PRICING[model];
  if (!p || p.input_per_million === null || p.output_per_million === null) return null;
  const billableInput = usage.input_tokens - usage.cached_input_tokens;
  const cachedCost = (p.cached_input_per_million ?? p.input_per_million) * usage.cached_input_tokens;
  return (billableInput * p.input_per_million + cachedCost + usage.output_tokens * p.output_per_million) / 1_000_000;
}
```

**Key principle:** when a price is `null`, the tracker UI shows "price unknown for
this model — update _pricing.ts" instead of fabricating a number. Accuracy beats
appearance.

The user is expected to fill in the TODO fields from the official pricing pages
once before going live. I couldn't fetch the OpenAI and Anthropic pages
programmatically (403 / sign-in gates) during this design, so I deliberately left
them null rather than recall numbers I cannot verify.

## 12. Cost reduction strategy

1. **Cheap model for concepts step.** Concepts step defaults to Gemini 2.5 Flash
   (or gpt-4o-mini if the provider is OpenAI). Final prompt generation uses
   Gemini 2.5 Pro / gpt-4o. User can override either via the dropdown.
2. **JSON-schema output mode** on both providers. Forces clean structured output,
   no retries, no filler tokens.
3. **`max_tokens: 600`** for concepts, **`max_tokens: 1200`** for generation. Hard
   ceiling against runaway costs.
4. **OpenAI prompt caching** by ordering the system prompt with the deterministic
   prefix (brand rules + instructions) FIRST and dynamic user content LAST.
   OpenAI auto-caches prefixes ≥1024 tokens; we pad to ensure the brand rules sit
   above that threshold for repeat calls.
5. **No image regeneration on save.** Saving writes only the Drive file ID to the
   row.
6. **No Gemini context caching.** Has a daily fee that does not pay back at the
   expected call volume.

Documented "watch this" cost dimensions in case volumes grow:
- gpt-image-1 hd images are noticeably more expensive than standard.
- If she regenerates concepts repeatedly without picking, only the concepts cost
  accrues — but those are on the cheap tier by design.

## 13. UI components (frontend)

New page `src/pages/AssistantPage.tsx` with these components, all reusing existing
shadcn primitives from [src/components/ui/](../../../src/components/ui/) so the page feels familiar:

- `<ModelSelect />` — small dropdown in the header. OpenAI and Gemini active,
  Claude disabled with "(coming soon)" label.
- `<BrandSelect />` — single-option select (RocketSpin) using the existing select
  primitive. Designed so adding more brands is trivial.
- `<TaskTopicInput />` — task field + optional extra-detail field, using the
  existing input/textarea primitives.
- `<ConceptCards />` — three-card grid. Each card has title, description, and a
  `Pick` button styled like the existing primary buttons.
- `<GeneratedPromptPanel />` — wraps the existing
  [src/components/ReferencePromptDataDisplay.tsx](../../../src/components/ReferencePromptDataDisplay.tsx)-style
  accordion plus the existing image-gen button row and heart button. This is the
  largest piece of UI reuse from the main app.
- `<CostTrackerButton />` and `<CostTrackerPanel />` — top-right icon button that
  opens a slide-over with the breakdown described in Section 4B.
- `<SavedPromptsPanel />` — collapsible list of her past saved prompts (rows from
  `assistant_prompts` where `test_user_id` matches her token).

State management: React Query for server calls, plain `useState` for
chat/concept/picked state. No new global store needed.

## 14. Files to add / change

**New files:**
- `api/assistant/concepts.ts`
- `api/assistant/generate.ts`
- `api/_llm.ts`
- `api/_brand-rules.ts`
- `api/_assistant-token.ts`
- `api/_pricing.ts`
- `src/pages/AssistantPage.tsx`
- `src/components/assistant/ConceptCards.tsx`
- `src/components/assistant/CostTrackerPanel.tsx`
- `src/components/assistant/ModelSelect.tsx`
- `src/components/assistant/SavedPromptsPanel.tsx`
- `src/hooks/useAssistantSession.ts`
- `src/hooks/useCostTracker.ts`
- Supabase migration: `supabase/migrations/<timestamp>_assistant_tables.sql`

**Existing files changed:**
- [src/App.tsx](../../../src/App.tsx) — add `<Route path="/assistant/:token" element={<AssistantPage />} />`.
- [api/generate-prompt.ts](../../../api/generate-prompt.ts) — refactor to import from
  `api/_brand-rules.ts`. No behaviour change.
- [api/generate-image.ts](../../../api/generate-image.ts) — opt-in extension: if request
  body contains `source: 'assistant'` and `test_user_id`, write a row to
  `assistant_image_gens`. Default path unchanged.

**Environment variables:**
- `OPENAI_API_KEY` (exists)
- `GEMINI_API_KEY` (new)
- `VITE_ASSISTANT_TOKENS` (new, comma-separated)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (exist)

## 15. Testing plan

- Manual: open the URL with a valid token, run the full flow (task → concepts →
  pick → prompt → image gen → save → cost tracker shows the call).
- Manual: open the URL with an invalid token, confirm `<NotFound />` renders.
- Manual: confirm the main app at `/` is unchanged — generate a prompt, generate
  an image, like an image — no new rows in `assistant_*` tables.
- Manual: confirm two consecutive concepts calls show cached input tokens > 0 on
  the second call (OpenAI prompt caching working).
- Manual: confirm Gemini calls show `cached_input_tokens: 0` and a non-null cost.
- Manual: confirm an OpenAI call shows "price unknown" in the tracker until
  `_pricing.ts` is filled in.

## 16. Open items for future iteration

- Real authentication (Supabase Auth magic links) before opening to more testers.
- Concept regeneration without losing the input form.
- Editable structured fields after pick (currently v1 generates and submits).
- Adding the remaining 9 brands to this section once RocketSpin is validated.
- Wire Claude provider when the budget supports it.
- Move pricing config to a tiny scheduled job that scrapes the official pages
  weekly (currently manual).

## 17. Risks

- **OpenAI/Claude prices not yet filled in:** Tracker shows "price unknown" until
  the user pastes values. Mitigated by clear UI labelling rather than guessed
  numbers.
- **URL token gate is weak:** documented. Must replace before broadening access.
- **Refactor of `BRAND_PALETTES` to a shared module touches the existing
  generate-prompt route.** Mitigated by keeping the data identical — the refactor
  is import-path only.
- **Image gen change is opt-in via a request field.** Existing main-app callers do
  not send it, so they see no behaviour change. Verify with a test of the main
  app's image gen path.
