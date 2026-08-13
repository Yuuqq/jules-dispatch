# Launch Plan — 让 jules-dispatch 被看见

> 状态：仓库硬伤已修复（LICENSE、topics、homepage、徽章、社区文件、CHANGELOG、v1.2.0 Release）。
> 本文档是接下来的分发执行清单，按优先级排序。

---

## 0. 前置：npm 首发（阻塞所有分发动作）

⚠️ **npm 上的 `jules-dispatch` 被别人占用**（一个无关的 Telegram bot，2026-03 发布）。
包已改名为 **`@yuuqq/jules-dispatch`**（bin 命令仍是 `jules-dispatch`）。

发布步骤（人工操作，需要 npm 账号）：

```bash
# 如果你的 npm 用户名不是 yuuqq：先把 package.json 的 name scope 换成你的 npm 用户名，
# 并全局搜索替换文档中的 @yuuqq/jules-dispatch
npm login
npm publish          # prepublishOnly 会自动构建；publishConfig 已设 access: public
```

发布后建议把 [Unreleased] 的内容 bump 成 **1.3.0**（doctor、init、--pace-ms、MCP 工具整合都是未发布的新功能），
再发一个 GitHub Release v1.3.0 —— 这就是第一次"完整发布节点"，所有分发动作都挂这个节点。

## 1. Demo GIF（转化率的核心资产）

用 [vhs](https://github.com/charmbracelet/vhs)（脚本化录制，可重录）或 asciinema 录一段 ≤45 秒的演示：

脚本（vhs .tape 思路）：

1. `cat tasks/add-tests/*.yaml` 快速扫一眼 3-4 个任务文件（1 屏）
2. `jules-dispatch batch tasks/add-tests --parallel 4` — 展示并行派发输出
3. `jules-dispatch wait <ids> ` — 快进到完成
4. 结尾定格在 PR 链接列表上（这是"一条命令 → N 个 PR"的画面证据）

产出 `docs/demo.gif`，插入 README 第一屏（banner 下方），英文中文都插。

## 2. MCP 目录提交（受众最精准，全部免费）

| 渠道 | 方式 | 状态 |
|---|---|---|
| **官方 MCP Registry** (`registry.modelcontextprotocol.io`) | `mcp-publisher publish` CLI + `server.json` | ✅ **已发布** `io.github.Yuuqq/jules-dispatch@1.3.2` |
| [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | PR 加到 Community Servers 列表 | ☐ （官方仓库已改为只维护参考服务器，社区服务器走 Registry） |
| [Smithery](https://smithery.ai/) | 网站提交 / GitHub 集成 | ☐ （需要托管 HTTP 端点或 MCPB bundle，stdio 服务器需额外打包） |
| [Glama MCP](https://glama.ai/mcp/servers) | 自动从 GitHub topics 索引 | ✅ **自动收录**（已加 topics: mcp, mcp-server 等） |
| [PulseMCP](https://www.pulsemcp.com/) | 自动从官方 Registry 同步 | ✅ **自动收录**（约 7 天内出现；可发邮件 hello@pulsemcp.com 催） |
| [mcp.so](https://mcp.so/) | 网站提交（需 GitHub 登录） | ☐ （需浏览器操作） |
| awesome-mcp-servers（punkpeye 等多个） | PR | ✅ **PR 已提交** [#12048](https://github.com/punkpeye/awesome-mcp-servers/pull/12048) |
| awesome-claude-code（hesreallyhim） | PR | ⚠️ gh CLI 权限被拒，需在网页手动创建：fork 已建好，分支 `add-jules-dispatch` 已推送，去 https://github.com/hesreallyhim/awesome-claude-code/compare/main...Yuuqq:awesome-claude-code:add-jules-dispatch 创建 PR |

一句话介绍（复制即用）：

> **jules-dispatch** — Batch-dispatch coding tasks to Google Jules with up to 50 parallel sessions. Exposes dispatch/monitor/interact tools over MCP so Claude Code or Codex can orchestrate a fleet of Jules agents: fan out tasks, approve plans, answer feedback, and collect PR links.

## 3. awesome 列表

- awesome-claude-code（PR：MCP servers 区块）
- awesome-ai-agents
- awesome-claude / awesome-codex 类列表（搜最活跃的 2-3 个即可，不求全）

## 4. 发布帖草稿

### Show HN（demo GIF 就绪后再发；工作日美东上午发）

标题候选（写场景，不写工具名）：

- `Show HN: Dispatch 20 parallel Google Jules coding agents from one command`
- `Show HN: I turned Google Jules into a parallel coding workforce (CLI + MCP)`

正文要点（首评自己发）：

- 起因：Jules 一次只能开一个任务，但我的迁移工作有 20 个独立单元
- 是什么：CLI + MCP server；YAML 定义任务 → 并行派发 → 收集 PR
- 亮点：Claude Code 可以通过 MCP 指挥整个 fleet（一个编排 AI + N 个执行 AI）
- 诚实说限制：任务必须互相独立；共享文件的任务要分波次
- 结尾问社区：你们怎么拆解可并行的编码任务？

### Reddit

- r/ClaudeAI —— 角度：「Claude Code as orchestrator, Jules as workers」（MCP 集成是这个 sub 的热点）
- r/LocalLLaMA —— 角度：BYO-LLM planner 支持 Ollama 本地规划（这个 sub 只关心本地）
- 规则：先看各 sub 的自我推广规则；帖子写成经验分享而非广告

### 中文渠道

- V2EX（分享创造）/ 掘金 / 即刻
- 角度：「我如何用 N 个并行 Jules agent 一晚上补齐整个代码库的测试」——写真实数字、真实翻车、真实 PR 截图

## 5. 内容营销（长尾流量）

一篇实战长文（英文发 dev.to / Hacker Noon，中文发掘金）：

- 标题方向：*"Orchestrating 10 parallel AI coding agents: what worked, what broke"*
- 必须有：真实任务拆解、成功率数字、失败案例、成本、结论清单
- 文末自然链接到 repo

## 6. 持续运营节奏

- 每次 release 都发 GitHub Release + 简短推文/帖子（Release 页是 watch 用户的唯一通知渠道）
- Jules / MCP 官方有大更新时 48 小时内跟进适配 + 发帖蹭热点
- issue 24 小时内首次回应（早期项目响应速度就是口碑）
- 挂 3-5 个 `good first issue`（文档、错误信息改进类最合适）

## 时机提醒

所有对外发帖等 demo GIF + npm 首发完成后再开始；「可安装、有动图」是发布帖的最低标准。
MCP 目录提交不用等，修复推送后即可开始。
