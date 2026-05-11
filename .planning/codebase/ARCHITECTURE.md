---
name: Architecture
description: High-level architecture, module dependencies, and design patterns
---

# Architecture

## Overview

jules-dispatch is a **dual-mode tool**: a CLI for direct use and an MCP server for AI agent integration (Claude Code, Codex). Both modes share the same core modules.

```
┌─────────────────────────────────────────────────────┐
│                    Entry Points                      │
│  cli.ts (CLI)                    mcp.ts (MCP server)│
└──────────┬──────────────────────────────┬───────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────┐
│  config.ts ← .env + task files                       │
│  output.ts ← text/JSON dual mode                     │
│  log.ts ← verbose stderr logging                     │
└──────────────────────┬──────────────────────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│  dispatcher.ts   │   │  collector.ts    │
│  (create tasks)  │   │  (read status)   │
└────────┬─────────┘   └────────┬─────────┘
         │                      │
         ▼                      ▼
┌─────────────────────────────────────────────────────┐
│  client.ts — JulesClient (HTTP wrapper + retry)      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
              Google Jules API (v1alpha)

┌──────────────────┐
│  planner.ts      │ ← Optional, only if LLM key present
│  (LLM task       │
│   decomposition) │
└──────────────────┘
```

## Module Dependency Graph

```
cli.ts → config.ts, client.ts, dispatcher.ts, collector.ts, output.ts, log.ts, planner.ts
mcp.ts → config.ts, client.ts, dispatcher.ts, planner.ts, types.ts
dispatcher.ts → config.ts, client.ts, output.ts, types.ts
collector.ts → client.ts, output.ts, types.ts
client.ts → log.ts, types.ts
planner.ts → types.ts
output.ts → (standalone)
log.ts → (standalone)
config.ts → types.ts
types.ts → (standalone)
```

## Key Design Patterns

### Thin Client Pattern
`JulesClient` is a pure HTTP wrapper with no business logic — all orchestration lives in `dispatcher.ts` and `collector.ts`. This keeps the client testable and the orchestration explicit.

### Dual Output Mode
Every user-facing operation calls `emit(textFn, jsonObj)` (output.ts:18-24):
- **Text mode:** calls `textFn()` for chalk-formatted output
- **JSON mode:** writes `jsonObj` as a single JSON line to stdout

This keeps both output paths type-safe and always in sync.

### Async Generators for Pagination
All paginated API calls expose `async *iterate*()` generators (client.ts:72-79, 112-119, 140-147) that handle `nextPageToken` internally. Callers just `for await` over results.

### Optional Module Pattern
The LLM planner is fully optional — `isPlannerConfigured()` gates registration of planner commands and MCP tools (cli.ts:348-349, mcp.ts:297-299). The app works without any LLM key.

### Parallel Batch Processing
Both `dispatcher.ts` and `mcp.ts` chunk tasks into groups of `parallel` (default 10) and dispatch with `Promise.all` (dispatcher.ts:107-114, mcp.ts:120-123).

## Error Handling Strategy

### Exit Codes (output.ts:49-57)
| Code | Constant | Meaning |
|------|----------|---------|
| 0 | `OK` | Success |
| 1 | `GENERIC` | Unspecified error |
| 2 | `AUTH` | Auth/config error (missing API key) |
| 3 | `VALIDATION` | Invalid input (bad task file, bad args) |
| 4 | `PARTIAL` | Some tasks in batch failed |
| 5 | `TIMEOUT` | Wait command timed out |

### Error Flow
- **CLI:** Each command action wraps operations in try/catch, calls `fail()` or `emitError()` with appropriate exit code
- **MCP:** `tool()` helper wraps every handler; thrown errors become `{ isError: true }` responses (mcp.ts:39-58)
- **Client:** HTTP errors thrown as `Error` with `.status` property; retry handles 429/5xx transparently (client.ts:38-57)

### Unhandled Rejection Guard
Global `unhandledRejection` handler at cli.ts:533-536 catches any promise that slips through command handlers.

## Retry Strategy (client.ts:21-49)

- **Trigger:** HTTP 429 (rate limited) or status >= 500 (server error)
- **Max retries:** 4
- **Backoff:** `BASE_DELAY_MS (500) * 2^attempt + random(0..250)` ms
- **Respects Retry-After:** If header present, uses `max(Retry-After * 1000, 0) + jitter`
- **No retry for:** 4xx (except 429), network errors (fetch rejection)
