# jules-dispatch — Project Guide

## Project

CLI + MCP server for batch-dispatching coding tasks to Google Jules in parallel. Published on npm as `jules-dispatch` (v1.2.0). TypeScript, Node 20+, ESM.

## GSD Workflow

This project uses GSD (Get Shit Done) for structured development.

- **Planning directory:** `.planning/`
- **Project context:** `.planning/PROJECT.md`
- **Requirements:** `.planning/REQUIREMENTS.md` (18 v1 requirements)
- **Roadmap:** `.planning/ROADMAP.md` (10 phases)
- **Config:** `.planning/config.json` (YOLO, Fine, Parallel, Quality)

## Commands

```bash
npm run build      # TypeScript → dist/
npm run dev        # Run CLI with tsx
npm run test       # vitest
npm run typecheck  # tsc --noEmit
```

## Key Conventions

- **ESM only** — `"type": "module"`, `.js` extension in imports
- **Dual output** — every user-facing op calls `emit(textFn, jsonObj)` (output.ts)
- **Exit codes** — 0 OK, 1 generic, 2 auth, 3 validation, 4 partial, 5 timeout
- **Thin client** — JulesClient is pure HTTP; orchestration in dispatcher/collector
- **Immutability** — create new objects, never mutate

## Current Milestone

Incremental optimization: MCP tool consolidation (12→8), CLI progress visibility, data foundation hardening.

Phase 1 is next: `/gsd-plan-phase 1` to start.
