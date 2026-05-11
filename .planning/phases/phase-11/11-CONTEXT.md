# Phase 11: MCP Response Helpers & Consolidated Tool Tests - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

The MCP layer needs a safety net of tests covering all consolidated tools (jules_dispatch, jules_monitor, jules_interact) and their shared helpers (ok/fail response builders, error wrapper with recovery_hint computation).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key considerations:
- ok/fail/tool-wrapper functions are defined inside `runMcpServer()` — need to be extractable or tested via integration
- Existing test pattern: vitest with stderr capture mock (see log.test.ts)
- ESM + `.js` extensions in imports required
- 3 consolidated tools: jules_dispatch (dispatch), jules_monitor (status/wait), jules_interact (full context)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/log.test.ts` — established test pattern with stderr capture, beforeEach/afterEach
- `src/output.ts` — emit/emitError/ExitCode (LOW priority for this phase)

### Established Patterns
- vitest 1.6 with no config file (defaults)
- Mock patterns: process.stderr.write override
- ESM imports with .js extensions

### Integration Points
- `src/mcp.ts` — 373 lines, contains ok/fail helpers (lines 81-87), error wrapper (lines 46-78), 3 consolidated tools (lines 443-583)
- `src/client.ts` — JulesClient used by all tools
- `src/dispatcher.ts` — dispatchTaskDefinition used by jules_dispatch
- `src/config.ts` — loadConfig, loadTasksFromString

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Focus on:
1. Extract ok/fail to testable functions if needed
2. Test recovery_hint computation for auth (401/403), not-found (404), and generic errors
3. Test consolidated tools with mocked JulesClient

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
