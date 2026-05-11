---
name: Testing
description: Test infrastructure, current coverage, and coverage gaps
---

# Testing

## Test Runner

- **vitest 1.6** — no configuration file (uses defaults)
- Run command: `npm test`

## Current Coverage

### Existing Tests: `tests/log.test.ts` (16 tests)

| Describe Block | Tests | What's Covered |
|---------------|-------|---------------|
| `setVerbose / isVerbose` | 2 | Default state, toggle on/off |
| `verbose()` | 4 | Silent when off, prefixed output, Error formatting, object stringification |
| `debug()` | 5 | Silent when off, labeled output with timestamp, multiline indent, JSON pretty-print, Error stacks, body omitted |
| `timed()` | 4 | Returns result silently, logs ok timing, logs throw timing + re-throws, sync functions |

### Test Pattern
```typescript
// stderr capture via write mock
let stderrOutput: string[];
beforeEach(() => {
  originalWrite = process.stderr.write;
  process.stderr.write = ((chunk) => { stderrOutput.push(chunk); return true; });
});
afterEach(() => { process.stderr.write = originalWrite; });
```

## Coverage Gaps

### No Test Coverage (9 of 10 modules)

| Module | Lines | Risk Without Tests | Suggested Test Approach |
|--------|-------|-------------------|----------------------|
| `client.ts` | 198 | HIGH — retry logic, pagination, error handling | Mock fetch; test retry backoff, 429 handling, pagination with tokens, error status propagation |
| `dispatcher.ts` | 163 | HIGH — dispatch orchestration, parallel chunking | Mock JulesClient; test single dispatch, batch chunking, missing source error, dispatch log writing |
| `collector.ts` | 283 | HIGH — status derivation, polling loop, timeout | Mock client; test deriveStatus logic, wait timeout, failFast, NDJSON streaming |
| `planner.ts` | 283 | MEDIUM — LLM response parsing, env resolution | Mock fetch; test parsePlanJson (fence stripping, missing tasks), loadPlannerConfig env chain |
| `config.ts` | 108 | MEDIUM — .env parsing, YAML multi-doc, validation | Test .env parsing (export prefix, quotes, comments), loadTasks from YAML/JSON, validateTask errors |
| `mcp.ts` | 373 | MEDIUM — tool registration, error wrapping | Integration test with mock transport; test error wrapping, conditional planner tools |
| `output.ts` | 57 | LOW — simple emit/emitError logic | Test emit() in both modes, emitError() formats, ExitCode constants |
| `cli.ts` | 540 | LOW — mostly orchestration | Integration tests for command routing, exit codes |
| `types.ts` | 87 | LOW — type-only module | No runtime tests needed |

### Critical Untested Logic

1. **`deriveStatus()` (client.ts:181-197):** Maps session state + activities to normalized status — 6 state values, fallback to activity scan
2. **Retry logic (client.ts:38-49):** Exponential backoff calculation, jitter, Retry-After header handling
3. **`parsePlanJson()` (planner.ts:246-282):** Defensive JSON extraction from LLM output — code fence stripping, outermost `{}` extraction
4. **Batch parallel chunking (dispatcher.ts:107-114):** Correct slicing and Promise.all behavior
5. **Wait polling loop (collector.ts:186-279):** Timeout handling, failFast, status transitions

## CI Pipeline

```
.github/workflows/ci.yml
Matrix: Node 20, Node 22
Steps:
  1. typecheck (tsc --noEmit)
  2. test (vitest)
  3. build (tsc)
  4. smoke test (verify dist/cli.js exists and runs)
```

## Test Configuration

- No `vitest.config.ts` — uses defaults (looks for `**/*.test.ts`)
- No coverage thresholds configured
- No test setup/teardown files
