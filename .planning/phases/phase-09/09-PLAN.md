# Plan: CLI Watch Mode

**Phase:** 9 — CLI Watch Mode
**Mode:** inline
**Depends on:** Phase 8 (base status table)

## What

Add `--watch` and `--interval` flags to the `status` command. When watch is active, loop and refresh the table at the specified interval.

## Plan 09-01: Implement --watch mode

### Changes to cli.ts

1. Add flags to status command:
```typescript
.option('-w, --watch', 'auto-refresh status table')
.option('--interval <ms>', 'refresh interval in milliseconds', '5000')
```

2. In the status action handler, after initial collectStatus:
   - If `--watch` is set, enter watch loop
   - Loop: clear screen → collectStatus → sleep interval
   - Exit when all sessions are terminal (completed/failed/cancelled)

3. Handle SIGINT for clean exit from watch mode

### Implementation approach

```typescript
if (opts.watch) {
  const interval = parseInt(opts.interval, 10);
  const ctrlC = new AbortController();
  process.on('SIGINT', () => { ctrlC.abort(); });

  while (!ctrlC.signal.aborted) {
    console.clear();
    const results = await collectStatus(client, config, {
      sessionIds: opts.ids,
      output: undefined, // don't write log file in watch mode
      scanLimit: parseInt(opts.scan, 10),
    });

    // Auto-exit if all terminal
    const allTerminal = results.every(r =>
      r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled'
    );
    if (allTerminal) {
      console.log(chalk.green('\nAll sessions resolved.'));
      break;
    }

    console.log(chalk.dim(`\nRefreshing in ${interval / 1000}s... (Ctrl+C to exit)`));
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
```

### Important notes
- Watch mode should NOT use JSON output (conflicts with clear/redraw)
- If --json is set with --watch, emit JSON on each refresh without clearing
- Don't write dispatch logs during watch mode (set output to undefined)

## File

Modify: `src/cli.ts` (status command)

## Verification

1. `npx tsc --noEmit` passes
2. `npx vitest run` passes
3. Manual test: `jules-dispatch status --watch` should clear and refresh
