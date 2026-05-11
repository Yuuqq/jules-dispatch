# Plan: MCP Backward Compatibility

**Phase:** 7 — MCP Backward Compatibility
**Mode:** inline
**Depends on:** Phase 6 (new tools must exist)

## What

Add deprecation notices to the descriptions of old tool names that have been superseded by the consolidated tools. The handlers remain unchanged — they already work correctly.

## Plan 07-01: Add deprecation notices

For each old tool, prepend a deprecation notice to the description:

| Tool | Deprecation Notice |
|---|---|
| jules_dispatch_task | "[DEPRECATED: Use jules_dispatch instead.] " |
| jules_dispatch_batch | "[DEPRECATED: Use jules_dispatch instead.] " |
| jules_status | "[DEPRECATED: Use jules_monitor instead.] " |
| jules_wait_for_completion | "[DEPRECATED: Use jules_monitor instead.] " |
| jules_get_session | "[DEPRECATED: Use jules_interact instead.] " |
| jules_get_plan | "[DEPRECATED: Use jules_interact instead.] " |
| jules_list_activities | "[DEPRECATED: Use jules_interact instead.] " |

No handler changes needed. The tools already delegate to the same client methods.

## File

Modify: `src/mcp.ts` (7 description strings)

## Verification

1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — passes
3. Grep confirms 7 tools have "[DEPRECATED" in description
