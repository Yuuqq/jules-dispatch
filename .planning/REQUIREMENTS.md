# Requirements: jules-dispatch

**Defined:** 2026-05-11
**Core Value:** Turn Jules from a one-at-a-time tool into a massively parallel coding workforce, controlled seamlessly by either humans on the CLI or AI agents over MCP.

## v1 Requirements

Requirements for incremental optimization. Each maps to roadmap phases.

### MCP Tool Redesign

- [ ] **MCP-01**: AI agent can dispatch 1-N tasks with a single tool call (`jules_dispatch` replaces `jules_dispatch_task` + `jules_dispatch_batch`)
- [ ] **MCP-02**: AI agent can monitor batch status and optionally wait for completion in a single tool call (`jules_monitor` replaces `jules_status` + `jules_wait_for_completion`)
- [ ] **MCP-03**: AI agent can get full session context (state, plan, recent activities, PR) in one call (`jules_interact` replaces `jules_get_session` + `jules_get_plan` + `jules_list_activities`)
- [ ] **MCP-04**: Every MCP tool has `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations set correctly
- [ ] **MCP-05**: Every MCP tool description includes purpose, when-to-use guidance, expected output shape, and cross-references to related tools
- [ ] **MCP-06**: Every MCP tool error response includes a `recovery_hint` field with suggested next action
- [ ] **MCP-07**: All MCP tool responses follow a consistent `{ success, data?, error?, meta? }` shape
- [ ] **MCP-08**: Existing tool names remain as aliases during transition (backward compatibility)

### Data Foundation

- [ ] **DATA-01**: `deriveStatus()` has unit tests covering all Jules session states (PENDING, RUNNING, AWAITING_PLAN_APPROVAL, COMPLETED, FAILED, CANCELLED)
- [ ] **DATA-02**: Retry logic has unit tests covering HTTP 429, 5xx, Retry-After header, max retry exhaustion
- [ ] **DATA-03**: Network-level fetch errors (DNS, connection refused, timeout) are retried with the same backoff strategy as HTTP errors
- [ ] **DATA-04**: Collector errors during activity fetching and wait polling are logged and surfaced to the user instead of silently swallowed
- [ ] **DATA-05**: Batch dispatch orchestration has unit tests covering chunking, partial failure, and error aggregation

### CLI Progress & Visibility

- [ ] **CLI-01**: `jules-dispatch status` displays a color-coded table with columns: ID, title, state, elapsed time, PR URL
- [ ] **CLI-02**: `jules-dispatch status --watch` refreshes the status table at a configurable interval with ANSI terminal refresh
- [ ] **CLI-03**: `jules-dispatch status` groups sessions by state (running first, then pending, completed, failed, cancelled)
- [ ] **CLI-04**: `jules-dispatch batch` shows live progress during dispatch (`[3/20] Task title... dispatched`)
- [ ] **CLI-05**: `jules-dispatch batch` shows a compact summary line during execution (`DONE 5 | RUNNING 3 | FAILED 1 | PENDING 11`)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### MCP Advanced

- **MCP-D01**: Response format control — `format: "concise" | "detailed"` parameter on status/session tools
- **MCP-D02**: Cross-tool navigation hints — `suggested_next` field in key tool responses
- **MCP-D03**: Output schema declarations (`outputSchema`) on all MCP tools
- **MCP-D04**: MCP Prompts for guided workflow templates (`registerPrompt`)
- **MCP-D05**: Configurable toolsets — load subset of tools based on use case

### CLI Advanced

- **CLI-D01**: First-run validation (`jules-dispatch doctor`)
- **CLI-D02**: Exponential backoff with jitter for polling (status --watch, tail)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full-screen TUI (blessed/Ink) | Overkill for snapshot table; Nx explicitly notes Windows incompatibility |
| Web dashboard / browser UI | Adds deployment complexity; JSON output feeds external dashboards |
| Streaming MCP notifications | Requires persistent connections; polling works for agents |
| Plugin/extension system | Premature abstraction; no user demand |
| Multi-agent orchestration | MCP client is the orchestrator; provide good primitives |
| MCP SDK v2 migration | Separate milestone; all needed APIs available in v1.29.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-01 | Phase 6 | Pending |
| MCP-02 | Phase 6 | Pending |
| MCP-03 | Phase 6 | Pending |
| MCP-04 | Phase 5 | Pending |
| MCP-05 | Phase 5 | Pending |
| MCP-06 | Phase 5 | Pending |
| MCP-07 | Phase 5 | Pending |
| MCP-08 | Phase 7 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 3 | Pending |
| DATA-05 | Phase 4 | Pending |
| CLI-01 | Phase 8 | Pending |
| CLI-02 | Phase 9 | Pending |
| CLI-03 | Phase 8 | Pending |
| CLI-04 | Phase 10 | Pending |
| CLI-05 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 after roadmap creation*
