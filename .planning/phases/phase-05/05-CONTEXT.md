# Phase 5: MCP Response Standardization - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning
**Mode:** Auto-generated (design specified in ROADMAP — discuss skipped)

<domain>
## Phase Boundary

Every MCP tool returns consistent, agent-friendly responses with actionable error hints and correct annotations. Currently, 12 tools return ad-hoc response shapes. This phase standardizes all of them to a unified `{ success, data?, error?, meta? }` pattern, adds MCP annotations, rewrites descriptions, and adds recovery hints to errors.

</domain>

<decisions>
## Implementation Decisions

### Response Shape
All tool responses wrapped in `{ success: boolean, data?: T, error?: { message, code, recovery_hint }, meta?: { tool, duration_ms } }`. Success responses set `success: true` with `data`. Error responses set `success: false` with `error`.

### Annotations Mapping
- `readOnlyHint: true` — jules_list_sources, jules_get_session, jules_list_sessions, jules_status, jules_list_activities, jules_get_plan
- `readOnlyHint: false` — jules_dispatch_task, jules_dispatch_batch, jules_approve_plan, jules_send_message, jules_cancel_session, jules_wait_for_completion
- `destructiveHint: true` — jules_cancel_session
- `destructiveHint: false` — all others
- `idempotentHint: true` — jules_list_sources, jules_get_session, jules_list_sessions, jules_status, jules_list_activities, jules_get_plan, jules_cancel_session
- `idempotentHint: false` — jules_dispatch_task, jules_dispatch_batch, jules_approve_plan, jules_send_message, jules_wait_for_completion
- `openWorldHint: false` — all tools (access specific Jules API, not open internet)

### Description Format
Each description includes: purpose sentence, when-to-use guidance, expected output shape, cross-references to related tools.

### Claude's Discretion
Exact wording of descriptions and recovery hints at Claude's discretion. Follow the established pattern.

</decisions>

<code_context>
## Existing Code Insights

### 12 Tools in mcp.ts
1. jules_list_sources (line 63) — returns { sources }
2. jules_dispatch_task (line 71) — returns DispatchResult
3. jules_dispatch_batch (line 95) — returns { summary, results }
4. jules_get_session (line 138) — returns raw JulesSession
5. jules_list_sessions (line 144) — returns raw page
6. jules_status (line 155) — returns { results }
7. jules_list_activities (line 185) — returns raw activities
8. jules_get_plan (line 198) — returns { plan }
9. jules_approve_plan (line 205) — returns { ok, sessionId }
10. jules_send_message (line 217) — returns { ok, sessionId }
11. jules_cancel_session (line 227) — returns { ok, sessionId }
12. jules_wait_for_completion (line 239) — returns { completed, failed, cancelled, stillRunning, timedOut }

### Error Wrapping
Line 44-55: The `wrapped` handler catches errors and returns `{ isError: true, content: [{ text: JSON.stringify({ error: { message, status, name } }) }] }`. This needs recovery_hint added.

### MCP SDK
`@modelcontextprotocol/sdk` v1.29+ — `registerTool(name, { description, inputSchema, annotations? }, handler)`. The annotations field accepts `{ readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint? }`.

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP:
1. All MCP tool responses follow `{ success, data?, error?, meta? }` shape
2. Every tool has `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint` annotations set correctly
3. Every tool description includes purpose, when-to-use guidance, expected output shape, and cross-references
4. Every error response includes a `recovery_hint` field with a suggested next action

</specifics>

<deferred>
## Deferred Ideas

None — design specified in ROADMAP.
</deferred>
