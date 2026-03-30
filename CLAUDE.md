# CLAUDE.md — Multi Brand Prompt Generator

> Mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md.

## Project Overview

This is a **Multi Brand Prompt Generator** web app. Users select a brand, pick a reference prompt template, adjust settings, and generate a customized AI image prompt — which can then be sent to ChatGPT or Gemini for image generation.

- **Frontend:** Next.js (React) deployed on **Vercel**
- **Backend logic:** **n8n** (webhook-based — handles ALL business logic)
- **Database:** **Airtable** (one table: "Web Image Analysis")
- **AI:** **OpenAI/GPT** (called from n8n for prompt generation + dissection)
- **Repo:** github.com/Optinet-Solutions-Automation/Prompt-Generator
- **Live URL:** prompt-generator-eight-umber.vercel.app

### Why This Stack (Don't Change It)
- **Airtable** = visual database, editable like a spreadsheet. No SQL.
- **n8n** = visual automation. Drag-and-drop logic, no backend coding.
- **Next.js on Vercel** = the frontend. AI assistants handle code changes.
- **When to reconsider:** Only if 1,000+ records or need user auth → evaluate Supabase then.

---

## How the App Works (Current Flow)

```
1. User selects a BRAND (SpinJo, Roosterbet, FortunePlay, LuckyVibe, SpinsUp)
     ↓
2. User selects a REFERENCE prompt from dropdown
     ⚠️ THIS DROPDOWN IS HARDCODED IN THE CODE — needs to be dynamic
     ↓
3. App fetches that reference prompt's dissected data FROM AIRTABLE:
   (Format Layout, Primary Object, Subject, Lighting, Mood, Background, etc.)
   Shown in the expandable "Reference Prompt Data" section
     ↓
4. User adjusts settings:
   - Subject Position (Left / Center / Right slider)
   - Aspect Ratio (Portrait / Square / Landscape)
   - Theme (text input)
   - Description (text input)
     ↓
5. User clicks "Regenerate Prompt"
   → Calls n8n webhook
   → n8n combines Airtable reference data + user settings
   → n8n calls OpenAI/GPT to generate a customized prompt
   → Returns generated prompt to frontend
     ↓
6. Generated prompt shown with action buttons (copy, refresh, save, list, heart)
     ↓
7. User clicks "ChatGPT", "Gemini", or "Generate Both" to create images
```

---

## The Only Airtable Table That Matters

### Table: "Web Image Analysis"

This is the **only table** the prompt generator app uses. Ignore all other tables in the base.

Base ID: `appp9iLlSQTlnfytA`

| Field Name        | Type            | Example                                           |
|-------------------|-----------------|---------------------------------------------------|
| image_name        | Single Line     | sj_thursday-boost_1328x784.webp                    |
| prompt_name       | Single Line     | "Stormcraft Arrival", "Neon Astronaut"             |
| brand_name        | Single Line     | SpinJo, Roosterbet, FortunePlay, LuckyVibe, SpinsUp |
| format_layout     | Long Text       | "Wide cinematic frame (~16:9)..."                  |
| primary_object    | Long Text       | "A massive circular wheel-like device..."          |
| subject           | Long Text       | "A single adult human in a futuristic spacesuit..."|
| lighting          | Long Text       | "Primary light is the machine's neon-purple rim..."|
| mood              | Long Text       | "Futuristic and mysterious..."                     |
| Background        | Long Text       | "Dark spacecraft or sci-fi industrial interior..." |
| positive_prompt   | Long Text       | Full positive prompt for image generation           |
| negative_prompt   | Long Text       | What to exclude (no text, logos, watermarks, etc.)  |

**109 records currently.** New prompts added via the app will also go to this same table.

---

## Architecture

```
┌──────────────────────────────────────┐
│       Next.js App (Vercel)           │
│            DUMB FRONTEND             │
│                                      │
│  Brand Dropdown → Reference Dropdown │
│         ↓                            │
│  Reference Prompt Data (from Airtable)│
│         ↓                            │
│  Settings (position, ratio, theme)   │
│         ↓                            │
│  "Regenerate Prompt" button          │
│         ↓                            │
│  Generated Prompt + Image Gen buttons│
│                                      │
│  🆕 Add / Edit / Delete buttons     │
└──────────────┬───────────────────────┘
               │ webhook calls
               ▼
       ┌───────────────┐
       │     n8n       │
       │  SMART BRAIN  │
       │               │
       │ • Fetch data  │
       │ • Generate    │───────► Airtable
       │   prompts     │◄──────  "Web Image Analysis"
       │ • CRUD ops    │         (109 records)
       │ • Call GPT    │
       └───────────────┘
```

### Golden Rules
1. **Frontend is DUMB** — Display data + send actions to n8n. No logic.
2. **n8n is the BRAIN** — All logic: CRUD, GPT calls, Airtable reads/writes.
3. **Airtable is the MEMORY** — "Web Image Analysis" table is the single source of truth.
4. **No hardcoded prompts** — Reference dropdown must load from Airtable.

---

## What We're Building (The Goal)

### Problem
The Reference dropdown is hardcoded. To add/change/remove prompts, someone must edit code and redeploy. The user wants to manage prompts themselves.

### Solution
Make the dropdown dynamic + add CRUD buttons. Everything reads/writes to the **same "Web Image Analysis" table**.

### What Changes vs What Stays

**Stays exactly the same (don't touch):**
- Brand dropdown behavior
- Reference Prompt Data display
- Settings (position, ratio, theme, description)
- "Regenerate Prompt" → n8n → GPT flow
- Generated prompt display + action buttons
- ChatGPT / Gemini image generation buttons
- Overall UI design and layout
- All existing n8n workflows
- All Airtable data

**Changes (2 things only):**
1. Reference dropdown → loads from Airtable instead of hardcoded list
2. New Add/Edit/Delete buttons → manage prompts via n8n → Airtable

---

## n8n Webhooks

### Already Exist (don't touch):
| Purpose                        | Status |
|--------------------------------|--------|
| Fetch reference prompt data    | ✅ Working — used when reference is selected |
| Generate/regenerate prompt     | ✅ Working — called by "Regenerate Prompt" button |

### Need to Create (new):
| Purpose                          | Method | Env Var                             |
|----------------------------------|--------|-------------------------------------|
| List prompts for dropdown        | GET    | `NEXT_PUBLIC_N8N_LIST_PROMPTS`      |
| Save new prompt (with GPT dissect)| POST  | `NEXT_PUBLIC_N8N_SAVE_PROMPT`       |
| Update existing prompt           | PUT    | `NEXT_PUBLIC_N8N_UPDATE_PROMPT`     |
| Delete prompt                    | DELETE | `NEXT_PUBLIC_N8N_DELETE_PROMPT`     |

---

## n8n Workflow Blueprints (Build These in n8n)

### 1. LIST Prompts (for dynamic dropdown)
```
[Webhook Trigger (GET)]
  → [Airtable: List Records] from "Web Image Analysis"
      Return: prompt_name, brand_name, record ID
      (Just enough for the dropdown — not all fields)
  → [Respond to Webhook] with JSON array
```
Example response:
```json
[
  { "id": "rec123", "prompt_name": "Stormcraft Arrival", "brand_name": "SpinJo" },
  { "id": "rec456", "prompt_name": "Neon Astronaut", "brand_name": "SpinJo" },
  { "id": "rec789", "prompt_name": "Golden Rooster", "brand_name": "Roosterbet" }
]
```

### 2. SAVE New Prompt (with AI dissection)
```
[Webhook Trigger (POST)]
  → Receive: { prompt: "raw prompt text", brand: "SpinJo", promptName: "My Prompt" }
  → [OpenAI Node]
      System: "Dissect this image prompt into JSON fields:
        prompt_name, brand_name, format_layout, primary_object,
        subject, lighting, mood, Background, positive_prompt,
        negative_prompt. Return ONLY valid JSON."
      User: the raw prompt text
  → [Parse JSON]
  → [Airtable: Create Record] in "Web Image Analysis"
  → [Respond to Webhook] with new record
```

### 3. UPDATE Prompt
```
[Webhook Trigger (PUT)]
  → Receive: { recordId: "rec...", fields: { mood: "energetic", ... } }
  → [Airtable: Update Record] in "Web Image Analysis"
  → [Respond to Webhook] with updated record
```

### 4. DELETE Prompt
```
[Webhook Trigger (DELETE)]
  → Receive: { recordId: "rec..." }
  → [Airtable: Delete Record] from "Web Image Analysis"
  → [Respond to Webhook] with { success: true }
```

---

## Priority Tasks

### 🔴 P0 — Make Reference Dropdown Dynamic
1. Build the LIST n8n workflow
2. Replace hardcoded dropdown with fetch from n8n
3. Filter by selected brand
4. Add loading/error states

### 🔴 P0 — Add Prompt CRUD
1. Build SAVE, UPDATE, DELETE n8n workflows
2. Add "Add New Prompt" button + form
3. Add "Edit" button + form on each prompt
4. Add "Delete" button + confirmation on each prompt

### 🟡 P1 — Polish
- Search/filter in management view
- Loading spinners everywhere
- Mobile-friendly
- Success/error toast messages

---

## Brands in the System
SpinJo, Roosterbet, FortunePlay, LuckyVibe, SpinsUp

---

## Token-Saving Rules

### Before reading files
Run `node scripts/find-relevant.js "<keyword>" --show-lines` first.
This finds only the files that contain the relevant code — read those instead of the whole codebase.

Examples:
- `node scripts/find-relevant.js "ImageModal"` → find modal-related files
- `node scripts/find-relevant.js "supabase" --type ts` → find all TS files touching Supabase
- `node scripts/find-relevant.js "generate variations" --show-lines` → see exact line matches

### What .claudeignore blocks
`node_modules/`, `dist/`, lock files, screenshots — Claude will never read these automatically.

---

## Coding Conventions

### Screenshot-Driven Development (REQUIRED)
- **Always take a screenshot before and after every UI fix.** Use the `seo-visual` agent or Playwright to capture `http://localhost:5173`.
- **Self-analyze the screenshot** to verify the fix looks correct and nothing is broken.
- If the fix looks wrong in the screenshot, iterate until it looks right — do not rely on the user to report visual problems.
- This applies to ALL UI changes, not just bug fixes.

### Do
- Keep frontend dumb — display + send to n8n only
- Show loading and error states for every fetch
- Use `NEXT_PUBLIC_N8N_*` env vars for webhook URLs
- Write clear comments — developer is a beginner with no coding background
- Explain decisions in plain English
- Small changes, one at a time, test between each
- Preserve ALL existing functionality
- **Always auto-commit and push every code change** (see feedback_autocommit.md)

### Don't
- **Don't hardcode prompt data**
- **Don't call Airtable from the frontend** — everything through n8n
- **Don't put logic in Next.js** — n8n owns all logic
- **Don't break existing features**
- **Don't touch other Airtable tables** — only "Web Image Analysis"
- **Don't modify existing n8n workflows** — only create new ones
- Don't assume advanced knowledge — over-explain everything

---

## Known Constraints
- Airtable rate limit: 5 requests/sec
- Airtable free plan: 1,000 records (at 109 now — plenty of room)
- Vercel hobby: 10-second timeout
- Developer is a beginner — always explain, always keep it simple

## Image Generation Tech Stack
- **ChatGPT/Gemini** image generation: called via n8n webhooks
- **Generate Variations**: `api/generate-variations.ts` — uses **OpenAI gpt-image-1 image edit API** directly with `OPENAI_API_KEY`. Does NOT use GCP/Cloud Run. Do not revert to GCP auth.
- **Edit Image**: `api/edit-image.ts` — uses GCP Cloud Run (requires `GCP_WORKLOAD_PROVIDER`, `GCP_SERVICE_ACCOUNT`, Vercel OIDC)
- Local dev URL: `http://localhost:5173` (Vite)

---

## Summary

**App:** Multi Brand Prompt Generator
**Only table:** "Web Image Analysis" in Airtable
**Problem:** Reference dropdown is hardcoded, can't manage prompts from the app
**Solution:** Dynamic dropdown + Add/Edit/Delete via n8n webhooks
**Rule:** Don't break anything that already works