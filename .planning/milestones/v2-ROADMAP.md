# v2 — Reliability & Onboarding

**Status:** Shipped 2026-05-11
**Phases:** 5 (11-15)
**Plans:** 5
**Tests:** 192 (across 13 files)

## Phases

- [x] Phase 11: MCP Response Helpers & Consolidated Tool Tests (2/2 plans) — completed 2026-05-11
- [x] Phase 12: Polling Deduplication (1/1 plan) — completed 2026-05-11
- [x] Phase 13: Deprecated Tool Refactoring (1/1 plan) — completed 2026-05-11
- [x] Phase 14: Deprecated Alias Tests (1/1 plan) — completed 2026-05-11
- [x] Phase 15: Doctor Command (1/1 plan) — completed 2026-05-11

## Key Accomplishments

1. **MCP test coverage** — 24 new tests (11 unit + 13 integration) for consolidated tools and response helpers
2. **Polling deduplication** — 3 duplicate polling loops → 1 shared `pollSessions` function, net -137 lines
3. **Deprecated tool refactoring** — 7 deprecated tools became thin wrappers delegating to consolidated tools
4. **Deprecated alias tests** — 13 tests verifying all 7 deprecated tool aliases work correctly
5. **Doctor command** — `jules-dispatch doctor` validates Node.js, npm, API key, connectivity, and task files (16 tests)

## Decisions

- Extracted `ok`/`fail`/`computeRecoveryHint` to `src/mcp-helpers.ts` for testability
- Extracted `createMcpServer` from `runMcpServer` to enable in-process MCP testing via InMemoryTransport
- Polling callbacks (`PollCallbacks`) used to preserve collector's debug logging without coupling
- Doctor uses `loadConfig` and `JulesClient.listSources()` for lightweight connectivity check

## Tech Debt

None — all phases completed without deferred items.

## Stats

- 5 phases, 5 plans, 5 waves
- 192 tests across 13 test files
- 24 new tests (phases 11-15)
- TypeScript strict mode, ESM, Node 20+
