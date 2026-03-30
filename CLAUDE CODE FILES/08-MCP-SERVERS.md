# MCP Servers — Connect Claude to External Tools

## What They Are
MCP (Model Context Protocol) servers are plugins that give Claude new abilities — like browsing the web, querying databases, or controlling apps on your computer.

Without MCP: Claude can only read/write files and run terminal commands.
With MCP: Claude can also fetch web pages, query Airtable directly, post to Slack, etc.

## How to Add an MCP Server
There are two ways:

### Option 1: Via Claude Code CLI
```bash
claude mcp add <server-name> <command>
```

### Option 2: In Settings JSON
In `C:\Users\User\.claude\settings.json`:
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@some/mcp-package"],
      "env": {
        "API_KEY": "your-key-here"
      }
    }
  }
}
```

## Useful MCP Servers for This Project

### Airtable MCP
Would let Claude read/write to your Airtable directly (without going through n8n).
```bash
claude mcp add airtable npx -y @anthropic/airtable-mcp
```
⚠️ Only add this for debugging — the architecture rule is "never call Airtable from frontend"

### Playwright MCP (Screenshots)
Lets Claude take screenshots of any webpage:
```bash
claude mcp add playwright npx -y @playwright/mcp
```
Great for the "Screenshot-Driven Development" rule in CLAUDE.md.

### Web Search MCP
Lets Claude search the internet:
```bash
claude mcp add search npx -y @anthropic/search-mcp
```

### GitHub MCP
Lets Claude read/create GitHub issues, PRs, etc.:
```bash
claude mcp add github npx -y @github/mcp
```

## Finding More MCP Servers
Search: https://github.com/topics/mcp-server
Or: https://mcp.so (MCP directory)

## Checking What's Installed
```bash
claude mcp list
```

## Removing an MCP Server
```bash
claude mcp remove <server-name>
```

## Scope: Global vs Project
- **Global** (`--scope global`): Available in all your projects
- **Project** (default): Only available in this project

```bash
# Add globally (available everywhere)
claude mcp add --scope global playwright npx -y @playwright/mcp

# Add just for this project
claude mcp add playwright npx -y @playwright/mcp
```

---
**Bottom line:** MCP servers = superpowers for Claude. The most useful one for this project would be Playwright (for automatic screenshots).
