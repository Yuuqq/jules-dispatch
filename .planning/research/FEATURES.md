# Feature Landscape

**Domain:** MCP server tool design + CLI parallel workflow orchestration
**Researched:** 2026-05-10
**Context:** Brownfield optimization of jules-dispatch (12 MCP tools, 13 CLI commands)

## Table Stakes

Features users and AI agents expect. Missing these means the tool feels incomplete or agents fail to use it correctly.

### MCP Tool Design (AI Agent UX)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Workflow-level orchestration tools** | Agents cannot reliably compose 12+ fine-grained tools into correct multi-step workflows. Anthropic's own research shows tools should "consolidate functionality, handling frequently chained, multi-step tasks in a single tool call" (Anthropic, "Writing effective tools for AI agents"). Current `jules_auto` is the only such tool; the dispatch-then-monitor workflow has no equivalent. | Medium | E.g., `jules_dispatch_and_wait` that handles the full lifecycle. Reduces tool count from 12 to ~7 while covering more ground. HIGH confidence per Anthropic engineering blog. |
| **Actionable error responses with recovery hints** | Agents need structured recovery paths when tools fail. Anthropic: "a good error message gives the agent a recovery path; a bad one causes thrashing." Current errors return `{ message, status, name }` with no guidance. | Low | Add `recovery_hint` with suggested next action. HIGH confidence per MCP spec and Anthropic guidance. |
| **Tool descriptions that teach composition** | Agents select tools based on description text alone. Anthropic: "description is your documentation -- it's often the only context the model has." Current descriptions are one-liners with no usage guidance or workflow context. | Low | Add when-to-use guidance, expected output shape, and cross-references to related tools. HIGH confidence. |
| **MCP tool annotations** | The MCP spec (2025-06-18) defines `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` to help clients categorize tools. Current server sets none of these. | Low | Set `readOnlyHint: true` on read tools, `destructiveHint: true` on cancel, `idempotentHint: true` on approve. HIGH confidence per official MCP spec. |
| **Consistent response shapes** | Agents build expectations about response structure. ChatForest analysis: "If `list_users` returns `{ results: [...], total_count: N }`, then `list_orders` should too." Current responses are inconsistent -- some have `ok`, some have `results`, some have `summary`. | Low | Standardize on `{ success, data?, error?, meta? }` shape. MEDIUM confidence (community pattern, not spec-mandated). |

### CLI Parallel Workflow Visibility

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Global status dashboard command** | When running 10+ tasks in parallel, users need aggregate visibility. Turborepo's `--ui=tui` and Nx v21's Terminal UI exist specifically because "parallel tasks without visibility is unworkable." Current `status` command only shows raw session list. | Medium | Table output: ID, title, state, elapsed, PR URL. Color-coded states. Refresh with `--watch`. HIGH confidence per turbo/nx precedent. |
| **Structured exit codes for batch** | Users in CI need to distinguish "all passed" (0), "some failed" (4/partial), and "all failed" (1). Current codes exist but are not documented prominently. | Low | Document existing codes; ensure batch commands emit correct codes consistently. HIGH confidence. |
| **Progress indicators during dispatch** | When dispatching 20 tasks, users need live feedback that things are happening. Current batch dispatch prints nothing until complete. | Low | Simple: print each task as it dispatches (`[3/20] Task title... dispatched`). No fancy TUI needed. HIGH confidence. |

### CLI Onboarding

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **First-run validation** | New users need to know their setup works before committing to a batch. Current tool gives no feedback until first dispatch attempt. | Low | `jules-dispatch doctor` or startup check: API key valid, default source reachable. HIGH confidence. |

## Differentiators

Features that set jules-dispatch apart. Not expected, but valued.

### MCP Tool Design

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Response format control** | Anthropic's own research shows that offering `response_format: "concise" | "detailed"` reduces token usage by ~3x while preserving the ability to chain tools. No MCP servers in the Jules ecosystem do this. | Medium | Add `format` parameter to status/session tools. Concise = summary only. Detailed = full activities + metadata. HIGH confidence per Anthropic engineering blog. |
| **Summary-first response pattern** | Instead of returning all session data, return a summary with drill-down pointers. ChatForest: "Return a dense overview with a pointer to fetch details on demand." Reduces context window consumption dramatically for batch monitoring. | Medium | `jules_batch_status` returns `{ total, completed, failed, running, top_issues[] }` instead of full session objects. HIGH confidence per community pattern analysis. |
| **Cross-tool navigation hints** | Responses include `related_tools` field pointing to logical next actions. ChatForest: "Return IDs, references, or even suggested next-tool calls." E.g., dispatch response includes `next: { tool: "jules_wait_for_completion", params: { sessionIds: [...] } }`. | Low | Add `suggested_next` field to key tool responses. MEDIUM confidence (community pattern, untested at scale). |
| **Output schema declarations** | MCP spec (2025-06-18) supports `outputSchema` for structured content validation. Declaring output shapes lets clients validate programmatically and build deterministic pipelines. | Medium | Add `outputSchema` to each tool definition alongside `inputSchema`. HIGH confidence per official MCP spec. |

### CLI Experience

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Watch mode for status** | `jules-dispatch status --watch` with terminal refresh, similar to `watch` command but purpose-built. Shows real-time state transitions across all tracked sessions. | Medium | Use ANSI escape sequences for terminal refresh. Refresh every N seconds. No external TUI library needed. HIGH confidence. |
| **Batch progress timeline** | During `batch` or `auto`, show a compact timeline: `DONE 5 | RUNNING 3 | FAILED 1 | PENDING 11`. Updates in-place on one line. Turbo's TUI does this in a full-screen UI; we can do it inline. | Low | Single-line progress indicator using `\r` overwrite. HIGH confidence. |
| **Session grouping by state** | `status` output groups sessions by state (running, completed, failed) rather than listing chronologically. Makes batch state immediately scannable. | Low | Sort/group output. No new data needed. HIGH confidence. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full-screen TUI (like turbo/nx)** | Turbo and Nx have full-time engineering teams for their TUI. Nx v21 explicitly notes Windows incompatibility. For a small CLI, a full TUI is scope creep and cross-platform liability. | Single-line progress indicators and `--watch` refresh mode. Good enough, works everywhere. |
| **More fine-grained atomic MCP tools** | Adding more tools makes the tool-overload problem worse. Anthropic's research is clear: "fewer, well-designed tools > many generic tools." The Jentic MCP Tool Trap analysis shows accuracy declining after "just a handful" of tools. Current 12 is already at the edge. | Consolidate into fewer, higher-level workflow tools. Target 6-8 tools total. |
| **Web dashboard / browser UI** | Explicitly out of scope per PROJECT.md. Adds deployment complexity (static hosting, auth) for marginal benefit over terminal output. | Invest in structured JSON output that can feed external dashboards if users want them. |
| **Streaming/real-time MCP notifications** | MCP supports `notifications/tools/list_changed` but real-time session updates over MCP would require persistent connections and add complexity to every MCP client integration. | Polling-based status checks via `jules_batch_status` tool. Agents already handle polling loops well. |
| **Plugin/extension system** | Premature abstraction. No user has asked for this. Adds API stability burden. | Keep the tool surface focused. Accept feature requests via GitHub issues. |
| **Multi-agent orchestration** | Tools like `jules_auto` already fan out to parallel Jules tasks. Adding a "meta-orchestrator" that dispatches to sub-agents would be architectural overkill for the current use case. | Let the MCP client (Claude Code, Codex) be the orchestrator. Provide good primitives. |
| **Interactive prompts in MCP mode** | MCP tools should never require interactive input (no stdin reads, no y/N prompts). Agents cannot provide interactive input. Current code is clean on this but worth calling out as a principle. | All MCP tools are fire-and-forget with structured responses. Confirmation gates belong in the agent, not the tool. |

## Feature Dependencies

```
Workflow-level MCP tools (dispatch_and_wait)
  -> Requires: Actionable error responses (recovery hints)
  -> Requires: Consistent response shapes

Global status dashboard (CLI)
  -> Independent: can be built standalone
  -> Enables: Watch mode (reuses dashboard output with --watch flag)

Tool annotations
  -> Independent: can be added to existing tools without changes

Response format control (concise/detailed)
  -> Requires: Consistent response shapes (refactor first)
  -> Enables: Summary-first pattern (concise = summary, detailed = full)

Batch progress timeline
  -> Independent: can be added to dispatcher output
  -> Complements: Global status dashboard (same state data)

First-run validation (doctor)
  -> Independent: self-contained check
  -> Blocks: Nothing, but improves onboarding for all features

Output schema declarations
  -> Requires: Consistent response shapes (schemas must match actual output)
  -> Independent of: All other features (can be done in parallel)
```

## Current Tool Inventory vs. Recommended Target

### Current 12 MCP Tools (Fragmented)

| Current Tool | Purpose | Problem |
|-------------|---------|---------|
| `jules_list_sources` | List repos | Fine, low-level |
| `jules_dispatch_task` | Single dispatch | Fine, but agents rarely dispatch just one |
| `jules_dispatch_batch` | Batch dispatch | Good, but no lifecycle tracking |
| `jules_get_session` | Get session details | Too low-level for agents; returns raw API response |
| `jules_list_sessions` | List recent sessions | Returns raw paginated API response |
| `jules_status` | Status for N sessions | Good concept, but returns unshaped data |
| `jules_list_activities` | Activity log | Agents rarely need raw activities |
| `jules_get_plan` | Get plan | Too granular; agents check plan during approval flow |
| `jules_approve_plan` | Approve plan | Fine, action tool |
| `jules_send_message` | Send message | Fine, action tool |
| `jules_cancel_session` | Cancel session | Fine, action tool |
| `jules_wait_for_completion` | Poll until done | Good concept, but blocking |
| `jules_plan_tasks` | LLM planning | Optional, good |
| `jules_auto` | Plan + dispatch | Good high-level tool |

### Recommended ~7-8 MCP Tools (Consolidated)

| Proposed Tool | Replaces | Why Better |
|---------------|----------|------------|
| `jules_dispatch` | dispatch_task, dispatch_batch | Single tool handles 1-N tasks. Array of 1 = single dispatch. |
| `jules_monitor` | status, wait_for_completion | Returns current batch status. Accepts `sessionIds`. Optional `wait: true` to poll. |
| `jules_interact` | get_session, get_plan, list_activities | Rich session context: state, plan, recent activities, PR. One call instead of 3. |
| `jules_approve_plan` | approve_plan | Unchanged -- clear action tool. |
| `jules_send_message` | send_message | Unchanged -- clear action tool. |
| `jules_cancel` | cancel_session | Unchanged -- clear action tool. |
| `jules_list_sources` | list_sources | Unchanged -- discovery tool. |
| `jules_auto` | auto, plan_tasks | Keep as-is. Optional high-level orchestration. |

Net: 12 -> 8 tools. Each remaining tool has a clear, distinct purpose. Composition is guided by descriptions, not forced by fragmentation.

## MVP Recommendation

### Phase 1: MCP Tool Consolidation (highest impact, lowest risk)

1. Consolidate 12 -> 8 MCP tools as described above
2. Add tool annotations (readOnlyHint, destructiveHint) to all tools
3. Add actionable error responses with recovery hints
4. Write rich tool descriptions that guide composition
5. Add consistent response shapes across all tools

Rationale: This directly addresses pain point #1 (MCP tools too fragmented) with no CLI changes needed. It is backward-compatible (old tool names can remain as aliases if desired).

### Phase 2: CLI Progress & Visibility (addresses pain point #2)

1. Add single-line batch progress indicator (`[5/20] Running...`)
2. Add `status --watch` mode with terminal refresh
3. Group status output by state
4. Add first-run validation (`jules-dispatch doctor`)

Rationale: Turbo and Nx prove that parallel task visibility is table-stakes. But we deliberately use simple terminal output instead of a full TUI, keeping scope proportional to team size.

### Defer

- **Output schema declarations**: Valuable but not blocking. Add after response shapes stabilize.
- **Response format control (concise/detailed)**: Nice-to-have optimization. Requires response shape consistency first.
- **Cross-tool navigation hints**: Experimental pattern. Add only if agent evaluation shows agents struggle with composition after consolidation.

## Sources

- [Anthropic: Writing Effective Tools for AI Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) -- Tool design principles, consolidation guidance, response format control (HIGH confidence)
- [Anthropic: Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents) -- Workflow patterns, ACI design principles (HIGH confidence)
- [MCP Specification: Tools](https://modelcontextprotocol.io/docs/concepts/tools) -- Tool annotations (readOnlyHint, destructiveHint, idempotentHint), outputSchema, structuredContent (HIGH confidence, official spec)
- [Jentic: The MCP Tool Trap](https://jentic.com/blog/the-mcp-tool-trap) -- Tool overload analysis, accuracy decline after "a handful" of tools (MEDIUM confidence, industry analysis)
- [Too Many MCP Tools Make Agents Worse](https://dev.to/deathsaber/too-many-mcp-tools-make-agents-worse-heres-how-i-fixed-it-44n2) -- Progressive tool discovery, context bloat (MEDIUM confidence, practitioner experience)
- [ChatForest: MCP Tool Design Patterns](https://chatforest.com/guides/mcp-tool-design-patterns/) -- Summary-first pattern, cross-tool references, error recovery pattern, composability patterns (MEDIUM confidence, community analysis)
- [Turborepo: Configuration Reference](https://turborepo.dev/docs/reference/configuration) -- TUI vs stream UI modes, parallel task display (HIGH confidence, official docs)
- [Nx: Terminal UI](https://nx.dev/docs/guides/tasks--caching/terminal-ui) -- Interactive TUI for parallel tasks, keyboard-driven navigation (HIGH confidence, official docs)
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) -- Agents writing code to call tools instead of direct invocation (HIGH confidence)
