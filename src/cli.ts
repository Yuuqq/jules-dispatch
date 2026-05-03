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

const program = new Command();

program
  .name('jules-dispatch')
  .description('Batch-dispatch tasks to Google Jules + MCP server for Claude Code / Codex')
  .version('1.1.0')
  .option('-p, --project <dir>', 'project directory with .env', '.')
  .option('--api-key <key>', 'Jules API key (overrides JULES_API_KEY env var)')
  .option('--json', 'machine-readable JSON output (one JSON object per command, NDJSON for streams)', false)
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean };
    if (opts.json) setOutputMode('json');
  });

function getConfig(): { config: ReturnType<typeof loadConfig>; client: JulesClient } {
  const opts = program.opts() as { project: string; apiKey?: string };
  const config = loadConfig(resolve(opts.project), { apiKeyOverride: opts.apiKey });
  return { config, client: new JulesClient(config) };
}

function fail(message: string, code: number = ExitCode.GENERIC, errCode?: string): never {
  emitError(message, errCode);
  process.exit(code);
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
  });

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
      parallel: parseInt(opts.parallel, 10),
      logDir: opts.log === false ? false : undefined,
    });

    const failed = results.filter(r => r.status === 'failed').length;
    if (failed > 0 && results.length > failed) process.exit(ExitCode.PARTIAL);
    if (failed > 0) process.exit(ExitCode.GENERIC);
  });

// ---------- status ----------

program
  .command('status')
  .description('Check status of recent Jules sessions')
  .option('-i, --ids <ids...>', 'specific session IDs to check')
  .option('-o, --output <file>', 'save JSON report to file')
  .option('--scan <n>', 'how many recent sessions to scan when no --ids given', '100')
  .action(async (opts: { ids?: string[]; output?: string; scan: string }) => {
    const { config, client } = getConfig();
    await collectStatus(client, config, {
      sessionIds: opts.ids,
      output: opts.output,
      scanLimit: parseInt(opts.scan, 10),
    });
  });

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
      fail((err as Error).message, ExitCode.GENERIC);
    }
  });

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
      interval: parseInt(opts.interval, 10),
      timeout: parseInt(opts.timeout, 10),
      failFast: opts.failFast,
    });

    if (result.timedOut) process.exit(ExitCode.TIMEOUT);
    if (result.failed.length > 0) process.exit(ExitCode.GENERIC);
  });

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
  });

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
      fail((err as Error).message, ExitCode.GENERIC);
    }
  });

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
      fail((err as Error).message, ExitCode.GENERIC);
    }
  });

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
      fail((err as Error).message, ExitCode.GENERIC);
    }
  });

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
      fail((err as Error).message, ExitCode.GENERIC);
    }
  });

// ---------- tail ----------

program
  .command('tail <sessionId>')
  .description('Tail activity log for a session in real time (until completion or Ctrl+C)')
  .option('--interval <ms>', 'poll interval', '5000')
  .action(async (sessionId: string, opts: { interval: string }) => {
    const { client } = getConfig();
    const interval = parseInt(opts.interval, 10);
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
        if (!isJson()) console.error(chalk.red(`Tail error: ${(err as Error).message}`));
      }
      await new Promise(r => setTimeout(r, interval));
    }
  });

// ---------- mcp server ----------

program
  .command('mcp')
  .description('Run as an MCP (Model Context Protocol) server over stdio for Claude Code / Codex')
  .action(async () => {
    // Lazy-import: the SDK is only loaded when actually running the MCP server,
    // keeping CLI startup snappy.
    const { runMcpServer } = await import('./mcp.js');
    const opts = program.opts() as { project: string; apiKey?: string };
    await runMcpServer({ projectDir: resolve(opts.project), apiKeyOverride: opts.apiKey });
  });

// ---------- error wrapping ----------

process.on('unhandledRejection', (err) => {
  emitError((err as Error)?.message ?? String(err), 'UNHANDLED');
  process.exit(ExitCode.GENERIC);
});

program.parseAsync(process.argv).catch((err) => {
  emitError((err as Error).message, 'CLI_ERROR');
  process.exit(ExitCode.GENERIC);
});
