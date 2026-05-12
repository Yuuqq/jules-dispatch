# Phase 16: Error Message Infrastructure - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a structured error translation layer (`src/errors.ts`) that converts raw errors (network TypeErrors, HTTP status codes, validation failures) into actionable Problem/Cause/Fix messages. Enhance `emitError()` to accept optional `ErrorContext` with `hint` and `docsUrl`. Rewrite all cli.ts catch blocks to use the translator. Also integrate translation into `dispatcher.ts` so both CLI and MCP consume structured errors.

</domain>

<decisions>
## Implementation Decisions

### Text-Mode Formatting
- **D-01:** Multi-line labeled format with Problem/Cause/Fix each on its own line
  ```
  ✗ Authentication failed
    Problem: Your API key was rejected by the Jules API.
    Cause:   The key is invalid or has expired.
    Fix:     Run `jules-dispatch init` or check your .env file.
  ```

### Color Treatment
- **D-02:** Differentiated colors — Problem red, Cause dim gray, Fix green/cyan. First line red bold. Ensures visual hierarchy and quick scanning.

### JSON Output Structure
- **D-03:** `hint` and `docsUrl` flat inside the `error` object (backward-compatible):
  ```json
  { "error": { "code": "AUTH_FAILED", "message": "...", "hint": "Run init", "docsUrl": "..." } }
  ```

### Error Catalog Scope
- **D-04:** Core scenario coverage — network errors (TypeError after retry exhaustion) + HTTP status codes (401, 403, 404, 429, 5xx) + config errors (missing API key, missing source). Task validation and file I/O errors remain raw for now.

### docsUrl Target
- **D-05:** GitHub README section anchors (e.g., `https://github.com/user/jules-dispatch#authentication-errors`). Will 404 until Phase 19 writes docs — acceptable.

### Dispatcher Integration
- **D-06:** Error translation happens in `dispatcher.ts`. `DispatchResult.error` contains the translated message. Both cli.ts and MCP consume it directly. MCP layer must avoid double-translation (existing `computeRecoveryHint()` needs adaptation).

### Claude's Discretion
- Exact HTTP status code → Problem/Cause/Fix mapping text content
- Error code string naming convention (e.g., `AUTH_FAILED`, `NETWORK_ERROR`)
- How to handle the `tail` command's inline error handling (cli.ts:400-401) which bypasses `emitError` entirely

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Error Output
- `src/output.ts` — Current `emitError()` signature and dual-mode output logic (lines 26-34)
- `src/output.ts:49-57` — Exit code constants (0-5, locked)
- `src/mcp-helpers.ts` — Existing `computeRecoveryHint()` for MCP error responses

### Error Sources
- `src/client.ts:21-74` — `JulesClient.request()` retry logic, error shape (`.status` on Error), network TypeError handling
- `src/config.ts:12-51` — `loadConfig()` error paths (missing API key, noExit mode)
- `src/config.ts:53-107` — Task validation errors (`validateTask`, `loadTasks`)
- `src/dispatcher.ts:20-72` — `dispatchTaskDefinition()` catch block, `DispatchResult.error` field

### Error Consumers
- `src/cli.ts:39-42` — `fail()` helper
- `src/cli.ts:191,253,285,304,323` — Command catch blocks (get, message, plan, approve, cancel)
- `src/cli.ts:400-401` — `tail` command inline error handling
- `src/cli.ts:442,457,516,533` — planner command catch blocks
- `src/cli.ts:604-612` — Unhandled rejection + parseAsync catch
- `src/mcp.ts:39-58` — MCP tool() helper error wrapping

### Project Context
- `.planning/REQUIREMENTS.md` — ERR-01, ERR-02, ERR-03 definitions
- `.planning/ROADMAP.md` — Phase 16 success criteria (4 items)
- `.planning/PROJECT.md` — Key Decisions table, constraints

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `emitError(message, code?, details?)` in `output.ts:26-34` — existing dual-mode error output, will be enhanced with ErrorContext param
- `fail(message, code, errCode?)` in `cli.ts:39-42` — wraps emitError + process.exit, called from ~12 sites
- `ExitCode` constants in `output.ts:49-57` — 0-5 exit codes, stable
- `computeRecoveryHint()` in `mcp-helpers.ts` — existing recovery hint logic for MCP, may need adaptation to avoid duplication with new error translator
- `client.ts:66-68` — HTTP errors have `.status` property on Error object, key input for status-code-based translation

### Established Patterns
- Dual output mode: every user-facing output goes through `emit(textFn, jsonObj)` or `emitError(textFn, jsonShape)` — new error output must follow this pattern
- Immutable objects: error translation functions should create new structured objects, not mutate the Error
- Flat `src/` directory: new `errors.ts` module lives alongside existing modules

### Integration Points
- `src/errors.ts` — new module, imported by cli.ts and dispatcher.ts
- `src/output.ts:26-34` — `emitError()` signature changes (additive, backward-compatible)
- `src/dispatcher.ts:61-71` — catch block needs to call error translator before building DispatchResult
- `src/cli.ts` — all catch blocks call `fail()` or `emitError()` with translated errors
- `src/types.ts` — may need `ErrorContext` interface definition

</code_context>

<specifics>
## Specific Ideas

- Error categories should map cleanly to the 6 exit codes: GENERIC, AUTH, VALIDATION, PARTIAL, TIMEOUT
- The `hint` field should contain a single actionable command (e.g., "Run `jules-dispatch init`"), not a paragraph
- The `tail` command (cli.ts:400-401) currently uses raw `console.error` — must migrate to `emitError` with translation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 16-Error Message Infrastructure*
*Context gathered: 2026-05-12*
