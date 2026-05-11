# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11)

**Core value:** Turn Jules from a one-at-a-time tool into a massively parallel coding workforce, controlled seamlessly by either humans on the CLI or AI agents over MCP.
**Current focus:** v2 Reliability & Onboarding — MCP tests, doctor, polling dedup

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-11 — Milestone v2 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

- Network-level TypeError now retried with exponential backoff
- MCP responses use { success, data?, error?, meta? } shape
- 14 MCP tools: 3 consolidated + 11 legacy (7 deprecated)
- cli-table3 for status table rendering
- Watch mode with SIGINT handler and auto-exit on terminal states

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-05-11
Stopped at: v2 requirements definition
Resume file: None
