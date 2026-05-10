# jules-dispatch

## What This Is

jules-dispatch is a CLI and MCP server that batch-dispatches coding tasks to Google Jules in parallel. It's designed for both human developers (via CLI) and AI agents (via MCP) to orchestrate large-scale code changes across repositories. The tool currently works end-to-end but has usability friction for both audiences — MCP tools are too fragmented for AI to compose naturally, and progress feedback is unclear for humans.

## Core Value

Turn Jules from a one-at-a-time tool into a massively parallel coding workforce, controlled seamlessly by either humans on the CLI or AI agents over MCP.

## Requirements

### Validated

- ✓ CLI batch dispatch with parallel processing — existing (dispatcher.ts, cli.ts)
- ✓ MCP server with 12 tools — existing (mcp.ts)
- ✓ YAML/JSON task file format with multi-document support — existing (config.ts)
- ✓ Jules API client with retry/backoff — existing (client.ts)
- ✓ Plan approval workflow — existing (cli.ts, mcp.ts)
- ✓ Optional LLM-powered task planning — existing (planner.ts)
- ✓ Dual output mode (text + JSON) — existing (output.ts)
- ✓ Session lifecycle management (dispatch, poll, tail, cancel) — existing

### Active

- [ ] MCP tools redesigned for composability — reduce fragmentation, add high-level orchestration tools
- [ ] MCP tool descriptions guide AI agents on when/how to compose tools
- [ ] Global status dashboard — new CLI command showing all batch task states at a glance
- [ ] Improved error messages — actionable, with suggested fixes
- [ ] Better onboarding for new users — streamlined setup, clearer first-run experience

### Out of Scope

- Major architecture rewrite — this is incremental optimization, not a v2 rewrite
- Web UI / browser-based dashboard — CLI-only for now
- Authentication changes — Jules API key flow stays as-is
- Mobile / IDE-specific integrations — focus on CLI + generic MCP

## Context

### Current State

- 10 TypeScript source modules, ~2000 lines total
- 12 MCP tools exposed, 13 CLI commands
- Single test file (log.test.ts) — 9/10 modules untested
- Published on npm as `jules-dispatch` (v1.2.0)
- CI: GitHub Actions, Node 20/22 matrix
- Codebase mapped: `.planning/codebase/` (ARCHITECTURE, STACK, CONCERNS, etc.)

### Known Issues (from codebase concerns)

- **H1:** Minimal test coverage — core business logic untested
- **H2:** Silent error swallowing in collector
- **M3:** No network error retry (fetch exceptions bypass retry logic)
- **M6:** Silent autoMode fallback to AUTO_CREATE_PR
- **L1:** Polling without backoff

### User Context

- Developer who built this tool and uses it personally
- Wants it to be accessible to open-source community
- Focused on two pain points: MCP tool composability and progress visibility

## Constraints

- **Scope**: Incremental optimization — don't break existing CLI/MCP API contracts
- **Compatibility**: Node 20+, TypeScript 5.4+, ESM-only
- **Target audience**: Open-source community — changes must lower the barrier to entry
- **Dependencies**: Keep dependency footprint minimal

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Incremental optimization, not rewrite | Working product exists; minimize disruption | — Pending |
| MCP tool redesign | 12 fragmented tools confuse AI agents; need higher-level abstractions | — Pending |
| Global status dashboard | Batch operations need aggregate visibility | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-10 after initialization*
