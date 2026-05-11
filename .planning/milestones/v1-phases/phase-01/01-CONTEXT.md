# Phase 1: Status Derivation Testing - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

The deriveStatus() function is verified correct for every Jules session state. This is a pure testing phase — no new features, no design decisions. The function already exists in `src/client.ts:181-197` and is used by collector.ts and mcp.ts. We write comprehensive unit tests and verify coverage.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure/testing phase. Use existing vitest setup, follow test patterns from `tests/log.test.ts`, place new test file at `tests/client.test.ts`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/log.test.ts` — established test pattern (stderr capture via write mock, beforeEach/afterEach)
- vitest 1.6 with default config — no vitest.config.ts needed

### Established Patterns
- `deriveStatus()` in `src/client.ts:181-197` — pure function, no side effects, deterministic
- Input: `Pick<JulesSession, 'state' | 'outputs'>` + optional `JulesActivity[]`
- Output: union type `'running' | 'completed' | 'failed' | 'awaiting_plan' | 'cancelled'`
- Logic: explicit state field first, fallback to activity scan

### Integration Points
- `collector.ts:65,82,210` — calls deriveStatus
- `mcp.ts:164,264` — calls deriveStatus
- Tests must import from `../src/client.js` (ESM)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Refer to ROADMAP success criteria:
1. Unit tests pass for all six session states
2. Edge cases covered: null session, missing fields, unexpected state values
3. Running `vitest run` shows deriveStatus tests green with 80%+ coverage on that function

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase, discussion stayed within scope.
</deferred>
