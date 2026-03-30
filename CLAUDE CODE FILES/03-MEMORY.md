# Memory System — Claude Remembers Across Conversations

## What It Is
Claude Code has a built-in memory system that saves information across conversations. Even after you start a new chat, Claude can remember things about you and your project.

## Where Memory Is Stored
- **Location:** `C:\Users\User\.claude\projects\c--Users-User-Prompt-Generator\memory\`
- **Index file:** `MEMORY.md` — lists all saved memories
- **Individual files:** One `.md` file per memory topic

## Types of Memory

### 1. User Memory
Information about YOU — your role, experience level, preferences.

Example saved for this project:
> "Developer is a beginner with no coding background. Prefers clear explanations in plain English."

### 2. Feedback Memory
How Claude should behave — corrections and confirmations you've given.

Example:
> "Always auto-commit after every file edit. User wants changes pushed to GitHub without being asked."

### 3. Project Memory
Context about ongoing work — goals, decisions, constraints.

Example:
> "Reference dropdown is currently hardcoded and needs to be made dynamic."

### 4. Reference Memory
Where to find things in external systems.

Example:
> "Airtable base ID: appp9iLlSQTlnfytA, table: Web Image Analysis"

## How to Use It
- **Save something:** Just tell Claude "remember that..." or "note that..."
- **Check memories:** Claude reads them automatically at session start
- **Update a memory:** Tell Claude "update your memory about X"
- **Delete a memory:** Tell Claude "forget that X"

## What Gets Saved Automatically
Claude saves things automatically when:
- You correct its behavior ("no, don't do that")
- You confirm something worked ("yes, exactly like that")
- You share important context about your role or project

## What Does NOT Get Saved
- Code patterns (just read the files)
- Git history (use `git log`)
- Temporary in-session notes
- Things already in CLAUDE.md

---
**Bottom line:** Memory = Claude's long-term notes about you and your project. The more context it has, the less you repeat yourself.
