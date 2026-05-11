# Milestones

## v1 — Incremental Optimization

**Shipped:** 2026-05-11
**Phases:** 10 | **Plans:** 16 | **Tests:** 58
**Requirements:** 18/18 satisfied
**Known deferred items at close:** 3 tech debt items (see v1-MILESTONE-AUDIT.md)

### Delivered

Hardened data foundation (retry, error surfacing, test coverage), consolidated 12 fragmented MCP tools into 3 composable orchestration tools with backward compatibility, and built CLI progress dashboard with status table, watch mode, and batch progress.

### Key Accomplishments

1. 58 unit tests across 4 modules (client, collector, dispatcher, log) — up from 16
2. Network resilience: HTTP + fetch errors retried with exponential backoff
3. MCP tool consolidation: 12 → 3 orchestration tools (jules_dispatch, jules_monitor, jules_interact)
4. Standardized MCP responses: { success, data?, error?, meta? } with recovery hints and annotations
5. CLI status table with color-coded states, watch mode with live refresh, batch progress with per-task lines
6. Zero breaking changes: all 12 original MCP tools still work with deprecation notices

### Archive

- Roadmap: .planning/milestones/v1-ROADMAP.md
- Requirements: .planning/milestones/v1-REQUIREMENTS.md
- Audit: .planning/v1-MILESTONE-AUDIT.md

## v2 — Reliability & Onboarding

**Shipped:** 2026-05-11
**Phases:** 5 | **Plans:** 5 | **Tests:** 192
**Requirements:** 8/8 satisfied
**Known deferred items at close:** None

### Delivered

MCP test coverage (24 tests for consolidated tools + helpers), polling deduplication (3 implementations → 1 shared function), deprecated tool refactoring (thin wrappers), deprecated alias tests (13 tests for 7 aliases), and doctor command (environment + API + task file validation).

### Key Accomplishments

1. 192 tests across 13 files — up from 58 (134 new tests across v1+v2)
2. MCP response helpers extracted and tested (ok/fail/computeRecoveryHint)
3. In-process MCP testing via InMemoryTransport (26 integration tests)
4. Polling deduplication: 3 duplicate loops → 1 shared `pollSessions` (-137 LOC)
5. 7 deprecated tools refactored from full reimplementations to thin wrappers
6. `jules-dispatch doctor` command for first-run environment validation

### Archive

- Roadmap: .planning/milestones/v2-ROADMAP.md
- Requirements: .planning/milestones/v2-REQUIREMENTS.md
- Audit: .planning/v2-MILESTONE-AUDIT.md
- Phases: .planning/milestones/v2-phases/
