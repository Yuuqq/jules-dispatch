---
phase: 12-polling-deduplication
plan: 01
subsystem: polling
tags: [polling, dedup, refactor, vitest, fake-timers]

requires:
  - phase: 5
    provides: "MCP response shape standardization"
  - phase: 11
    provides: "MCP test infrastructure and createMcpServer export"
provides:
  - "Shared pollSessions function in src/polling.ts with PollCallbacks, PollResult, PollOptions"
  - "All 3 consumer implementations delegate to single shared function"
  - "7 unit tests covering timeout, completion, failFast, mixed terminals, error tolerance, pre-seeded terminals, onPoll callback"
affects: [polling-maintenance, future-polling-enhancements]

tech-stack:
  added: []
  patterns: ["Shared polling abstraction with callbacks for consumer-specific behavior"]

key-files:
  created:
    - src/polling.ts
    - tests/polling.test.ts
  modified:
    - src/collector.ts
    - src/mcp.ts

key-decisions:
  - "Added onError callback to PollCallbacks to preserve debug logging from collector.waitForCompletion"
  - "WaitResult type alias preserved in collector.ts for backward compatibility"
  - "Removed jules_monitor pre-seeding of terminal states: pollSessions detects them on first poll round"
  - "Consumer-specific behavior (logging, emit, NDJSON) passed via callbacks rather than pollSessions internals"

patterns-established:
  - "Polling callbacks pattern: onPoll, onTerminal, onError for consumer customization"

requirements-completed: [POLL-01]

duration: 9min
completed: 2026-05-11
---

# Phase 12 Plan 01: Polling Deduplication Summary

**Single pollSessions function replaces 3 duplicate polling loops in collector.ts and mcp.ts, net -137 lines with 7 unit tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-11T11:32:19Z
- **Completed:** 2026-05-11T11:41:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extracted shared `pollSessions` function from 3 duplicate implementations (collector.waitForCompletion, jules_wait_for_completion, jules_monitor)
- 7 unit tests covering timeout, completion, failFast, mixed terminals, error tolerance, pre-seeded terminals, and onPoll callback
- All consumer-specific behavior (debug logging, emit/NDJSON, session re-summarization) delegated via callbacks
- Net reduction of 137 lines (48 added, 185 deleted)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared pollSessions function with TDD (RED)** - `71cc711` (test)
2. **Task 1: Extract shared pollSessions function with TDD (GREEN)** - `00a1c01` (feat)
3. **Task 2: Refactor consumers to use shared pollSessions** - `7eeb0da` (refactor)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/polling.ts` - Shared pollSessions function with PollCallbacks, PollResult, PollOptions; imports deriveStatus from client.js
- `tests/polling.test.ts` - 7 unit tests using vitest fake timers for time-controlled polling scenarios
- `src/collector.ts` - waitForCompletion delegates to pollSessions with onError (debug logging) and onPoll (console output) callbacks; WaitResult type alias preserved
- `src/mcp.ts` - jules_wait_for_completion and jules_monitor handlers replaced with pollSessions calls; removed inline setTimeout expressions

## Decisions Made
- Added `onError` callback to PollCallbacks: collector.ts needs debug logging for transient poll errors; existing test verifies `debug('wait poll error', ...)` calls
- Removed jules_monitor pre-seeding of terminal states: pollSessions detects already-terminal sessions on first poll round; behavioral difference is one extra API call per terminal session, acceptable for simplicity
- WaitResult type alias preserved in collector.ts: backward-compatible export for any external consumers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added onError callback to PollCallbacks**
- **Found during:** Task 2 (Refactor consumers)
- **Issue:** collector.waitForCompletion test expects `debug('wait poll error', ...)` calls on transient errors, but pollSessions catch block was silent
- **Fix:** Added `onError` callback to PollCallbacks interface; wired it in pollSessions catch block; collector passes `onError: (id, err) => debug('wait poll error', { sessionId: id, error: err.message })`
- **Files modified:** src/polling.ts, src/collector.ts
- **Verification:** collector.test.ts passes with 4 tests unchanged
- **Committed in:** 7eeb0da (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Error callback addition necessary for backward compatibility. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all functions are fully implemented with no placeholders.

## Threat Flags

None - refactoring introduces no new attack surface; same API calls as before.

## TDD Gate Compliance

RED gate: `71cc711` (test commit) -- verified
GREEN gate: `00a1c01` (feat commit) -- verified
REFACTOR gate: clean -- no additional commit needed (implementation already clean)

## Self-Check: PASSED

- src/polling.ts: FOUND
- tests/polling.test.ts: FOUND
- src/collector.ts: FOUND (modified)
- src/mcp.ts: FOUND (modified)
- Commit 71cc711: FOUND
- Commit 00a1c01: FOUND
- Commit 7eeb0da: FOUND

## Next Phase Readiness
- pollSessions available as importable shared module for future polling enhancements (jitter, adaptive interval)
- 65 tests passing across 5 test files
- Phase 13 can now refactor deprecated MCP tools with confidence that polling behavior is well-tested

---
*Phase: 12-polling-deduplication*
*Completed: 2026-05-11*
