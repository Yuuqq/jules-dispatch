# Feature Landscape

**Domain:** CLI + MCP server DX polish (jules-dispatch v3)
**Researched:** 2026-05-11
**Context:** Brownfield — 14 CLI commands, 8 consolidated MCP tools, 192 tests, v1+v2 shipped. Focus is on new-user onboarding, CLI ergonomics, actionable errors, and documentation.

## Table Stakes

Features users expect from a modern CLI tool. Missing = users bounce before first success.

### 1. Init / First-Run Wizard (`jules-dispatch init`)

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Interactive `init` command** | Every major CLI (gh, firebase, vercel, supabase, docker) offers interactive setup. Users expect `npm install -g jules-dispatch && jules-dispatch init` to work. | Medium | New module: `src/init.ts`. Uses `@clack/prompts` (see below). No conflict with existing `config.ts` — init writes the file, config reads it. |
| **API key prompt with validation** | `gh auth login` tests the token during the flow. Users must not reach a "command failed" screen because they pasted a bad key. | Low | Reuse `JulesClient.listSources()` as connectivity check (already in `doctor.ts`). |
| **Source discovery after auth** | After API key validates, call `listSources` and offer a picker. Removes the need to manually format `sources/github/owner/repo`. | Low | Already have `client.iterateSources()` — just wrap in a select prompt. |
| **`.env` file generation** | Write validated config to `.env` in project dir. Matches `.env.example` format already in repo. | Low | Pure file write. Reuse the existing `.env.example` template structure. |
| **Sensible defaults** | Default branch = `main`, auto mode = `AUTO_CREATE_PR`. Most users press Enter through. | Trivial | Already the defaults in `config.ts`. |

**Library choice: `@clack/prompts`** (HIGH confidence, Context7-verified)

- Used by `create-svelte`, `create-astro`, and other first-party Svelte/astro CLIs.
- ESM-first, TypeScript-native, ~15KB.
- Provides `intro`, `outro`, `text`, `select`, `confirm`, `spinner`, `group`, `note` — everything a wizard needs.
- `p.group()` handles wizard step sequencing with built-in cancellation (`onCancel`).
- `p.spinner()` for the connectivity check phase.
- `p.note(nextSteps, 'Next steps')` for post-setup guidance.
- Alternatives considered: `inquirer` (too heavy, CJS-era), `prompts` by terkelg (lighter but less polished), hand-rolled readline (too much work for no gain).

### 2. CLI Help with Examples and Discovery

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Usage examples in `--help`** | `gh`, `cargo`, `firebase` all show example invocations in help output. Users copy-paste from help — if there are no examples, they go to the docs and may never come back. Commander.js supports this natively via `.addHelpText('after', ...)`. | Low | Add to each of 14 commands in `cli.ts`. No new dependencies. |
| **Grouped command list** | When a tool has 14 commands, a flat list is overwhelming. Group into "Core", "Session management", "Planning (optional)", "Utility". Commander.js `addHelpText('before', ...)` on the program level. | Low | Cosmetic change to `cli.ts` program definition. |
| **Typo suggestions ("did you mean?")** | `cargo` and `npm` suggest closest command on typo. Prevents the "unknown command" dead end. | Low | Levenshtein distance on command names. ~20 lines of code. No dependency needed. |
| **Default command behavior** | Running `jules-dispatch` with no args should show help (already does via commander). But also suggest `jules-dispatch init` for first-time users if no `.env` exists. | Low | Check `existsSync('.env')` in the no-command handler. |

### 3. Actionable Error Messages

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Structured error format: Problem / Cause / Fix** | `firebase` and `cargo` follow this pattern. Current errors are one-liners: `"JULES_API_KEY is required"`. Better: show what went wrong, why, and what to do. | Medium | Refactor `emitError()` in `output.ts` and error sites in `config.ts`, `client.ts`, `dispatcher.ts`. |
| **Auth error with setup link** | When API key is missing or invalid, point to `jules-dispatch init` or `jules-dispatch doctor`. Current: `"JULES_API_KEY is required. Set it in .env..."` — already decent but lacks a "just run this" command. | Low | Update error messages in `config.ts` line 34 and `doctor.ts`. |
| **Task file validation errors with line context** | When a YAML task file is malformed, show the field that's missing and which file. Current: `"Missing \"title\" in ${filePath}"` — good but could show the raw YAML snippet. | Medium | Enhance `validateTask()` in `config.ts`. Requires parsing context from YAML parser. |
| **API error translation** | Raw API errors like `"Jules API 403 at /sessions: {\"error\":...}"` are cryptic. Translate 401 -> "API key expired", 403 -> "No access to this source", 429 -> "Rate limited, retry in N seconds". | Medium | Enhance error handling in `client.ts` `request()` method (lines 63-69). |
| **Network error with retry hint** | When fetch fails (network down), show "Check your internet connection. Retried 4 times." Current: raw TypeError is thrown. | Low | Already retries internally — just improve the final error message when retries exhaust. |
| **Exit code documentation in errors** | When a command exits with code 2/3/4/5, print what that code means. `"Exit code 2: authentication error. Run 'jules-dispatch doctor' to diagnose."` | Low | Add to `process.on('exit')` handler or to the `fail()` function. |

### 4. Documentation (README Quickstart)

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **5-minute quickstart** | Install -> init -> first dispatch -> see PR. The existing README has a good "What Is This?" section but the quickstart jumps straight to manual `.env` setup. With `init` wizard, the flow simplifies dramatically. | Low | Rewrite README top section. |
| **Per-command examples** | Each command's `--help` shows one example. README shows 5-10 common workflows: single dispatch, batch, watch, plan+approve, MCP setup. | Low | Documentation only. |
| **MCP setup guide** | Claude Code and Codex users need a separate section: how to configure `mcp.json`, what tools are available, example agent prompts. | Low | Documentation only. |
| **Task file format reference** | Current README mentions YAML tasks but doesn't show all fields. Need a complete field reference with examples for `title`, `prompt`, `source`, `branch`, `autoMode`, `requirePlanApproval`. | Low | Documentation only. Reuse types from `types.ts`. |
| **Troubleshooting section** | Common issues: API key not working, source not found, plan approval flow. Link to `doctor` command. | Low | Documentation only. |

## Differentiators

Features that set jules-dispatch apart from "just another CLI." Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **`doctor --fix` auto-repair** | Not just diagnose — fix. If `.env` is missing, offer to create it. If API key is invalid, offer to re-enter. `supabase` and `firebase` CLIs do this. | Medium | Extends existing `doctor.ts`. Needs `@clack/prompts` for interactive fix prompts. |
| **Contextual help after errors** | After any error, print a relevant "see also" command. Auth error -> `doctor`. Task error -> `dispatch --help`. Timeout -> `wait --timeout`. Like `cargo`'s contextual suggestions. | Low | Map error codes to suggested commands. New small module or enhancement to `output.ts`. |
| **Shell completion generation** | `jules-dispatch completion bash/zsh/fish` generates tab-completion scripts. Commander.js doesn't support this natively, but it's ~50 lines per shell. | Low-Medium | New `completion` command. No dependencies. |
| **`jules-dispatch config show`** | Show effective config (redacted API key) — what `.env` values are being used, where they came from (env var vs .env file vs --api-key flag). Helps debugging "why is it using the wrong source?" | Low | New command. Reads from existing `config.ts` logic. |
| **Task file scaffolding** | `jules-dispatch init --task` creates a sample task YAML with all fields documented via comments. Reduces "what fields do I need?" friction. | Low | Template generation. |
| **Version-aware "what's new"** | After `npm update`, show "New in v1.3: ..." on first run. `gh` does this. Low effort, high awareness. | Low | Write version to a state file, compare on startup. |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full TUI framework (Ink/blessed)** | The existing `cli-table3` + ANSI watch mode covers all display needs. Ink adds React as a dependency for marginal visual improvement. Full TUI is scope creep for a dispatch tool. | Keep using chalk + cli-table3. Enhance with `@clack/prompts` only for the init wizard (interactive prompts, not a full TUI). |
| **Plugin/extension system** | No user demand. Adds API surface stability burden. | Accept feature requests via GitHub issues. |
| **Web-based setup wizard** | Adds server dependency, browser detection, OAuth redirect complexity. CLI users expect terminal-native setup. | `@clack/prompts` for interactive terminal wizard. |
| **Config file format migration** | Don't add YAML/TOML config files. The `.env` format is universal, understood by all CI systems, and already used. | Keep `.env` as the single config mechanism. |
| **Telemetry / analytics** | Controversial in open source. No opt-in mechanism exists. | Skip entirely. Use GitHub stars/issues as signal. |
| **Auto-update mechanism** | `npm update -g jules-dispatch` is the standard. Adding a self-updater creates version divergence confusion. | Print "update available" hint if npm shows newer version (optional, low priority). |
| **Interactive prompts in non-TTY** | CI/piped contexts must never hang on prompts. `@clack/prompts` already throws on non-TTY — guard all interactive paths with `process.stdin.isTTY` checks. | Already handled for `auto --yes` (line 547 of cli.ts). Apply same pattern to `init`. |

## Feature Dependencies

```
init wizard
  -> Requires: @clack/prompts (new dependency)
  -> Requires: API key validation (reuse JulesClient.listSources)
  -> Requires: Source discovery (reuse client.iterateSources)
  -> Enables: Simplified README quickstart
  -> Enables: "No .env? Run init first" suggestion on bare command

--help examples
  -> Independent: pure CLI enhancement
  -> Requires: Commander.js addHelpText (already available)

Actionable errors
  -> Independent: refactors existing error paths
  -> Enables: Contextual help after errors (depends on error taxonomy)

doctor --fix
  -> Requires: @clack/prompts (same as init wizard)
  -> Requires: Existing doctor.ts checks
  -> Enables: Self-service troubleshooting

README quickstart
  -> Requires: init wizard to be designed first (defines the happy path)
  -> Independent of: error messages, help examples

Shell completion
  -> Independent: pure CLI enhancement
  -> No dependencies on other features

config show
  -> Independent: reads existing config logic
  -> No dependencies on other features
```

## MVP Recommendation

### Phase 1: Init Wizard + Onboarding (highest user impact)

1. Add `@clack/prompts` dependency
2. Build `jules-dispatch init` with API key prompt, source picker, .env generation
3. Add "no .env detected" hint when running any command without config
4. Rewrite README quickstart around the init flow
5. Add task file format reference to README

**Rationale:** The gap between `npm install` and first successful dispatch is the highest-friction moment. Everything else is polish on top of an experience that already works.

### Phase 2: Error Messages + Doctor Enhancement

1. Refactor error messages to Problem/Cause/Fix format
2. Translate API status codes to human-readable messages
3. Add contextual "see also" commands after errors
4. Add `doctor --fix` with interactive repair

**Rationale:** Users who hit errors and don't know how to fix them leave. This phase turns dead ends into guided paths.

### Phase 3: CLI Ergonomics + Documentation

1. Add `--help` examples to all 14 commands
2. Group commands in top-level help
3. Add typo suggestions
4. Add MCP setup guide and troubleshooting to README
5. Add shell completion (optional)

**Rationale:** Polish that compounds. Each small improvement reduces a specific friction point.

### Defer

- **Version-aware "what's new"**: Low impact, can add anytime.
- **`config show`**: Useful but not blocking onboarding.
- **Task file scaffolding in init**: Nice-to-have, `.env.example` already exists.
- **`doctor --fix`**: Move to Phase 2 if init wizard covers the common cases.

## Sources

- [Commander.js: addHelpText documentation](https://github.com/tj/commander.js/blob/master/Readme.md) -- Custom help text, subcommand management (HIGH confidence, Context7-verified)
- [@clack/prompts: Full CLI wizard example](https://github.com/bombshell-dev/clack) -- `intro`, `outro`, `group`, `spinner`, `note`, `text`, `select`, `confirm` (HIGH confidence, Context7-verified, benchmark score 94.94)
- [GitHub CLI: `gh auth login` flow](https://docs.github.com/en/github-cli) -- Device flow auth, interactive prompts, status checks (HIGH confidence, official docs)
- [Firebase CLI: `firebase init` flow](https://firebase.google.com/docs/cli) -- Feature selection, project linking, config generation (HIGH confidence, official docs)
- [Cargo: Error message patterns](https://doc.rust-lang.org/cargo/) -- "Did you mean?" suggestions, contextual help, Problem/Cause/Fix format (HIGH confidence, official docs)
- Existing codebase analysis: `cli.ts` (14 commands, commander.js), `config.ts` (.env loading), `doctor.ts` (5 checks), `output.ts` (emit/emitError), `client.ts` (API with retry) -- all verified by direct file read
