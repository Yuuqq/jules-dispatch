# Plan 01-01: Test deriveStatus() for all session states and edge cases

**Phase:** 1 — Status Derivation Testing
**Mode:** inline
**Depends on:** Nothing

## What

Write comprehensive unit tests for `deriveStatus()` in `src/client.ts:181-197`. Pure function, no mocking needed — just call with various inputs and assert return values.

## Test Scenarios

### 1. Explicit state mapping (6 states)

| Input state | Expected output | Notes |
|---|---|---|
| `COMPLETED` | `'completed'` | Direct map |
| `FAILED` | `'failed'` | Direct map |
| `CANCELLED` | `'cancelled'` | British spelling |
| `CANCELED` | `'cancelled'` | American spelling |
| `AWAITING_PLAN_APPROVAL` | `'awaiting_plan'` | Direct map |
| `RUNNING` | `'running'` | Direct map |
| `PENDING` | `'running'` | Maps to running |
| `AWAITING_USER_INPUT` | `'running'` | Maps to running |

### 2. Case insensitivity

| Input state | Expected output | Notes |
|---|---|---|
| `'completed'` (lowercase) | `'completed'` | toUpperCase handles it |
| `'Running'` (mixed case) | `'running'` | |
| `'FAILED'` (already upper) | `'failed'` | Identity case |

### 3. State priority — explicit state wins over activities

| Session state | Activities | Expected | Notes |
|---|---|---|---|
| `COMPLETED` | `[sessionFailed]` | `'completed'` | State checked first |
| `FAILED` | `[sessionCompleted]` | `'failed'` | State checked first |
| `RUNNING` | `[sessionFailed]` | `'running'` | RUNNING maps before fallback |

### 4. Activity fallback (no recognizable state)

| Session state | Activities | Expected | Notes |
|---|---|---|---|
| `''` (empty) | `[sessionFailed]` | `'failed'` | Activity scan catches it |
| `''` (empty) | `[sessionCompleted]` | `'completed'` | Activity scan catches it |
| `''` (empty) | `[sessionFailed, sessionCompleted]` | `'failed'` | Failed checked first in fallback |
| `''` (empty) | `[]` | `'running'` | Default fallback |
| `'STATE_UNSPECIFIED'` | `[]` | `'running'` | Unrecognized state falls through |
| `'SOME_UNKNOWN_STATE'` | `[]` | `'running'` | Unknown state falls through |

### 5. Edge cases

| Input | Expected | Notes |
|---|---|---|
| `{ state: undefined }` | `'running'` | Null coalescing to '' |
| `{}` (no state field) | `'running'` | state is undefined |
| `{ state: null }` | `'running'` | Nullish coalescing |

## File

Create: `tests/client.test.ts`

## Verification

1. `npx vitest run tests/client.test.ts` — all tests green
2. `npx vitest run --coverage` — deriveStatus function has 100% branch/line coverage (it's a small pure function)
3. No flaky tests — all deterministic
