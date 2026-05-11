# Phase 12: Polling Deduplication - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

Wait-for-completion polling logic exists as a single shared function used by all 3 current implementations: jules_wait_for_completion (mcp.ts), jules_monitor (mcp.ts), and collector.waitForCompletion (collector.ts).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key considerations:
- 3 duplicate polling implementations must converge to 1 shared function
- The shared function must preserve timeout handling, polling interval, terminal state detection, and failFast behavior
- Location: could go in a new `src/polling.ts` or into `src/collector.ts` as the existing wait module
- The shared function should be consumed by both mcp.ts tools and collector.ts

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/collector.ts` — has waitForCompletion (283 lines, polling logic at lines 186-279)
- `src/mcp.ts` — has jules_wait_for_completion (lines 309-347) and jules_monitor (lines 453-527)
- `src/client.ts` — JulesClient with getSession, listActivities; deriveStatus export

### Established Patterns
- ESM imports with .js extensions
- Immutability: Set<string> for tracking completed/failed/cancelled
- deriveStatus() maps session + activities to normalized status

### Integration Points
- mcp.ts tools call JulesClient directly for polling
- collector.ts wraps polling with timeout and interval
- Both use deriveStatus() to detect terminal states

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Focus on:
1. Extract shared waitForCompletion function
2. Ensure it handles: timeout, interval, terminal states, failFast, error tolerance
3. Replace all 3 implementations with calls to the shared function

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
