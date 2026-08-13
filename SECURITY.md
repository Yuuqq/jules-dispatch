# Security Policy

## Supported Versions

Only the latest published release of `@yuuqq/jules-dispatch` receives security fixes.

## Reporting a Vulnerability

Please **do not** open a public issue for security problems.

Use [GitHub private vulnerability reporting](https://github.com/Yuuqq/jules-dispatch/security/advisories/new) to report privately. You should get an initial response within a few days.

## Scope Notes

- jules-dispatch stores your `JULES_API_KEY` (and optional LLM keys) in a local `.env` file and sends them only to the Jules API / your configured LLM endpoint. It never transmits keys anywhere else.
- If a bug causes keys to be written into logs, dispatch records, or MCP responses, treat it as a security vulnerability and report it privately.
- Issues in Google Jules itself (the hosted service) should be reported to Google, not this project.
