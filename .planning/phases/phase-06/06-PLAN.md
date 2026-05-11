# Plan: MCP Orchestration Tools

**Phase:** 6 — MCP Orchestration Tools
**Mode:** inline
**Depends on:** Phase 5 (response standardization)

## What

Add 3 new consolidated MCP tools to mcp.ts. These are new registrations — existing tools stay unchanged (Phase 7 handles backward compat).

## Plan 06-01: jules_dispatch

Consolidates dispatch_task + dispatch_batch into a single tool.

```typescript
tool('jules_dispatch',
  'Dispatch one or more tasks to Jules in parallel...',
  {
    tasks: z.union([
      z.object({ title: z.string(), prompt: z.string(), source: z.string().optional(), branch: z.string().optional(), autoMode: z.enum(['AUTO_CREATE_PR', 'NONE']).optional(), requirePlanApproval: z.boolean().optional() }),
      z.array(z.object({ ...same... })),
    ]).or(z.string()),
    format: z.enum(['yaml', 'json']).optional(),
    parallel: z.number().int().min(1).max(50).optional().default(10),
  },
  async (args) => {
    // Normalize to array of TaskDefinition
    // Single object → wrap in array
    // String → parse with loadTasksFromString
    // Array → use directly
    // Then chunk + dispatch like jules_dispatch_batch
    return ok({ summary, results });
  },
  mutationAnnotations,
);
```

## Plan 06-02: jules_monitor

Consolidates status + wait_for_completion into a single tool.

```typescript
tool('jules_monitor',
  'Check status of sessions, optionally waiting for completion...',
  {
    sessionIds: z.array(z.string()).min(1),
    wait: z.boolean().optional().default(false),
    intervalMs: z.number().int().min(1000).optional().default(10000),
    timeoutMs: z.number().int().min(1000).optional().default(600000),
    failFast: z.boolean().optional().default(false),
  },
  async (args) => {
    // Get status for all sessions (like jules_status)
    // If wait=true, poll until completion (like jules_wait_for_completion)
    return ok({ sessions: [...statusResults], wait: waitResult? });
  },
  readOnlyAnnotations,
);
```

## Plan 06-03: jules_interact

Consolidates get_session + get_plan + list_activities into a single tool.

```typescript
tool('jules_interact',
  'Get full context for a session: state, plan, recent activities, and PR...',
  {
    sessionId: z.string(),
    activityCount: z.number().int().min(1).max(100).optional().default(10),
  },
  async (args) => {
    // Parallel fetch: getSession + getLatestPlan + listActivities
    const [session, plan, { activities }] = await Promise.all([...]);
    const status = deriveStatus(session, activities);
    const pr = session.outputs?.find(o => o.pullRequest)?.pullRequest;
    return ok({ session: { ... }, status, plan, activities, pr });
  },
  readOnlyAnnotations,
);
```

## File

Modify: `src/mcp.ts` (add 3 new tool registrations before the planner section)

## Verification

1. `npx tsc --noEmit` passes
2. `npx vitest run` — all existing tests pass
3. Grep confirms 3 new tool names registered
