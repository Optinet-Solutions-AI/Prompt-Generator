# CLAUDE.md — Project Instructions File

## What It Is
`CLAUDE.md` is a special file that Claude Code reads automatically at the start of every conversation. Think of it as a "briefing document" — it tells Claude everything it needs to know about your project without you having to explain it every time.

## Where It Lives
- **Project-level:** `CLAUDE.md` in your project root (this project has one)
- **Global:** `C:\Users\User\.claude\CLAUDE.md` — applies to ALL your projects
- **Subfolder:** Any folder can have its own `CLAUDE.md` for extra rules in that area

## Loading Order (Who Wins)
```
Global CLAUDE.md
  → Project CLAUDE.md  (overrides global)
    → Subfolder CLAUDE.md  (overrides project)
```

## What to Put In It
- Project overview (what it does, tech stack, live URL)
- Step-by-step user flow
- Architecture diagram
- Key files and folders
- Environment variables
- Rules: what Claude should NEVER change
- Known constraints (timeouts, rate limits, etc.)
- Coding conventions (do's and don'ts)

## Tips
- Be specific — vague instructions are ignored
- Keep it under ~500 lines so it loads fast
- Use the `C:\Users\User\CLAUDE-TEMPLATE.md` file as a starter for new projects
- Put project-specific rules here, not in chat

## Example (What This Project Has)
This project's `CLAUDE.md` tells Claude:
- Only use n8n webhooks (never call Airtable directly from frontend)
- Never break the existing "Regenerate Prompt" flow
- The developer is a beginner — over-explain everything
- There are 5 brands: SpinJo, Roosterbet, FortunePlay, LuckyVibe, SpinsUp

---
**Bottom line:** CLAUDE.md = Claude's memory of your project. The better it is, the less you have to repeat yourself.
