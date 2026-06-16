# PROJECT.md — Relay
> This file is the source of truth. Paste it at the start of every AI session.

---

## What We're Building

A CLI tool + VS Code extension that maintains a persistent, structured memory of your project — outside of any specific AI tool.

When you hit Claude's limit, switch to GPT, Gemini, or any other AI, run `relay inject` and your full project context is ready to paste into the new session instantly. No re-explaining. No conflicting code. No starting over.

**Core promise:** Your project brain survives AI session limits.

---

## Why It Exists

Every AI assistant has isolated memory. Hit a limit mid-build → new AI has zero context → gives you conflicting code → you waste 20 mins re-explaining. Relay fixes this by living outside every AI tool.

---

## Tech Stack

- CLI: Node.js + TypeScript + Commander + Inquirer + Chalk
- VS Code Extension: TypeScript + VS Code API
- Storage: Local only — `%APPDATA%/relay/` (Windows) or `~/.relay/` (Mac/Linux)
- Context compression: Claude Haiku (user brings own API key)
- Distribution: npm (CLI) + VS Code Marketplace (extension)
- Monorepo: npm workspaces

No Supabase. No backend. No cloud. Everything local.

---

## Repo Structure

```
relay/                            ← the repo
├── packages/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/
│   │   │   │   ├── init.ts       ← interactive setup
│   │   │   │   ├── sync.ts       ← scan + update PROJECT.md
│   │   │   │   ├── inject.ts     ← compress + output context
│   │   │   │   └── checkpoint.ts ← save named snapshots
│   │   │   ├── core/
│   │   │   │   ├── storage.ts    ← OS-aware path, read/write
│   │   │   │   ├── scanner.ts    ← walk files, detect stack
│   │   │   │   └── compressor.ts ← Haiku compression + fallback
│   │   │   └── index.ts          ← CLI entry, 4 commands wired
│   │   └── package.json
│   └── vscode-extension/
│       ├── src/
│       │   ├── extension.ts      ← activate, register commands
│       │   ├── panel.ts          ← sidebar webview UI
│       │   └── watcher.ts        ← auto-sync on file save
│       └── package.json
├── package.json                  ← monorepo root
└── tsconfig.json

%APPDATA%/relay/                  ← global storage, never in any repo
├── projects/
│   ├── relay/                    ← relay tracks itself
│   │   ├── PROJECT.md
│   │   └── snapshots/
│   └── {other-projects}/
└── config.json                   ← API key lives here
```

---

## Conventions

- TypeScript strict mode everywhere
- Functions only — no classes
- Every command works offline (no API needed except `relay inject --ai`)
- Storage path is OS-aware from day one — no hardcoded `E:/relay/`
- User brings their own Anthropic API key

---

## What's Working

- ✅ Monorepo scaffolded and compiling (zero TS errors)
- ✅ All 4 CLI commands registered and wired (`relay --help` works)
- ✅ `storage.ts` — OS-aware path, read/write PROJECT.md, snapshots, config
- ✅ `scanner.ts` — walks cwd, detects tech stack, builds file tree string
- ✅ `compressor.ts` — Haiku compression + fast fallback (no API)
- ✅ `init.ts` — interactive setup with inquirer, scans project, writes PROJECT.md
- ✅ `sync.ts` — updates auto-sections, preserves human-written sections
- ✅ `inject.ts` — fast mode + AI mode, outputs context block
- ✅ `checkpoint.ts` — saves timestamped snapshots, --list flag
- ✅ VS Code extension skeleton — sidebar panel, watcher, all commands wired

---

## What's In Progress

- 🔲 End-to-end test: run `relay init` on the relay repo itself, then `relay inject`
- 🔲 Verify storage path resolves correctly on Windows (`%APPDATA%`)
- 🔲 Test `relay sync` preserves human sections correctly

---

## What's Next

1. **E2E test the happy path** — init → checkpoint → inject, verify output makes sense
2. **Fix whatever breaks** — scanner edge cases, path issues on Windows
3. **Improve inject output quality** — test with 5 real projects, tune what gets included
4. **GitHub repo** — push, write README with demo GIF instructions
5. **Demo GIF** — the entire marketing pitch in 60 seconds
6. **npm publish** — `npm publish --access public`

---

## What We're NOT Building (V1)

- ❌ Cloud sync
- ❌ Team sharing
- ❌ Git hooks (auto-checkpoint on commit) — V2
- ❌ Multi-language AST parsing beyond JS/TS/Python
- ❌ Chat UI

---

## Current Session State

Scaffold complete and compiling. Both packages build with zero errors.
Next: run `relay init` on the relay repo itself and test the full flow end-to-end.
