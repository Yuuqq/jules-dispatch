# Phase 9: CLI Watch Mode - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (design specified in ROADMAP)

<domain>
## Phase Boundary

Users can monitor batch progress in real-time with an auto-refreshing terminal display. The `jules-dispatch status --watch` command refreshes the status table at a configurable interval using ANSI escape sequences.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
Exact ANSI approach (clear screen vs cursor move), spinner animation, and signal handling details.

</decisions>

<code_context>
## Existing Code Insights

### Status command (cli.ts:116-129)
The `status` command needs a `--watch` flag added. When set, it loops and refreshes the table.

### Table rendering (collector.ts:printStatusText)
Already renders a cli-table3 table. The watch mode needs to clear and re-render this table.

### ANSI approach
Use `console.clear()` or `\x1B[2J\x1B[H` to clear screen. Re-render full table on each refresh.

### Exit conditions
- Ctrl+C (SIGINT) — clean exit
- All sessions reach terminal states (completed/failed/cancelled) — auto-exit

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. `jules-dispatch status --watch` refreshes the status table at a configurable interval (default 5s)
2. Terminal clears and redraws the full table on each refresh using ANSI escape sequences
3. Watch mode exits cleanly on Ctrl+C or when all sessions reach terminal states

</specifics>

<deferred>
## Deferred Ideas

None.
</deferred>
