# Phase 6: MCP Orchestration Tools - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (design specified in ROADMAP)

<domain>
## Phase Boundary

AI agents can dispatch, monitor, and interact with sessions using single tool calls instead of composing fragmented tools. Three new consolidated tools are added to mcp.ts alongside the existing 12 tools. The old tools continue to work — backward compatibility is Phase 7.

</domain>

<decisions>
## Implementation Decisions

### jules_dispatch
Consolidates jules_dispatch_task + jules_dispatch_batch. Accepts either a single task or array of tasks. Returns standardized { success, data } with summary.

### jules_monitor
Consolidates jules_status + jules_wait_for_completion. Gets status for session IDs with optional wait. Returns { success, data } with per-session status and optional wait results.

### jules_interact
Consolidates jules_get_session + jules_get_plan + jules_list_activities. Returns full session context in one call. Returns { success, data } with session, plan, and recent activities.

### Claude's Discretion
Exact parameter names, description wording, and implementation details at Claude's discretion. Follow the standardized response pattern from Phase 5.

</decisions>

<code_context>
## Existing Code Insights

### Patterns from Phase 5
- `ok()` / `fail()` response helpers
- Annotation presets: `mutationAnnotations`, `readOnlyAnnotations`
- Description format: purpose, usage, output shape, cross-references

### Existing tools to consolidate
- jules_dispatch_task (line ~135) → jules_dispatch
- jules_dispatch_batch (line ~159) → jules_dispatch
- jules_status (line ~223) → jules_monitor
- jules_wait_for_completion (line ~308) → jules_monitor
- jules_get_session (line ~206) → jules_interact
- jules_get_plan (line ~266) → jules_interact
- jules_list_activities (line ~253) → jules_interact

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. An AI agent can dispatch 1-N tasks with a single `jules_dispatch` call
2. An AI agent can monitor batch status and optionally wait for completion with a single `jules_monitor` call
3. An AI agent can get full session context (state, plan, recent activities, PR) in one `jules_interact` call
4. Each new tool returns the standardized response shape with rich description

</specifics>

<deferred>
## Deferred Ideas

None — Phase 7 handles backward compatibility.
</deferred>
