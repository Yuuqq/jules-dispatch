# Phase 8: CLI Status Table - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (design specified in ROADMAP — UI hint but spec is explicit)

<domain>
## Phase Boundary

Users can see all batch task states at a glance in a color-coded, grouped table. The current `jules-dispatch status` command uses collectStatus which prints plain text groups. This phase adds a cli-table3 formatted table.

</domain>

<decisions>
## Implementation Decisions

### Library
cli-table3 (per ROADMAP decision)

### Table columns
ID (truncated), Title, State (color-coded), Elapsed, PR URL

### Color mapping
- running → green
- pending → yellow
- completed → blue
- failed → red
- cancelled → gray

### Grouping order
Running first, then pending, completed, failed, cancelled

### Claude's Discretion
Exact column widths, truncation strategy, and formatting details.

</decisions>

<code_context>
## Existing Code Insights

### Current status command (cli.ts:116-129)
Calls `collectStatus(client, config, { sessionIds, output, scanLimit })`. The collector returns `CollectResult[]` with `{ sessionId, title, status, prUrl, prTitle, lastActivity, activities, state }`.

### Output pattern
The dual-output pattern means: text mode shows the table, JSON mode shows the existing structured output. Only modify text output.

### collectStatus (collector.ts:99-112)
Already calls `emit(textFn, jsonObj)`. The textFn currently calls `printStatusText(results)`. Replace printStatusText with a table rendering function.

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. `jules-dispatch status` displays a table with columns: ID, title, state, elapsed time, PR URL
2. States are color-coded: running (green), pending (yellow), completed (blue), failed (red), cancelled (gray)
3. Sessions are grouped by state with running first, then pending, completed, failed, cancelled
4. Table renders correctly in standard terminal width (80+ columns)

</specifics>

<deferred>
## Deferred Ideas

None — design specified.
</deferred>
