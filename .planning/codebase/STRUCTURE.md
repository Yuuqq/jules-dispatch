---
name: Structure
description: Directory layout, file sizes, command-to-module mapping, and artifact locations
---

# Structure

## Directory Layout

```
jules-dispatch/
├── src/                          # Source code (10 files)
│   ├── cli.ts                    # 540 lines — CLI entry point, 13 commands
│   ├── mcp.ts                    # 373 lines — MCP server, 14+ tools
│   ├── collector.ts              # 283 lines — Status collection, polling/wait
│   ├── planner.ts                # 283 lines — Optional LLM task planner
│   ├── client.ts                 # 198 lines — Jules API HTTP client
│   ├── dispatcher.ts             # 163 lines — Task dispatch (single + batch)
│   ├── config.ts                 # 108 lines — Config & task file loading
│   ├── log.ts                    #  83 lines — Verbose logger (stderr)
│   ├── types.ts                  #  87 lines — TypeScript interfaces
│   └── output.ts                 #  57 lines — Dual output mode
├── tests/                        # Test files
│   └── log.test.ts               # 146 lines — 16 tests for verbose logger
├── tasks/                        # Task definition examples
│   ├── example.yaml              # Sample task file
│   └── walkincs-dispatch.yaml    # Real task file
├── .github/workflows/
│   └── ci.yml                    # CI: Node 20/22 matrix
├── dist/                         # Compiled output (gitignored)
├── .dispatch-logs/               # Dispatch log artifacts (gitignored, created at runtime)
├── package.json                  # v1.2.0, ESM, bin: jules-dispatch
├── tsconfig.json                 # Strict, ES2022, Node16 modules
└── .gitignore                    # node_modules, dist, .env, *.js (except tasks/*.js)
```

## File Responsibilities

| File | Lines | Responsibility |
|------|-------|---------------|
| `cli.ts` | 540 | CLI argument parsing, command routing, user interaction |
| `mcp.ts` | 373 | MCP server, tool registration, error wrapping |
| `collector.ts` | 283 | Session status collection, wait-for-completion polling |
| `planner.ts` | 283 | LLM-powered task decomposition via OpenAI-compatible API |
| `client.ts` | 198 | Google Jules API HTTP client with retry and pagination |
| `dispatcher.ts` | 163 | Task dispatch orchestration (single + batch) |
| `types.ts` | 87 | All shared TypeScript interfaces |
| `log.ts` | 83 | Verbose logging to stderr |
| `config.ts` | 108 | Config loading (.env, YAML/JSON task files) |
| `output.ts` | 57 | Dual output mode (text/JSON), exit codes |

## Command-to-Module Mapping

| CLI Command | Primary Module | Client Methods Used |
|-------------|---------------|-------------------|
| `dispatch` | dispatcher.ts | `createSession` |
| `batch` | dispatcher.ts | `createSession` (parallel) |
| `status` | collector.ts | `listSessions`, `getSession`, `listActivities` |
| `get` | client.ts (direct) | `getSession` |
| `wait` | collector.ts | `getSession`, `listActivities` (polling) |
| `sources` | client.ts (direct) | `iterateSources` |
| `message` | client.ts (direct) | `sendMessage` |
| `plan` | client.ts (direct) | `getLatestPlan` |
| `approve` | client.ts (direct) | `approvePlan` |
| `cancel` | client.ts (direct) | `cancelSession` |
| `tail` | client.ts (direct) | `getSession`, `listActivities` (polling) |
| `plan-tasks` | planner.ts | (no Jules API calls — LLM only) |
| `auto` | planner.ts + dispatcher.ts | LLM + `createSession` |
| `mcp` | mcp.ts | All client methods |

## Task File Format

### YAML (multi-document)
```yaml
title: "Task title"
prompt: "Detailed instructions..."
source: "sources/github/owner/repo"  # optional, falls back to JULES_DEFAULT_SOURCE
branch: "feature-branch"              # optional, falls back to JULES_DEFAULT_BRANCH
autoMode: "AUTO_CREATE_PR"            # optional
requirePlanApproval: true             # optional
---
title: "Another task"
prompt: "..."
```

### JSON
```json
[{ "title": "...", "prompt": "..." }]
```

### Validation (config.ts:102-107)
- Required fields: `title`, `prompt`
- Validated on load; throws descriptive error with file path

## Output Artifacts

| Artifact | Location | Format | Created By |
|----------|----------|--------|-----------|
| Dispatch logs | `.dispatch-logs/dispatch-<timestamp>.json` | JSON array of DispatchResult | `batch` command |
| Status reports | User-specified via `--output` | JSON array of CollectResult | `status --output <file>` |
| Planned tasks | User-specified via `--output` | YAML multi-doc | `plan-tasks --output <file>` |

## Entry Point

- **Source:** `src/cli.ts` — shebang `#!/usr/bin/env node`
- **Build:** `tsc` compiles to `dist/cli.js`
- **Binary:** `jules-dispatch` via `bin` field in package.json
- **Dev:** `npm run dev` uses `tsx` for direct TS execution
