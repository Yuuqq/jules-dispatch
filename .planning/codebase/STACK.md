---
name: Stack
description: Technology stack, toolchain, and external services for jules-dispatch
---

# Stack

## Language & Runtime

- **TypeScript 5.4+** — strict mode, ES2022 target, Node16 module resolution (`tsconfig.json`)
- **Node.js 20+** (CI tests 20 and 22)
- **ESM** — `"type": "module"` in package.json, `.js` extension imports

## Build Toolchain

| Tool | Purpose | Command |
|------|---------|---------|
| `tsc` | Compile TS → JS | `npm run build` |
| `tsx` | Dev-time TS execution | `npm run dev` |
| `vitest 1.6` | Test runner | `npm test` |
| `tsc --noEmit` | Type checking | `npm run typecheck` |

## Package Manager

- **npm** (package-lock.json present)

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@modelcontextprotocol/sdk` | ^1.29.0 | MCP server protocol (stdio transport, tool registration) |
| `chalk` | ^5.3.0 | Terminal colors (text output mode only) |
| `commander` | ^12.0.0 | CLI argument parsing and command routing |
| `dotenv` | ^16.4.0 | .env file loading (unused — manual .env parser in config.ts) |
| `yaml` | ^2.4.0 | YAML parsing for task files and multi-document support |
| `zod` | ^4.4.2 | Schema validation for MCP tool inputs |

## Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@replit/connectors-sdk` | ^0.4.0 | Replit integration support |
| `@types/node` | ^20.0.0 | Node.js type definitions |
| `tsx` | ^4.7.0 | TypeScript execution without compilation |
| `typescript` | ^5.4.0 | Type checker and compiler |
| `vitest` | ^1.6.0 | Test framework |

## External Services

### Google Jules API
- **Base URL:** `https://jules.googleapis.com/v1alpha` (client.ts:4)
- **Auth:** `X-Goog-Api-Key` header
- **Endpoints:** `/sources`, `/sessions`, `/sessions/:id`, `/sessions/:id/activities`, `/sessions/:id:cancel`, `/sessions/:id:sendMessage`, `/sessions/:id:approvePlan`
- **Note:** v1alpha — subject to breaking changes

### OpenAI-Compatible LLM API
- **Default:** `https://api.openai.com/v1` (planner.ts:77)
- **Endpoint:** `/chat/completions`
- **Auth:** `Bearer` token
- **Providers:** OpenAI, OpenRouter, Ollama, vLLM, LiteLLM, Together, DeepInfra, Groq, Fireworks, Azure OpenAI

## CI

- **GitHub Actions** (`.github/workflows/ci.yml`)
- **Matrix:** Node 20, Node 22
- **Steps:** typecheck → test → build → smoke test

## Entry Point

- **Source:** `src/cli.ts`
- **Compiled:** `dist/cli.js`
- **Bin:** `jules-dispatch` (package.json bin field)
