# Phase 13: Deprecated Tool Refactoring - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase)

<domain>
## Phase Boundary

All 7 deprecated MCP tools are refactored from full reimplementations to thin wrappers that delegate to the consolidated tools (jules_dispatch, jules_monitor, jules_interact).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key considerations:
- 7 deprecated tools: jules_dispatch_task, jules_dispatch_batch, jules_get_session, jules_list_sessions, jules_status, jules_list_activities, jules_get_plan, jules_wait_for_completion
- Each must become a thin wrapper (argument mapping + delegation) to consolidated tools
- Existing MCP clients using deprecated tool names must receive identical responses
- mcp.ts should shrink significantly from current ~400 lines

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/mcp.ts` — createMcpServer with consolidated tools (jules_dispatch, jules_monitor, jules_interact)
- `src/polling.ts` — shared pollSessions (already used by Phase 12)
- `src/mcp-helpers.ts` — ok/fail/computeRecoveryHint

### Established Patterns
- Tool registration via `tool(name, description, schema, handler, annotations)`
- Consolidated tools handle full logic; deprecated tools currently duplicate it
- Zod schemas for input validation

### Integration Points
- jules_dispatch_task → delegate to jules_dispatch logic
- jules_dispatch_batch → delegate to jules_dispatch logic
- jules_get_session → delegate to jules_interact logic
- jules_status → delegate to jules_monitor logic
- jules_list_activities → delegate to jules_interact logic
- jules_get_plan → delegate to jules_interact logic
- jules_wait_for_completion → delegate to jules_monitor logic

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.

</deferred>
