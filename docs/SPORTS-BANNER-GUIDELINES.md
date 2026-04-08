# Sports Banner Generator — Project Guidelines & Structure

**Purpose:** Quick-reference doc for AI assistants and developers working on the sportsbook banner features. Reduces token usage by centralizing what exists and where.

---

## Current Architecture (Sports Banner)

```
Sports Banner Wizard (5 steps)
├── Step 1: Sport Selection       → SportSelect.tsx
├── Step 2: Player Config         → SceneSelect.tsx
├── Step 3: Subject Placement     → PositionGrid.tsx
├── Step 4: Background & Lighting → BackgroundSelect.tsx
├── Step 5: Size & Occasion       → BannerSizeSelect.tsx
│
├── Intelligence Engine           → prompt-intelligence.ts (165+ actions, 20+ countries)
├── Scene Presets                 → scene-presets.ts (9 sports, 30+ roles, lighting)
├── State Management              → useSportsBannerWizard.ts
└── Brand Colors                  → brand-colors.ts (9 brands, color-lock)
```

## Key File Paths

| Purpose | Path |
|---|---|
| Main page (tab switching) | `src/pages/Index.tsx` |
| Sports wizard entry | `src/components/SportsBannerWizard.tsx` |
| Wizard steps | `src/components/sports-wizard/*.tsx` |
| Prompt building logic | `src/components/sports-wizard/prompt-intelligence.ts` |
| Sport configs & presets | `src/components/sports-wizard/scene-presets.ts` |
| Wizard state hook | `src/hooks/useSportsBannerWizard.ts` |
| Brand color definitions | `src/lib/brand-colors.ts` |
| Type definitions | `src/types/prompt.ts` |
| Image generation APIs | `api/generate-image.ts`, `api/generate-variations.ts` |
| Image modal (preview) | `src/components/ImageModal.tsx` |
| n8n prompt generation | `api/generate-prompt.ts` |

## Supported Sports
Soccer, Basketball, Tennis, Cricket, Rugby, Boxing, Ice Hockey, Esports, Horse Racing

## Supported Brands (with sports)
FortunePlay, PlayMojo, SpinJo, Roosterbet, SpinsUp, LuckyVibe
(Lucky7even, NovaDreams, Rollero = casino only)

## Image Generation Providers

| Provider | Route | Max Resolution | Auth |
|---|---|---|---|
| OpenAI gpt-image-1 | `api/generate-variations.ts` | 1024px | API key |
| Gemini/Vertex AI | `api/generate-variations-imagen.ts` | 1024px | GCP SA |
| Cloud Run (highest quality) | `api/generate-image.ts` | 4K | Vercel OIDC |

## Golden Rules for Sports Banner Work

1. **Don't rebuild what exists** — check this doc + existing components first
2. **Frontend is dumb** — display + send to n8n. No business logic in React
3. **Brand colors are locked** — use `brand-colors.ts` color-lock system
4. **All data through n8n** — never call Airtable directly from frontend
5. **Auto-commit every change** — push to GitHub after each edit
6. **Screenshot before/after** — verify UI changes visually
7. **Small changes, test between each** — don't batch large changes

## Environment Variables (Sports-Related)

All stored in `.env.local`. Key ones:
- `NEXT_PUBLIC_N8N_*` — n8n webhook URLs (13 total)
- `OPENAI_API_KEY` — for direct OpenAI image generation
- `GCP_WORKLOAD_PROVIDER` / `GCP_SERVICE_ACCOUNT` — Cloud Run auth
- `NEXT_PUBLIC_SUPABASE_*` — image storage

## Constraints
- Airtable: 5 req/sec, 1000 record limit (at ~109)
- Vercel: 10-second serverless timeout
- AI text rendering: unreliable for non-Latin scripts (Arabic, etc.)
- localStorage: ~5-10MB for image cache
