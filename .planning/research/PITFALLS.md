# Domain Pitfalls

**Domain:** MCP server tool design, CLI batch-orchestration, incremental brownfield optimization
**Researched:** 2026-05-10
**Project:** jules-dispatch (12 MCP tools, 13 CLI commands, TypeScript/ESM, Node 20+)

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Tool Fragmentation -- Exposing API Operations Instead of Outcomes

**What goes wrong:** The current MCP surface has 12 tools that map nearly 1:1 to Jules API operations (`jules_get_session`, `jules_list_sessions`, `jules_list_activities`, `jules_get_plan`, `jules_approve_plan`, `jules_send_message`, `jules_cancel_session`). AI agents must chain 3-4 calls to answer a simple question like "is my task done yet?" -- calling `jules_get_session`, then `jules_list_activities`, then manually deriving status from the combined result. This is the "operation-oriented" anti-pattern confirmed by Block (who went from 30+ tools to 2), GitHub Copilot (40 to 13), and the Speakeasy Pet Store experiment (107 tools = total failure cliff, 10 tools = perfect).

**Why it happens:** Developers naturally wrap API endpoints as tools because the mapping is mechanical and feels complete. The jules-dispatch MCP tools were likely built endpoint-first during initial development.

**Consequences:** Agents burn tokens on intermediate results, accumulate latency across round-trips, and compound failure probability with each chained call (3 calls at 95% success each = 85.7% overall). Agents also hallucinate tool names or conflate parameters when presented with too many similar tools.

**Prevention:** Consolidate into outcome-oriented tools that match what agents actually want to do:
- A `jules_task_status` tool that takes sessionIds and returns derived status + PR info in one call (the current `jules_status` tool is a step in this direction but is underdescribed)
- A `jules_dispatch_and_wait` orchestration tool that combines dispatch + polling + result collection
- A `jules_review_plan` tool that combines get-plan + approve into a single workflow step

The academic study (arXiv 2602.14878) found that 56% of MCP tool descriptions fail to state their purpose clearly and 89.3% lack usage guidelines. Each consolidated tool should include Purpose, Guidelines, and Limitations in its description.

**Detection:** Count your tools. If above 15, you are past the diminishing-returns threshold. Run this test: give an agent 10 representative user requests and see if it selects the right tool on the first try. Below 90% accuracy = descriptions need work.

**Phase:** Should be addressed in the MCP tool redesign phase (first active requirement in PROJECT.md).

### Pitfall 2: Tool Descriptions Written for Humans, Not Agents

**What goes wrong:** Tool descriptions like "Get full details of a single Jules session including state and any created PR" describe what the tool does technically but fail to tell the agent when to use it, what it returns that matters, or how it fits into a workflow. The arXiv study of 856 MCP tools found 97.1% contain at least one description quality smell. Augmented descriptions improved task success by a median 5.85 percentage points -- but also increased execution steps by 67.46%, so augmentation must be targeted, not voluminous.

**Why it happens:** Developers write descriptions the way they would write API documentation for other developers. But agents are not developers -- they lack the implicit context about workflow ordering, parameter semantics, and tool relationships that humans carry.

**Consequences:** Agents call the wrong tool, call tools in the wrong order, supply invalid parameters, or fall back to exhaustive enumeration (calling every tool to find what they need).

**Prevention:** Apply the six-component rubric from the arXiv study to each tool description. For jules-dispatch, the most impactful components are:
1. **Purpose** -- What the tool does in plain language (NOT what endpoint it wraps)
2. **Guidelines** -- When to use it and when NOT to use it (e.g., "Use this after dispatching to check results, not for monitoring progress -- use jules_wait_for_completion for that")
3. **Limitations** -- What it cannot do (e.g., "Returns at most 200 sessions per page")

The Anthropic research found that compact combinations (Purpose + Guidelines) often outperform fully augmented descriptions. Do NOT blindly add Examples or exhaustive Parameter Explanations -- the ablation study showed these can degrade performance in some domain-model combinations by introducing ambiguous or contradictory statements.

**Detection:** Present your tool list to an LLM and ask it to select the right tool for 10 different user requests. Below 90% accuracy = descriptions need work.

**Phase:** Should be addressed alongside tool redesign -- descriptions are part of the tool surface.

### Pitfall 3: Silent Failures and Invisible State

**What goes wrong:** The codebase already has documented instances of this (H2: silent error swallowing in collector, M6: silent autoMode fallback to AUTO_CREATE_PR). But the pattern is deeper: the `jules_wait_for_completion` tool swallows transient errors in its catch block (`catch { /* transient */ }` on line 271), meaning a session that becomes unreachable will simply be reported as "stillRunning" until timeout. The agent has no way to distinguish "still processing" from "network partition."

**Why it happens:** Defensive coding that catches exceptions to prevent crashes but discards the error information. The intent is resilience, but the result is opacity.

**Consequences:** Agents (and humans) make decisions based on stale or incorrect state. A batch of 10 tasks where 3 fail silently appears as "7 completed, 3 still running" rather than "7 completed, 3 failed." The agent will keep polling the 3 "running" tasks until timeout, wasting tokens and time.

**Prevention:**
1. Track error state explicitly. The `jules_wait_for_completion` tool should return an `errors` array alongside `completed`, `failed`, `cancelled`, `stillRunning`.
2. Distinguish retryable errors from permanent failures. A 404 on a session ID is permanent; a 503 is transient.
3. Include a `lastError` field in session status responses so agents can reason about what went wrong.
4. Add verbose-mode logging at minimum for catch blocks (addressing H2 from CONCERNS.md).

**Detection:** Search for empty catch blocks, catch blocks that only log in verbose mode, and catch blocks that suppress errors without tracking them. In the current codebase: `collector.ts:80-83`, `collector.ts:221-223`, `mcp.ts:271`.

**Phase:** Should be addressed in the error-handling improvement phase, before or alongside dashboard work.

### Pitfall 4: Breaking MCP Tool Contracts During Refactoring

**What goes wrong:** When consolidating tools (Pitfall 1), the natural approach is to rename tools, change parameter names, or merge tools. But MCP clients cache tool schemas and any existing agent workflows, scripts, or integrations built against the current 12 tools will break silently. This is especially dangerous because MCP has no versioning mechanism for individual tools.

**Why it happens:** MCP's protocol decouples tool discovery from invocation, which means the client rediscovers tools on each connection. Developers assume this means they can change tools freely. But in practice, agents develop "muscle memory" in their context windows within a session, and human-authored agent workflows reference tool names directly.

**Consequences:** Existing users' agent workflows stop working. Since jules-dispatch is on npm (v1.2.0), breaking changes propagate immediately to all users on upgrade. There is no deprecation cycle in MCP.

**Prevention:**
1. **Never remove a tool.** Add new consolidated tools alongside existing ones.
2. **Deprecate in descriptions, not in code.** Add "DEPRECATED: Use jules_task_status instead" to old tool descriptions.
3. **Keep old tools functional for at least one major version.** They can delegate to the new implementation internally.
4. **Use semantic versioning strictly.** Tool surface changes = major version bump.
5. **Test tool compatibility.** Maintain a test suite that calls each tool with its expected parameters and asserts the response shape.

**Detection:** Any PR that removes or renames a tool exported from mcp.ts should be treated as a breaking change requiring major version bump.

**Phase:** Applies to every phase that touches mcp.ts. This is a continuous concern, not a one-time fix.

### Pitfall 5: Dashboard Without Structured Data Foundation

**What goes wrong:** Building a CLI dashboard (the "global status dashboard" requirement in PROJECT.md) before establishing reliable data collection and status derivation means the dashboard displays unreliable information. The current `deriveStatus()` function (client.ts:181-197) is completely untested (H1), and the collector silently swallows errors (H2). A dashboard built on top of these will show misleading data.

**Why it happens:** Dashboard work is visually rewarding and feels like progress. The underlying data quality issues are invisible until the dashboard shows wrong information and users lose trust in it.

**Consequences:** Users make decisions based on incorrect status (e.g., thinking a task failed when it actually succeeded, or vice versa). Once trust is lost, the dashboard is abandoned regardless of later fixes.

**Prevention:**
1. **Test `deriveStatus()` exhaustively first.** Cover all Jules session states, edge cases (missing fields, empty activities), and the mapping to the tool's status categories.
2. **Fix error collection before building display.** Address H2 and M3 before any dashboard work.
3. **Build the dashboard as a consumer of a tested data layer.** The dashboard command should call the same tested functions that the MCP tools use, not duplicate logic.

**Detection:** If the dashboard phase begins before `deriveStatus()` has test coverage above 80%, stop and fix the foundation first.

**Phase:** Must be addressed before the dashboard phase. Testing `deriveStatus()` and fixing error handling are prerequisites.

---

## Moderate Pitfalls

### Pitfall 6: Polling Without Backoff (Amplified at Scale)

**What goes wrong:** Both the CLI and MCP tools poll at fixed intervals (L1). At small scale this is tolerable. But when an agent dispatches a batch of 50 tasks and then polls all 50 every 10 seconds via `jules_wait_for_completion`, that is 5 API calls per second sustained for the duration of all tasks. The Jules API is v1alpha with unknown rate limits.

**Why it happens:** Fixed intervals are simpler to implement and reason about. The current codebase is designed for human-scale usage where one person dispatches a few tasks.

**Prevention:** Implement exponential backoff with jitter in the polling loop. Start at the configured interval, double after each poll up to a maximum (e.g., 60s), and add random jitter to prevent thundering herd when multiple agents poll simultaneously.

**Detection:** Any `setTimeout(r, interval)` or `await sleep(interval)` in a loop without backoff logic.

**Phase:** Address alongside or immediately after error handling fixes. Low effort, high value at scale.

### Pitfall 7: Token-Inefficient Tool Responses

**What goes wrong:** The MCP tools return full JSON objects via `JSON.stringify(result, null, 2)`. For `jules_list_sessions` with a default page size of 50, this could return thousands of tokens of session data. The Anthropic engineering blog showed that agents scale better when tools filter and transform results before returning them -- returning 5 relevant rows instead of 10,000 reduced context consumption by orders of magnitude.

**Why it happens:** JSON.stringify is the simplest serialization. No filtering or projection logic has been implemented.

**Prevention:**
1. Add `format` or `detail` parameters to tools that return large datasets. Options like "summary" vs "full" let the agent control token consumption.
2. For `jules_status`, return only derived status fields by default, not raw session + activity data.
3. Truncate large responses and include a note like "Results truncated to 10 sessions. Use pageSize parameter for more."

**Detection:** Any tool response that exceeds ~2000 tokens in common usage.

**Phase:** Address during tool redesign. Add format/detail parameters to the consolidated tools from the start.

### Pitfall 8: Missing Network Error Retry (Fetch Exceptions Bypass Retry Logic)

**What goes wrong:** Already documented as M3. The retry logic in client.ts only triggers on HTTP 429/5xx status codes. When `fetch()` throws (DNS errors, connection refused, timeouts), the retry logic is bypassed entirely. This is especially relevant for MCP usage where an agent might be running in a CI environment with flaky networking.

**Why it happens:** The retry loop checks `response.status` but `fetch()` throws before returning a response object. The error path does not enter the retry loop.

**Prevention:** Wrap the fetch call in try/catch within the retry loop. Retry on `TypeError` (network errors) and `DOMException` (abort/timeout) in addition to HTTP status codes.

**Detection:** Look for `fetch()` calls where the retry logic only operates on the response object, not on the fetch call itself.

**Phase:** Address in the reliability/error-handling phase. Quick fix, high impact.

### Pitfall 9: `as any` Type Casts at MCP Boundary Lose Type Safety

**What goes wrong:** Already documented as M4. Two `as any` casts at mcp.ts:58 and mcp.ts:255 work around SDK generic inference issues. When tool signatures change during redesign, the type checker will not catch mismatches between the declared schema and the handler's expected arguments.

**Why it happens:** The MCP SDK's generic inference for `registerTool` does not compose well with wrapper functions.

**Prevention:** Create a typed wrapper that validates at runtime what the type system cannot verify statically. Use Zod's `parse()` on incoming args in the wrapper before passing to handlers.

**Detection:** Search for `as any` in mcp.ts. Any remaining instances after the wrapper improvement are flags.

**Phase:** Address during tool redesign when the wrapper function will be modified anyway.

### Pitfall 10: CLI Dashboard Output That Breaks Piping and Scripting

**What goes wrong:** When adding a dashboard command, the temptation is to use terminal control sequences (ANSI escape codes, cursor movement, color) for a rich display. But CLI output that uses these codes breaks when piped to `grep`, redirected to a file, or consumed by other tools. The Evil Martians CLI UX guide emphasizes: "check how your app's standard output stream looks in a text file by redirecting it" and "one command's output might be another's input via the pipe operator."

**Why it happens:** Terminal dashboards look impressive in demos. The human-facing appeal obscures the machine-consumption use case.

**Prevention:**
1. Detect `isatty(stdout)` and use rich formatting only for TTY output.
2. Always provide a `--json` flag that outputs structured data without formatting.
3. The existing `--json` output mode in jules-dispatch is good -- extend this pattern to the dashboard command.
4. Follow the existing dual-output pattern (text + JSON) already established in output.ts.

**Detection:** If a new CLI command does not check `isatty` or offer `--json` output.

**Phase:** Applies to the dashboard phase specifically.

---

## Minor Pitfalls

### Pitfall 11: Dead Code and Unused Imports

**What goes wrong:** Already documented as L5. `void resolve;` on mcp.ts:373 suppresses an unused import. During redesign, dead code creates confusion about which code paths are active.

**Prevention:** Remove unused imports immediately. Lint rules should catch these.

**Detection:** ESLint's no-unused-vars rule.

**Phase:** Quick cleanup at the start of any phase touching mcp.ts.

### Pitfall 12: Undocumented Default Behaviors

**What goes wrong:** Already documented as M6. The `AUTO_CREATE_PR` default mode means a user who does not set `JULES_AUTO_MODE` gets automatic PR creation. For an MCP agent that dispatches 20 tasks, this creates 20 unexpected PRs.

**Prevention:** Change the default to `NONE` (safe default). Document the default prominently in tool descriptions so agents can inform users. Alternatively, require explicit opt-in for destructive/side-effect-producing defaults.

**Detection:** Search for fallback values in config loading that have user-visible side effects.

**Phase:** Quick fix, should be done early.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| MCP tool redesign | Breaking existing tool contracts (Pitfall 4) | Add new tools alongside old ones; deprecate in descriptions |
| MCP tool redesign | Tool fragmentation not reduced (Pitfall 1) | Target 5-10 outcome-oriented tools; measure agent tool-selection accuracy |
| MCP tool descriptions | Over-augmentation causing token bloat (Pitfall 2) | Use Purpose + Guidelines only; skip Examples (ablation study showed no statistical degradation without Examples) |
| Error handling | Silent failures remaining after "fix" (Pitfall 3) | Every catch block must either handle, track, or propagate the error -- never silently discard |
| Dashboard | Building on untested foundation (Pitfall 5) | Require 80%+ test coverage on deriveStatus and collector before dashboard work begins |
| Dashboard | TTY-only output breaks scripting (Pitfall 10) | Always offer --json; detect isatty for formatting |
| Testing | Tests that verify implementation, not behavior | Test deriveStatus against known session states, not against code structure |
| Backward compat | Semver violations on tool surface changes | Any tool name/parameter removal = major version bump |
| Network reliability | Fetch exceptions still bypassing retry after "fix" (Pitfall 8) | Test with simulated network failures (DNS error, connection refused), not just HTTP errors |
| Polling at scale | Thundering herd with multiple agents | Add jitter to backoff; consider event-driven notification if Jules API ever supports webhooks |

---

## Sources

- arXiv 2602.14878 -- "MCP Tool Descriptions Are Smelly!" (856 tools, 103 servers, structured rubric, ablation study). HIGH confidence: peer-reviewed, empirical, large-scale.
- Anthropic Engineering Blog -- "Writing effective tools for AI agents" (tool design principles, namespacing, token efficiency). HIGH confidence: official Anthropic guidance.
- Anthropic Engineering Blog -- "Code execution with MCP" (token reduction via code-mode, progressive disclosure). HIGH confidence: official Anthropic engineering.
- Speakeasy -- "Design MCP tools" (tool curation, workflow-based grouping, <30 tool threshold). MEDIUM confidence: vendor guidance, consistent with other sources.
- dev.to AWS Heroes -- "MCP Tool Design: Why Your AI Agent Is Failing" (Capability Square, outcome-oriented design, Block/GitHub evidence). MEDIUM confidence: practitioner blog, aligns with Anthropic guidance.
- Evil Martians -- "CLI UX Best Practices: 3 Patterns for Improving Progress Displays" (spinner, X-of-Y, progress bar, clean logs). MEDIUM confidence: UX patterns, widely cited.
- jules-dispatch codebase analysis -- CONCERNS.md, mcp.ts source. HIGH confidence: direct code inspection.
