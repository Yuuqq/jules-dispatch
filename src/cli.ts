#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { loadConfig, loadTasksFromString } from './config.js';
import { JulesClient } from './client.js';
import { dispatchTask, dispatchBatch, dispatchTaskDefinition } from './dispatcher.js';
import { collectStatus, waitForCompletion } from './collector.js';
import { setOutputMode, isJson, emit, emitError, info, ExitCode } from './output.js';
import { setVerbose } from './log.js';
import { translateError, type TranslatedError } from './errors.js';

const program = new Command();

program
  .name('jules-dispatch')
  .description('Batch-dispatch tasks to Google Jules + MCP server for Claude Code / Codex')
  .version('1.2.0')
  .option('-p, --project <dir>', 'project directory with .env', '.')
  .option('--api-key <key>', 'Jules API key (overrides JULES_API_KEY env var)')
  .option('--llm-key <key>', '[optional planner] LLM API key (overrides LLM_API_KEY / OPENAI_API_KEY)')
  .option('--llm-base-url <url>', '[optional planner] OpenAI-compatible base URL (default: https://api.openai.com/v1)')
  .option('--llm-model <model>', '[optional planner] model id (default: gpt-4o-mini)')
  .option('--json', 'machine-readable JSON output (one JSON object per command, NDJSON for streams)', false)
  .option('-v, --verbose', 'log HTTP requests, timing, and error stacks to stderr (or set JULES_DISPATCH_VERBOSE=1)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean; verbose?: boolean };
    if (opts.json) setOutputMode('json');
    if (opts.verbose) setVerbose(true);
  });

function getConfig(): { config: ReturnType<typeof loadConfig>; client: JulesClient } {
  const opts = program.opts() as { project: string; apiKey?: string };
  const config = loadConfig(resolve(opts.project), { apiKeyOverride: opts.apiKey });
  return { config, client: new JulesClient(config) };
}

function fail(input: string | TranslatedError | unknown, code: number = ExitCode.GENERIC, errCode?: string): never {
  if (typeof input === 'string') {
    emitError(input, errCode);
  } else {
    const translated = translateError(input);
    const { problem, cause, fix, code: tCode, context } = translated;
    emitError(problem, tCode, `Cause: ${cause}\nFix: ${fix}`, context);
  }
  process.exit(code);
}

function parseIntegerOption(value: string, name: string, min: number, max?: number): number {
  const parsed = Number(value);
  const maxText = max === undefined ? '' : ` and <= ${max}`;
  if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
    fail(`Invalid ${name}. Expected an integer >= ${min}${maxText}.`, ExitCode.VALIDATION, 'INVALID_OPTION');
  }
  return parsed;
}

// ---------- dispatch ----------

program
  .command('dispatch <taskFile>')
  .description('Dispatch a single task file to Jules. Use "-" to read from stdin.')
  .option('-s, --source <source>', 'override source (e.g. sources/github/owner/repo)')
  .option('-b, --branch <branch>', 'override branch')
  .option('--format <fmt>', 'stdin format: yaml|json', 'yaml')
  .action(async (taskFile: string, opts: { source?: string; branch?: string; format: string }) => {
    const { config, client } = getConfig();

    let result;
    if (taskFile === '-') {
      const content = readFileSync(0, 'utf8');
      const tasks = loadTasksFromString(content, opts.format as 'yaml' | 'json');
      if (tasks.length === 0) fail('No tasks found in stdin', ExitCode.VALIDATION, 'NO_TASKS');
      info(chalk.dim('Dispatching from stdin\n'));
      result = await dispatchTaskDefinition(client, config, tasks[0], '<stdin>', {
        source: opts.source,
        branch: opts.branch,
      });
    } else {
      info(chalk.dim(`Dispatching: ${taskFile}\n`));
      result = await dispatchTask(client, config, resolve(taskFile), {
        source: opts.source,
        branch: opts.branch,
      });
    }

    if (result.status === 'dispatched') {
      emit(
        () => {
          console.log(`${chalk.green('✓')} ${chalk.bold(result.title)}`);
          console.log(`  ${chalk.dim('Session:')} ${result.sessionUrl}`);
          console.log(`  ${chalk.dim('ID:')}      ${result.sessionId}`);
        },
        result,
      );
    } else {
      emit(() => console.error(`${chalk.red('✗')} ${chalk.bold(result.title)}: ${result.error}`), result);
      process.exit(ExitCode.GENERIC);
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch dispatch task.yaml
  $ jules-dispatch dispatch task.yaml --source sources/github/owner/repo --branch main
  $ jules-dispatch dispatch - < tasks.yaml
  $ echo '{"title":"Fix","prompt":"Fix bug"}' | jules-dispatch dispatch - --format json
`);

// ---------- batch ----------

program
  .command('batch [taskDir]')
  .description('Dispatch all .yaml/.yml/.json task files in a directory (supports multi-document YAML)')
  .option('-s, --source <source>', 'override source for all tasks')
  .option('-b, --branch <branch>', 'override branch for all tasks')
  .option('-n, --parallel <n>', 'max parallel dispatches', '10')
  .option('--no-log', 'do not write dispatch log file')
  .action(async (taskDir: string | undefined, opts: { source?: string; branch?: string; parallel: string; log: boolean }) => {
    const { config, client } = getConfig();
    const projectDir = (program.opts() as { project: string }).project;
    const dir = resolve(taskDir ?? resolve(projectDir, 'tasks'));

    const results = await dispatchBatch(client, config, dir, {
      source: opts.source,
      branch: opts.branch,
      parallel: parseIntegerOption(opts.parallel, '--parallel', 1, 50),
      logDir: opts.log === false ? false : undefined,
    });

    const failed = results.filter(r => r.status === 'failed').length;
    if (failed > 0 && results.length > failed) process.exit(ExitCode.PARTIAL);
    if (failed > 0) process.exit(ExitCode.GENERIC);
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch batch
  $ jules-dispatch batch ./my-tasks --parallel 5
  $ jules-dispatch batch --no-log
`);

// ---------- status ----------

program
  .command('status')
  .description('Check status of recent Jules sessions')
  .option('-i, --ids <ids...>', 'specific session IDs to check')
  .option('-o, --output <file>', 'save JSON report to file')
  .option('--scan <n>', 'how many recent sessions to scan when no --ids given', '100')
  .option('-w, --watch', 'auto-refresh status table')
  .option('--interval <ms>', 'refresh interval in milliseconds (default: 5000)', '5000')
  .action(async (opts: { ids?: string[]; output?: string; scan: string; watch?: boolean; interval: string }) => {
    const { config, client } = getConfig();
    await collectStatus(client, config, {
      sessionIds: opts.ids,
      output: opts.output,
      scanLimit: parseIntegerOption(opts.scan, '--scan', 1, 200),
    });

    if (opts.watch) {
      // Watch mode keeps the initial report write, but refreshes only render status.
      const interval = parseIntegerOption(opts.interval, '--interval', 100);
      const abort = new AbortController();
      const onSigint = () => { abort.abort(); };
      process.on('SIGINT', onSigint);

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          await new Promise(resolve => setTimeout(resolve, interval));
          if (abort.signal.aborted) break;

          if (!isJson()) console.clear();

          const results = await collectStatus(client, config, {
            sessionIds: opts.ids,
            output: undefined,
            scanLimit: parseIntegerOption(opts.scan, '--scan', 1, 200),
          });

          const allTerminal = results.every(r =>
            r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled',
          );
          if (allTerminal) {
            if (!isJson()) console.log(chalk.green('\nAll sessions resolved.'));
            break;
          }

          if (!isJson()) console.log(chalk.dim(`\nRefreshing in ${interval / 1000}s... (Ctrl+C to exit)`));
        }
      } finally {
        process.removeListener('SIGINT', onSigint);
      }
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch status
  $ jules-dispatch status -i abc123 def456
  $ jules-dispatch status --watch --interval 3000
`);

// ---------- get ----------

program
  .command('get <sessionId>')
  .description('Get full details of a single session')
  .action(async (sessionId: string) => {
    const { client } = getConfig();
    try {
      const session = await client.getSession(sessionId);
      emit(
        () => {
          console.log(chalk.bold(session.title));
          console.log(`  ${chalk.dim('ID:')}     ${session.id}`);
          console.log(`  ${chalk.dim('State:')}  ${session.state ?? 'unknown'}`);
          console.log(`  ${chalk.dim('URL:')}    ${session.url}`);
          console.log(`  ${chalk.dim('Source:')} ${session.sourceContext?.source ?? '<unknown>'}`);
          const pr = session.outputs?.find(o => o.pullRequest);
          if (pr?.pullRequest) console.log(`  ${chalk.cyan('PR:')}     ${pr.pullRequest.url}`);
        },
        session,
      );
    } catch (err) {
      fail(err);
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch get abc123
  $ jules-dispatch get abc123 --json
`);

// ---------- wait ----------

program
  .command('wait [ids...]')
  .description('Poll until the specified sessions finish')
  .option('--interval <ms>', 'poll interval in ms', '30000')
  .option('--timeout <ms>', 'max wait time in ms', '600000')
  .option('--fail-fast', 'exit immediately on first failed session', false)
  .action(async (ids: string[], opts: { interval: string; timeout: string; failFast: boolean }) => {
    const { config, client } = getConfig();

    if (ids.length === 0) fail('No session IDs provided. Usage: wait <id1> [id2...]', ExitCode.VALIDATION, 'NO_IDS');

    const result = await waitForCompletion(client, config, ids, {
      interval: parseIntegerOption(opts.interval, '--interval', 1),
      timeout: parseIntegerOption(opts.timeout, '--timeout', 1),
      failFast: opts.failFast,
    });

    if (result.timedOut) process.exit(ExitCode.TIMEOUT);
    if (result.failed.length > 0) process.exit(ExitCode.GENERIC);
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch wait abc123
  $ jules-dispatch wait abc123 def456 --timeout 300000
  $ jules-dispatch wait abc123 --fail-fast
`);

// ---------- sources ----------

program
  .command('sources')
  .description('List all GitHub sources connected to Jules (auto-paginates)')
  .action(async () => {
    const { client } = getConfig();
    const sources: Awaited<ReturnType<typeof client.listSources>>['sources'] = [];
    for await (const s of client.iterateSources()) sources.push(s);

    emit(
      () => {
        console.log(`\n${chalk.bold(`${sources.length} source(s):`)}\n`);
        for (const s of sources) {
          const repo = s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id;
          console.log(`  ${chalk.cyan(repo)} ${chalk.dim(`(${s.name})`)}`);
        }
      },
      { sources },
    );
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch sources
  $ jules-dispatch sources --json
`);

// ---------- message ----------

program
  .command('message <sessionId> <text>')
  .description('Send a follow-up message to a running Jules session')
  .action(async (sessionId: string, text: string) => {
    const { client } = getConfig();
    try {
      await client.sendMessage(sessionId, text);
      emit(
        () => console.log(chalk.green('✓ Message sent.') + chalk.dim(' Use `status` to check the response.')),
        { ok: true, sessionId },
      );
    } catch (err) {
      fail(err);
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch message abc123 "Please focus on tests"
  $ jules-dispatch message abc123 "Add error handling" --json
`);

// ---------- plan ----------

program
  .command('plan <sessionId>')
  .description('Show the latest generated plan for a session')
  .action(async (sessionId: string) => {
    const { client } = getConfig();
    try {
      const plan = await client.getLatestPlan(sessionId);
      if (!plan) {
        emit(
          () => console.log(chalk.yellow('No plan generated yet for this session.')),
          { plan: null },
        );
        return;
      }
      emit(
        () => {
          console.log(chalk.bold(`\nPlan ${plan.id}\n`));
          for (const [i, step] of plan.steps.entries()) {
            console.log(`  ${chalk.cyan(`${i + 1}.`)} ${step.title}`);
            if (step.description) console.log(`     ${chalk.dim(step.description)}`);
          }
          console.log(chalk.dim(`\nApprove with: jules-dispatch approve ${sessionId}`));
        },
        { plan },
      );
    } catch (err) {
      fail(err);
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch plan abc123
  $ jules-dispatch plan abc123 --json
`);

// ---------- approve ----------

program
  .command('approve <sessionId>')
  .description('Approve the plan for a session waiting on plan approval')
  .action(async (sessionId: string) => {
    const { client } = getConfig();
    try {
      await client.approvePlan(sessionId);
      emit(
        () => console.log(chalk.green('✓ Plan approved.')),
        { ok: true, sessionId },
      );
    } catch (err) {
      fail(err);
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch approve abc123
  $ jules-dispatch approve abc123 --json
`);

// ---------- cancel ----------

program
  .command('cancel <sessionId>')
  .description('Cancel a running Jules session')
  .action(async (sessionId: string) => {
    const { client } = getConfig();
    try {
      await client.cancelSession(sessionId);
      emit(
        () => console.log(chalk.green('✓ Session cancelled.')),
        { ok: true, sessionId },
      );
    } catch (err) {
      fail(err);
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch cancel abc123
  $ jules-dispatch cancel abc123 --json
`);

// ---------- doctor ----------

program
  .command('doctor')
  .description('Validate environment: Node.js, npm, JULES_API_KEY, API connectivity, task file')
  .option('--task-file <path>', 'validate a task file (YAML or JSON)')
  .action(async (opts: { taskFile?: string }) => {
    const { runDoctor } = await import('./doctor.js');
    const optsGlobal = program.opts() as { project: string; apiKey?: string };
    const projectDir = resolve(optsGlobal.project);

    const result = await runDoctor(projectDir, {
      apiKeyOverride: optsGlobal.apiKey,
      taskFile: opts.taskFile,
    });

    emit(
      () => {
        console.log(chalk.bold('\nDoctor Check\n'));
        for (const check of result.checks) {
          const icon = check.status === 'pass' ? chalk.green('✓')
            : check.status === 'warn' ? chalk.yellow('⚠')
            : chalk.red('✗');
          console.log(`  ${icon} ${check.name}: ${check.message}`);
        }
        console.log('');
      },
      { checks: result.checks },
    );

    if (result.exitCode !== 0) process.exit(result.exitCode);
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch doctor
  $ jules-dispatch doctor --task-file task.yaml
  $ jules-dispatch doctor -v
`);

// ---------- init ----------

program
  .command('init')
  .description('Set up API key and defaults for first-run (interactive wizard)')
  .option('-s, --source <source>', 'default source (non-interactive mode)')
  .option('-b, --branch <branch>', 'default branch (default: main)')
  .addHelpText('after', `
Examples:
  $ jules-dispatch init
  $ jules-dispatch init --api-key sk-xxx --source sources/github/owner/repo
  $ jules-dispatch init --api-key sk-xxx --source sources/github/owner/repo --branch main
`)
  .action(async (opts: { source?: string; branch?: string }) => {
    const optsGlobal = program.opts() as { project: string; apiKey?: string };
    const apiKey = optsGlobal.apiKey;
    const projectDir = resolve(optsGlobal.project);
    const interactive = !apiKey && process.stdin.isTTY;

    if (!interactive && !apiKey) {
      emitError('Non-interactive mode requires --api-key. Use --api-key and optionally --source.', 'NON_INTERACTIVE');
      process.exit(ExitCode.VALIDATION);
    }

    const { runInit } = await import('./init.js');
    try {
      const result = await runInit({
        apiKey,
        source: opts.source,
        branch: opts.branch,
        interactive: !!interactive,
        projectDir,
      });

      emit(
        () => {
          if (result.backed) {
            console.log(chalk.yellow('Backed up existing .env to .env.backup'));
          }
          console.log(chalk.green(`✓ Configuration written to ${result.envPath}`));
          console.log(chalk.dim(`  API key: ${'*'.repeat(8)}${result.values.apiKey.slice(-4)}`));
          console.log(chalk.dim(`  Source:  ${result.values.source || '(none)'}`));
          console.log(chalk.dim(`  Branch:  ${result.values.branch}`));
          console.log(chalk.dim('\nNext: jules-dispatch dispatch task.yaml'));
        },
        result,
      );
    } catch (err) {
      fail(err);
    }
  });

// ---------- tail ----------

program
  .command('tail <sessionId>')
  .description('Tail activity log for a session in real time (until completion or Ctrl+C)')
  .option('--interval <ms>', 'poll interval', '5000')
  .action(async (sessionId: string, opts: { interval: string }) => {
    const { client } = getConfig();
    const interval = parseIntegerOption(opts.interval, '--interval', 1);
    const seen = new Set<string>();

    info(chalk.dim(`Tailing ${sessionId} (Ctrl+C to stop)...\n`));

    while (true) {
      try {
        const session = await client.getSession(sessionId);
        const { activities } = await client.listActivities(sessionId, 30);

        const newActs = activities.slice().reverse().filter(a => !seen.has(a.id));
        for (const a of newActs) {
          seen.add(a.id);
          if (isJson()) {
            process.stdout.write(JSON.stringify({ event: 'activity', activity: a }) + '\n');
          } else {
            const ts = a.createTime?.slice(11, 19) ?? '';
            const who = a.originator === 'agent' ? chalk.cyan('agent') : chalk.magenta('user ');
            let line = `${chalk.dim(ts)} ${who}`;
            if (a.planGenerated) line += ` ${chalk.bold('plan generated')} (${a.planGenerated.plan.steps.length} steps)`;
            else if (a.progressUpdated) line += ` ${a.progressUpdated.title}`;
            else if (a.sessionCompleted) line += ` ${chalk.green('session completed')}`;
            else if (a.sessionFailed) line += ` ${chalk.red('session failed:')} ${a.sessionFailed.message ?? ''}`;
            else if (a.message?.text) line += ` ${chalk.dim(a.message.text.slice(0, 200))}`;
            console.log(line);
          }
        }

        const state = (session.state ?? '').toUpperCase();
        if (['COMPLETED', 'FAILED', 'CANCELLED', 'CANCELED'].includes(state)) {
          info(chalk.bold(`\nSession ended: ${state}`));
          process.exit(state === 'COMPLETED' ? ExitCode.OK : ExitCode.GENERIC);
        }
      } catch (err) {
        if (!isJson()) {
          const t = translateError(err);
          console.error(chalk.red(`Tail error: ${t.problem}`));
          console.error(chalk.dim(`  ${t.fix}`));
        }
      }
      await new Promise(r => setTimeout(r, interval));
    }
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch tail abc123
  $ jules-dispatch tail abc123 --interval 2000
`);

// ---------- plan-tasks (optional LLM planner) ----------

program
  .command('plan-tasks <description>')
  .alias('plan-batch')
  .description('[OPTIONAL] Use any OpenAI-compatible LLM to expand a high-level intent into N independent Jules tasks (does NOT dispatch). Use "-" to read description from stdin.')
  .option('-n, --max <n>', 'maximum number of tasks to plan', '8')
  .option('-s, --source <source>', 'override Jules source for generated tasks')
  .option('-b, --branch <branch>', 'override branch for generated tasks')
  .option('--context <text>', 'extra repo context to ground the planner (file tree, conventions, etc.)')
  .option('--context-file <path>', 'read extra context from a file')
  .option('-o, --output <file>', 'write generated tasks to a YAML file (multi-doc)')
  .action(async (description: string, opts: { max: string; source?: string; branch?: string; context?: string; contextFile?: string; output?: string }) => {
    const { planTasks, loadPlannerConfig } = await import('./planner.js');
    const { stringify } = await import('yaml');
    const { writeFileSync } = await import('node:fs');
    const programOpts = program.opts() as { project: string; llmKey?: string; llmBaseUrl?: string; llmModel?: string };
    const projectDir = resolve(programOpts.project);

    // Side-effect: load .env so LLM_* vars are populated when not set in shell.
    try { loadConfig(projectDir, { noExit: true }); } catch { /* JULES_API_KEY missing is ok for planning-only */ }

    const desc = description === '-' ? readFileSync(0, 'utf8').trim() : description;
    if (!desc) fail('Empty description', ExitCode.VALIDATION, 'EMPTY_DESC');

    let context = opts.context;
    if (opts.contextFile) context = readFileSync(resolve(opts.contextFile), 'utf8');

    let plannerCfg;
    try {
      plannerCfg = loadPlannerConfig({
        apiKeyOverride: programOpts.llmKey,
        baseUrlOverride: programOpts.llmBaseUrl,
        modelOverride: programOpts.llmModel,
      });
    } catch (err) {
      fail(err, ExitCode.AUTH);
    }

    info(chalk.dim(`Planning with ${plannerCfg.model}...\n`));

    let result;
    try {
      result = await planTasks(plannerCfg, {
        description: desc,
        source: opts.source,
        branch: opts.branch,
        maxTasks: parseIntegerOption(opts.max, '--max', 1, 50),
        context,
      });
    } catch (err) {
      fail(err);
    }

    if (opts.output) {
      const yamlOut = result.tasks.map(t => stringify(t)).join('---\n');
      writeFileSync(resolve(opts.output), yamlOut);
      info(chalk.green(`✓ Wrote ${result.tasks.length} task(s) to ${opts.output}\n`));
    }

    emit(
      () => {
        console.log(chalk.bold(`\n${result.tasks.length} task(s) planned by ${result.model}:\n`));
        if (result.rationale) console.log(chalk.dim(`Rationale: ${result.rationale}\n`));
        for (const [i, t] of result.tasks.entries()) {
          console.log(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.bold(t.title)}`);
          const preview = t.prompt.split('\n')[0].slice(0, 100);
          console.log(`     ${chalk.dim(preview)}${t.prompt.length > 100 ? '…' : ''}`);
        }
        if (result.usage?.totalTokens) {
          console.log(chalk.dim(`\nTokens: ${result.usage.totalTokens} (in: ${result.usage.promptTokens}, out: ${result.usage.completionTokens})`));
        }
        if (!opts.output) {
          console.log(chalk.dim('\nNext: pipe into dispatch, save with --output, or use `auto` to plan + dispatch in one shot.'));
        }
      },
      result,
    );
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch plan-tasks "Fix all lint errors"
  $ echo "Refactor auth" | jules-dispatch plan-tasks - --max 5
  $ jules-dispatch plan-tasks "Add tests" --output tasks.yaml
`);

// ---------- auto (plan + dispatch) ----------

program
  .command('auto <description>')
  .description('[OPTIONAL] Plan tasks with any OpenAI-compatible LLM AND dispatch them to Jules in one shot. Use "-" for stdin.')
  .option('-n, --max <n>', 'maximum number of tasks', '8')
  .option('-s, --source <source>', 'override Jules source')
  .option('-b, --branch <branch>', 'override branch')
  .option('--context <text>', 'extra repo context')
  .option('--context-file <path>', 'read extra context from a file')
  .option('--parallel <n>', 'max parallel dispatches', '10')
  .option('--dry-run', 'print planned tasks but do not dispatch', false)
  .option('-y, --yes', 'skip confirmation prompt before dispatching', false)
  .action(async (description: string, opts: { max: string; source?: string; branch?: string; context?: string; contextFile?: string; parallel: string; dryRun: boolean; yes: boolean }) => {
    const { planTasks, loadPlannerConfig } = await import('./planner.js');
    const { config, client } = getConfig();
    const programOpts = program.opts() as { llmKey?: string; llmBaseUrl?: string; llmModel?: string };

    const desc = description === '-' ? readFileSync(0, 'utf8').trim() : description;
    if (!desc) fail('Empty description', ExitCode.VALIDATION, 'EMPTY_DESC');

    let context = opts.context;
    if (opts.contextFile) context = readFileSync(resolve(opts.contextFile), 'utf8');

    let plannerCfg;
    try {
      plannerCfg = loadPlannerConfig({
        apiKeyOverride: programOpts.llmKey,
        baseUrlOverride: programOpts.llmBaseUrl,
        modelOverride: programOpts.llmModel,
      });
    } catch (err) {
      fail(err, ExitCode.AUTH);
    }

    info(chalk.dim(`Planning with ${plannerCfg.model}...\n`));

    let plan;
    try {
      plan = await planTasks(plannerCfg, {
        description: desc,
        source: opts.source ?? config.defaultSource,
        branch: opts.branch ?? config.defaultBranch,
        maxTasks: parseIntegerOption(opts.max, '--max', 1, 50),
        context,
      });
    } catch (err) {
      fail(err);
    }

    info(chalk.bold(`\nPlanned ${plan.tasks.length} task(s):\n`));
    for (const [i, t] of plan.tasks.entries()) {
      info(`  ${chalk.cyan(`${i + 1}.`)} ${chalk.bold(t.title)}`);
    }

    if (opts.dryRun) {
      emit(() => info(chalk.yellow('\n--dry-run: not dispatching.')), { ...plan, dispatched: false });
      return;
    }

    if (!opts.yes && !isJson() && process.stdin.isTTY) {
      info(chalk.yellow(`\nDispatch all ${plan.tasks.length} task(s)? [y/N] `));
      const answer = await new Promise<string>(r => {
        process.stdin.once('data', d => r(d.toString().trim().toLowerCase()));
      });
      if (answer !== 'y' && answer !== 'yes') {
        info(chalk.dim('Aborted.'));
        process.exit(ExitCode.OK);
      }
    }

    info(chalk.dim('\nDispatching...\n'));
    const parallel = parseIntegerOption(opts.parallel, '--parallel', 1, 50);
    const results = [];
    for (let i = 0; i < plan.tasks.length; i += parallel) {
      const slice = plan.tasks.slice(i, i + parallel);
      const r = await Promise.all(
        slice.map(t => dispatchTaskDefinition(client, config, t, '<auto>')),
      );
      results.push(...r);
    }

    const dispatched = results.filter(r => r.status === 'dispatched');
    const failed = results.filter(r => r.status === 'failed');

    emit(
      () => {
        console.log(chalk.bold(`\n${dispatched.length}/${results.length} dispatched`));
        for (const r of dispatched) {
          console.log(`  ${chalk.green('✓')} ${r.title}  ${chalk.dim(r.sessionUrl)}`);
        }
        for (const r of failed) {
          console.log(`  ${chalk.red('✗')} ${r.title}  ${chalk.red(r.error ?? '')}`);
        }
      },
      { plan, results, summary: { total: results.length, dispatched: dispatched.length, failed: failed.length } },
    );

    if (failed.length > 0 && dispatched.length > 0) process.exit(ExitCode.PARTIAL);
    if (failed.length > 0) process.exit(ExitCode.GENERIC);
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch auto "Fix all lint errors"
  $ jules-dispatch auto "Refactor auth" --dry-run
  $ jules-dispatch auto "Add tests" --yes --parallel 5
`);

// ---------- mcp server ----------

program
  .command('mcp')
  .description('Run as an MCP (Model Context Protocol) server over stdio for Claude Code / Codex')
  .action(async () => {
    // Lazy-import: the SDK is only loaded when actually running the MCP server,
    // keeping CLI startup snappy.
    const { runMcpServer } = await import('./mcp.js');
    const opts = program.opts() as {
      project: string;
      apiKey?: string;
      llmKey?: string;
      llmBaseUrl?: string;
      llmModel?: string;
    };
    await runMcpServer({
      projectDir: resolve(opts.project),
      apiKeyOverride: opts.apiKey,
      llmApiKeyOverride: opts.llmKey,
      llmBaseUrlOverride: opts.llmBaseUrl,
      llmModelOverride: opts.llmModel,
    });
  })
  .addHelpText('after', `
Examples:
  $ jules-dispatch mcp
  $ jules-dispatch mcp --project ./my-repo
`);

program.addHelpText('after', `
Getting started:
  $ jules-dispatch dispatch task.yaml     # dispatch your first task
  $ jules-dispatch status                 # check progress
  $ jules-dispatch doctor                 # validate your setup

Docs: https://github.com/nicholasgasior/jules-dispatch
`);

// ---------- error wrapping ----------

process.on('unhandledRejection', (err) => {
  const t = translateError(err);
  emitError(t.problem, t.code, `Cause: ${t.cause}\nFix: ${t.fix}`, t.context);
  process.exit(ExitCode.GENERIC);
});

program.parseAsync(process.argv).catch((err) => {
  const t = translateError(err);
  emitError(t.problem, t.code, `Cause: ${t.cause}\nFix: ${t.fix}`, t.context);
  process.exit(ExitCode.GENERIC);
});
