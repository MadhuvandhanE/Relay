# ⚡ Relay

**Persistent AI context across session limits and AI tools.**

You're mid-build. Claude hits its limit. You switch to GPT. GPT has no idea what you're building, what's already done, or what you were just doing. You spend 20 minutes re-explaining.

Relay fixes this. One command. Your new AI knows exactly where you left off.

---

## Install

```bash
npm install -g @relay/cli
```

---

## How It Works

Relay maintains a `PROJECT.md` for every project — stored globally on your machine, outside any repo. It reads your git history, file structure, and tech stack automatically. When you switch AIs, `relay inject` outputs a compressed context block ready to paste.

```bash
relay init        # set up relay for this project (one time)
relay sync        # update context with latest file structure + git activity  
relay inject      # copy context to clipboard, ready to paste into any AI
relay checkpoint  # save a named snapshot of current state
relay list        # show all projects tracked by relay
```

---

## Demo

```
$ relay inject

? What's happening right now?
❯ ⚡ Hit a limit — continue exactly where I left off
  🚀 Starting fresh — orient the AI to my project
  🐛 Hit a bug — include error context

--- RELAY CONTEXT: my-project ---

## What We're Building
A Chrome extension that passively captures browser content and enables 
AI-powered recall using personal browsing history as context.

## What's In Progress
- YouTube transcript extraction via Supabase edge function
- Testing with npm:youtube-transcript package

## Recent Activity (Git)
Branch: main
- 2 hours ago: "fix edge function 501 stub" → youtube-transcript/index.ts
- yesterday: "add pgvector similarity search" → memories.sql, search.ts

Uncommitted changes (2 files):
- youtube-transcript/index.ts  +34 -71
- background.js                +8 -3

## Tech Stack
TypeScript, React, Supabase, pgvector, Claude Haiku, Chrome Extension MV3

--- END RELAY CONTEXT ---

📋 Copied to clipboard!
```

Paste that into GPT, Gemini, Claude, Cursor — anything with a text box. Done.

---

## Storage

Everything lives locally. Nothing leaves your machine.

| OS | Path |
|---|---|
| Windows | `%APPDATA%\relay\` |
| macOS / Linux | `~/.relay/` |

Your repos stay clean. Relay never writes inside your project folders.

---

## Commands

### `relay init`
Interactive setup. Detects your tech stack, creates your project context file.

### `relay sync`
Scans your codebase and updates context automatically:
- File structure (gitignore-aware)
- Tech stack (reads all `package.json` in monorepos)
- Recent git activity (last 7 commits, uncommitted changes, staged files)

Preserves everything you've written manually.

### `relay inject`
Selects what to include based on your current intent:
- **Continue** — focused on in-progress work and recent git changes
- **New task** — big picture: architecture, conventions, what's working
- **Debug** — git diff + error message + current state

Optionally uses Claude Haiku for intelligent compression (`relay inject --ai`).
Falls back to priority-based truncation if no API key is set.

### `relay inject --bug`
Skip the intent selector. Goes straight to debug mode and prompts for your error message.

### `relay checkpoint "message"`
Saves a timestamped snapshot of your current context. Use before big refactors or at the end of a session.

```bash
relay checkpoint "finished auth flow, moving to dashboard"
relay checkpoint --list   # see all saved snapshots
```

### `relay list`
Shows all projects tracked by Relay with last sync time and checkpoint count.

---

## VS Code Extension

Install the Relay extension to get a sidebar panel with one-click access to all commands. Auto-syncs context when you save files.

---

## Contributing

PRs welcome. TypeScript strict mode required. Run `npm run build` before submitting — zero errors, zero warnings.

```bash
git clone https://github.com/YOUR_USERNAME/relay
cd relay
npm install
npm run build
node packages/cli/dist/index.js --help
```

---

## License

MIT
