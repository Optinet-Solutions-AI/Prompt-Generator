# Subagents — Claude Spawning Specialized Helpers

## What They Are
Subagents are like "Claude spawning a helper Claude" to do a specific task in parallel or with specialized skills. Claude Code has several built-in subagents, and you can see them being used in the terminal output.

## Built-in Subagents

### `Explore` (Fast Codebase Search)
Used for quickly finding files and answering questions about the codebase.
- Best for: "Where is the ImageModal component?", "How does the webhook get called?"
- Faster than the general-purpose agent for search tasks

### `Plan` (Architecture & Strategy)
Used when Claude needs to plan a complex implementation before doing it.
- Best for: "How should I restructure this component?", "What's the best approach for X?"
- Returns a step-by-step plan before any code is written

### `seo-visual` (Screenshots & Visual Testing)
Used for taking screenshots of web pages and analyzing them visually.
- Best for: Checking if a UI change looks correct
- Can take before/after screenshots
- Used by the "Screenshot-Driven Development" workflow

### `seo-schema` (Structured Data)
Specialized for generating Schema.org JSON-LD markup.

### `seo-sitemap` (XML Sitemaps)
Specialized for creating and validating sitemaps.

### General Purpose
The default agent — used for complex multi-step research tasks.

## How Claude Uses Them
You don't have to do anything — Claude decides when to use a subagent. But you can hint at it:

- "Take a screenshot and check if X looks right" → triggers `seo-visual`
- "Find all files related to X" → triggers `Explore`
- "Plan how to implement X before doing it" → triggers `Plan`

## How This Project Benefits
For this project, subagents are most useful for:

1. **Screenshot verification** — after any UI change, `seo-visual` can take a before/after screenshot
2. **Codebase exploration** — `Explore` helps find where specific code lives before editing
3. **Planning** — `Plan` can map out how to implement a new feature safely

## Custom Agents
You can create your own agents for your project by adding them to `.claude/agents/`. See `04-PROJECT-SETTINGS.md` for the folder structure.

Example custom agent for this project:
```markdown
# .claude/agents/n8n-checker.md
---
name: n8n-checker
description: Check if an n8n webhook URL is configured and responding
---
1. Check .env.local for the webhook URL
2. Make a test GET request to the URL
3. Report if it's working or what error occurred
```

---
**Bottom line:** Subagents = specialists. Claude uses them automatically for screenshots, search, and planning. You benefit from them without doing anything extra.
