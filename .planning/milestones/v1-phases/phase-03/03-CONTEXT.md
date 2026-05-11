# Phase 3: Collector Error Surfacing - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Users and agents see collector errors instead of silent failures. Two empty catch blocks in collector.ts swallow errors without logging or surfacing them. This phase replaces silent error swallowing with logged, surfaced errors that include context (session ID, operation, error message).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion. Use the existing `debug()` logger from log.ts for error context. Keep behavior unchanged (continue processing on activity fetch error, keep polling on transient wait error) — just add visibility.

</decisions>

<code_context>
## Existing Code Insights

### Silent catch #1: collector.ts:80-83
```typescript
} catch {
  lastActivity = 'Error fetching activities';
  status = deriveStatus(session, []);
}
```
Activity fetch fails silently — no error logged, no session context in the fallback message.

### Silent catch #2: collector.ts:221-223
```typescript
} catch {
  // Transient — keep polling.
}
```
Wait polling error completely swallowed — no logging, no way to diagnose polling failures.

### Established Patterns
- `debug()` from `./log.js` for verbose error logging with structured data
- `verbose()` for one-liner diagnostic output
- `isJson()` guard for text-only output sections

### Integration Points
- Both catch blocks should log via debug/verbose but not change control flow
- The `session.id` is available in both contexts for error context

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. Activity fetch errors are logged with context (session ID, operation, error message)
2. Wait polling errors are surfaced to the caller instead of silently caught
3. No empty catch blocks remain in collector.ts

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.
</deferred>
