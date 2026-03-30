# Token Saving — How to Make Claude More Efficient

## Why It Matters
Every message in a conversation costs "tokens" (think of them like credits). The more code Claude reads, the more tokens it uses. On big projects, Claude can waste tokens reading files that aren't relevant to your task.

## Tools This Project Has

### 1. `.claudeignore` (project root)
Works like `.gitignore` — tells Claude to never read certain files/folders.

This project's `.claudeignore` blocks:
```
node_modules/    ← thousands of files, never relevant
dist/            ← compiled output, not source code
.next/           ← Next.js build cache
build/
package-lock.json  ← huge, never useful
bun.lockb
*.min.js         ← minified files, unreadable
screenshots/     ← binary images
*.log
```

### 2. `scripts/find-relevant.js`
A custom script that searches the codebase for a keyword and returns ONLY the files that contain it.

**Usage:**
```bash
# Find files related to image modal
node scripts/find-relevant.js "ImageModal"

# Find files with line previews
node scripts/find-relevant.js "generate variations" --show-lines

# Find only TypeScript files
node scripts/find-relevant.js "webhook" --type ts
```

**Example output:**
```
Files relevant to "generate variations" (5 found):

  src/components/ImageModal.tsx  (12 matches)
    L45: const handleGenerateVariations = async () => {
    L89: setIsGeneratingVariations(true);
    ...
  api/generate-variations.ts  (8 matches)
  src/components/ResultDisplay.tsx  (3 matches)

Tip: Read only these files instead of the whole codebase to save tokens.
```

## Best Practices for Token Saving

### Do
- Run `find-relevant.js` before asking Claude to fix something
- Tell Claude the specific file/component: "fix the bug in ImageModal.tsx around line 45"
- Start a new conversation when switching to a completely different task (see next section)

### Don't
- Ask Claude to "look at the whole project" unless truly necessary
- Keep very long conversations going — old context gets compressed and wastes tokens
- Paste entire files into chat when you can just reference them

## When to Start a New Conversation
Start fresh when:
- You finish one task and start a completely unrelated one
- The conversation is getting very long (Claude starts forgetting early context)
- You're switching from fixing a bug to adding a new feature

Just type `/clear` in Claude Code to start a new conversation.

## The `/compact` Command
If you need to keep the conversation but it's getting long, type `/compact`. Claude will summarize the earlier parts of the conversation to free up space while keeping the important context.

---
**Bottom line:** `.claudeignore` + `find-relevant.js` + starting fresh conversations = dramatically fewer tokens used per session.
