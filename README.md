# 🔗 Relay

Persistent, structured project context that survives AI assistant session limits.

## The Problem
AI coding assistants have isolated and short-lived memories. When you hit a context limit or switch from Claude to ChatGPT or Gemini, the new session starts with zero knowledge, leading to conflicting code, tedious re-explaining, and wasted developer hours. Relay keeps your project's context stored locally, outside your repository, ready to inject into any new session.

## Installation & Quickstart

Install the CLI globally:
```bash
npm install -g @relay/cli
```

Initialize, scan, and feed your AI in 5 commands:
```bash
# 1. Initialize Relay inside your project root
relay init

# 2. Scan folder structure & stack to populate context
relay sync

# 3. Create a checkpoint snapshot before a big refactor
relay checkpoint "pre-refactor baseline"

# 4. Copy compressed context to clipboard, ready to paste to any AI
relay inject

# 5. List all saved checkpoints
relay checkpoint --list
```

## How It Works

### The 4 Commands
- **`relay init`**: Runs an interactive CLI setup to establish your project's high-level purpose, tech stack, and API key configs. Creates the local workspace metadata storage.
- **`relay sync`**: Reads directories and packages, generates a folder tree, detects dependencies, and infers active work by sorting files by modification time. Updates dynamic sections while leaving human-written notes untouched.
- **`relay inject`**: Grabs your project's context, compresses it using Claude Haiku (or local priority-based truncation if offline), wraps it in clear AI demarcations, and copies it to your clipboard.
- **`relay checkpoint <message>`**: Creates a timestamped snapshot of your context file, logging milestones in a timeline.

### Storage Paths
Relay keeps your repository clean by saving all local settings outside the git tree:
- **Windows**: `%APPDATA%/relay/`
- **macOS/Linux**: `~/.relay/`

---

## Contributing
We welcome issues, PRs, and feedback! Please ensure TypeScript strict mode is followed and that your changes compile successfully with `npm run build` prior to submitting a pull request.
