---
phase: 15-doctor-command
plan: 01
subsystem: cli
tags: [doctor, validation, environment-check, cli]

# Dependency graph
requires:
  - phase: 1 (Status Derivation Testing)
    provides: Verified deriveStatus function
  - phase: 3 (Collector Error Surfacing)
    provides: Error surfacing pattern for API calls
provides:
  - Doctor command for first-run environment validation
  - Modular check functions (checkNodeVersion, checkNpm, checkApiKey, checkApiConnectivity, checkTaskFile)
affects: [cli, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [injectable-exec-function for testable shell commands, modular-check-functions for composable diagnostics]

key-files:
  created:
    - src/doctor.ts
    - tests/doctor.test.ts
  modified:
    - src/cli.ts

key-decisions:
  - "Injectable exec function pattern for checkNpm to enable testing without mocking child_process module"
  - "Individual exported check functions enable unit testing each check independently from runDoctor orchestrator"
  - "API connectivity check skipped when JULES_API_KEY is missing (fail-fast on auth before network call)"

patterns-established:
  - "Injectable shell command wrapper: pass exec function as parameter instead of importing child_process directly"
  - "Modular diagnostic checks: export individual check functions alongside orchestrator for testability"

requirements-completed: [DOC-01, DOC-02, DOC-03]

# Metrics
duration: 10min
completed: 2026-05-11
---

# Phase 15 Plan 01: Doctor Command Summary

**CLI doctor command with 5 composable environment checks (Node, npm, API key, connectivity, task file) and 16 unit tests**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-11T14:06:41Z
- **Completed:** 2026-05-11T14:16:29Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Doctor command validates entire environment in one call: Node.js version, npm, JULES_API_KEY, API connectivity, task file format
- Modular check functions exported independently for unit testing
- Injective exec function pattern for checkNpm avoids module-level mocking complexity
- 16 new tests covering all check functions and runDoctor orchestrator (74 total, 0 regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Tests for doctor command** - `4611ec6` (test)
2. **Task 1 GREEN: Doctor module implementation** - `83d9ad6` (feat)
3. **Task 1 GREEN: CLI command registration** - `7736072` (feat)

## Files Created/Modified
- `src/doctor.ts` - Doctor check module: checkNodeVersion, checkNpm, checkApiKey, checkApiConnectivity, checkTaskFile, runDoctor orchestrator
- `tests/doctor.test.ts` - 16 unit tests covering all check functions and runDoctor
- `src/cli.ts` - Added doctor command registration with --task-file option

## Decisions Made
- Injectable exec function for checkNpm: pass as parameter with default to execSync, enabling test mocking without vi.mock()
- API connectivity skipped when API key missing: fail-fast avoids unnecessary network call
- Dynamic import for doctor.js in CLI: follows existing pattern (planner.js is also lazy-loaded)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed network error test timeout**
- **Found during:** Task 1 GREEN phase
- **Issue:** Test using `new TypeError('fetch failed')` triggered JulesClient's retry logic (4 retries with exponential backoff), causing 5s timeout
- **Fix:** Changed test to use `new Error('ENOTFOUND')` which is not retried by JulesClient (only TypeErrors trigger retry)
- **Files modified:** tests/doctor.test.ts
- **Verification:** All 16 tests pass in <1s
- **Committed in:** 83d9ad6 (GREEN commit)

**2. [Rule 1 - Bug] Fixed TypeScript type error in checkNpm**
- **Found during:** Task 1 GREEN phase
- **Issue:** `opts: unknown` parameter type caused TS2769 overload mismatch with execSync
- **Fix:** Changed parameter type to `ExecSyncOptionsWithStringEncoding` from node:child_process
- **Files modified:** src/doctor.ts
- **Verification:** `npm run typecheck` passes clean
- **Committed in:** 83d9ad6 (GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for tests and typecheck to pass. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all checks are fully wired to real services (Node.js process, npm CLI, Jules API, filesystem).

## Threat Flags
None - no new security surface beyond what's already in the threat model (T-15-01 accept, T-15-02 accept).

## TDD Gate Compliance
- RED commit: 4611ec6 (test)
- GREEN commit: 83d9ad6 (feat)
- GREEN commit: 7736072 (feat)
- Gate sequence valid.

## Next Phase Readiness
- Doctor command ready for use as `jules-dispatch doctor`
- Supports `--json` global flag for machine-readable output
- Supports `--task-file <path>` for task file validation
- Ready for CLI-D02 (exponential backoff for polling) if planned

## Self-Check: PASSED

- src/doctor.ts: FOUND
- tests/doctor.test.ts: FOUND
- .planning/phases/phase-15/15-01-SUMMARY.md: FOUND
- Commit 4611ec6 (test): FOUND
- Commit 83d9ad6 (feat - doctor module): FOUND
- Commit 7736072 (feat - CLI command): FOUND

---
*Phase: 15-doctor-command*
*Completed: 2026-05-11*
