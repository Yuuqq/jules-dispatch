---
phase: 11-02
plan: 02
subsystem: testing
tags: [mcp, vitest, integration-tests, in-memory-transport, mcp-sdk]

requires:
  - phase: 11-01
    provides: "mcp-helpers.ts with ok, fail, computeRecoveryHint"
  - phase: 5
    provides: "MCP response shape standardization"
provides:
  - "createMcpServer(config, client) exported from mcp.ts for testability"
  - "13 integration tests for 3 consolidated MCP tools (dispatch, monitor, interact)"
  - "InProcess MCP testing pattern with InMemoryTransport"
affects: [11-03, mcp-testing, future-mcp-refactors]

tech-stack:
  added: []
  patterns: ["In-process MCP client-server testing via InMemoryTransport", "createMcpServer extraction pattern for dependency injection"]

key-files:
  created:
    - tests/mcp.test.ts
  modified:
    - src/mcp.ts

key-decisions:
  - "Extracted createMcpServer(config, client) to enable in-process testing without StdioServerTransport"
  - "Server must connect before client in InMemoryTransport (MCP handshake: client sends initialize request)"
  - "Mock dispatcher module at vi.mock level since dispatchConsolidatedTasks calls it internally"
  - "timeoutMs must be >= 1000 per Zod schema validation"

patterns-established:
  - "MCP integration test pattern: createMcpServer + InMemoryTransport.createLinkedPair + mock client/dispatcher"

requirements-completed: [MCP-09]

duration: 26min
completed: 2026-05-11
---

# Phase 11 Plan 02: Consolidated MCP Tool Tests Summary

**13 integration tests for jules_dispatch/jules_monitor/jules_interact via InMemoryTransport with exported createMcpServer factory**

## Performance

- **Duration:** 26 min
- **Started:** 2026-05-11T09:57:08Z
- **Completed:** 2026-05-11T10:22:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extracted createMcpServer(config, client) from runMcpServer, enabling in-process MCP testing without StdioServerTransport
- 13 integration tests covering all 3 consolidated tools: jules_dispatch (5), jules_monitor (4), jules_interact (4)
- Tests exercise the real MCP protocol via InMemoryTransport, not just function calls
- Error handling verified for auth (401), not-found (404), missing source, API errors, and missing plan
- Full test suite: 82 tests across 6 files, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor runMcpServer to extract createMcpServer** - `d745d3c` (refactor)
2. **Task 2: Write integration tests for all 3 consolidated MCP tools** - `b1b54bd` (test)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/mcp.ts` - Refactored: extracted createMcpServer(config, client), imported from mcp-helpers.js
- `src/mcp-helpers.ts` - Copied from main repo (11-01 dependency not in worktree)
- `tests/mcp-helpers.test.ts` - Copied from main repo (11-01 dependency not in worktree)
- `tests/mcp.test.ts` - 335 lines, 13 integration tests with InMemoryTransport

## Decisions Made
- Server must connect before client in InMemoryTransport: MCP client sends initialize request during connect(), server must be listening
- Mock dispatcher at vi.mock level: dispatchConsolidatedTasks is a private function inside createMcpServer that calls dispatchTaskDefinition, so we mock the module import
- Included mcp-helpers.ts from 11-01 in Task 1 commit: worktree branched off main before 11-01 merge

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied 11-01 files into worktree**
- **Found during:** Task 1
- **Issue:** mcp-helpers.ts and tests/mcp-helpers.test.ts from 11-01 were not in worktree (committed to separate worktree branch)
- **Fix:** Copied files from main repo, included in Task 1 commit
- **Files modified:** src/mcp-helpers.ts, tests/mcp-helpers.test.ts
- **Verification:** typecheck and all tests pass
- **Committed in:** d745d3c (Task 1 commit)

**2. [Rule 1 - Bug] Fixed InMemoryTransport connect order in tests**
- **Found during:** Task 2
- **Issue:** Test helper connected client before server, causing MCP handshake to hang (client sends initialize request, server not listening)
- **Fix:** Reversed order: server.connect() then client.connect()
- **Files modified:** tests/mcp.test.ts
- **Verification:** All 13 tests pass
- **Committed in:** b1b54bd (Task 2 commit)

**3. [Rule 1 - Bug] Fixed timeoutMs Zod validation in test**
- **Found during:** Task 2
- **Issue:** Test passed timeoutMs=100 but Zod schema requires >= 1000
- **Fix:** Changed to timeoutMs=1000 (still triggers timeout with intervalMs=1000)
- **Files modified:** tests/mcp.test.ts
- **Verification:** Test passes with valid schema values
- **Committed in:** b1b54bd (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- MCP SDK client.connect() sends initialize request immediately; InMemoryTransport queues messages but connect order matters
- Zod schema min(1000) on timeoutMs was not noted in the plan's test spec (plan said timeoutMs: 100)

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all tests verify real behavior with mocked external dependencies.

## Threat Flags

None - test file introduces no new attack surface.

## TDD Gate Compliance

RED gate: `b1b54bd` (test commit) -- verified. Note: tests pass on first run because implementation already exists (tests verify existing behavior, not new feature).

## Next Phase Readiness
- createMcpServer exported and tested, ready for future MCP tool refactoring
- InProcess testing pattern established for any additional MCP tool tests
- 82 total tests provide strong regression safety

## Self-Check: PASSED

- All 5 created/modified files verified present
- Both commit hashes (d745d3c, b1b54bd) verified in git log
- createMcpServer export count: 1
- Test count: 13 (matches spec)

---
*Phase: 11-02*
*Completed: 2026-05-11*
