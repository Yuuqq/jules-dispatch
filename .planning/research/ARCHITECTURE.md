# Architecture Patterns: MCP Tool Composability & CLI Dashboard

**Project:** jules-dispatch
**Researched:** 2026-05-10
**Mode:** Ecosystem (Architecture dimension)
**Overall confidence:** HIGH

## Executive Summary

Three major MCP servers -- GitHub (75+ tools across 20 toolsets), Sentry (remote-first with skill-based tool discovery), and the reference Filesystem server (15 atomic tools) -- reveal a consistent architectural pattern: **layered tool surfaces with configurable granularity**. The GitHub server exposes the most mature approach: a small default set of high-level tools, optional toolset expansion, and parameterized `method` dispatch within tools to reduce tool count without sacrificing capability. Sentry adds skill-based grouping and AI-powered search tools that require an embedded LLM. The MCP spec itself adds `annotations` (readOnlyHint, destructiveHint, idempotentHint) and `outputSchema` for structured returns, both of which jules-dispatch should adopt.

For the CLI dashboard, Ink (React for CLI, 38k stars, v7.0.2) is the dominant choice for live-updating terminal UIs. Its `<Static>` component handles completed task output while the live region re-renders for active tasks -- precisely the pattern needed for parallel batch status. Listr2 is a simpler alternative if the dashboard stays task-list-only without interactive controls.

## Recommended Architecture

### MCP Tool Surface Redesign

The current 12 tools are flattened into a single namespace. Research from the three reference servers points to a three-tier architecture:

```
Tier 1: Orchestration tools (3-4)     <-- AI uses these 90% of the time
  jules_dispatch_batch                <-- plan + dispatch + poll in one call
  jules_status                        <-- multi-session status with summaries
  jules_auto                          <-- plan + dispatch combined (optional)

Tier 2: Lifecycle tools (5-6)         <-- AI uses for specific control
  jules_dispatch_task                 <-- single task dispatch
  jules_get_session                   <-- full session details
  jules_list_sessions                 <-- paginated session listing
  jules_cancel_session                <-- cancel running session
  jules_send_message                  <-- send follow-up to running session

Tier 3: Low-level tools (3-4)         <-- AI uses for inspection/deep control
  jules_list_sources                  <-- repository source listing
  jules_get_plan / jules_approve_plan <-- plan lifecycle
  jules_list_activities               <-- activity log inspection

Optional: Planner tools (2)           <-- only if LLM key present
  jules_plan_tasks                    <-- plan without dispatch
  (jules_auto is already Tier 1)
```

### Component Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                      Entry Points                            │
│  cli.ts (Commander)              mcp.ts (MCP server)        │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Tool Registry (NEW)                                         │
│  - Groups tools into tiers                                   │
│  - Provides rich descriptions per tier                       │
│  - Adds MCP annotations (readOnly, destructive, idempotent)  │
│  - Adds outputSchema for structured returns                  │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator (NEW or extend dispatcher.ts)                  │
│  - High-level workflows: plan+dispatch+poll                  │
│  - Smart defaults: source/branch from config                 │
│  - Composes existing client/dispatcher/collector calls       │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Core Modules (EXISTING, unchanged)                          │
│  config.ts  client.ts  dispatcher.ts  collector.ts          │
│  output.ts  log.ts  planner.ts  types.ts                    │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
    Google Jules API (v1alpha)
```

### Data Flow

```
AI Agent Request
    │
    ▼
MCP Tool Handler (mcp.ts)
    │
    ├── Tier 1 orchestration? ──► Orchestrator ──► compose calls to core modules
    │
    ├── Tier 2 lifecycle?     ──► Direct call to client.ts / dispatcher.ts
    │
    └── Tier 3 low-level?     ──► Direct call to client.ts
    │
    ▼
Structured Response (outputSchema-validated)
    │
    ▼
AI Agent receives result + suggested next action in description
```

### CLI Dashboard Architecture

```
┌─────────────────────────────────────────────────┐
│  cli.ts: new "dashboard" command                │
│  │                                               │
│  ├── Interactive mode (TTY):                    │
│  │   Ink React app with live updates            │
│  │   ├── <Static> for completed tasks           │
│  │   ├── Live region for active tasks           │
│  │   ├── useInput for keyboard controls         │
│  │   └── Polling loop via useEffect/setInterval │
│  │                                               │
│  └── Non-interactive mode (piped/CI):           │
│      Periodic text summary to stdout            │
│      (same data, no Ink dependency)             │
└─────────────────────────────────────────────────┘
```

## Patterns to Follow

### Pattern 1: Parameterized Method Dispatch (from GitHub MCP)

**What:** Consolidate related read operations into one tool with a `method` parameter.
**When:** Multiple operations on the same resource type share most parameters.
**Why:** Reduces tool count in the tool list, shrinking the context window the LLM must scan.

```typescript
// Instead of 5 separate tools for session reads:
tool('jules_session', 'Read session data...', {
  sessionId: z.string(),
  method: z.enum(['get', 'activities', 'plan', 'status', 'outputs']),
  pageSize: z.number().optional(),
}, async (args) => {
  switch (args.method) {
    case 'get': return client.getSession(args.sessionId);
    case 'activities': return client.listActivities(args.sessionId, args.pageSize);
    // ...
  }
});
```

**Tradeoff:** This pattern is used by GitHub MCP (`issue_read`, `pull_request_read`) but increases per-tool parameter count. The MCP spec's `annotations` system works best with one-tool-per-action. For jules-dispatch's ~15 tools, the total count is already manageable, so this pattern should be used selectively -- only for very closely related reads (e.g., session + activities + plan could merge).

### Pattern 2: Tiered Tool Registration with Descriptions That Guide AI (from GitHub + Sentry)

**What:** Structure tool descriptions as mini-workflow guides, not just capability summaries.
**When:** Always. This is the single highest-impact change.

```typescript
// BAD (current):
'Dispatch a single task to Jules. Returns sessionId, URL, and dispatch status.'

// GOOD (description as workflow guide):
'Dispatch a single coding task to Jules. Returns { sessionId, url, status }.
 Use this when you need fine-grained control over one task.
 For most workflows, prefer jules_dispatch_batch instead.
 After dispatch, use jules_status to poll progress or jules_wait_for_completion to block until done.'
```

**Evidence:** GitHub MCP descriptions include "Required OAuth Scopes" metadata and usage context. Sentry MCP's `common-patterns.md` documents a markdown-based response format that includes "Using this information" sections with next-step guidance.

### Pattern 3: MCP Tool Annotations (from MCP Spec 2025-06-18)

**What:** Add `annotations` to every tool registration.
**When:** Immediately. This is a non-breaking additive change.

```typescript
// Read-only tools
{ readOnlyHint: true, openWorldHint: true }
// e.g., jules_list_sources, jules_get_session, jules_status, jules_list_activities

// Destructive tools
{ readOnlyHint: false, destructiveHint: true, idempotentHint: true }
// e.g., jules_cancel_session

// Mutating but non-destructive
{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }
// e.g., jules_dispatch_task, jules_send_message
```

### Pattern 4: Output Schema for Structured Returns (from MCP Spec)

**What:** Define `outputSchema` alongside `inputSchema` for tools that return structured data.
**When:** For tools where the AI needs to parse the response programmatically.

```typescript
tool('jules_status', '...', inputSchema, handler, {
  outputSchema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            state: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] },
            prUrl: { type: 'string' },
          },
        },
      },
    },
  },
});
```

### Pattern 5: Ink Dashboard with Static/Live Split

**What:** Use Ink's `<Static>` component for completed tasks and a live-updating region for active tasks.
**When:** The `jules-dispatch dashboard` command or when running `jules-dispatch batch` with a `--watch` flag.

```typescript
// Conceptual structure
const Dashboard = ({ sessions }) => (
  <>
    <Static items={sessions.filter(s => isTerminal(s))}>
      {(session) => <CompletedTask key={session.id} session={session} />}
    </Static>
    <Box flexDirection="column">
      <Text bold>Active Tasks ({sessions.filter(s => !isTerminal(s)).length})</Text>
      {sessions.filter(s => !isTerminal(s)).map(s => (
        <ActiveTask key={s.id} session={s} />
      ))}
    </Box>
  </>
);
```

### Pattern 6: Optional Feature Gating (Existing, Strengthen)

**What:** The existing `isPlannerConfigured()` gate is the right pattern. Extend it to support configurable tool tiers.
**When:** Users who only need dispatch should not see planner tools. Users in read-only mode should not see dispatch tools.

```typescript
// Configurable tool surface
const toolsets = config.toolsets ?? ['default'];  // default = dispatch + status + sessions

if (toolsets.includes('dispatch')) registerDispatchTools();
if (toolsets.includes('status')) registerStatusTools();
if (toolsets.includes('planner') && isPlannerConfigured()) registerPlannerTools();
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Flat Tool List Without Workflow Guidance
**What:** Registering 12+ tools with one-line descriptions and no usage hints.
**Why bad:** LLMs must enumerate all tools to find the right one; poor descriptions lead to wrong tool selection or unnecessary multi-step workflows.
**Instead:** Tier tools, add "prefer X for Y" guidance in descriptions, use annotations.

### Anti-Pattern 2: One Tool Per API Endpoint
**What:** Exposing every Jules API call as a separate MCP tool.
**Why bad:** The GitHub MCP tried this and moved to parameterized dispatch (`issue_read`, `pull_request_read`) because 75+ flat tools overwhelmed LLM context windows.
**Instead:** Consolidate related reads with `method` parameter. Keep writes as separate tools for safety annotations.

### Anti-Pattern 3: Blocking Wait in MCP Tools
**What:** `jules_wait_for_completion` polls for up to 10 minutes inside an MCP tool call.
**Why bad:** MCP tool calls should be fast. Long-running calls risk client timeouts, waste tokens on intermediate polling, and prevent the agent from doing useful work.
**Instead:** Return immediately with a status snapshot. Let the agent decide whether to poll again. Consider adding a `jules_watch` tool that returns incremental status via MCP progress notifications (spec-supported).

### Anti-Pattern 4: Dashboard Without Non-Interactive Fallback
**What:** Building an Ink-only dashboard that breaks when piped or run in CI.
**Why bad:** jules-dispatch targets CI/CD pipelines too (GitHub Actions matrix). Ink requires a TTY.
**Instead:** Detect TTY availability. Interactive mode uses Ink. Non-interactive mode outputs periodic text summaries to stdout (reuse existing `emit()` from output.ts).

## Scalability Considerations

| Concern | At 5 sessions | At 50 sessions | At 500 sessions |
|---------|---------------|----------------|-----------------|
| MCP tool response size | No issue | May exceed context window | Must paginate/summarize |
| Dashboard rendering | Ink handles easily | Ink handles, may flicker | Use virtual list or summary view |
| Status polling (MCP) | One jules_status call | Batch in single call | Batch + summary mode |
| Status polling (CLI) | Sequential getSession | Sequential, slow | Parallel batch polling needed |

## Suggested Build Order

Based on dependency analysis:

**Phase A: Tool Description Enhancement (zero structural changes)**
- Rewrite all 12 tool descriptions with workflow guidance
- Add MCP annotations to every tool registration
- Add outputSchema to jules_status, jules_dispatch_batch, jules_dispatch_task
- No new code paths, no new modules

**Phase B: Orchestration Layer (new module, extend mcp.ts)**
- Create `orchestrator.ts` for high-level workflows
- Add `jules_dispatch_and_watch` tool that dispatches then returns status snapshot
- Extend `jules_status` to accept optional `summarize` flag
- Refactor `jules_wait_for_completion` to use progress notifications instead of blocking

**Phase C: CLI Dashboard (new dependency, new command)**
- Add `ink` and `react` as optional dependencies
- Create `dashboard.tsx` with Static/Live split
- Add `jules-dispatch dashboard` command
- Add `--watch` flag to `batch` command
- Non-interactive fallback for CI

**Phase D: Configurable Toolsets (extend config.ts, mcp.ts)**
- Add `JULES_TOOLSETS` env var and `--toolsets` CLI flag
- Default toolset: dispatch + status + sessions
- Optional toolsets: planner, advanced, readonly
- Dynamic toolset discovery (like GitHub MCP's `--dynamic-toolsets`)

## Sources

- MCP Specification Tools concept: https://modelcontextprotocol.io/docs/concepts/tools (HIGH confidence -- official spec)
- GitHub MCP Server README: https://github.com/github/github-mcp-server/blob/main/README.md (HIGH confidence -- official repo)
- Sentry MCP Server: https://github.com/getsentry/sentry-mcp (HIGH confidence -- official repo)
- Sentry MCP common-patterns.md: https://github.com/getsentry/sentry-mcp/blob/main/docs/common-patterns.md (HIGH confidence)
- MCP Filesystem Server: https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem (HIGH confidence)
- Ink React CLI framework: https://github.com/vadimdemedes/ink (HIGH confidence -- 38k stars, v7.0.2)
- Sentry MCP official docs: https://docs.sentry.io/ai/mcp/ (HIGH confidence)
