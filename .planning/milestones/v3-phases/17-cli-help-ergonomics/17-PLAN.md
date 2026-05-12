# Phase 17: CLI Help & Ergonomics

## Requirements
- CLI-01: Every CLI command has 2-4 usage examples via `addHelpText('after', ...)`
- CLI-02: Top-level `--help` shows grouped command list and getting-started footer
- CLI-03: NO_COLOR=1, TERM=dumb, and piped stdout disable color output

## Plan 17-01: Help examples, grouped help, color detection

### Changes

**src/cli.ts** — Add examples to every command, configure grouped help:
- `dispatch`: 4 examples (basic, with source, stdin, stdin json)
- `batch`: 3 examples (default dir, custom dir, with parallel)
- `status`: 3 examples (recent, specific IDs, watch mode)
- `get`: 2 examples (by session ID)
- `wait`: 3 examples (single, multiple, with timeout)
- `sources`: 2 examples (list all)
- `message`: 2 examples (send message)
- `plan`: 2 examples (view plan)
- `approve`: 2 examples (approve plan)
- `cancel`: 2 examples (cancel session)
- `doctor`: 3 examples (basic, with task file, verbose)
- `tail`: 2 examples (tail session)
- `plan-tasks`: 3 examples (basic, from stdin, with output)
- `auto`: 3 examples (basic, dry-run, non-interactive)
- `mcp`: 2 examples (run server, with project dir)
- Top-level `--help`: use `configureHelp` to show grouped commands (Core, Monitoring, Setup, Utilities) + getting-started footer
- Add `addHelpText('afterAll', ...)` to top-level program

**src/output.ts** — Explicit color detection:
- In module initialization, check `NO_COLOR`, `TERM=dumb`, and `stdout.isTTY`
- Force `chalk.level = 0` when any of these conditions are true
- Export a `shouldColorize()` function for testability

**tests/cli-help.test.ts** — New test file:
- Test that each command's help text includes "Examples:"
- Test that top-level help shows grouped commands
- Test that NO_COLOR disables colors
- Test that TERM=dumb disables colors
- Test that piped stdout (non-TTY) disables colors
