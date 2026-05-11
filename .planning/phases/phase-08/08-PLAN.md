# Plan: CLI Status Table

**Phase:** 8 — CLI Status Table
**Mode:** inline
**Depends on:** Phase 1 (deriveStatus), Phase 3 (collector errors)

## What

Replace the plain-text status output in collector.ts's `printStatusText` with a cli-table3 formatted table. Add cli-table3 dependency.

## Plan 08-01: Implement color-coded status table

1. Install cli-table3: `npm install cli-table3`
2. Import cli-table3 in collector.ts
3. Rewrite `printStatusText()` to use cli-table3
4. Add elapsed time calculation from session.createTime

### Table structure
```
┌──────────┬──────────────────────────┬──────────┬─────────┬──────────────────────────────────┐
│ ID       │ Title                    │ State    │ Elapsed │ PR                               │
├──────────┼──────────────────────────┼──────────┼─────────┼──────────────────────────────────┤
│ abc123   │ Fix auth middleware      │ ● Running│ 5m      │                                  │
│ def456   │ Add tests for parser     │ ● Running│ 12m     │                                  │
│ ghi789   │ Refactor config loader   │ ✓ Done   │ 23m     │ https://github.com/.../pull/123  │
│ jkl012   │ Update dependencies      │ ✗ Failed │ 8m      │                                  │
└──────────┴──────────────────────────┴──────────┴─────────┴──────────────────────────────────┘
```

### Columns and widths
- ID: 8 chars (first 8 of sessionId)
- Title: 25 chars (truncate with ellipsis)
- State: 10 chars (icon + text, color-coded)
- Elapsed: 8 chars (e.g. "5m", "1h 23m", "2d")
- PR: remaining width (truncate URL)

### State formatting
```
running → ● Running (green chalk)
pending → ● Pending (yellow chalk)
completed → ✓ Done (blue chalk)
failed → ✗ Failed (red chalk)
cancelled → ⊘ Cancelled (gray chalk)
awaiting_plan → ⏸ Awaiting Plan (magenta chalk)
```

### Grouping
Sort results by group order: running, pending, awaiting_plan, completed, failed, cancelled. Within each group, sort by title alphabetically.

### Elapsed time
Calculate from session.createTime if available. If not available, show "—". Format: Xm for minutes, Xh Ym for hours+minutes, Xd for days.

## Plan 08-02: Integrate into existing status command

1. Update printStatusText in collector.ts to use table
2. Keep JSON output unchanged (the `emit` pattern handles this)
3. Add summary line after table: "5 running · 2 completed · 1 failed"

## Files

- Install: cli-table3
- Modify: `src/collector.ts` (rewrite printStatusText)
- Note: CollectResult doesn't have createTime — need to pass session.createTime through or compute elapsed differently

## Verification

1. `npx tsc --noEmit` passes
2. `npx vitest run` — all tests pass
3. Visual inspection: table should render in 80+ columns
