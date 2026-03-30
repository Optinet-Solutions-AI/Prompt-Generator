# Claude Code Guide — Index

A complete reference for using Claude Code effectively on this project (and any project).

---

## Files in This Folder

| File | Topic | Read When... |
|------|-------|-------------|
| [01-CLAUDE-MD.md](./01-CLAUDE-MD.md) | Project instructions file | You want to update how Claude behaves by default |
| [02-HOOKS.md](./02-HOOKS.md) | Automated actions | You want Claude to auto-format or auto-commit without asking |
| [03-MEMORY.md](./03-MEMORY.md) | Cross-session memory | You want Claude to remember things between conversations |
| [04-PROJECT-SETTINGS.md](./04-PROJECT-SETTINGS.md) | `.claude/settings.json` | You want to configure permissions or hooks for this project |
| [05-TOKEN-SAVING.md](./05-TOKEN-SAVING.md) | `.claudeignore` + search script | You want to reduce token usage and speed up conversations |
| [06-SLASH-COMMANDS.md](./06-SLASH-COMMANDS.md) | `/clear`, `/compact`, etc. | You want to know what commands you can type |
| [07-SKILLS.md](./07-SKILLS.md) | Custom reusable commands | You want to create your own slash commands |
| [08-MCP-SERVERS.md](./08-MCP-SERVERS.md) | External tool plugins | You want Claude to take screenshots or query Airtable directly |
| [09-SUBAGENTS.md](./09-SUBAGENTS.md) | Specialized helper agents | You want to understand how Claude uses specialized helpers |
| [10-KEYBOARD-SHORTCUTS.md](./10-KEYBOARD-SHORTCUTS.md) | Shortcuts & tips | You want to work faster in the terminal or VS Code |
| [11-BEST-PRACTICES.md](./11-BEST-PRACTICES.md) | How to get the best results | You want fewer mistakes and better quality code |

---

## Quick Reference: The 5 Most Important Things

### 1. CLAUDE.md = Claude's memory of your project
Every project should have one. Update it when you make major decisions. The better it is, the less you repeat yourself.

### 2. `/clear` = Start fresh
Use it when switching tasks. Fresh conversations = better performance. **Don't be afraid to use it.**

### 3. `find-relevant.js` = Token saver
Before asking Claude to fix something, run:
```bash
node scripts/find-relevant.js "keyword" --show-lines
```
This finds the exact files to read instead of scanning everything.

### 4. Be specific
Tell Claude exactly WHAT to fix, WHERE it is, and WHAT NOT to change. Vague requests lead to broken features.

### 5. One task at a time
Fix one thing, confirm it works, then move to the next. Don't chain 5 requests in one message.

---

## Features Already Set Up in This Project

| Feature | File | Status |
|---------|------|--------|
| Project instructions | `CLAUDE.md` | ✅ Done |
| Token-saving ignore | `.claudeignore` | ✅ Done |
| Codebase search script | `scripts/find-relevant.js` | ✅ Done |
| Auto-commit rule | `CLAUDE.md` section 1 | ✅ Done |
| State persistence pattern | `Index.tsx`, `ImageModal.tsx` | ✅ Done |
| Screenshot-driven dev | `CLAUDE.md` section 2 | ✅ Documented |
| Project settings file | `.claude/settings.json` | ⬜ Not created yet |
| Auto-commit hook | `.claude/settings.json` | ⬜ Not created yet |

---
*This guide lives in `CLAUDE CODE FILES/` in the project root.*
