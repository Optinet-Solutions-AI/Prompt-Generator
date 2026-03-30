# Project Settings — .claude/settings.json

## What It Is
A JSON config file that customizes Claude Code's behavior for your specific project. Lives inside a `.claude/` folder at your project root.

## File Location
```
your-project/
├── .claude/
│   ├── settings.json     ← project-level settings
│   └── agents/           ← custom agent definitions (optional)
├── CLAUDE.md
├── src/
...
```

## Global vs Project Settings
- **Global:** `C:\Users\User\.claude\settings.json` — applies everywhere
- **Project:** `your-project/.claude/settings.json` — overrides global for this project

## What You Can Configure

### 1. Allowed/Denied Tools
Control which tools Claude can use without asking permission:
```json
{
  "permissions": {
    "allow": ["Bash(git *)", "Bash(npm run *)", "Edit", "Read"],
    "deny": ["Bash(rm -rf *)"]
  }
}
```

### 2. Hooks (see 02-HOOKS.md for details)
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "..." }]
      }
    ]
  }
}
```

### 3. Environment Variables
Pass env vars to Claude's bash sessions:
```json
{
  "env": {
    "NODE_ENV": "development"
  }
}
```

## This Project's Current Setup
The `.claude/` folder doesn't exist yet in this project. The auto-commit behavior is handled via the CLAUDE.md rule instead.

To create project settings, run in terminal:
```bash
mkdir .claude
# Then create .claude/settings.json with your config
```

## Useful Permission Examples
```json
{
  "permissions": {
    "allow": [
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git push)",
      "Bash(npm run dev *)",
      "Bash(node scripts/*)"
    ]
  }
}
```
This pre-approves git and npm commands so Claude doesn't ask every time.

---
**Bottom line:** `.claude/settings.json` = fine-grained control over Claude's permissions and automations for your project.
