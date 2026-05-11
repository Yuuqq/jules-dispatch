# Phase 14: Deprecated Alias Tests - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

All 7 deprecated tool aliases have test coverage proving they delegate correctly. Tests verify argument mapping from legacy formats to consolidated tool parameters and confirm error responses match the consolidated tool error format.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key considerations:
- 7 deprecated tools to test: jules_dispatch_task, jules_dispatch_batch, jules_get_session, jules_list_sessions, jules_status, jules_list_activities, jules_get_plan
- jules_wait_for_completion already tested via polling tests (Phase 12)
- Tests use InMemoryTransport pattern from Phase 11 (tests/mcp.test.ts)
- Must verify: happy path, argument mapping, error format consistency

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- tests/mcp.test.ts — established InMemoryTransport test pattern for consolidated tools
- src/mcp.ts — createMcpServer export enables in-process testing
- src/mcp-helpers.ts — ok/fail/computeRecoveryHint

### Established Patterns
- vitest with vi.fn() mocking for JulesClient
- InMemoryTransport.createLinkedPair() for client-server testing
- Client from @modelcontextprotocol/sdk for calling tools

### Integration Points
- All deprecated tools registered inside createMcpServer
- Tests call tools via client.callTool({ name, arguments })

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
