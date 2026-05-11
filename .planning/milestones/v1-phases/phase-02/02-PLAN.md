# Plan: Retry & Network Resilience

**Phase:** 2 — Retry & Network Resilience
**Mode:** inline
**Depends on:** Nothing

## What

Test the existing HTTP retry logic in `client.ts:request()` (lines 38-49), then extend it to handle network-level fetch errors (the known M3 gap).

## Plan 02-01: Test HTTP retry logic

### Test scenarios

All tests mock `globalThis.fetch` to control responses.

| Scenario | Mock behavior | Expected |
|---|---|---|
| 429 with Retry-After: 1 | Returns 429 with header, then 200 | Retries, succeeds on 2nd call |
| 429 without Retry-After | Returns 429, then 200 | Uses exponential backoff |
| 500 then 200 | Returns 500, then 200 | Retries once, succeeds |
| 502, 502, 200 | Returns 502 twice, then 200 | Retries twice, succeeds |
| 429 x5 (exceeds MAX_RETRIES=4) | Returns 429 four times, then 200 | Succeeds on 5th attempt (4 retries) |
| 429 x6 (exhausts retries) | Returns 429 for all calls | Throws with status 429 |
| 500 exhausts retries | Returns 500 for all calls | Throws with status 500 |
| 404 (non-retryable) | Returns 404 | Throws immediately, no retry |
| 200 (success, no retry) | Returns 200 with JSON body | Returns data, no retry |

### Implementation notes
- Mock `globalThis.fetch` with `vi.fn()` to control responses and count calls
- Mock `sleep` or use fake timers to avoid actual delays
- Test against a real JulesClient instance (constructor needs config with apiKey)

## Plan 02-02: Extend retry to network-level fetch errors

### Current behavior (broken)
```typescript
// Line 34 — fetch throws TypeError on DNS/connection errors
const res = await timed(`${method} ${path}`, () => fetch(url, { ...options, headers }));
// Error propagates uncaught — no retry
```

### Fix
Wrap the fetch call in try/catch, retry on TypeError (network errors):

```typescript
private async request<T>(path: string, options?: RequestInit, retries = MAX_RETRIES): Promise<T> {
  // ... headers setup ...

  let res: Response;
  try {
    res = await timed(`${method} ${path}`, () => fetch(url, { ...options, headers }));
  } catch (err) {
    // Network-level error (DNS failure, connection refused, timeout)
    if (retries > 0) {
      const attempt = MAX_RETRIES - retries;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 250;
      await sleep(delay);
      return this.request<T>(path, options, retries - 1);
    }
    throw err;
  }

  // ... existing HTTP retry logic unchanged ...
}
```

### Test scenarios for network errors

| Scenario | Mock behavior | Expected |
|---|---|---|
| DNS failure then success | fetch throws TypeError, then returns 200 | Retries, succeeds |
| Connection refused x5 then success | throws TypeError 4 times, then 200 | Succeeds on 5th attempt |
| Network error exhausts retries | throws TypeError every time | Throws TypeError |
| Non-TypeError exception | throws RangeError | Does NOT retry, propagates immediately |

## File

Extend: `tests/client.test.ts`

## Verification

1. All HTTP retry tests pass
2. All network error retry tests pass
3. Existing deriveStatus tests still pass (no regression)
4. `npx vitest run` shows all tests green
5. `npx tsc --noEmit` passes
