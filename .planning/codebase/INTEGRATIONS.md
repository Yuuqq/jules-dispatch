---
name: Integrations
description: External API integrations, auth patterns, and data exchange formats
---

# Integrations

## Google Jules API

### Authentication
- API key passed via `X-Goog-Api-Key` header on every request (client.ts:24)
- Key sourced from: CLI `--api-key` flag → `JULES_API_KEY` env var → `.env` file
- Key validation: app exits with code 2 if missing (config.ts:34-38)

### HTTP Client Pattern
- Native `fetch()` — no HTTP library dependency
- Retry: exponential backoff + random jitter (max 4 retries) for 429 and 5xx responses (client.ts:38-49)
- Retry delay: `BASE_DELAY_MS * 2^attempt + random(0..250)` ms, or `Retry-After` header value (client.ts:42-46)
- No retry for 4xx (except 429) or network errors (fetch throws)

### Pagination
- Async generators (`iterateSources`, `iterateSessions`, `iterateActivities`) handle page tokens transparently (client.ts:72-79, 112-119, 140-147)
- Page size: 200 for sources, 50 for sessions (configurable), 30 for activities

### Key Operations
| Operation | Method | Path |
|-----------|--------|------|
| List sources | GET | `/sources` |
| Create session | POST | `/sessions` |
| List sessions | GET | `/sessions` |
| Get session | GET | `/sessions/:id` |
| Cancel session | POST | `/sessions/:id:cancel` |
| List activities | GET | `/sessions/:id/activities` |
| Send message | POST | `/sessions/:id:sendMessage` |
| Approve plan | POST | `/sessions/:id:approvePlan` |

## OpenAI-Compatible LLM API

### Authentication
- Bearer token via `Authorization` header (planner.ts:168)
- Key resolution chain: `LLM_API_KEY` → `OPENAI_API_KEY` → `OPENROUTER_API_KEY` → `AI_INTEGRATIONS_OPENROUTER_API_KEY` (planner.ts:49-55)
- Optional provider headers: `HTTP-Referer` and `X-Title` for OpenRouter (planner.ts:172-173)

### Request Pattern
- Single POST to `/chat/completions` with system + user messages (planner.ts:175-178)
- Attempts `response_format: { type: "json_object" }` first; retries without on 400 (planner.ts:182-187)
- Temperature: 0.2 for deterministic task decomposition (planner.ts:165)

### Response Parsing
- Defensive JSON extraction: strips code fences, finds outermost `{...}` block (planner.ts:246-258)
- Validates `tasks` array exists, each task has non-empty `title` and `prompt` (planner.ts:268-281)

## MCP Protocol

### Transport
- **stdio** — `StdioServerTransport` from `@modelcontextprotocol/sdk` (mcp.ts:368)
- Server runs until stdin closes

### Tool Registration
- 14+ tools registered via `server.registerTool()` (mcp.ts:58)
- Custom `tool()` helper wraps handlers in try/catch, converting thrown errors to `isError: true` responses (mcp.ts:32-59)
- Zod schemas for input validation on each tool

### Conditional Tools
- Planner tools (`jules_plan_tasks`, `jules_auto`) only registered if `isPlannerConfigured()` returns true (mcp.ts:297-299)

## Environment Variable Resolution

### Jules Config (config.ts)
| Variable | Default | Purpose |
|----------|---------|---------|
| `JULES_API_KEY` | (required) | Jules API authentication |
| `JULES_DEFAULT_SOURCE` | `''` | Default source for tasks |
| `JULES_DEFAULT_BRANCH` | `'main'` | Default git branch |
| `JULES_AUTO_MODE` | `'AUTO_CREATE_PR'` | Session automation mode |
| `JULES_DISPATCH_VERBOSE` | `'0'` | Verbose logging flag |

### Planner Config (planner.ts:48-95)
| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_API_KEY` | — | LLM API key (preferred) |
| `OPENAI_API_KEY` | — | OpenAI key (fallback) |
| `OPENROUTER_API_KEY` | — | OpenRouter key (legacy) |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | API endpoint |
| `LLM_MODEL` | `gpt-4o-mini` | Model identifier |

## File I/O

### Input Formats
- **Task files:** YAML (multi-document) or JSON, loaded from `tasks/` directory or individual files (config.ts:53-66)
- **.env files:** Manual parser supporting `export` prefix, quoted values, comments (config.ts:13-29)
- **Stdin:** Supported for `dispatch -` and `plan-tasks -` / `auto -` commands

### Output Artifacts
- **Dispatch logs:** `.dispatch-logs/dispatch-<timestamp>.json` (dispatcher.ts:133-137)
- **Status reports:** Optional JSON file via `--output` flag (collector.ts:114-119)
- **Planned tasks:** YAML multi-doc via `--output` flag on `plan-tasks` command (cli.ts:391-393)
