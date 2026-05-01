# jules-dispatch 🚀

> **Batch-dispatch tasks to [Google Jules](https://jules.google.com/) in parallel — and let AI agents like Claude or Codex run the whole show.**

[![npm version](https://img.shields.io/badge/npm-1.0.0-blue)](https://www.npmjs.com/package/jules-dispatch)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What Is This?

**jules-dispatch** is a CLI + library that talks directly to the [Google Jules API](https://jules.google.com/) and lets you:

- Fire off **10–100 Jules coding sessions in parallel** with a single command
- Define tasks as simple **YAML files** — title, repo, branch, and a prompt
- **Poll for completion** and collect generated PR links automatically
- Let another AI (Claude, Codex, Gemini…) **act as the orchestrator** and dispatch the sub-tasks to Jules

It turns Jules from a "one task at a time" tool into a **massively parallel coding workforce**.

---

## ✨ Key Features

| Feature | Details |
|---|---|
| ⚡ Parallel dispatch | Saturate Jules with N sessions at once (`--parallel 20`) |
| 📋 YAML task files | Human-readable, git-committable task definitions |
| 🔄 Status polling | Wait for sessions + auto-detect created PRs |
| 💬 Follow-up messages | Send new instructions to a running session |
| 🤖 AI-orchestrator friendly | Claude / Codex generate the YAML, you run `batch` |
| 📝 Dispatch logs | JSON log of every session ID for auditing |

---

## 🏗 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Workflow                          │
│                                                             │
│  Claude / Codex                                             │
│  ┌──────────────┐                                           │
│  │ 1. Analyse   │  "Break this epic into 10 sub-tasks"      │
│  │    the epic  │                                           │
│  │ 2. Write     │──► tasks/01-auth.yaml                     │
│  │    task YAMLs│    tasks/02-payments.yaml                 │
│  │              │    tasks/03-notifications.yaml  …         │
│  └──────────────┘                                           │
│         │                                                   │
│         ▼                                                   │
│  jules-dispatch batch tasks/ --parallel 10                  │
│         │                                                   │
│         ▼                                                   │
│  ┌──────┬──────┬──────┬──────┐                              │
│  │Jules │Jules │Jules │Jules │  … all running in parallel   │
│  │  #1  │  #2  │  #3  │  #4  │                              │
│  └──┬───┴──┬───┴──┬───┴──┬───┘                              │
│     │      │      │      │                                  │
│     ▼      ▼      ▼      ▼                                  │
│   PR #1  PR #2  PR #3  PR #4   ← auto-created in GitHub     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Use Cases

### 1. AI-Orchestrated Parallel Development (the killer use case)

Give your Claude / Codex / Gemini agent this tool and tell it:

> *"Split this 2-week epic into independent sub-tasks, write a `tasks/` folder with one YAML per task, then run `jules-dispatch batch tasks/`."*

The orchestrating AI decomposes the work → **Jules agents execute everything in parallel** → PRs appear in GitHub.

### 2. One-Shot Project Bootstrapping

Going from zero to a full project skeleton? Write 10 task YAMLs (schema, seed data, API, tests, docs, CI…) and dispatch them all at once. Jules creates a PR for each piece.

### 3. Bulk Documentation / Research

Need 20 pages of technical documentation written? One task file per page, one `batch` command. Jules researches and writes them all concurrently.

### 4. Codebase-Wide Refactors

Breaking a monolith into services, or migrating from one library to another? Scope each migration unit as a task. Jules works on all of them in parallel on separate branches.

### 5. Automated QA Expansion

Describe each module that needs tests as a task YAML. Run `batch`. Jules writes and commits the test suites. You review the PRs.

### 6. Scheduled / CI-Driven Automation

Drop `jules-dispatch batch tasks/nightly/` into a GitHub Actions cron job. Night runs spawn Jules sessions, morning brings you fresh PRs.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A [Google Jules](https://jules.google.com/) account and API key
- A GitHub repository connected to Jules

### 1. Install

```bash
npm install
# or globally:
npm install -g jules-dispatch
```

### 2. Configure

```bash
cp .env.example .env
```

```env
# .env
JULES_API_KEY=your-api-key-here
JULES_DEFAULT_SOURCE=sources/github/YOUR_ORG/YOUR_REPO
JULES_DEFAULT_BRANCH=main
JULES_AUTO_MODE=AUTO_CREATE_PR
```

### 3. Write a task

```yaml
# tasks/add-dark-mode.yaml
title: "Add Dark Mode Support"
prompt: |
  Add a dark mode toggle to the React app:
  1. Add a ThemeContext with light/dark state
  2. Wrap App with ThemeProvider in index.tsx
  3. Add a toggle button in the Header component
  4. Store preference in localStorage
  5. Apply CSS variables for the dark theme
  6. Commit and open a PR
```

### 4. Dispatch it

```bash
npx tsx src/cli.ts dispatch tasks/add-dark-mode.yaml
# ✓ Add Dark Mode Support
#   Session: https://jules.google.com/session/abc123
```

### 5. Or batch-dispatch everything at once

```bash
npx tsx src/cli.ts batch tasks/ --parallel 10
# Dispatching 8 tasks...
#
#   ✓ Add Dark Mode Support
#     https://jules.google.com/session/abc123
#   ✓ Fix Login Bug
#     https://jules.google.com/session/def456
#   ✓ Write API Docs
#     https://jules.google.com/session/ghi789
#   …
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Dispatched: 8, Failed: 0
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Dispatch log: .dispatch-logs/dispatch-2025-05-01T12-00-00.json
```

---

## 📖 CLI Reference

### Global flags

| Flag | Default | Description |
|---|---|---|
| `-p, --project <dir>` | `.` | Directory containing your `.env` file |

---

### `dispatch <taskFile>`

Dispatch a single task file.

```bash
npx tsx src/cli.ts dispatch tasks/my-task.yaml
npx tsx src/cli.ts dispatch tasks/my-task.yaml --source sources/github/org/other-repo --branch develop
```

| Flag | Description |
|---|---|
| `-s, --source <source>` | Override the GitHub source |
| `-b, --branch <branch>` | Override the target branch |

---

### `batch [taskDir]`

Dispatch all `.yaml` / `.yml` / `.json` files in a directory.

```bash
npx tsx src/cli.ts batch tasks/
npx tsx src/cli.ts batch tasks/ --parallel 20
npx tsx src/cli.ts batch tasks/ --source sources/github/org/repo --branch feature/my-branch
```

| Flag | Default | Description |
|---|---|---|
| `-s, --source <source>` | from `.env` | Override source for all tasks |
| `-b, --branch <branch>` | from `.env` | Override branch for all tasks |
| `-n, --parallel <n>` | `10` | Max concurrent Jules sessions |

---

### `status`

Check the status of recent Jules sessions and see which PRs were created.

```bash
npx tsx src/cli.ts status
npx tsx src/cli.ts status --ids SESSION_ID1 SESSION_ID2
npx tsx src/cli.ts status --output report.json
```

Sample output:
```
Status: 3 completed, 2 running

Completed:
  ✓ Add Dark Mode Support
    PR: https://github.com/org/repo/pull/42
  ✓ Fix Login Bug
    PR: https://github.com/org/repo/pull/43

Running:
  ○ Write API Docs — Generating documentation…
    https://jules.google.com/session/ghi789
```

---

### `wait [ids...]`

Poll until the specified sessions finish (or timeout is reached).

```bash
npx tsx src/cli.ts wait SESSION_ID1 SESSION_ID2
npx tsx src/cli.ts wait SESSION_ID1 --interval 15000 --timeout 1800000
```

| Flag | Default | Description |
|---|---|---|
| `--interval <ms>` | `30000` | Poll interval in milliseconds |
| `--timeout <ms>` | `600000` | Max wait time in milliseconds |

---

### `message <sessionId> <text>`

Send a follow-up instruction to a running Jules session.

```bash
npx tsx src/cli.ts message SESSION_ID "Also add unit tests for the new functions."
```

---

### `sources`

List all GitHub repositories connected to your Jules account.

```bash
npx tsx src/cli.ts sources
# 3 sources:
#   myorg/frontend
#   myorg/backend
#   myorg/docs
```

---

## 📄 Task File Format

Tasks are plain YAML (or JSON). Fields:

```yaml
title: "Human-readable task name"           # required
prompt: |                                   # required
  Detailed instructions for Jules.
  Can be multi-line. The more specific,
  the better the output.

source: "sources/github/owner/repo"         # optional — overrides .env default
branch: "main"                              # optional — overrides .env default
autoMode: "AUTO_CREATE_PR"                  # optional — AUTO_CREATE_PR | NONE
requirePlanApproval: false                  # optional — pause and wait for plan OK
```

**Multiple tasks in one file** using YAML `---` separators:

```yaml
title: "Task 1"
prompt: "Do thing A"
---
title: "Task 2"
prompt: "Do thing B"
---
title: "Task 3"
prompt: "Do thing C"
```

**JSON format** also supported:

```json
{
  "title": "Fix the thing",
  "prompt": "Find the bug in src/auth.ts and fix it."
}
```

---

## 🤖 Using with Claude / Codex as Orchestrator

The real power of jules-dispatch comes from combining it with a coding AI that can generate the task files.

**Example prompt to Claude:**

```
I have a Node.js backend that needs to be migrated from Express to Fastify.
The repo is at sources/github/myorg/backend, branch main.

Please:
1. Analyse the codebase and identify the independent migration units
2. Create a tasks/ directory with one YAML file per unit
3. Each YAML should have a clear title and detailed step-by-step prompt
4. Make sure the tasks can run in parallel (no shared state conflicts)
5. Then run: npx tsx src/cli.ts batch tasks/ --parallel 8
```

Claude (or Codex) will:
1. Read the codebase
2. Write `tasks/01-migrate-routes.yaml`, `tasks/02-migrate-middleware.yaml`, etc.
3. Execute the batch dispatch command
4. Jules handles all the actual code changes in parallel

---

## 📁 Project Structure

```
jules-dispatch/
├── src/
│   ├── cli.ts          CLI entry point (Commander)
│   ├── client.ts       Jules REST API client
│   ├── config.ts       .env + task file loading
│   ├── dispatcher.ts   Single and batch task dispatch
│   ├── collector.ts    Status polling and completion waiting
│   └── types.ts        TypeScript type definitions
├── tasks/
│   ├── example.yaml    Starter task example
│   └── *.yaml          Your task definitions live here
├── .env.example        Environment variable template
└── .dispatch-logs/     Auto-created — JSON logs of every dispatch run
```

---

## 🛠 Development

```bash
npm install
npm run build     # compile TypeScript → dist/
npm run dev       # run CLI directly with tsx (no build step)
npm run lint      # ESLint
npm run test      # Vitest
```

---

## 📜 License

MIT — see [LICENSE](LICENSE)

---

## 🌟 Star History

If this project saves you time, please ⭐ star it — it helps others discover it!

---

*Built to make [Google Jules](https://jules.google.com/) actually scale.*
