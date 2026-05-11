# Requirements: jules-dispatch

**Defined:** 2026-05-11
**Core Value:** Turn Jules from a one-at-a-time tool into a massively parallel coding workforce, controlled seamlessly by either humans on the CLI or AI agents over MCP.

## v3 Requirements

Requirements for Polish & DX milestone. Each maps to roadmap phases.

### Error Messages

- [ ] **ERR-01**: Error translation module (`src/errors.ts`) maps HTTP/status codes to actionable messages with Problem/Cause/Fix structure
- [ ] **ERR-02**: Enhanced `emitError()` accepts optional `ErrorContext` with `hint` and `docsUrl` fields; JSON shape extended additively (backward-compatible)
- [ ] **ERR-03**: All catch sites in `cli.ts` use structured error translation instead of raw `(err as Error).message`

### CLI Ergonomics

- [ ] **CLI-01**: Every CLI command has 2-4 usage examples shown via `addHelpText('after', ...)`
- [ ] **CLI-02**: Top-level `--help` shows grouped command list and getting-started footer
- [ ] **CLI-03**: `NO_COLOR=1`, `TERM=dumb`, and piped stdout disable color output (respects existing conventions)

### Setup & Onboarding

- [ ] **ONB-01**: `jules-dispatch init` wizard prompts for API key and default source, writes `.env` file
- [ ] **ONB-02**: Non-interactive mode via `--api-key` and `--source` flags for CI/scripting environments
- [ ] **ONB-03**: Safe config handling — detect existing `.env`, show current values as defaults, backup before overwrite

### Documentation

- [ ] **DOC-01**: README quickstart rewrite — install, init, dispatch, see PR in under 5 minutes
- [ ] **DOC-02**: YAML task file format reference with all supported fields and examples
- [ ] **DOC-03**: MCP integration guide with tool descriptions and usage examples for AI agents

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

- **COMP-01**: Shell completion generation (bash, zsh, fish)
- **CONF-01**: `config show` command to display current configuration
- **VERSN-01**: Version-aware "what's new" display
- **SHELL-01**: Typo suggestions ("did you mean?") for command names
- **FIX-01**: `doctor --fix` auto-repair for common issues
- **MCP-01**: High-level MCP tools (`jules_run_and_wait`, `jules_batch_status`)
- **MCP-02**: MCP Prompts (`jules/dispatch-workflow`, `jules/fix-bugs`, `jules/refactor`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ink / blessed TUI | Overkill for dispatch tool; scope creep |
| Plugin/extension system | No user demand; premature abstraction |
| Telemetry | Controversial; not adding |
| Auto-update mechanism | `npm update` is the standard |
| YAML/TOML config | `.env` is universal and already in use |
| MCP SDK v2 migration | Separate milestone; v1.29.0 sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERR-01 | 16 | Pending |
| ERR-02 | 16 | Pending |
| ERR-03 | 16 | Pending |
| CLI-01 | 17 | Pending |
| CLI-02 | 17 | Pending |
| CLI-03 | 17 | Pending |
| ONB-01 | 18 | Pending |
| ONB-02 | 18 | Pending |
| ONB-03 | 18 | Pending |
| DOC-01 | 19 | Pending |
| DOC-02 | 19 | Pending |
| DOC-03 | 19 | Pending |

**Coverage:**
- v3 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-05-11*
*Last updated: 2026-05-11 after v3 roadmap creation*
