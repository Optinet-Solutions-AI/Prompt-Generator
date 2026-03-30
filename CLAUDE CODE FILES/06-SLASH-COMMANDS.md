# Slash Commands — Quick Actions in Claude Code

## What They Are
Type these commands directly in the Claude Code chat to trigger special actions. They're shortcuts — no need to explain what you want.

## The Most Useful Commands

### Conversation Management
| Command | What It Does |
|---------|-------------|
| `/clear` | Start a completely fresh conversation (clears all context) |
| `/compact` | Summarize old parts of the conversation to save tokens while keeping context |

### Working with Claude
| Command | What It Does |
|---------|-------------|
| `/help` | Show all available commands |
| `/cost` | Show how many tokens the current conversation has used |
| `/doctor` | Check if Claude Code is set up correctly |

### Code & Git
| Command | What It Does |
|---------|-------------|
| `/commit` | Ask Claude to commit all staged changes with a good message |
| `/review` | Ask Claude to review recent changes |

### Settings & Config
| Command | What It Does |
|---------|-------------|
| `/config` | View or edit Claude Code settings |
| `/permissions` | View what tools Claude is allowed to use |

## When to Use Each

### `/clear` — Use When:
- Switching to a completely different task
- The conversation has gotten very long
- You want Claude to "forget" the current context and start fresh
- Example: You just fixed a bug. Now you want to build a new feature. Start fresh.

### `/compact` — Use When:
- The conversation is long but you still need the recent context
- Claude is starting to forget what you talked about earlier
- Example: Long debugging session — compact to keep the last few exchanges clear

### `/cost` — Use When:
- You're curious how many tokens you've used
- You want to decide if it's time to start a new conversation

## Custom Skills (Project-Specific Commands)
You can create your own slash commands using the Skills system. See `07-SKILLS.md` for details.

---
**Bottom line:** `/clear` is your best friend. Use it often. Fresh conversations = better Claude performance.
