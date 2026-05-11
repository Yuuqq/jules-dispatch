# Project Research Summary

**Project:** jules-dispatch v3 (Polish & DX)
**Domain:** CLI + MCP server DX polish (brownfield)
**Researched:** 2026-05-11
**Confidence:** HIGH

## Executive Summary

jules-dispatch is a mature CLI + MCP server (14 commands, 8 MCP tools, 192 tests, v1+v2 shipped) that dispatches coding tasks to Google Jules in parallel. The v3 milestone targets the highest-friction gap: a new user cannot go from `npm install` to a successful first task in under 5 minutes. The current path requires manually creating a `.env` file, discovering source paths, and reading external docs -- none of which the tool guides the user through. Research across all four dimensions converges on a clear conclusion: **every v3 change is a presentation-layer enhancement that sits on top of existing core modules.** No changes to `client.ts`, `dispatcher.ts`, `collector.ts`, or `planner.ts` are needed.

The recommended approach is a three-phase build with strict dependency ordering: error message infrastructure first (creates the vocabulary that everything else reuses), help text enhancements second (zero-dependency, zero-risk), and the init wizard third (new dependency, new module, benefits from improved error handling).

The main risks are: (1) the init wizard hanging in non-interactive environments like CI, (2) the wizard collecting too many prompts, and (3) accidental config overwrite when a user with an existing `.env` runs `init`.

## Key Findings

### Stack Additions

**What stays unchanged:** TypeScript 5.4+, Node 20+, ESM, MCP SDK v1.29.0, chalk, commander, yaml, dotenv, vitest.

**What gets added:** Prompt library for the init wizard (see Gap #1).

**What is NOT added:** Ink/blessed, plugin system, telemetry, auto-update, YAML/TOML config.

### Feature Table Stakes vs Differentiators

**Must-have (table stakes):**
- `jules-dispatch init` wizard -- interactive setup with API key prompt, source discovery, `.env` generation
- Usage examples in `--help` for all 14 commands
- Actionable error messages in Problem/Cause/Fix format
- 5-minute README quickstart

**Should-have (differentiators):**
- `doctor --fix` auto-repair
- Contextual "see also" commands after errors
- Grouped command list in top-level help
- Typo suggestions ("did you mean?")

**Defer:** Shell completions, `config show`, version-aware "what's new", task file scaffolding.

### Architecture Integration Points

All DX features integrate at the presentation layer only. Build order:
```
errors.ts (new, standalone) -> output.ts (enhanced) -> cli.ts + config.ts -> init.ts (new)
```

### Top Pitfalls

1. Init wizard hangs in non-TTY (Critical) -- check `process.stdin.isTTY`; require `--api-key` for non-interactive
2. Init wizard over-collects (Critical) -- collect only API key + default source
3. Init wizard overwrites config (Critical) -- detect existing `.env`, backup, require `--force`
4. Error messages leak internals (Critical) -- classify errors; always include hint
5. Breaking CLI contracts (Critical) -- only add, never modify or remove

## Roadmap Implications

### Phase 1: Error Message Infrastructure
Foundational. Zero new dependencies. Creates `src/errors.ts`, enhances `emitError()` with `ErrorContext`.

### Phase 2: Help Text Enhancements
Zero-risk. `addHelpText('after', ...)` per command. `NO_COLOR` support. Modifies `cli.ts` only.

### Phase 3: Init Wizard
Most complex. New dependency (prompt library), new `src/init.ts` module. Highest impact on "under 5 minutes" goal.

### Phase 4: Documentation & Polish
Last because init wizard defines the new happy path. README quickstart, MCP guide, troubleshooting.

## Gaps to Address

1. **Prompt library decision:** `@clack/prompts` vs `@inquirer/prompts` -- resolve during Phase 3 planning. Default: `@inquirer/prompts`.
2. **MCP changes:** NOT in v3 scope. CLI/DX only.
3. **Shell completions:** Deferred to future milestone.
4. **`NO_COLOR` support:** Address in Phase 2.
