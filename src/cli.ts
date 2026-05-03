#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import { JulesClient } from './client.js';
import { dispatchTask, dispatchBatch } from './dispatcher.js';
import { collectStatus, waitForCompletion } from './collector.js';

const program = new Command();

program
  .name('jules-dispatch')
  .description('Batch dispatch tasks to Google Jules API')
  .version('1.0.0')
  .option('-p, --project <dir>', 'project directory with .env', '.');

program
  .command('dispatch <taskFile>')
  .description('Dispatch a single task file to Jules')
  .option('-s, --source <source>', 'override source (e.g. sources/github/owner/repo)')
  .option('-b, --branch <branch>', 'override branch')
  .action(async (taskFile: string, opts: { source?: string; branch?: string }, cmd: Command) => {
    const projectDir = cmd.parent?.opts().project ?? '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    console.log(chalk.dim(`Dispatching: ${taskFile}\n`));
    const result = await dispatchTask(client, config, resolve(taskFile), {
      source: opts.source,
      branch: opts.branch,
    });

    if (result.status === 'dispatched') {
      console.log(`${chalk.green('✓')} ${chalk.bold(result.title)}`);
      console.log(`  ${chalk.dim('Session:')} ${result.sessionUrl}`);
    } else {
      console.error(`${chalk.red('✗')} ${chalk.bold(result.title)}: ${result.error}`);
      process.exit(1);
    }
  });

program
  .command('batch [taskDir]')
  .description('Dispatch all .yaml/.json task files in a directory (supports multi-document YAML)')
  .option('-s, --source <source>', 'override source for all tasks')
  .option('-b, --branch <branch>', 'override branch for all tasks')
  .option('-n, --parallel <n>', 'max parallel dispatches', '10')
  .action(async (taskDir: string | undefined, opts: { source?: string; branch?: string; parallel: string }, cmd: Command) => {
    const projectDir = cmd.parent?.opts().project ?? '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);
    const dir = resolve(taskDir ?? resolve(projectDir, 'tasks'));

    await dispatchBatch(client, config, dir, {
      source: opts.source,
      branch: opts.branch,
      parallel: parseInt(opts.parallel, 10),
    });
  });

program
  .command('status')
  .description('Check status of recent Jules sessions')
  .option('-i, --ids <ids...>', 'specific session IDs to check')
  .option('-o, --output <file>', 'save JSON report to file')
  .action(async (opts: { ids?: string[]; output?: string }, cmd: Command) => {
    const projectDir = cmd.parent?.opts().project ?? '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    await collectStatus(client, config, {
      sessionIds: opts.ids,
      output: opts.output,
    });
  });

program
  .command('wait [ids...]')
  .description('Poll until the specified sessions finish')
  .option('--interval <ms>', 'poll interval in ms', '30000')
  .option('--timeout <ms>', 'max wait time in ms', '600000')
  .action(async (ids: string[], opts: { interval: string; timeout: string }, cmd: Command) => {
    const projectDir = cmd.parent?.opts().project ?? '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    if (ids.length === 0) {
      console.error(chalk.red('No session IDs provided. Usage: wait <id1> [id2...]'));
      process.exit(1);
    }

    await waitForCompletion(client, config, ids, {
      interval: parseInt(opts.interval, 10),
      timeout: parseInt(opts.timeout, 10),
    });
  });

program
  .command('sources')
  .description('List available GitHub sources connected to Jules')
  .action(async (_opts: unknown, cmd: Command) => {
    const projectDir = cmd.parent?.opts().project ?? '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    const { sources } = await client.listSources();
    console.log(`\n${chalk.bold(`${sources.length} source(s):`)}\n`);
    for (const s of sources) {
      const repo = s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id;
      console.log(`  ${chalk.cyan(repo)}`);
    }
  });

program
  .command('message <sessionId> <text>')
  .description('Send a follow-up message to a running Jules session')
  .action(async (sessionId: string, text: string, _opts: unknown, cmd: Command) => {
    const projectDir = cmd.parent?.opts().project ?? '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    await client.sendMessage(sessionId, text);
    console.log(chalk.green('✓ Message sent.') + chalk.dim(' Use `status` to check the response.'));
  });

program.parse();
