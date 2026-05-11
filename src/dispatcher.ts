import { resolve } from 'node:path';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import chalk from 'chalk';
import type { JulesConfig, DispatchResult, TaskDefinition } from './types.js';
import { JulesClient } from './client.js';
import { loadTask, loadTasksFromDir } from './config.js';
import { isJson, emit, info } from './output.js';

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

export interface DispatchBatchOptions {
  source?: string;
  branch?: string;
  parallel?: number;
  /** Where to write the dispatch log JSON. Default: `<projectDir>/.dispatch-logs`. Pass `false` to disable. */
  logDir?: string | false;
}

export async function dispatchBatch(
  client: JulesClient,
  config: JulesConfig,
  taskDir: string,
  options: DispatchBatchOptions = {},
): Promise<DispatchResult[]> {
  const taskFiles = loadTasksFromDir(taskDir);

  if (taskFiles.length === 0) {
    info(chalk.yellow('No task files found in ') + taskDir);
    return [];
  }

  const allTasks: Array<{ file: string; task: TaskDefinition }> = [];
  for (const { file, tasks } of taskFiles) {
    for (const task of tasks) {
      allTasks.push({ file: resolve(taskDir, file), task });
    }
  }

  info(chalk.bold(`Dispatching ${allTasks.length} task(s) from ${taskFiles.length} file(s)...\n`));

  const parallel = options.parallel ?? 10;
  const results: DispatchResult[] = [];

  for (let i = 0; i < allTasks.length; i += parallel) {
    const batch = allTasks.slice(i, i + parallel);

    if (!isJson()) {
      for (let j = 0; j < batch.length; j++) {
        const idx = i + j + 1;
        process.stdout.write(`[${idx}/${allTasks.length}] ${batch[j].task.title}... `);
      }
    }

    const batchResults = await Promise.all(
      batch.map(({ file, task }) =>
        dispatchTaskDefinition(client, config, task, file, options),
      ),
    );
    results.push(...batchResults);

    if (!isJson()) {
      for (const r of batchResults) {
        if (r.status === 'dispatched') {
          console.log(chalk.green('dispatched'));
        } else {
          console.log(chalk.red(`failed (${r.error ?? 'unknown'})`));
        }
      }

      const done = results.filter(r => r.status === 'dispatched').length;
      const failed = results.filter(r => r.status === 'failed').length;
      const pending = allTasks.length - results.length;
      const parts = [chalk.green(`DONE ${done}`)];
      if (failed > 0) parts.push(chalk.red(`FAILED ${failed}`));
      if (pending > 0) parts.push(chalk.dim(`PENDING ${pending}`));
      console.log(`  ${parts.join(' | ')}`);
    }
  }

  // Write dispatch log under the project dir, not next to taskDir.
  let logFile: string | null = null;
  if (options.logDir !== false) {
    const projectRoot = config.projectDir ?? process.cwd();
    const logDir = options.logDir ?? resolve(projectRoot, '.dispatch-logs');
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logFile = resolve(logDir, `dispatch-${timestamp}.json`);
    writeFileSync(logFile, JSON.stringify(results, null, 2));
  }

  const dispatched = results.filter(r => r.status === 'dispatched');
  const failed = results.filter(r => r.status === 'failed');

  emit(
    () => {
      console.log(`\n${chalk.dim('━'.repeat(36))}`);
      console.log(
        ` ${chalk.green.bold(`Dispatched: ${dispatched.length}`)}, ${
          failed.length > 0 ? chalk.red.bold(`Failed: ${failed.length}`) : `Failed: 0`
        }`,
      );
      console.log(`${chalk.dim('━'.repeat(36))}`);
      if (logFile) console.log(chalk.dim(`\nDispatch log: ${logFile}`));
    },
    {
      summary: { total: results.length, dispatched: dispatched.length, failed: failed.length },
      results,
      logFile,
    },
  );

  return results;
}
