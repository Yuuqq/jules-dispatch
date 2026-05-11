# Roadmap: jules-dispatch

## Milestones

- **v1 — Incremental Optimization** (shipped 2026-05-11)

## Phases

<details>
<summary>v1 — Incremental Optimization (Phases 1-10) — SHIPPED 2026-05-11</summary>

- [x] Phase 1: Status Derivation Testing (1/1 plan) — completed 2026-05-11
- [x] Phase 2: Retry & Network Resilience (2/2 plans) — completed 2026-05-11
- [x] Phase 3: Collector Error Surfacing (1/1 plan) — completed 2026-05-11
- [x] Phase 4: Batch Dispatch Testing (1/1 plan) — completed 2026-05-11
- [x] Phase 5: MCP Response Standardization (4/4 plans) — completed 2026-05-11
- [x] Phase 6: MCP Orchestration Tools (3/3 plans) — completed 2026-05-11
- [x] Phase 7: MCP Backward Compatibility (1/1 plan) — completed 2026-05-11
- [x] Phase 8: CLI Status Table (2/2 plans) — completed 2026-05-11
- [x] Phase 9: CLI Watch Mode (1/1 plan) — completed 2026-05-11
- [x] Phase 10: CLI Batch Progress (2/2 plans) — completed 2026-05-11

</details>

### v2 — Reliability & Onboarding

- [x] **Phase 11: MCP Response Helpers & Consolidated Tool Tests** - Test coverage for ok/fail helpers, error wrapper, and all 3 consolidated MCP tools (completed 2026-05-11)
- [x] **Phase 12: Polling Deduplication** - Extract shared polling function from 3 duplicate implementations (completed 2026-05-11)
- [ ] **Phase 13: Deprecated Tool Refactoring** - Refactor 7 deprecated tools from full reimplementations to thin wrappers
- [ ] **Phase 14: Deprecated Alias Tests** - Verify all 7 deprecated tool aliases work correctly via tests
- [ ] **Phase 15: Doctor Command** - First-run environment validation, API connectivity, task file checking

## Phase Details

### Phase 11: MCP Response Helpers & Consolidated Tool Tests
**Goal**: The MCP layer has a safety net of tests covering all consolidated tools and their shared helpers
**Depends on**: Nothing (first v2 phase)
**Requirements**: MCP-09, MCP-10
**Success Criteria** (what must be TRUE):
  1. Running `npm test` executes tests for all 3 consolidated MCP tools (jules_dispatch, jules_monitor, jules_interact) covering happy path, error handling, and edge cases -- MCP-09
  2. ok/fail response helpers produce correct { success, data?, error?, meta? } shapes for all input types -- MCP-10
  3. Error wrapper recovery_hint computation is verified for known error categories (auth, validation, timeout, network) -- MCP-10
**Plans**: 2 plans

Plans:
**Wave 1**
- [x] 11-01-PLAN.md — Extract ok/fail/computeRecoveryHint to src/mcp-helpers.ts and write unit tests

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 11-02-PLAN.md — Integration tests for all 3 consolidated MCP tools via InMemoryTransport

### Phase 12: Polling Deduplication
**Goal**: Wait-for-completion polling logic exists as a single shared function used everywhere
**Depends on**: Phase 11
**Requirements**: POLL-01
**Success Criteria** (what must be TRUE):
  1. A single `pollSessions` function is exported and consumed by all 3 former implementations (jules_wait_for_completion, jules_monitor, collector.waitForCompletion) -- POLL-01
  2. The shared function preserves all existing behavior: timeout handling, polling interval, terminal state detection -- POLL-01
  3. No duplicate polling logic remains in the codebase -- POLL-01
**Plans**: 1 plan

Plans:
**Wave 1**
- [x] 12-01-PLAN.md — Extract shared pollSessions to src/polling.ts with tests, refactor all 3 consumers

### Phase 13: Deprecated Tool Refactoring
**Goal**: Deprecated MCP tools delegate to consolidated tools instead of containing duplicate business logic
**Depends on**: Phase 11, Phase 12
**Requirements**: DEP-01
**Success Criteria** (what must be TRUE):
  1. Each of the 7 deprecated MCP tools is a thin wrapper (argument mapping + delegation call) with no duplicated business logic -- DEP-01
  2. Existing MCP clients using deprecated tool names receive identical responses to using consolidated tools -- DEP-01
  3. The total lines of code in mcp.ts decreases significantly from the 578-line baseline -- DEP-01
**Plans**: 1 plan

Plans:
**Wave 1**
- [ ] 13-01-PLAN.md — Refactor 3 deprecated tools with duplicate logic to delegate to shared handlers; verify with typecheck + tests

### Phase 14: Deprecated Alias Tests
**Goal**: All deprecated tool aliases have test coverage proving they delegate correctly
**Depends on**: Phase 13
**Requirements**: MCP-11
**Success Criteria** (what must be TRUE):
  1. Running `npm test` executes tests for all 7 deprecated tool aliases verifying they produce correct results -- MCP-11
  2. Alias tests confirm argument mapping from legacy formats to consolidated tool parameters is correct -- MCP-11
  3. Error responses from deprecated aliases match the consolidated tool error format -- MCP-11
**Plans**: TBD

### Phase 15: Doctor Command
**Goal**: Users can run `jules-dispatch doctor` to validate their environment before first use
**Depends on**: Nothing (independent)
**Requirements**: DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):
  1. Running `jules-dispatch doctor` reports Node.js version and npm availability status -- DOC-01
  2. Doctor checks JULES_API_KEY presence and validates connectivity to the Jules API -- DOC-02
  3. Doctor validates task file format when a path is provided and reports specific errors for malformed files -- DOC-03
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Status Derivation Testing | v1 | 1/1 | Complete | 2026-05-11 |
| 2. Retry & Network Resilience | v1 | 2/2 | Complete | 2026-05-11 |
| 3. Collector Error Surfacing | v1 | 1/1 | Complete | 2026-05-11 |
| 4. Batch Dispatch Testing | v1 | 1/1 | Complete | 2026-05-11 |
| 5. MCP Response Standardization | v1 | 4/4 | Complete | 2026-05-11 |
| 6. MCP Orchestration Tools | v1 | 3/3 | Complete | 2026-05-11 |
| 7. MCP Backward Compatibility | v1 | 1/1 | Complete | 2026-05-11 |
| 8. CLI Status Table | v2 | 2/2 | Complete | 2026-05-11 |
| 9. CLI Watch Mode | v1 | 1/1 | Complete | 2026-05-11 |
| 10. CLI Batch Progress | v1 | 2/2 | Complete | 2026-05-11 |
| 11. MCP Response Helpers & Consolidated Tool Tests | v2 | 2/2 | Complete | 2026-05-11 |
| 12. Polling Deduplication | v2 | 1/1 | Complete    | 2026-05-11 |
| 13. Deprecated Tool Refactoring | v2 | 0/1 | Planned | - |
| 14. Deprecated Alias Tests | v2 | 0/? | Not started | - |
| 15. Doctor Command | v2 | 0/? | Not started | - |

---

_Archives: .planning/milestones/_
