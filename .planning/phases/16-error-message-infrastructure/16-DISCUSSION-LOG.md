# Phase 16: Error Message Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 16-Error Message Infrastructure
**Areas discussed:** Text-mode formatting, Color treatment, JSON output structure, Error catalog scope, docsUrl target, Dispatcher integration

---

## Text-Mode Formatting

| Option | Description | Selected |
|--------|-------------|----------|
| A) Multi-line labeled | Problem/Cause/Fix each on own line with labels | ✓ |
| B) Compact two-line | Problem merged into title, Fix on second line, Cause only when non-obvious | |
| C) Separator block | Visual horizontal rules delimiting error block | |

**User's choice:** A — multi-line labeled format
**Notes:** User preferred explicit structure with clear labels for each section.

---

## Color Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| A) Differentiated colors | Red Problem + dim gray Cause + green Fix | ✓ |
| B) Unified red | All red tones, Fix distinguished by bold only | |
| C) No color differentiation | Same color for all, labels only (colorblind-friendly, natural NO_COLOR fallback) | |

**User's choice:** A — differentiated colors
**Notes:** Visual hierarchy through color for quick scanning.

---

## JSON Output Structure

| Option | Description | Selected |
|--------|-------------|----------|
| A) Flat in error object | hint/docsUrl as siblings to code/message/details | ✓ |
| B) Nested context sub-object | Separate context object for new fields | |
| C) Top-level expansion | hint/docsUrl at top level alongside error | |

**User's choice:** A — flat in error object
**Notes:** Simplest approach, backward-compatible since new fields are additive.

---

## Error Catalog Scope

| Option | Description | Selected |
|--------|-------------|----------|
| A) Minimal | Network + 401 only (success criteria minimum) | |
| B) Core scenarios | Network + all HTTP status codes + config errors | ✓ |
| C) Full coverage | Everything including task validation, file I/O, planner errors | |

**User's choice:** B — core scenario coverage (~80% of common user errors)

---

## docsUrl Target

| Option | Description | Selected |
|--------|-------------|----------|
| A) GitHub README anchors | Point to README section anchors, 404 until Phase 19 | ✓ |
| B) Placeholder constants | Internal identifiers like `#ERR_AUTH`, replaced later | |
| C) Omit docsUrl | Only fill hint now, defer docsUrl to Phase 19 | |

**User's choice:** A — GitHub README anchors
**Notes:** Acceptable that links 404 until Phase 19 writes the documentation.

---

## Dispatcher Integration

| Option | Description | Selected |
|--------|-------------|----------|
| A) Translate at cli.ts only | Dispatcher returns raw messages, translation only at CLI layer | |
| B) Dispatcher also translates | DispatchResult.error contains translated messages, CLI and MCP both consume | ✓ |

**User's choice:** B — dispatcher translates
**Notes:** MCP layer already has `computeRecoveryHint()` — planner must handle avoiding double-translation.

---

## Claude's Discretion

- Exact error message text for each status code / error category
- Error code string naming convention
- How to migrate `tail` command's inline error handling

## Deferred Ideas

None — discussion stayed within phase scope.
