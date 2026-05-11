# Phase 15: Doctor Command - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can run `jules-dispatch doctor` to validate their environment before first use. The command reports Node.js version, npm availability, JULES_API_KEY presence and connectivity, and task file format validation.

</domain>

<decisions>
## Implementation Decisions

### Environment Checks
- Report Node.js version (minimum 20+)
- Check npm availability
- Display results as pass/warn/fail with color coding

### API Connectivity
- Check JULES_API_KEY is set in environment or .env
- Make a lightweight API call to verify connectivity (listSources with pageSize=1)
- Report auth errors clearly

### Task File Validation
- When a path is provided via `--task-file <path>`, validate YAML/JSON format
- Check required fields (title, prompt)
- Report specific errors for malformed files

### Claude's Discretion
- Output format, CLI flags, exit codes — follow existing CLI patterns in cli.ts
- Use chalk for color (already a dependency)
- Use existing emit() dual output pattern

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli.ts` — command routing, existing patterns (addCommand, chalk, emit)
- `src/config.ts` — loadConfig, loadTasksFromString, validateTask
- `src/client.ts` — JulesClient for API connectivity check
- `src/output.ts` — emit(), emitError(), ExitCode

### Established Patterns
- Commands defined via program.command('name').action(handler)
- Dual output via emit(textFn, jsonObj)
- Exit codes: 0 (OK), 1 (generic), 2 (auth), 3 (validation)
- chalk for terminal colors

### Integration Points
- New command added to cli.ts command definitions
- Uses existing JulesClient for connectivity test
- Uses existing loadConfig for .env parsing

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond ROADMAP success criteria.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
