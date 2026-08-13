# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] - 2026-08-13

### Fixed

- Correct `mcpName` casing to `io.github.Yuuqq/jules-dispatch` (GitHub login is `Yuuqq`, not `yuuqq`); required for MCP Registry publication

## [1.3.1] - 2026-08-13

### Added

- `mcpName` field in package.json and a `server.json`, for publication to the official [MCP Registry](https://registry.modelcontextprotocol.io/) as `io.github.Yuuqq/jules-dispatch`
- CLI `--version` now reads from package.json at runtime (fixes `1.2.0` being reported by the 1.3.0 binary)

## [1.3.0] - 2026-08-13

First release published to npm, as `@yuuqq/jules-dispatch`.

### Added

- `doctor` command — validates environment, API key, connectivity, and task files
- `init` interactive wizard — first-run setup for API key, default source, and branch
- `--pace-ms` global pacing for `batch`, `auto`, and MCP `jules_dispatch` — spaces session-creation starts across the worker pool
- `--verbose` observability with HTTP request tracing
- Consolidated MCP tools: `jules_dispatch`, `jules_monitor`, `jules_interact` (previous tools kept as deprecated aliases)
- Standardized MCP responses with recovery hints
- CI matrix (Linux/Windows × Node 20/22) with typecheck, tests, build, and CLI smoke test

### Changed

- Continuously replenished worker pool for batch dispatch (replaces fixed waves)
- `status` reports lookup failures explicitly as `status: "error"` instead of trusting stale state
- Polling retries only network/rate-limit/server errors; auth and validation errors fail fast
- npm package renamed to `@yuuqq/jules-dispatch` (the unscoped name belongs to an unrelated package); the CLI binary is still `jules-dispatch`

### Fixed

- Output mode state bug in dual text/JSON emission
- Preserved Jules failure reasons in monitor summaries
- Numerous hardening fixes to paced dispatch and activity monitoring

## [1.2.0] - 2026-05-03

### Added

- Optional BYO-LLM task planning: `auto "<intent>"` (plan + dispatch with confirmation) and `plan-tasks "<intent>"` (plan only)
- Works with any OpenAI-compatible `/chat/completions` endpoint: OpenAI, OpenRouter, Ollama, Groq, Azure OpenAI, vLLM, and more
- MCP planning tools `jules_plan_tasks` and `jules_auto` (registered only when an LLM key is configured)
- Configuration via `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` env vars or `--llm-key` / `--llm-base-url` / `--llm-model` flags

## [1.1.0] - 2026-05-03

### Added

- MCP server (`jules-dispatch mcp`) over stdio for Claude Code and Codex
- `--json` machine-readable output on every command (NDJSON for streaming commands)
- Plan approval workflow: `plan`, `approve` commands and `requirePlanApproval` task option
- `tail <id>` live activity streaming
- `cancel <id>` session cancellation
- `get <id>` and `status --ids` direct lookup
- Real failure detection from `session.state` with distinct exit codes
- Retries with exponential backoff and jitter, honoring `Retry-After`
- `dispatch -` stdin input (YAML/JSON)
- `--api-key` per-invocation flag

## [1.0.0] - 2026-05-02

### Added

- Initial release: `dispatch`, `batch`, `status`, `wait`, `sources`
- YAML/JSON task files with multi-document support
- Parallel batch dispatch (up to 50 concurrent session creations)
- `.env` configuration and JSON dispatch logs

[1.3.2]: https://github.com/Yuuqq/jules-dispatch/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/Yuuqq/jules-dispatch/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Yuuqq/jules-dispatch/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Yuuqq/jules-dispatch/releases/tag/v1.2.0
[1.1.0]: https://github.com/Yuuqq/jules-dispatch/compare/v1.0.0...v1.2.0
[1.0.0]: https://github.com/Yuuqq/jules-dispatch/commits/main
