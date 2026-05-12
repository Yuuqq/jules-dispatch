# Phase 19: Documentation & Polish

## Requirements
- DOC-01: README quickstart — install, init, dispatch, see PR in under 5 minutes (under 10 steps)
- DOC-02: YAML task file format reference with every supported field, type, required/optional, and examples
- DOC-03: MCP integration guide with tool descriptions, parameter schemas, and copy-paste usage examples

## Plan 19-01: README rewrite

### Changes to README.md

1. **Quick Start (DOC-01)**: Replace manual `.env` step with `jules-dispatch init`. Keep under 10 steps.
2. **YAML Reference (DOC-02)**: Add comprehensive table with Field | Type | Required | Default | Description
3. **MCP Integration Guide (DOC-03)**: Add structured section with consolidated tools (jules_dispatch, jules_monitor, jules_interact), parameter schemas, and copy-paste config examples
4. Update Project Structure to include new files (init.ts, errors.ts, doctor.ts, mcp-helpers.ts, polling.ts, planner.ts)
5. Update CLI Reference to include `init` and `doctor` commands
