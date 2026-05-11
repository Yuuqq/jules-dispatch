# Roadmap: jules-dispatch

## Milestones

- **v1 — Incremental Optimization** (shipped 2026-05-11)
- **v2 — Reliability & Onboarding** (shipped 2026-05-11)
- **v3 — Polish & DX** (current)

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

<details>
<summary>v2 — Reliability & Onboarding (Phases 11-15) — SHIPPED 2026-05-11</summary>

- [x] Phase 11: MCP Response Helpers & Consolidated Tool Tests (2/2 plans) — completed 2026-05-11
- [x] Phase 12: Polling Deduplication (1/1 plan) — completed 2026-05-11
- [x] Phase 13: Deprecated Tool Refactoring (1/1 plan) — completed 2026-05-11
- [x] Phase 14: Deprecated Alias Tests (1/1 plan) — completed 2026-05-11
- [x] Phase 15: Doctor Command (1/1 plan) — completed 2026-05-11

</details>

<details>
<summary>v3 — Polish & DX (Phases 16-19) — IN PROGRESS</summary>

- [ ] **Phase 16: Error Message Infrastructure** — Actionable error messages replace raw stack traces
- [ ] **Phase 17: CLI Help & Ergonomics** — Every command shows usage examples; color disabled when piped
- [ ] **Phase 18: Init Wizard** — `jules-dispatch init` guides new users through first-run setup
- [ ] **Phase 19: Documentation & Polish** — README quickstart, YAML reference, MCP integration guide

</details>

## Phase Details

### Phase 16: Error Message Infrastructure
**Goal**: Every error the user encounters includes a clear Problem statement, a Cause explanation, and a Fix suggestion — never a raw stack trace.
**Depends on**: Nothing (first v3 phase)
**Requirements**: ERR-01, ERR-02, ERR-03
**Success Criteria** (what must be TRUE):
  1. When a Jules API call fails with a network error, the user sees a structured message with Problem/Cause/Fix instead of a raw TypeError
  2. When authentication fails (401), the user sees a message explaining their API key is invalid or expired, with a fix suggestion to run `jules-dispatch init` or check their `.env`
  3. When `emitError()` is called with an `ErrorContext` containing `hint` and `docsUrl`, the JSON output includes both fields while remaining backward-compatible
  4. Every catch block in `cli.ts` surfaces the translated error message, not raw `(err as Error).message`
**Plans**: 16-01

### Phase 17: CLI Help & Ergonomics
**Goal**: Every CLI command teaches the user how to use it from the help output alone, and color output respects terminal capabilities.
**Depends on**: Phase 16 (help text references error handling patterns)
**Requirements**: CLI-01, CLI-02, CLI-03
**Success Criteria** (what must be TRUE):
  1. Running `jules-dispatch dispatch --help` shows 2-4 concrete usage examples after the option list
  2. Running `jules-dispatch --help` shows a grouped command list (Core, Monitoring, Setup, Utilities) with a getting-started footer
  3. Running `NO_COLOR=1 jules-dispatch status` produces output with no ANSI color codes
  4. Piping `jules-dispatch status` to a file produces plain text with no color codes
**Plans**: TBD
**UI hint**: yes

### Phase 18: Init Wizard
**Goal**: A new user can run `jules-dispatch init` and have a working configuration in 60 seconds, even if they have never used the tool before.
**Depends on**: Phase 16 (wizard uses structured error messages on failure)
**Requirements**: ONB-01, ONB-02, ONB-03
**Success Criteria** (what must be TRUE):
  1. Running `jules-dispatch init` interactively prompts for API key, validates it, prompts for default source, and writes a `.env` file
  2. Running `jules-dispatch init --api-key sk-xxx --source ./src` in a CI script completes without interactive prompts and writes `.env`
  3. When a `.env` file already exists, `jules-dispatch init` shows current values as defaults and creates a `.env.backup` before overwriting
  4. When `process.stdin.isTTY` is false and no flags are provided, the wizard prints an error explaining that `--api-key` and `--source` are required in non-interactive mode
**Plans**: TBD

### Phase 19: Documentation & Polish
**Goal**: A new user reading only the README can go from zero to a successful dispatched task with a PR in under 5 minutes.
**Depends on**: Phase 18 (init wizard defines the new happy path that documentation describes)
**Requirements**: DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):
  1. The README quickstart section covers install, init, create a task file, dispatch, and see the PR — all in under 10 steps
  2. A YAML task file format reference exists with every supported field, its type, whether it is required, and a working example
  3. An MCP integration guide exists with tool descriptions, parameter schemas, and copy-paste usage examples for AI agents
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 16. Error Message Infrastructure | 1/1 | Complete | 2026-05-12 |
| 17. CLI Help & Ergonomics | 0/0 | Not started | - |
| 18. Init Wizard | 0/0 | Not started | - |
| 19. Documentation & Polish | 0/0 | Not started | - |

---

_Archives: .planning/milestones/_
