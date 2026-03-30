# Best Practices — How to Get the Best Results from Claude Code

## The Golden Rules

### 1. One Task at a Time
Bad: "Fix the variations bug, add a new brand, update the UI colors, and make the modal bigger."
Good: "Fix the variations bug in ImageModal." → done → "Now add a new brand."

**Why:** Claude does better work on focused tasks. Big multi-part requests lead to mistakes.

### 2. Be Specific, Not Vague
Bad: "The modal is broken."
Good: "When I generate Strong variations in ImageModal, the Subtle variations disappear. Fix only this bug."

**Why:** Specific = Claude knows exactly what to change and won't over-engineer.

### 3. Start Fresh for Unrelated Tasks
Use `/clear` when switching topics. Long conversations with mixed topics lead to Claude getting confused and making mistakes.

**Rule of thumb:** If you're switching to a completely different feature or bug, start a new conversation.

### 4. Let Claude Read First
Before asking Claude to fix something, say "read the file first" or just mention the file. Claude should always understand existing code before modifying it.

### 5. Review Before Approving Big Changes
When Claude wants to edit multiple files at once, take a moment to read the changes before approving. It's easy to approve something that breaks another feature.

## How to Give Good Instructions

### The "What + Where + Why" Formula
- **What:** What do you want changed?
- **Where:** Which file / component / function?
- **Why:** What's the actual problem?

Example:
> "In `ResultDisplay.tsx`, the variation thumbnails below the main gallery disappear after I close and reopen the modal. This is because the state isn't being persisted. Fix only this persistence issue."

### Include a Screenshot When Possible
A screenshot of the problem is worth 1,000 words. Drop it in the chat with your description.

### Tell Claude What NOT to Do
> "Fix the button clipping issue. Don't change any colors, don't refactor the component, don't add new features."

**Why:** Claude sometimes "improves" things you didn't ask it to improve, breaking things in the process.

## Managing Long Sessions

### Signs You Should Start a New Conversation
- Claude starts forgetting things you said 20+ messages ago
- Claude starts repeating itself
- You've finished a task and want to start something new
- The conversation is over 50+ exchanges

### Before Starting Fresh
Make sure important decisions are in `CLAUDE.md` so they carry over to the new conversation.

## When Claude Makes a Mistake

### Don't Just Re-ask the Same Way
If Claude did something wrong, explain WHY it was wrong and what you expected instead.

Bad: "No, that's wrong. Do it again."
Good: "That removed the Submit button which I need to keep. The fix should only affect the image area. Please restore the Submit button and try again."

### Undo with Git
Every change is committed (or should be). If Claude breaks something:
```bash
git log --oneline -5    # see recent commits
git revert HEAD         # undo the last commit
```

### Use `/clear` and Explain from Scratch
Sometimes the cleanest fix is to start a new conversation and describe the problem more clearly.

## Advanced: Giving Claude More Context

### Paste Error Messages
If there's an error in the browser console or terminal, paste the full error message. Don't summarize it — the exact text matters.

### Reference Previous Commits
"This worked before commit `abc1234`. Here's the git diff: [paste diff]"

### Share the Network Request
If a webhook/API is failing, paste the request and response from the browser's Network tab.

---
**Bottom line:** Specific instructions + one task at a time + fresh conversations for new topics = dramatically better results.
