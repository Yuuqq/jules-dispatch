# Architecture: DX Polish & Integration

**Project:** jules-dispatch (v3 Polish & DX milestone)
**Researched:** 2026-05-11
**Mode:** Ecosystem (Architecture dimension, DX-specific)
**Overall confidence:** HIGH

## Executive Summary

The v3 DX features integrate cleanly with the existing architecture because they are all **presentation-layer changes** that sit on top of existing core modules. None require changes to `client.ts`, `dispatcher.ts`, `collector.ts`, or `planner.ts`. The init wizard is a new CLI command that writes to the filesystem and validates against the existing `loadConfig()` path. Error message improvements enhance `emitError()` and the `fail()` wrapper in `cli.ts` without changing exit codes or the JSON error shape. Help enhancements use Commander's built-in `addHelpText()` and `configureHelp()` APIs, requiring no structural changes to the command registration pattern.

The critical ordering constraint is: error messages first, then help text, then init wizard. Error message improvements create the vocabulary (actionable messages with recovery hints) that both help text and init wizard error paths reuse. The init wizard is last because it is the only feature that adds a new external dependency (`@inquirer/prompts`) and a new command, so it benefits from the improved error handling being already in place.

## Question 1: Where Does the Init Wizard Fit in the CLI Command Structure?

### Current Command Tree

```
jules-dispatch [global options]
  dispatch <taskFile>       # send one task
  batch [taskDir]           # send all tasks in dir
  status                    # check session status
  get <sessionId>           # session details
  wait [ids...]             # poll until done
  sources                   # list repos
  message <sessionId> <text># follow-up message
  plan <sessionId>          # show plan
  approve <sessionId>       # approve plan
  cancel <sessionId>        # cancel session
  doctor                    # validate environment
  tail <sessionId>          # real-time activity
  plan-tasks <description>  # LLM plan generation
  auto <description>        # plan + dispatch
  mcp                       # run MCP server
```

### Recommended Placement: New `init` Command

The `init` command is a **setup/onboarding command** that runs once, not a workflow command. It belongs at the same level as `doctor` -- both are environment management commands.

```
jules-dispatch init [options]
  --api-key <key>    # skip interactive prompt, write key directly
  --defaults         # accept all defaults, no prompts (CI/automation)
  --force            # overwrite existing .env
```

**Why `init` and not `doctor --fix`:** The `doctor` command is read-only validation. `init` is a write operation that creates/modifies `.env`. Separating read from write follows the existing pattern where every command has a single, clear responsibility.

### Integration Points

| Existing Module | Integration | Change Required |
|-----------------|-------------|-----------------|
| `config.ts:loadConfig()` | `init` calls it after writing `.env` to validate the result | **None** -- use as-is with `noExit: true` |
| `config.ts:LoadConfigOptions` | `init` needs to write `.env`, not just read it | **New function** in `config.ts`: `writeEnvFile(projectDir, values)` |
| `cli.ts:getConfig()` | `init` should NOT call this (key may not exist yet) | **None** -- `init` has its own setup path |
| `output.ts:emit()` | `init` uses `emit()` for its summary output | **None** -- use as-is |
| `output.ts:emitError()` | `init` uses `emitError()` if validation fails | **None** -- use as-is |
| `doctor.ts:runDoctor()` | `init` optionally runs doctor at the end | **None** -- import and call |

### New Module: `src/init.ts`

This is the only new source module for the init wizard. It follows the existing optional-module pattern (like `doctor.ts` is lazy-imported in `cli.ts:333`).

```
src/init.ts
  runInit(projectDir, options) -> Promise<InitResult>

  1. Check TTY (process.stdin.isTTY)
     - TTY: interactive prompts via @inquirer/prompts
     - Non-TTY: require --api-key or fail with actionable message

  2. Detect existing .env
     - Exists + no --force: show current values, offer to update
     - Not exists: create new

  3. Collect values (interactive or flags)
     - JULES_API_KEY (required) -- password prompt
     - JULES_DEFAULT_SOURCE (optional) -- input prompt with detection from git remote
     - JULES_DEFAULT_BRANCH (optional) -- input prompt, default 'main'
     - JULES_AUTO_MODE (optional) -- select prompt, default 'AUTO_CREATE_PR'

  4. Write .env via writeEnvFile()

  5. Validate by calling loadConfig() with noExit: true

  6. Optionally run doctor checks (api connectivity)

  7. Emit summary via emit()
```

### New Dependency: `@inquirer/prompts`

| Property | Value |
|----------|-------|
| Package | `@inquirer/prompts` |
| Purpose | Interactive CLI prompts (input, confirm, select, password) |
| Why modular | Individual imports (`import { input, confirm } from '@inquirer/prompts'`) keep bundle small |
| TypeScript | Native types, `ExitPromptError` on Ctrl+C |
| Cancellation | AbortSignal support for timeouts; Ctrl+C rejects with `ExitPromptError` |
| Size | ~50KB per prompt type, tree-shakeable |

**Why not readline directly:** readline requires manual completion, history, validation, and color support. `@inquirer/prompts` handles all of this and is the standard choice for Node.js CLIs (used by create-t3-app, create-vite, Hygen, yeoman).

**Why not prompts (terkelg):** `@inquirer/prompts` is actively maintained (Inquirer.js v12+), has better TypeScript support, and AbortSignal-based cancellation. `prompts` by terkelg has not been updated recently.

### TTY Detection Pattern

Following clig.dev guidance:

```typescript
// In init.ts
export async function runInit(projectDir: string, options: InitOptions): Promise<InitResult> {
  if (!process.stdin.isTTY && !options.apiKey) {
    // Non-interactive: cannot prompt
    emitError(
      'Non-interactive environment detected. Pass --api-key to set up without prompts.\n' +
      '  Example: jules-dispatch init --api-key YOUR_KEY\n' +
      '  Full setup: jules-dispatch init --api-key KEY --source owner/repo --branch main',
      'NON_INTERACTIVE'
    );
    process.exit(ExitCode.VALIDATION);
  }
  // ... interactive path
}
```

This preserves the existing pattern where `emitError()` handles both text and JSON output modes.

---

## Question 2: How Should Error Message Improvements Layer on Existing Error Handling?

### Current Error Architecture

```
Error sources:
  1. loadConfig() throws on missing API key -> cli.ts:35-36 (console.error + exit 2)
  2. Command try/catch -> fail() -> emitError() + exit (cli.ts:39-42)
  3. Unhandled rejection -> emitError() + exit 1 (cli.ts:604-607)
  4. program.parseAsync catch -> emitError() + exit 1 (cli.ts:609-612)

Error output (output.ts:26-35):
  Text mode: "X {message}" to stderr, optional dim details
  JSON mode: { error: { code, message, details } }

Exit codes (output.ts:49-57):
  0 OK, 1 GENERIC, 2 AUTH, 3 VALIDATION, 4 PARTIAL, 5 TIMEOUT
```

### The Problem

Current errors are technically correct but not actionable. Examples:

| Current Error | What User Sees | What User Needs |
|---------------|---------------|-----------------|
| `JULES_API_KEY is required` | Cryptic: where do I get one? | `Set JULES_API_KEY in .env or pass --api-key. Get your key at https://jules.google.com/settings` |
| `No tasks found in stdin` | Confusing: what format? | `No tasks found in stdin. Expected YAML with title+prompt fields. Example: echo 'title: Fix bug\\nprompt: Fix the login bug' | jules-dispatch dispatch -` |
| `(err as Error).message` (raw API errors) | Stack trace or opaque HTTP error | `Jules API returned 403: Your API key may be expired. Run jules-dispatch doctor to verify.` |

### Integration Strategy: Enhance, Don't Replace

The error architecture stays the same. The changes are to the **messages**, not the **mechanism**.

**Layer 1: Structured error context in `emitError()`** (output.ts change)

```typescript
// Current signature
export function emitError(message: string, code?: string, details?: unknown): void;

// Enhanced signature (backward-compatible)
export interface ErrorContext {
  code?: string;
  details?: unknown;
  hint?: string;        // NEW: recovery guidance
  docsUrl?: string;     // NEW: link to relevant docs
}

export function emitError(message: string, codeOrContext?: string | ErrorContext): void;
```

The enhanced `emitError` accepts either the existing `string` code (backward-compatible) or a new `ErrorContext` object. In text mode, the hint renders as a dim line below the error. In JSON mode, it adds `hint` and `docsUrl` to the error object.

**Text mode output:**
```
  X JULES_API_KEY is not set
    Set it in .env or pass --api-key. Get your key at https://jules.google.com/settings
```

**JSON mode output:**
```json
{"error":{"code":"AUTH","message":"JULES_API_KEY is not set","hint":"Set it in .env or pass --api-key","docsUrl":"https://github.com/whoisqcm/jules-dispatch#setup"}}
```

**Layer 2: Actionable messages in `fail()` calls** (cli.ts changes)

Each `fail()` call gets an enhanced message. This is the bulk of the work -- approximately 15 call sites in cli.ts:

```typescript
// Current
fail('JULES_API_KEY is required...', ExitCode.AUTH);

// Enhanced
fail('JULES_API_KEY is not set', {
  code: 'AUTH',
  hint: 'Set it in .env, pass --api-key, or run: jules-dispatch init',
  docsUrl: 'https://github.com/whoisqcm/jules-dispatch#setup',
}, ExitCode.AUTH);
```

**Layer 3: Raw error translation** (new module `src/errors.ts`)

Create a small error-translation module that maps known API errors to actionable messages:

```typescript
// src/errors.ts
export function translateError(err: Error & { status?: number }): { message: string; hint: string; code: string } {
  if (err.status === 401 || err.status === 403) {
    return {
      message: 'Jules API authentication failed',
      hint: 'Your API key may be expired or invalid. Run: jules-dispatch doctor',
      code: 'AUTH',
    };
  }
  if (err.status === 404) {
    return {
      message: `Resource not found: ${err.message}`,
      hint: 'Check the session ID or source. Run: jules-dispatch sources',
      code: 'VALIDATION',
    };
  }
  if (err.status === 429) {
    return {
      message: 'Jules API rate limit exceeded',
      hint: 'Wait a moment and retry. For batch operations, reduce --parallel.',
      code: 'GENERIC',
    };
  }
  if (err.message?.includes('fetch failed') || err.message?.includes('ECONNREFUSED')) {
    return {
      message: 'Cannot reach Jules API',
      hint: 'Check your network connection. If behind a proxy, set HTTPS_PROXY.',
      code: 'GENERIC',
    };
  }
  // Fallback: return original message
  return { message: err.message, hint: 'Run jules-dispatch doctor to diagnose.', code: 'GENERIC' };
}
```

This module has **zero dependencies** and is trivially testable.

### Backward Compatibility

| Aspect | Status |
|--------|--------|
| Exit codes (0-5) | **Unchanged** |
| JSON error shape `{ error: { code, message, details } }` | **Extended** (adds optional `hint`, `docsUrl`) -- backward-compatible additive change |
| Text error format `X {message}` | **Extended** (adds optional dim hint line below) -- backward-compatible |
| `fail()` function signature | **Overloaded** (accepts old `(msg, code, errCode?)` or new `(msg, context, code?)`) |
| `emitError()` function signature | **Overloaded** (accepts old `(msg, code?, details?)` or new `(msg, context?)`) |

No existing caller breaks. The JSON consumers that parse error output will see additional optional fields they can ignore.

### Module Dependency Changes

```
NEW:  src/errors.ts -> (standalone, no imports)
MOD:  src/output.ts -> (standalone, enhanced emitError signature)
MOD:  src/cli.ts -> errors.ts (new), output.ts (enhanced)
MOD:  src/config.ts -> (enhanced error messages in loadConfig)
```

---

## Question 3: How Should --help Enhancements Work with Existing Commander Setup?

### Current Help State

Commander auto-generates help from command names, descriptions, and options. The current help output shows:

```
Usage: jules-dispatch [options] [command]

Batch-dispatch tasks to Google Jules + MCP server for Claude Code / Codex

Options:
  -p, --project <dir>  project directory with .env
  --api-key <key>      Jules API key
  ...
  -h, --help           display help for command

Commands:
  dispatch <taskFile>   Dispatch a single task
  batch [taskDir]       Dispatch all tasks in a directory
  ...
```

### Enhancement Strategy: Commander Built-in APIs

Commander provides three APIs that cover all DX help needs without custom rendering:

**1. `addHelpText('after', ...)` for per-command examples**

```typescript
program
  .command('dispatch <taskFile>')
  .description('Dispatch a single task file to Jules. Use "-" to read from stdin.')
  .addHelpText('after', `
Examples:
  $ jules-dispatch dispatch tasks/fix-login.yaml
  $ jules-dispatch dispatch - --format yaml < task.yaml
  $ jules-dispatch dispatch tasks/fix.yaml --source owner/repo --branch main`)
  .action(async (taskFile, opts) => { ... });
```

This is the single highest-impact DX improvement. clig.dev: "Users tend to use examples over other forms of documentation, so show them first."

**2. `configureHelp()` for formatting**

```typescript
program.configureHelp({
  sortSubcommands: true,           // alphabetical order
  showGlobalOptions: true,         // show global options under each subcommand
});
```

**3. `addHelpText('afterAll', ...)` for global footer**

```typescript
program.addHelpText('afterAll', `
Getting Started:
  $ jules-dispatch init             Set up API key and config
  $ jules-dispatch doctor           Validate your environment
  $ jules-dispatch dispatch task.yaml  Send your first task

Docs: https://github.com/whoisqcm/jules-dispatch`);
```

### What NOT to Do

| Approach | Why Not |
|----------|---------|
| Custom Help class subclassing | Overkill for adding examples; `addHelpText` suffices |
| External help library (oclif-help, help-me) | Unnecessary dependency; Commander's built-in APIs cover the use case |
| Long help text per command | clig.dev: "offload extensive examples elsewhere" -- keep to 2-4 examples per command |
| Examples before description | Commander positions `addHelpText('after')` after options; this is the standard position |

### Commands That Need Examples

Based on usage patterns (dispatch and batch are the entry points):

| Command | Example Count | Priority |
|---------|--------------|----------|
| `dispatch` | 3 (basic, stdin, overrides) | HIGH |
| `batch` | 2 (default dir, custom dir) | HIGH |
| `init` | 2 (interactive, non-interactive) | HIGH |
| `status` | 2 (all, specific IDs) | MEDIUM |
| `auto` | 2 (basic, with context) | MEDIUM |
| `doctor` | 1 (basic) | MEDIUM |
| `wait` | 2 (single, multiple) | LOW |
| `plan-tasks` | 2 (basic, with context) | LOW |
| Others | 1 each | LOW |

### Module Dependency Changes

```
MOD:  src/cli.ts only -- all help changes are in the command definitions
NO NEW MODULES, NO NEW DEPENDENCIES
```

---

## Question 4: Build Order Given Existing Module Dependencies

### Dependency Analysis

```
errors.ts (new)        -- standalone, no deps
  |
  v
output.ts (modified)   -- enhanced emitError(), uses ErrorContext type from errors.ts
  |
  v
cli.ts (modified)      -- uses enhanced emitError() and errors.ts for translations
  |
  v
config.ts (modified)   -- uses enhanced emitError() for loadConfig() error messages
  |
  v
init.ts (new)          -- uses config.ts (read + write), output.ts (emit), doctor.ts (optional)
  |                       NEW DEP: @inquirer/prompts
  v
cli.ts (command registration) -- addHelpText(), init command registration
```

### Recommended Phase Structure

#### Phase 1: Error Message Infrastructure

**Rationale:** Foundational. Every other DX feature benefits from better errors.

**Files created:**
- `src/errors.ts` -- Error translation module (standalone, zero deps)

**Files modified:**
- `src/output.ts` -- Enhanced `emitError()` signature with `ErrorContext`
- `src/config.ts` -- Replace `console.error(msg); process.exit(2)` with `emitError(msg, { code: 'AUTH', hint: '...' }); process.exit(2)`
- `src/cli.ts` -- Replace raw `(err as Error).message` in catch blocks with `translateError()` calls

**Tests:**
- `src/__tests__/errors.test.ts` -- Test each error translation (401, 403, 404, 429, network, fallback)
- `src/__tests__/output.test.ts` -- Test enhanced `emitError()` with `ErrorContext` (text mode, JSON mode, backward-compat with string code)

**No new dependencies. No breaking changes.**

#### Phase 2: Help Text Enhancements

**Rationale:** Zero-dependency, zero-risk change that immediately improves first-run experience.

**Files modified:**
- `src/cli.ts` -- Add `addHelpText('after', ...)` to each command with examples; add `addHelpText('afterAll', ...)` with getting-started footer; call `configureHelp({ sortSubcommands: true, showGlobalOptions: true })`

**Tests:**
- Manual verification (help output is visual); optionally snapshot tests with `program.helpInformation()`

**No new dependencies. No new modules. No breaking changes.**

#### Phase 3: Init Wizard

**Rationale:** Most complex feature (new dependency, new module, new command). Benefits from Phase 1 error messages being in place for validation feedback.

**Dependencies to install:**
```bash
npm install @inquirer/prompts
```

**Files created:**
- `src/init.ts` -- Init wizard module (runInit function)
- `src/__tests__/init.test.ts` -- Tests for non-interactive path, .env writing, validation

**Files modified:**
- `src/config.ts` -- Add `writeEnvFile(projectDir, values)` function
- `src/cli.ts` -- Register `init` command (lazy-imported like doctor), add to help footer

**Tests:**
- Non-interactive path: `--api-key` flag writes .env correctly
- TTY detection: non-TTY without `--api-key` fails with actionable message
- .env writing: values written correctly, existing values preserved unless `--force`
- Validation: `loadConfig()` called after write, error if invalid
- Edge cases: existing .env, missing directory, read-only filesystem

### Phase Dependency Graph

```
Phase 1 (Error Infrastructure)
  |
  +---> Phase 2 (Help Text)      [can run in parallel with Phase 3]
  |
  +---> Phase 3 (Init Wizard)    [depends on Phase 1 for error messages]
```

Phases 2 and 3 are independent of each other and can be planned/implemented in either order or in parallel. Phase 1 must come first because both Phase 2 (help text references error patterns) and Phase 3 (init validation uses enhanced `emitError()`) depend on it.

### What Each Phase Touches

| Phase | New Files | Modified Files | New Deps | Breaking Changes |
|-------|-----------|---------------|----------|-----------------|
| 1. Error Messages | `errors.ts` | `output.ts`, `config.ts`, `cli.ts` | None | None |
| 2. Help Text | None | `cli.ts` | None | None |
| 3. Init Wizard | `init.ts` | `config.ts`, `cli.ts` | `@inquirer/prompts` | None |

### Backward Compatibility Matrix

| Contract | Phase 1 | Phase 2 | Phase 3 |
|----------|---------|---------|---------|
| CLI commands | Preserved | Preserved | Additive (new `init` command) |
| Exit codes | Preserved | Preserved | Preserved |
| JSON output shape | Extended (additive) | N/A | N/A |
| Text output format | Extended (additive) | Extended (additive) | N/A |
| MCP server | Unchanged | Unchanged | Unchanged |
| `npm install` | Unchanged | Unchanged | New dep added |
| `.env` format | Unchanged | Unchanged | Created by `init` (same format) |

---

## Patterns to Follow

### Pattern 1: Error Translation at Catch Sites

**What:** Wrap raw API/network errors in `translateError()` before passing to `fail()`.
**When:** Every `catch` block in `cli.ts` and `init.ts`.
**Why:** Translates opaque errors into actionable guidance. The translation function is pure and testable.

```typescript
// In cli.ts command action
try {
  const session = await client.getSession(sessionId);
  // ...
} catch (err) {
  const translated = translateError(err as Error);
  fail(translated.message, {
    code: translated.code,
    hint: translated.hint,
  }, ExitCode[translated.code as keyof typeof ExitCode]);
}
```

### Pattern 2: Non-Interactive Fallback for Init

**What:** Every interactive prompt has a flag-based equivalent.
**When:** The `init` command.
**Why:** clig.dev: "Always provide a way of passing input with flags or arguments." CI/automation cannot use interactive prompts.

```typescript
// Init command structure
if (process.stdin.isTTY && !opts.apiKey) {
  // Interactive path: prompt for values
} else {
  // Non-interactive path: use flags or fail with guidance
  if (!opts.apiKey) {
    fail('API key required in non-interactive mode', {
      hint: 'Pass --api-key or run interactively: jules-dispatch init',
    }, ExitCode.VALIDATION);
  }
}
```

### Pattern 3: Lazy Import for Optional Dependencies

**What:** `@inquirer/prompts` is only imported when the `init` command runs.
**When:** The `init` command registration in `cli.ts`.
**Why:** Follows the existing pattern for `doctor.ts` (cli.ts:333) and `planner.ts` (cli.ts:420). Keeps CLI startup fast for users who never run `init`.

```typescript
program
  .command('init')
  .description('Set up jules-dispatch: API key, config, and environment validation')
  .option('--api-key <key>', 'Jules API key (skip interactive prompt)')
  .option('--defaults', 'accept all defaults, no prompts')
  .option('--force', 'overwrite existing .env')
  .action(async (opts) => {
    const { runInit } = await import('./init.js');
    // ...
  });
```

### Pattern 4: Examples as Help Text, Not Documentation

**What:** Each command gets 2-4 concrete examples via `addHelpText('after', ...)`.
**When:** Every command in `cli.ts`.
**Why:** Commander's built-in API. No custom rendering. clig.dev: "show examples first."

```typescript
program
  .command('batch [taskDir]')
  .description('Dispatch all .yaml/.yml/.json task files in a directory')
  .addHelpText('after', `
Examples:
  $ jules-dispatch batch                       Dispatch from ./tasks/
  $ jules-dispatch batch ./my-tasks             Dispatch from custom dir
  $ jules-dispatch batch --parallel 5           Limit to 5 concurrent`)
  .action(async (taskDir, opts) => { ... });
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Custom Help Rendering Engine

**What:** Building a custom help formatter instead of using Commander's `addHelpText` and `configureHelp`.
**Why bad:** Maintenance burden, potential drift from Commander's help output conventions, unnecessary complexity.
**Instead:** Use `addHelpText('after', ...)` for examples and `configureHelp()` for formatting. Commander's APIs cover the use case.

### Anti-Pattern 2: Prompts Without Non-Interactive Fallback

**What:** Making `init` require interactive stdin with no flag-based alternative.
**Why bad:** Breaks CI, scripts, and Docker. clig.dev: "Always provide a way of passing input with flags."
**Instead:** Every prompt has a corresponding `--flag`. Non-TTY without flags = actionable error with example command.

### Anti-Pattern 3: Changing Error Shape for JSON Consumers

**What:** Restructuring the JSON error object (renaming fields, changing nesting).
**Why bad:** Any scripts or tools parsing `jules-dispatch --json` output break silently.
**Instead:** Additive-only changes. New fields (`hint`, `docsUrl`) are optional. Existing fields (`code`, `message`, `details`) stay in place.

### Anti-Pattern 4: Init Wizard That Overwrites Silently

**What:** Running `init` on a project with existing `.env` without checking.
**Why bad:** Destroys user's existing configuration (API keys, custom settings).
**Instead:** Detect existing `.env`, show current values, require `--force` to overwrite. Offer to merge (update only specified values).

### Anti-Pattern 5: Error Messages That Reference Internal APIs

**What:** Error messages like "loadConfig() threw on missing env var."
**Why bad:** Users don't know what `loadConfig()` is. Exposes implementation details.
**Instead:** Translate to user-facing language: "JULES_API_KEY is not set."

---

## Scalability Considerations

| Concern | At Current Scale | After v3 |
|---------|-----------------|----------|
| CLI startup time | Fast (Commander parsing only) | Unchanged -- init is lazy-imported |
| Help text length | ~40 lines | ~80-100 lines (examples added) -- still fits one screen |
| Error message maintenance | Hardcoded in 15+ catch sites | Centralized in `errors.ts` -- single place to update |
| New command surface | 15 commands | 16 commands (+init) -- well below complexity threshold |

---

## Sources

- Commander.js README: https://github.com/tj/commander.js (HIGH confidence -- official docs, verified via WebFetch)
- Commander.js Help In-Depth: https://github.com/tj/commander.js/blob/master/docs/help-in-depth.md (HIGH confidence -- official docs, verified via WebFetch)
- CLI Guidelines (clig.dev): https://clig.dev/ (HIGH confidence -- widely cited community standard, verified via WebFetch)
- @inquirer/prompts: https://github.com/SBoudrias/Inquirer.js/tree/main/packages/prompts (HIGH confidence -- official repo, verified via WebFetch)
- jules-dispatch codebase: src/cli.ts, src/output.ts, src/config.ts, src/doctor.ts (HIGH confidence -- direct code inspection)
