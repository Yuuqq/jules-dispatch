# Project Research Summary

**Project:** jules-dispatch
**Domain:** CLI + MCP server for batch-dispatching tasks to Google Jules in parallel
**Researched:** 2026-05-11
**Confidence:** HIGH

## Executive Summary

jules-dispatch is a brownfield CLI/MCP server tool that needs incremental optimization, not a rewrite. The research converges on two interlocking problems: (1) the MCP tool surface exposes 12 low-level API wrappers that AI agents cannot reliably compose into workflows, and (2) the CLI provides no aggregate visibility into parallel batch operations. Both problems are well-understood in the MCP ecosystem -- the arXiv study of 856 tools across 103 servers quantified the tool-overload problem, and Anthropic's own engineering blog prescribes the solution: consolidate into fewer, outcome-oriented tools with workflow-guiding descriptions.

The recommended approach is a three-phase effort: first consolidate the MCP tool surface from 12 fragmented tools to ~8 outcome-oriented ones with rich descriptions and annotations (highest impact, lowest risk); second, fix the data foundation (error handling, deriveStatus() testing, retry logic) that both the MCP tools and the future CLI dashboard depend on; third, build the CLI status dashboard on top of that tested foundation. This ordering is dictated by dependency analysis: the dashboard consumes the same status data as MCP tools, so the data layer must be reliable before either consumer can be trusted.

The dominant risk is breaking existing MCP tool contracts during consolidation. Since jules-dispatch is on npm (v1.2.0) and MCP has no versioning mechanism for individual tools, any renamed or removed tool silently breaks user workflows. The mitigation is additive-only changes: new consolidated tools are added alongside existing ones, old tools are deprecated via description text, and removal only happens at a major version boundary.

## Key Findings

### Recommended Stack

No new framework or runtime changes are needed. The existing TypeScript 5.4+ / Node 20+ / ESM stack is correct and forward-compatible. The MCP SDK should stay on v1.x (v1.29.0 has registerTool, registerPrompt, and annotations -- all features needed for the redesign). The only new dependency is cli-table3 for the CLI status dashboard, chosen over Ink because the dashboard is a snapshot table, not a live interactive TUI.

**Core technologies:**
- TypeScript 5.4+ / Node 20+ / ESM: unchanged runtime -- no migration needed
- @modelcontextprotocol/sdk v1.29.0: stay on v1.x, has all needed APIs (registerTool, registerPrompt, annotations)
- zod v4: already on v4, forward-compatible with MCP SDK v2 which uses zod/v4 explicitly
- cli-table3 v0.6.5: new addition for dashboard table rendering, 23M+ weekly downloads, minimal dependency footprint
- commander v12 (upgrade to v14 when convenient): existing CLI framework, no structural changes needed
- vitest v1.6.0: existing test runner, used to bring coverage up from near-zero on core modules

**What to avoid:**
- MCP SDK v2 migration: breaking import changes, separate task, not needed now
- Ink (React-for-terminal): overkill for snapshot table output, adds JSX + React dependency
- Blessed: unmaintained, massively overpowered for a status table
- Any new framework or runtime change

### Expected Features

**Must have (table stakes):**
- Workflow-level MCP orchestration tools -- agents cannot compose 12 fine-grained tools reliably
- Rich tool descriptions with Purpose + Guidelines + Limitations -- 97.1% of MCP tools have description quality issues per arXiv study
- MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint) -- official spec feature, non-breaking
- Consistent response shapes across all tools
- Actionable error responses with recovery hints
- CLI status dashboard command -- aggregate view of all batch task states
- First-run validation (jules-dispatch doctor)

**Should have (differentiators):**
- Response format control (concise | detailed) -- reduces token usage ~3x
- Summary-first response pattern for batch status
- CLI watch mode (--watch) with terminal refresh
- Batch progress timeline during dispatch

**Defer (v2+):**
- Output schema declarations (outputSchema) -- add after response shapes stabilize
- Cross-tool navigation hints (suggested_next field) -- experimental, untested at scale
- MCP Prompts (registerPrompt) for guided workflows -- add after core consolidation proves itself
- MCP SDK v2 migration -- breaking changes, separate effort

### Architecture Approach

The research identifies a three-tier tool surface as the target architecture, with a new Orchestrator layer sitting between the MCP tool handlers and the existing core modules. Tier 1 orchestration tools (dispatch, monitor, auto) handle 90% of agent workflows in a single call. Tier 2 lifecycle tools (single dispatch, session detail, cancel, message) provide fine-grained control. Tier 3 low-level tools (sources, plan, activities) serve inspection use cases. This mirrors the proven patterns from GitHub MCP and Sentry MCP.

**Major components:**
1. Tool Registry (new in mcp.ts) -- groups tools into tiers, attaches annotations and rich descriptions
2. Orchestrator (new module) -- composes dispatch + poll + result collection into single-call workflows
3. Core Modules (existing, unchanged) -- config.ts, client.ts, dispatcher.ts, collector.ts remain as-is
4. CLI Dashboard (new command) -- cli-table3 table rendering with --watch mode and --json fallback

### Critical Pitfalls

1. **Breaking MCP tool contracts during consolidation** -- never remove or rename tools; add new ones alongside old ones, deprecate via description text, enforce semver
2. **Tool descriptions written for humans, not agents** -- apply Purpose + Guidelines + Limitations rubric; skip Examples (ablation showed they can introduce ambiguity)
3. **Silent failures and invisible state** -- empty catch blocks in collector.ts and mcp.ts suppress errors; every catch must handle, track, or propagate
4. **Dashboard built on untested data foundation** -- deriveStatus() is completely untested (H1); require 80%+ coverage before dashboard work begins
5. **Polling without backoff amplified at scale** -- fixed intervals at 50 concurrent sessions = 5 API calls/second; add exponential backoff with jitter

## Implications for Roadmap

### Phase 1: MCP Tool Surface Redesign
**Rationale:** Highest impact, lowest risk. Addresses the primary pain point (tool fragmentation) without touching CLI or requiring new dependencies. All four research files converge on this as the first priority.
**Delivers:** Consolidated tool surface (~8 outcome-oriented tools), rich descriptions, MCP annotations, consistent response shapes, actionable error responses
**Addresses:** MCP tool composability (PROJECT.md active requirement), tool descriptions for AI agents
**Avoids:** Pitfall 1 (fragmentation not reduced), Pitfall 2 (descriptions for humans not agents), Pitfall 4 (breaking contracts via additive-only approach)

### Phase 2: Data Foundation Hardening
**Rationale:** Both the MCP tools and the CLI dashboard consume status data from the same core modules. deriveStatus() is untested, the collector silently swallows errors, and network failures bypass retry logic. Fixing these before building the dashboard is mandatory (Pitfall 5).
**Delivers:** Tested deriveStatus() with 80%+ coverage, fixed error handling in collector, network error retry, exponential backoff with jitter, corrected AUTO_CREATE_PR default
**Uses:** vitest for testing, existing client.ts/dispatcher.ts/collector.ts modules
**Implements:** Reliability improvements that both MCP and CLI paths depend on
**Avoids:** Pitfall 3 (silent failures), Pitfall 5 (untested foundation), Pitfall 8 (network error retry gap), Pitfall 12 (destructive defaults)

### Phase 3: CLI Status Dashboard
**Rationale:** Can only be built after Phase 2 provides reliable data. The dashboard is a snapshot table, not a full TUI, keeping scope proportional to team size.
**Delivers:** jules-dispatch dashboard command, status --watch mode, batch progress timeline, --json fallback, first-run validation (doctor command)
**Uses:** cli-table3 for table rendering, existing output.ts dual-output pattern
**Implements:** CLI progress visibility (PROJECT.md active requirement)
**Avoids:** Pitfall 5 (dashboard on bad data -- already fixed in Phase 2), Pitfall 10 (TTY-only output via --json fallback)

### Phase 4: Polish and Differentiators
**Rationale:** After core pain points are addressed, add competitive differentiators that improve the experience but are not table-stakes.
**Delivers:** Response format control (concise/detailed), summary-first patterns, MCP Prompts for guided workflows, configurable toolsets

### Phase Ordering Rationale

- Phase 1 first because it is additive-only (no breaking changes), requires no new dependencies, and directly addresses the primary pain point.
- Phase 2 second because both MCP tools and CLI dashboard consume the same status data. The data layer must be reliable before either consumer is trustworthy. This is a hard dependency.
- Phase 3 third because it depends on Phase 2 tested data layer. Building it earlier would mean displaying unreliable data (Pitfall 5).
- Phase 4 last because differentiators are only valuable after the foundation works.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (CLI Dashboard):** Ink vs cli-table3 decision has conflicting recommendations across research files (ARCHITECTURE.md recommends Ink; STACK.md recommends cli-table3). Resolve based on whether the dashboard is snapshot-only or will evolve toward live-updating.
- **Phase 4 (Configurable Toolsets):** GitHub MCP dynamic-toolsets pattern needs closer study.

Phases with standard patterns (skip research-phase):
- **Phase 1 (MCP Tool Redesign):** Well-documented patterns from Anthropic, arXiv study, Speakeasy, and GitHub MCP. All sources converge.
- **Phase 2 (Data Foundation):** Standard testing and error-handling patterns. No domain-specific research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against npm registry, official docs, and MCP SDK source. |
| Features | HIGH | Backed by Anthropic engineering blog, arXiv peer-reviewed study, multiple MCP server implementations. |
| Architecture | MEDIUM-HIGH | Three-tier pattern proven by GitHub MCP and Sentry MCP. Dashboard library choice needs resolution. |
| Pitfalls | HIGH | Derived from direct codebase inspection cross-referenced with empirical research and official guidance. |

**Overall confidence:** HIGH

### Gaps to Address

- **Ink vs cli-table3 for dashboard:** ARCHITECTURE.md recommends Ink with Static/live split. STACK.md recommends cli-table3 for snapshot views. If --watch with live updates is in scope for Phase 3, Ink is the better long-term choice.
- **MCP SDK v2 timeline:** If v2 release is imminent, Phase 1 import paths may need rework. Monitor and defer migration regardless.
- **Jules API rate limits:** API is v1alpha with unknown rate limits. Phase 2 backoff must use conservative defaults. Scale testing (>50 sessions) requires production validation.

## Sources

### Primary (HIGH confidence)
- MCP Official Specification: https://modelcontextprotocol.io/docs/concepts/tools
- Anthropic Engineering: https://www.anthropic.com/engineering/writing-tools-for-agents
- arXiv 2602.14878 (856 tools, 103 servers, peer-reviewed): https://arxiv.org/html/2602.14878v1
- GitHub MCP Server: https://github.com/github/github-mcp-server
- Sentry MCP Server: https://github.com/getsentry/sentry-mcp
- jules-dispatch codebase (mcp.ts, client.ts, collector.ts, dispatcher.ts)

### Secondary (MEDIUM confidence)
- Speakeasy: https://www.speakeasy.com/mcp/tool-design
- ChatForest: https://chatforest.com/guides/mcp-tool-design-patterns/
- AWS MCP orchestration: https://aws.amazon.com/blogs/devops/flexibility-to-framework-building-mcp-servers-with-controlled-tool-orchestration/
- Turborepo TUI modes: https://turborepo.dev/docs/reference/configuration
- Nx Terminal UI: https://nx.dev/docs

### Tertiary (LOW confidence, needs validation)
- Jentic MCP Tool Trap: https://jentic.com/blog/the-mcp-tool-trap
- dev.to practitioner blog on MCP tool overload
- Evil Martians CLI UX patterns

---
*Research completed: 2026-05-11*
*Ready for roadmap: yes*
