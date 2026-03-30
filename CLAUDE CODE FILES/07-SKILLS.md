# Skills — Custom Slash Commands You Create

## What They Are
Skills are custom commands you create once and can reuse in any conversation. They tell Claude exactly how to do a specific task — step by step, in your preferred way.

## How They Work
1. You write a `SKILL.md` file describing what Claude should do
2. Save it in `C:\Users\User\.claude\skills\your-skill-name\SKILL.md`
3. Now you can type `/your-skill-name` in any conversation
4. Claude reads the skill file and follows those exact instructions

## Example: A "Deploy Check" Skill
`C:\Users\User\.claude\skills\deploy-check\SKILL.md`:
```markdown
---
name: deploy-check
description: Check if the project is ready to deploy. Use when user says "ready to deploy", "check before deploy", or similar.
---

Before deploying, check the following:

1. Run `npm run build` and confirm it succeeds
2. Check that all environment variables are set in Vercel
3. Run `git status` and confirm no uncommitted changes
4. Check the last 3 commits for anything risky
5. Report findings as a checklist
```

Now typing `/deploy-check` runs all those steps automatically.

## Example: A "Screenshot Check" Skill
```markdown
---
name: screenshot-check
description: Take a screenshot of the app and check for visual issues.
---

1. Check if dev server is running on localhost:5173
2. If not, run `npm run dev` in background
3. Wait 3 seconds for server to start
4. Use the seo-visual agent to take a screenshot of the homepage
5. Describe any visual issues you see
6. Compare to what the user described as expected
```

## Where Skills Are Stored
```
C:\Users\User\.claude\skills\
├── deploy-check\
│   └── SKILL.md
├── screenshot-check\
│   └── SKILL.md
└── code-review\
    └── SKILL.md
```

## Skills vs CLAUDE.md Rules
| | Skills | CLAUDE.md Rules |
|--|--------|----------------|
| **How to trigger** | Type `/skill-name` | Always active |
| **When to use** | On-demand tasks | Always-on behavior |
| **Example** | `/deploy-check` | "always auto-commit" |

## Built-in Skills Already Available
Claude Code comes with some built-in subagents (specialized agents for specific tasks):
- `seo-visual` — takes screenshots and analyzes them
- `seo-schema` — generates Schema.org structured data
- `Explore` — fast codebase exploration
- `Plan` — creates implementation plans

These aren't slash commands but Claude can use them automatically when needed.

---
**Bottom line:** Skills = reusable playbooks for common tasks. Write once, use forever.
