# Orchestrating 10 Parallel AI Coding Agents: What Worked, What Brode

> Draft for dev.to / Hacker Noon (English) and 掘金 (Chinese translation).
> Written from real experience using jules-dispatch to parallelize Google Jules tasks.

---

## TL;DR

I needed to add unit tests across 8 modules of a Node.js backend. Doing it sequentially with Google Jules would have taken all night. Instead, I dispatched 8 parallel Jules agents — one per module — and had 8 focused PRs ready for review in under 40 minutes. Here's what I learned about making parallel AI coding actually work, and where it falls apart.

---

## The Problem

Google Jules is genuinely good at taking a coding task and producing a PR. But it's fundamentally serial: one task at a time, one session at a time. When you have 8 independent modules that all need the same kind of work, you're stuck waiting for each one to finish before starting the next.

The obvious answer is "run them in parallel." But Jules doesn't give you that out of the box — you'd have to manually open 8 browser tabs, paste 8 prompts, and track 8 sessions by hand. That's not parallelism; that's just multitasking with worse ergonomics.

I built [jules-dispatch](https://github.com/Yuuqq/jules-dispatch) to solve this: a CLI that takes YAML task definitions and dispatches them to Jules in parallel, with up to 50 concurrent sessions, then polls for completion and collects the PR links.

---

## The Setup

The codebase: a Node.js Express API with 8 modules — auth, users, billing, payments, sessions, audit, notifications, and webhooks. Each module had zero unit tests. The goal: give each module its own test file with comprehensive coverage.

### Task decomposition

The golden rule of parallel AI coding: **tasks must be independent**. If task B reads a file that task A modifies, running them in parallel produces a merge conflict or a broken build. I checked that each module's tests would only touch files within that module's directory.

### Task files

One YAML file per module, all in a `tasks/` directory:

```yaml
# tasks/add-auth-tests.yaml
title: "Add unit tests for auth module"
prompt: |
  Add comprehensive unit tests for src/auth/:
  1. Test login with valid credentials
  2. Test login with invalid credentials
  3. Test token refresh flow
  4. Test session expiry handling
  5. Open a PR with the test file
source: "sources/github/myorg/myrepo"
branch: "main"
```

Eight files like this, one per module. Each is self-contained — the prompt describes exactly what to do, and Jules works from the remote branch so there's no local state to worry about.

---

## The Dispatch

One command:

```bash
jules-dispatch batch tasks/ --parallel 8
```

What happens next:

1. jules-dispatch creates 8 Jules sessions simultaneously (the worker pool is continuously replenished, so `--parallel 8` means 8 in-flight at all times)
2. Each session gets its own task and starts planning independently
3. The CLI polls for completion and reports status

The output looks like this:

```
✓ Add unit tests for auth module
  Session: https://jules.google.com/session/abc123
  ID:      abc123

✓ Add unit tests for users module
  Session: https://jules.google.com/session/def456
  ID:      def456
...
```

Then `jules-dispatch wait` polls until all 8 are done.

---

## What Worked

### 1. Independent tasks = independent PRs

Because each task was scoped to one module, each Jules session produced a clean, focused PR. No merge conflicts. Each PR could be reviewed and merged independently — if the auth tests had a bug, I could reject that PR without affecting the other 7.

### 2. Failure isolation

One session (billing) failed — Jules couldn't find a mock setup file it expected. The other 7 completed successfully. I could see the failure in `jules-dispatch status`, read the failure reason, fix the task prompt, and re-dispatch just that one task. The 7 successful PRs were untouched.

### 3. Plan approval for risky tasks

For the webhooks module (which touched shared middleware), I added `requirePlanApproval: true` to the task. Jules generated a plan, paused, and I reviewed it before approving:

```bash
jules-dispatch plan <session-id>     # read the plan
jules-dispatch approve <session-id>  # let it proceed
```

This gave me a human gate on the one risky task while the other 7 ran autonomously.

### 4. The MCP integration

For the second run, I used Claude Code with the jules-dispatch MCP server. I just said:

> "Add integration tests to the 5 modules that don't have them yet. Dispatch them to Jules in parallel, ask me before approving any plans, and summarize the PRs when done."

Claude Code called `jules_dispatch` with 5 tasks, monitored them with `jules_monitor`, inspected the one that needed plan approval with `jules_interact`, and gave me a summary with 5 PR URLs. I didn't touch the CLI once.

---

## What Brode

### 1. Two tasks that shared a file

I got greedy on the third run and added a task to "refactor the error handler" while another task was "add tests for the error handler." Both touched `src/errors.ts`. Result: two PRs with conflicting changes to the same file. One merged cleanly, the other had a merge conflict that Jules couldn't resolve.

**Lesson:** parallel tasks must not share files. If they do, run them in separate waves, not in parallel.

### 2. Rate limiting at high concurrency

At `--parallel 20` (testing the limits), I hit Jules API rate limits. jules-dispatch retries with exponential backoff, so it eventually recovered, but 4 sessions were delayed by ~3 minutes each.

**Lesson:** `--parallel 10` is the sweet spot for most accounts. Use `--pace-ms 250` to space out session creation starts if you're hitting limits.

### 3. The planner got creative

I used the optional LLM planner (`jules-dispatch auto "Add tests to all modules"`) and it split the work into 6 tasks instead of 8 — it merged two small modules into one task. The result was fine, but the task boundaries weren't what I would have chosen manually.

**Lesson:** use `plan-tasks` (plan only, no dispatch) when you want to review and edit the generated YAML before committing. Use `auto` when you trust the planner's decomposition.

---

## The Numbers

| Metric | Sequential (1 Jules) | Parallel (8 Jules) |
|---|---|---|
| Wall-clock time | ~5 hours | ~38 minutes |
| PRs produced | 8 (one at a time) | 8 (simultaneous) |
| Failed tasks | Restart from scratch | Retry just the failed one |
| My involvement | Watch each session | Set up, then wait |

The 8x speedup isn't surprising — that's just parallelism. The real win is **failure isolation**: when one task fails, you don't lose the work from the other seven.

---

## When Parallel AI Coding Doesn't Make Sense

- **Tasks that depend on each other.** If task B needs the output of task A, they can't run in parallel. Run them in waves instead.
- **Tasks that edit the same files.** This produces merge conflicts. Split by directory, not by concept.
- **Single large refactors.** A "rewrite the auth system" task is one big task, not eight small ones. Parallelism needs decomposability.
- **When you need consistency across outputs.** Eight parallel agents will produce eight different testing styles. If you need uniform style, one agent doing all of them will be more consistent.

---

## How to Try It

```bash
npm install -g @yuuqq/jules-dispatch
jules-dispatch init          # set up API key + repo
jules-dispatch doctor        # validate your setup
jules-dispatch batch tasks/ --parallel 8
```

The project is open source (MIT), listed on the [MCP Registry](https://registry.modelcontextprotocol.io), and works as both a CLI and an MCP server for Claude Code / Codex.

- **GitHub:** [Yuuqq/jules-dispatch](https://github.com/Yuuqq/jules-dispatch)
- **npm:** [@yuuqq/jules-dispatch](https://www.npmjs.com/package/@yuuqq/jules-dispatch)
- **Docs:** [yuuqq.github.io/jules-dispatch](https://yuuqq.github.io/jules-dispatch/)

---

*If you've tried parallel AI coding — with Jules, Codex, or anything else — I'd love to hear what worked and what broke for you. The hardest part is always task decomposition, and I'm still learning where the boundaries should be.*
