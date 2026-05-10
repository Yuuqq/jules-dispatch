# Technology Stack

**Project:** jules-dispatch
**Researched:** 2026-05-11
**Focus:** MCP tool design patterns for AI composability, CLI dashboard libraries

## Recommended Stack

### Core Framework (No Changes)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | 5.4+ | Language | Already in use, strict mode, ESM. No reason to change. |
| Node.js | 20+ | Runtime | Already in use. MCP SDK v2 will require 20+ (same). |
| ESM | `"type": "module"` | Module system | Already in use. MCP SDK v2 is ESM-only. |

### MCP SDK

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP server protocol | **Stay on v1.x for now.** The v2 SDK splits into `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/core` with breaking import changes. Migrating to v2 is a separate task. The `registerTool()` and `registerPrompt()` APIs already exist in v1.29.0. |
| `zod` | ^4.4.2 | Schema validation | Already on Zod v4. MCP SDK v2 uses `zod/v4` explicitly and requires `z.object()` wrappers instead of raw shapes. Staying on v4 is forward-compatible. |

### MCP Tool Design Pattern (HIGH confidence)

**Recommendation: Workflow-oriented tool design with annotation-driven hints and MCP Prompts for guided workflows.**

The current 12 tools are API-resource-oriented (list sources, get session, list activities, etc.). Research from the arXiv study (856 tools, 103 servers), Speakeasy tool curation guide, and Anthropic engineering blog converge on a clear pattern:

#### Pattern 1: High-level orchestration tools over low-level API wrappers

The current `jules_dispatch_task` and `jules_dispatch_batch` are good. But `jules_status`, `jules_get_session`, `jules_list_activities`, `jules_get_plan` are all low-level reads that force the AI to orchestrate the polling loop itself. Instead, provide:

- **`jules_run_and_wait`** -- Dispatch + poll + return result in one tool call. The AI's most common workflow.
- **`jules_batch_status`** -- Aggregate status dashboard for all dispatched sessions (not just specific IDs).

Keep the low-level tools, but add higher-level compositions so the AI can choose its abstraction level.

#### Pattern 2: Tool annotations for discoverability

Use MCP's `annotations` field on every tool. The spec supports:
- `readOnlyHint` -- true for status/list tools
- `destructiveHint` -- true for cancel
- `idempotentHint` -- true for read operations
- `openWorldHint` -- true (Jules API is external)

These hints help AI agents categorize tools without reading descriptions.

#### Pattern 3: Workflow-aware tool descriptions

The arXiv study found 97.1% of MCP tool descriptions have quality issues. The six-component rubric (Purpose, Guidelines, Limitations, Parameters, Length, Examples) shows that **Purpose + Guidelines** is the most impactful combination. Each tool description should:
1. State what the tool does (Purpose)
2. When to use it vs. alternatives (Guidelines)
3. What it does NOT do (Limitations)

Example for a redesigned `jules_dispatch_batch`:
```
Dispatches multiple independent coding tasks to Google Jules in parallel.

Use this when you need to modify multiple files, fix multiple bugs, or implement
multiple features across the same or different repositories. Each task runs in
its own Jules session with its own branch.

Do NOT use for dependent tasks (where task B needs task A's output) -- use
jules_dispatch_task sequentially instead.

Returns session IDs for each dispatched task. Follow up with jules_batch_status
to check progress, or jules_run_and_wait for fire-and-forget dispatch.
```

#### Pattern 4: MCP Prompts for guided workflows

MCP Prompts (`registerPrompt`) are reusable templates that AI clients surface as slash commands or guided workflows. Use them to encode common agent workflows:

- **`jules/dispatch-workflow`** -- "Given a goal, plan tasks, dispatch them, and monitor completion." Arguments: `description`, `repo`, `branch`.
- **`jules/review-and-merge`** -- "Given completed sessions, review PRs and summarize results." Arguments: `sessionIds`.

Prompts are NOT tools -- they return message templates that guide the AI's reasoning, not execute actions. This is the "guided workflow" primitive the MCP spec provides.

#### Pattern 5: Consistent snake_case naming

Current tools use `jules_` prefix consistently, which is good. Keep it. The naming convention `{domain}_{verb}_{noun}` (e.g., `jules_dispatch_task`, `jules_list_sources`) is already correct.

### CLI Dashboard (MEDIUM confidence)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `cli-table3` | ^0.6.5 | Table rendering for status dashboard | **Recommended for the dashboard.** Simple, dependency-light, handles Unicode borders, color support via chalk (already a dep). 23M+ weekly downloads. No React overhead. |
| `chalk` | ^5.3.0 (current) | Terminal colors | Already in use. Upgrade to ^5.6.2 for latest fixes. |
| `commander` | ^12.0.0 (current) | CLI framework | Already in use. Upgrade to ^14.0.3 for latest improvements. |

**Why NOT Ink:** Ink (v7.0.2) is React-for-terminal. It excels at full interactive TUI apps with continuous re-rendering. But jules-dispatch's dashboard is a *snapshot view* (render once, display status table). Ink's component model, JSX requirement, and React dependency add significant complexity for a feature that fundamentally needs "render a table with colors." Ink makes sense if the dashboard becomes a live-updating monitor with keystroke interactions (like htop). That is NOT the current requirement.

**Why NOT blessed:** Blessed (v0.1.81) provides curses-like full TUI with boxes, forms, grids. Vastly overpowered for a status table. Last meaningful update was years ago. Maintenance risk.

**Why NOT @visulima/tabular:** New (2025), claims 2-3x faster than cli-table3. Too new for production dependency. cli-table3 has proven stability.

### Supporting Libraries (No Changes)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `yaml` | ^2.4.0 | YAML parsing | Already in use. |
| `dotenv` | ^16.4.0 | .env loading | Already in use (though config.ts has its own parser). |
| `vitest` | ^1.6.0 | Test runner | Already in use. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI Dashboard | cli-table3 | Ink (React for terminal) | Snapshot dashboard does not need React's component model, continuous re-rendering, or JSX overhead. Ink is for interactive TUI apps, not status tables. |
| CLI Dashboard | cli-table3 | Blessed | Overpowered (full curses-like TUI), maintenance risk, no updates in years. |
| CLI Dashboard | cli-table3 | @visulima/tabular | Too new (2025), no proven track record. cli-table3 has 23M+ weekly downloads and 10+ years of stability. |
| CLI Framework | Commander 14 | Keep Commander 12 | Commander 14 is a minor upgrade; upgrade when convenient, not blocking. |
| MCP SDK | Stay on v1.x | MCP SDK v2 | v2 splits into 3 packages with breaking import changes and API renames. Migration is a separate task. v1.29.0 has `registerTool`, `registerPrompt`, `annotations` -- all features needed. |
| MCP Tool Schema | Zod v4 (current) | Zod v3 | Already on v4. Forward-compatible with MCP SDK v2 which uses `zod/v4` explicitly. |

## Installation

```bash
# New dependency for dashboard
npm install cli-table3

# Upgrade existing (when convenient)
npm install chalk@latest commander@latest
```

## MCP Tool Redesign: Specific Recommendations

### Current state (12 tools)
```
jules_list_sources          -- read
jules_dispatch_task         -- write
jules_dispatch_batch        -- write
jules_get_session           -- read
jules_list_sessions         -- read
jules_status                -- read
jules_list_activities       -- read
jules_get_plan              -- read
jules_approve_plan          -- write
jules_send_message          -- write
jules_cancel_session        -- write (destructive)
jules_wait_for_completion   -- read (long-running)
jules_plan_tasks            -- write (optional)
jules_auto                  -- write (optional)
```

### Recommended additions (high-level orchestration)
```
jules_run_and_wait          -- write + read (dispatch single task, poll until done, return result)
jules_batch_status          -- read (aggregate status of ALL dispatched sessions, not just specified IDs)
```

### Recommended MCP Prompts (guided workflows)
```
jules/dispatch-and-monitor  -- Template: "Dispatch tasks and monitor them to completion"
jules/fix-bugs              -- Template: "Given bug descriptions, dispatch parallel fixes"
jules/refactor              -- Template: "Given a refactoring goal, plan and dispatch tasks"
```

### Annotations for existing tools
```typescript
// Read-only tools
jules_list_sources:      { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
jules_get_session:       { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
jules_list_sessions:     { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
jules_status:            { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
jules_list_activities:   { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
jules_get_plan:          { readOnlyHint: true, idempotentHint: true, openWorldHint: true }

// Write tools
jules_dispatch_task:     { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
jules_dispatch_batch:    { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
jules_approve_plan:      { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
jules_send_message:      { readOnlyHint: false, destructiveHint: false, openWorldHint: true }

// Destructive tools
jules_cancel_session:    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
```

## Sources

- MCP Official Docs -- Tools: https://modelcontextprotocol.io/docs/concepts/tools (HIGH confidence)
- MCP Official Docs -- Prompts: https://modelcontextprotocol.io/docs/concepts/prompts (HIGH confidence)
- MCP TypeScript SDK Context7 docs: registerTool, registerPrompt, annotations (HIGH confidence)
- MCP TypeScript SDK v2 Migration Guide: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration.md (HIGH confidence)
- arXiv: "MCP Tool Descriptions Are Smelly" (856 tools, 103 servers, structured rubric): https://arxiv.org/html/2602.14878v1 (HIGH confidence -- empirical, peer-reviewed)
- Speakeasy: "Design MCP Tools" (workflow grouping, naming, descriptions): https://www.speakeasy.com/mcp/tool-design (MEDIUM confidence -- vendor content, aligns with academic findings)
- Anthropic Engineering: "Code Execution with MCP": https://www.anthropic.com/engineering/code-execution-with-mcp (MEDIUM confidence)
- AWS: "Building MCP Servers with Controlled Tool Orchestration": https://aws.amazon.com/blogs/devops/flexibility-to-framework-building-mcp-servers-with-controlled-tool-orchestration/ (MEDIUM confidence)
- npm registry: version checks for @modelcontextprotocol/sdk (1.29.0), ink (7.0.2), cli-table3 (0.6.5), blessed (0.1.81), chalk (5.6.2), commander (14.0.3), zod (4.4.3) (HIGH confidence)
