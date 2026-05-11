# Plan: Batch Dispatch Testing

**Phase:** 4 — Batch Dispatch Testing
**Mode:** inline
**Depends on:** Phase 2 (retry fixes, but testing-only here)

## What

Write unit tests for dispatchBatch chunking, partial failure, and error aggregation. No source code changes needed — dispatcher logic is straightforward but untested.

## Plan 04-01: Test batch dispatch chunking, partial failure, and error aggregation

### Test approach

Mock JulesClient.createSession to control success/failure per task. Mock loadTasksFromDir to provide controlled task lists. Call dispatchBatch and assert result structure.

### Test scenarios

**describe('batch chunking')**
1. **chunks N tasks with parallel=M** — 7 tasks, parallel=3 → 3 chunks (3+3+1). Verify all 7 dispatched, createSession called 7 times
2. **single task** — 1 task, parallel=10 → 1 result, createSession called 1 time
3. **empty task dir** — 0 tasks → returns empty array, no createSession calls
4. **parallel=1 (sequential)** — 3 tasks, parallel=1 → 3 chunks of 1, all dispatched

**describe('partial failure')**
5. **mixed success/failure** — 4 tasks: 2 succeed, 1 fails (API error), 1 fails (no source). Verify 2 dispatched + 2 failed, each failed result has error message and task title
6. **all fail** — 3 tasks all fail. Verify 0 dispatched + 3 failed, each has identifying context
7. **all succeed** — 3 tasks all succeed. Verify 3 dispatched + 0 failed

**describe('error aggregation')**
8. **per-task failure context** — tasks fail with different errors. Verify each DispatchResult has correct taskTitle and specific error message
9. **source missing error** — task with no source configured. Verify returned as failed with 'No source' error, no API call made

## File

Create: `tests/dispatcher.test.ts`

## Verification

1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — passes
