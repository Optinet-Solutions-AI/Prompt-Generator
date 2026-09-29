# AI Prompt Generator

On-brand banners, images and UGC videos for every brand — built by Optinet Solutions.

**Live:** https://prompt-generator-virid-delta.vercel.app

## What it does

- **Custom Prompt / Sports Banner** — pick a brand and a reference, generate an AI image prompt, then render it with ChatGPT or Gemini. Edit and make variations of any image.
- **Video** — UGC-style videos through Higgsfield (team account), with the brand's real logo and an end card stamped on.
- **Libraries** — every person's images and videos are saved to **their own Google Drive** (`My Drive / Prompt Generator`). Libraries can be shared with colleagues; work made before accounts lives in the **Team archive**.
- **Email Content Checker** — build and check branded emails.
- **Usage** — per-person cost tracking: videos in Higgsfield credits, images in US$ (ChatGPT vs Gemini, generate / edit / variations). Admins see a team summary with CSV export.

## Access

Sign in with Google. `@optinetsolutions.com` accounts are approved automatically; anyone else waits until an admin sets their row in Supabase → `profiles` → `status` to `approved` (or they are listed in `AUTO_APPROVE_EMAILS`).

## Stack

- Vite + React + TypeScript + Tailwind + shadcn/ui, hosted on **Vercel**
- Vercel API routes in `api/` (no separate backend)
- **Supabase** — reference prompts, accounts, favorites, sharing, usage
- **Google Drive** — image and video storage (per user)
- **OpenAI** (gpt-image) and **Google Gemini** — images; **Higgsfield** (MCP) — videos

## Run locally

```sh
npm install
npm run dev        # UI on http://localhost:8080
```

`npm run dev` serves the UI only; API routes need `vercel dev --listen 3939` (vite forwards `/api` there). Settings live in `.env.local` (never committed).

```sh
npm test           # unit tests (vitest)
npm run build      # production build
```

## Database changes

SQL for each feature is in `supabase/migrations/` — run it in Supabase → SQL Editor.
