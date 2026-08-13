# Reddit Post Drafts

> Post after demo GIF is ready. Check each subreddit's self-promotion rules first.
> Post as experience-sharing, not advertising.

---

## r/ClaudeAI

**Title:** Claude Code as orchestrator, Jules as workers — parallel AI coding with MCP

**Body:**

I've been using Google Jules for coding tasks, but the "one session at a time" limit was killing me when I had multiple independent tasks. So I built an MCP server that lets Claude Code orchestrate a fleet of Jules agents.

The setup: jules-dispatch runs as an MCP server. Claude Code calls `jules_dispatch` with N tasks, monitors them with `jules_monitor`, handles plan approvals with `jules_interact`, and collects PR links at the end.

You just say: "Add tests to the auth, billing, users, and audit modules. Dispatch them to Jules in parallel, ask me before approving plans, and summarize the PRs when done."

Claude handles the whole cycle — dispatch, monitor, approve, collect — without you touching the CLI. One strategic agent coordinating N execution agents.

What's worked well:
- Independent tasks (one module per task) produce clean, independent PRs
- Failure isolation: one failed task doesn't kill the batch
- Plan approval gives you a human gate on risky changes

What broke:
- Tasks sharing files = merge conflicts (split by directory, not concept)
- High concurrency (20+) hits Jules rate limits (10 is the sweet spot)

Project: https://github.com/Yuuqq/jules-dispatch
MCP Registry: io.github.Yuuqq/jules-dispatch
MIT, works with Claude Code and Codex.

Anyone else doing multi-agent orchestration with Claude Code? Curious how you handle task decomposition.

---

## r/LocalLLaMA

**Title:** Run a local LLM as a task planner for parallel Google Jules agents (Ollama + jules-dispatch)

**Body:**

I wanted to automate the "split this big goal into N parallel tasks" step without sending data to OpenAI. jules-dispatch supports any OpenAI-compatible endpoint, so you can use Ollama locally as the planner.

Setup:
```bash
# Start Ollama with your preferred model
ollama serve

# Use it as the planner
export LLM_BASE_URL=http://localhost:11434/v1
export LLM_MODEL=qwen2.5-coder:32b
export LLM_API_KEY=ollama  # any non-empty string works

jules-dispatch auto "Migrate the Express API to Fastify and add request-validation tests"
```

The planner runs entirely on your machine — it takes your one-sentence goal, decomposes it into N independent tasks, and shows them for confirmation before dispatching to Google Jules.

Works with any OpenAI-compatible endpoint: Ollama, vLLM, LiteLLM, LM Studio, etc. The planner is optional — all core dispatch/monitor commands work without any LLM key.

Project: https://github.com/Yuuqq/jules-dispatch (MIT, TypeScript)

The planner prompt is designed to produce independent, PR-sized tasks. It asks for title + prompt + repo + branch per task, and warns you if tasks might share files.

---

## r/V2EX (Chinese)

**标题：** 用一条命令派发 N 个并行 Google Jules agent，把编码任务并行化

**正文：**

Google Jules 很好用，但一次只能跑一个任务。当你有 8 个独立的模块都需要加测试时，串行跑要一整晚。

我写了个 CLI + MCP server 叫 jules-dispatch，可以批量并发派发任务到 Jules，最多 50 个并行会话，每个会话独立产出一个 PR。

核心用法：
```bash
npm install -g @yuuqq/jules-dispatch
jules-dispatch init          # 配置 API key
jules-dispatch batch tasks/ --parallel 8
jules-dispatch wait          # 等待全部完成
```

也可以作为 MCP server 接入 Claude Code，让 Claude 当编排 AI，Jules 当执行 AI。你只需要说「给这 5 个模块加测试，并行派发到 Jules」，Claude 会自动调用 MCP 工具完成派发、监控、审批、收集 PR 的全流程。

踩过的坑：
- 任务必须互相独立，不能编辑同一个文件（否则合并冲突）
- --parallel 10 是最佳并发数，20+ 会触发 Jules 限流
- 任务拆分是最难的部分，不是派发

项目地址：https://github.com/Yuuqq/jules-dispatch
MIT 协议，已上架 MCP Registry 和 npm。

有人也在做多 agent 并行编码吗？想交流下任务拆分的经验。
