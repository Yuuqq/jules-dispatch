# Roadmap: jules-dispatch

## Overview

Incremental optimization of a working CLI/MCP server. The journey starts with hardening the data foundation that everything else depends on, then consolidates the fragmented MCP tool surface into composable, agent-friendly tools, and finally builds the CLI progress dashboard on top of the now-reliable data layer. Each phase delivers a complete, verifiable capability without breaking existing contracts.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Status Derivation Testing** - Unit tests for deriveStatus() covering all session states
- [x] **Phase 2: Retry & Network Resilience** - Test and fix retry logic including network-level fetch errors
- [x] **Phase 3: Collector Error Surfacing** - Replace silent error swallowing with logged, surfaced errors
- [x] **Phase 4: Batch Dispatch Testing** - Unit tests for chunking, partial failure, and error aggregation
- [x] **Phase 5: MCP Response Standardization** - Consistent response shapes, error recovery hints, and annotations across all MCP tools
- [x] **Phase 6: MCP Orchestration Tools** - New consolidated dispatch, monitor, and interact tools with rich descriptions
- [x] **Phase 7: MCP Backward Compatibility** - Old tool names aliased to new tools, zero breakage during transition
- [x] **Phase 8: CLI Status Table** - Color-coded status table with state grouping
- [x] **Phase 9: CLI Watch Mode** - Live-refreshing status dashboard at configurable interval
- [x] **Phase 10: CLI Batch Progress** - Live dispatch progress and compact summary line

## Phase Details

### Phase 1: Status Derivation Testing
**Goal**: The deriveStatus() function is verified correct for every Jules session state
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01
**Success Criteria** (what must be TRUE):
  1. Unit tests pass for all six session states: PENDING, RUNNING, AWAITING_PLAN_APPROVAL, COMPLETED, FAILED, CANCELLED
  2. Edge cases covered: null session, missing fields, unexpected state values
  3. Running `vitest run` shows deriveStatus tests green with 80%+ coverage on that function
**Plans**: TBD

Plans:
- [x] 01-01: Test deriveStatus() for all session states and edge cases

### Phase 2: Retry & Network Resilience
**Goal**: HTTP and network-level errors are both retried with tested, reliable backoff
**Mode:** mvp
**Depends on**: Nothing (independent from Phase 1, but listed second for execution order)
**Requirements**: DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Retry logic correctly handles HTTP 429 with Retry-After header, 5xx errors, and max retry exhaustion
  2. DNS failures, connection refused, and timeout errors trigger the same backoff strategy as HTTP errors
  3. All retry scenarios covered by passing unit tests
**Plans**: TBD

Plans:
- [x] 02-01: Test and fix HTTP retry logic (429, 5xx, Retry-After, max exhaustion)
- [x] 02-02: Extend retry to network-level fetch errors with same backoff strategy

### Phase 3: Collector Error Surfacing
**Goal**: Users and agents see collector errors instead of silent failures
**Mode:** mvp
**Depends on**: Phase 1 (status derivation must be correct before collector errors are surfaced)
**Requirements**: DATA-04
**Success Criteria** (what must be TRUE):
  1. Activity fetch errors are logged with context (session ID, operation, error message)
  2. Wait polling errors are surfaced to the caller instead of silently caught
  3. No empty catch blocks remain in collector.ts
**Plans**: TBD

Plans:
- [x] 03-01: Replace silent error swallowing in collector with logged, surfaced errors

### Phase 4: Batch Dispatch Testing
**Goal**: Batch dispatch orchestration is verified correct for chunking and failure scenarios
**Mode:** mvp
**Depends on**: Nothing (independent, but benefits from Phase 2 retry fixes)
**Requirements**: DATA-05
**Success Criteria** (what must be TRUE):
  1. Unit tests cover chunking logic for N tasks across M concurrency slots
  2. Partial failure scenario tested: some tasks succeed, some fail, errors are aggregated correctly
  3. Error aggregation returns per-task failures with enough context to identify which task failed and why
**Plans**: TBD

Plans:
- [x] 04-01: Test batch dispatch chunking, partial failure, and error aggregation

### Phase 5: MCP Response Standardization
**Goal**: Every MCP tool returns consistent, agent-friendly responses with actionable error hints and correct annotations
**Mode:** mvp
**Depends on**: Phase 3 (collector errors surfaced cleanly, not silently lost)
**Requirements**: MCP-04, MCP-05, MCP-06, MCP-07
**Success Criteria** (what must be TRUE):
  1. All MCP tool responses follow `{ success, data?, error?, meta? }` shape
  2. Every tool has `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations set correctly
  3. Every tool description includes purpose, when-to-use guidance, expected output shape, and cross-references
  4. Every error response includes a `recovery_hint` field with a suggested next action
**Plans**: TBD

Plans:
- [x] 05-01: Standardize all MCP tool response shapes to { success, data?, error?, meta? }
- [x] 05-02: Add MCP annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint) to all tools
- [x] 05-03: Rewrite tool descriptions with purpose, guidance, output shape, and cross-references
- [x] 05-04: Add recovery_hint to all error responses

### Phase 6: MCP Orchestration Tools
**Goal**: AI agents can dispatch, monitor, and interact with sessions using single tool calls instead of composing fragmented tools
**Mode:** mvp
**Depends on**: Phase 5 (response standardization must be in place for new tools to follow the pattern)
**Requirements**: MCP-01, MCP-02, MCP-03
**Success Criteria** (what must be TRUE):
  1. An AI agent can dispatch 1-N tasks with a single `jules_dispatch` call
  2. An AI agent can monitor batch status and optionally wait for completion with a single `jules_monitor` call
  3. An AI agent can get full session context (state, plan, recent activities, PR) in one `jules_interact` call
  4. Each new tool returns the standardized response shape with rich description
**Plans**: TBD

Plans:
- [x] 06-01: Implement jules_dispatch consolidated tool (replaces dispatch_task + dispatch_batch)
- [x] 06-02: Implement jules_monitor consolidated tool (replaces status + wait_for_completion)
- [x] 06-03: Implement jules_interact consolidated tool (replaces get_session + get_plan + list_activities)

### Phase 7: MCP Backward Compatibility
**Goal**: Existing MCP integrations continue working unchanged during the tool consolidation transition
**Mode:** mvp
**Depends on**: Phase 6 (new tools must exist before old names can alias to them)
**Requirements**: MCP-08
**Success Criteria** (what must be TRUE):
  1. All original 12 MCP tool names still work when called by an AI agent
  2. Old tool names delegate to the new consolidated tools internally
  3. Old tool names show a deprecation notice in their description guiding users to the new names
  4. No existing MCP workflow breaks after the transition
**Plans**: TBD

Plans:
- [x] 07-01: Alias old tool names to new consolidated tools with deprecation descriptions

### Phase 8: CLI Status Table
**Goal**: Users can see all batch task states at a glance in a color-coded, grouped table
**Mode:** mvp
**Depends on**: Phase 1 (deriveStatus verified), Phase 3 (collector errors surfaced)
**Requirements**: CLI-01, CLI-03
**Success Criteria** (what must be TRUE):
  1. `jules-dispatch status` displays a table with columns: ID, title, state, elapsed time, PR URL
  2. States are color-coded: running (green), pending (yellow), completed (blue), failed (red), cancelled (gray)
  3. Sessions are grouped by state with running first, then pending, completed, failed, cancelled
  4. Table renders correctly in standard terminal width (80+ columns)
**Plans**: TBD
**UI hint**: yes

Plans:
- [x] 08-01: Implement color-coded status table with state grouping
- [x] 08-02: Integrate cli-table3 and wire into existing status command

### Phase 9: CLI Watch Mode
**Goal**: Users can monitor batch progress in real-time with an auto-refreshing terminal display
**Mode:** mvp
**Depends on**: Phase 8 (base status table must exist first)
**Requirements**: CLI-02
**Success Criteria** (what must be TRUE):
  1. `jules-dispatch status --watch` refreshes the status table at a configurable interval (default 5s)
  2. Terminal clears and redraws the full table on each refresh using ANSI escape sequences
  3. Watch mode exits cleanly on Ctrl+C or when all sessions reach terminal states (completed/failed/cancelled)
**Plans**: TBD
**UI hint**: yes

Plans:
- [x] 09-01: Implement --watch mode with ANSI terminal refresh and clean exit

### Phase 10: CLI Batch Progress
**Goal**: Users see live progress feedback during batch dispatch operations
**Mode:** mvp
**Depends on**: Phase 4 (batch dispatch tested), Phase 8 (status table for reference)
**Requirements**: CLI-04, CLI-05
**Success Criteria** (what must be TRUE):
  1. `jules-dispatch batch` shows per-task progress lines: `[3/20] Task title... dispatched`
  2. During execution, a compact summary line updates: `DONE 5 | RUNNING 3 | FAILED 1 | PENDING 11`
  3. Progress output does not interfere with JSON mode output (respects existing dual-output pattern)
**Plans**: TBD
**UI hint**: yes

Plans:
- [x] 10-01: Add per-task dispatch progress lines to batch command
- [x] 10-02: Add compact summary line during batch execution

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Status Derivation Testing | 1/1 | Complete | 2026-05-11 |
| 2. Retry & Network Resilience | 2/2 | Complete | 2026-05-11 |
| 3. Collector Error Surfacing | 1/1 | Complete | 2026-05-11 |
| 4. Batch Dispatch Testing | 1/1 | Complete | 2026-05-11 |
| 5. MCP Response Standardization | 4/4 | Complete | 2026-05-11 |
| 6. MCP Orchestration Tools | 3/3 | Complete | 2026-05-11 |
| 7. MCP Backward Compatibility | 1/1 | Complete | 2026-05-11 |
| 8. CLI Status Table | 2/2 | Complete | 2026-05-11 |
| 9. CLI Watch Mode | 1/1 | Complete | 2026-05-11 |
| 10. CLI Batch Progress | 2/2 | Complete | 2026-05-11 |
