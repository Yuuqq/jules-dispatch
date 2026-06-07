# Skills

This directory contains Agent Skills-compatible wrappers that teach coding agents how to use this project.

## `jules-dispatch/`

The `jules-dispatch` skill is an instruction layer for Claude Code, Codex, or compatible hosts. It does not replace MCP setup; it tells the host when to use the `jules-dispatch` CLI or MCP tools and which workflows to prefer.

Install it by copying the folder into the host's skills directory:

```bash
cp -R skills/jules-dispatch "${CODEX_HOME:-$HOME/.codex}/skills/jules-dispatch"
```

The MCP server still needs to be configured separately with `jules-dispatch mcp` and a valid `JULES_API_KEY`.
