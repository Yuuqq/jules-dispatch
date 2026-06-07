# Task Catalog

This directory contains Jules task definitions and task batches used with `jules-dispatch`.

Root-level `.yaml` files are dispatchable task files. Subdirectories group larger batches by project or experiment. `jules-dispatch batch tasks/` only reads task files directly under `tasks/`; dispatch a grouped batch by passing that subdirectory explicitly.

## Root Tasks

| Path | Purpose |
| --- | --- |
| `example.yaml` | Minimal example task. |
| `walkincs-dispatch.yaml` | Existing WalkInCS dispatch task. |
| `p01-phase*.yaml` | Policy database phase tasks kept at the root for direct dispatch. |
| `p01-test-single.yaml` | Single-task smoke or validation dispatch. |
| `qiaopi-test.yaml` | Qiaopi validation task. |
| `roots-sg-scrape.yaml` | Roots SG scraping task. |
| `roots-sg-scrape-retry.yaml` | Retry variant of the Roots SG scraping task. |

## Grouped Batches

| Directory | Files | Notes |
| --- | ---: | --- |
| `academic-style-extractor/` | 5 | Academic style extractor feature tasks. |
| `css-lab-readme/` | 1 | Documentation artifact, not a dispatchable YAML batch. |
| `css-lab-round3/` | 29 | CSS lab data and annotation task round. |
| `css-lab-round4/` | 6 | CSS lab follow-up and cross-project tasks. |
| `css-lab-round5/` | 7 | CSS lab export, analysis, and documentation tasks. |
| `p01-data-collection/` | 1 | Policy database data collection task. |
| `p01-exa-retry/` | 3 | Exa retry collection tasks. |
| `p01-fill-gaps/` | 1 | Gap-filling task. |
| `p01-policy-db/` | 5 | Policy database phase batch mirror. |
| `p01-retry/` | 1 | Policy database retry task. |
| `p01-test/` | 1 | Policy database test task. |
| `p01-tools/` | 6 | Policy database tooling batches. |
| `pgi-retry/` | 1 | PGI retry task. |
| `pgi-retry2/` | 1 | PGI second retry task. |
| `pgi-review/` | 8 | PGI review task batch. |
| `resume-i18n/` | 24 | Resume i18n implementation and hardening tasks. |
| `slide-skill-uat/` | 1 | Slide skill UAT task. |

## Usage

```bash
jules-dispatch dispatch tasks/example.yaml
jules-dispatch batch tasks/pgi-review --parallel 4
jules-dispatch batch tasks/resume-i18n --parallel 8
```

Keep task files self-contained: every file should include a clear `title`, detailed `prompt`, and `source` when no project default is configured.
