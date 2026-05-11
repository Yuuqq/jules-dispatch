# Plan: MCP Response Standardization

**Phase:** 5 — MCP Response Standardization
**Mode:** inline
**Depends on:** Phase 3 (collector errors surfaced)

## What

Standardize all 12 MCP tools in mcp.ts with consistent response shapes, annotations, rich descriptions, and error recovery hints. This is a significant refactor of mcp.ts.

## Implementation Strategy

Do all 4 plans in a single codeagent pass to minimize merge complexity. The changes are tightly coupled — response shape changes affect every handler, annotations and descriptions change every tool registration.

### Response wrapper helper

Add a helper to the `tool` wrapper:
```typescript
function ok<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true as const, data, ...(meta ? { meta } : {}) };
}

function fail(message: string, recovery_hint: string, code?: string) {
  return { success: false as const, error: { message, recovery_hint, code } };
}
```

### Tool-by-tool changes

For each tool:
1. Wrap handler return in `ok(data)`
2. Add `annotations` to registration
3. Rewrite `description` with purpose, when-to-use, output shape, cross-references
4. Update error catch in wrapper to include `recovery_hint`

### Error recovery hints

| Tool | Recovery hint |
|---|---|
| jules_list_sources | "Verify JULES_API_KEY is set and valid. Check network connectivity." |
| jules_dispatch_task | "Check source format (sources/github/owner/repo) and API key permissions." |
| jules_dispatch_batch | "Check each task's source. Use jules_status to check dispatched sessions." |
| jules_get_session | "Verify session ID. Use jules_list_sessions to find valid IDs." |
| jules_list_sessions | "Verify API key and network connectivity." |
| jules_status | "Verify session IDs. Use jules_list_sessions for valid IDs." |
| jules_list_activities | "Verify session ID. Use jules_get_session to confirm session exists." |
| jules_get_plan | "Session may not have a plan yet. Wait and retry, or check jules_status." |
| jules_approve_plan | "Use jules_get_plan to verify plan exists and session is in AWAITING_PLAN_APPROVAL." |
| jules_send_message | "Verify session is RUNNING. Use jules_status to check session state." |
| jules_cancel_session | "Verify session is active. Use jules_status to check current state." |
| jules_wait_for_completion | "Try increasing timeout. Use jules_status to check individual sessions." |

## File

Modify: `src/mcp.ts`

## Verification

1. `npx vitest run` — all existing tests pass (no regression)
2. `npx tsc --noEmit` — passes
3. Grep for all 12 tool registrations having `annotations`
4. Grep for `recovery_hint` in error path
5. Manual review: each description has purpose, guidance, output shape, cross-references
