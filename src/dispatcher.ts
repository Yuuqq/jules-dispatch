import { resolve } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import chalk from 'chalk';
import type { JulesConfig, DispatchResult, TaskDefinition } from './types.js';
import { JulesClient } from './client.js';
import { loadTask, loadTasksFromDir } from './config.js';

export async function dispatchTask(
  client: JulesClient,
  config: JulesConfig,
  taskFile: string,
  options?: { source?: string; branch?: string },
): Promise<DispatchResult> {
  const absPath = resolve(taskFile);
  const task = loadTask(absPath);
  return dispatchTaskDefinition(client, config, task, absPath, options);
}

export async function dispatchTaskDefinition(
  client: JulesClient,
  config: JulesConfig,
  task: TaskDefinition,
  taskFile: string,
  options?: { source?: string; branch?: string },
): Promise<DispatchResult> {
  const source = options?.source ?? task.source ?? config.defaultSource;
  const branch = options?.branch ?? task.branch ?? config.defaultBranch;
  const autoMode = task.autoMode ?? config.autoMode;

  if (!source) {
    return {
      taskFile,
      taskTitle: task.title,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'failed',
      error: 'No source configured. Set JULES_DEFAULT_SOURCE in .env or add "source" to the task file.',
    };
  }

  try {
    const session = await client.createSession({
      prompt: task.prompt,
      source,
      branch,
      title: task.title,
      autoMode,
      requirePlanApproval: task.requirePlanApproval,
    });

    return {
      taskFile,
      taskTitle: task.title,
      sessionId: session.id,
      sessionUrl: session.url,
      title: task.title,
      status: 'dispatched',
    };
  } catch (err) {
    return {
      taskFile,
      taskTitle: task.title,
      sessionId: '',
      sessionUrl: '',
      title: task.title,
      status: 'failed',
      error: (err as Error).message,
    };
  }
}

export async function dispatchBatch(
  client: JulesClient,
  config: JulesConfig,
  taskDir: string,
  options?: { source?: string; branch?: string; parallel?: number },
): Promise<DispatchResult[]> {
  const taskFiles = loadTasksFromDir(taskDir);

  if (taskFiles.length === 0) {
    console.log(chalk.yellow('No task files found in'), taskDir);
    return [];
  }

  const allTasks: Array<{ file: string; task: TaskDefinition }> = [];
  for (const { file, tasks } of taskFiles) {
    for (const task of tasks) {
      allTasks.push({ file: resolve(taskDir, file), task });
    }
  }

  console.log(chalk.bold(`Dispatching ${allTasks.length} task(s) from ${taskFiles.length} file(s)...\n`));

  const parallel = options?.parallel ?? 10;
  const results: DispatchResult[] = [];

  for (let i = 0; i < allTasks.length; i += parallel) {
    const batch = allTasks.slice(i, i + parallel);
    const batchResults = await Promise.all(
      batch.map(({ file, task }) =>
        dispatchTaskDefinition(client, config, task, file, options),
      ),
    );
    results.push(...batchResults);

    for (const r of batchResults) {
      if (r.status === 'dispatched') {
        console.log(`  ${chalk.green('✓')} ${chalk.bold(r.title)}`);
        if (r.sessionUrl) console.log(`    ${chalk.dim(r.sessionUrl)}`);
      } else {
        console.log(`  ${chalk.red('✗')} ${chalk.bold(r.title)}`);
        if (r.error) console.log(`    ${chalk.red('Error:')} ${r.error}`);
      }
    }
  }

  const logDir = resolve(taskDir, '..', '.dispatch-logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = resolve(logDir, `dispatch-${timestamp}.json`);
  writeFileSync(logFile, JSON.stringify(results, null, 2));

  console.log(`\n${chalk.dim('━'.repeat(36))}`);
  const dispatched = results.filter(r => r.status === 'dispatched');
  const failed = results.filter(r => r.status === 'failed');
  console.log(` ${chalk.green.bold(`Dispatched: ${dispatched.length}`)}, ${failed.length > 0 ? chalk.red.bold(`Failed: ${failed.length}`) : `Failed: 0`}`);
  console.log(`${chalk.dim('━'.repeat(36))}`);
  console.log(chalk.dim(`\nDispatch log: ${logFile}`));

  return results;
}
