# MCP Integration Guide — jules-dispatch + GSD

> How to install jules-dispatch as an MCP server in Claude Code and Codex, and combine it with GSD (Get Shit Done) for AI-orchestrated parallel development.

---

## Prerequisites

- **Node.js 20+** installed
- **jules-dispatch** installed globally: `npm install -g jules-dispatch`
- A **Google Jules** account with an API key
- A GitHub repo connected to Jules

Validate your setup:

```bash
jules-dispatch doctor
```

---

## 1. Claude Code

### Quick install (recommended)

```bash
claude mcp add jules-dispatch -- jules-dispatch mcp
```

This registers the MCP server globally. Claude Code will start `jules-dispatch mcp` automatically when needed.

### Manual install

Add to `~/.config/claude-code/mcp.json` (create the file if it doesn't exist):

```json
{
  "mcpServers": {
    "jules-dispatch": {
      "command": "jules-dispatch",
      "args": ["mcp"],
      "env": {
        "JULES_API_KEY": "<your-api-key>",
        "JULES_DEFAULT_SOURCE": "sources/github/<owner>/<repo>",
        "JULES_DEFAULT_BRANCH": "main"
      }
    }
  }
}
```

### Per-project install

If different repos need different Jules sources, add to `.claude/settings.json` in the project root:

```json
{
  "mcpServers": {
    "jules-dispatch": {
      "command": "jules-dispatch",
      "args": ["--project", ".", "mcp"],
      "env": {
        "JULES_API_KEY": "<your-api-key>",
        "JULES_DEFAULT_SOURCE": "sources/github/<owner>/<repo>",
        "JULES_DEFAULT_BRANCH": "main"
      }
    }
  }
}
```

### Verify

In Claude Code, type:

```
List my Jules sources
```

Claude should call `jules_list_sources` and return your connected repos.

---

## 2. OpenAI Codex CLI

Add to `~/.codex/config.toml` under `[mcp_servers]`:

```toml
[mcp_servers.jules-dispatch]
type = "stdio"
command = "jules-dispatch"
args = ["mcp"]
env = { JULES_API_KEY = "<your-api-key>", JULES_DEFAULT_SOURCE = "sources/github/<owner>/<repo>", JULES_DEFAULT_BRANCH = "main" }
```

### Verify

In Codex, ask:

```
List available Jules MCP tools
```

---

## 3. Combining with GSD

GSD (Get Shit Done) is a structured development workflow built into Claude Code. It handles planning, phase management, and verification. Combined with jules-dispatch, you get:

| Layer | Role | Tool |
|-------|------|------|
| Strategy | Plan what to build, break into phases | GSD (`/gsd-plan-phase`, `/gsd-execute-phase`) |
| Tactics | Dispatch coding tasks to parallel workers | jules-dispatch MCP (`jules_dispatch`, `jules_monitor`) |
| Execution | Actually write the code | Google Jules |

### Workflow: GSD plans, Jules executes

```
User: "Implement feature X"
  │
  ├─► GSD: /gsd-plan-phase
  │     └─► Produces PLAN.md with task breakdown
  │
  ├─► Claude Code reads PLAN.md
  │     └─► Calls jules_dispatch MCP tool for each task
  │
  ├─► Jules: N parallel sessions execute
  │     └─► Each creates a PR
  │
  ├─► Claude Code: calls jules_monitor (wait=true)
  │     └─► Blocks until all sessions complete
  │
  └─► GSD: /gsd-verify-work
        └─► Reviews PRs, checks test results
```

### Step-by-step

#### 1. Start a GSD phase

```
/gsd-plan-phase
```

GSD will analyze the codebase, create a PLAN.md with task breakdown, dependencies, and verification criteria.

#### 2. Dispatch tasks to Jules

Once the plan is ready, tell Claude:

```
Read the PLAN.md and dispatch each task to Jules using the jules_dispatch MCP tool.
Wait for all sessions to complete, then report the PR URLs.
```

Claude will:
- Read each task from the plan
- Call `jules_dispatch` with the task details
- Call `jules_monitor` with `wait: true` to block until done
- Report back with PR links

#### 3. Verify results

```
/gsd-verify-work
```

GSD reviews the PRs, checks that tests pass, and confirms the phase is complete.

### Example: Claude Code session

```
You: I need to add unit tests for 5 modules in my project. Use jules-dispatch to send each one to Jules in parallel.

Claude: I'll dispatch 5 test-writing tasks to Jules in parallel.

[Calling jules_dispatch with tasks: [
  { title: "Tests for auth.ts", prompt: "..." },
  { title: "Tests for api.ts", prompt: "..." },
  { title: "Tests for utils.ts", prompt: "..." },
  { title: "Tests for config.ts", prompt: "..." },
  { title: "Tests for middleware.ts", prompt: "..." }
]]

Dispatched 5 sessions. Now waiting for completion...

[Calling jules_monitor with sessionIds: [...], wait: true]

All 5 sessions completed. PRs:
- auth tests: github.com/owner/repo/pull/42
- api tests: github.com/owner/repo/pull/43
- utils tests: github.com/owner/repo/pull/44
- config tests: github.com/owner/repo/pull/45
- middleware tests: github.com/owner/repo/pull/46
```

---

## 4. MCP Tools Reference

### Core tools (use these)

| Tool | Purpose | Key params |
|------|---------|------------|
| `jules_dispatch` | Create one or more sessions | `tasks` (object/array/string), `parallel` |
| `jules_monitor` | Check status or wait for completion | `sessionIds`, `wait`, `timeoutMs` |
| `jules_interact` | Full session context (details + plan + activities) | `sessionId`, `activityCount` |

### Utility tools

| Tool | Purpose |
|------|---------|
| `jules_list_sources` | List connected GitHub repos |
| `jules_list_sessions` | List recent sessions (paginated) |
| `jules_approve_plan` | Approve a pending plan |
| `jules_send_message` | Send follow-up message to a session |
| `jules_cancel_session` | Cancel a running session |

### Optional LLM tools (requires `LLM_API_KEY`)

| Tool | Purpose |
|------|---------|
| `jules_plan_tasks` | Expand a high-level intent into N task drafts |
| `jules_auto` | Plan + dispatch in one shot |

### Response format

All tools return:
```json
{ "success": true, "data": { ... } }
```

Errors:
```json
{
  "success": false,
  "error": {
    "message": "Authentication failed",
    "status": 401,
    "recovery_hint": "Check your API key"
  }
}
```

---

## 5. Task File Templates

### Basic task

```yaml
title: "Add unit tests for auth module"
prompt: |
  Add comprehensive unit tests for src/auth.ts:
  1. Test login with valid credentials
  2. Test login with invalid credentials
  3. Test token refresh flow
  4. Test session expiry handling
  5. Open a PR with the test file
```

### With explicit source/branch

```yaml
title: "Refactor database layer"
source: "sources/github/myorg/myrepo"
branch: "develop"
prompt: |
  Refactor the database layer to use the repository pattern:
  1. Create src/repositories/ directory
  2. Extract DB queries from src/services/ into repository classes
  3. Add interfaces for each repository
  4. Update service tests to mock repositories
  5. Open a PR
```

### Plan-gated task (requires approval before execution)

```yaml
title: "Migrate auth to OAuth2"
requirePlanApproval: true
prompt: |
  Migrate the authentication system from session-based to OAuth2:
  1. Analyze current auth flow
  2. Design OAuth2 integration plan
  3. WAIT for approval before implementing
  4. After approval, implement and open a PR
```

### Multi-document batch (one file, many tasks)

```yaml
title: "Fix lint errors in src/auth"
prompt: "Fix all ESLint errors in src/auth.ts"
---
title: "Fix lint errors in src/api"
prompt: "Fix all ESLint errors in src/api.ts"
---
title: "Fix lint errors in src/utils"
prompt: "Fix all ESLint errors in src/utils.ts"
```

---

## 6. Troubleshooting

### MCP server not starting

```bash
# Check jules-dispatch is installed
jules-dispatch --version

# Test MCP server directly
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jules-dispatch mcp
```

### Authentication errors

```bash
# Validate API key
jules-dispatch doctor

# Or test directly
jules-dispatch sources
```

### Tasks not dispatching

- Check `JULES_DEFAULT_SOURCE` matches a repo connected to Jules
- Run `jules-dispatch sources` to see connected repos
- Ensure the branch exists in the target repo

### Claude Code doesn't see the MCP tools

1. Restart Claude Code after adding the MCP config
2. Check `~/.config/claude-code/mcp.json` is valid JSON
3. In Claude Code, type `/mcp` to see registered servers

### Codex doesn't see the MCP tools

1. Check `~/.codex/config.toml` syntax
2. Restart Codex CLI
3. Ensure `jules-dispatch` is in your PATH

---

## 7. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JULES_API_KEY` | Yes | Your Google Jules API key |
| `JULES_DEFAULT_SOURCE` | No | Default repo source (e.g., `sources/github/owner/repo`) |
| `JULES_DEFAULT_BRANCH` | No | Default branch (defaults to `main`) |
| `JULES_AUTO_MODE` | No | `AUTO_CREATE_PR` (default) or `NONE` |
| `LLM_API_KEY` | No | API key for optional AI task planning |
| `LLM_BASE_URL` | No | OpenAI-compatible endpoint (defaults to OpenAI) |
| `LLM_MODEL` | No | Model ID (defaults to `gpt-4o-mini`) |

---

*Built to make Google Jules actually scale.*
