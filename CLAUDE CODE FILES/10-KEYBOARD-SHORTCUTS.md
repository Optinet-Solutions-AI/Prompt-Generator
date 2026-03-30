# Keyboard Shortcuts & Tips — Working Faster in Claude Code

## In the Terminal (CLI Mode)

### Navigation
| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Scroll through message history |
| `Ctrl+C` | Cancel current response (stop Claude mid-sentence) |
| `Ctrl+L` | Clear the terminal screen (doesn't clear conversation) |

### Sending Messages
| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line without sending (for multi-line messages) |
| `Escape` | Cancel current input |

### Tool Approvals
| Shortcut | Action |
|----------|--------|
| `Y` + `Enter` | Yes, allow this tool call |
| `N` + `Enter` | No, deny this tool call |
| `A` + `Enter` | Allow ALL tool calls without asking (use carefully!) |

## In VS Code Extension

### Opening Claude Code
| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Open command palette, search "Claude" |
| Click Claude icon in sidebar | Open Claude panel |

### Working with Code
| Shortcut | Action |
|----------|--------|
| Select code, then ask | Claude sees your selection as context |
| Right-click → Claude | Various code actions (explain, fix, test) |

## Smart Workflow Tips

### 1. Multi-line Questions
Press `Shift+Enter` to write a longer question across multiple lines before sending:
```
I need to fix the variations feature.
The problem is that when I generate Strong variations,
the Subtle ones disappear.
Can you find the bug?
```

### 2. Reference Files in Messages
Just mention the filename and Claude will find and read it:
- "Fix the bug in `ImageModal.tsx`"
- "Update the webhook call in `usePromptGenerator.ts`"

### 3. Cancel and Redirect
If Claude starts doing the wrong thing — hit `Ctrl+C` to stop it immediately. Then tell it what you actually wanted.

### 4. Permission Modes
When Claude asks permission for a tool:
- **Yes once**: Allow just this one time
- **Yes, don't ask again for this session**: Allow all similar calls
- **No**: Block this call, Claude will try another approach

### 5. Running in Background
For long tasks, Claude can start a process in the background (like `npm run dev`) and continue working. The task runs simultaneously.

## Useful CLI Flags
When starting Claude Code from terminal:

```bash
# Start with a specific task
claude "fix the variations bug in ImageModal.tsx"

# Open a specific file for context
claude --add src/components/ImageModal.tsx

# Continue last conversation
claude --continue

# Run without interactive mode (for scripts)
claude --no-interactive "run npm build and report any errors"
```

---
**Bottom line:** `Ctrl+C` to stop, `Shift+Enter` for multi-line, `Y` to approve tools. These three alone will save you a lot of time.
