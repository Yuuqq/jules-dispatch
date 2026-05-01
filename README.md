# jules-dispatch

Batch dispatch tasks to Google Jules API and collect results locally.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Jules API key and default source
```

## Usage

### Dispatch a single task

```bash
npx tsx src/cli.ts dispatch tasks/example.yaml
```

### Batch dispatch all tasks in a directory

```bash
npx tsx src/cli.ts batch tasks/ --parallel 10
```

### Check status

```bash
npx tsx src/cli.ts status
npx tsx src/cli.ts status --ids SESSION_ID1 SESSION_ID2
```

### Wait for completion

```bash
npx tsx src/cli.ts wait SESSION_ID1 SESSION_ID2 --interval 30s
```

### Send follow-up message

```bash
npx tsx src/cli.ts message SESSION_ID "Can you also add tests?"
```

### List sources

```bash
npx tsx src/cli.ts sources
```

## Task File Format

YAML or JSON. One task per file in `tasks/` directory:

```yaml
title: "Task Title"
source: "sources/github/owner/repo"  # optional, uses default from .env
branch: "main"                        # optional, uses default from .env
autoMode: "AUTO_CREATE_PR"            # optional, creates PR automatically
prompt: |
  Your multi-line prompt here.
  Jules will execute this in its cloud sandbox.
```

Or JSON:

```json
{
  "title": "Task Title",
  "prompt": "Your prompt here."
}
```

## Architecture

```
src/
  cli.ts         — Command-line interface (Commander)
  client.ts      — Jules API HTTP client
  config.ts      — .env and task file loading
  dispatcher.ts  — Single and batch task dispatch
  collector.ts   — Status collection and completion waiting
  types.ts       — TypeScript type definitions
tasks/           — Task definitions (YAML/JSON)
```

## Flags

- `-p, --project <dir>` — project directory containing .env (default: current dir)
- `-s, --source` — override source for dispatch
- `-b, --branch` — override branch for dispatch
- `-n, --parallel` — max parallel dispatches (default: 10)
