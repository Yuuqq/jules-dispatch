# Requirements: jules-dispatch

**Defined:** 2026-05-11
**Core Value:** Turn Jules from a one-at-a-time tool into a massively parallel coding workforce, controlled seamlessly by either humans on the CLI or AI agents over MCP.

## v2 Requirements

Requirements for reliability and onboarding. Each maps to roadmap phases.

### MCP Test Coverage

- [ ] **MCP-09**: All 3 consolidated MCP tools (jules_dispatch, jules_monitor, jules_interact) have unit tests covering happy path, error handling, and edge cases
- [ ] **MCP-10**: MCP response helpers (ok/fail) and error wrapper (recovery_hint computation) have unit tests
- [ ] **MCP-11**: All 7 deprecated tool aliases have tests verifying they still function correctly

### Polling Deduplication

- [ ] **POLL-01**: Wait-for-completion polling logic is extracted into a single shared function used by all 3 current implementations (jules_wait_for_completion, jules_monitor, collector.waitForCompletion)

### Deprecated Tool Refactoring

- [ ] **DEP-01**: All 7 deprecated MCP tools are refactored from full reimplementations to thin wrappers that delegate to the consolidated tools

### Doctor Command

- [ ] **DOC-01**: `jules-dispatch doctor` validates environment (Node.js version, npm availability)
- [ ] **DOC-02**: `jules-dispatch doctor` checks JULES_API_KEY is set and validates connectivity to Jules API
- [ ] **DOC-03**: `jules-dispatch doctor` validates task file format (if path provided) and reports errors

## v1 Requirements (Archived)

See .planning/milestones/v1-REQUIREMENTS.md for full v1 requirements and traceability.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full-screen TUI (blessed/Ink) | Overkill for snapshot table |
| Web dashboard / browser UI | Adds deployment complexity; JSON output feeds external dashboards |
| Streaming MCP notifications | Requires persistent connections; polling works for agents |
| Plugin/extension system | Premature abstraction; no user demand |
| Multi-agent orchestration | MCP client is the orchestrator; provide good primitives |
| MCP SDK v2 migration | Separate milestone; all needed APIs available in v1.29.0 |
| Response format control (concise/detailed) | Deferred to v3 |
| Cross-tool navigation hints (suggested_next) | Deferred to v3 |
| Output schema declarations (outputSchema) | Deferred to v3 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MCP-09 | Phase 11 | Pending |
| MCP-10 | Phase 11 | Pending |
| MCP-11 | Phase 14 | Pending |
| POLL-01 | Phase 12 | Pending |
| DEP-01 | Phase 13 | Pending |
| DOC-01 | Phase 15 | Pending |
| DOC-02 | Phase 15 | Pending |
| DOC-03 | Phase 15 | Pending |

**Coverage:**
- v2 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 after v2 roadmap creation*
