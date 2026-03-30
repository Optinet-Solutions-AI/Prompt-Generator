# Hooks — Automated Actions Triggered by Claude's Actions

## What They Are
Hooks are shell commands that run **automatically** when Claude does something — like editing a file, or starting/finishing a task. Think of them like "triggers" in n8n, but for Claude Code itself.

## Where They Live
Configured in Claude Code settings (`.claude/settings.json` or the global settings).

## Hook Types
| Hook | When It Fires |
|------|--------------|
| `PreToolUse` | Before Claude uses a tool (edit, bash, read, etc.) |
| `PostToolUse` | After Claude uses a tool |
| `Notification` | When Claude sends you a notification |
| `Stop` | When Claude finishes its turn |

## Common Uses
- **Auto-format** code after every edit (`prettier`, `eslint --fix`)
- **Auto-commit** after every file change (`git add && git commit`)
- **Run tests** after editing test files
- **Send a notification** when a long task finishes

## Example: Auto-commit Hook
This is configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "cd /project && git add -A && git commit -m 'auto: Claude edit' || true"
          }
        ]
      }
    ]
  }
}
```

**What it does:** Every time Claude edits or creates a file, this automatically runs `git add` and `git commit`.

## Example: Auto-format Hook
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "cd /project && npx prettier --write $CLAUDE_TOOL_INPUT_FILE 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

## This Project's Hook Setup
This project uses the **CLAUDE.md rule** approach for auto-commit (Claude reads the rule and does it manually). A proper hook could automate this — see `04-PROJECT-SETTINGS.md` for the implementation.

## Important Notes
- Hooks run as shell commands — be careful what you put in them
- Use `|| true` at the end so a failing hook doesn't block Claude
- You can see hook output in the Claude Code terminal
- Hooks are NOT shown to Claude — they run silently in the background

---
**Bottom line:** Hooks = automation for Claude's actions. Set them up once, they run forever.
