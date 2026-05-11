# Domain Pitfalls: v3 Polish & DX

**Domain:** Adding DX polish to existing Node.js CLI + MCP server
**Researched:** 2026-05-11
**Project:** jules-dispatch (14 CLI commands, 14 MCP tools, TypeScript/ESM, Node 20+)
**Existing PITFALLS.md:** Covers MCP tool design (v1/v2). This file covers v3 DX milestone.

---

## Critical Pitfalls

Mistakes that cause rewrites, break existing users, or fundamentally undermine the DX effort.

### Pitfall 1: Init Wizard That Breaks Non-Interactive Usage

**What goes wrong:** The `init` wizard uses interactive prompts (e.g., `@clack/prompts`, `inquirer`) without detecting whether stdin is a TTY. When run in CI, piped from another command, or called from an agent script, the prompt hangs indefinitely waiting for input that will never arrive.

**Why it happens:** Developers build wizards in interactive terminals and forget the tool must also work in scripts. The `@clack/prompts` README contains zero guidance on non-interactive environments -- the library itself does not guard against this.

**Consequences:** CI pipelines hang. Agent workflows that call `jules-dispatch init --some-flag` freeze. Users report "tool hangs on startup" and lose trust.

**Prevention:**
1. **Always check `process.stdin.isTTY` before prompting.** The codebase already does this once (cli.ts:547 in the `auto` command) -- extend this pattern to every prompt site.
2. **Require a `--yes` or `--defaults` flag for non-interactive init.** When stdin is not a TTY and no `--yes` flag is present, fail immediately with: `"Non-interactive mode detected. Pass --yes to use defaults, or set values via flags: --api-key <key> --source <source>"`.
3. **Never require a prompt.** Every value collected by the wizard must have an equivalent CLI flag or env var. The wizard is a convenience wrapper, not the only path.
4. **Test in non-interactive mode.** Add a test: `echo "" | node dist/cli.js init` should either succeed with defaults or fail with a helpful message -- never hang.

**Detection:** Run the init wizard with stdin redirected from /dev/null. If it hangs for more than 2 seconds, the pitfall is present.

**Phase:** Must be designed into the init wizard from day one. Retrofitting is harder than building it right.

### Pitfall 2: Init Wizard Over-Collecting Information

**What goes wrong:** The wizard asks for API key, default source, default branch, auto mode, LLM key, LLM model, LLM base URL, log directory, parallel count -- 8+ sequential prompts. Users abandon before finishing. The wizard becomes slower than just editing `.env` manually.

**Why it happens:** Each config field seems important in isolation. The developer adds one prompt per field because "it would be nice to configure." The cumulative effect is a wall of questions.

**Consequences:** Time-to-first-task exceeds the 5-minute goal stated in PROJECT.md. Power users skip the wizard entirely. New users get overwhelmed and quit.

**Prevention:**
1. **Maximum 3 prompts.** Collect only what blocks first-run: API key (required), default source (required for dispatch), and nothing else. Everything else has sensible defaults already baked into `loadConfig()` (config.ts:41-50).
2. **Apply the 80/20 rule.** The `.env` fields with no current default are `JULES_API_KEY` and `JULES_DEFAULT_SOURCE`. Those are the two fields that actually block first use. `JULES_DEFAULT_BRANCH` defaults to `"main"`, `JULES_AUTO_MODE` defaults to `AUTO_CREATE_PR` -- these do not need wizard prompts.
3. **Post-wizard hint, not pre-wizard prompt.** After the 2-3 essential prompts, print: `"Configuration saved to .env. Edit it to customize: branch, auto mode, LLM planner, parallel count."`
4. **Offer a `--minimal` flag** that collects only the API key.

**Detection:** Count the prompts. If above 3, strip it down. Time a first-time user through the wizard. If above 60 seconds, it is too long.

**Phase:** Init wizard design phase. Define the prompt list before writing code.

### Pitfall 3: Init Wizard Overwriting Existing Config Without Warning

**What goes wrong:** User has a carefully configured `.env` with API key, custom source, LLM settings. They run `jules-dispatch init` (perhaps to update one setting). The wizard overwrites the entire `.env` with defaults, destroying their configuration.

**Why it happens:** Writing a file is simpler than merging. The wizard writes a fresh `.env` without reading the existing one first.

**Consequences:** Data loss. Users learn to never run `init` again. The wizard becomes a one-time-use tool instead of an idempotent config manager.

**Prevention:**
1. **Detect existing `.env` on entry.** If it exists, show current values as defaults in the prompts (pre-filled). Only overwrite changed fields.
2. **Offer merge vs. replace.** If existing config detected: `"Existing .env found. [U]pdate values, [R]eplace entirely, [C]ancel?"`
3. **Backup before write.** Write `.env.bak` before modifying. Print: `"Previous config backed up to .env.bak"`.
4. **Make init idempotent.** Running `init` twice with the same answers should produce identical output.

**Detection:** Create a `.env` with 5 fields, run `init`, verify all 5 fields survive.

**Phase:** Init wizard implementation. Write the detection/merge logic first.

### Pitfall 4: Error Messages That Leak Internals or Provide No Next Step

**What goes wrong:** Two failure modes coexist in the current codebase:

**Mode A -- Raw error passthrough:**
```typescript
catch (err) {
  fail((err as Error).message, ExitCode.GENERIC);
}
```
This pattern appears in `get`, `message`, `plan`, `approve`, `cancel` commands (cli.ts:191, 254, 287, 304, 323). When the Jules API returns a 403, the user sees something like: `"Request failed with status code 403"` -- no explanation of what to do.

**Mode B -- Generic messages:**
The `loadConfig` error (config.ts:34) says `"JULES_API_KEY is required"` but does not say where to get one, what format it should be, or link to documentation.

**Why it happens:** Error handling was built for correctness (non-zero exit, structured JSON) but not for user guidance. The `emitError` function (output.ts:26-34) formats errors but does not enrich them.

**Consequences:** Users paste raw error messages into search engines and find nothing. They cannot self-diagnose. They file issues that could have been avoided with a one-line hint.

**Prevention:**
1. **Classify errors before presenting them.** Every error falls into a category: auth (exit 2), validation (exit 3), network, API, internal. Each category has a template:
   - Auth errors: `"Authentication failed. Verify JULES_API_KEY is set correctly. Get your key at: https://jules.google.com/settings/api-keys"`
   - Network errors: `"Could not reach Jules API (ECONNREFUSED). Check your internet connection and try again."`
   - API errors: Include the HTTP status, what was attempted, and a hint: `"Session not found (404). Verify the session ID: jules-dispatch get <id>"`.
2. **Never show raw exception messages to users.** Wrap them. `"An unexpected error occurred. Run with --verbose for details."`
3. **Always include a next step.** Every error message must end with either a fix command, a documentation link, or "Run `jules-dispatch doctor` to diagnose."
4. **Extend `emitError` to accept a `hint` field** alongside `code` and `details`:
   ```typescript
   emitError('API key invalid', 'AUTH_FAILED', { hint: 'Get a key at https://...' });
   ```

**Detection:** Trigger each error path. If any error message lacks a next-step hint, it is incomplete. If any error message shows internal class names, file paths, or stack traces by default, it leaks internals.

**Phase:** Error message improvement phase. Can be done incrementally per command.

### Pitfall 5: Breaking Existing CLI Contracts While Adding DX

**What goes wrong:** Adding `init` command, changing help text, adding aliases, or modifying output format of existing commands breaks scripts, agent workflows, or muscle memory built on the current behavior.

**Why it happens:** DX work feels cosmetic and therefore "safe." But `--help` output is an interface. Exit codes are an interface. The order and format of `status` table columns is an interface. Changing any of these breaks downstream consumers.

**Consequences:** Scripts that parse `status --json` output break. Agent workflows that check specific exit codes break. Users who trained their fingers on `jules-dispatch batch tasks/` find the command renamed or its flags changed.

**Prevention:**
1. **Only add, never modify or remove.** New commands (like `init`) are safe. New flags are safe. Changing existing flag names, removing commands, or altering JSON output shape is a breaking change.
2. **Help text changes are additive.** Adding examples to `--help` is safe. Changing the command description or argument order is not.
3. **New aliases are safe; removing aliases is not.** The existing `plan-tasks` / `plan-batch` alias pattern (cli.ts:412) is good. Do not remove it.
4. **Exit codes are frozen.** The 0-5 scheme (output.ts:50-57) is a contract. Adding new codes above 5 is safe; reassigning existing codes is not.

**Detection:** Diff the CLI interface before and after each phase. Any removed flag, changed argument name, or altered JSON key is a breaking change.

**Phase:** Continuous concern. Review every CLI change against the v2 interface.

---

## Moderate Pitfalls

### Pitfall 6: Ignoring `NO_COLOR` and Piping Conventions

**What goes wrong:** The codebase uses `chalk` extensively but only disables color in JSON mode (`output.ts:10-11`). When output is piped to a file (`jules-dispatch status > report.txt`) or when `NO_COLOR=1` is set, the output contains ANSI escape codes that render as garbage text like `[32m[1m[22m`.

**Why it happens:** `chalk` respects `FORCE_COLOR` and TTY detection by default, but the codebase explicitly sets `chalk.level = 0` only in JSON mode, overriding chalk's auto-detection for text mode.

**Consequences:** Piped output is unusable. CI logs show escape sequences. Users who set `NO_COLOR` (an industry convention respected by thousands of tools) are ignored.

**Prevention:**
1. **Respect `NO_COLOR` env var.** Check `process.env.NO_COLOR` early in startup. If set, `chalk.level = 0`.
2. **Respect `--no-color` flag.** Add it as a global option alongside `--json` and `--verbose`.
3. **Respect `TERM=dumb`.** Check `process.env.TERM === 'dumb'` and disable color.
4. **Let chalk auto-detect TTY.** Do not override `chalk.level` in text mode. Only force `chalk.level = 0` for JSON mode.
5. **Detect piped stdout.** If `!process.stdout.isTTY`, disable color automatically.

**Detection:** Run `jules-dispatch status | cat -v` and check for escape sequences. Run `NO_COLOR=1 jules-dispatch status` and verify no color codes.

**Phase:** CLI ergonomics phase. Small change, high impact on scriptability.

### Pitfall 7: Help Text Wall With No Examples

**What goes wrong:** Commander.js generates help text from command descriptions and option definitions. The current descriptions are terse one-liners (`'Dispatch a single task file to Jules. Use "-" to read from stdin.'`). When users run `jules-dispatch --help`, they get a flat list of 14 commands with no indication of common workflows, typical sequences, or examples.

**Why it happens:** Commander's `.description()` accepts a single string. Developers write a brief description and move on. Adding examples requires explicit `.addHelpText()` calls that feel like polish work and get deferred.

**Consequences:** Users stare at a list of 14 commands and have no idea where to start. The 5-minute-to-first-task goal (PROJECT.md) is impossible if the user cannot figure out the workflow from `--help` alone.

**Prevention:**
1. **Add a command synopsis at the top level.** Use `program.addHelpText('before', ...)` to show:
   ```
   Quick start:
     jules-dispatch init                    Set up API key and defaults
     jules-dispatch dispatch tasks/fix.yaml Dispatch a single task
     jules-dispatch status                  Check recent sessions
   ```
2. **Add examples to each command.** Use `.addHelpText('after', ...)` on commands that have non-obvious usage:
   ```
   Examples:
     jules-dispatch dispatch tasks/fix.yaml
     jules-dispatch dispatch - -s sources/github/owner/repo < task.yaml
     jules-dispatch batch tasks/ --parallel 5
   ```
3. **Lead with the happy path.** Put `init`, `dispatch`, `batch`, `status` first in the help output. Group advanced commands (`plan-tasks`, `auto`, `mcp`) separately.
4. **Do not overload the top-level help.** Keep it to a synopsis + 4-5 most common commands. Put the full command list behind `jules-dispatch help`.

**Detection:** Show `--help` to someone who has never used the tool. If they cannot dispatch a task within 2 minutes of reading it, the help is insufficient.

**Phase:** CLI ergonomics phase.

### Pitfall 8: Adding Too Many Commands Instead of Improving Existing Ones

**What goes wrong:** The tool already has 14 commands. Adding `init`, `config`, `config-set`, `config-get`, `docs`, `examples`, `completions` would push it to 20+. Users cannot find the command they need. The `--help` output becomes a wall.

**Why it happens:** Each DX improvement feels like it needs its own command. "Config management" becomes 3 commands. "Documentation" becomes a command. The command surface grows linearly with features.

**Consequences:** Users cannot remember which command does what. `jules-dispatch config set` vs `jules-dispatch init` vs editing `.env` -- three ways to do the same thing creates confusion.

**Prevention:**
1. **Prefer flags over new commands.** `jules-dispatch init --show` to display current config is better than a separate `config show` command.
2. **Merge related operations.** `init` handles both first-time setup AND config updates (see Pitfall 3). No need for `config` + `config-set` + `config-get`.
3. **Target: maximum 2 new commands** for this milestone (`init` and possibly `completions`). Everything else should be flags or improvements to existing commands.
4. **Audit the existing 14 commands.** Are all 14 necessary? `get` duplicates what `status --ids` does. `plan` is a subset of `tail`. Consider whether consolidation serves users better than expansion.

**Detection:** Count total commands after the milestone. If above 16, reconsider. If any new command's functionality overlaps with an existing command's flags, consolidate.

**Phase:** Planning phase. Decide command surface before implementation.

### Pitfall 9: Documentation That Goes Stale Immediately

**What goes wrong:** A README quickstart, MCP guide, and per-command examples are written as part of this milestone. They reference specific flag names, output formats, and workflows. Six months later, a flag is renamed, a command's output changes, or a new step is added to the workflow. The docs are now wrong, and wrong docs are worse than no docs.

**Why it happens:** Documentation is written once and never tested. There is no mechanism to verify docs against the actual tool behavior.

**Consequences:** Users follow the quickstart, hit an error because the documented flag was changed, and lose trust in both the docs and the tool.

**Prevention:**
1. **Extract examples from tests.** If the README says `jules-dispatch dispatch tasks/fix.yaml`, have a test that actually runs this command and verifies the output. Use doc-tests or integration tests that double as documentation verification.
2. **Keep examples minimal.** The fewer moving parts in an example, the less likely it breaks. A 2-command quickstart is more durable than a 10-step tutorial.
3. **Version-stamp the docs.** Include `Tested with jules-dispatch vX.Y.Z` in the README. Make this part of the release checklist.
4. **Prefer self-documenting commands over external docs.** `jules-dispatch doctor` already validates the environment. Extend it to verify the user's setup matches the documented quickstart: "API key: set. Default source: set. Example task file: found."
5. **Automate link and command checking.** A CI step that runs each documented command in a sandbox and verifies it exits 0.

**Detection:** After 3 months, run each documented command exactly as written. Any failure indicates stale docs.

**Phase:** Documentation phase. Build verification into the documentation work, not as a separate afterthought.

### Pitfall 10: Error Messages That Are Too Verbose

**What goes wrong:** In the effort to be "helpful," error messages become paragraphs. The user sees a 5-line error with context, explanation, documentation link, alternative suggestion, and a hint about related commands. They stop reading after line 1.

**Why it happens:** Each addition to the error message seems individually useful. "Add a link" + "add a hint" + "add context" + "add the alternative" = 4 additions that each make sense alone but combine into noise.

**Consequences:** Signal-to-noise ratio drops. Users skim past the important part (what went wrong) and miss the fix. Long errors also break terminal formatting when wrapped in narrow terminals.

**Prevention:**
1. **Structure errors as 2 lines max in normal mode:**
   ```
   Error: API key invalid (AUTH_FAILED)
   Hint:  Get a key at https://jules.google.com/settings/api-keys
   ```
2. **Verbose mode gets the details.** `--verbose` shows the full error chain, request/response, stack trace.
3. **Follow the pattern:** `[severity]: [what happened] ([error code])` on line 1, `Hint: [what to do]` on line 2. Nothing else unless `--verbose`.
4. **Test error messages at 80-column width.** If an error wraps, it is too long.

**Detection:** Trigger each error. If any error message exceeds 2 lines in normal mode or 80 characters per line, shorten it.

**Phase:** Error message phase. Define the error format template before implementing individual messages.

### Pitfall 11: Spinner/Progress Without Cleanup Guarantees

**What goes wrong:** Adding spinners or progress indicators (for `init`, `dispatch`, `doctor`) without guaranteeing cleanup on error, SIGINT, or exception. The spinner's start/stop lifecycle is not exception-safe. If an error is thrown between `spinner.start()` and `spinner.stop()`, the terminal cursor remains hidden or the spinner text remains on screen.

**Why it happens:** Spinners look simple. `s.start(); await work(); s.stop('Done!')`. But the `await work()` can throw, be interrupted by SIGINT, or timeout. The cleanup path is non-obvious.

**Consequences:** Terminal is left in a corrupted state (hidden cursor, lingering spinner text). Users must run `reset` to restore their terminal. This erodes trust in the tool's quality.

**Prevention:**
1. **Use try/finally for all spinner lifecycles:**
   ```typescript
   const s = spinner();
   s.start('Connecting to Jules...');
   try {
     const result = await client.getSession(id);
     s.stop('Connected.');
   } catch (err) {
     s.stop('Connection failed.');
     throw err;
   }
   ```
2. **Register a SIGINT handler that calls `spinner.stop()` before exiting.** The codebase already has SIGINT handling for watch mode (cli.ts:137) -- extend this pattern.
3. **Consider `@clack/prompts` carefully.** Its `spinner()` does not document cleanup guarantees. Test what happens when the process exits between `start()` and `stop()`.
4. **Alternative: use chalk-based status lines** (`info(chalk.dim('Connecting...'))`) instead of animated spinners. Less flashy but zero cleanup risk. The existing codebase uses this pattern already (cli.ts:60, 370, 446, 522, 558).

**Detection:** Run the command, hit Ctrl+C during a spinner, and check terminal state. If the cursor is hidden or text lingers, cleanup is missing.

**Phase:** Applies to any phase that adds interactive feedback. Prefer the existing `info(chalk.dim(...))` pattern over spinners unless the operation consistently takes >3 seconds.

---

## Minor Pitfalls

### Pitfall 12: Wizard Library Dependency Bloat

**What goes wrong:** Adding `@clack/prompts` or `inquirer` pulls in significant dependency trees. `inquirer` is particularly heavy. For a CLI tool that values startup speed (the 12-factor CLI guideline targets <500ms startup), adding 2MB of prompt library defeats the purpose.

**Prevention:**
1. **Use `@clack/prompts` over `inquirer`** -- lighter, modern, better TypeScript support.
2. **Or use Node's built-in `readline` module** for simple prompts (API key input, yes/no confirmation). Zero dependencies.
3. **Lazy-load the prompt library.** Only `import()` it inside the `init` command action, not at module top level. The codebase already uses this pattern for the MCP SDK (cli.ts:597) and planner (cli.ts:420).
4. **Measure startup time before and after.** `time node dist/cli.js --version` should stay under 200ms.

**Detection:** `npm ls --all` before and after adding the prompt library. If the tree grows by >20 packages, reconsider.

**Phase:** Init wizard phase. Choose the library before writing code.

### Pitfall 13: Completions That Do Not Match Actual Commands

**What goes wrong:** Shell completions (bash/zsh/fish) are generated from a static list of commands. When commands are added, removed, or renamed, completions go out of sync. Users type `jules-dispatch in<TAB>` and do not get `init` because completions were not regenerated.

**Prevention:**
1. **Generate completions dynamically from Commander's command list** at generation time, not as a static file.
2. **Include a `completions` command** that writes the completion script to stdout. Users pipe it to their shell config. Document this in the quickstart.
3. **Test completions as part of CI.** Generate completions, source them in a bash subprocess, verify tab completion returns expected results.

**Phase:** CLI ergonomics phase, if completions are in scope.

### Pitfall 14: `--help` Overload When Appended to Subcommands

**What goes wrong:** Commander.js supports `command --help` by default, but if the user types `jules-dispatch dispatch --help --json`, the `--json` flag may be processed before help is shown, changing the help output format or causing confusing behavior.

**Prevention:**
1. **Test `--help` with other flags.** Commander handles this correctly by default, but custom preAction hooks (cli.ts:27-31) that set output mode could interfere. Verify that `--help` short-circuits before the preAction hook runs.
2. **Always let `-h`/`--help` take precedence.** Per clig.dev: "you should be able to append -h to anything and get help."

**Phase:** Quick verification during CLI ergonomics phase.

### Pitfall 15: Quickstart That Assumes Too Much Prior Knowledge

**What goes wrong:** The README quickstart says: "1. Set JULES_API_KEY in .env. 2. Run `jules-dispatch dispatch task.yaml`." It does not explain where to get the API key, what a task YAML looks like, or what "source" means in the Jules context. The quickstart is technically correct but practically useless for a first-time user.

**Why it happens:** The author knows the domain so well that they skip the "obvious" steps. But to a new user, nothing is obvious.

**Consequences:** The 5-minute goal is not met. Users Google for examples or read the source code. The quickstart exists but does not serve its purpose.

**Prevention:**
1. **Include a complete copy-paste example.** A working `.env` and a working `task.yaml` in the quickstart. Not just field names -- actual values.
2. **Include the "where to get the API key" step.** Link to the Jules dashboard or settings page.
3. **Include expected output.** Show what the user should see after running the command. This confirms success and calibrates expectations.
4. **Test the quickstart on a clean machine.** Clone the repo, follow the quickstart exactly. If any step requires knowledge not in the quickstart, fix it.

**Phase:** Documentation phase. Write the quickstart first, then test it.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Init wizard | Hangs in non-interactive mode (Pitfall 1) | Check `process.stdin.isTTY`; require `--yes` for scripts |
| Init wizard | Over-collects info (Pitfall 2) | Maximum 3 prompts; everything else has defaults |
| Init wizard | Overwrites existing config (Pitfall 3) | Detect + merge; backup before write |
| Init wizard | Dependency bloat (Pitfall 12) | Use `@clack/prompts` or built-in `readline`; lazy-load |
| Error messages | Raw internals leak to users (Pitfall 4) | Classify errors; wrap with hints; never show raw exceptions |
| Error messages | Too verbose (Pitfall 10) | 2-line max in normal mode; details in `--verbose` |
| CLI ergonomics | Breaking existing contracts (Pitfall 5) | Only add; never remove or rename |
| CLI ergonomics | Help text wall (Pitfall 7) | Synopsis + examples at top; group commands |
| CLI ergonomics | Too many new commands (Pitfall 8) | Max 2 new commands; prefer flags |
| CLI ergonomics | Missing NO_COLOR support (Pitfall 6) | Respect NO_COLOR, TERM=dumb, --no-color, piped stdout |
| Documentation | Stale docs (Pitfall 9) | Extract examples from tests; version-stamp; CI verification |
| Documentation | Assumes too much (Pitfall 15) | Complete copy-paste quickstart with expected output |
| Completions | Out of sync (Pitfall 13) | Generate dynamically from Commander's command list |
| Spinners | Terminal corruption on error (Pitfall 11) | try/finally for spinner lifecycle; SIGINT cleanup |
| Interactive prompts | `@clack/prompts` cancel sentinel leaks (P1 in clack research) | Check `isCancel()` after every prompt; use `group()` with `onCancel` |

---

## Existing Codebase Strengths to Preserve

These patterns are already correct and should not be broken during DX work:

1. **Dual output mode** (output.ts) -- every user-facing op emits text and JSON. Extend to new commands, do not replace.
2. **Structured exit codes** (output.ts:50-57) -- 0-5 scheme is well-defined. New commands should use these, not invent new codes.
3. **`emitError` function** (output.ts:26-34) -- centralized error output. Extend with `hint` field, do not bypass it.
4. **TTY detection in `auto` command** (cli.ts:547) -- `process.stdin.isTTY` check before confirmation prompt. Extend to all prompts.
5. **Lazy imports for heavy modules** (cli.ts:420, 597) -- MCP SDK and planner are imported only when needed. Apply same pattern to prompt library.
6. **Verbose logging to stderr** (log.ts) -- never mixes with stdout. Maintain this separation.
7. **`doctor` command** (cli.ts:328-357) -- validates environment. Extend to check new config fields.

---

## Sources

- clig.dev -- "Command Line Interface Guidelines" (comprehensive CLI design guide: error messages, help, interactivity, piping, color). HIGH confidence: widely cited, battle-tested by Heroku/Docker/GitHub CLI teams.
- Jeff Dickey -- "12-Factor CLI Apps" (startup speed, help, flags vs args, streams, error handling). HIGH confidence: practitioner-authored, widely referenced.
- @clack/prompts README (prompt library gotchas: cancel sentinel, no non-interactive guidance, spinner cleanup). MEDIUM confidence: direct from source, but gaps identified from reading the docs rather than production failures.
- jules-dispatch codebase -- cli.ts, config.ts, output.ts, log.ts (current patterns and gaps). HIGH confidence: direct code inspection.
- Evil Martians -- "CLI UX Best Practices" (progress displays, clean output, spinner patterns). MEDIUM confidence: practitioner blog, consistent with clig.dev.
- Anthropic/gum patterns (exit codes, structured logging, stdout/stderr separation). LOW confidence: indirect source, patterns inferred from README.
