#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
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

// Dispatch a single task file
program
  .command('dispatch <taskFile>')
  .description('Dispatch a single task file to Jules')
  .option('-s, --source <source>', 'override source (e.g. sources/github/owner/repo)')
  .option('-b, --branch <branch>', 'override branch')
  .action(async (opts, cmd) => {
    const projectDir = cmd.parent?.opts().project || '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);
    const taskFile = resolve(opts.taskFile);

    console.log(`Dispatching: ${taskFile}\n`);
    const result = await dispatchTask(client, config, taskFile, { source: opts.source, branch: opts.branch });

    if (result.status === 'dispatched') {
      console.log(`✓ ${result.title}`);
      console.log(`  Session: ${result.sessionUrl}`);
    } else {
      console.error(`✗ ${result.title}: ${result.error}`);
      process.exit(1);
    }
  });

// Batch dispatch all tasks in a directory
program
  .command('batch [taskDir]')
  .description('Dispatch all .yaml/.json task files in a directory')
  .option('-s, --source <source>', 'override source')
  .option('-b, --branch <branch>', 'override branch')
  .option('-n, --parallel <n>', 'max parallel dispatches', '10')
  .action(async (taskDir, opts, cmd) => {
    const projectDir = cmd.parent?.opts().project || '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);
    const dir = resolve(taskDir || resolve(projectDir, 'tasks'));

    const results = await dispatchBatch(client, config, dir, {
      source: opts.source,
      branch: opts.branch,
      parallel: parseInt(opts.parallel),
    });

    const dispatched = results.filter(r => r.status === 'dispatched');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(` Dispatched: ${dispatched.length}, Failed: ${failed.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });

// Check status of running sessions
program
  .command('status')
  .description('Check status of recent Jules sessions')
  .option('-i, --ids <ids...>', 'specific session IDs to check')
  .option('-o, --output <file>', 'output JSON report to file')
  .action(async (opts, cmd) => {
    const projectDir = cmd.parent?.opts().project || '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    await collectStatus(client, config, {
      sessionIds: opts.ids,
      output: opts.output,
    });
  });

// Wait for sessions to complete
program
  .command('wait [ids...]')
  .description('Wait for sessions to complete')
  .option('--interval <ms>', 'poll interval in ms', '30000')
  .option('--timeout <ms>', 'max wait time in ms', '600000')
  .action(async (ids, opts, cmd) => {
    const projectDir = cmd.parent?.opts().project || '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    await waitForCompletion(client, config, ids, {
      interval: parseInt(opts.interval),
      timeout: parseInt(opts.timeout),
    });
  });

// List available sources
program
  .command('sources')
  .description('List available GitHub sources')
  .action(async (_, cmd) => {
    const projectDir = cmd.parent?.opts().project || '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    const { sources } = await client.listSources();
    console.log(`\n${sources.length} sources:\n`);
    for (const s of sources) {
      const repo = s.githubRepo ? `${s.githubRepo.owner}/${s.githubRepo.repo}` : s.id;
      console.log(`  ${repo}`);
    }
  });

// Send a message to a running session
program
  .command('message <sessionId> <text>')
  .description('Send a follow-up message to a session')
  .action(async (sessionId, text, _, cmd) => {
    const projectDir = cmd.parent?.opts().project || '.';
    const config = loadConfig(resolve(projectDir));
    const client = new JulesClient(config);

    await client.sendMessage(sessionId, text);
    console.log('Message sent. Use `status` to see the response.');
  });

program.parse();
