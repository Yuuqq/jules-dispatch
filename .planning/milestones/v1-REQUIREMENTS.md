# Requirements Archive — v1 Incremental Optimization

**Shipped:** 2026-05-11
**Status:** All 18 requirements satisfied

## v1 Requirements (COMPLETE)

### MCP Tool Redesign

- [x] **MCP-01**: AI agent can dispatch 1-N tasks with a single tool call (jules_dispatch) — Phase 6
- [x] **MCP-02**: AI agent can monitor batch status and optionally wait for completion (jules_monitor) — Phase 6
- [x] **MCP-03**: AI agent can get full session context in one call (jules_interact) — Phase 6
- [x] **MCP-04**: Every MCP tool has readOnlyHint, destructiveHint, idempotentHint, openWorldHint annotations — Phase 5
- [x] **MCP-05**: Every MCP tool description includes purpose, when-to-use guidance, output shape, cross-references — Phase 5
- [x] **MCP-06**: Every MCP tool error response includes recovery_hint with suggested next action — Phase 5
- [x] **MCP-07**: All MCP tool responses follow { success, data?, error?, meta? } shape — Phase 5
- [x] **MCP-08**: Existing tool names remain as aliases during transition — Phase 7

### Data Foundation

- [x] **DATA-01**: deriveStatus() has unit tests covering all Jules session states — Phase 1
- [x] **DATA-02**: Retry logic has unit tests covering HTTP 429, 5xx, Retry-After, max exhaustion — Phase 2
- [x] **DATA-03**: Network-level fetch errors retried with same backoff strategy — Phase 2
- [x] **DATA-04**: Collector errors logged and surfaced instead of silently swallowed — Phase 3
- [x] **DATA-05**: Batch dispatch orchestration has unit tests covering chunking, partial failure, error aggregation — Phase 4

### CLI Progress & Visibility

- [x] **CLI-01**: Status displays color-coded table with ID, title, state, elapsed time, PR URL — Phase 8
- [x] **CLI-02**: Status --watch refreshes at configurable interval with ANSI terminal refresh — Phase 9
- [x] **CLI-03**: Status groups sessions by state (running, pending, completed, failed, cancelled) — Phase 8
- [x] **CLI-04**: Batch shows live progress during dispatch ([3/20] Task title... dispatched) — Phase 10
- [x] **CLI-05**: Batch shows compact summary line (DONE 5 | RUNNING 3 | FAILED 1 | PENDING 11) — Phase 10

## Traceability (Final)

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-01 | Phase 6 | Satisfied |
| MCP-02 | Phase 6 | Satisfied |
| MCP-03 | Phase 6 | Satisfied |
| MCP-04 | Phase 5 | Satisfied |
| MCP-05 | Phase 5 | Satisfied |
| MCP-06 | Phase 5 | Satisfied |
| MCP-07 | Phase 5 | Satisfied |
| MCP-08 | Phase 7 | Satisfied |
| DATA-01 | Phase 1 | Satisfied |
| DATA-02 | Phase 2 | Satisfied |
| DATA-03 | Phase 2 | Satisfied |
| DATA-04 | Phase 3 | Satisfied |
| DATA-05 | Phase 4 | Satisfied |
| CLI-01 | Phase 8 | Satisfied |
| CLI-02 | Phase 9 | Satisfied |
| CLI-03 | Phase 8 | Satisfied |
| CLI-04 | Phase 10 | Satisfied |
| CLI-05 | Phase 10 | Satisfied |

## Deferred to v2

- MCP-D01: Response format control (concise/detailed)
- MCP-D02: Cross-tool navigation hints
- MCP-D03: Output schema declarations
- MCP-D04: MCP Prompts for guided workflows
- MCP-D05: Configurable toolsets
- CLI-D01: First-run validation (doctor command)
- CLI-D02: Exponential backoff with jitter for polling

---

*Archived: 2026-05-11*
