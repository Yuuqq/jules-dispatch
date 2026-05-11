# Milestone v1: Incremental Optimization

**Status:** SHIPPED 2026-05-11
**Phases:** 1-10
**Total Plans:** 16

## Overview

Incremental optimization of a working CLI/MCP server. Hardened the data foundation (phases 1-4), consolidated fragmented MCP tools into composable agent-friendly tools (phases 5-7), and built CLI progress dashboard (phases 8-10). Each phase delivered a complete, verifiable capability without breaking existing contracts.

## Phases

### Phase 1: Status Derivation Testing

**Goal**: The deriveStatus() function is verified correct for every Jules session state
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01
**Plans**: 1 plan

Plans:
- [x] 01-01: Test deriveStatus() for all session states and edge cases

**Success Criteria:**
1. Unit tests pass for all six session states: PENDING, RUNNING, AWAITING_PLAN_APPROVAL, COMPLETED, FAILED, CANCELLED
2. Edge cases covered: null session, missing fields, unexpected state values
3. Running `vitest run` shows deriveStatus tests green with 80%+ coverage on that function

### Phase 2: Retry & Network Resilience

**Goal**: HTTP and network-level errors are both retried with tested, reliable backoff
**Depends on**: Nothing
**Requirements**: DATA-02, DATA-03
**Plans**: 2 plans

Plans:
- [x] 02-01: Test and fix HTTP retry logic (429, 5xx, Retry-After, max exhaustion)
- [x] 02-02: Extend retry to network-level fetch errors with same backoff strategy

**Success Criteria:**
1. Retry logic correctly handles HTTP 429 with Retry-After header, 5xx errors, and max retry exhaustion
2. DNS failures, connection refused, and timeout errors trigger the same backoff strategy as HTTP errors
3. All retry scenarios covered by passing unit tests

### Phase 3: Collector Error Surfacing

**Goal**: Users and agents see collector errors instead of silent failures
**Depends on**: Phase 1
**Requirements**: DATA-04
**Plans**: 1 plan

Plans:
- [x] 03-01: Replace silent error swallowing in collector with logged, surfaced errors

**Success Criteria:**
1. Activity fetch errors are logged with context (session ID, operation, error message)
2. Wait polling errors are surfaced to the caller instead of silently caught
3. No empty catch blocks remain in collector.ts

### Phase 4: Batch Dispatch Testing

**Goal**: Batch dispatch orchestration is verified correct for chunking and failure scenarios
**Depends on**: Nothing
**Requirements**: DATA-05
**Plans**: 1 plan

Plans:
- [x] 04-01: Test batch dispatch chunking, partial failure, and error aggregation

**Success Criteria:**
1. Unit tests cover chunking logic for N tasks across M concurrency slots
2. Partial failure scenario tested: some tasks succeed, some fail, errors are aggregated correctly
3. Error aggregation returns per-task failures with enough context to identify which task failed and why

### Phase 5: MCP Response Standardization

**Goal**: Every MCP tool returns consistent, agent-friendly responses with actionable error hints and correct annotations
**Depends on**: Phase 3
**Requirements**: MCP-04, MCP-05, MCP-06, MCP-07
**Plans**: 4 plans

Plans:
- [x] 05-01: Standardize all MCP tool response shapes to { success, data?, error?, meta? }
- [x] 05-02: Add MCP annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) to all tools
- [x] 05-03: Rewrite tool descriptions with purpose, guidance, output shape, and cross-references
- [x] 05-04: Add recovery_hint to all error responses

**Success Criteria:**
1. All MCP tool responses follow { success, data?, error?, meta? } shape
2. Every tool has readOnlyHint, destructiveHint, idempotentHint, and openWorldHint annotations set correctly
3. Every tool description includes purpose, when-to-use guidance, expected output shape, and cross-references
4. Every error response includes a recovery_hint field with a suggested next action

### Phase 6: MCP Orchestration Tools

**Goal**: AI agents can dispatch, monitor, and interact with sessions using single tool calls instead of composing fragmented tools
**Depends on**: Phase 5
**Requirements**: MCP-01, MCP-02, MCP-03
**Plans**: 3 plans

Plans:
- [x] 06-01: Implement jules_dispatch consolidated tool (replaces dispatch_task + dispatch_batch)
- [x] 06-02: Implement jules_monitor consolidated tool (replaces status + wait_for_completion)
- [x] 06-03: Implement jules_interact consolidated tool (replaces get_session + get_plan + list_activities)

**Success Criteria:**
1. An AI agent can dispatch 1-N tasks with a single jules_dispatch call
2. An AI agent can monitor batch status and optionally wait for completion with a single jules_monitor call
3. An AI agent can get full session context (state, plan, recent activities, PR) in one jules_interact call
4. Each new tool returns the standardized response shape with rich description

### Phase 7: MCP Backward Compatibility

**Goal**: Existing MCP integrations continue working unchanged during the tool consolidation transition
**Depends on**: Phase 6
**Requirements**: MCP-08
**Plans**: 1 plan

Plans:
- [x] 07-01: Alias old tool names to new consolidated tools with deprecation descriptions

**Success Criteria:**
1. All original 12 MCP tool names still work when called by an AI agent
2. Old tool names delegate to the new consolidated tools internally
3. Old tool names show a deprecation notice in their description guiding users to the new names
4. No existing MCP workflow breaks after the transition

### Phase 8: CLI Status Table

**Goal**: Users can see all batch task states at a glance in a color-coded, grouped table
**Depends on**: Phase 1, Phase 3
**Requirements**: CLI-01, CLI-03
**Plans**: 2 plans

Plans:
- [x] 08-01: Implement color-coded status table with state grouping
- [x] 08-02: Integrate cli-table3 and wire into existing status command

**Success Criteria:**
1. `jules-dispatch status` displays a table with columns: ID, title, state, elapsed time, PR URL
2. States are color-coded: running (green), pending (yellow), completed (blue), failed (red), cancelled (gray)
3. Sessions are grouped by state with running first, then pending, completed, failed, cancelled
4. Table renders correctly in standard terminal width (80+ columns)

### Phase 9: CLI Watch Mode

**Goal**: Users can monitor batch progress in real-time with an auto-refreshing terminal display
**Depends on**: Phase 8
**Requirements**: CLI-02
**Plans**: 1 plan

Plans:
- [x] 09-01: Implement --watch mode with ANSI terminal refresh and clean exit

**Success Criteria:**
1. `jules-dispatch status --watch` refreshes the status table at a configurable interval (default 5s)
2. Terminal clears and redraws the full table on each refresh using ANSI escape sequences
3. Watch mode exits cleanly on Ctrl+C or when all sessions reach terminal states (completed/failed/cancelled)

### Phase 10: CLI Batch Progress

**Goal**: Users see live progress feedback during batch dispatch operations
**Depends on**: Phase 4, Phase 8
**Requirements**: CLI-04, CLI-05
**Plans**: 2 plans

Plans:
- [x] 10-01: Add per-task dispatch progress lines to batch command
- [x] 10-02: Add compact summary line during batch execution

**Success Criteria:**
1. `jules-dispatch batch` shows per-task progress lines: [3/20] Task title... dispatched
2. During execution, a compact summary line updates: DONE 5 | RUNNING 3 | FAILED 1 | PENDING 11
3. Progress output does not interfere with JSON mode output (respects existing dual-output pattern)

---

## Milestone Summary

**Key Decisions:**
- Network-level TypeError now retried with exponential backoff
- MCP responses use { success, data?, error?, meta? } shape
- 14 MCP tools total: 12 original + 3 consolidated - 1 overlap = 15 registered
- Old tool names deprecated with description notices
- cli-table3 for status table rendering
- Watch mode with SIGINT handler and auto-exit on terminal states

**Issues Resolved:**
- Silent error swallowing in collector replaced with debug() logging
- Network fetch errors (DNS, connection refused) now retried with same backoff as HTTP errors
- MCP tool fragmentation reduced from 12 individual tools to 3 high-level orchestration tools
- No progress visibility for CLI batch operations

**Technical Debt Incurred:**
- MCP tools (mcp.ts, 665 lines) have zero test coverage
- Polling loop logic duplicated 3x across mcp.ts and collector.ts
- Deprecated tools are full reimplementations, not thin wrappers
- CLI UI output not covered by automated tests

---

_For current project status, see .planning/ROADMAP.md_
