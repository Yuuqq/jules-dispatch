---
name: Concerns
description: Codebase concerns — security, reliability, quality, and API stability issues
---

# Concerns

## HIGH Severity

### H1: Minimal Test Coverage
- **Location:** `tests/` — only `log.test.ts` exists
- **Description:** 9 of 10 source modules have zero test coverage. Core business logic (dispatch orchestration, status derivation, LLM response parsing, retry logic) is completely untested.
- **Impact:** Regressions in retry logic, status mapping, or batch dispatch could break production usage silently. The `deriveStatus()` function (client.ts:181-197) is especially critical — it determines whether a session is completed, failed, or still running.
- **Remediation:** Prioritize tests for `client.ts` (deriveStatus, retry), `dispatcher.ts` (batch chunking), `config.ts` (task loading/validation), and `planner.ts` (parsePlanJson).

### H2: Silent Error Swallowing in Collector
- **Location:** `collector.ts:80-83`, `collector.ts:221-223`
- **Description:** Catch blocks silently ignore errors when fetching activities for a session or during wait polling.
- **Impact:** Network errors or API failures during status collection are invisible to the user. A session could appear "running" indefinitely when it's actually unreachable.
- **Remediation:** Log errors in verbose mode at minimum; surface transient errors in text output with a warning.

## MEDIUM Severity

### M1: API Keys Exposed via CLI Flags
- **Location:** `cli.ts:22-24` (`--api-key`, `--llm-key`)
- **Description:** API keys can be passed as CLI flags, which appear in process listings (`ps aux`), shell history, and potentially log aggregators.
- **Impact:** Credential leakage in shared environments or CI logs.
- **Remediation:** Recommend env vars in documentation; warn when keys are passed via flags in verbose mode.

### M2: Unstable API Version
- **Location:** `client.ts:4` — `https://jules.googleapis.com/v1alpha`
- **Description:** The Google Jules API is at v1alpha, which carries no stability guarantee. Endpoints, request/response schemas, or auth mechanisms could change without notice.
- **Impact:** Breaking changes could affect all users simultaneously with no migration path.
- **Remediation:** Pin API behavior in tests; add version negotiation or feature detection if a stable API becomes available.

### M3: No Network Error Retry
- **Location:** `client.ts:34` — `fetch()` call
- **Description:** Retry logic only triggers on HTTP 429/5xx status codes. Network-level failures (DNS errors, connection refused, timeouts) cause `fetch()` to throw, which bypasses the retry logic entirely.
- **Impact:** Transient network issues (common in CI environments) cause immediate failure instead of retry.
- **Remediation:** Wrap fetch call in try/catch within the retry loop; retry on `TypeError` (network errors) and `DOMException` (abort/timeout).

### M4: `any` Casts in MCP Module
- **Location:** `mcp.ts:58`, `mcp.ts:255`
- **Description:** Two `as any` casts to work around SDK generic inference.
- **Impact:** Loses type safety at the MCP boundary; refactors could introduce runtime errors not caught by the type checker.
- **Remediation:** Investigate if newer SDK versions have better generic inference; add runtime validation as a safety net.

### M5: Dead Code
- **Location:** `mcp.ts:373` — `void resolve;`
- **Description:** Import of `resolve` from `node:path` kept "for potential future use" with a void suppression.
- **Impact:** Misleading — suggests the import serves a purpose.
- **Remediation:** Remove the unused import. Re-add when needed.

### M6: Silent autoMode Fallback
- **Location:** `config.ts:42` — empty string defaults to `AUTO_CREATE_PR`
- **Description:** If `JULES_AUTO_MODE` is unset or empty, sessions default to `AUTO_CREATE_PR`, which automatically creates pull requests.
- **Impact:** Users unaware of this default may get unexpected PRs created in their repositories.
- **Remediation:** Document the default prominently in README; consider making `NONE` the safe default.

## LOW Severity

### L1: Polling Without Backoff
- **Location:** `collector.ts:248` — `await sleep(interval)`, `cli.ts:332` — `setTimeout(r, interval)`
- **Description:** Both `wait` and `tail` commands poll at fixed intervals with no backoff.
- **Impact:** Unnecessary API load for long-running sessions.
- **Remediation:** Consider increasing interval over time (e.g., double after each poll).

### L2: Large CLI Entry File
- **Location:** `cli.ts` (~540 lines)
- **Description:** Single file handles all 13 commands, global options, and error wrapping.
- **Impact:** Harder to navigate; merge conflicts in active development.
- **Remediation:** Extract command handlers into separate files if more commands are added.

### L3: Unused Dependency
- **Location:** `package.json:20` — `dotenv ^16.4.0`
- **Description:** `dotenv` is listed as a dependency but never imported. The `.env` loading is done manually in `config.ts`.
- **Impact:** Unnecessary package in production bundle.
- **Remediation:** Remove from dependencies if the manual parser is sufficient.

### L4: Error Response Body Truncation
- **Location:** `client.ts:54` — `body.slice(0, 400)`
- **Description:** API error response bodies are truncated to 400 characters in error messages.
- **Impact:** May lose useful debugging information from API errors.
- **Remediation:** Include full body in verbose/debug output; keep truncated version in the thrown error message.

### L5: No Rate Limiting on Batch Dispatch
- **Location:** `dispatcher.ts:107` — parallel chunking with default of 10
- **Description:** Users can set `--parallel 50`, potentially hitting API rate limits.
- **Impact:** Batch dispatches could be rate-limited or throttled by the Jules API.
- **Remediation:** Document the maximum recommended parallelism; the retry logic handles 429s gracefully, so this is low risk.
