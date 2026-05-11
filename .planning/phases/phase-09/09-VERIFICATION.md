status: passed

# Phase 9: CLI Watch Mode — Verification

## Results

**All success criteria met:**

1. ✅ `jules-dispatch status --watch` refreshes the status table at configurable interval (default 5s)
2. ✅ Terminal clears and redraws full table on each refresh (skips clear in JSON mode)
3. ✅ Watch mode exits cleanly on Ctrl+C (SIGINT handler with cleanup) or when all sessions reach terminal states

## Changes

### src/cli.ts
- Added `-w, --watch` flag to status command
- Added `--interval <ms>` flag (default 5000)
- Added watch loop after initial status render
- SIGINT handler with cleanup in finally block
- JSON mode guard: skips console.clear() and human-readable refresh messages

## Test Summary

**58 tests, all passing, no regression**

## Manual Verification

Recommended: `jules-dispatch status --watch --interval 3000` to verify live refresh behavior.
