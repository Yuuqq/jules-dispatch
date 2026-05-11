# Phase 7: MCP Backward Compatibility - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Existing MCP integrations continue working unchanged during the tool consolidation transition. All 12 original tool names still work, delegating to the new consolidated tools internally, with deprecation notices in descriptions.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion. Use the existing `tool()` wrapper with deprecation notices in descriptions pointing to new tool names.

</decisions>

<code_context>
## Existing Code Insights

### Tool mapping (old → new)
- jules_dispatch_task → jules_dispatch (single task case)
- jules_dispatch_batch → jules_dispatch (array case)
- jules_status → jules_monitor (wait=false)
- jules_wait_for_completion → jules_monitor (wait=true)
- jules_get_session → jules_interact
- jules_get_plan → jules_interact
- jules_list_activities → jules_interact

### Tools that stay as-is (no alias needed)
- jules_list_sources — unchanged
- jules_approve_plan — unique action, no consolidation
- jules_send_message — unique action
- jules_cancel_session — unique action

### Approach
Keep existing tool registrations. Add deprecation notices to their descriptions. They already delegate to the same underlying client methods as the new tools — no code change needed for the handlers.

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. All original 12 MCP tool names still work when called by an AI agent
2. Old tool names delegate to the same underlying client methods (already the case)
3. Old tool names show a deprecation notice in their description guiding users to the new names
4. No existing MCP workflow breaks after the transition

</specifics>

<deferred>
## Deferred Ideas

None — infrastructure phase.
</deferred>
