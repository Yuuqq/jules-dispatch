# Code Review: jules-dispatch

This document provides a thorough code review of the `@yuuqq/jules-dispatch` repository based on the stated review goals.

## CRITICAL

*No critical vulnerabilities or architectural flaws were found. The codebase is well-structured and follows safe practices for a CLI/MCP tool.*

## HIGH

### 1. Supply Chain Vulnerabilities (Security)
- **File:** `package.json` / `package-lock.json`
- **Impact:** `npm audit` reveals 15 vulnerabilities (2 critical, 7 high) in dependencies (e.g., `esbuild`, `hono`, `fast-uri`, `nanoid`, `ip-address`). While many of these are development dependencies or related to testing (`vitest`), if this package is used as an MCP server or in automated pipelines, compromised dependencies could lead to arbitrary code execution or DoS.
- **Fix:** Run `npm audit fix` to update dependencies. Some might require `npm audit fix --force` or manual version bumps (e.g., updating `vitest` which depends on vulnerable `esbuild`/`vite`).

## MEDIUM

### 1. `process.env` Mutation (Architecture / Security)
- **File:** `src/config.ts` (Lines: 15-17 in `loadProjectEnv`)
- **Impact:** The `loadProjectEnv` function reads `.env` and unconditionally assigns values to `process.env[key]`. While standard practice in many simple Node tools, mutating the global environment in a library/MCP server context can lead to unexpected side effects for the host process (e.g., Claude Code or Codex) if environment variables overlap or contain sensitive data meant to be isolated.
- **Fix:** Avoid mutating `process.env`. Instead, return the parsed `.env` config and merge it explicitly with `process.env` reads into a separate configuration object passed down through the app.

### 2. Unbounded JSON Payload parsing (Reliability)
- **File:** `src/client.ts` (Lines: 104-110 in `request`) and `src/planner.ts` (Line: 95)
- **Impact:** The code uses `await res.text()` followed by `JSON.parse(text)`. If the Jules API or a custom LLM planner endpoint returns an unusually large payload, buffering the entire text in memory and parsing it synchronously could block the event loop or cause an Out-Of-Memory (OOM) crash.
- **Fix:** Use streaming JSON parsers or enforce a maximum payload size before parsing, e.g., checking `Content-Length` (if provided) or truncating/rejecting responses that exceed a safe threshold (e.g., 5-10MB).

### 3. API Rate Limiting in Polling (Reliability)
- **File:** `src/polling.ts` (Lines: 110-140 in `pollSessions`)
- **Impact:** The polling mechanism loops through `stillRunning` sessions and calls `client.getSession` and `fetchActivityHistory` for each. Although it uses `concurrency` (default 10) for chunking, a user polling 50 sessions will fire 100 API requests every `interval` (default 10s). This risks hitting the Jules API rate limits (HTTP 429), even with the retry logic in `client.ts`.
- **Fix:** If the Jules API supports it, implement batch endpoints for status checks instead of individual requests. Alternatively, increase the default polling interval dynamically based on the number of sessions being polled.

### 4. Fat Controller / Giant File (Maintainability)
- **File:** `src/mcp.ts` (~560 lines)
- **Impact:** The MCP server implementation file defines the server, error wrappers, schemas, and all tools in a single large file. While currently manageable, adding more tools or complex schemas will reduce maintainability.
- **Fix:** Split tool definitions into separate files (e.g., `src/tools/dispatch.ts`, `src/tools/sessions.ts`) and register them in `mcp.ts` to keep the entrypoint clean and modular.

## LOW

### 1. Deprecated Tools in MCP Server (Developer Experience)
- **File:** `src/mcp.ts` (Lines: 120, 160, 203, 230, etc.)
- **Impact:** Several tools (e.g., `jules_dispatch_task`, `jules_status`) are marked `[DEPRECATED]` in their descriptions. However, they are still exposed to AI agents without any programmatic indication that they shouldn't be used (other than the text description). This can confuse agents who might still select them over the consolidated tools (`jules_dispatch`, `jules_monitor`).
- **Fix:** Consider removing deprecated tools entirely in the next major version, or if the MCP SDK supports a formal deprecation flag/status, use it.

### 2. Missing CLI Tests (Test Coverage)
- **File:** `src/cli.ts`
- **Impact:** Code coverage metrics indicate `src/cli.ts` has 0% line coverage. This is because the CLI behavior is tested via spawning a separate process (`tests/cli-behavior.test.ts`), which is an integration test and doesn't get picked up by the unit test coverage tool.
- **Fix:** Refactor the CLI logic to export a `run(args: string[])` function that can be imported and executed within the Vitest environment, rather than purely relying on `node:child_process` execution.

### 3. Missing Output Limits on Activity History (Reliability)
- **File:** `src/activity-history.ts`
- **Impact:** When fetching activity history, it paginates to find the last known cursor. If a session generates thousands of activities, the `fetchActivityHistory` function might make numerous sequential API calls, slowing down the polling loop or hitting rate limits.
- **Fix:** Impose a hard limit on the maximum number of pages or activities to fetch per polling cycle to prevent unbounded execution time.

## Solid Areas / Praise
- **Architecture:** The separation of concerns between `client.ts` (pure HTTP), `dispatcher.ts` (orchestration), and `config.ts` (setup) is clean and logical.
- **Error Handling:** The `translateError` function in `src/errors.ts` provides excellent developer experience by mapping cryptic HTTP errors into actionable hints.
- **Testing:** The use of `vitest` with comprehensive mocking of the `JulesClient` provides excellent unit test coverage (71% overall) and validates edge cases effectively.
- **Documentation:** The project includes high-quality, actionable documentation (`README.md`, `CLAUDE.md`, `SECURITY.md`) and uses clear code comments.
