---
name: Conventions
description: Coding conventions, patterns, and style choices in the codebase
---

# Conventions

## TypeScript Configuration

- **Strict mode** enabled (`tsconfig.json`): strictNullChecks, noImplicitAny, etc.
- **ES2022 target** — uses top-level await, class fields, `at()`, etc.
- **Node16 module resolution** — `.js` extensions required in relative imports
- **ESM** — `"type": "module"` in package.json, no CommonJS

## Naming

- **Variables/functions:** camelCase (`sessionId`, `dispatchBatch`, `loadConfig`)
- **Classes:** PascalCase (`JulesClient`)
- **Interfaces/types:** PascalCase (`JulesConfig`, `TaskDefinition`, `DispatchResult`)
- **Constants:** UPPER_SNAKE_CASE (`BASE_URL`, `MAX_RETRIES`, `BASE_DELAY_MS`)
- **Environment variables:** UPPER_SNAKE_CASE with namespace prefixes (`JULES_*`, `LLM_*`)

## Import Style

```typescript
import { readFileSync } from 'node:fs';           // node: protocol for built-ins
import { resolve } from 'node:path';
import { parseAllDocuments } from 'yaml';           // third-party
import type { JulesConfig } from './types.js';      // type-only imports with .js extension
import { JulesClient } from './client.js';          // value imports with .js extension
```

## File Organization

- **Flat `src/` directory** — one file per concern, no subdirectories
- **10 source files** total, largest is cli.ts at 540 lines
- **No barrel/index file** — each module imported directly by path
- Types centralized in `types.ts` (not co-located)

## Error Handling

### Exit Code Pattern (output.ts:49-57)
Structured exit codes: 0 (OK), 1 (generic), 2 (auth), 3 (validation), 4 (partial), 5 (timeout)

### User-Facing Errors
- `emitError(message, code, details)` for dual-mode error output (output.ts:26-34)
- `fail(message, code, errCode)` exits with appropriate code (cli.ts:39-42)
- Never raw `console.error` in command handlers — always goes through `emitError`

### Internal Errors
- Try/catch in command actions with typed error extraction
- `void` prefix to acknowledge unused variables (collector.ts:79)

## Output Pattern

Every user-facing output uses the dual-mode `emit()`:
```typescript
emit(
  () => console.log(chalk.green('✓ Success')),  // text mode
  { ok: true, sessionId }                        // JSON mode
);
```
- `info(text)` for text-only informational output (output.ts:37-39)
- `isJson()` guard for text-only formatting sections

## Async Patterns

### Pagination with Async Generators
```typescript
async *iterateSources(): AsyncGenerator<JulesSource> {
  let token: string | undefined;
  do {
    const page = await this.listSources(token);
    for (const s of page.sources ?? []) yield s;
    token = page.nextPageToken;
  } while (token);
}
```

### Parallel Batch Processing
```typescript
for (let i = 0; i < items.length; i += parallel) {
  const batch = items.slice(i, i + parallel);
  const results = await Promise.all(batch.map(fn));
  output.push(...results);
}
```

## Config Pattern

- `.env` file parsed manually (config.ts:13-29) — supports `export` prefix, quotes, comments
- Override chain: CLI flag → env var → .env file → default
- `noExit` option for MCP mode (throws instead of `process.exit`)

## Immutability

- Spread operators for creating new objects: `{ ...config, ...overrides }`
- No mutation of input parameters in dispatcher/collector
- State tracking uses `Set<string>` for tracking completed/failed IDs

## Logging

- All verbose/debug output to **stderr only** via `log.ts`
- Never mixes with stdout (which is reserved for JSON output mode)
- `timed()` wrapper for performance tracing in verbose mode
- `verbose()` for one-liners, `debug()` for structured data with timestamps

## Comments

- Minimal comments — JSDoc on exported functions only when behavior is non-obvious
- No inline code comments explaining what code does
- Brief descriptive comments for sections (e.g., `// ---------- sessions ----------`)

## Conditional Features

The LLM planner is the only conditional module:
- `isPlannerConfigured()` checks for any planner API key (planner.ts:98-105)
- Planner commands/tools registered only when key is present
- All other functionality works without any LLM configuration
