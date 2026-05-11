# Phase 2: Retry & Network Resilience - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

HTTP and network-level errors are both retried with tested, reliable backoff. The retry logic in `client.ts:38-49` already handles HTTP 429/5xx. Two gaps exist: (1) no tests for existing retry, (2) network-level fetch errors (DNS, connection refused, timeout) bypass retry entirely — the known issue M3 from codebase concerns.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Wrap the fetch call in a try/catch to retry on network errors. Keep existing exponential backoff + jitter strategy.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/client.ts:38-49` — retry logic with exponential backoff (BASE_DELAY_MS=500, MAX_RETRIES=4, jitter 0-250ms)
- `tests/client.test.ts` — established pattern for client tests
- `tests/log.test.ts` — mock pattern for process captures

### Established Patterns
- Retry handles: 429 → uses Retry-After header + jitter; 5xx → exp backoff + jitter
- Retry does NOT handle: fetch throwing (TypeError for DNS, network errors)
- After retries exhausted, non-ok response throws Error with status property

### Integration Points
- All JulesClient methods use `this.request<T>()` — retry lives there
- Retry parameters are module-level constants (MAX_RETRIES=4, BASE_DELAY_MS=500)

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. Retry logic correctly handles HTTP 429 with Retry-After header, 5xx errors, and max retry exhaustion
2. DNS failures, connection refused, and timeout errors trigger the same backoff strategy as HTTP errors
3. All retry scenarios covered by passing unit tests

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.
</deferred>
