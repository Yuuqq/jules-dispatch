# Plan: CLI Batch Progress

**Phase:** 10 — CLI Batch Progress
**Mode:** inline
**Depends on:** Phase 4 (batch dispatch tested), Phase 8 (status table)

## What

Add per-task progress lines and a compact summary to the batch dispatch output.

## Plan 10-01: Per-task dispatch progress lines

### Changes to dispatcher.ts

In `dispatchBatch`, inside the chunk loop (around line 107-127):

1. Before dispatching each chunk, show progress line for each task:
   ```
   [3/20] Fix auth middleware...
   ```

2. After each task completes, append status:
   ```
   [3/20] Fix auth middleware... dispatched
   [4/20] Update tests... failed (API error)
   ```

3. All progress output gated behind `!isJson()` check

### Implementation

Add an index counter that tracks overall position:
```typescript
let taskIndex = 0;
for (let i = 0; i < allTasks.length; i += parallel) {
  // ... existing chunk logic ...
  const batchResults = await Promise.all(
    batch.map(({ file, task }) => {
      if (!isJson()) {
        taskIndex++;
        const total = allTasks.length;
        process.stdout.write(`[${taskIndex}/${total}] ${task.title}... `);
      }
      return dispatchTaskDefinition(client, config, task, file, options);
    }),
  );
  // Print status after completion
  if (!isJson()) {
    for (const r of batchResults) {
      if (r.status === 'dispatched') console.log(chalk.green('dispatched'));
      else console.log(chalk.red(`failed (${r.error ?? 'unknown error'})`));
    }
  }
}
```

Note: Since Promise.all runs in parallel, the progress lines will be written before results. Need to handle this carefully — show the progress line BEFORE dispatching, then show results after the batch completes.

## Plan 10-02: Compact summary line

After all batches complete, show a running summary line during dispatch.

Add a running count display after each chunk:
```typescript
const dispatched = results.filter(r => r.status === 'dispatched').length;
const failed = results.filter(r => r.status === 'failed').length;
const remaining = allTasks.length - results.length;
if (!isJson()) {
  console.log(chalk.dim(`  DONE ${dispatched} | FAILED ${failed} | PENDING ${remaining}`));
}
```

## File

Modify: `src/dispatcher.ts`

## Verification

1. `npx tsc --noEmit` passes
2. `npx vitest run` passes
3. Visual inspection of batch dispatch output
