---
name: jules-dispatch
description: Dispatch independent coding tasks to Google Jules through the jules-dispatch CLI or MCP server, then monitor sessions and report PR URLs. Use when Codex or Claude Code needs to fan out implementation, testing, refactoring, review, migration, or documentation work into parallel Jules sessions; when a user asks to use Jules, jules-dispatch, batch dispatch, parallel coding agents, or Google Jules; or when installing/configuring this project as an MCP-backed skill for Claude Code or Codex.
---

# Jules Dispatch

## Overview

Use `jules-dispatch` as the orchestration layer between an AI coding assistant and Google Jules. Prefer MCP tools when available; use the CLI when MCP is not configured or when the user asks for task files/scripts.

## Setup Check

Before dispatching work, verify the project can reach Jules:

```bash
jules-dispatch doctor
```

If the command is unavailable, install the package first:

```bash
npm install -g jules-dispatch
```

Required environment:

- `JULES_API_KEY`
- `JULES_DEFAULT_SOURCE`, unless every task supplies `source`
- `JULES_DEFAULT_BRANCH`, optional and defaults to `main`

Jules works from the configured remote source branch. Before dispatching a task that depends on local edits, commit and push those edits to the target branch; unpushed worktree changes are invisible to Jules.

## MCP Installation

For Claude Code:

```bash
claude mcp add jules-dispatch -- jules-dispatch mcp
```

For Codex CLI, add this server to `~/.codex/config.toml`:

```toml
[mcp_servers.jules-dispatch]
type = "stdio"
command = "jules-dispatch"
args = ["mcp"]
env = { JULES_API_KEY = "<your-api-key>", JULES_DEFAULT_SOURCE = "sources/github/<owner>/<repo>", JULES_DEFAULT_BRANCH = "main" }
```

For repo-specific defaults, run MCP with a project directory containing `.env`:

```bash
jules-dispatch --project /path/to/project mcp
```

## Dispatch Workflow

1. Decompose the user's request into independent, PR-sized tasks. Keep tasks small enough that each Jules session can finish and open a focused PR.
2. Include `title` and a detailed `prompt` for every task. Add `source`, `branch`, `autoMode`, or `requirePlanApproval` only when needed.
3. Confirm every prerequisite local change is committed and pushed to the remote target branch.
4. Use `jules_list_sources` first if the source identifier is unknown.
5. Dispatch with `jules_dispatch`, not deprecated aliases, unless only legacy tools are available. Set `parallel` for the concurrency cap and `paceMs` when launches must be globally spaced; the worker pool continuously starts queued tasks as capacity becomes available.
6. Monitor with `jules_monitor` using `wait: true` when the user asked for completion, PR URLs, or end-to-end orchestration. Waiting returns when all sessions are terminal, any session requires action, or the timeout expires.
7. When `actionRequired` contains sessions, inspect each with `jules_interact`. Review and approve plans with `jules_approve_plan`, or answer feedback requests and paused sessions with `jules_send_message` when appropriate.
8. Call `jules_monitor` again for the action-required and still-running session IDs. Repeat the inspect, act, monitor loop until every session is terminal or the user must decide the next action.
9. Use `jules_cancel_session` only when a session is unwanted, clearly stuck, or superseded.

## Preferred MCP Tools

- `jules_dispatch`: create one or more sessions from a task object, task array, or YAML/JSON payload; supports `parallel` (1–50) and global `paceMs` (0–60000).
- `jules_monitor`: check sessions or wait until terminal/action-required state; monitor again after handling requested actions.
- `jules_interact`: fetch session details, status, globally latest plan, newest chronological activities, full `activityTotal`, and PR output.
- `jules_list_sources`: discover connected GitHub source identifiers.
- `jules_approve_plan`: approve a plan-gated session after review.
- `jules_send_message`: send follow-up instructions to a session.
- `jules_cancel_session`: cancel a running session.
- `jules_plan_tasks` and `jules_auto`: optional LLM-backed planning tools, available only when an LLM key is configured.

Avoid deprecated aliases (`jules_dispatch_task`, `jules_dispatch_batch`, `jules_status`, `jules_wait_for_completion`, `jules_get_session`, `jules_list_activities`, `jules_get_plan`) unless the active MCP server exposes only those names.

## CLI Fallback

Use CLI commands when MCP tools are unavailable:

```bash
jules-dispatch sources
jules-dispatch dispatch tasks/my-task.yaml
jules-dispatch batch tasks/ --parallel 10 --pace-ms 250
jules-dispatch status --ids <session-id>
jules-dispatch wait <session-id> --timeout 1800000
jules-dispatch get <session-id>
```

Task file format:

```yaml
title: "Add unit tests for auth module"
prompt: |
  Add comprehensive unit tests for src/auth.ts.
  Cover valid login, invalid login, token refresh, and session expiry.
  Open a focused PR with the tests.
source: "sources/github/owner/repo"
branch: "main"
autoMode: "AUTO_CREATE_PR"
requirePlanApproval: false
```

## Reporting

Report dispatched session IDs immediately. After monitoring completes, report each task's terminal status and PR URL when available. If any session fails, is cancelled, times out, awaits plan approval or user feedback, or is paused, include the session ID and the next action taken or needed.
