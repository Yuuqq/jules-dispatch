# Contributing to jules-dispatch

Thanks for your interest in contributing! This project turns Google Jules into a parallel coding workforce, and contributions of all sizes are welcome — bug reports, docs fixes, new features, and everything in between.

## Quick Start

```bash
git clone https://github.com/Yuuqq/jules-dispatch.git
cd jules-dispatch
npm install
npm run build      # compile TypeScript → dist/
npm test           # run the vitest suite
npm run typecheck  # tsc --noEmit
```

Requirements: **Node.js 20+**. To try the CLI against the real Jules API you need a [Google Jules](https://jules.google.com/) API key (`jules-dispatch init` sets up a `.env`), but most development only needs the test suite.

## Project Conventions

These keep the codebase predictable — PRs that follow them get merged faster:

- **ESM only** — `"type": "module"`, use `.js` extensions in imports.
- **Dual output** — every user-facing operation goes through `emit(textFn, jsonObj)` in `src/output.ts` so both human and `--json` modes stay in sync.
- **Exit codes are API** — `0` OK, `1` generic, `2` auth, `3` validation, `4` partial failure, `5` timeout. Don't repurpose them.
- **Thin client** — `src/client.ts` is pure HTTP. Orchestration logic lives in `dispatcher.ts` / `collector.ts`.
- **Immutability** — create new objects rather than mutating.
- **Tests** — new behavior needs a vitest test. Bug fixes need a regression test.

## Pull Requests

1. Fork and create a feature branch from `main`.
2. Keep PRs focused — one logical change per PR.
3. Make sure `npm test` and `npm run typecheck` pass locally (CI runs both on Linux and Windows, Node 20 and 22).
4. Describe *why* the change is needed, not just what it does.

## Reporting Bugs

Open an issue with the bug report template. Please include:

- CLI version, OS, and Node version
- The exact command and (redacted) output
- **Never paste your `JULES_API_KEY` or LLM keys** — redact tokens from logs before posting.

## Questions and Ideas

Use [GitHub Discussions](https://github.com/Yuuqq/jules-dispatch/discussions) for questions, use-case sharing, and ideas that aren't concrete feature requests yet.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
