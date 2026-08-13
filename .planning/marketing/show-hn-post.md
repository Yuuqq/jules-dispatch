# Show HN Post Draft

> Post on a weekday, US morning (8-10am ET / 2-4pm CET). Wait until demo GIF is ready.
> Title options (pick one — write the scenario, not the tool name):

## Title (recommended)

> Show HN: Dispatch 20 parallel Google Jules coding agents from one command

## Body

I built a CLI + MCP server that turns Google Jules from a "one task at a time" tool into a parallel coding workforce. You define tasks as YAML files, run one command, and get N concurrent Jules sessions — each producing its own PR.

**Why I built it:** I had 8 independent modules that all needed unit tests. Doing them one at a time with Jules would take all night. So I wrote a dispatcher that fans them out in parallel and collects the results.

**What it does:**
- Batch-dispatch up to 50 concurrent Jules sessions from YAML task files
- Poll for completion, detect PRs, surface failures
- Approve plans, send follow-up messages, cancel runaway sessions
- Optional BYO-LLM planner: give it one sentence, it expands into N tasks (works with OpenAI, Ollama, Groq, etc.)
- Runs as an MCP server — Claude Code or Codex can orchestrate the whole thing as tools

**The killer use case:** Claude Code as the orchestrator, Jules as the workers. You say "add tests to these 5 modules and dispatch them to Jules" — Claude calls the MCP tools, monitors progress, handles plan approvals, and returns PR URLs.

**What I learned:**
- Parallel AI coding only works when tasks are truly independent (no shared files)
- Failure isolation is the real win — one failed task doesn't kill the batch
- `--parallel 10` is the sweet spot; 20+ hits Jules rate limits
- Task decomposition is the hard part, not the dispatching

**Links:**
- GitHub: https://github.com/Yuuqq/jules-dispatch
- npm: `npm install -g @yuuqq/jules-dispatch`
- Listed on the MCP Registry: `io.github.Yuuqq/jules-dispatch`

MIT, TypeScript, Node 20+. Would love feedback on the task decomposition problem — how do you decide what's safe to parallelize?

---

## First comment (post immediately after)

Here's a 30-second demo: [link to demo GIF when ready]

The core loop is:
1. Write one YAML file per task (`title` + `prompt` + `repo` + `branch`)
2. `jules-dispatch batch tasks/ --parallel 8`
3. `jules-dispatch wait` — polls until all sessions are done
4. Collect PR links from the output

For the MCP path, add `jules-dispatch mcp` to your Claude Code config and just describe the outcome in natural language. Claude handles the dispatch/monitor/interact cycle.

The hardest part in practice is making sure tasks don't share files. Two tasks editing the same file will produce merge conflicts. I split by directory — one module per task — and that works well. If tasks do depend on each other, you run them in waves instead of all at once.
