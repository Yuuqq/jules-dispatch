# Code Review: jules-dispatch

This document provides a thorough code review of the `@yuuqq/jules-dispatch` repository based on the stated review goals.

*Generated against commit `b53a0ce`; this is a point-in-time review and not a living SLA.*

## CRITICAL

*No critical vulnerabilities or architectural flaws were found for reachable code in production environments. There are no direct RCE or auth bypasses.*

## HIGH

### 1. Minimal Test Coverage in Core Modules (Reliability)
- **File:** `tests/` and `src/*.ts`
- **Impact:** 9 of 10 source modules had zero test coverage initially (as noted in `CONCERNS.md`). Core business logic (`dispatcher.ts`, `client.ts` deriveStatus) has limited unit test coverage. While overall statement coverage is ~71%, `src/cli.ts` shows 0% coverage under v8 because CLI spawn tests in `tests/cli-behavior.test.ts` don't trigger the test runner's coverage tool correctly.
- **Fix:** Refactor the CLI logic to export a `run(args: string[])` function that can be imported and executed within the Vitest environment for proper coverage tracking. Prioritize tests for critical paths.

### 2. Planner `baseUrl` Credential Forwarding (Security)
- **File:** `src/planner.ts:170, 242`, `src/mcp.ts:478-485`
- **Impact:** `jules_plan_tasks` and `jules_auto` accept `baseUrl` from agents and then call `fetch('${cfg.baseUrl}/chat/completions')` forwarding the MCP host's LLM API key via `Authorization: Bearer <key>`. This introduces a credential-bearing Server-Side Request Forgery (SSRF) risk from the MCP host network.
- **Fix:** Document this clearly, provide an optional allowlist for `baseUrl` endpoints, or limit it by design for trusted local agents (like Ollama).

## MEDIUM

### 1. Environment Proxy Injection (Security)
- **File:** `src/config.ts:18-20` (in `loadProjectEnv`)
- **Impact:** The `loadProjectEnv` function reads `.env` and fills unset variables on `process.env`. While it respects existing variables (fill-if-unset), an untrusted project's `.env` could populate unset `HTTP_PROXY`, `HTTPS_PROXY`, or `NODE_TLS_REJECT_UNAUTHORIZED`. This could be exploited to redirect Jules/LLM traffic (including `X-Goog-Api-Key` and `Authorization` headers) off-box before `fetch()` occurs.
- **Fix:** Consider explicit whitelisting of environment variables loaded from project `.env` files rather than merging blindly, or avoid touching global `process.env` completely.

### 2. API Rate Limiting and Unbounded Requests in Polling (Reliability)
- **File:** `src/mcp.ts:380-398`, `src/activity-history.ts`, `src/client.ts:224-230`
- **Impact:**
  - `jules_monitor` with `wait=true` summarizes every id, then runs `pollSessions`, then summarizes again resulting in three full get+history passes for every session polled. This magnifies Jules API rate limit issues.
  - When fetching activity history, `fetchActivityHistory` walks every page up to the live edge even with `initialLimit: 10`. Subsequent polls mostly reuse the token to fetch one page, but the initial pass is costly.
  - `JulesClient.getLatestPlan` iterates the entire activity log on every `jules_get_plan` call with no initial limit.
- **Fix:** Implement batch endpoints for status checks instead of individual requests if supported by `v1alpha`. Optimize the `getLatestPlan` to prevent iterating the entire unbounded activity log.

### 3. Stale MCP Advertised Version (Correctness)
- **File:** `src/mcp.ts:45`
- **Impact:** `createMcpServer` hardcodes `version: '1.2.0'` while `package.json` / `server.json` versions drift (e.g. `1.3.2`). This provides incorrect MCP handshake metadata to clients.
- **Fix:** Dynamically pull the version from `package.json` just like the CLI does in `src/cli.ts`.

## LOW

### 1. Deprecated Tools and Incorrect Linking in MCP Server (Developer Experience)
- **File:** `src/mcp.ts`
- **Impact:** Deprecated aliases (e.g. `jules_status`) exist, and agents will still pick them. A worse issue is that live/active tools have `See also` references pointing back to the dead names (e.g. `jules_list_sources` points to `jules_dispatch_task`, `jules_list_sessions` points to `jules_status`). This steers AI agents onto deprecated tools.
- **Fix:** Update the `See also` references of active tools to only mention current non-deprecated tools, and eventually remove deprecated tools.

### 2. Supply Chain Vulnerabilities (Hygiene)
- **File:** `package.json` / `package-lock.json`
- **Impact:** `npm audit` shows vulnerabilities. However, most are in `devDependencies` (`vitest`, `esbuild`) and are not shipped. Transitive production vulnerabilities from `@modelcontextprotocol/sdk` (`hono`, `ip-address`, `qs`) exist but are unreachable since this package operates as an stdio server and does not serve HTTP or JSX.
- **Fix:** Keep dependencies updated during regular maintenance cycles, but no immediate or `--force` action is required since no exploitable paths were identified for production use.

## Solid Areas / Praise
- **Architecture:** The separation of concerns between `client.ts` (pure HTTP), `dispatcher.ts` (orchestration), and `config.ts` (setup) is clean and logical.
- **Documentation & Prior Reviews:** The project includes high-quality, actionable documentation (`README.md`, `CLAUDE.md`, `SECURITY.md`) and maintains a helpful internal `.planning/codebase/CONCERNS.md`.

---
*Note: This review reconciles past internal issues tracked in \`.planning/codebase/CONCERNS.md\` and drops invalid claims from previous automated scans.*
