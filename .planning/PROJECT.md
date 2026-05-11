# jules-dispatch

## What This Is

jules-dispatch is a CLI and MCP server that batch-dispatches coding tasks to Google Jules in parallel. It's designed for both human developers (via CLI) and AI agents (via MCP) to orchestrate large-scale code changes across repositories. The tool ships with standardized MCP responses, consolidated orchestration tools, and a CLI progress dashboard.

## Core Value

Turn Jules from a one-at-a-time tool into a massively parallel coding workforce, controlled seamlessly by either humans on the CLI or AI agents over MCP.

## Requirements

### Validated

- CLI batch dispatch with parallel processing — v1
- MCP server with 3 consolidated orchestration tools (dispatch, monitor, interact) — v1
- MCP response standardization ({ success, data?, error?, meta? }) — v1
- MCP tool annotations (readOnly, destructive, idempotent, openWorld) — v1
- MCP recovery hints on error responses — v1
- MCP backward compatibility (12 legacy tool names as deprecated aliases) — v1
- YAML/JSON task file format with multi-document support — existing
- Jules API client with retry/backoff (HTTP + network errors) — v1
- Plan approval workflow — existing
- Optional LLM-powered task planning — existing
- Dual output mode (text + JSON) — existing
- Session lifecycle management (dispatch, poll, tail, cancel) — existing
- Collector error surfacing (debug logging, no silent catches) — v1
- CLI status table with color-coded state grouping — v1
- CLI watch mode (--watch with ANSI refresh, SIGINT, auto-exit) — v1
- CLI batch progress (per-task lines + summary) — v1

### Active

- [ ] MCP test coverage (mcp.ts has zero tests)
- [ ] First-run validation (`jules-dispatch doctor`)
- [ ] Response format control (`format: "concise" | "detailed"`)
- [ ] Cross-tool navigation hints (`suggested_next` field)
- [ ] Output schema declarations (`outputSchema`) on MCP tools

### Out of Scope

| Feature | Reason |
|---------|--------|
| Full-screen TUI (blessed/Ink) | Overkill for snapshot table |
| Web dashboard / browser UI | Adds deployment complexity; JSON output feeds external dashboards |
| Streaming MCP notifications | Requires persistent connections; polling works for agents |
| Plugin/extension system | Premature abstraction; no user demand |
| Multi-agent orchestration | MCP client is the orchestrator; provide good primitives |
| MCP SDK v2 migration | Separate milestone; all needed APIs available in v1.29.0 |

## Context

### Current State

- Shipped v1 (2026-05-11): 10 phases, 16 plans, 58 tests, 18/18 requirements
- ~3,259 LOC TypeScript across 10 source modules + 4 test files
- 14 MCP tools (3 consolidated + 11 legacy/deprecated), 13 CLI commands
- Published on npm as `jules-dispatch` (v1.2.0)
- CI: GitHub Actions, Node 20/22 matrix

### Known Tech Debt

- MCP tools (mcp.ts, 665 lines) have zero test coverage
- Polling logic duplicated 3x (jules_wait_for_completion, jules_monitor, collector)
- Deprecated tools are full reimplementations, not thin wrappers
- CLI UI output relies on manual visual inspection

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Incremental optimization, not rewrite | Working product exists; minimize disruption | v1 shipped with zero breaking changes |
| 3 consolidated MCP tools | 12 fragmented tools confused AI agents | jules_dispatch/monitor/interact delivered |
| Standardized response shape | Consistent agent-friendly interface | { success, data?, error?, meta? } on all tools |
| cli-table3 for status table | Cross-platform, lightweight | Color-coded table with state grouping |
| Watch mode ANSI refresh | Terminal-native, no TUI dependency | SIGINT handler + auto-exit on terminal states |

## Constraints

- **Scope**: Incremental optimization — don't break existing CLI/MCP API contracts
- **Compatibility**: Node 20+, TypeScript 5.4+, ESM-only
- **Target audience**: Open-source community — changes must lower the barrier to entry
- **Dependencies**: Keep dependency footprint minimal

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-11 after v1 milestone*
